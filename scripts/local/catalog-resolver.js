import {
  catalogIdentity,
  catalogMetadataConfidence,
  catalogTextSimilarity,
} from './catalog-identity.js'
import { matchQQMusicTrack } from './imported-song-enrichment.js'
import { searchItunesTrack } from './itunes-search-api.js'
import { searchKugouTrack } from './kugou-api.js'
import {
  fetchCoverArtArchive,
  searchMusicBrainzTrack,
} from './musicbrainz-api.js'
import {
  fetchNeteaseTrackDetail,
  fetchNeteaseCover,
  metadataFromNeteaseRecord,
  searchNeteaseTrack,
} from './netease-api.js'
import { fetchWithTimeout } from './network.js'
import OriginalArtistResolver, {
  looksLocalizedArtistName,
  normalizeArtistCredits,
} from './original-artist.js'
import {
  collectNetworkSources,
  inferNetworkRegion,
} from './network-source-planner.js'
import { fetchOfficialCover, validImage } from './qqmusic-api.js'

async function fetchUrlCover (url, strategy) {
  if (!/^https:\/\//iu.test(String(url || ''))) return null
  const response = await fetchWithTimeout(globalThis.fetch, url, {
    headers: { Accept: 'image/*' },
  }, 4200)
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
    strategy,
  }
}

export function mergeCatalogMetadata (local, remote = {}) {
  const measured = catalogMetadataConfidence(local, remote)
  const supplied = remote.catalogVerification
  const verification = supplied || {
    source: 'catalog',
    safe: measured.safe,
    confidence: measured.confidence,
    verifiedFields: measured.verifiedFields,
  }
  const identityAuthority = Boolean(
    verification.canonicalId ||
    verification.source === 'multi-source-consensus' ||
    /(?:exact|provider)/iu.test(String(verification.source || ''))
  )
  // A caller-supplied `safe` flag cannot turn a partial artist overlap into a
  // replacement. Exact provider IDs and independent consensus are the only
  // exceptions; ordinary fuzzy catalog rows retain the existing identity.
  const localLooksTranslated = looksLocalizedArtistName(local?.artist, {
    language: remote?.language || local?.language ||
      (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(String(remote?.artist || ''))
        ? 'JP' : ''),
  }) || (
    !/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(String(local?.artist || '')) &&
    /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(String(remote?.artist || '')) &&
    measured.titleSimilarity === 1
  )
  const localizedAliasRepair = localLooksTranslated &&
    remote?.artistResolution?.resolved === true
  const artistIdentitySafe = (measured.artistSimilarity >= 0.72 &&
    (measured.titleSimilarity >= 0.82 || identityAuthority)) ||
    localizedAliasRepair
  const safe = verification.safe !== false && (
    verification.safe === true ||
    verification.verifiedFields?.length > 0
  )
  const verified = new Set(
    safe ? verification.verifiedFields || [] : [],
  )
  if (!artistIdentitySafe && !identityAuthority) {
    verified.delete('artist')
    verified.delete('artistNames')
  }
  if (
    verified.has('title') &&
    !catalogTitleCorrectionAllowed(local, remote, verification)
  ) {
    verified.delete('title')
  }
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
    artistResolution: verified.has('artistNames') &&
      remote.artistResolution?.resolved === true
      ? remote.artistResolution
      : local.artistResolution || remote.artistResolution,
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

function catalogTitleCorrectionAllowed (local, remote, verification) {
  if (catalogIdentity(local?.title) === catalogIdentity(remote?.title)) return true
  if (verification?.source === 'multi-source-consensus') return true
  return Boolean(
    verification?.canonicalId ||
    verification?.canonicalAlias === true ||
    verification?.aliasEvidence === true,
  )
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

function corroborateCatalogMatch (primary, matches) {
  if (!primary?.metadata) return primary || null
  const corroboratedBy = []
  let strongestAgreement = 0
  for (const candidate of matches) {
    if (
      candidate === primary ||
      !candidate?.metadata ||
      candidate.service === primary.service
    ) continue
    const agreement = catalogMetadataConfidence(
      primary.metadata,
      candidate.metadata,
    )
    if (!agreement.safe || agreement.confidence < 0.86) continue
    corroboratedBy.push(candidate.service)
    strongestAgreement = Math.max(strongestAgreement, agreement.confidence)
  }
  if (!corroboratedBy.length) return primary
  const verification = primary.metadata.catalogVerification || {}
  return {
    ...primary,
    metadata: {
      ...primary.metadata,
      catalogVerification: {
        ...verification,
        source: verification.source || primary.service,
        safe: true,
        confidence: Math.max(
          Number(verification.confidence) || 0,
          strongestAgreement,
        ),
        corroboratedBy: [
          ...new Set([
            ...(verification.corroboratedBy || []),
            ...corroboratedBy,
          ]),
        ],
      },
    },
  }
}

export function trustedMetadata (remote, source, language = '') {
  const artistNames = Array.isArray(remote.artistNames) && remote.artistNames.length
    ? normalizeArtistCredits(remote.artistNames)
    : String(remote.artist || '').split(/\s*[;/]\s*/u).filter(Boolean)
  const artistsAreOriginal = artistNames.length > 0 && artistNames.every(name => (
    !looksLocalizedArtistName(name, {
      language: remote.language || language,
    })
  ))
  return {
    ...remote,
    catalogVerification: {
      source,
      safe: artistsAreOriginal,
      confidence: artistsAreOriginal ? 0.94 : 0.72,
      verifiedFields: [
        'title',
        ...(artistsAreOriginal ? ['artist', 'artistNames'] : []),
        'album',
        'duration',
        ...(remote.subtitle ? ['subtitle'] : []),
        ...(remote.albumPic ? ['albumPic'] : []),
      ],
    },
  }
}

export async function resolveImportedCatalogMatch ({
  root = '',
  metadata,
  provider,
  qqCookie = '',
  excludeServices = [],
}) {
  const excluded = new Set(
    (excludeServices || []).map(value => String(value)),
  )
  const region = inferNetworkRegion()
  const originalArtistResolver = root
    ? new OriginalArtistResolver({ root, cookie: qqCookie })
    : null
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
        let detail = await matchQQMusicTrack(metadata, { qqCookie })
        if (detail?.artists?.length && originalArtistResolver) {
          detail = await originalArtistResolver.resolveMetadata(detail)
        }
        const cover = detail?.albumMid
          ? await fetchOfficialCover(detail.albumMid, qqCookie).catch(() => null)
          : null
        return detail?.songMid
          ? {
              service: 'qqmusic',
              id: detail.songMid,
              cookie: qqCookie,
              metadata: trustedMetadata(
                detail,
                'qqmusic-catalog',
                metadata.language,
              ),
              cover: cover && {
                ...cover,
                albumMid: detail.albumMid,
                album: detail.album,
              },
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
        const cover = remote.albumPic
          ? await fetchNeteaseCover(remote.albumPic).catch(() => null)
          : null
        return {
          service: 'netease',
          id: String(matched.id),
          metadata: trustedMetadata(
            remote,
            'netease-catalog',
            metadata.language,
          ),
          cover: cover && {
            ...cover,
            albumMid: remote.albumId,
            album: remote.album,
          },
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
          }, 'kugou-catalog', metadata.language),
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
      run: async () => {
        const matched = await searchItunesTrack(metadata, {
          region,
          allowIdentityRepair: true,
        })
        if (!matched) return null
        const cover = matched.metadata?.albumPic
          ? await fetchUrlCover(
              matched.metadata.albumPic,
              'itunes-exact-release',
            ).catch(() => null)
          : null
        return { ...matched, cover }
      },
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
      run: async () => {
        const matched = await searchMusicBrainzTrack(metadata, {
          allowIdentityRepair: true,
        })
        if (!matched) return null
        const releaseId = matched.metadata?.musicBrainzReleaseId
        const cover = releaseId
          ? await fetchCoverArtArchive(releaseId).catch(() => null)
          : null
        return { ...matched, cover }
      },
    },
  ]
  const repairCandidates = []
  let resolved = []
  try {
    resolved = await collectNetworkSources(
      sources.filter(source => !excluded.has(source.service)),
      {
        region,
        maxAccepted: 2,
        maxAttempts: 5,
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
  const accepted = resolved.map(item => item.value).filter(Boolean)
  return corroborateCatalogMatch(accepted[0], accepted) ||
    consensusCatalogMatch([...accepted, ...repairCandidates]) ||
    null
}
