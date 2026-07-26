import {
  catalogMetadataConfidence,
  catalogTextSimilarity,
} from './catalog-identity.js'
import { matchQQMusicTrack } from './imported-song-enrichment.js'
import { searchItunesTrack } from './itunes-search-api.js'
import { searchKugouTrack } from './kugou-api.js'
import { searchMusicBrainzTrack } from './musicbrainz-api.js'
import {
  fetchNeteaseTrackDetail,
  metadataFromNeteaseRecord,
  searchNeteaseTrack,
} from './netease-api.js'
import {
  inferNetworkRegion,
  tryNetworkSources,
} from './network-source-planner.js'

export function mergeCatalogMetadata (local, remote = {}) {
  const measured = catalogMetadataConfidence(local, remote)
  const supplied = remote.catalogVerification
  const verification = supplied || {
    source: 'catalog',
    safe: measured.safe,
    confidence: measured.confidence,
    verifiedFields: measured.verifiedFields,
  }
  const safe = verification.safe !== false && (
    verification.safe === true ||
    verification.verifiedFields?.length > 0
  )
  const verified = new Set(
    safe ? verification.verifiedFields || [] : [],
  )
  if (safe) {
    if (remote.subtitle) verified.add('subtitle')
    if (remote.albumPic) verified.add('albumPic')
  }
  const preferRemote = (field, fallback = '') => (
    verified.has(field) && remote[field]
      ? remote[field]
      : local[field] || remote[field] || fallback
  )
  return {
    ...remote,
    ...local,
    title: preferRemote('title'),
    rawTitle: verified.has('title')
      ? remote.rawTitle || remote.title || local.rawTitle || local.title || ''
      : local.rawTitle || local.title || remote.rawTitle || remote.title || '',
    artist: preferRemote('artist'),
    artistNames: verified.has('artistNames') && remote.artistNames?.length
      ? remote.artistNames
      : local.artistNames?.length
        ? local.artistNames
        : remote.artistNames || [],
    album: preferRemote('album'),
    albumId: remote.albumId || local.albumId || '',
    albumMid: remote.albumMid || local.albumMid || '',
    albumPic: preferRemote('albumPic'),
    subtitle: preferRemote('subtitle'),
    language: local.language && local.language !== 'U'
      ? local.language
      : remote.language || 'U',
    // The decoded audio duration is more authoritative than any catalog.
    duration: local.duration || remote.duration || 0,
    catalogVerification: {
      ...verification,
      safe,
      verifiedFields: [...verified],
    },
  }
}

function consensusCatalogMatch (matches) {
  for (let leftIndex = 0; leftIndex < matches.length; leftIndex++) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < matches.length;
      rightIndex++
    ) {
      const left = matches[leftIndex]
      const right = matches[rightIndex]
      if (!left?.metadata || !right?.metadata) continue
      if (left.service === right.service) continue
      const agreement = catalogMetadataConfidence(
        left.metadata,
        right.metadata,
      )
      if (!agreement.safe || agreement.confidence < 0.9) continue
      const primary = left.service === 'musicbrainz' ? left : right
      const albumAgrees = catalogTextSimilarity(
        left.metadata.album,
        right.metadata.album,
      ) >= 0.82
      return {
        ...primary,
        metadata: {
          ...primary.metadata,
          catalogVerification: {
            source: 'multi-source-consensus',
            safe: true,
            confidence: agreement.confidence,
            corroboratedBy: [left.service, right.service],
            verifiedFields: [
              'title',
              'artist',
              'artistNames',
              'duration',
              ...(albumAgrees ? ['album'] : []),
            ],
          },
        },
      }
    }
  }
  return null
}

function trustedMetadata (remote, source) {
  return {
    ...remote,
    catalogVerification: {
      source,
      safe: true,
      confidence: 0.94,
      verifiedFields: [
        'title',
        'artist',
        'artistNames',
        'album',
        'duration',
        ...(remote.subtitle ? ['subtitle'] : []),
        ...(remote.albumPic ? ['albumPic'] : []),
      ],
    },
  }
}

export async function resolveImportedCatalogMatch ({
  metadata,
  provider,
  qqCookie = '',
  excludeServices = [],
}) {
  const excluded = new Set(
    (excludeServices || []).map(value => String(value)),
  )
  const region = inferNetworkRegion()
  const sources = [
    {
      id: 'qqmusic-catalog',
      service: 'qqmusic',
      priority: provider === 'qqmusic' ? 100 : 30,
      regionalPriority: {
        cn: 55,
        hk: 15,
        tw: 10,
        jp: -10,
        us: -15,
        global: 0,
      },
      run: async () => {
        const detail = await matchQQMusicTrack(metadata, { qqCookie })
        return detail?.songMid
          ? {
              service: 'qqmusic',
              id: detail.songMid,
              cookie: qqCookie,
              metadata: trustedMetadata(detail, 'qqmusic-catalog'),
            }
          : null
      },
    },
    {
      id: 'netease-catalog',
      service: 'netease',
      priority: provider === 'netease' ? 100 : 25,
      regionalPriority: {
        cn: 48,
        hk: 10,
        tw: 8,
        jp: -10,
        us: -15,
        global: 0,
      },
      run: async () => {
        const matched = await searchNeteaseTrack(metadata)
        if (!matched?.id) return null
        const detail = await fetchNeteaseTrackDetail(matched.id)
        const remote = detail
          ? metadataFromNeteaseRecord(detail, metadata)
          : metadata
        return {
          service: 'netease',
          id: String(matched.id),
          metadata: trustedMetadata(remote, 'netease-catalog'),
        }
      },
    },
    {
      id: 'kugou-catalog',
      service: 'kugou',
      priority: 20,
      regionalPriority: {
        cn: 38,
        hk: 5,
        tw: 3,
        jp: -15,
        us: -20,
        global: -5,
      },
      run: async () => {
        const track = await searchKugouTrack(metadata)
        if (!track?.hash) return null
        const artists = String(track.artist || '')
          .split(/\s*[,/&、;]\s*/u)
          .filter(Boolean)
        return {
          service: 'kugou',
          id: track.hash,
          metadata: trustedMetadata({
            title: track.title,
            rawTitle: track.title,
            artist: track.artist,
            artistNames: artists,
            album: track.album,
            duration: track.duration,
          }, 'kugou-catalog'),
        }
      },
    },
    {
      id: 'itunes-search-catalog',
      service: 'itunes-search',
      priority: 25,
      regionalPriority: {
        cn: 5,
        hk: 44,
        tw: 44,
        jp: 48,
        us: 46,
        global: 35,
      },
      run: () => searchItunesTrack(metadata, {
        region,
        allowIdentityRepair: true,
      }),
    },
    {
      id: 'musicbrainz-catalog',
      service: 'musicbrainz',
      priority: 25,
      regionalPriority: {
        cn: 0,
        hk: 36,
        tw: 36,
        jp: 42,
        us: 50,
        global: 45,
      },
      run: () => searchMusicBrainzTrack(metadata, {
        allowIdentityRepair: true,
      }),
    },
  ]
  const repairCandidates = []
  let resolved = null
  try {
    resolved = await tryNetworkSources(
      sources.filter(source => !excluded.has(source.service)),
      {
        region,
        accept: value => (
          value?.metadata?.catalogVerification?.safe === true
        ),
        onResult: (_source, value) => {
          if (value?.metadata?.catalogVerification?.repairCandidate) {
            repairCandidates.push(value)
          }
        },
      },
    )
  } catch {
    // A failed optional catalog route must not hide corroborated results from
    // other reachable sources.
  }
  return resolved?.value ||
    consensusCatalogMatch(repairCandidates) ||
    null
}
