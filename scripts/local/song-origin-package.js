import { SONG_ORIGIN_VERSION } from '../../src/song/song-origin.js'
import { rewritePackedSongMetadata } from './packed-song-writer.js'

// Independent from the public origin object schema. Bump this when the
// resolver's negative-result policy changes so old empty results are retried.
export const SONG_ORIGIN_LOOKUP_VERSION = 1

export async function refreshPackedSongOrigin (existingSong, origin) {
  const removeFiles = !origin && existingSong?.poster
    ? [existingSong.poster]
    : []
  return rewritePackedSongMetadata(existingSong, song => {
    if (origin) song.origin = origin
    else {
      delete song.origin
      delete song.poster
    }
    song.source = song.source || {}
    song.source.origin_resolution = {
      version: SONG_ORIGIN_VERSION,
      lookup_version: SONG_ORIGIN_LOOKUP_VERSION,
      resolved: Boolean(origin),
      checked_at: new Date().toISOString(),
    }
    song.source.checks = {
      ...(song.source.checks || {}),
      origin_original: Boolean(origin),
    }
    if (!origin && song.source?.cover) {
      for (const key of [
        'poster_version', 'poster_checked', 'poster_available',
        'poster_source', 'poster_catalog', 'poster_catalog_id',
        'poster_work_title', 'poster_identity_verified', 'poster_checked_at',
      ]) delete song.source.cover[key]
    }
    return true
  }, { operation: 'origin', removeFiles })
}
