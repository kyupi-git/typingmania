const DEFAULT_PORTS = Object.freeze({ 'http:': 80, 'https:': 443 })
let appliedNetworkMode = 'system'

export function setAppliedNetworkMode (mode = 'system') {
  appliedNetworkMode = ['system', 'manual', 'direct'].includes(mode) ? mode : 'system'
  return appliedNetworkMode
}

export function appliedNetworkModeSnapshot () {
  return appliedNetworkMode
}

export function parseNoProxyEntries (value) {
  return String(value || '').split(/[;,\s]+/u).filter(Boolean).map(entry => {
    const parsed = entry.trim().match(/^(.+):(\d+)$/u)
    return { hostname: (parsed ? parsed[1] : entry).trim().toLocaleLowerCase(), port: parsed ? Number(parsed[2]) : 0 }
  })
}

export function matchesNoProxyHost (hostname, noProxy, port = 0, protocol = 'http:') {
  const host = String(hostname || '').toLocaleLowerCase()
  const actualPort = Number(port) || DEFAULT_PORTS[protocol] || 0
  if (String(noProxy || '').trim() === '*') return true
  return parseNoProxyEntries(noProxy).some(entry => {
    if (entry.port && entry.port !== actualPort) return false
    if (entry.hostname === '<local>') return !host.includes('.')
    const pattern = entry.hostname.replace(/^\*\./u, '.').replace(/^\*/u, '')
    if (pattern.startsWith('.')) return host.endsWith(pattern) || host === pattern.slice(1)
    if (pattern.includes('*')) {
      const expression = new RegExp(`^${pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('.*')}$`, 'iu')
      return expression.test(host)
    }
    return host === pattern
  })
}

export function routeForUrl (value, {
  mode = appliedNetworkMode,
  proxyScope = process.env.TMN_SYSTEM_PROXY_SCOPE || 'unknown',
  noProxy = process.env.TMN_SYSTEM_NO_PROXY || process.env.NO_PROXY || process.env.no_proxy || '127.0.0.1,localhost',
} = {}) {
  const url = new URL(value)
  if (mode === 'direct') return { route: 'direct', reason: 'direct-mode', bypassed: true, hostname: url.hostname }
  if (mode === 'system' && proxyScope === 'none') return { route: 'direct', reason: 'no-system-proxy', bypassed: true, hostname: url.hostname }
  const bypassed = mode === 'manual'
    ? matchesNoProxyHost(url.hostname, '127.0.0.1,localhost,::1', Number(url.port), url.protocol)
    : matchesNoProxyHost(url.hostname, noProxy, Number(url.port), url.protocol)
  if (bypassed) return { route: 'direct', reason: 'no-proxy', bypassed: true, hostname: url.hostname }
  if (mode === 'system' && proxyScope !== 'global' && /(?:^|\.)(?:qq\.com|tencent\.com|gtimg\.com|gtimg\.cn|music\.163\.com|music\.126\.net|163\.com|126\.com|kugou\.com|bilibili\.com|biliimg\.com)$/iu.test(url.hostname)) {
    return { route: 'direct', reason: 'system-mainland-default', bypassed: false, hostname: url.hostname }
  }
  return { route: 'proxy', reason: mode === 'manual' ? 'manual-global' : 'system-proxy', bypassed: false, hostname: url.hostname }
}
