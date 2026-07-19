import AnimePosterResolver, {
  POSTER_SELECTION_VERSION,
} from './anime-poster.js'
import {
  COVER_SELECTION_VERSION,
  refreshPackedSongPoster,
} from './cover-package.js'
import { scanSongLibrary } from './library.js'

const POSTER_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

function comparableTitle (value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]/gu, '')
}

export function needsPosterRefresh (
  song,
  {
    now = Date.now(),
    maxAgeMs = POSTER_MAX_AGE_MS,
  } = {},
) {
  if (
    song?.source?.service !== 'qqmusic' ||
    String(song?.origin?.catalog || '').toLocaleLowerCase() !== 'bangumi' ||
    !/^\d+$/u.test(String(song?.origin?.catalog_id || ''))
  ) {
    return false
  }
  const cover = song.source?.cover || {}
  if (Number(cover.version || 0) < COVER_SELECTION_VERSION) return true
  if (Number(cover.poster_version || 0) < POSTER_SELECTION_VERSION) return true
  if (
    cover.poster_available &&
    cover.poster_identity_verified !== true
  ) return true
  if (
    cover.poster_available &&
    comparableTitle(cover.poster_work_title) !==
      comparableTitle(song.origin.work_title)
  ) return true
  const age = now - Date.parse(cover.poster_checked_at || 0)
  return !Number.isFinite(age) || age < 0 || age >= maxAgeMs
}

function groupCandidates (songs) {
  const groups = new Map()
  for (const song of songs) {
    const key = String(song.origin.catalog_id)
    if (!groups.has(key)) {
      groups.set(key, {
        origin: song.origin,
        songs: [],
      })
    }
    groups.get(key).songs.push(song)
  }
  return [...groups.values()]
}

export async function refreshOutdatedAnimePosters ({
  root,
  records = null,
  resolver = null,
  force = false,
  concurrency = 1,
  onProgress = () => {},
} = {}) {
  const library = records || (await scanSongLibrary(root)).records
  const candidates = library.filter(song => (
    force
      ? (
          song?.source?.service === 'qqmusic' &&
          String(song?.origin?.catalog || '').toLocaleLowerCase() ===
            'bangumi' &&
          /^\d+$/u.test(String(song?.origin?.catalog_id || ''))
        )
      : needsPosterRefresh(song)
  ))
  const groups = groupCandidates(candidates)
  const posterResolver = resolver || new AnimePosterResolver()
  const result = {
    inspected: 0,
    worksInspected: 0,
    refreshed: 0,
    removed: 0,
    unavailable: 0,
    failed: 0,
    failures: [],
  }
  let nextGroup = 0

  async function worker () {
    while (true) {
      const groupIndex = nextGroup++
      if (groupIndex >= groups.length) return
      const group = groups[groupIndex]
      result.worksInspected++
      let resolution
      try {
        resolution = await posterResolver.resolve(group.origin)
      } catch (error) {
        resolution = {
          checked: false,
          poster: null,
          reason: 'resolver-error',
          error: error.message,
        }
      }
      for (const song of group.songs) {
        result.inspected++
        if (!resolution.checked) {
          result.unavailable++
        } else {
          try {
            const refreshed = await refreshPackedSongPoster(
              song,
              resolution,
            )
            const index = library.indexOf(song)
            if (index >= 0) library[index] = refreshed
            result.refreshed++
            if (!resolution.poster) result.removed++
          } catch (error) {
            result.failed++
            result.failures.push({
              title: song.title,
              file: song._local_filename,
              error: error.message,
            })
          }
        }
        onProgress({
          ...result,
          total: candidates.length,
          worksTotal: groups.length,
          songTitle: song.title,
          workTitle: group.origin.work_title,
        })
      }
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.max(1, Math.min(Number(concurrency) || 1, groups.length || 1)) },
      () => worker(),
    ),
  )
  return result
}
