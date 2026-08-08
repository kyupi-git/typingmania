import {
  appliedNetworkModeSnapshot,
  routeForUrl as networkRouteForUrl,
} from './network-routing.js'
const health = new Map()
const sourceRegistry = new Map()
const recentEvents = []
const FAILURE_COOLDOWN_MS = 12_000
const MAX_FAILURE_COOLDOWN_MS = 90_000
const MAX_RECENT_EVENTS = 120
let regionOverride = ''
let egressRegion = ''
let egressCountryCode = ''
let egressSource = ''

const REGION_ALIASES = new Map([
  ['cn', 'cn'],
  ['china', 'cn'],
  ['mainland', 'cn'],
  ['mainland-china', 'cn'],
  ['hk', 'hk'],
  ['hong-kong', 'hk'],
  ['mo', 'hk'],
  ['macau', 'hk'],
  ['tw', 'tw'],
  ['taiwan', 'tw'],
  ['jp', 'jp'],
  ['japan', 'jp'],
  ['kr', 'kr'],
  ['ko', 'kr'],
  ['korea', 'kr'],
  ['south-korea', 'kr'],
  ['sea', 'sea'],
  ['southeast-asia', 'sea'],
  ['sg', 'sea'],
  ['singapore', 'sea'],
  ['my', 'sea'],
  ['malaysia', 'sea'],
  ['id', 'sea'],
  ['indonesia', 'sea'],
  ['th', 'sea'],
  ['thailand', 'sea'],
  ['vn', 'sea'],
  ['vietnam', 'sea'],
  ['ph', 'sea'],
  ['philippines', 'sea'],
  ['us', 'us'],
  ['usa', 'us'],
  ['united-states', 'us'],
  ['eu', 'eu'],
  ['europe', 'eu'],
  ['global', 'global'],
])

const EUROPEAN_REGIONS = new Set([
  'AD', 'AL', 'AT', 'BA', 'BE', 'BG', 'BY', 'CH', 'CY', 'CZ', 'DE',
  'DK', 'EE', 'ES', 'FI', 'FR', 'GB', 'GR', 'HR', 'HU', 'IE', 'IS',
  'IT', 'LI', 'LT', 'LU', 'LV', 'MC', 'MD', 'ME', 'MK', 'MT', 'NL',
  'NO', 'PL', 'PT', 'RO', 'RS', 'SE', 'SI', 'SK', 'SM', 'UA', 'VA',
])
const SOUTHEAST_ASIAN_REGIONS = new Set([
  'BN', 'ID', 'KH', 'LA', 'MM', 'MY', 'PH', 'SG', 'TH', 'TL', 'VN',
])
const REGION_PRIORITY_FALLBACKS = Object.freeze({
  kr: ['kr', 'jp', 'global'],
  sea: ['sea', 'hk', 'global'],
  eu: ['eu', 'us', 'global'],
})

function safeNetworkError (value) {
  return String(value?.message || value || '')
    .replace(/(https?:\/\/)[^\s/@]+(?::[^\s/@]*)?@/giu, '$1***:***@')
    .slice(0, 180)
}

function stateFor (id) {
  const key = String(id)
  if (!health.has(key)) {
    health.set(key, {
      successes: 0,
      reachableMisses: 0,
      failures: 0,
      consecutiveFailures: 0,
      averageLatencyMs: 0,
      lastFailureAt: 0,
      lastCheckedAt: 0,
      lastSuccessAt: 0,
      status: 'untested',
      lastError: '',
    })
  }
  return health.get(key)
}

function observeLatency (state, latencyMs) {
  state.averageLatencyMs = state.averageLatencyMs
    ? state.averageLatencyMs * 0.7 + latencyMs * 0.3
    : latencyMs
}

function normalizeRegion (value) {
  return REGION_ALIASES.get(
    String(value || '')
      .trim()
      .toLocaleLowerCase()
      .replace(/[_\s]+/gu, '-'),
  ) || ''
}

export function normalizeNetworkRegion (value) {
  return normalizeRegion(value)
}

export function setNetworkRegionOverride (value = '') {
  regionOverride = normalizeRegion(value)
  return regionOverride
}

export function networkRegionOverride () {
  return regionOverride
}

export function setNetworkEgressRegion ({
  region = '',
  countryCode = '',
  source = '',
} = {}) {
  egressRegion = normalizeRegion(region)
  egressCountryCode = String(countryCode || '').trim().toLocaleUpperCase()
  egressSource = egressRegion ? String(source || '').trim() : ''
  return networkEgressRegion()
}

export function networkEgressRegion () {
  return {
    region: egressRegion,
    countryCode: egressCountryCode,
    source: egressSource,
  }
}

export function inferDeviceRegion ({
  locale = Intl.DateTimeFormat().resolvedOptions().locale,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
} = {}) {
  const normalizedLocale = String(locale || '').replace('_', '-')
  const region = normalizedLocale.split('-')[1]?.toLocaleUpperCase() || ''
  if (region === 'CN') return 'cn'
  if (['HK', 'MO'].includes(region)) return 'hk'
  if (region === 'TW') return 'tw'
  if (region === 'JP') return 'jp'
  if (region === 'KR') return 'kr'
  if (SOUTHEAST_ASIAN_REGIONS.has(region)) return 'sea'
  if (region === 'US') return 'us'
  if (EUROPEAN_REGIONS.has(region)) return 'eu'

  const zone = String(timeZone || '')
  if (/Asia\/(?:Shanghai|Chongqing|Harbin|Urumqi)/iu.test(zone)) return 'cn'
  if (/Asia\/(?:Hong_Kong|Macau)/iu.test(zone)) return 'hk'
  if (/Asia\/Taipei/iu.test(zone)) return 'tw'
  if (/Asia\/Tokyo/iu.test(zone)) return 'jp'
  if (/Asia\/Seoul/iu.test(zone)) return 'kr'
  if (
    /Asia\/(?:Bangkok|Brunei|Ho_Chi_Minh|Jakarta|Kuala_Lumpur|Manila|Phnom_Penh|Singapore|Vientiane|Yangon)/iu
      .test(zone)
  ) {
    return 'sea'
  }
  if (/^America\//iu.test(zone)) return 'us'
  if (/^Europe\//iu.test(zone)) return 'eu'
  return 'global'
}

export function inferNetworkRegion ({
  explicit,
  locale = Intl.DateTimeFormat().resolvedOptions().locale,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
} = {}) {
  const configured = normalizeRegion(
    explicit === undefined
      ? regionOverride || process.env.TMN_NETWORK_REGION
      : explicit,
  )
  if (configured) return configured
  if (egressRegion) return egressRegion
  return inferDeviceRegion({ locale, timeZone })
}

export function effectiveRegionForSource (source, {
  deviceRegion = inferDeviceRegion(),
  proxyRegion = egressRegion,
  fallback = inferNetworkRegion(),
} = {}) {
  const url = source?.url || source?.baseUrl || source?.routeUrl || source?.endpoint
  const mode = appliedNetworkModeSnapshot()
  const sourceLabel = String(source?.id || source?.name || '')
    .trim().toLocaleLowerCase().replace(/[\s]+/gu, '-')
  const knownMainlandSource = /(?:^|[-_:])(?:qqmusic|qq[-_]?music|tencent|netease|163|126|kugou|bilibili)(?:[-_:]|$)/u
    .test(sourceLabel)
  if (!url) {
    if (knownMainlandSource && mode !== 'manual') return deviceRegion || fallback
    if (knownMainlandSource && mode === 'manual') return proxyRegion || fallback
    return fallback
  }
  try {
    const route = source?.route === 'direct' || source?.route === 'proxy'
      ? source.route
      : networkRouteForUrl(url, { mode }).route
    return route === 'direct'
      ? (deviceRegion || fallback)
      : (proxyRegion || fallback)
  } catch {
    return fallback
  }
}

function regionalPriority (source, region) {
  const values = source.regionalPriority || {}
  for (const candidate of REGION_PRIORITY_FALLBACKS[region] || [region, 'global']) {
    if (values[candidate] !== undefined) return Number(values[candidate]) || 0
  }
  return 0
}

function failureCooldown (state) {
  if (state.consecutiveFailures < 2) return 0
  return Math.min(
    MAX_FAILURE_COOLDOWN_MS,
    FAILURE_COOLDOWN_MS * 2 ** (state.consecutiveFailures - 2),
  )
}

function coolingDown (state, now = Date.now()) {
  const cooldown = failureCooldown(state)
  return cooldown > 0 && now - state.lastFailureAt < cooldown
}

function score (source, region) {
  const state = stateFor(source.id)
  return (Number(source.priority) || 0) +
    regionalPriority(source, region) +
    Math.min(5, state.successes) * 12 +
    Math.min(4, state.reachableMisses) * 2 -
    Math.min(4, state.consecutiveFailures) * 45 -
    state.averageLatencyMs / 180 -
    (coolingDown(state) ? 500 : 0)
}

function registerSource (source) {
  if (!source?.id) return
  const existing = sourceRegistry.get(String(source.id)) || {}
  sourceRegistry.set(String(source.id), {
    ...existing,
    id: String(source.id),
    name: String(source.name || existing.name || source.id),
    category: String(source.category || existing.category || 'metadata'),
    priority: Number(source.priority) || 0,
    regionalPriority: { ...(source.regionalPriority || existing.regionalPriority || {}) },
  })
}

function recordEvent (id, status, latencyMs = 0, error = '') {
  recentEvents.push({
    at: new Date().toISOString(),
    source: String(id),
    status,
    latencyMs: Math.max(0, Math.round(Number(latencyMs) || 0)),
    error: safeNetworkError(error),
  })
  if (recentEvents.length > MAX_RECENT_EVENTS) {
    recentEvents.splice(0, recentEvents.length - MAX_RECENT_EVENTS)
  }
}

export function observeNetworkSourceResult (
  source,
  { status, latencyMs = 0, error = '' } = {},
) {
  registerSource(source)
  const state = stateFor(source.id)
  const now = Date.now()
  state.lastCheckedAt = now
  if (status === 'success') {
    observeLatency(state, Math.max(0, Number(latencyMs) || 0))
    state.successes++
    state.failures = Math.max(0, state.failures - 1)
    state.consecutiveFailures = 0
    state.lastSuccessAt = now
    state.status = 'available'
    state.lastError = ''
  } else if (status === 'reachable-miss') {
    observeLatency(state, Math.max(0, Number(latencyMs) || 0))
    state.reachableMisses++
    state.failures = Math.max(0, state.failures - 1)
    state.consecutiveFailures = 0
    state.status = 'available'
    state.lastError = ''
  } else {
    state.failures++
    state.consecutiveFailures++
    state.lastFailureAt = now
    state.status = 'unavailable'
    state.lastError = safeNetworkError(error)
  }
  recordEvent(source.id, state.status, latencyMs, state.lastError)
  for (const alias of source.healthAliases || []) {
    if (!alias || alias === source.id) continue
    const aliasState = stateFor(alias)
    Object.assign(aliasState, state)
  }
  return { ...state }
}

export function rankedNetworkSources (
  sources,
  { region = inferNetworkRegion(), deviceRegion, proxyRegion } = {},
) {
  for (const source of sources) registerSource(source)
  return [...sources].sort(
    (left, right) => score(right, effectiveRegionForSource(right, {
      deviceRegion, proxyRegion, fallback: region,
    })) - score(left, effectiveRegionForSource(left, {
      deviceRegion, proxyRegion, fallback: region,
    })),
  )
}

export async function tryNetworkSources (
  sources,
  {
    accept = value => Boolean(value),
    region = inferNetworkRegion(),
    onResult = () => {},
  } = {},
) {
  let lastError = null
  const ranked = rankedNetworkSources(sources, { region })
  const available = ranked.filter(source => !coolingDown(stateFor(source.id)))
  // If every route is cooling down, probe the best one instead of making the
  // feature unavailable until a timer happens to expire.
  const candidates = available.length ? available : ranked.slice(0, 1)
  for (const source of candidates) {
    const started = Date.now()
    try {
      const value = await source.run()
      const latencyMs = Date.now() - started
      const accepted = accept(value)
      onResult(source.id, value, accepted)
      if (accepted) {
        observeNetworkSourceResult(source, { status: 'success', latencyMs })
        return { source: source.id, value }
      }
      observeNetworkSourceResult(source, {
        status: 'reachable-miss',
        latencyMs,
      })
    } catch (error) {
      observeNetworkSourceResult(source, {
        status: 'failure',
        latencyMs: Date.now() - started,
        error,
      })
      lastError = error
    }
  }
  if (lastError) throw lastError
  return null
}

/**
 * Query more than one reachable route for bounded corroboration. Unlike
 * tryNetworkSources, this deliberately continues after the first accepted
 * response, while retaining the same health, cooldown, and redacted logging
 * behavior. Optional metadata callers can therefore compare independent
 * catalogs without allowing a blocked route to stall the import pipeline.
 */
export async function collectNetworkSources (
  sources,
  {
    accept = value => Boolean(value),
    region = inferNetworkRegion(),
    maxAccepted = 2,
    maxAttempts = 4,
    onResult = () => {},
  } = {},
) {
  const acceptedResults = []
  let lastError = null
  const ranked = rankedNetworkSources(sources, { region })
  const available = ranked.filter(source => !coolingDown(stateFor(source.id)))
  const candidates = available.length ? available : ranked.slice(0, 1)
  const attemptLimit = Math.max(
    1,
    Math.min(candidates.length, Number(maxAttempts) || 4),
  )
  const acceptedLimit = Math.max(1, Number(maxAccepted) || 2)
  for (const source of candidates.slice(0, attemptLimit)) {
    const started = Date.now()
    try {
      const value = await source.run()
      const latencyMs = Date.now() - started
      const accepted = accept(value)
      onResult(source.id, value, accepted)
      observeNetworkSourceResult(source, {
        status: accepted ? 'success' : 'reachable-miss',
        latencyMs,
      })
      if (accepted) {
        acceptedResults.push({ source: source.id, value })
        if (acceptedResults.length >= acceptedLimit) break
      }
    } catch (error) {
      observeNetworkSourceResult(source, {
        status: 'failure',
        latencyMs: Date.now() - started,
        error,
      })
      lastError = error
    }
  }
  if (!acceptedResults.length && lastError) throw lastError
  return acceptedResults
}

export function networkSourceHealth () {
  return Object.fromEntries(
    [...health.entries()].map(([id, state]) => [id, { ...state }]),
  )
}

export function networkSourceDiagnostics ({
  region = inferNetworkRegion(),
  sources = [...sourceRegistry.values()],
} = {}) {
  const ranked = rankedNetworkSources(sources, { region })
  return ranked.map((source, index) => {
    const state = stateFor(source.id)
    return {
      id: source.id,
      name: source.name || source.id,
      category: source.category || 'metadata',
      priority: index + 1,
      score: Math.round(score(source, region) * 10) / 10,
      status: state.status,
      latencyMs: state.status === 'available' && state.averageLatencyMs
        ? Math.round(state.averageLatencyMs)
        : null,
      successes: state.successes,
      failures: state.failures,
      lastCheckedAt: state.lastCheckedAt
        ? new Date(state.lastCheckedAt).toISOString()
        : null,
      cooldownMs: Math.max(
        0,
        failureCooldown(state) - (Date.now() - state.lastFailureAt),
      ),
    }
  })
}

export function recentNetworkEvents (limit = 30) {
  return recentEvents.slice(-Math.max(1, Math.min(100, Number(limit) || 30)))
    .reverse()
}

export function resetNetworkSourceHealth () {
  health.clear()
  recentEvents.length = 0
}
