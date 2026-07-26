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
const MAX_CONSECUTIVE_LOOKUP_FAILURES = 3

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

function exactCatalogMetadata (fallback, remote, source) {
  const verification = catalogMetadataConfidence(fallback, remote)
  const directIdentity = (
    verification.titleSimilarity >= 0.95 &&
    (
      verification.durationDelta === null ||
      verification.durationDelta <= 3
    )
  )
  if (!verification.safe && !directIdentity) {
    throw new Error(`The ${source} track ID no longer matches this song`)
  }
  return {
    ...remote,
    catalogVerification: {
      source,
      safe: true,
      confidence: Math.max(0.94, verification.confidence),
      verifiedFields: [
        ...verification.verifiedFields,
        ...(directIdentity
          ? ['title', 'artist', 'artistNames', 'album', 'duration']
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

export function canSafelyApplyOrigin (existing, candidate) {
  if (!verifiedOrigin(candidate)) return false
  if (!existing) return true
  return (
    String(existing.catalog || '').toLocaleLowerCase() ===
      String(candidate.catalog || '').toLocaleLowerCase() &&
    String(existing.catalog_id || '') === String(candidate.catalog_id || '')
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
    failures: [],
  }
  let consecutiveLookupFailures = 0
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
      const provider = await abortableMetadataStage(
        Promise.resolve().then(() => providerMetadataResolver(song)),
        signal,
      )
      checkpoint()
      let independent = null
      try {
        independent = await abortableMetadataStage(
          Promise.resolve().then(() => catalogResolver({
            metadata: provider.metadata,
            provider: song.source?.service || 'local-files',
            excludeServices: [song.source?.service],
          })),
          signal,
        )
      } catch (error) {
        if (isAbortError(error) || cancellationRequested()) throw error
      }
      const canonical = independent
        ? mergeCatalogMetadata(provider.metadata, independent.metadata)
        : provider.metadata
      const detectedLanguage = await detectedPackedLyricLanguage(song)
      if (detectedLanguage !== 'U') canonical.language = detectedLanguage
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
          cover: provider.cover || song.source?.cover || null,
        })),
        signal,
      )
      const candidateOrigin = enrichment.metadata.origin
      const applyOrigin = canSafelyApplyOrigin(song.origin, candidateOrigin)
      const finalOrigin = applyOrigin ? candidateOrigin : song.origin
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
      } else if (candidateOrigin && !sameOriginIdentity(song.origin, candidateOrigin)) {
        result.preserved++
      }
      if (provider.cover) {
        checkpoint()
        song = await refreshPackedSongCover(
          song,
          provider.cover,
          safePoster
            ? posterResolution
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
      }
      const index = library.indexOf(originalSong)
      if (index >= 0) library[index] = song
      if (changed) result.updated++
      else result.preserved++

      if (enrichment.lookupFailed || posterResolution?.reason === 'poster-network-unavailable') {
        consecutiveLookupFailures++
      } else {
        consecutiveLookupFailures = 0
      }
      if (consecutiveLookupFailures >= MAX_CONSECUTIVE_LOOKUP_FAILURES) {
        result.networkInterrupted = true
        break
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
      consecutiveLookupFailures++
      if (consecutiveLookupFailures >= MAX_CONSECUTIVE_LOOKUP_FAILURES) {
        result.networkInterrupted = true
        break
      }
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
