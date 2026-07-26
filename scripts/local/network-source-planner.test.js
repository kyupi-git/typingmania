import { expect, jest, test } from '@jest/globals'

import {
  inferNetworkRegion,
  rankedNetworkSources,
  resetNetworkSourceHealth,
  tryNetworkSources,
} from './network-source-planner.js'

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
