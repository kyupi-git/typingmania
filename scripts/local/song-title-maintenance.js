import { analyzeSongTitle } from '../../src/song/song-title.js'
import { scanSongLibrary } from './library.js'
import { refreshPackedSongTitle } from './song-title-package.js'

export function analyzeStoredSongTitle (song) {
  return analyzeSongTitle(song?.title, { language: song?.language })
}

export function needsSongTitleRefresh (song) {
  if (song?.source?.service !== 'qqmusic') return false
  const analysis = analyzeStoredSongTitle(song)
  const cleanup = song?.source?.title_cleanup || {}
  return Boolean(
    (analysis.title && analysis.title !== String(song.title || '')) ||
    Object.hasOwn(cleanup, 'raw_title') ||
    Object.hasOwn(cleanup, 'removed_aliases'),
  )
}

export async function refreshQQMusicSongTitles ({
  root,
  records = null,
  onProgress = () => {},
}) {
  const songs = records || (await scanSongLibrary(root)).records
  const candidates = songs.filter(needsSongTitleRefresh)
  const result = {
    inspected: 0,
    refreshed: 0,
    failed: 0,
  }

  for (const song of candidates) {
    result.inspected++
    const analysis = analyzeStoredSongTitle(song)
    onProgress({
      ...result,
      total: candidates.length,
      title: analysis.title,
    })
    try {
      const refreshed = await refreshPackedSongTitle(song, analysis)
      const index = songs.indexOf(song)
      if (index >= 0) songs[index] = refreshed
      result.refreshed++
    } catch {
      result.failed++
    }
  }

  return result
}
