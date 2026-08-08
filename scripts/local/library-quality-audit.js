import crypto from 'crypto'
import path from 'path'

import Romanizer from '../../src/typing/romanizer.js'
import TypingLine from '../../src/typing/typingline.js'
import latinTable from '../../latin-table/latin-table.js'
import { analyzeSongTitle } from '../../src/song/song-title.js'
import { buildSongLyrics } from '../../src/util/song-meta.js'
import {
  hasVerifiedOriginalWorkTitle,
} from '../../src/song/song-origin.js'
import {
  filterLyricLines,
  LYRIC_QUALITY_VERSION,
  normalizeLyricComparable,
} from './lyrics-quality.js'
import { parseLyricsCsv } from './lyrics-maintenance.js'
import { scanSongLibrary } from './library.js'
import {
  readPackedSongManifest,
  readPackedSongText,
} from './packed-song-reader.js'
import {
  ORIGINAL_ARTIST_VERSION,
  isLikelyArtistName,
  looksLocalizedArtistName,
} from './original-artist.js'
import {
  assertOriginalLyricLayer,
  PRONUNCIATION_QUALITY_VERSION,
} from './pronunciation.js'
import { normalizeLyricTimingWindows } from './timed-lyrics.js'

const romanizer = new Romanizer(latinTable)
const VALID_LANGUAGES = new Set(['EN', 'JA', 'JP', 'ZH', 'U'])
const IMPORT_SERVICES = new Set([
  'applemusic',
  'apple-music',
  'local',
  'local-files',
  'netease',
  'qqmusic',
])
const EXPLICIT_READING = /^<<[\s\S]*>>\[([\s\S]*)\]$/u

function normalizedLanguage (value) {
  const language = String(value || '').toLocaleUpperCase()
  if (['EN', 'ENG'].includes(language)) return 'EN'
  if (['JA', 'JP', 'JPN'].includes(language)) return 'JA'
  if (['ZH', 'CN', 'ZHO', 'CHI'].includes(language)) return 'ZH'
  return language || 'U'
}

function issue (severity, code, detail = '') {
  return { severity, code, detail }
}

function sha256 (value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function validatePronunciation (line, language) {
  const issues = []
  const explicit = line.lyric.match(EXPLICIT_READING)
  const reading = explicit?.[1] || ''
  if (
    explicit &&
    /[_\s'’‘]/u.test(reading)
  ) {
    issues.push(issue(
      'error',
      'pronunciation-has-playable-separators',
      'Explicit pronunciation contains spaces, underscores, or apostrophes.',
    ))
  }
  if (
    explicit &&
    /[^\x20-\x7E]/u.test(reading)
  ) {
    issues.push(issue(
      'error',
      'pronunciation-is-not-ascii',
      'Explicit pronunciation must resolve to physical ASCII keys.',
    ))
  }
  if (
    language === 'ZH' &&
    /\p{Script=Han}/u.test(line.text) &&
    !reading
  ) {
    issues.push(issue(
      'error',
      'chinese-pinyin-missing',
      'A Chinese Han lyric line has no explicit pinyin reading.',
    ))
  }

  try {
    const typingLine = new TypingLine(
      line.lyric,
      line.start / 1000,
      line.end / 1000,
      romanizer,
    )
    if (typingLine.getCharacterCount() <= 0) {
      issues.push(issue(
        'error',
        'lyric-is-not-playable',
        'The line produces no playable keys.',
      ))
    }
  } catch (error) {
    issues.push(issue(
      'error',
      'pronunciation-cannot-be-parsed',
      error?.message || 'TypingLine rejected the lyric.',
    ))
  }
  return issues
}

export function auditLyricContent (metadata, lyricsCsv) {
  const issues = []
  const language = normalizedLanguage(metadata.language)
  const rows = String(lyricsCsv || '')
    .split(/\r?\n/u)
    .filter(row => row.trim())
  const lines = parseLyricsCsv(lyricsCsv)
  if (rows.length !== lines.length) {
    issues.push(issue(
      'error',
      'invalid-lyric-timing-row',
      `${rows.length - lines.length} row(s) have invalid timing.`,
    ))
  }
  if (lines.length < 5) {
    issues.push(issue(
      'error',
      'too-few-playable-lines',
      `Only ${lines.length} timed lyric line(s) were found.`,
    ))
  }
  for (let index = 1; index < lines.length; index++) {
    if (lines[index].start < lines[index - 1].start) {
      issues.push(issue(
        'error',
        'lyrics-are-not-chronological',
        `Line ${index + 1} starts before the preceding line.`,
      ))
      break
    }
  }

  const filtered = filterLyricLines(lines, metadata)
  for (const removed of filtered.removed) {
    issues.push(issue(
      'error',
      `non-lyric-${removed.kind}`,
      `A ${removed.kind} row remains playable at ${removed.start} ms.`,
    ))
  }
  try {
    assertOriginalLyricLayer(metadata, lines)
  } catch (error) {
    issues.push(issue(
      'error',
      'translated-lyric-layer',
      error?.message || 'The playable lyric layer is not the original lyric.',
    ))
  }
  lines.forEach((line, index) => {
    for (const found of validatePronunciation(line, language)) {
      issues.push({
        ...found,
        detail: `Line ${index + 1}: ${found.detail}`,
      })
    }
  })

  const songLyrics = lines.map(line => [line.start, line.end, line.lyric])
  const timing = normalizeLyricTimingWindows(songLyrics)
  if (timing.adjusted > 0) {
    issues.push(issue(
      'error',
      'instrumental-gap-attached-to-lyric',
      `${timing.adjusted} lyric window(s) include ${timing.removedGapMs} ms ` +
      'of statistically implausible trailing time.',
    ))
  }
  let expectedCpm = 0
  let expectedPeakCpm = 0
  let paceCalculated = false
  try {
    const reference = buildSongLyrics(songLyrics, {
      durationMs: Math.max(0, Number(metadata.duration) || 0) * 1000,
    })
    expectedCpm = reference[1]
    expectedPeakCpm = reference[2]
    paceCalculated = true
  } catch (error) {
    issues.push(issue(
      'error',
      'reference-pace-cannot-be-calculated',
      error?.message || 'The typing schedule could not be calculated.',
    ))
  }
  if (paceCalculated) {
    if (Math.abs(Number(metadata.cpm) - expectedCpm) > 1) {
      issues.push(issue(
        'error',
        'reference-cpm-is-stale',
        `Stored ${metadata.cpm}; calculated ${expectedCpm}.`,
      ))
    }
    if (Math.abs(Number(metadata.max_cpm) - expectedPeakCpm) > 1) {
      issues.push(issue(
        'error',
        'reference-peak-cpm-is-stale',
        `Stored ${metadata.max_cpm}; calculated ${expectedPeakCpm}.`,
      ))
    }
  }

  const fingerprint = sha256(
    lines.map(line => normalizeLyricComparable(line.text)).join('\n'),
  )
  if (
    metadata.source?.service === 'qqmusic' &&
    metadata.source?.lyrics_fingerprint !== fingerprint
  ) {
    issues.push(issue(
      'error',
      'lyrics-fingerprint-mismatch',
      'The playable lyrics no longer match the verified import fingerprint.',
    ))
  }
  return { issues, lines, language, expectedCpm, expectedPeakCpm }
}

function hasTrustedOriginalArtistResolution (metadata) {
  const source = metadata.source || {}
  const resolution = source.artist_resolution
  const artists = Array.isArray(resolution?.artists)
    ? resolution.artists
    : []
  return (
    Number(resolution?.version || 0) >= ORIGINAL_ARTIST_VERSION &&
    resolution?.resolved === true &&
    source.checks?.artist_original === true &&
    artists.length > 0 &&
    artists.every(artist => (
      artist?.resolved === true &&
      String(artist?.original_name || '').trim()
    ))
  )
}

function hasPendingOriginalArtistResolution (metadata) {
  const resolution = metadata.source?.artist_resolution
  return (
    resolution?.status === 'pending' &&
    resolution?.resolved === false &&
    metadata.source?.checks?.artist_original === false
  )
}

function looksLikeUnverifiedAllHanArtist (metadata) {
  const language = normalizedLanguage(metadata.language)
  return (
    ['JA', 'JP', 'U'].includes(language) &&
    /\p{Script=Han}/u.test(String(metadata.artist || '')) &&
    !/[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Latin}]/u.test(
      String(metadata.artist || ''),
    )
  )
}

export function auditMetadata (metadata, entries) {
  const issues = []
  const language = normalizedLanguage(metadata.language)
  if (!String(metadata.title || '').trim()) {
    issues.push(issue('error', 'title-missing', 'The song title is empty.'))
  }
  if (!VALID_LANGUAGES.has(language)) {
    issues.push(issue(
      'warning',
      'language-is-unknown',
      `Language code ${metadata.language || '(empty)'} is not recognized.`,
    ))
  }
  if (!String(metadata.artist || '').trim()) {
    issues.push(issue('error', 'artist-missing', 'The artist name is empty.'))
  } else if (!isLikelyArtistName(metadata.artist)) {
    issues.push(issue(
      'error',
      'artist-invalid',
      'The artist field contains a biography, copyright notice, or unknown artist value.',
    ))
  }
  const cleanedTitle = analyzeSongTitle(metadata.title, {
    language: metadata.language,
  }).title
  if (cleanedTitle !== metadata.title) {
    issues.push(issue(
      'error',
      'translated-title-alias-visible',
      `The display title should be “${cleanedTitle}”.`,
    ))
  }
  const trustedArtist = hasTrustedOriginalArtistResolution(metadata)
  const localizedArtist = looksLocalizedArtistName(metadata.artist, {
    language: metadata.language,
  }) || (looksLikeUnverifiedAllHanArtist(metadata) && !trustedArtist)
  const explicitlyVerifiedArtist =
    metadata.source?.artist_resolution?.status === 'verified'
  if (localizedArtist && hasPendingOriginalArtistResolution(metadata)) {
    issues.push(issue(
      'warning',
      'artist-original-pending',
      'The visible artist name may be localized; original-name verification is pending.',
    ))
  } else if (localizedArtist && (!trustedArtist || explicitlyVerifiedArtist)) {
    issues.push(issue(
      'error',
      'localized-artist-name-visible',
      'The visible artist name appears to be a localized alias.',
    ))
  }

  const mediaNames = ['audio', 'video']
    .map(field => String(metadata[field] || ''))
    .filter(Boolean)
  if (!mediaNames.length && !metadata.youtube) {
    issues.push(issue(
      'error',
      'playable-media-missing',
      'No local audio/video entry or YouTube source is declared.',
    ))
  }
  for (const field of ['audio', 'video', 'image', 'poster']) {
    const entryName = String(metadata[field] || '')
    if (entryName && !(Number(entries[entryName]) > 0)) {
      issues.push(issue(
        'error',
        `${field}-entry-missing`,
        `Referenced entry “${entryName}” is absent or empty.`,
      ))
    }
  }
  if (!(Number(entries['lyrics.csv']) > 0)) {
    issues.push(issue(
      'error',
      'lyrics-entry-missing',
      'lyrics.csv is absent or empty.',
    ))
  }

  if (metadata.poster && !hasVerifiedOriginalWorkTitle(metadata.origin)) {
    issues.push(issue(
      'error',
      'poster-work-is-unverified',
      'A work poster is present without a verified original work identity.',
    ))
  }
  if (
    hasVerifiedOriginalWorkTitle(metadata.origin) &&
    !metadata.poster
  ) {
    issues.push(issue(
      'warning',
      'verified-work-poster-missing',
      'The work is verified, but no poster is available.',
    ))
  }

  if (IMPORT_SERVICES.has(metadata.source?.service)) {
    const quality = metadata.source?.quality || {}
    if (Number(quality.version || 0) < LYRIC_QUALITY_VERSION) {
      issues.push(issue(
        'error',
        'lyric-quality-version-is-stale',
        `Stored quality version ${quality.version || 0}.`,
      ))
    }
    if (Number(quality.display_only_lines || 0) !== 0) {
      issues.push(issue(
        'error',
        'display-only-lines-remain',
        `${quality.display_only_lines} line(s) are not playable.`,
      ))
    }
    if (
      ['JA', 'JP'].includes(language) &&
      Number(quality.generated_pinyin_lines || 0) > 0
    ) {
      issues.push(issue(
        'error',
        'japanese-track-uses-generated-pinyin',
        'A Japanese track contains generated Chinese pinyin.',
      ))
    }
    if (
      ['JA', 'JP'].includes(language) &&
      Number(quality.pronunciation_version || 0) <
        PRONUNCIATION_QUALITY_VERSION
    ) {
      issues.push(issue(
        'warning',
        'pronunciation-quality-version-is-stale',
        `Stored pronunciation version ${quality.pronunciation_version || 0}.`,
      ))
    }
  }
  return issues
}

export async function auditSongLibrary ({
  root,
  includeSong = () => true,
  includeInvalid = () => true,
} = {}) {
  const library = await scanSongLibrary(root)
  const songs = []
  const records = library.records.filter(includeSong)
  const invalidPackages = library.errors.filter(includeInvalid)
  for (const record of records) {
    const manifest = await readPackedSongManifest(record._local_filename)
    const metadataIssues = auditMetadata(
      manifest.metadata,
      manifest.entries,
    )
    let lyricAudit = {
      issues: [],
      lines: [],
      language: normalizedLanguage(manifest.metadata.language),
    }
    if (Number(manifest.entries['lyrics.csv']) > 0) {
      try {
        lyricAudit = auditLyricContent(
          manifest.metadata,
          await readPackedSongText(record._local_filename, 'lyrics.csv'),
        )
      } catch (error) {
        lyricAudit.issues.push(issue(
          'error',
          'lyrics-cannot-be-read',
          error?.message || 'Unable to read lyrics.csv.',
        ))
      }
    }
    const issues = [...metadataIssues, ...lyricAudit.issues]
    songs.push({
      id: record.url,
      title: String(manifest.metadata.title || ''),
      language: lyricAudit.language,
      lyricLines: lyricAudit.lines.length,
      issues,
    })
  }

  for (const invalid of invalidPackages) {
    songs.push({
      id: path.relative(root, invalid.filename),
      title: '',
      language: 'U',
      lyricLines: 0,
      issues: [issue('error', 'package-cannot-be-read', invalid.error)],
    })
  }
  const errors = songs.flatMap(song => (
    song.issues
      .filter(found => found.severity === 'error')
      .map(found => ({ ...found, songId: song.id, title: song.title }))
  ))
  const warnings = songs.flatMap(song => (
    song.issues
      .filter(found => found.severity === 'warning')
      .map(found => ({ ...found, songId: song.id, title: song.title }))
  ))
  const languages = Object.fromEntries(
    [...new Set(songs.map(song => song.language))]
      .sort()
      .map(language => [
        language,
        songs.filter(song => song.language === language).length,
      ]),
  )
  return {
    ok: errors.length === 0,
    songs: songs.length,
    packagesScanned: records.length + invalidPackages.length,
    errors,
    warnings,
    languages,
    details: songs,
  }
}
