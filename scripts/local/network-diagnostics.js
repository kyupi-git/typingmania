import fs from 'node:fs/promises'
import path from 'node:path'

import { detectProxyEgressRegion } from './network-egress-region.js'
import { fetchWithTimeout } from './network.js'
import {
  NETWORK_ROUTE_CATALOG,
  NETWORK_ROUTE_HEALTH_GROUPS,
} from './network-route-catalog.js'
import {
  inferDeviceRegion,
  inferNetworkRegion,
  networkEgressRegion,
  networkRegionOverride,
  networkSourceDiagnostics,
  networkSourceHealth,
  normalizeNetworkRegion,
  observeNetworkSourceResult,
  recentNetworkEvents,
  resetNetworkSourceHealth,
  setNetworkEgressRegion,
  setNetworkRegionOverride,
} from './network-source-planner.js'
import {
  applyNetworkProxySettings,
  currentManualProxyUrl,
  NETWORK_PROXY_MODES,
  networkProxySnapshot,
  normalizeManualProxyUrl,
} from './network-proxy.js'

export const NETWORK_REGIONS = Object.freeze([
  'auto', 'cn', 'hk', 'tw', 'jp', 'kr', 'sea', 'us', 'eu', 'global',
])

export const NETWORK_DIAGNOSTIC_SOURCES = NETWORK_ROUTE_CATALOG

function settingsFilename (root) {
  return path.join(root, 'data', 'network-settings.json')
}

let settingsRoot = ''
let persistedSettings = {
  region: '',
  proxyMode: 'system',
  manualProxy: '',
}
let routeGeneration = 0
let preflightPromise = null
let preflight = {
  state: 'idle',
  startedAt: null,
  completedAt: null,
}

async function persistNetworkSettings (root = settingsRoot) {
  if (!root) return
  const filename = settingsFilename(root)
  const value = {
    version: 2,
    ...(persistedSettings.region
      ? { region: persistedSettings.region }
      : {}),
    ...(persistedSettings.proxyMode !== 'system'
      ? { proxyMode: persistedSettings.proxyMode }
      : {}),
    ...(persistedSettings.manualProxy
      ? { manualProxy: persistedSettings.manualProxy }
      : {}),
  }
  if (Object.keys(value).length === 1) {
    await fs.rm(filename, { force: true }).catch(() => {})
    return
  }
  await fs.mkdir(path.dirname(filename), { recursive: true })
  await fs.writeFile(filename, JSON.stringify(value), 'utf8')
}

export async function loadNetworkSettings (root) {
  settingsRoot = root
  let stored = {}
  try {
    stored = JSON.parse(await fs.readFile(settingsFilename(root), 'utf8'))
  } catch {}
  const proxyMode = NETWORK_PROXY_MODES.includes(stored?.proxyMode)
    ? stored.proxyMode
    : 'system'
  const manualProxy = normalizeManualProxyUrl(stored?.manualProxy)
  persistedSettings = {
    region: normalizeNetworkRegion(stored?.region),
    proxyMode: proxyMode === 'manual' && !manualProxy ? 'system' : proxyMode,
    manualProxy,
  }
  setNetworkRegionOverride(persistedSettings.region)
  setNetworkEgressRegion()
  applyNetworkProxySettings({
    mode: persistedSettings.proxyMode,
    manualProxy: persistedSettings.manualProxy,
  })
  return networkSettingsSnapshot()
}

export async function saveNetworkRegion (root, value) {
  const requested = String(value || '').toLocaleLowerCase()
  if (!NETWORK_REGIONS.includes(requested)) {
    const error = new Error('Unsupported network region')
    error.code = 'UNSUPPORTED_NETWORK_REGION'
    throw error
  }
  const region = requested === 'auto' ? '' : normalizeNetworkRegion(requested)
  setNetworkRegionOverride(region)
  settingsRoot = root
  persistedSettings.region = region
  await persistNetworkSettings(root)
  return networkSettingsSnapshot()
}

export async function saveNetworkProxy (root, {
  mode,
  manualProxy = '',
} = {}) {
  const requestedMode = String(mode || '').toLocaleLowerCase()
  if (!NETWORK_PROXY_MODES.includes(requestedMode)) {
    const error = new Error('Unsupported proxy mode')
    error.code = 'UNSUPPORTED_PROXY_MODE'
    throw error
  }
  const suppliedManual = normalizeManualProxyUrl(manualProxy)
  const retainedManual = requestedMode === 'manual'
    ? suppliedManual || persistedSettings.manualProxy || currentManualProxyUrl()
    : ''
  if (requestedMode === 'manual' && !retainedManual) {
    const error = new Error('A valid HTTP or HTTPS proxy address is required')
    error.code = 'INVALID_PROXY_URL'
    throw error
  }
  settingsRoot = root
  persistedSettings.proxyMode = requestedMode
  persistedSettings.manualProxy = retainedManual
  applyNetworkProxySettings({
    mode: persistedSettings.proxyMode,
    manualProxy: persistedSettings.manualProxy,
  })
  await persistNetworkSettings(root)
  routeGeneration++
  setNetworkEgressRegion()
  resetNetworkSourceHealth()
  return networkSettingsSnapshot()
}

export function networkSettingsSnapshot () {
  const override = networkRegionOverride()
  const deviceRegion = inferDeviceRegion()
  const egress = networkEgressRegion()
  const proxy = networkProxySnapshot()
  const basis = override
    ? 'manual'
    : proxy.proxyActive && egress.region
      ? 'proxy'
      : 'device'
  return {
    mode: override ? 'manual' : 'auto',
    ...proxy,
    selectedRegion: override || 'auto',
    deviceRegion,
    proxyRegion: proxy.proxyActive ? egress.region : '',
    proxyCountryCode: proxy.proxyActive ? egress.countryCode : '',
    regionBasis: basis,
    effectiveRegion: inferNetworkRegion(),
    regions: NETWORK_REGIONS,
  }
}

async function refreshProxyEgressRegion ({
  fetchImpl = globalThis.fetch,
  timeoutMs = 2400,
} = {}) {
  const generation = routeGeneration
  if (!networkProxySnapshot().proxyActive) {
    setNetworkEgressRegion()
    return null
  }
  const detected = await detectProxyEgressRegion({ fetchImpl, timeoutMs })
  if (generation !== routeGeneration) return null
  setNetworkEgressRegion(detected || {})
  return detected
}

export async function refreshNetworkRegionFromProxy (options = {}) {
  return refreshProxyEgressRegion(options)
}

async function probeSource (source, fetchImpl, timeoutMs) {
  const started = Date.now()
  try {
    const response = await fetchWithTimeout(fetchImpl, source.url, {
      method: 'GET',
      headers: {
        Accept: 'application/json,text/html;q=0.8,*/*;q=0.5',
        'User-Agent': 'TypingManiaNovel/20260808 (network diagnostics)',
      },
    }, timeoutMs)
    const latencyMs = Date.now() - started
    const reachable = response.status < 500
    observeNetworkSourceResult(source, {
      status: reachable ? 'reachable-miss' : 'failure',
      latencyMs,
      error: reachable ? '' : `HTTP ${response.status}`,
    })
    await response.body?.cancel?.().catch(() => {})
  } catch (error) {
    observeNetworkSourceResult(source, {
      status: 'failure',
      latencyMs: Date.now() - started,
      error,
    })
  }
}

export async function probeNetworkSources ({
  fetchImpl = globalThis.fetch,
  timeoutMs = 2800,
  concurrency = 4,
  detectEgress = true,
} = {}) {
  if (detectEgress) {
    await refreshProxyEgressRegion({
      fetchImpl,
      timeoutMs: Math.min(2400, timeoutMs),
    })
  }
  let next = 0
  const workers = Array.from({
    length: Math.max(1, Math.min(6, Number(concurrency) || 4)),
  }, async () => {
    while (next < NETWORK_DIAGNOSTIC_SOURCES.length) {
      const source = NETWORK_DIAGNOSTIC_SOURCES[next++]
      await probeSource(source, fetchImpl, timeoutMs)
    }
  })
  await Promise.all(workers)
  const health = networkSourceHealth()
  for (const group of NETWORK_ROUTE_HEALTH_GROUPS) {
    const members = group.members.map(id => health[id]).filter(Boolean)
    const available = members.filter(member => member.status === 'available')
    const latencies = available
      .map(member => Number(member.averageLatencyMs))
      .filter(value => Number.isFinite(value) && value >= 0)
    observeNetworkSourceResult(group, available.length
      ? {
          status: 'reachable-miss',
          latencyMs: latencies.length ? Math.min(...latencies) : 0,
        }
      : {
          status: 'failure',
          error: 'All compatible endpoints are unavailable',
        })
  }
  return networkDiagnosticsSnapshot()
}

/**
 * Start a non-blocking route warm-up. Callers intentionally do not await this
 * during application startup: gameplay and the bundled library remain ready
 * while connectivity results progressively tune source ordering.
 */
export function startNetworkPreflight (options = {}) {
  if (preflightPromise) {
    if (!options.restart) return preflightPromise
    const nextOptions = { ...options, restart: false }
    return preflightPromise
      .catch(() => null)
      .then(() => startNetworkPreflight(nextOptions))
  }
  preflight = {
    state: 'running',
    startedAt: new Date().toISOString(),
    completedAt: null,
  }
  preflightPromise = probeNetworkSources(options)
    .then(() => {
      preflight = {
        ...preflight,
        state: 'complete',
        completedAt: new Date().toISOString(),
      }
      return networkDiagnosticsSnapshot()
    })
    .catch(error => {
      preflight = {
        ...preflight,
        state: 'error',
        completedAt: new Date().toISOString(),
      }
      throw error
    })
    .finally(() => {
      preflightPromise = null
    })
  return preflightPromise
}

export function networkDiagnosticsSnapshot ({ logLimit = 40 } = {}) {
  const settings = networkSettingsSnapshot()
  return {
    ...settings,
    checkedAt: preflight.completedAt,
    preflight: { ...preflight },
    sources: networkSourceDiagnostics({
      region: settings.effectiveRegion,
      sources: NETWORK_DIAGNOSTIC_SOURCES,
    }),
    logs: recentNetworkEvents(logLimit),
  }
}
