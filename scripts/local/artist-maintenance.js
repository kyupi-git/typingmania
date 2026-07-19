import { refreshPackedSongArtist } from './artist-package.js'
import { scanSongLibrary } from './library.js'
import OriginalArtistResolver, {
  ORIGINAL_ARTIST_VERSION,
} from './original-artist.js'
import { fetchTrackMetadata } from './qqmusic-api.js'

export function needsArtistRefresh (song) {
  return (
    song?.source?.service === 'qqmusic' &&
    Number(song.source?.artist_resolution?.version || 0) <
      ORIGINAL_ARTIST_VERSION
  )
}

export async function refreshQQMusicArtistNames ({
  root,
  cookie,
  records = null,
  resolver = null,
  fetchMetadata = fetchTrackMetadata,
  onProgress = () => {},
} = {}) {
  const songs = records || (await scanSongLibrary(root)).records
  const candidates = songs.filter(needsArtistRefresh)
  const artistResolver = resolver || new OriginalArtistResolver({
    root,
    cookie,
  })
  const result = {
    inspected: 0,
    refreshed: 0,
    resolved: 0,
    hidden: 0,
    failed: 0,
    failures: [],
  }
  const metadataRows = []
  for (const song of candidates) {
    result.inspected++
    try {
      const metadata = await fetchMetadata(
        song.source?.media_mid || song.source?.song_mid,
        cookie,
      )
      metadataRows.push({ song, metadata })
    } catch (error) {
      result.failed++
      result.failures.push({
        title: song.title,
        file: song._local_filename,
        error: error.message,
      })
    }
    onProgress({
      ...result,
      total: candidates.length,
      songTitle: song.title,
      phase: 'metadata',
    })
  }

  // Resolve unique singer MIDs in domestic QQ Music batches. Per-song
  // resolution below then comes entirely from the local cache and does not
  // multiply network round trips.
  await artistResolver.resolve(
    metadataRows.flatMap(({ metadata }) => (
      (metadata.artists || []).map(artist => ({
        ...artist,
        language: metadata.language,
      }))
    )),
  )

  for (const { song, metadata } of metadataRows) {
    try {
      const resolvedMetadata = await artistResolver.resolveMetadata(metadata)
      const resolution = resolvedMetadata.artistResolution
      const refreshed = await refreshPackedSongArtist(song, resolution)
      const index = songs.indexOf(song)
      if (index >= 0) songs[index] = refreshed
      result.refreshed++
      if (resolution.resolved) result.resolved++
      if (!resolution.artist) result.hidden++
    } catch (error) {
      result.failed++
      result.failures.push({
        title: song.title,
        file: song._local_filename,
        error: error.message,
      })
    }
    onProgress({
      ...result,
      total: candidates.length,
      songTitle: song.title,
      phase: 'package',
    })
  }
  return result
}
