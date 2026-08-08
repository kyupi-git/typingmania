import { hasVerifiedOriginalWorkTitle } from '../../src/song/song-origin.js'
import {
  inferSongOriginHint,
} from './imported-song-enrichment.js'
import {
  scanSongLibrary,
} from './library.js'
import {
  refreshPackedSongOrigin,
  SONG_ORIGIN_LOOKUP_VERSION,
} from './song-origin-package.js'
import SongOriginResolver, {
  needsDirectProductionTitleRefresh,
  normalizeOriginalTitleLanguage,
  SONG_ORIGIN_VERSION,
} from './song-origin-resolver.js'

const UNRESOLVED_RETRY_MS = 7 * 24 * 60 * 60 * 1000
const ORIGIN_SUPPORTED_SERVICES = new Set([
  'qqmusic',
  'netease',
  'apple-music',
  'local-files',
])

export function hasCurrentSongOriginResolution (song) {
  if (hasVerifiedOriginalWorkTitle(song?.origin)) {
    const normalized = normalizeOriginalTitleLanguage(song.origin)
    if (
      normalized.original_language === song.origin.original_language &&
      !needsDirectProductionTitleRefresh(song.origin, song)
    ) {
      return true
    }
  }
  const resolution = song?.source?.origin_resolution
  const age = Date.now() - Date.parse(resolution?.checked_at || 0)
  return Boolean(
    Number(resolution?.version || 0) >= SONG_ORIGIN_VERSION &&
    Number(resolution?.lookup_version || 0) >= SONG_ORIGIN_LOOKUP_VERSION &&
    resolution?.resolved === false &&
    age >= 0 &&
    age < UNRESOLVED_RETRY_MS
  )
}

export function needsSongOriginRefresh (song) {
  return (
    ORIGIN_SUPPORTED_SERVICES.has(song?.source?.service) &&
    !hasCurrentSongOriginResolution(song)
  )
}

export async function refreshMissingSongOrigins ({
  root,
  records = null,
  resolver = new SongOriginResolver({ root, timeoutMs: 3000 }),
  onProgress = () => {},
}) {
  const songs = records || (await scanSongLibrary(root)).records
  const candidates = songs.filter(needsSongOriginRefresh)
  const result = {
    inspected: 0,
    refreshed: 0,
    unresolved: 0,
    hidden: 0,
    failed: 0,
  }

  for (const song of candidates) {
    result.inspected++
    onProgress({
      ...result,
      total: candidates.length,
      title: song.title || '',
    })
    try {
      const metadata = {
        ...song,
        album: song.source?.cover?.album || '',
        albumMid: song.source?.cover?.album_mid || '',
        artistNames: String(song.artist || '')
          .split(/\s*(?:\/|&|、|,)\s*/u)
          .filter(Boolean),
      }
      const enriched = await inferSongOriginHint(metadata)
      const origin = await resolver.resolve(enriched, song.source?.cover)
      if (!origin) {
        if (resolver.lastLookupFailed) {
          result.failed++
          continue
        }
        const refreshed = await refreshPackedSongOrigin(song, null)
        const index = songs.indexOf(song)
        if (index >= 0) songs[index] = refreshed
        result.unresolved++
        result.hidden++
        continue
      }
      const refreshed = await refreshPackedSongOrigin(song, origin)
      const index = songs.indexOf(song)
      if (index >= 0) songs[index] = refreshed
      result.refreshed++
    } catch {
      result.failed++
    }
  }

  return result
}
