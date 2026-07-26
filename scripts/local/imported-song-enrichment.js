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
      pattern: /^(.*?)(?:\s*[-–—:]\s*|\s*[\(（]\s*)?(?:original\s+(?:motion\s+picture|film)\s+soundtrack|电影原声(?:带)?|電影原聲(?:帶)?|映画(?:版)?\s*オリジナル[・\s]*サウンドトラック|オリジナル[・\s]*サウンドトラック)/iu,
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
      movie: '电影',
      documentary: '纪录片',
      variety: '综艺节目',
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

export async function matchQQMusicTrack (
  metadata,
  { qqCookie = '', searchQQ = searchQQMusicTracks, fetchQQ = fetchTrackMetadata } = {},
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
  let best = [...candidateMap.values()]
    .map(candidate => ({ candidate, score: qqCandidateScore(candidate, metadata) }))
    .filter(value => value.score >= 600)
    .sort((left, right) => right.score - left.score)[0]?.candidate
  if (!best && artist) {
    await collect(title)
    best = [...candidateMap.values()]
      .map(candidate => ({ candidate, score: qqCandidateScore(candidate, metadata) }))
      .filter(value => value.score >= 600)
      .sort((left, right) => right.score - left.score)[0]?.candidate
  }
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
  let detail = null
  try {
    detail = await matchQQMusicTrack(metadata, {
      qqCookie,
      searchQQ,
      fetchQQ,
    })
  } catch {}
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
  const inferredAlbumOrigin = inferScreenOriginFromAlbum({
    ...metadata,
    album: metadata.album || detail?.album || '',
  })
  if (inferredAlbumOrigin) return inferredAlbumOrigin
  // An exact song-title lookup is useful even when an imported provider did
  // not label the track as an anime song. This recovers songs whose single
  // album contains no work title (for example a standalone ending theme).
  const anisong = await inferAnisong(metadata).catch(() => null)
  const animeThemes = anisong
    ? null
    : await inferAnimeThemes(metadata).catch(() => null)
  return anisong || animeThemes
    ? { ...metadata, ...(anisong || animeThemes) }
    : metadata
}

export async function enrichImportedSong ({
  root,
  metadata,
  cover,
  qqCookie = '',
  onOrigin = () => {},
  originResolver = new SongOriginResolver({ root }),
  posterResolver = new MediaPosterResolver(),
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
      origin = await originResolver.resolve(enriched, cover)
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
        origin = await originResolver.resolve(exactMetadata, cover)
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
