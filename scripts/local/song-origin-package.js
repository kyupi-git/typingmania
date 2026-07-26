import { SONG_ORIGIN_VERSION } from '../../src/song/song-origin.js'
import { rewritePackedSongMetadata } from './packed-song-writer.js'

export async function refreshPackedSongOrigin (existingSong, origin) {
  return rewritePackedSongMetadata(existingSong, song => {
    if (origin) song.origin = origin
    else delete song.origin
    song.source = song.source || {}
    song.source.origin_resolution = {
      version: SONG_ORIGIN_VERSION,
      resolved: Boolean(origin),
      checked_at: new Date().toISOString(),
    }
    song.source.checks = {
      ...(song.source.checks || {}),
      origin_original: Boolean(origin),
    }
    return true
  }, { operation: 'origin' })
}
