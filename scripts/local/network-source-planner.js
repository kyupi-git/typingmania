const health = new Map()
const FAILURE_COOLDOWN_MS = 12_000
const MAX_FAILURE_COOLDOWN_MS = 90_000

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

export function inferNetworkRegion ({
  explicit = process.env.TMN_NETWORK_REGION,
  locale = Intl.DateTimeFormat().resolvedOptions().locale,
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
} = {}) {
  const configured = normalizeRegion(explicit)
  if (configured) return configured
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
    state.successes * 30 +
    state.reachableMisses * 2 -
    state.failures * 45 -
    state.averageLatencyMs / 180 -
    (coolingDown(state) ? 500 : 0)
}

export function rankedNetworkSources (
  sources,
  { region = inferNetworkRegion() } = {},
) {
  return [...sources].sort(
    (left, right) => score(right, region) - score(left, region),
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
    const state = stateFor(source.id)
    try {
      const value = await source.run()
      observeLatency(state, Date.now() - started)
      const accepted = accept(value)
      onResult(source.id, value, accepted)
      if (accepted) {
        state.successes++
        state.failures = Math.max(0, state.failures - 1)
        state.consecutiveFailures = 0
        return { source: source.id, value }
      }
      state.reachableMisses++
      state.consecutiveFailures = 0
    } catch (error) {
      observeLatency(state, Date.now() - started)
      state.failures++
      state.consecutiveFailures++
      state.lastFailureAt = Date.now()
      lastError = error
    }
  }
  if (lastError) throw lastError
  return null
}

export function networkSourceHealth () {
  return Object.fromEntries(
    [...health.entries()].map(([id, state]) => [id, { ...state }]),
  )
}

export function resetNetworkSourceHealth () {
  health.clear()
}
