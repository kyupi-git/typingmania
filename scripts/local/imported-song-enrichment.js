import MediaPosterResolver from './media-poster.js'
import { analyzeSongTitle } from '../../src/song/song-title.js'
import { parseSongOrigin } from '../../src/song/song-origin.js'
import { catalogIdentitiesEquivalent } from './catalog-identity.js'
import { inferAnisongOrigin } from './anisongdb-api.js'
import { inferAnimeThemesOrigin } from './animethemes-api.js'
import {
  fetchTrackMetadata,
  searchQQMusicTracks,
} from './qqmusic-api.js'
import SongOriginResolver from './song-origin-resolver.js'
import {
  collectNetworkSources,
  inferNetworkRegion,
} from './network-source-planner.js'

function normalize (value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]/gu, '')
}

function names (metadata) {
  return (metadata.artistNames?.length
    ? metadata.artistNames
    : [metadata.artist])
    .map(normalize)
    .filter(Boolean)
}

export function inferScreenOriginFromAlbum (metadata) {
  const album = String(metadata?.album || '').normalize('NFKC').trim()
  if (!album) return null
  const patterns = [
    {
      media: 'animation-film',
      pattern: /^(?:动画电影|動畫電影|动漫电影|動漫電影)\s*[《「『“"](.+?)[》」』”"]\s*(?:原声带|原聲帶|原声|原聲|OST|original\s+soundtrack)$/iu,
    },
    {
      media: 'movie',
      pattern: /^(?:电影|電影)\s*[《「『“"](.+?)[》」』”"]\s*(?:原声带|原聲帶|原声|原聲|OST|original\s+soundtrack)$/iu,
    },
    {
      media: 'animation-film',
      pattern: /^(?:アニメ映画|劇場版アニメ)\s*[『「“"](.+?)[』」”"]\s*(?:オリジナル[・\s]*サウンドトラック|サウンドトラック|OST)$/iu,
    },
    {
      media: 'movie',
      pattern: /^映画\s*[『「“"](.+?)[』」”"]\s*(?:オリジナル[・\s]*サウンドトラック|サウンドトラック|OST)$/iu,
    },
    {
      media: 'tv-anime',
      pattern: /^(.*?)(?:\s*[-–—:]\s*)?(?:TV\s*アニメ|テレビアニメ|anime\s+series)(?:\s+(?:original\s+)?(?:soundtrack|ost)|\s*オリジナル[・\s]*サウンドトラック)/iu,
    },
    {
      media: 'tv-anime',
      pattern: /^(?:TV\s*アニメ|テレビアニメ|anime\s+series)\s*[『「“"(（]?(.+?)[』」”" )）]?\s*(?:original\s+)?(?:soundtrack|ost|オリジナル[・\s]*サウンドトラック)$/iu,
    },
    {
      media: 'animation-film',
      pattern: /^(.*?)(?:\s*[-–—:]\s*)?(?:劇場版アニメ|anime\s+film|animated\s+film)(?:\s+(?:original\s+)?(?:soundtrack|ost)|\s*オリジナル[・\s]*サウンドトラック)/iu,
    },
    {
      media: 'animation-film',
      pattern: /^(?:劇場版アニメ|anime\s+film|animated\s+film)\s*[『「“"(（]?(.+?)[』」”" )）]?\s*(?:original\s+)?(?:soundtrack|ost|オリジナル[・\s]*サウンドトラック)$/iu,
    },
    {
      media: 'sports-event',
      pattern: /^(.*?)(?:\s*[-–—:]\s*|\s*[\(（]\s*)?(?:official\s+sports?\s+(?:event|broadcast)\s+(?:soundtrack|theme(?:s)?)|体育赛事(?:官方)?(?:原声(?:带)?|主题曲集)|體育賽事(?:官方)?(?:原聲(?:帶)?|主題曲集)|スポーツ(?:大会|中継)(?:公式)?(?:サウンドトラック|テーマ曲集))/iu,
    },
    {
      media: 'commercial',
      pattern: /^(.*?)(?:\s*[-–—:]\s*|\s*[\(（]\s*)?(?:original\s+(?:commercial|advertising)\s+soundtrack|广告片?原声(?:带)?|廣告片?原聲(?:帶)?|CM(?:版)?\s*オリジナル[・\s]*サウンドトラック)/iu,
    },
    {
      media: 'documentary',
      pattern: /^(.*?)(?:\s*[-–—:]\s*|\s*[\(（]\s*)?(?:original\s+documentary\s+soundtrack|纪录片原声(?:带)?|紀錄片原聲(?:帶)?|ドキュメンタリー(?:版)?\s*オリジナル[・\s]*サウンドトラック)/iu,
    },
    {
      media: 'variety',
      pattern: /^(.*?)(?:\s*[-–—:]\s*|\s*[\(（]\s*)?(?:original\s+variety\s+show\s+soundtrack|综艺(?:节目)?原声(?:带)?|綜藝(?:節目)?原聲(?:帶)?|バラエティ番組\s*オリジナル[・\s]*サウンドトラック)/iu,
    },
    {
      media: 'television',
      pattern: /^(.*?)(?:\s*[-–—:]\s*|\s*[\(（]\s*)?(?:original\s+(?:television|tv(?:\s+series)?)\s+soundtrack|电视(?:剧|连续剧)原声(?:带)?|電視(?:劇|連續劇)原聲(?:帶)?|テレビドラマ(?:版)?\s*オリジナル[・\s]*サウンドトラック)/iu,
    },
    {
      media: 'movie',
      pattern: /^(.*?)(?:\s*[-–—:]\s*|\s*[\(（]\s*)?(?:original\s+(?:motion\s+picture|film)\s+soundtrack|电影原声(?:带)?|電影原聲(?:帶)?|映画(?:版)?\s*オリジナル[・\s]*サウンドトラック)/iu,
    },
    {
      media: 'visual-novel',
      pattern: /^(.*?)(?:\s*[-–—:]\s*|\s*[\(（]\s*)?(?:visual\s+novel|galgame|ギャルゲー|ビジュアルノベル|视觉小说|視覺小說)(?:\s+original)?\s*(?:soundtrack|ost|原声(?:带)?|原聲(?:帶)?|サウンドトラック)/iu,
    },
    {
      media: 'jrpg',
      pattern: /^(.*?)(?:\s*[-–—:]\s*|\s*[\(（]\s*)?(?:jrpg|rpg)(?:\s+original)?\s*(?:soundtrack|ost|原声(?:带)?|原聲(?:帶)?|サウンドトラック)/iu,
    },
    {
      media: 'game',
      pattern: /^(.*?)(?:\s*[-–—:]\s*|\s*[\(（]\s*)?(?:video\s+game|电子游戏|電子遊戲|ゲーム)(?:\s+original)?\s*(?:soundtrack|ost|原声(?:带)?|原聲(?:帶)?|サウンドトラック)/iu,
    },
  ]
  for (const { media, pattern } of patterns) {
    const workTitle = album.match(pattern)?.[1]
      ?.replace(/[\s\-–—:\(\[（【]+$/gu, '')
      .replace(/^[「『“"'《【\s]+|[」』”"'》】\s]+$/gu, '')
      .trim()
    if (
      !workTitle ||
      workTitle.length < 2 ||
      normalize(workTitle) === normalize(metadata.title)
    ) {
      continue
    }
    const mediaLabel = {
      television: '电视剧',
      'tv-anime': 'TV动画',
      movie: '电影',
      'animation-film': '剧场版动画',
      documentary: '纪录片',
      commercial: '广告片',
      variety: '综艺节目',
      'sports-event': '体育赛事',
      'visual-novel': '视觉小说',
      jrpg: '日式角色扮演游戏',
      game: '游戏',
    }[media]
    return {
      ...metadata,
      subtitle: `${mediaLabel}《${workTitle}》原声带歌曲`,
      originHintSource: 'soundtrack-album-structure',
    }
  }
  return null
}

function qqCandidateScore (candidate, metadata) {
  const expectedTitle = normalize(analyzeSongTitle(metadata.title, {
    language: metadata.language,
  }).title)
  const actualTitle = normalize(analyzeSongTitle(candidate.title, {
    language: metadata.language,
  }).title)
  if (!expectedTitle || !actualTitle) return -Infinity
  let score = catalogIdentitiesEquivalent(expectedTitle, actualTitle) ? 600 : 0
  if (!score && Math.min(expectedTitle.length, actualTitle.length) >= 4 && (
    expectedTitle.includes(actualTitle) || actualTitle.includes(expectedTitle)
  )) score = 240
  if (!score) return -Infinity

  const expectedArtists = names(metadata)
  const actualArtists = (candidate.artistNames || [candidate.artist])
    .map(normalize)
    .filter(Boolean)
  const artistMatches = expectedArtists.some(expected => (
    actualArtists.some(actual => (
      catalogIdentitiesEquivalent(expected, actual) ||
      expected.includes(actual) ||
      actual.includes(expected)
    ))
  ))
  const delta = Math.abs(Number(metadata.duration) - Number(candidate.duration))
  if (metadata.duration && candidate.duration) {
    if (delta > 5) return -Infinity
    score += Math.max(0, 120 - delta * 24)
  }
  const cjkLocalizationMatch = (
    score >= 600 &&
    delta <= 1.5 &&
    expectedArtists.some(value => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value)) &&
    actualArtists.some(value => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value))
  )
  if (expectedArtists.length && !artistMatches && !cjkLocalizationMatch) {
    return -Infinity
  }
  if (artistMatches) score += 300
  else if (cjkLocalizationMatch) score += 180
  return score
}

export async function findQQMusicTrackCandidates (
  metadata,
  { qqCookie = '', searchQQ = searchQQMusicTracks } = {},
) {
  const title = String(metadata.title || '').trim()
  const artist = String(metadata.artistNames?.[0] || metadata.artist || '').trim()
  if (!title) return null
  const candidateMap = new Map()
  const collect = async query => {
    const values = await searchQQ(query, qqCookie, {
      limit: 12,
      timeoutMs: 4600,
    })
    for (const candidate of values) {
      if (candidate?.songMid) candidateMap.set(candidate.songMid, candidate)
    }
  }
  await collect(`${title} ${artist}`.trim())
  let ranked = [...candidateMap.values()]
    .map(candidate => ({ candidate, score: qqCandidateScore(candidate, metadata) }))
    .filter(value => value.score >= 600)
    .sort((left, right) => right.score - left.score)
  if (!ranked.length && artist) {
    await collect(title)
    ranked = [...candidateMap.values()]
      .map(candidate => ({ candidate, score: qqCandidateScore(candidate, metadata) }))
      .filter(value => value.score >= 600)
      .sort((left, right) => right.score - left.score)
  }
  return ranked.map(value => value.candidate)
}

export async function matchQQMusicTrack (
  metadata,
  { qqCookie = '', searchQQ = searchQQMusicTracks, fetchQQ = fetchTrackMetadata } = {},
) {
  const best = (await findQQMusicTrackCandidates(metadata, {
    qqCookie,
    searchQQ,
  }))[0]
  if (!best?.songMid) return null
  return fetchQQ(best.songMid, qqCookie)
}

export async function inferSongOriginHint (
  metadata,
  {
    qqCookie = '',
    searchQQ = searchQQMusicTracks,
    fetchQQ = fetchTrackMetadata,
    inferAnisong = inferAnisongOrigin,
    inferAnimeThemes = inferAnimeThemesOrigin,
  } = {},
) {
  if (parseSongOrigin(metadata.subtitle)) return metadata
  const region = inferNetworkRegion()
  const embeddedAlbumHint = inferScreenOriginFromAlbum(metadata)
  const sources = [
    ...(embeddedAlbumHint
      ? [{
          id: 'embedded-soundtrack-structure',
          name: 'Embedded soundtrack metadata',
          category: 'production',
          priority: 90,
          regionalPriority: {},
          run: async () => embeddedAlbumHint,
        }]
      : []),
    {
      id: 'qqmusic-origin-hint',
      name: 'QQ Music',
      category: 'production',
      priority: 30,
      regionalPriority: { cn: 65, hk: 35, tw: 15, jp: -8, global: -5 },
      run: async () => {
        const detail = await matchQQMusicTrack(metadata, {
          qqCookie,
          searchQQ,
          fetchQQ,
        })
        if (detail?.subtitle && parseSongOrigin(detail.subtitle)) {
          return {
            ...metadata,
            subtitle: detail.subtitle,
            albumMid: metadata.albumMid || detail.albumMid,
            sourceHint: {
              service: 'qqmusic-catalog',
              songMid: detail.songMid,
            },
          }
        }
        return inferScreenOriginFromAlbum({
          ...metadata,
          album: metadata.album || detail?.album || '',
        })
      },
    },
    {
      id: 'anisongdb-origin-hint',
      name: 'AniSongDB',
      category: 'production',
      priority: 34,
      regionalPriority: { jp: 55, us: 35, eu: 32, global: 25, cn: -20 },
      run: () => inferAnisong(metadata),
    },
    {
      id: 'animethemes-origin-hint',
      name: 'AnimeThemes',
      category: 'production',
      priority: 30,
      regionalPriority: { jp: 48, us: 34, eu: 30, global: 22, cn: -22 },
      run: () => inferAnimeThemes(metadata),
    },
  ]
  try {
    const resolved = await collectNetworkSources(sources, {
      region,
      maxAccepted: 2,
      maxAttempts: 3,
      accept: value => Boolean(value?.subtitle && parseSongOrigin(value.subtitle)),
    })
    const hints = resolved.map(item => item.value).filter(Boolean)
    if (!hints.length) return metadata
    const primary = hints[0]
    const primaryParts = parseSongOrigin(primary.subtitle)
    const corroboratedBy = hints.slice(1).filter(value => {
      const parts = parseSongOrigin(value.subtitle)
      return parts && primaryParts &&
        normalize(parts.workTitle) === normalize(primaryParts.workTitle) &&
        parts.media === primaryParts.media &&
        parts.role === primaryParts.role
    }).map(value => value.sourceHint?.service).filter(Boolean)
    return {
      // Origin services are allowed to contribute a production hint, not to
      // replace the canonical recording identity. Some specialist APIs return
      // only subtitle/sourceHint fields; spreading that partial object alone
      // used to erase a valid provider title and artist before packaging.
      ...metadata,
      subtitle: primary.subtitle,
      album: metadata.album || primary.album || '',
      albumMid: metadata.albumMid || primary.albumMid || '',
      originHintSource:
        primary.originHintSource || metadata.originHintSource || undefined,
      sourceHint: {
        ...(primary.sourceHint || {}),
        corroboratedBy,
      },
    }
  } catch {
    return metadata
  }
}

export async function enrichImportedSong ({
  root,
  metadata,
  cover,
  qqCookie = '',
  onOrigin = () => {},
  originResolver = new SongOriginResolver({ root }),
  posterResolver = new MediaPosterResolver(),
  forceOriginRefresh = false,
  inferAnisong = inferAnisongOrigin,
  inferAnimeThemes = inferAnimeThemesOrigin,
}) {
  let enriched = metadata
  let catalogLookupFailed = false
  let originLookupFailed = false
  try {
    enriched = await inferSongOriginHint(metadata, {
      qqCookie,
      inferAnisong,
      inferAnimeThemes,
    })
  } catch {
    catalogLookupFailed = true
    // Catalog enrichment is optional. Audio, lyrics, and pronunciation remain
    // usable when every metadata route is unavailable.
  }

  let origin = null
  if (parseSongOrigin(enriched.subtitle)) {
    onOrigin(enriched)
    try {
      origin = await originResolver.resolve(enriched, cover, {
        forceRefresh: forceOriginRefresh,
      })
    } catch {
      originLookupFailed = true
    }
  }
  // A provider subtitle can itself be a wrong or obsolete translation. If
  // catalog resolution cannot verify it, retry from the exact song identity
  // and let the resolver verify that direct production independently.
  if (!origin && parseSongOrigin(enriched.subtitle)) {
    const exact = await inferAnisong(metadata).catch(() => null) ||
      await inferAnimeThemes(metadata).catch(() => null)
    if (exact?.subtitle && parseSongOrigin(exact.subtitle)) {
      const exactMetadata = { ...metadata, ...exact }
      try {
        origin = await originResolver.resolve(exactMetadata, cover, {
          forceRefresh: forceOriginRefresh,
        })
        if (origin) enriched = exactMetadata
      } catch {
        originLookupFailed = true
      }
    }
  }
  const posterResolution = origin
    ? await posterResolver.resolve(origin).catch(() => ({
        checked: false,
        poster: null,
        reason: 'poster-network-unavailable',
      }))
    : { checked: true, poster: null, reason: 'origin-unresolved' }
  return {
    metadata: { ...enriched, origin: origin || undefined },
    posterResolution,
    lookupFailed: catalogLookupFailed || originLookupFailed ||
      posterResolution.reason === 'poster-network-unavailable',
  }
}
