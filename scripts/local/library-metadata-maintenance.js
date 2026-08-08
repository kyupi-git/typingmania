import MediaPosterResolver from './media-poster.js'
import { catalogMetadataConfidence } from './catalog-identity.js'
import { refreshPackedSongCatalogMetadata } from './catalog-metadata-package.js'
import {
  refreshPackedSongCover,
  refreshPackedSongPoster,
} from './cover-package.js'
import { enrichImportedSong } from './imported-song-enrichment.js'
import {
  mergeCatalogMetadata,
  resolveImportedCatalogMatch,
} from './catalog-resolver.js'
import { retainVerifiableArtistNames } from './imported-artist.js'
import {
  looksLocalizedArtistName,
  needsOriginalNameDetail,
} from './original-artist.js'
import { scanSongLibrary } from './library.js'
import {
  fetchNeteaseCover,
  fetchNeteaseTrackDetail,
  metadataFromNeteaseRecord,
} from './netease-api.js'
import {
  fetchOfficialCover,
  fetchTrackMetadata,
} from './qqmusic-api.js'
import { refreshPackedSongOrigin } from './song-origin-package.js'
import { lyricLanguage } from './pronunciation.js'
import { readPackedSongText } from './packed-song-reader.js'
import { hasVerifiedOriginalWorkTitle } from '../../src/song/song-origin.js'

const SUPPORTED_SERVICES = new Set([
  'qqmusic',
  'netease',
  'apple-music',
  'local-files',
])

function abortError (signal) {
  if (signal?.reason instanceof Error) return signal.reason
  const error = new Error('Song metadata update cancelled')
  error.name = 'AbortError'
  return error
}

function isAbortError (error) {
  return error?.name === 'AbortError'
}

export function abortableMetadataStage (promise, signal) {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(abortError(signal))
  return new Promise((resolve, reject) => {
    const abort = () => {
      cleanup()
      reject(abortError(signal))
    }
    const cleanup = () => signal.removeEventListener('abort', abort)
    signal.addEventListener('abort', abort, { once: true })
    Promise.resolve(promise).then(
      value => {
        cleanup()
        resolve(value)
      },
      error => {
        cleanup()
        reject(error)
      },
    )
  })
}

function metadataFromSong (song) {
  const artistNames = String(song.artist || '')
    .split(/\s*(?:\/|&|、|,)\s*/u)
    .map(value => value.trim())
    .filter(Boolean)
  return {
    title: song.title,
    rawTitle: song.title,
    subtitle: song.subtitle || '',
    artist: song.artist,
    artistNames,
    album: song.source?.cover?.album || '',
    albumMid: song.source?.cover?.album_mid || '',
    duration: Number(song.duration) || 0,
    language: song.language || 'U',
  }
}

function verifiedOrigin (origin) {
  return hasVerifiedOriginalWorkTitle(origin)
}

export function exactCatalogMetadata (fallback, remote, source) {
  const verification = catalogMetadataConfidence(fallback, remote)
  const directIdentity = (
    verification.titleSimilarity >= 0.95 &&
    (
      verification.durationDelta === null ||
      verification.durationDelta <= 3
    )
  )
  const missingIdentityRecovery = Boolean(
    (!String(fallback.title || '').trim() || !String(fallback.artist || '').trim()) &&
    String(remote.title || '').trim() &&
    String(remote.artist || '').trim() &&
    (
      verification.durationDelta === null ||
      verification.durationDelta <= 3
    ),
  )
  if (!verification.safe && !directIdentity && !missingIdentityRecovery) {
    throw new Error(`The ${source} track ID no longer matches this song`)
  }
  const artistNames = Array.isArray(remote.artistNames) && remote.artistNames.length
    ? remote.artistNames
    : String(remote.artist || '').split(/\s*(?:\/|&|、|,|;)\s*/u).filter(Boolean)
  const artistIsOriginal = artistNames.length > 0 && artistNames.every(name => (
    !looksLocalizedArtistName(name, {
      language: remote.language || fallback.language,
    }) && !needsOriginalNameDetail({
      name,
      language: remote.language || fallback.language,
    })
  ))
  return {
    ...remote,
    catalogVerification: {
      source,
      safe: true,
      confidence: Math.max(0.94, verification.confidence),
      verifiedFields: [
        ...(verification.verifiedFields || []).filter(field => (
          artistIsOriginal || !['artist', 'artistNames'].includes(field)
        )),
        ...(directIdentity || missingIdentityRecovery
          ? [
              'title',
              ...(artistIsOriginal ? ['artist', 'artistNames'] : []),
              'album',
              'duration',
            ]
          : []),
        ...(remote.subtitle ? ['subtitle'] : []),
      ],
    },
  }
}

async function detectedPackedLyricLanguage (song) {
  try {
    const lyrics = await readPackedSongText(
      song._local_filename,
      'lyrics.csv',
    )
    return ({
      zh: 'ZH',
      ja: 'JP',
      en: 'EN',
    })[lyricLanguage('U', lyrics)] || 'U'
  } catch {
    return 'U'
  }
}

function normalizedOriginTitle (value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]/gu, '')
}

export function originIsImplausibleForSong (origin, song) {
  return Boolean(
    origin &&
    ['qqmusic', 'netease', 'apple-music'].includes(
      String(origin.catalog || '').toLocaleLowerCase(),
    ) &&
    origin.title_source === 'soundtrack-album' &&
    normalizedOriginTitle(origin.work_title) &&
    normalizedOriginTitle(origin.work_title) ===
      normalizedOriginTitle(song?.title),
  )
}

export function canSafelyApplyOrigin (existing, candidate) {
  if (!verifiedOrigin(candidate)) return false
  if (!existing) return true
  if (
    String(existing.catalog || '').toLocaleLowerCase() ===
      String(candidate.catalog || '').toLocaleLowerCase() &&
    String(existing.catalog_id || '') === String(candidate.catalog_id || '')
  ) return true

  const providerCatalogs = new Set(['qqmusic', 'netease', 'apple-music'])
  const specialistCatalogs = new Set([
    'anilist', 'bangumi', 'steam', 'tmdb', 'tvmaze', 'vndb', 'wikidata',
  ])
  const sameStructure = ['medium', 'role', 'season', 'sequence'].every(field => (
    !existing[field] ||
    !candidate[field] ||
    String(existing[field]) === String(candidate[field])
  ))
  const matchingTitle = Boolean(
    normalizedOriginTitle(existing.work_title) &&
    normalizedOriginTitle(existing.work_title) ===
      normalizedOriginTitle(candidate.work_title),
  )
  const corroborated = new Set(
    (candidate.corroborated_by || []).map(value => String(value)),
  ).size >= 2
  const stronglyCorroborated = (
    Number(candidate.confidence || 0) >= 0.85 && corroborated
  )
  return Boolean(
    providerCatalogs.has(String(existing.catalog || '').toLocaleLowerCase()) &&
    specialistCatalogs.has(String(candidate.catalog || '').toLocaleLowerCase()) &&
    candidate.title_source === 'catalog-primary' &&
    sameStructure &&
    (matchingTitle || stronglyCorroborated)
  )
}

function sameOriginIdentity (left, right) {
  return Boolean(
    left &&
    right &&
    String(left.catalog || '').toLocaleLowerCase() ===
      String(right.catalog || '').toLocaleLowerCase() &&
    String(left.catalog_id || '') === String(right.catalog_id || ''),
  )
}

async function exactProviderMetadata (song) {
  const fallback = metadataFromSong(song)
  if (song.source?.service === 'qqmusic') {
    const id = String(song.source.song_mid || song.source.track_id || '')
    if (!id) return { metadata: fallback, cover: null }
    const metadata = exactCatalogMetadata(
      fallback,
      await fetchTrackMetadata(id, ''),
      'qqmusic-exact-track',
    )
    const cover = metadata.albumMid
      ? await fetchOfficialCover(metadata.albumMid, '').catch(() => null)
      : null
    return {
      metadata,
      cover: cover && {
        ...cover,
        strategy: 'qqmusic-exact-track-refresh',
        albumMid: metadata.albumMid,
        album: metadata.album,
      },
    }
  }
  if (song.source?.service === 'netease') {
    const id = String(song.source.track_id || song.source.netease_track_id || '')
    if (!/^\d+$/u.test(id)) return { metadata: fallback, cover: null }
    const detail = await fetchNeteaseTrackDetail(id)
    if (!detail) throw new Error('NetEase track metadata is unavailable')
    const metadata = exactCatalogMetadata(
      fallback,
      metadataFromNeteaseRecord(detail, fallback),
      'netease-exact-track',
    )
    const cover = metadata.albumPic
      ? await fetchNeteaseCover(metadata.albumPic).catch(() => null)
      : null
    return {
      metadata,
      cover: cover && {
        ...cover,
        albumMid: metadata.albumId,
        album: metadata.album,
      },
    }
  }
  return { metadata: fallback, cover: null }
}

export async function refreshImportedLibraryMetadata ({
  root,
  records = null,
  onProgress = () => {},
  posterResolver = new MediaPosterResolver(),
  shouldCancel = () => false,
  signal = null,
  providerMetadataResolver = exactProviderMetadata,
  catalogResolver = resolveImportedCatalogMatch,
  songEnricher = enrichImportedSong,
} = {}) {
  const library = records || (await scanSongLibrary(root)).records
  const candidates = library.filter(song => (
    SUPPORTED_SERVICES.has(song.source?.service) && song._local_filename
  ))
  const result = {
    inspected: 0,
    updated: 0,
    origins: 0,
    posters: 0,
    covers: 0,
    metadata: 0,
    preserved: 0,
    failed: 0,
    cancelled: false,
    networkInterrupted: false,
    networkDegraded: false,
    failures: [],
  }
  const cancellationRequested = () => (
    signal?.aborted === true || shouldCancel()
  )
  const checkpoint = () => {
    if (cancellationRequested()) throw abortError(signal)
  }

  for (const originalSong of candidates) {
    if (cancellationRequested()) {
      result.cancelled = true
      break
    }
    result.inspected++
    let song = originalSong
    try {
      checkpoint()
      let provider
      try {
        provider = await abortableMetadataStage(
          Promise.resolve().then(() => providerMetadataResolver(song)),
          signal,
        )
      } catch (error) {
        if (isAbortError(error) || cancellationRequested()) throw error
        // A provider API may be region-blocked even though independent
        // catalogs are reachable. Keep the package's verified local identity
        // and continue through every other route instead of dropping the song.
        provider = { metadata: metadataFromSong(song), cover: null }
        result.networkDegraded = true
      }
      checkpoint()
      let independent = null
      try {
        independent = await abortableMetadataStage(
          Promise.resolve().then(() => catalogResolver({
            root,
            metadata: provider.metadata,
            provider: song.source?.service || 'local-files',
            excludeServices: [song.source?.service],
          })),
          signal,
        )
      } catch (error) {
        if (isAbortError(error) || cancellationRequested()) throw error
      }
      let canonical = independent
        ? mergeCatalogMetadata(provider.metadata, independent.metadata)
        : provider.metadata
      const resolvedCover = provider.cover || independent?.cover || null
      const detectedLanguage = await detectedPackedLyricLanguage(song)
      if (detectedLanguage !== 'U') canonical.language = detectedLanguage
      canonical = retainVerifiableArtistNames(canonical)
      const previousIdentity = [
        song.title,
        song.artist,
        song.subtitle,
        song.language,
      ].join('\n')
      checkpoint()
      song = await refreshPackedSongCatalogMetadata(song, canonical)
      const currentIdentity = [
        song.title,
        song.artist,
        song.subtitle,
        song.language,
      ].join('\n')
      if (currentIdentity !== previousIdentity) result.metadata++
      checkpoint()
      const enrichment = await abortableMetadataStage(
        Promise.resolve().then(() => songEnricher({
          root,
          metadata: canonical,
          cover: resolvedCover || song.source?.cover || null,
          forceOriginRefresh: true,
        })),
        signal,
      )
      const candidateOrigin = enrichment.metadata.origin
      const applyOrigin = canSafelyApplyOrigin(song.origin, candidateOrigin)
      const discardExistingOrigin = Boolean(
        !applyOrigin && originIsImplausibleForSong(song.origin, song),
      )
      const finalOrigin = applyOrigin
        ? candidateOrigin
        : discardExistingOrigin
          ? null
          : song.origin
      let posterResolution = enrichment.posterResolution
      if (
        verifiedOrigin(finalOrigin) &&
        !sameOriginIdentity(candidateOrigin, finalOrigin)
      ) {
        try {
          posterResolution = await abortableMetadataStage(
            Promise.resolve().then(() => posterResolver.resolve(finalOrigin)),
            signal,
          )
        } catch (error) {
          if (isAbortError(error) || cancellationRequested()) throw error
          posterResolution = {
            checked: false,
            poster: null,
            reason: 'poster-network-unavailable',
          }
        }
      }
      const safePoster = Boolean(
        posterResolution?.poster?.identityVerified === true &&
        sameOriginIdentity(finalOrigin, {
          catalog: posterResolution.poster.catalog,
          catalog_id: posterResolution.poster.catalogId,
        }),
      )
      let changed = currentIdentity !== previousIdentity
      if (applyOrigin) {
        checkpoint()
        song = await refreshPackedSongOrigin(song, candidateOrigin)
        result.origins++
        changed = true
      } else if (discardExistingOrigin) {
        checkpoint()
        song = await refreshPackedSongOrigin(song, null)
        result.origins++
        changed = true
      } else if (candidateOrigin && !sameOriginIdentity(song.origin, candidateOrigin)) {
        result.preserved++
      }
      if (resolvedCover) {
        checkpoint()
        song = await refreshPackedSongCover(
          song,
          resolvedCover,
          safePoster
            ? posterResolution
            : discardExistingOrigin
              ? { checked: true, poster: null }
              : { checked: false, poster: null },
        )
        result.covers++
        if (safePoster) result.posters++
        changed = true
      } else if (safePoster) {
        checkpoint()
        song = await refreshPackedSongPoster(song, posterResolution)
        result.posters++
        changed = true
      } else if (discardExistingOrigin && song.poster) {
        checkpoint()
        song = await refreshPackedSongPoster(song, {
          checked: true,
          poster: null,
          reason: 'origin-invalid',
        })
        changed = true
      }
      const index = library.indexOf(originalSong)
      if (index >= 0) library[index] = song
      if (changed) result.updated++
      else result.preserved++

      if (enrichment.lookupFailed || posterResolution?.reason === 'poster-network-unavailable') {
        result.networkDegraded = true
      }
    } catch (error) {
      if (isAbortError(error) || cancellationRequested()) {
        result.cancelled = true
        break
      }
      result.failed++
      result.failures.push({
        title: song.title || '',
        reason: error.message,
      })
      result.failures = result.failures.slice(-5)
      result.networkDegraded = true
    }
    onProgress({
      ...result,
      total: candidates.length,
      songTitle: song.title || '',
    })
    if (cancellationRequested()) {
      result.cancelled = true
      break
    }
  }
  return { ...result, total: candidates.length }
}
