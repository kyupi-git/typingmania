import {
  catalogTextSimilarity,
} from './catalog-identity.js'
import {
  inferNetworkRegion,
  tryNetworkSources,
} from './network-source-planner.js'
import { fetchWithTimeout } from './network.js'
import { searchAniListWork } from './anilist-api.js'
import { searchWikidataWork } from './wikidata-api.js'

const CLIENT =
  'TypingManiaNovel/20260726 (https://github.com/kyupi-git/typingmania)'
const TMDB_LOCALE = {
  cn: 'zh-CN',
  hk: 'zh-HK',
  tw: 'zh-TW',
  jp: 'ja-JP',
  kr: 'ko-KR',
  sea: 'en-SG',
  us: 'en-US',
  eu: 'en-GB',
  global: 'en-US',
}

function languageCode (value) {
  const language = String(value || '').toLocaleLowerCase()
  if (/japanese|日本/u.test(language)) return 'ja'
  if (/chinese|中文/u.test(language)) return 'zh'
  if (/korean|한국|韓国|韩国/u.test(language)) return 'ko'
  if (/english|英語|英语/u.test(language)) return 'en'
  return language.slice(0, 2) || 'und'
}

async function fetchJson (url, fetchImpl, timeoutMs, options = {}) {
  const response = await fetchWithTimeout(fetchImpl, url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': CLIENT,
      ...(options.headers || {}),
    },
  }, timeoutMs)
  if (!response.ok) throw new Error(`Media catalog HTTP ${response.status}`)
  return response.json()
}

async function tvmazeAliases (showId, fetchImpl, timeoutMs) {
  if (!showId) return []
  try {
    const values = await fetchJson(
      `https://api.tvmaze.com/shows/${encodeURIComponent(showId)}/akas`,
      fetchImpl,
      Math.min(timeoutMs, 2200),
    )
    return Array.isArray(values)
      ? values.map(value => String(value?.name || '')).filter(Boolean)
      : []
  } catch {
    return []
  }
}

export async function searchTvmazeWork (
  parts,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = 3800,
  } = {},
) {
  if (
    !['television', 'documentary', 'variety'].includes(parts?.media) ||
    !parts.workTitle
  ) {
    return null
  }
  const query = encodeURIComponent(parts.workTitle)
  const values = await fetchJson(
    `https://api.tvmaze.com/search/shows?q=${query}`,
    fetchImpl,
    timeoutMs,
  )
  const candidates = []
  for (const result of (Array.isArray(values) ? values : []).slice(0, 5)) {
    const show = result?.show
    if (!show?.id || !show?.name) continue
    const aliases = await tvmazeAliases(show.id, fetchImpl, timeoutMs)
    const similarity = Math.max(
      catalogTextSimilarity(parts.workTitle, show.name),
      ...aliases.map(alias => catalogTextSimilarity(
        parts.workTitle,
        alias,
      )),
    )
    if (similarity < 0.82 || Number(result.score || 0) < 0.35) continue
    candidates.push({
      title: String(show.name),
      language: languageCode(show.language),
      catalog: 'tvmaze',
      catalogId: String(show.id),
      posterUrl: String(show.image?.original || show.image?.medium || ''),
      evidence: aliases.some(alias => (
        catalogTextSimilarity(parts.workTitle, alias) >= 0.82
      ))
        ? 'catalog-alias'
        : 'catalog-primary-title',
      confidence: Math.min(
        1,
        similarity * 0.8 + Number(result.score || 0) * 0.2,
      ),
    })
  }
  return candidates.sort(
    (left, right) => right.confidence - left.confidence,
  )[0] || null
}

export async function searchTmdbWork (
  parts,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = 3600,
    region = inferNetworkRegion(),
    token = process.env.TMDB_API_TOKEN || '',
  } = {},
) {
  if (!token || !parts?.workTitle) return null
  const kind = ['movie', 'documentary'].includes(parts.media)
    ? 'movie'
    : ['television', 'variety'].includes(parts.media)
      ? 'tv'
      : ''
  if (!kind) return null
  const url = new URL(`https://api.themoviedb.org/3/search/${kind}`)
  url.searchParams.set('query', parts.workTitle)
  url.searchParams.set('include_adult', 'false')
  url.searchParams.set('language', TMDB_LOCALE[region] || 'en-US')
  const payload = await fetchJson(url, fetchImpl, timeoutMs, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const candidates = (payload.results || [])
    .map(result => {
      const localized = String(result.title || result.name || '')
      const original = String(
        result.original_title || result.original_name || localized,
      )
      const similarity = Math.max(
        catalogTextSimilarity(parts.workTitle, localized),
        catalogTextSimilarity(parts.workTitle, original),
      )
      return {
        title: original,
        language: String(result.original_language || 'und'),
        catalog: 'tmdb',
        catalogId: String(result.id || ''),
        posterUrl: result.poster_path
          ? `https://image.tmdb.org/t/p/original${result.poster_path}`
          : '',
        evidence: similarity === catalogTextSimilarity(
          parts.workTitle,
          original,
        )
          ? 'catalog-primary-title'
          : 'catalog-localized-title',
        confidence: similarity,
      }
    })
    .filter(value => (
      value.catalogId &&
      value.title &&
      value.confidence >= 0.84
    ))
    .sort((left, right) => right.confidence - left.confidence)
  if (
    candidates[1] &&
    candidates[0].confidence - candidates[1].confidence < 0.04
  ) {
    return null
  }
  return candidates[0] || null
}

export async function resolveGeneralMediaWork (
  parts,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = 3800,
    region = inferNetworkRegion(),
    tmdbToken = process.env.TMDB_API_TOKEN || '',
  } = {},
) {
  const sources = [
    ...(['tv', 'film'].includes(parts?.media)
      ? [{
          id: 'anilist-media',
          priority: 34,
          regionalPriority: {
            cn: 22,
            hk: 42,
            tw: 42,
            jp: 48,
            us: 45,
            global: 42,
          },
          run: () => searchAniListWork(parts, {
            fetchImpl,
            timeoutMs,
          }),
        }]
      : []),
    ...(tmdbToken
      ? [{
          id: 'tmdb-media',
          priority: 35,
          regionalPriority: {
            cn: -5,
            hk: 35,
            tw: 35,
            jp: 35,
            us: 48,
            global: 42,
          },
          run: () => searchTmdbWork(parts, {
            fetchImpl,
            timeoutMs,
            region,
            token: tmdbToken,
          }),
        }]
      : []),
    ...(['television', 'documentary', 'variety'].includes(parts?.media)
      ? [{
          id: 'tvmaze-media',
          priority: 30,
          regionalPriority: {
            cn: -10,
            hk: 28,
            tw: 28,
            jp: 25,
            us: 48,
            global: 42,
          },
          run: () => searchTvmazeWork(parts, {
            fetchImpl,
            timeoutMs,
          }),
        }]
      : []),
    {
      id: 'wikidata-media',
      priority: 10,
      regionalPriority: {
        cn: 10,
        hk: 20,
        tw: 20,
        jp: 22,
        kr: 22,
        sea: 24,
        us: 24,
        eu: 28,
        global: 22,
      },
      run: () => searchWikidataWork(parts, {
        fetchImpl,
        timeoutMs,
        region,
      }),
    },
  ]
  if (!sources.length) return null
  const resolved = await tryNetworkSources(sources, { region })
  return resolved?.value || null
}
