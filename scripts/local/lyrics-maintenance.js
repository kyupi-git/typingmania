import crypto from 'crypto'
import fs from 'fs/promises'

import PackedFile from '../../src/lib/packedfile.js'
import {
  buildSongLyrics,
  PACE_METADATA_VERSION,
} from '../../src/util/song-meta.js'
import {
  filterLyricLines,
  isNonVocalTrackMetadata,
  LYRIC_QUALITY_VERSION,
  normalizeLyricComparable,
  normalizeExplicitPronunciation,
} from './lyrics-quality.js'
import { scanSongLibrary } from './library.js'
import { normalizeLyricTimingWindows } from './timed-lyrics.js'

function exactArrayBuffer (buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

function unescapeTypingMania (value) {
  return String(value || '').replace(/\\([\\<>\[\]])/g, '$1')
}

export function displayTextFromTypingLyric (value) {
  const text = String(value || '')
  const explicit = text.match(/^<<([\s\S]*)>>\[[\s\S]*\]$/u)
  return unescapeTypingMania(explicit ? explicit[1] : text)
}

export function parseLyricsCsv (csv) {
  const lines = []
  for (const row of String(csv || '').split(/\r?\n/u)) {
    if (!row.trim()) continue
    const [rawStart, rawEnd, ...lyricParts] = row.split(',')
    const start = Number(rawStart)
    const end = Number(rawEnd)
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue
    const lyric = lyricParts.join(',')
    lines.push({
      start,
      end,
      lyric,
      text: displayTextFromTypingLyric(lyric),
    })
  }
  return lines
}

function needsMaintenance (song) {
  return (
    ['qqmusic', 'netease', 'apple-music', 'local-files'].includes(
      song?.source?.service,
    ) &&
    (
      Number(song.source?.quality?.version || 0) < LYRIC_QUALITY_VERSION ||
      Number(song.source?.pace?.version || 0) < PACE_METADATA_VERSION
    )
  )
}

async function refreshPackedSongLyrics (existingSong) {
  const filename = existingSong._local_filename
  const input = await fs.readFile(filename)
  const packed = new PackedFile()
  const output = new PackedFile()
  const encoder = new TextEncoder()
  const temporary = `${filename}.${process.pid}.tmp`
  const backup = `${filename}.${process.pid}.lyrics-backup`
  try {
    packed.unpackFromBuffer(exactArrayBuffer(input))
    const song = JSON.parse(packed.getAsText('song.json'))
    if (isNonVocalTrackMetadata(song)) {
      throw new Error('instrumental or background-music track')
    }
    const parsed = parseLyricsCsv(packed.getAsText('lyrics.csv'))
    const filtered = filterLyricLines(parsed, song)
    if (filtered.kept.length < 5) {
      throw new Error('fewer than five lyric lines remain after metadata filtering')
    }
    const lyrics = filtered.kept.map(line => [
      line.start,
      line.end,
      normalizeExplicitPronunciation(line.lyric, song.language),
    ])
    const timing = normalizeLyricTimingWindows(lyrics)
    const [lyricsCsv, cpm, maxCpm] = buildSongLyrics(lyrics, {
      durationMs: Math.max(0, Number(song.duration) || 0) * 1000,
    })
    song.cpm = cpm
    song.max_cpm = maxCpm
    song.source = song.source || {}
    song.source.quality = {
      ...(song.source.quality || {}),
      version: LYRIC_QUALITY_VERSION,
      playable_lines: filtered.kept.length,
      display_only_lines: 0,
      removed_metadata_lines:
        Number(song.source.quality?.removed_metadata_lines || 0) +
        filtered.removed.length,
      timing_windows_adjusted: timing.adjusted,
      instrumental_gap_ms_removed: timing.removedGapMs,
      typical_ms_per_key: timing.typicalMsPerKey,
    }
    song.source.pace = {
      version: PACE_METADATA_VERSION,
      model: 'demo-human-cadence',
      average: 'score-typing-time',
      peak: 'event-based-5-second-window',
    }
    song.source.lyrics_fingerprint = crypto
      .createHash('sha256')
      .update(filtered.kept.map(line => (
        normalizeLyricComparable(line.text)
      )).join('\n'))
      .digest('hex')

    for (let index = 0; index < packed.file_count; index++) {
      const name = packed.file_name[index]
      if (name === 'song.json' || name === 'lyrics.csv') continue
      output.addFile(name, new Uint8Array(packed.file_buffer[index]))
    }
    output.addFile('song.json', encoder.encode(JSON.stringify(song)))
    output.addFile('lyrics.csv', encoder.encode(lyricsCsv))
    await fs.writeFile(temporary, Buffer.from(output.pack()))
    await fs.rename(filename, backup)
    try {
      await fs.rename(temporary, filename)
      await fs.rm(backup, { force: true }).catch(() => {})
    } catch (error) {
      await fs.rename(backup, filename).catch(() => {})
      throw error
    }
    return {
      song: { ...existingSong, ...song },
      removed: filtered.removed.map(line => ({
        kind: line.kind,
        text: line.text,
      })),
    }
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {})
    try {
      await fs.access(filename)
    } catch {
      await fs.rename(backup, filename).catch(() => {})
    }
    throw error
  } finally {
    packed.destroy()
    output.destroy()
  }
}

export async function refreshImportedLyricsAndPace ({
  root,
  records = null,
  onProgress = () => {},
} = {}) {
  const library = records ? { records } : await scanSongLibrary(root)
  const candidates = library.records.filter(needsMaintenance)
  const result = {
    inspected: 0,
    refreshed: 0,
    removed: 0,
    failed: 0,
    failures: [],
  }
  for (const song of candidates) {
    result.inspected++
    try {
      const refreshed = await refreshPackedSongLyrics(song)
      result.refreshed++
      result.removed += refreshed.removed.length
      const index = library.records.indexOf(song)
      if (index >= 0) library.records[index] = refreshed.song
    } catch (error) {
      result.failed++
      result.failures.push({
        title: song.title,
        file: song._local_filename,
        error: error.message,
      })
    }
    onProgress({ ...result, total: candidates.length, songTitle: song.title })
  }
  return result
}
