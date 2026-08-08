import crypto from 'node:crypto'

import TypingLine from '../../src/typing/typingline.js'
import Romanizer from '../../src/typing/romanizer.js'
import latinTable from '../../latin-table/latin-table.js'
import { buildSongLyrics } from '../../src/util/song-meta.js'
import {
  filterLyricLines,
  inlineLyricRubyReading,
  isNonVocalTrackMetadata,
  LYRIC_QUALITY_VERSION,
  normalizeLyricComparable,
  stripInlineLyricRuby,
} from './lyrics-quality.js'
import {
  assertOriginalLyricLayer,
  lyricLanguage,
  normalizePronunciation,
  PRONUNCIATION_QUALITY_VERSION,
  pronunciationForLine,
} from './pronunciation.js'

const romanizer = new Romanizer(latinTable)
const LRC_TIMESTAMP = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g
const ENHANCED_TIMESTAMP = /<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g
const MIN_VOCAL_KEY_COUNT = 18
const MIN_DISTINCT_VOCAL_LINES = 4
const MIN_WINDOW_CAP_MS = 3500
const MIN_OUTLIER_WINDOW_MS = 6500
const WINDOW_OUTLIER_MARGIN_MS = 650

function timestampMilliseconds (minutes, seconds, fraction = '') {
  const fractionMs = fraction
    ? Number(`0.${fraction}`) * 1000
    : 0
  return Math.round(Number(minutes) * 60_000 + Number(seconds) * 1000 + fractionMs)
}

export function parseLrc (input, { durationMs = 0 } = {}) {
  const source = String(input || '').replace(/^\uFEFF/u, '')
  const offsetMatch = source.match(/^\s*\[offset:([+-]?\d+)\]\s*$/imu)
  const offset = Number(offsetMatch?.[1]) || 0
  const lines = []

  for (const rawLine of source.split(/\r?\n/u)) {
    const timestamps = [...rawLine.matchAll(LRC_TIMESTAMP)]
    if (!timestamps.length) continue
    const text = rawLine
      .replace(LRC_TIMESTAMP, '')
      .replace(ENHANCED_TIMESTAMP, '')
      .normalize('NFKC')
      .trim()
    if (!text) continue
    for (const match of timestamps) {
      const start = Math.max(0, timestampMilliseconds(
        match[1],
        match[2],
        match[3],
      ) + offset)
      lines.push({ start, text, tokens: [] })
    }
  }

  lines.sort((left, right) => left.start - right.start)
  for (let index = 0; index < lines.length; index++) {
    const next = lines.slice(index + 1).find(line => line.start > lines[index].start)
    const naturalEnd = next?.start || Number(durationMs) || lines[index].start + 5000
    lines[index].end = Math.max(lines[index].start + 250, naturalEnd)
  }
  return lines
}

function escapeTypingMania (text) {
  return String(text || '').replace(/[\\<>\[\]]/g, character => `\\${character}`)
}

function typingLine (value, start, end) {
  return new TypingLine(value, start, end, romanizer)
}

function rawLineIsTypable (text, start, end) {
  try {
    return typingLine(escapeTypingMania(text), start, end).getCharacterCount() > 0
  } catch {
    return false
  }
}

function explicitReadingIsTypable (base, reading, start, end) {
  try {
    return typingLine(
      `<<${base}>>[${escapeTypingMania(reading)}]`,
      start,
      end,
    ).getCharacterCount() > 0
  } catch {
    return false
  }
}

function conventionalReading (text, start, end) {
  try {
    return normalizePronunciation(
      typingLine(escapeTypingMania(text), start, end).getRemainingText(),
      'ja',
    )
  } catch {
    return ''
  }
}

function pairReadings (mainLines, readingLines, maximumDelta = 1000) {
  const unused = new Set(readingLines.map((_, index) => index))
  return mainLines.map(main => {
    let selected = -1
    let delta = Infinity
    for (const index of unused) {
      const candidateDelta = Math.abs(readingLines[index].start - main.start)
      if (candidateDelta < delta) {
        selected = index
        delta = candidateDelta
      }
    }
    if (selected < 0 || delta > maximumDelta) return { main, reading: null }
    unused.delete(selected)
    return { main, reading: readingLines[selected] }
  })
}

function median (values) {
  if (!values.length) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

function inputKeyCount (line) {
  try {
    return typingLine(line[2], line[0], line[1]).getCharacterCount()
  } catch {
    return 0
  }
}

/**
 * LRC commonly gives a line only a start timestamp. Its apparent end then
 * becomes the next line's start, which incorrectly assigns a following
 * instrumental break to the previous lyric. Cap only statistically obvious
 * outliers, using this recording's normal milliseconds-per-key as the primary
 * signal and conservative absolute bounds as a fallback.
 */
export function normalizeLyricTimingWindows (lines) {
  const candidates = lines.map(line => {
    const keys = inputKeyCount(line)
    const duration = Math.max(0, Number(line[1]) - Number(line[0]))
    return { line, keys, duration }
  })
  const normalRatios = candidates
    .filter(value => (
      value.keys > 0 &&
      value.duration >= 800 &&
      value.duration <= 12_000
    ))
    .map(value => value.duration / value.keys)
    .filter(value => value >= 45 && value <= 900)
  const typicalMsPerKey = median(normalRatios) || 280
  const maximumMsPerKey = Math.max(
    500,
    Math.min(720, typicalMsPerKey * 1.8),
  )
  let adjusted = 0
  let removedGapMs = 0

  for (const value of candidates) {
    if (!value.keys || value.duration < MIN_OUTLIER_WINDOW_MS) continue
    const maximumWindow = Math.max(
      MIN_WINDOW_CAP_MS,
      value.keys * maximumMsPerKey + 1200,
    )
    if (value.duration <= maximumWindow + WINDOW_OUTLIER_MARGIN_MS) continue
    const previousEnd = Number(value.line[1])
    value.line[1] = Math.round(Number(value.line[0]) + maximumWindow)
    adjusted++
    removedGapMs += previousEnd - value.line[1]
  }
  return {
    adjusted,
    removedGapMs,
    typicalMsPerKey: Math.round(typicalMsPerKey),
    maximumMsPerKey: Math.round(maximumMsPerKey),
  }
}

export function alignTrackSpecificReadings ({
  targetLines,
  sourceLines,
  sourceReadings,
}) {
  const sourcePairs = pairReadings(sourceLines, sourceReadings)
    .filter(pair => pair.reading)
  const queues = new Map()
  for (const pair of sourcePairs) {
    const key = normalizeLyricComparable(pair.main.text)
    if (!key) continue
    const values = queues.get(key) || []
    values.push(pair.reading.text)
    queues.set(key, values)
  }
  return targetLines.flatMap(line => {
    const key = normalizeLyricComparable(line.text)
    const values = queues.get(key)
    if (!values?.length) return []
    return [{
      start: line.start,
      end: line.end,
      text: values.shift(),
      tokens: [],
    }]
  })
}

export async function convertTimedLyrics ({
  mainLines,
  readingLines = [],
  metadata = {},
  readingSource = 'provider-romanization',
}) {
  if (isNonVocalTrackMetadata(metadata)) {
    throw new Error('Instrumental or background-music tracks are not playable')
  }
  const mainFilter = filterLyricLines(mainLines, metadata)
  assertOriginalLyricLayer(metadata, mainFilter.kept)
  const readingFilter = filterLyricLines(
    readingLines,
    metadata,
    { romanized: true },
  )
  const pairs = pairReadings(mainFilter.kept, readingFilter.kept)
  const output = []
  const typable = []
  const verificationReadings = []
  const qualityIssues = []
  let generatedPinyinLines = 0
  let songSpecificPronunciationLines = 0
  let pronunciationOverrideLines = 0
  let explicitRubyLines = 0
  let dictionaryPronunciationLines = 0
  let pendingPronunciationLines = 0
  let verifiedPronunciationLines = 0

  for (const pair of pairs) {
    const { main } = pair
    if (!Number.isFinite(main.start) || !Number.isFinite(main.end)) continue
    if (main.end <= main.start) continue
    const visibleText = stripInlineLyricRuby(main.text)
    const base = escapeTypingMania(visibleText)
    const family = lyricLanguage(metadata.language, visibleText)
    let providedReading = pair.reading?.text || ''
    let source = readingSource
    if (family === 'ja' && !providedReading) {
      const inlineReading = inlineLyricRubyReading(main.text)
      if (inlineReading) {
        providedReading = conventionalReading(
          inlineReading,
          main.start,
          main.end,
        )
        source = 'inline-ruby'
      }
    }
    if (
      family === 'ja' &&
      !providedReading &&
      !/\p{Script=Han}/u.test(visibleText)
    ) {
      providedReading = conventionalReading(visibleText, main.start, main.end)
      source = 'visible-kana'
    }
    const pronunciation = await pronunciationForLine({
      text: main.text,
      providedReading,
      language: metadata.language,
    })
    if (pronunciation.family === 'ja') {
      if (pronunciation.explicitRuby) explicitRubyLines++
      if (pronunciation.source === 'dictionary') dictionaryPronunciationLines++
      if (pronunciation.status === 'pending') pendingPronunciationLines++
      if (pronunciation.status === 'verified') verifiedPronunciationLines++
    }
    let lyric = `<<${base}>>[]`
    let canType = false

    if (
      pronunciation.family === 'en' &&
      rawLineIsTypable(visibleText, main.start, main.end)
    ) {
      lyric = base
      canType = true
    } else if (
      pronunciation.reading &&
      explicitReadingIsTypable(
        base,
        pronunciation.reading,
        main.start,
        main.end,
      )
    ) {
      lyric = `<<${base}>>[${escapeTypingMania(pronunciation.reading)}]`
      canType = true
      if (pronunciation.source === 'pinyin-pro') {
        generatedPinyinLines++
      } else if (pronunciation.family === 'ja') {
        songSpecificPronunciationLines++
        if (source !== 'visible-kana') pronunciationOverrideLines++
      }
      verificationReadings.push({
        start: main.start,
        end: main.end,
        reading: pronunciation.reading,
        source,
      })
    } else {
      qualityIssues.push(`${visibleText}: usable pronunciation is missing`)
    }

    const line = [main.start, main.end, lyric]
    output.push(line)
    if (canType) typable.push(line)
  }

  if (qualityIssues.length) {
    throw new Error(
      `Lyrics failed pronunciation coverage ` +
      `(${qualityIssues.length} issue(s); ${qualityIssues[0]})`,
    )
  }
  if (typable.length < 5) {
    throw new Error('Lyrics do not contain enough playable timed lines')
  }
  const totalKeys = typable.reduce((sum, line) => sum + inputKeyCount(line), 0)
  const distinctLines = new Set(
    mainFilter.kept
      .map(line => normalizeLyricComparable(line.text))
      .filter(Boolean),
  ).size
  if (
    totalKeys < MIN_VOCAL_KEY_COUNT ||
    distinctLines < MIN_DISTINCT_VOCAL_LINES
  ) {
    throw new Error('The track has no substantial vocal lyrics')
  }
  const timing = normalizeLyricTimingWindows(output)

  const durationMs = Math.max(0, Number(metadata.duration) || 0) * 1000
  const paceOptions = { durationMs }
  const [lyricsCsv] = buildSongLyrics(output, paceOptions)
  const [, cpm, maxCpm] = buildSongLyrics(typable, paceOptions)
  const verificationLines = mainFilter.kept.map(line => (
    stripInlineLyricRuby(line.text)
  ))
  const fingerprint = crypto
    .createHash('sha256')
    .update(verificationLines.map(normalizeLyricComparable).join('\n'))
    .digest('hex')
  const pronunciationFingerprint = crypto
    .createHash('sha256')
    .update(verificationReadings.map(line => (
      `${line.start}:${normalizePronunciation(line.reading, metadata.language)}`
    )).join('\n'))
    .digest('hex')

  return {
    lyricsCsv,
    cpm,
    maxCpm,
    fingerprint,
    pronunciationFingerprint,
    verificationLines,
    verificationReadings,
    stats: {
      qualityVersion: LYRIC_QUALITY_VERSION,
      pronunciationVersion: PRONUNCIATION_QUALITY_VERSION,
      mainLines: mainFilter.kept.length,
      romaLines: readingFilter.kept.length,
      playableLines: typable.length,
      displayOnlyLines: output.length - typable.length,
      removedMainMetadataLines: mainFilter.removed.length,
      removedRomaMetadataLines: readingFilter.removed.length,
      generatedPinyinLines,
      songSpecificPronunciationLines,
      pronunciationOverrideLines,
      pronunciationStatus: pendingPronunciationLines > 0 ? (explicitRubyLines > 0 ? 'ruby-assisted' : 'pending') : (explicitRubyLines > 0 ? 'ruby-assisted' : 'verified'),
      explicitRubyLines,
      dictionaryPronunciationLines,
      pendingPronunciationLines,
      verifiedPronunciationLines,
      timingWindowsAdjusted: timing.adjusted,
      instrumentalGapMsRemoved: timing.removedGapMs,
      typicalMsPerKey: timing.typicalMsPerKey,
      firstStartMs: output[0]?.[0] ?? null,
      lastEndMs: output.at(-1)?.[1] ?? null,
    },
  }
}
