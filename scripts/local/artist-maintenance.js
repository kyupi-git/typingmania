import { refreshPackedSongArtist } from './artist-package.js'
import { scanSongLibrary } from './library.js'
import OriginalArtistResolver, {
  looksLocalizedArtistName,
  isLikelyArtistName,
  needsOriginalNameDetail,
  normalizeArtistCredits,
  ORIGINAL_ARTIST_VERSION,
} from './original-artist.js'
import { fetchTrackMetadata } from './qqmusic-api.js'
import { catalogIdentitiesEquivalent } from './catalog-identity.js'
import {
  fetchNeteaseTrackDetail,
  metadataFromNeteaseRecord,
} from './netease-api.js'

const IMPORTED_SERVICES = new Set([
  'qqmusic',
  'netease',
  'apple-music',
  'local-files',
])

export function needsArtistRefresh (song) {
  const artist = String(song?.artist || '').trim()
  const visiblyPoisoned = Boolean(
    artist && (
      !isLikelyArtistName(artist) ||
      looksLocalizedArtistName(artist, { language: song?.language })
    ),
  )
  return (
    IMPORTED_SERVICES.has(song?.source?.service) &&
    (
      Number(song.source?.artist_resolution?.version || 0) <
        ORIGINAL_ARTIST_VERSION ||
      song.source?.artist_resolution?.resolved !== true ||
      visiblyPoisoned
    )
  )
}

function packagedArtistInputs (song) {
  const rows = (song?.source?.artist_resolution?.artists || [])
    .map(artist => ({
      id: Number(artist?.singer_id) || 0,
      mid: String(artist?.singer_mid || '').trim(),
      name: String(artist?.raw_name || '').trim(),
      language: song.language || '',
    }))
    .filter(artist => artist.name)
  if (rows.length) return rows
  const fallback = normalizeArtistCredits(
    Array.isArray(song?.rawArtistNames) && song.rawArtistNames.length
      ? song.rawArtistNames
      : song?.artist || '',
  )
  return fallback.map(name => ({
    id: 0,
    mid: '',
    name,
    language: song.language || '',
  }))
}

function hasExactProviderId (song) {
  const source = song?.source || {}
  return source.service === 'qqmusic'
    ? Boolean(String(source.song_mid || source.media_mid || '').trim())
    : source.service === 'netease' && /^\d+$/u.test(
      String(source.track_id || source.netease_track_id || '').trim(),
    )
}

export async function refreshImportedArtistNames ({
  root,
  records = null,
  resolver = null,
  refreshArtist = refreshPackedSongArtist,
  fetchQQMetadata = fetchTrackMetadata,
  fetchNetEaseMetadata = fetchNeteaseTrackDetail,
  onProgress = () => {},
} = {}) {
  const songs = records || (await scanSongLibrary(root)).records
  const candidates = songs
    .filter(needsArtistRefresh)
    .map(song => ({ song, artists: packagedArtistInputs(song) }))
    .filter(candidate => candidate.artists.length || hasExactProviderId(candidate.song))
    .sort((left, right) => {
      const priority = candidate => {
        const artist = String(candidate.song.artist || '').trim()
        return artist && (
          !isLikelyArtistName(artist) ||
          looksLocalizedArtistName(artist, { language: candidate.song.language })
        ) ? 0 : 1
      }
      return priority(left) - priority(right)
    })
  const result = {
    inspected: candidates.length,
    refreshed: 0,
    resolved: 0,
    unresolved: 0,
    failed: 0,
    failures: [],
  }
  if (!candidates.length) return result

  // Recover the provider's exact artist rows first. These IDs are already
  // bound to the package identity; fuzzy search is deliberately never used.
  const exactFailures = new Map()
  for (const candidate of candidates) {
    const { song } = candidate
    try {
      const source = song.source || {}
      let metadata = null
      if (source.service === 'qqmusic') {
        if ((exactFailures.get('qqmusic') || 0) >= 3) continue
        const id = String(source.song_mid || source.media_mid || '').trim()
        if (id) metadata = await fetchQQMetadata(id, '')
        if (metadata && id !== String(metadata.songMid || '') && id !== String(metadata.mediaMid || '')) {
          metadata = null
        }
      } else if (source.service === 'netease') {
        if ((exactFailures.get('netease') || 0) >= 3) continue
        const id = String(source.track_id || source.netease_track_id || '').trim()
        if (/^\d+$/u.test(id)) {
          const detail = await fetchNetEaseMetadata(id)
          if (detail && String(detail.id || '') === id) {
            metadata = metadataFromNeteaseRecord(detail, {
              title: song.title,
              language: song.language,
              duration: song.duration,
            })
          }
        }
      }
      if (!metadata || !Array.isArray(metadata.artists) && !Array.isArray(metadata.artistNames)) continue
      const titleMatches = !metadata.title || catalogIdentitiesEquivalent(metadata.title, song.title)
      const durationMatches = !metadata.duration || !song.duration || Math.abs(Number(metadata.duration) - Number(song.duration)) <= 4
      if (!titleMatches || !durationMatches) continue
      const exactArtists = metadata.artists || metadata.artistNames.map(name => ({ name }))
      if (exactArtists.length) candidate.artists = exactArtists.map(artist => ({
        id: Number(artist.id) || 0,
        mid: String(artist.mid || '').trim(),
        name: String(artist.name || '').trim(),
        language: song.language || '',
      })).filter(artist => isLikelyArtistName(artist.name))
      exactFailures.set(source.service, 0)
    } catch {
      // Keep the current raw/pending names and proceed to the bounded resolver.
      const service = song.source?.service
      exactFailures.set(service, (exactFailures.get(service) || 0) + 1)
    }
  }

  // Do not pass empty rows into resolver batching: an exact probe with no
  // plausible artist must remain unresolved and must not disturb offsets.
  const activeCandidates = candidates.filter(candidate => candidate.artists.length)
  result.unresolved += candidates.length - activeCandidates.length
  if (!activeCandidates.length) return result

  const artistResolver = resolver || new OriginalArtistResolver({ root, cookie: '' })
  let resolvedArtists
  try {
    const resolution = await artistResolver.resolve(
      activeCandidates.flatMap(candidate => candidate.artists),
    )
    resolvedArtists = resolution.artists || []
  } catch (error) {
    result.failed = activeCandidates.length
    result.unresolved += activeCandidates.length
    result.failures = activeCandidates.map(({ song }) => ({
      title: song.title,
      file: song._local_filename,
      error: error.message,
    }))
    for (const { song, artists } of activeCandidates) {
      const pendingArtists = artists.filter(artist => isLikelyArtistName(artist.name))
      if (pendingArtists.length !== artists.length) continue
      try {
        const refreshed = await refreshArtist(song, {
          version: ORIGINAL_ARTIST_VERSION,
          status: 'pending',
          resolved: false,
          artist: pendingArtists.map(artist => artist.name).join(' / '),
          artists: pendingArtists.map(artist => ({
            ...artist,
            rawName: artist.name,
            originalName: '',
            resolved: false,
            source: 'original-name-verification-pending',
          })),
          checkedAt: new Date().toISOString(),
        })
        const index = songs.indexOf(song)
        if (index >= 0) songs[index] = refreshed
        result.refreshed++
      } catch (writeError) {
        result.failures.push({ title: song.title, file: song._local_filename, error: writeError.message })
      }
    }
    return result
  }

  let offset = 0
  for (const { song, artists } of activeCandidates) {
    const resolved = resolvedArtists.slice(offset, offset + artists.length)
    offset += artists.length
    onProgress({
      ...result,
      total: candidates.length,
      songTitle: song.title,
      phase: 'artist',
    })
    if (
      resolved.length !== artists.length ||
      resolved.some(artist => !artist.resolved || !artist.originalName)
    ) {
      const pendingArtists = artists.map((input, index) => {
        const candidate = resolved[index] || {}
        const rawName = String(candidate.rawName || input.name || '').trim()
        return {
          ...candidate,
          rawName,
          originalName: '',
          resolved: false,
          source: candidate.source || 'original-name-verification-pending',
          confidence: Number(candidate.confidence) || 0,
        }
      }).filter(artist => isLikelyArtistName(artist.rawName))
      if (pendingArtists.length === artists.length) {
        try {
          const resolution = {
            version: ORIGINAL_ARTIST_VERSION,
            status: 'pending',
            artist: pendingArtists.map(artist => artist.rawName).join(' / '),
            artists: pendingArtists,
            resolved: false,
            checkedAt: new Date().toISOString(),
          }
          const refreshed = await refreshArtist(song, resolution)
          const index = songs.indexOf(song)
          if (index >= 0) songs[index] = refreshed
          result.refreshed++
        } catch (error) {
          result.failed++
          result.failures.push({
            title: song.title,
            file: song._local_filename,
            error: error.message,
          })
        }
      }
      result.unresolved++
      continue
    }
    try {
      const resolution = {
        version: ORIGINAL_ARTIST_VERSION,
        status: 'verified',
        artist: resolved.map(artist => artist.originalName).join(' / '),
        artists: resolved,
        resolved: true,
        checkedAt: new Date().toISOString(),
      }
      const refreshed = await refreshArtist(song, resolution)
      const index = songs.indexOf(song)
      if (index >= 0) songs[index] = refreshed
      result.refreshed++
      result.resolved++
    } catch (error) {
      result.failed++
      result.failures.push({
        title: song.title,
        file: song._local_filename,
        error: error.message,
      })
    }
  }
  return result
}

export function needsUnverifiedLocalizedArtistCleanup (song) {
  const artist = String(song?.artist || '').trim()
  const resolution = song?.source?.artist_resolution
  const trusted = Number(resolution?.version || 0) >= ORIGINAL_ARTIST_VERSION &&
    (resolution?.status === 'pending' || (
      resolution?.resolved === true &&
      Array.isArray(resolution.artists) &&
      resolution.artists.every(item => isLikelyArtistName(item?.originalName))
    ))
  const needsDetail = ['JP', 'U'].includes(String(song?.language || '').toUpperCase()) &&
    needsOriginalNameDetail({ name: artist, language: song?.language })
  return Boolean(
    IMPORTED_SERVICES.has(song?.source?.service) &&
    artist && !trusted &&
    (looksLocalizedArtistName(artist, { language: song.language }) ||
      !isLikelyArtistName(artist) || needsDetail),
  )
}

export async function hideUnverifiedLocalizedArtistNames ({
  root,
  records = null,
  refreshArtist = refreshPackedSongArtist,
  onProgress = () => {},
} = {}) {
  const songs = records || (await scanSongLibrary(root)).records
  const candidates = songs.filter(needsUnverifiedLocalizedArtistCleanup)
  const result = {
    inspected: 0,
    hidden: 0,
    failed: 0,
    failures: [],
  }
  for (const song of candidates) {
    result.inspected++
    try {
      const rawArtist = String(song.artist || '')
      const pending = isLikelyArtistName(rawArtist) ? rawArtist : ''
      const refreshed = await refreshArtist(song, {
        artist: pending,
        status: 'pending',
        resolved: false,
        checkedAt: new Date().toISOString(),
        artists: [{
          rawName: rawArtist,
          originalName: '',
          resolved: false,
          source: pending
            ? 'unverified-localized-alias-pending'
            : 'unverified-localized-alias-hidden',
          confidence: 0,
        }],
      })
      const index = songs.indexOf(song)
      if (index >= 0) songs[index] = refreshed
      result.hidden++
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
    })
  }
  return result
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
  const candidates = songs.filter(song => (
    song?.source?.service === 'qqmusic' && needsArtistRefresh(song)
  ))
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
