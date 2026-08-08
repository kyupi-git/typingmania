import { fetchWithTimeout } from './network.js'
import { tryNetworkSources } from './network-source-planner.js'

const EUROPE = new Set([
  'AD', 'AL', 'AT', 'BA', 'BE', 'BG', 'BY', 'CH', 'CY', 'CZ', 'DE',
  'DK', 'EE', 'ES', 'FI', 'FR', 'GB', 'GR', 'HR', 'HU', 'IE', 'IS',
  'IT', 'LI', 'LT', 'LU', 'LV', 'MC', 'MD', 'ME', 'MK', 'MT', 'NL',
  'NO', 'PL', 'PT', 'RO', 'RS', 'SE', 'SI', 'SK', 'SM', 'UA', 'VA',
])
const SOUTHEAST_ASIA = new Set([
  'BN', 'ID', 'KH', 'LA', 'MM', 'MY', 'PH', 'SG', 'TH', 'TL', 'VN',
])

export function regionForCountryCode (value) {
  const code = String(value || '').trim().toLocaleUpperCase()
  if (code === 'CN') return 'cn'
  if (['HK', 'MO'].includes(code)) return 'hk'
  if (code === 'TW') return 'tw'
  if (code === 'JP') return 'jp'
  if (code === 'KR') return 'kr'
  if (SOUTHEAST_ASIA.has(code)) return 'sea'
  if (code === 'US') return 'us'
  if (EUROPE.has(code)) return 'eu'
  return code ? 'global' : ''
}

function result (countryCode, source) {
  const normalized = String(countryCode || '').trim().toLocaleUpperCase()
  const region = regionForCountryCode(normalized)
  return region
    ? { region, countryCode: normalized, source }
    : null
}

async function cloudflareEgress (fetchImpl, timeoutMs) {
  const response = await fetchWithTimeout(
    fetchImpl,
    'https://www.cloudflare.com/cdn-cgi/trace',
    { headers: { Accept: 'text/plain' } },
    timeoutMs,
  )
  if (!response.ok) throw new Error(`Cloudflare trace HTTP ${response.status}`)
  const country = String(await response.text()).match(/^loc=([A-Z]{2})$/mu)?.[1]
  return result(country, 'cloudflare-egress')
}

async function ipSbEgress (fetchImpl, timeoutMs) {
  const response = await fetchWithTimeout(
    fetchImpl,
    'https://api.ip.sb/geoip',
    {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'TypingManiaNovel/20260808 (network route selection)',
      },
    },
    timeoutMs,
  )
  if (!response.ok) throw new Error(`IP.SB HTTP ${response.status}`)
  const payload = await response.json()
  return result(payload?.country_code, 'ipsb-egress')
}

async function ipApiEgress (fetchImpl, timeoutMs) {
  const response = await fetchWithTimeout(
    fetchImpl,
    'https://ipapi.co/json/',
    {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'TypingManiaNovel/20260808 (network route selection)',
      },
    },
    timeoutMs,
  )
  if (!response.ok) throw new Error(`ipapi HTTP ${response.status}`)
  const payload = await response.json()
  return result(payload?.country_code, 'ipapi-egress')
}

/**
 * Detect only the coarse proxy egress region. A public IP returned alongside
 * the country code is never copied into the result, logged, or persisted.
 */
export async function detectProxyEgressRegion ({
  fetchImpl = globalThis.fetch,
  timeoutMs = 2400,
} = {}) {
  const sources = [
    {
      id: 'cloudflare-egress',
      name: 'Cloudflare network trace',
      category: 'network',
      priority: 30,
      run: () => cloudflareEgress(fetchImpl, timeoutMs),
    },
    {
      id: 'ipsb-egress',
      name: 'IP.SB region check',
      category: 'network',
      priority: 24,
      run: () => ipSbEgress(fetchImpl, timeoutMs),
    },
    {
      id: 'ipapi-egress',
      name: 'ipapi region check',
      category: 'network',
      priority: 18,
      run: () => ipApiEgress(fetchImpl, timeoutMs),
    },
  ]
  try {
    const resolved = await tryNetworkSources(sources, {
      accept: value => Boolean(value?.region),
      region: 'global',
    })
    return resolved?.value || null
  } catch {
    return null
  }
}
