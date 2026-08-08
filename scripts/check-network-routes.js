import {
  applyNetworkProxySettings,
  normalizeManualProxyUrl,
} from './local/network-proxy.js'
import { probeNetworkSources } from './local/network-diagnostics.js'

const args = process.argv.slice(2)
const manual = args.find(value => value.startsWith('--proxy='))
if (args.includes('--direct')) {
  applyNetworkProxySettings({ mode: 'direct' })
} else if (manual) {
  const manualProxy = normalizeManualProxyUrl(manual.slice('--proxy='.length))
  applyNetworkProxySettings({ mode: 'manual', manualProxy })
} else {
  applyNetworkProxySettings({ mode: 'system' })
}

const snapshot = await probeNetworkSources({
  timeoutMs: 2200,
  concurrency: 6,
  detectEgress: !args.includes('--direct'),
})
const rows = snapshot.sources.map(source => ({
  id: source.id,
  status: source.status,
  latencyMs: source.latencyMs,
  priority: source.priority,
}))
console.log(JSON.stringify({
  deviceRegion: snapshot.deviceRegion,
  proxyRegion: snapshot.proxyRegion,
  effectiveRegion: snapshot.effectiveRegion,
  proxyMode: snapshot.proxyMode,
  available: rows.filter(source => source.status === 'available').length,
  total: rows.length,
  sources: rows,
}, null, 2))
