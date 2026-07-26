import {
  fetchAniListWorkById,
  searchAniListWork,
} from './anilist-api.js'
import { catalogTextSimilarity } from './catalog-identity.js'
import { fetchWithRetry } from './network.js'

const API_ORIGIN = 'https://api.animethemes.moe'
const CLIENT =
  'TypingManiaNovel/20260726 (https://github.com/kyupi-git/typingmania)'

function compactIdentity (value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]/gu, '')
}

function desiredThemeType (role) {
  if (role === 'opening') return 'OP'
  if (role === 'ending') return 'ED'
  return ''
}

function safeVideoUrl (value) {
  try {
    const url = new URL(String(value || ''))
    return (
      url.protocol === 'https:' &&
      [
        'v.animethemes.moe',
        'animethemes.moe',
        'beta.animethemes.moe',
      ].includes(url.hostname)
    )
      ? url.href
      : ''
  } catch {
    return ''
  }
}

export function selectAnimeThemesProductionVideo (anime, origin = {}) {
  const expectedType = desiredThemeType(origin.role)
  const expectedSequence = Number(origin.sequence) || 0
  const ranked = []
  for (const theme of anime?.animethemes || []) {
    for (const entry of theme.animethemeentries || []) {
      if (entry.nsfw) continue
      for (const video of entry.videos || []) {
        const url = safeVideoUrl(video.link)
        if (!url || Number(video.size || 0) > 600 * 1024 * 1024) continue
        let score = 20
        if (expectedType && theme.type === expectedType) score += 90
        if (
          expectedSequence &&
          Number(theme.sequence || 1) === expectedSequence
        ) {
          score += 35
        }
        if (!entry.spoiler) score += 15
        if (video.nc) score += 12
        if (!video.subbed) score += 5
        score += Math.min(10, Number(video.resolution || 0) / 108)
        ranked.push({ theme, entry, video, url, score })
      }
    }
  }
  const best = ranked.sort((left, right) => right.score - left.score)[0]
  if (!best) return null
  return {
    source: 'animethemes',
    webpageUrl: best.url,
    title: `${anime.name || origin.work_title || ''} ${best.theme.slug || ''}`
      .trim(),
    uploader: 'AnimeThemes',
    artist: '',
    description: 'Verified production theme footage',
    duration: 0,
    productionId: String(anime.id || ''),
    themeId: String(best.theme.id || ''),
  }
}

async function aniListIdentity (origin, fetchImpl, timeoutMs) {
  if (
    String(origin?.catalog || '').toLocaleLowerCase() === 'anilist' &&
    /^\d+$/u.test(String(origin?.catalog_id || ''))
  ) {
    return String(origin.catalog_id)
  }
  const matched = await searchAniListWork({
    media: origin?.medium,
    workTitle: origin?.work_title,
  }, { fetchImpl, timeoutMs })
  return matched?.catalogId || ''
}

export async function fetchAnimeThemesProductionVideo (
  song,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = 6500,
  } = {},
) {
  const origin = song?.origin
  if (
    !origin?.original_verified ||
    !origin?.work_title ||
    !['tv', 'film'].includes(origin.medium)
  ) {
    return null
  }
  const externalId = await aniListIdentity(origin, fetchImpl, timeoutMs)
  if (!externalId) return null
  const url = new URL('/anime', API_ORIGIN)
  url.searchParams.set('filter[has]', 'resources')
  url.searchParams.set('filter[site]', 'AniList')
  url.searchParams.set('filter[external_id]', externalId)
  url.searchParams.set(
    'include',
    'animethemes.animethemeentries.videos,animethemes.song.artists',
  )
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
    throw new Error(`AnimeThemes HTTP ${response.status}`)
  }
  const payload = await response.json()
  return selectAnimeThemesProductionVideo(payload?.anime?.[0], origin)
}

function originRole (theme) {
  if (theme?.type === 'OP') return 'opening theme'
  if (theme?.type === 'ED') return 'ending theme'
  return 'theme song'
}

function originMedium (anime) {
  if (anime?.media_format === 'MOVIE') return 'anime film'
  if (['OVA', 'ONA'].includes(anime?.media_format)) {
    return `${anime.media_format} anime`
  }
  return 'TV anime'
}

function songSearchQueries (metadata) {
  const values = [
    metadata?.title,
    metadata?.album,
    ...(metadata?.originSearchHints || []),
  ].map(String).map(value => value.trim()).filter(Boolean)
  return [...new Set(values.filter(value => (
    /\p{Script=Latin}/u.test(value) &&
    !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(value)
  )))]
}

export function selectAnimeThemesSongOrigin (records, metadata, queries) {
  const candidates = (records || []).flatMap(record => {
    const titleConfidence = Math.max(
      0,
      ...(queries || []).map(query => (
        catalogTextSimilarity(query, record?.title)
      )),
    )
    if (titleConfidence < 0.84) return []
    return (record?.animethemes || []).map(theme => {
      const anime = theme?.anime
      if (!anime?.name) return null
      let score = titleConfidence * 100
      if (anime.media_format === 'TV') score += 35
      else if (anime.media_format === 'MOVIE') score += 28
      else if (['OVA', 'ONA'].includes(anime.media_format)) score += 14
      if (Number(theme.sequence) > 0) score += 8
      return { record, theme, anime, titleConfidence, score }
    }).filter(Boolean)
  }).sort((left, right) => right.score - left.score)
  const best = candidates[0]
  if (!best) return null
  const runnerUp = candidates.find(candidate => (
    candidate.anime.id !== best.anime.id &&
    compactIdentity(candidate.anime.name) !== compactIdentity(best.anime.name)
  ))
  if (runnerUp && best.score - runnerUp.score < 12) return null
  return {
    subtitle:
      `${originMedium(best.anime)} 「${best.anime.name}」 ` +
      `${originRole(best.theme)}${
        Number(best.theme.sequence) > 1 ? ` ${best.theme.sequence}` : ''
      }`,
    sourceHint: {
      service: 'animethemes',
      songId: Number(best.record.id) || null,
      animeId: Number(best.anime.id) || null,
      animeSlug: String(best.anime.slug || ''),
      themeId: Number(best.theme.id) || null,
    },
  }
}

export async function inferAnimeThemesOrigin (
  metadata,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = 6500,
  } = {},
) {
  const queries = songSearchQueries(metadata)
  if (!queries.length) return null
  const summaries = new Map()
  for (const query of queries.slice(0, 2)) {
    const url = new URL('/search', API_ORIGIN)
    url.searchParams.set('q', query)
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
    if (!response.ok) continue
    const payload = await response.json()
    for (const song of payload?.search?.songs || []) {
      const confidence = catalogTextSimilarity(query, song.title)
      if (song?.id && confidence >= 0.72) {
        const previous = summaries.get(String(song.id))
        if (!previous || confidence > previous.confidence) {
          summaries.set(String(song.id), { ...song, confidence })
        }
      }
    }
  }
  const details = []
  for (const summary of [...summaries.values()]
    .sort((left, right) => right.confidence - left.confidence)
    .slice(0, 4)) {
    const url = new URL(`/song/${encodeURIComponent(summary.id)}`, API_ORIGIN)
    url.searchParams.set('include', 'animethemes.anime,artists')
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
    if (!response.ok) continue
    const song = (await response.json())?.song
    if (song) details.push(song)
  }
  const selected = selectAnimeThemesSongOrigin(details, metadata, queries)
  if (!selected) return null
  const currentTitle = selected.subtitle.match(/「([^」]+)」/u)?.[1] || ''
  if (
    /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
      .test(currentTitle)
  ) {
    return selected
  }
  const slug = selected.sourceHint?.animeSlug
  if (!slug) return null
  const animeUrl = new URL(`/anime/${encodeURIComponent(slug)}`, API_ORIGIN)
  animeUrl.searchParams.set('include', 'resources')
  const animeResponse = await fetchWithRetry(fetchImpl, animeUrl, {
    headers: {
      Accept: 'application/json',
      'User-Agent': CLIENT,
    },
  }, {
    attempts: 1,
    timeoutMs,
    perAttemptMs: timeoutMs,
  })
  if (!animeResponse.ok) return null
  const anime = (await animeResponse.json())?.anime
  const aniListId = (anime?.resources || []).find(resource => (
    String(resource?.site || '').toLocaleLowerCase() === 'anilist' &&
    Number(resource?.external_id) > 0
  ))?.external_id
  const native = await fetchAniListWorkById(aniListId, {
    fetchImpl,
    timeoutMs,
  })
  if (!native?.title) return null
  return {
    ...selected,
    subtitle: selected.subtitle.replace(
      `「${currentTitle}」`,
      `「${native.title}」`,
    ),
    sourceHint: {
      ...selected.sourceHint,
      aniListId: Number(aniListId),
    },
  }
}
