import { expect, jest, test } from '@jest/globals'
import { setAppliedNetworkMode } from './network-routing.js'

import {
  collectNetworkSources,
  inferDeviceRegion,
  inferNetworkRegion,
  effectiveRegionForSource,
  networkSourceDiagnostics,
  observeNetworkSourceResult,
  rankedNetworkSources,
  recentNetworkEvents,
  resetNetworkSourceHealth,
  setNetworkEgressRegion,
  setNetworkRegionOverride,
  tryNetworkSources,
} from './network-source-planner.js'

test('bounded collection keeps checking after the first accepted source', async () => {
  resetNetworkSourceHealth()
  const calls = []
  const sources = ['first', 'second', 'third'].map((id, index) => ({
    id,
    priority: 30 - index,
    run: async () => {
      calls.push(id)
      return { id }
    },
  }))
  await expect(collectNetworkSources(sources, {
    maxAccepted: 2,
    maxAttempts: 3,
  })).resolves.toEqual([
    { source: 'first', value: { id: 'first' } },
    { source: 'second', value: { id: 'second' } },
  ])
  expect(calls).toEqual(['first', 'second'])
})

test('reachable source success is preferred after a route failure', async () => {
  resetNetworkSourceHealth()
  const blocked = jest.fn(async () => { throw new TypeError('fetch failed') })
  const available = jest.fn(async () => ({ id: 'matched' }))
  const sources = [
    { id: 'first', priority: 20, run: blocked },
    { id: 'second', priority: 10, run: available },
  ]
  await expect(tryNetworkSources(sources)).resolves.toMatchObject({
    source: 'second',
  })
  expect(rankedNetworkSources(sources)[0].id).toBe('second')
})

test('system locale selects a private, deterministic regional profile', () => {
  setNetworkRegionOverride('')
  setNetworkEgressRegion()
  expect(inferNetworkRegion({
    explicit: '',
    locale: 'zh-CN',
    timeZone: 'Asia/Shanghai',
  })).toBe('cn')
  expect(inferNetworkRegion({
    explicit: '',
    locale: 'zh-HK',
    timeZone: 'Asia/Hong_Kong',
  })).toBe('hk')
  expect(inferNetworkRegion({
    explicit: '',
    locale: 'zh-MO',
    timeZone: 'Asia/Macau',
  })).toBe('hk')
  expect(inferNetworkRegion({
    explicit: '',
    locale: 'zh-TW',
    timeZone: 'Asia/Taipei',
  })).toBe('tw')
  expect(inferNetworkRegion({
    explicit: '',
    locale: 'ja-JP',
    timeZone: 'Asia/Tokyo',
  })).toBe('jp')
  expect(inferNetworkRegion({
    explicit: '',
    locale: 'en-US',
    timeZone: 'America/Los_Angeles',
  })).toBe('us')
  expect(inferNetworkRegion({
    explicit: '',
    locale: 'ko-KR',
    timeZone: 'Asia/Seoul',
  })).toBe('kr')
  expect(inferNetworkRegion({
    explicit: '',
    locale: 'en-SG',
    timeZone: 'Asia/Singapore',
  })).toBe('sea')
  expect(inferNetworkRegion({
    explicit: '',
    locale: 'de-DE',
    timeZone: 'Europe/Berlin',
  })).toBe('eu')
  expect(inferNetworkRegion({
    explicit: 'tw',
    locale: 'en-US',
    timeZone: 'America/New_York',
  })).toBe('tw')
})

test('a detected proxy exit affects automatic routing but not manual override', () => {
  setNetworkRegionOverride('')
  setNetworkEgressRegion({
    region: 'jp',
    countryCode: 'JP',
    source: 'test',
  })
  expect(inferDeviceRegion({
    locale: 'zh-CN',
    timeZone: 'Asia/Shanghai',
  })).toBe('cn')
  expect(inferNetworkRegion({
    locale: 'zh-CN',
    timeZone: 'Asia/Shanghai',
  })).toBe('jp')
  setNetworkRegionOverride('us')
  expect(inferNetworkRegion()).toBe('us')
  setNetworkRegionOverride('')
  setNetworkEgressRegion()
})

test('regional preference is used before live health is known', () => {
  resetNetworkSourceHealth()
  const sources = [
    {
      id: 'mainland',
      priority: 10,
      regionalPriority: { cn: 40, jp: -20 },
    },
    {
      id: 'japan',
      priority: 10,
      regionalPriority: { cn: -20, jp: 40 },
    },
  ]
  expect(rankedNetworkSources(sources, { region: 'cn' })[0].id)
    .toBe('mainland')
  expect(rankedNetworkSources(sources, { region: 'jp' })[0].id)
    .toBe('japan')
})

test('source URLs use device region for direct mainland routes and proxy exit for foreign routes', () => {
  setNetworkRegionOverride('')
  setNetworkEgressRegion({ region: 'jp', countryCode: 'JP', source: 'test' })
  expect(effectiveRegionForSource({ url: 'https://qq.com/song', route: 'direct' }, {
    deviceRegion: 'cn', proxyRegion: 'jp', fallback: 'global',
  })).toBe('cn')
  expect(effectiveRegionForSource({ url: 'https://foreign.example/song' }, {
    deviceRegion: 'cn', proxyRegion: 'jp', fallback: 'global',
  })).toBe('jp')
  setNetworkEgressRegion()
})

test('planner follows the applied system, manual and direct modes', () => {
  setNetworkRegionOverride('')
  setNetworkEgressRegion({ region: 'jp', countryCode: 'JP', source: 'test' })
  try {
    setAppliedNetworkMode('system')
    expect(effectiveRegionForSource({ url: 'https://music.163.com/song' }, {
      deviceRegion: 'cn', proxyRegion: 'jp', fallback: 'global',
    })).toBe('cn')
    setAppliedNetworkMode('manual')
    expect(effectiveRegionForSource({ url: 'https://music.163.com/song' }, {
      deviceRegion: 'cn', proxyRegion: 'jp', fallback: 'global',
    })).toBe('jp')
    setAppliedNetworkMode('direct')
    expect(effectiveRegionForSource({ url: 'https://foreign.example/song' }, {
      deviceRegion: 'cn', proxyRegion: 'jp', fallback: 'global',
    })).toBe('cn')
  } finally {
    setAppliedNetworkMode('system')
    setNetworkEgressRegion()
  }
})

test('baseUrl and URL-less mainland sources retain device routing only in system/direct modes', () => {
  setNetworkEgressRegion({ region: 'jp', countryCode: 'JP', source: 'test' })
  try {
    setAppliedNetworkMode('system')
    expect(effectiveRegionForSource({
      id: 'bangumi-mirror', baseUrl: 'https://api.bilibili.com/v1',
    }, { deviceRegion: 'cn', proxyRegion: 'jp', fallback: 'global' })).toBe('cn')
    expect(effectiveRegionForSource({ id: 'netease-catalog' }, {
      deviceRegion: 'cn', proxyRegion: 'jp', fallback: 'global',
    })).toBe('cn')
    expect(effectiveRegionForSource({ id: 'kugou-catalog' }, {
      deviceRegion: 'cn', proxyRegion: 'jp', fallback: 'global',
    })).toBe('cn')
    setAppliedNetworkMode('manual')
    expect(effectiveRegionForSource({ id: 'netease-catalog' }, {
      deviceRegion: 'cn', proxyRegion: 'jp', fallback: 'global',
    })).toBe('jp')
    expect(effectiveRegionForSource({ id: 'bangumi-mirror', baseUrl: 'https://api.bilibili.com/v1' }, {
      deviceRegion: 'cn', proxyRegion: 'jp', fallback: 'global',
    })).toBe('jp')
    setAppliedNetworkMode('direct')
    expect(effectiveRegionForSource({ id: 'kugou-catalog' }, {
      deviceRegion: 'cn', proxyRegion: 'jp', fallback: 'global',
    })).toBe('cn')
  } finally {
    setAppliedNetworkMode('system')
    setNetworkEgressRegion()
  }
})

test('new regional profiles inherit the closest safe source order', () => {
  resetNetworkSourceHealth()
  const sources = [
    {
      id: 'asia',
      regionalPriority: { hk: 30, jp: 40, global: 0 },
    },
    {
      id: 'western',
      regionalPriority: { us: 35, global: 10 },
    },
  ]
  expect(rankedNetworkSources(sources, { region: 'kr' })[0].id).toBe('asia')
  expect(rankedNetworkSources(sources, { region: 'sea' })[0].id).toBe('asia')
  expect(rankedNetworkSources(sources, { region: 'eu' })[0].id).toBe('western')
})

test('network logs redact credentials embedded in proxy URLs', () => {
  resetNetworkSourceHealth()
  observeNetworkSourceResult({ id: 'proxy-test' }, {
    status: 'failure',
    error: 'connect http://player:secret@127.0.0.1:8899 failed',
  })
  const event = recentNetworkEvents(1)[0]
  expect(event.error).toContain('http://***:***@127.0.0.1:8899')
  expect(event.error).not.toContain('player')
  expect(event.error).not.toContain('secret')
})

test('an unavailable source does not report its timeout as latency', () => {
  resetNetworkSourceHealth()
  const source = { id: 'blocked', name: 'Blocked source' }
  observeNetworkSourceResult(source, {
    status: 'failure',
    latencyMs: 2800,
    error: 'request timed out',
  })
  expect(networkSourceDiagnostics({ sources: [source] })[0]).toMatchObject({
    status: 'unavailable',
    latencyMs: null,
  })
})

test('a working mirror can seed the logical source without duplicate logs', () => {
  resetNetworkSourceHealth()
  observeNetworkSourceResult({
    id: 'service-mirror',
    healthAliases: ['logical-service'],
  }, {
    status: 'success',
    latencyMs: 120,
  })
  expect(networkSourceDiagnostics({
    sources: [{ id: 'logical-service' }],
  })[0]).toMatchObject({
    status: 'available',
    latencyMs: 120,
  })
  expect(recentNetworkEvents(10)).toHaveLength(1)
})
