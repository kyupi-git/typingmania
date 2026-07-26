import { SONG_TITLE_CLEANUP_VERSION } from '../../src/song/song-title.js'
import { rewritePackedSongMetadata } from './packed-song-writer.js'

export async function refreshPackedSongTitle (existingSong, analysis) {
  return rewritePackedSongMetadata(existingSong, song => {
    const previousTitle = String(song.title || '')
    song.title = analysis.title
    if (!song.latin_title || song.latin_title === previousTitle) {
      song.latin_title = analysis.title
    }
    song.source = song.source || {}
    song.source.title_cleanup = {
      version: SONG_TITLE_CLEANUP_VERSION,
    }
    song.source.checks = {
      ...(song.source.checks || {}),
      title_original: true,
    }
    return true
  }, { operation: 'title' })
}
