import undici from '../../vendor/runtime/node_modules/undici/index.js'
import { matchesNoProxyHost as matchNoProxyHost, parseNoProxyEntries, routeForUrl, setAppliedNetworkMode } from './network-routing.js'

const {
  Agent,
  fetch: proxyAwareFetch,
  ProxyAgent,
  setGlobalDispatcher,
} = undici

// Node's built-in fetch and a project-local Undici release do not share a
// dispatcher reliably across every supported Node version. Route every local
// service request through the pinned implementation so UI changes take effect
// immediately on development and clean player machines alike.
globalThis.fetch = proxyAwareFetch

export const NETWORK_PROXY_MODES = Object.freeze([
  'system', 'direct', 'manual',
])

const SYSTEM_HTTP_PROXY = String(
  process.env.TMN_SYSTEM_HTTP_PROXY ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy ||
  '',
).trim()
const SYSTEM_HTTPS_PROXY = String(
  process.env.TMN_SYSTEM_HTTPS_PROXY ||
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  '',
).trim()
const SYSTEM_NO_PROXY = String(
  process.env.TMN_SYSTEM_NO_PROXY ||
  process.env.NO_PROXY ||
  process.env.no_proxy ||
  '127.0.0.1,localhost',
).trim()
const SYSTEM_PROXY_SCOPES = Object.freeze(['none', 'split', 'global', 'unknown'])
const SYSTEM_PROXY_SCOPE = SYSTEM_PROXY_SCOPES.includes(process.env.TMN_SYSTEM_PROXY_SCOPE)
  ? process.env.TMN_SYSTEM_PROXY_SCOPE
  : (SYSTEM_HTTP_PROXY || SYSTEM_HTTPS_PROXY ? 'unknown' : 'none')

let activeDispatcher = null
let activeMode = 'system'
let manualProxyUrl = ''

const noProxyEntries = parseNoProxyEntries

function bypassesProxy (url, noProxy, entries) {
  if (noProxy === '*') return true
  return matchNoProxyHost(url.hostname, noProxy, Number(url.port), url.protocol)
}

export { matchNoProxyHost as matchesNoProxyHost }

class SystemProxyAgent {
  constructor ({ httpProxy, httpsProxy, noProxy, proxyScope }) {
    this.direct = new Agent()
    this.http = httpProxy ? new ProxyAgent(httpProxy) : this.direct
    this.https = httpsProxy
      ? new ProxyAgent(httpsProxy)
      : this.http
    this.noProxy = String(noProxy || '')
    this.noProxyEntries = noProxyEntries(this.noProxy)
    this.proxyScope = proxyScope
  }

  dispatch (options, handler) {
    const url = new URL(options.origin)
    const route = routeForUrl(url.toString(), {
      mode: 'system', noProxy: this.noProxy, proxyScope: this.proxyScope,
    })
    const dispatcher = route.route === 'direct'
      ? this.direct
      : url.protocol === 'https:' ? this.https : this.http
    return dispatcher.dispatch(options, handler)
  }

  dispatchers () {
    return [...new Set([this.direct, this.http, this.https])]
  }

  async close () {
    await Promise.all(this.dispatchers().map(dispatcher => dispatcher.close()))
  }

  async destroy (error) {
    await Promise.all(this.dispatchers().map(
      dispatcher => dispatcher.destroy(error),
    ))
  }
}

function setProxyEnvironment (mode, proxyUrl) {
  const values = mode === 'system'
    ? {
        http: SYSTEM_HTTP_PROXY,
        https: SYSTEM_HTTPS_PROXY,
        noProxy: SYSTEM_NO_PROXY,
      }
    : mode === 'manual'
      ? {
          http: proxyUrl,
          https: proxyUrl,
          noProxy: '127.0.0.1,localhost,::1',
        }
      : {
          http: '',
          https: '',
          noProxy: '127.0.0.1,localhost,::1',
        }
  for (const [upper, lower, value] of [
    ['HTTP_PROXY', 'http_proxy', values.http],
    ['HTTPS_PROXY', 'https_proxy', values.https],
    ['NO_PROXY', 'no_proxy', values.noProxy],
  ]) {
    if (value) {
      process.env[upper] = value
      process.env[lower] = value
    } else {
      delete process.env[upper]
      delete process.env[lower]
    }
  }
}

export function normalizeManualProxyUrl (value) {
  const input = String(value || '').trim()
  if (!input) return ''
  let parsed
  try {
    parsed = new URL(input.includes('://') ? input : `http://${input}`)
  } catch {
    return ''
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) {
    return ''
  }
  parsed.hash = ''
  parsed.pathname = '/'
  parsed.search = ''
  return parsed.toString().replace(/\/$/u, '')
}

export function redactProxyUrl (value) {
  const normalized = normalizeManualProxyUrl(value)
  if (!normalized) return ''
  const parsed = new URL(normalized)
  if (parsed.username) parsed.username = '***'
  if (parsed.password) parsed.password = '***'
  return parsed.toString().replace(/\/$/u, '')
}

function systemProxyLabel () {
  const http = redactProxyUrl(SYSTEM_HTTP_PROXY)
  const https = redactProxyUrl(SYSTEM_HTTPS_PROXY)
  if (http && https && http !== https) return `HTTP ${http} · HTTPS ${https}`
  return https || http
}

function nextDispatcher (mode, proxyUrl) {
  if (mode === 'direct') return new Agent()
  if (mode === 'manual') return new ProxyAgent(proxyUrl)
  return new SystemProxyAgent({
    httpProxy: SYSTEM_HTTP_PROXY || undefined,
    httpsProxy: SYSTEM_HTTPS_PROXY || undefined,
    noProxy: SYSTEM_NO_PROXY,
    proxyScope: SYSTEM_PROXY_SCOPE,
  })
}

export function applyNetworkProxySettings ({
  mode = 'system',
  manualProxy = '',
} = {}) {
  const requestedMode = NETWORK_PROXY_MODES.includes(mode) ? mode : 'system'
  const normalizedManual = normalizeManualProxyUrl(manualProxy)
  if (requestedMode === 'manual' && !normalizedManual) {
    const error = new Error('A valid HTTP or HTTPS proxy address is required')
    error.code = 'INVALID_PROXY_URL'
    throw error
  }
  const dispatcher = nextDispatcher(requestedMode, normalizedManual)
  const previous = activeDispatcher
  setGlobalDispatcher(dispatcher)
  setProxyEnvironment(requestedMode, normalizedManual)
  activeDispatcher = dispatcher
  activeMode = requestedMode
  setAppliedNetworkMode(requestedMode)
  manualProxyUrl = normalizedManual
  if (previous && previous !== dispatcher) {
    Promise.resolve(previous.close()).catch(() => {})
  }
  return networkProxySnapshot()
}

export function networkProxySnapshot () {
  const systemProxy = systemProxyLabel()
  const activeProxy = activeMode === 'manual'
    ? redactProxyUrl(manualProxyUrl)
    : activeMode === 'system'
      ? systemProxy
      : ''
  return {
    proxyMode: activeMode,
    proxyActive: Boolean(activeProxy),
    systemProxy,
    systemNoProxy: SYSTEM_NO_PROXY,
    proxyScope: activeMode === 'manual'
      ? 'global'
      : activeMode === 'direct' ? 'none' : SYSTEM_PROXY_SCOPE,
    manualProxy: redactProxyUrl(manualProxyUrl),
  }
}

export function networkRouteForUrl (value, { mode = activeMode } = {}) {
  const proxyScope = mode === 'manual'
    ? 'global'
    : mode === 'direct' ? 'none' : SYSTEM_PROXY_SCOPE
  return routeForUrl(value, { mode, noProxy: SYSTEM_NO_PROXY, proxyScope })
}

export function currentManualProxyUrl () {
  return manualProxyUrl
}
