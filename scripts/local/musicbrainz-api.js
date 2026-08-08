import { analyzeSongTitle } from '../../src/song/song-title.js'
import {
  catalogMetadataConfidence,
  catalogTextSimilarity,
} from './catalog-identity.js'
import { fetchWithRetry } from './network.js'
import { MUSICBRAINZ_API_ROUTES } from './network-route-catalog.js'
import {
  inferNetworkRegion,
  tryNetworkSources,
} from './network-source-planner.js'
import { validImage } from './qqmusic-api.js'

const CLIENT =
  'TypingManiaNovel/20260808 (https://github.com/kyupi-git/typingmania)'
let lastOfficialRequestAt = 0

async function respectOfficialRateLimit (fetchImpl) {
  if (fetchImpl !== globalThis.fetch) return
  const wait = Math.max(0, 1050 - (Date.now() - lastOfficialRequestAt))
  if (wait) await new Promise(resolve => setTimeout(resolve, wait))
  lastOfficialRequestAt = Date.now()
}

function artistCredit (recording) {
  const credits = recording?.['artist-credit'] || []
  const names = credits
    .map(credit => String(credit?.name || credit?.artist?.name || '').trim())
    .filter(Boolean)
  return {
    artist: credits.map(credit => (
      `${credit?.name || credit?.artist?.name || ''}${credit?.joinphrase || ''}`
    )).join('').trim(),
    artistNames: names,
  }
}

function bestRelease (recording, expectedAlbum) {
  const releases = recording?.releases || []
  return [...releases].sort((left, right) => {
    const leftAlbum = catalogTextSimilarity(left?.title, expectedAlbum)
    const rightAlbum = catalogTextSimilarity(right?.title, expectedAlbum)
    const leftOfficial = left?.status === 'Official' ? 1 : 0
    const rightOfficial = right?.status === 'Official' ? 1 : 0
    return rightAlbum - leftAlbum || rightOfficial - leftOfficial
  })[0] || null
}

export function metadataFromMusicBrainzRecording (recording, fallback = {}) {
  const title = analyzeSongTitle(recording?.title || '', {
    language: fallback.language,
  }).title
  const artists = artistCredit(recording)
  const release = bestRelease(recording, fallback.album)
  return {
    title,
    rawTitle: String(recording?.title || title),
    artist: artists.artist,
    artistNames: artists.artistNames,
    album: String(release?.title || ''),
    duration: Number(recording?.length) / 1000 || 0,
    musicBrainzRecordingId: String(recording?.id || ''),
    musicBrainzReleaseId: String(release?.id || ''),
    musicBrainzReleaseGroupId: String(release?.['release-group']?.id || ''),
  }
}

async function searchRoute (origin, query, fetchImpl, timeoutMs) {
  const url = new URL('/ws/2/recording', origin)
  url.searchParams.set('query', query)
  url.searchParams.set('dismax', 'true')
  url.searchParams.set('limit', '20')
  url.searchParams.set('fmt', 'json')
  await respectOfficialRateLimit(fetchImpl)
  const response = await fetchWithRetry(fetchImpl, url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': CLIENT,
    },
  }, {
    attempts: 1,
    timeoutMs,
    perAttemptMs: timeoutMs,
  })
  if (!response.ok) {
    throw new Error(`MusicBrainz HTTP ${response.status}`)
  }
  return response.json()
}

export async function searchMusicBrainzTrack (
  metadata,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = 4200,
    allowIdentityRepair = false,
    titleOnly = false,
  } = {},
) {
  const title = String(metadata?.title || '').trim()
  const artist = String(
    metadata?.artistNames?.[0] || metadata?.artist || '',
  ).trim()
  if (!title) return null
  const resolved = await tryNetworkSources(
    MUSICBRAINZ_API_ROUTES.map(route => ({
      ...route,
      category: 'music',
      run: () => searchRoute(
        route.baseUrl,
        titleOnly ? title : `${title} ${artist}`.trim(),
        fetchImpl,
        timeoutMs,
      ),
    })),
    {
      accept: value => Boolean(value),
      region: inferNetworkRegion(),
    },
  )
  const candidates = (resolved?.value?.recordings || [])
    .map(recording => {
      const candidate = metadataFromMusicBrainzRecording(
        recording,
        metadata,
      )
      const verification = catalogMetadataConfidence(metadata, candidate)
      const repairCandidate = (
        verification.titleSimilarity >= 0.82 &&
        (
          verification.durationDelta === null ||
          verification.durationDelta <= 3.5
        )
      )
      return {
        recording,
        candidate,
        verification,
        repairCandidate,
        score: verification.confidence * 100 +
          Math.min(100, Number(recording.score) || 0) * 0.08,
      }
    })
    .filter(value => (
      value.verification.safe ||
      (allowIdentityRepair && value.repairCandidate)
    ))
    .sort((left, right) => right.score - left.score)
  const best = candidates[0]
  if (!best) {
    if (artist && !titleOnly) {
      return searchMusicBrainzTrack(metadata, {
        fetchImpl,
        timeoutMs,
        allowIdentityRepair,
        titleOnly: true,
      })
    }
    return null
  }
  return {
    service: 'musicbrainz',
    id: best.candidate.musicBrainzRecordingId,
    metadata: {
      ...best.candidate,
      catalogVerification: {
        source: 'musicbrainz',
        safe: best.verification.safe,
        repairCandidate: best.repairCandidate,
        confidence: best.verification.confidence,
        verifiedFields: best.verification.verifiedFields,
      },
    },
  }
}

export async function fetchCoverArtArchive (
  releaseId,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = 4200,
  } = {},
) {
  if (!/^[0-9a-f-]{36}$/iu.test(String(releaseId || ''))) return null
  const url =
    `https://coverartarchive.org/release/${encodeURIComponent(releaseId)}/front-500`
  const response = await fetchWithRetry(fetchImpl, url, {
    headers: {
      Accept: 'image/*',
      'User-Agent': CLIENT,
    },
  }, {
    attempts: 1,
    timeoutMs,
    perAttemptMs: timeoutMs,
  })
  if (!response.ok) return null
  const buffer = Buffer.from(await response.arrayBuffer())
  if (!validImage(buffer)) return null
  const contentType = response.headers.get('content-type') || ''
  return {
    buffer,
    extension: contentType.includes('png')
      ? '.png'
      : contentType.includes('webp')
        ? '.webp'
        : '.jpg',
    verifiedOnline: true,
    strategy: 'cover-art-archive',
  }
}
