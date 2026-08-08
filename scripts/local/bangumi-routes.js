import { fetchWithTimeout } from './network.js'
import {
  inferNetworkRegion,
  rankedNetworkSources,
  tryNetworkSources,
} from './network-source-planner.js'

const USER_AGENT =
  'TypingManiaNovel/20260808 (music metadata resolver)'

export const BANGUMI_API_ROUTES = Object.freeze([
  Object.freeze({
    id: 'bangumi-api',
    name: 'Bangumi API',
    baseUrl: 'https://api.bgm.tv',
    priority: 52,
    regionalPriority: { cn: 10, hk: 18, tw: 18, jp: 14, global: 10 },
  }),
  Object.freeze({
    id: 'bangumi-api-anibt',
    name: 'Bangumi API mirror (anibt.net)',
    baseUrl: 'https://bgmapi.anibt.net',
    priority: 47,
    regionalPriority: { cn: 12, hk: 5, tw: 4, jp: 0, global: -4 },
  }),
  Object.freeze({
    id: 'bangumi-api-lol',
    name: 'Bangumi API mirror (bangumi.lol)',
    baseUrl: 'https://api.bangumi.lol',
    priority: 44,
    regionalPriority: { cn: 10, hk: 4, tw: 4, jp: 0, global: -5 },
  }),
])

export const BANGUMI_WEBSITE_ROUTES = Object.freeze([
  Object.freeze({
    id: 'bangumi-web-bgm',
    name: 'Bangumi website (bgm.tv)',
    baseUrl: 'https://bgm.tv',
    priority: 34,
    regionalPriority: { cn: 8, hk: 16, tw: 16, jp: 12, global: 8 },
  }),
  Object.freeze({
    id: 'bangumi-web-bangumi',
    name: 'Bangumi website (bangumi.tv)',
    baseUrl: 'https://bangumi.tv',
    priority: 32,
    regionalPriority: { cn: 7, hk: 14, tw: 14, jp: 10, global: 7 },
  }),
  Object.freeze({
    id: 'bangumi-web-chii',
    name: 'Bangumi website (chii.in)',
    baseUrl: 'https://chii.in',
    priority: 30,
    regionalPriority: { cn: 6, hk: 12, tw: 12, jp: 8, global: 6 },
  }),
])

export const BANGUMI_IMAGE_ROUTES = Object.freeze([
  Object.freeze({
    id: 'bangumi-image-official',
    name: 'Bangumi image CDN',
    baseUrl: 'https://lain.bgm.tv',
    priority: 39,
    regionalPriority: { cn: 5, hk: 14, tw: 14, jp: 10, global: 6 },
  }),
  Object.freeze({
    id: 'bangumi-image-anibt',
    name: 'Bangumi image mirror (anibt.net)',
    baseUrl: 'https://bgmimg.anibt.net',
    priority: 37,
    regionalPriority: { cn: 14, hk: 6, tw: 5, jp: 0, global: -4 },
  }),
  Object.freeze({
    id: 'bangumi-image-lol',
    name: 'Bangumi image mirror (bangumi.lol)',
    baseUrl: 'https://lain.bangumi.lol',
    priority: 35,
    regionalPriority: { cn: 12, hk: 5, tw: 4, jp: 0, global: -5 },
  }),
])

function apiUrl (baseUrl, pathname) {
  return new URL(String(pathname || '/'), `${baseUrl}/`).toString()
}

/**
 * Request public Bangumi catalog data through the official API first, then
 * health-ranked community mirrors. No account cookies or authorization
 * headers are sent to mirror hosts.
 */
export async function fetchBangumiApiJson ({
  pathname,
  fetchImpl = globalThis.fetch,
  options = {},
  timeoutMs = 6000,
  accept = value => Boolean(value),
  region = inferNetworkRegion(),
} = {}) {
  const headers = {
    Accept: 'application/json',
    'User-Agent': USER_AGENT,
    ...(options.headers || {}),
  }
  const perRouteTimeoutMs = Math.max(
    800,
    Math.min(Number(timeoutMs) || 6000, region === 'cn' ? 3200 : 4000),
  )
  const sources = BANGUMI_API_ROUTES.map(route => ({
    ...route,
    category: 'production',
    run: async () => {
      const routeHeaders = { ...headers }
      if (route.id !== 'bangumi-api') {
        for (const key of Object.keys(routeHeaders)) {
          if (/^(?:authorization|cookie|proxy-authorization|x-api-key)$/iu.test(key)) {
            delete routeHeaders[key]
          }
        }
      }
      const response = await fetchWithTimeout(
        fetchImpl,
        apiUrl(route.baseUrl, pathname),
        {
          ...options,
          headers: routeHeaders,
        },
        perRouteTimeoutMs,
      )
      if (!response.ok) {
        throw new Error(`${route.name} HTTP ${response.status}`)
      }
      return response.json()
    },
  }))
  return tryNetworkSources(sources, { accept, region })
}

export async function fetchBangumiWebsite ({
  pathname,
  fetchImpl = globalThis.fetch,
  options = {},
  timeoutMs = 3600,
  region = inferNetworkRegion(),
} = {}) {
  const perRouteTimeoutMs = Math.max(
    700,
    Math.min(1400, Math.ceil((Number(timeoutMs) || 3600) / 3)),
  )
  const sources = BANGUMI_WEBSITE_ROUTES.map(route => ({
    ...route,
    category: 'production',
    run: async () => {
      const response = await fetchWithTimeout(
        fetchImpl,
        apiUrl(route.baseUrl, pathname),
        options,
        perRouteTimeoutMs,
      )
      if (!response.ok) {
        await response.body?.cancel?.().catch(() => {})
        throw new Error(`${route.name} HTTP ${response.status}`)
      }
      return response
    },
  }))
  return tryNetworkSources(sources, {
    accept: response => Boolean(response?.ok),
    region,
  })
}

function addCandidate (values, value) {
  const normalized = String(value || '').trim()
  if (/^https:\/\//iu.test(normalized) && !values.includes(normalized)) {
    values.push(normalized)
  }
}

export function bangumiImageCandidates (
  value,
  subjectId = '',
  region = inferNetworkRegion(),
) {
  const candidates = []
  let routedImage = false
  try {
    const parsed = new URL(String(value || ''))
    if (/^(?:lain\.bgm\.tv|lain\.bangumi\.tv|bgmimg\.anibt\.net|lain\.bangumi\.lol)$/iu.test(parsed.hostname)) {
      routedImage = true
      for (const route of rankedNetworkSources(BANGUMI_IMAGE_ROUTES, { region })) {
        addCandidate(candidates, `${route.baseUrl}${parsed.pathname}${parsed.search}`)
      }
    }
  } catch {}
  if (!routedImage) addCandidate(candidates, value)
  if (/^\d+$/u.test(String(subjectId || ''))) {
    for (const route of BANGUMI_API_ROUTES) {
      addCandidate(
        candidates,
        apiUrl(route.baseUrl, `/v0/subjects/${subjectId}/image?type=large`),
      )
    }
  }
  return candidates
}
