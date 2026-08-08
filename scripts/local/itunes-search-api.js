import { analyzeSongTitle } from '../../src/song/song-title.js'
import { catalogMetadataConfidence } from './catalog-identity.js'
import { fetchWithRetry } from './network.js'
import { inferNetworkRegion } from './network-source-planner.js'

const COUNTRY_BY_REGION = {
  cn: 'CN',
  hk: 'HK',
  tw: 'TW',
  jp: 'JP',
  kr: 'KR',
  sea: 'SG',
  us: 'US',
  eu: 'GB',
  global: 'US',
}

export function metadataFromItunesResult (result, fallback = {}) {
  const rawTitle = String(result?.trackName || '')
  const title = analyzeSongTitle(rawTitle, {
    language: fallback.language,
  }).title
  const artist = String(result?.artistName || '').trim()
  return {
    title,
    rawTitle,
    artist,
    artistNames: artist ? [artist] : [],
    album: String(result?.collectionName || '').trim(),
    duration: Number(result?.trackTimeMillis) / 1000 || 0,
    itunesTrackId: String(result?.trackId || ''),
    itunesCollectionId: String(result?.collectionId || ''),
    albumPic: String(result?.artworkUrl100 || '')
      .replace(/\/100x100(?:bb)?\./u, '/600x600bb.'),
  }
}

export async function searchItunesTrack (
  metadata,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = 3600,
    region = inferNetworkRegion(),
    allowIdentityRepair = false,
    titleOnly = false,
  } = {},
) {
  const title = String(metadata?.title || '').trim()
  const artist = String(
    metadata?.artistNames?.[0] || metadata?.artist || '',
  ).trim()
  if (!title) return null
  const url = new URL('https://itunes.apple.com/search')
  url.searchParams.set('term', titleOnly ? title : `${title} ${artist}`.trim())
  url.searchParams.set('media', 'music')
  url.searchParams.set('entity', 'song')
  url.searchParams.set('limit', '30')
  url.searchParams.set('country', COUNTRY_BY_REGION[region] || 'US')
  const response = await fetchWithRetry(fetchImpl, url, {
    headers: { Accept: 'application/json' },
  }, {
    attempts: 1,
    timeoutMs,
    perAttemptMs: timeoutMs,
  })
  if (!response.ok) throw new Error(`iTunes Search HTTP ${response.status}`)
  const payload = await response.json()
  const best = (payload.results || [])
    .map(result => {
      const candidate = metadataFromItunesResult(result, metadata)
      const verification = catalogMetadataConfidence(metadata, candidate)
      const repairCandidate = (
        verification.titleSimilarity >= 0.82 &&
        (
          verification.durationDelta === null ||
          verification.durationDelta <= 3.5
        )
      )
      return { candidate, verification, repairCandidate }
    })
    .filter(value => (
      value.verification.safe ||
      (allowIdentityRepair && value.repairCandidate)
    ))
    .sort((left, right) => (
      right.verification.confidence - left.verification.confidence
    ))[0]
  if (!best) {
    if (artist && !titleOnly) {
      return searchItunesTrack(metadata, {
        fetchImpl,
        timeoutMs,
        region,
        allowIdentityRepair,
        titleOnly: true,
      })
    }
    return null
  }
  return {
    service: 'itunes-search',
    id: best.candidate.itunesTrackId,
    metadata: {
      ...best.candidate,
      catalogVerification: {
        source: 'itunes-search',
        safe: best.verification.safe,
        repairCandidate: best.repairCandidate,
        confidence: best.verification.confidence,
        verifiedFields: best.verification.verifiedFields,
      },
    },
  }
}
