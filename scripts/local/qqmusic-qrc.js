import fs from 'node:fs/promises'
import crypto from 'node:crypto'

import TypingLine from '../../src/typing/typingline.js'
import Romanizer from '../../src/typing/romanizer.js'
import latinTable from '../../latin-table/latin-table.js'
import { buildSongLyrics } from '../../src/util/song-meta.js'
import {
  filterLyricLines,
  isNonVocalTrackMetadata,
  LYRIC_QUALITY_VERSION,
  normalizeLyricComparable,
  reconcileQrcWithOfficial,
} from './lyrics-quality.js'
import { normalizeLyricTimingWindows } from './timed-lyrics.js'
import {
  normalizePronunciation,
  PRONUNCIATION_QUALITY_VERSION,
  pronunciationForLine,
  requiresSongSpecificReading,
} from './pronunciation.js'

const romanizer = new Romanizer(latinTable)
export { LYRIC_QUALITY_VERSION } from './lyrics-quality.js'

function decodeXmlEntities (text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, value) => String.fromCodePoint(parseInt(value, 16)))
    .replace(/&#([0-9]+);/g, (_, value) => String.fromCodePoint(parseInt(value, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

export function extractLyricContent (xml) {
  const match = xml.match(/\bLyricContent="([\s\S]*?)"\s*\/?\s*>/)
  if (!match) {
    throw new Error('QRC XML does not contain LyricContent')
  }
  return decodeXmlEntities(match[1])
}

export function parseTimedQrcLines (lyricContent) {
  const lines = []
  for (const rawLine of lyricContent.split(/\\r?\\n|\r?\n/)) {
    const match = rawLine.match(/^\[(\d+),(\d+)\]([\s\S]*)$/)
    if (!match) {
      continue
    }
    const start = Number(match[1])
    const duration = Number(match[2])
    const timedText = match[3]
    const tokens = []
    for (const token of timedText.matchAll(/([\s\S]*?)\((\d+),(\d+)\)/g)) {
      tokens.push({
        text: token[1],
        start: Number(token[2]),
        duration: Number(token[3]),
        end: Number(token[2]) + Number(token[3]),
      })
    }
    const text = timedText
      .replace(/\(\d+,\d+\)/g, '')
      .normalize('NFKC')
      .trim()
    if (text && Number.isFinite(start) && Number.isFinite(duration) && duration > 0) {
      lines.push({ start, end: start + duration, text, tokens })
    }
  }
  return lines.sort((left, right) => left.start - right.start)
}

function escapeTypingMania (text) {
  return text.replace(/[\\<>\[\]]/g, character => `\\${character}`)
}

function pairLines (mainLines, readingLines) {
  const unused = new Set(readingLines.map((_, index) => index))
  return mainLines.map(main => {
    let bestIndex = -1
    let bestDelta = Infinity
    for (const index of unused) {
      const delta = Math.abs(readingLines[index].start - main.start)
      if (delta < bestDelta) {
        bestDelta = delta
        bestIndex = index
      }
    }
    if (bestIndex >= 0 && bestDelta <= 500) {
      unused.delete(bestIndex)
      return { main, reading: readingLines[bestIndex], timingDelta: bestDelta }
    }
    return { main, reading: null, timingDelta: null }
  })
}

function hasCompleteTokenTiming (line, maximumEnd = line.end) {
  const tokens = line.tokens.filter(token => (
    token.duration > 0 && /[\p{L}\p{N}]/u.test(token.text)
  ))
  if (!tokens.length) return false
  const tolerance = Math.max(750, (line.end - line.start) * 0.20)
  const upperBound = Number.isFinite(maximumEnd) ? maximumEnd : line.end
  let previousStart = -Infinity
  for (const token of tokens) {
    if (
      !Number.isFinite(token.start) ||
      !Number.isFinite(token.duration) ||
      token.duration <= 0 ||
      token.start < previousStart ||
      token.start < line.start - tolerance ||
      token.end > upperBound + tolerance
    ) {
      return false
    }
    previousStart = token.start
  }
  const first = tokens[0]
  const last = tokens.at(-1)
  return first.start <= line.start + tolerance && last.end >= line.end - tolerance
}

async function decryptQrc (crypto, filename) {
  const encrypted = await fs.readFile(filename)
  return new TextDecoder().decode(crypto.decryptQRCFile(encrypted))
}

function rawLineIsTypable (text, start, end) {
  try {
    const line = new TypingLine(escapeTypingMania(text), start, end, romanizer)
    return line.getCharacterCount() > 0
  } catch {
    return false
  }
}

function conventionalLatinTableReading (text, start, end) {
  try {
    const line = new TypingLine(escapeTypingMania(text), start, end, romanizer)
    return normalizePronunciation(line.getRemainingText(), 'ja')
  } catch {
    return ''
  }
}

function explicitReadingIsTypable (base, reading, start, end) {
  try {
    const line = new TypingLine(`<<${base}>>[${escapeTypingMania(reading)}]`, start, end, romanizer)
    return line.getCharacterCount() > 0
  } catch {
    return false
  }
}

export async function convertQrcFiles ({
  crypto: qrcCrypto,
  mainFile,
  romaFile = null,
  metadata = {},
  officialLines = [],
}) {
  if (isNonVocalTrackMetadata(metadata)) {
    throw new Error('The track is marked as instrumental or non-vocal')
  }
  const mainXml = await decryptQrc(qrcCrypto, mainFile)
  const parsedMainLines = parseTimedQrcLines(extractLyricContent(mainXml))
  if (!parsedMainLines.length) {
    throw new Error('QRC does not contain timed lyric lines')
  }
  const mainFilter = filterLyricLines(parsedMainLines, metadata)
  let mainLines = mainFilter.kept

  let romaLines = []
  let romaFilter = { kept: [], removed: [] }
  if (romaFile) {
    const romaXml = await decryptQrc(qrcCrypto, romaFile)
    const parsedRomaLines = parseTimedQrcLines(extractLyricContent(romaXml))
    romaFilter = filterLyricLines(parsedRomaLines, metadata, { romanized: true })
    romaLines = romaFilter.kept
  }
  const reconciliation = reconcileQrcWithOfficial({
    mainLines,
    readingLines: romaLines,
    officialLines,
  })
  mainLines = reconciliation.mainLines
  const pairs = pairLines(mainLines, romaLines)
  const output = []
  const typable = []
  const qualityIssues = []
  let timingValidatedLines = 0
  let generatedPinyinLines = 0
  let songSpecificPronunciationLines = 0
  let pronunciationOverrideLines = 0
  const verificationReadings = []
  const usedReadings = new Set(pairs.filter(pair => pair.reading).map(pair => pair.reading))

  for (let index = 0; index < pairs.length; index++) {
    const pair = pairs[index]
    const nextStart = index + 1 < pairs.length ? pairs[index + 1].main.start : Infinity
    const readingTokenEnd = pair.reading?.tokens
      .filter(token => token.duration > 0)
      .reduce((maximum, token) => Math.max(maximum, token.end), 0) || 0
    const end = Math.min(Math.max(pair.main.end, pair.reading?.end || 0, readingTokenEnd), nextStart)
    if (end <= pair.main.start) {
      continue
    }

    const base = escapeTypingMania(pair.main.text)
    const readingTimingComplete = Boolean(
      pair.reading && hasCompleteTokenTiming(pair.reading, nextStart),
    )
    const pronunciation = pronunciationForLine({
      text: pair.main.text,
      providedReading: readingTimingComplete ? pair.reading?.text : '',
      language: metadata.language,
    })
    const reading = pronunciation.reading
    let lyric
    let canType = false
    if (
      pronunciation.family === 'en' &&
      rawLineIsTypable(pair.main.text, pair.main.start, end)
    ) {
      lyric = base
      canType = true
    } else if (
      reading &&
      explicitReadingIsTypable(base, reading, pair.main.start, end)
    ) {
      lyric = `<<${base}>>[${escapeTypingMania(reading)}]`
      canType = true
      if (pronunciation.source === 'pinyin-pro') generatedPinyinLines++
      else {
        timingValidatedLines++
        if (pronunciation.family === 'ja') {
          songSpecificPronunciationLines++
          const conventional = conventionalLatinTableReading(
            pair.main.text,
            pair.main.start,
            end,
          )
          if (conventional && conventional !== reading) {
            pronunciationOverrideLines++
          }
        }
      }
      verificationReadings.push({
        start: pair.main.start,
        end,
        reading,
      })
    } else {
      lyric = `<<${base}>>[]`
      const reason = pair.reading && !readingTimingComplete
        ? 'pronunciation timing is incomplete'
        : requiresSongSpecificReading(metadata.language, pair.main.text)
          ? 'song-specific Japanese pronunciation is missing'
          : 'usable pronunciation is missing'
      qualityIssues.push(`${pair.main.text}: ${reason}`)
    }

    const timedLyric = [pair.main.start, end, lyric]
    output.push(timedLyric)
    if (canType) {
      typable.push(timedLyric)
    }
  }

  if (typable.length < 5) {
    throw new Error('Lyrics do not contain enough lines with usable pronunciation')
  }
  const totalKeys = typable.reduce((sum, line) => {
    try {
      return sum + new TypingLine(
        line[2],
        line[0],
        line[1],
        romanizer,
      ).getCharacterCount()
    } catch {
      return sum
    }
  }, 0)
  const distinctLines = new Set(
    mainLines.map(line => normalizeLyricComparable(line.text)).filter(Boolean),
  ).size
  if (totalKeys < 18 || distinctLines < 4) {
    throw new Error('The track has no substantial vocal lyrics')
  }
  const unmatchedReadings = romaLines.filter(line => !usedReadings.has(line))
  if (unmatchedReadings.length) {
    qualityIssues.push(`${unmatchedReadings.length} pronunciation line(s) do not match the lyric timeline`)
  }
  if (qualityIssues.length) {
    throw new Error(
      `Lyrics failed pronunciation coverage (${qualityIssues.length} issue(s); ${qualityIssues[0]})`,
    )
  }
  const timing = normalizeLyricTimingWindows(output)
  const paceOptions = {
    durationMs: Math.max(0, Number(metadata.duration) || 0) * 1000,
  }
  const [lyricsCsv] = buildSongLyrics(output, paceOptions)
  const [, cpm, maxCpm] = buildSongLyrics(typable, paceOptions)
  const deltas = pairs.filter(pair => pair.timingDelta !== null).map(pair => pair.timingDelta)
  const verificationLines = mainLines.map(line => line.text)
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
      mainLines: mainLines.length,
      romaLines: romaLines.length,
      playableLines: typable.length,
      displayOnlyLines: output.length - typable.length,
      removedMainMetadataLines: mainFilter.removed.length,
      removedRomaMetadataLines: romaFilter.removed.length,
      officialTextReplacements: reconciliation.replacements,
      officialRecoveredLines: reconciliation.recoveredLines,
      officialReconciliationConfidence: reconciliation.confidence,
      timingValidatedLines,
      generatedPinyinLines,
      songSpecificPronunciationLines,
      pronunciationOverrideLines,
      timingWindowsAdjusted: timing.adjusted,
      instrumentalGapMsRemoved: timing.removedGapMs,
      typicalMsPerKey: timing.typicalMsPerKey,
      maxTimingDeltaMs: deltas.length ? Math.max(...deltas) : null,
      firstStartMs: output[0]?.[0] ?? null,
      lastEndMs: output.at(-1)?.[1] ?? null,
    },
  }
}
