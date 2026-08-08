/** @jest-environment node */

import { expect, jest, test } from '@jest/globals'

import {
  bangumiImageCandidates,
  fetchBangumiApiJson,
  fetchBangumiWebsite,
} from './bangumi-routes.js'
import { resetNetworkSourceHealth } from './network-source-planner.js'

test('Bangumi catalog requests fall back to a public mirror', async () => {
  resetNetworkSourceHealth()
  const fetchImpl = jest.fn(async url => {
    const value = String(url)
    if (value.startsWith('https://api.bgm.tv/')) {
      throw new TypeError('official route is unavailable')
    }
    expect(value).toBe('https://bgmapi.anibt.net/v0/subjects/1')
    return {
      ok: true,
      status: 200,
      json: async () => ({ id: 1, name: 'Crayon Angel' }),
    }
  })
  await expect(fetchBangumiApiJson({
    pathname: '/v0/subjects/1',
    fetchImpl,
    region: 'cn',
    accept: value => value?.id === 1,
  })).resolves.toMatchObject({
    source: 'bangumi-api-anibt',
    value: { id: 1 },
  })
  expect(fetchImpl).toHaveBeenCalledTimes(2)
})

test('Bangumi poster candidates retain official and mirrored image routes', () => {
  expect(bangumiImageCandidates(
    'https://lain.bgm.tv/pic/cover/l/example.jpg',
    '13',
  )).toEqual(expect.arrayContaining([
    'https://lain.bgm.tv/pic/cover/l/example.jpg',
    'https://bgmimg.anibt.net/pic/cover/l/example.jpg',
    'https://lain.bangumi.lol/pic/cover/l/example.jpg',
    'https://api.bgm.tv/v0/subjects/13/image?type=large',
    'https://bgmapi.anibt.net/v0/subjects/13/image?type=large',
    'https://api.bangumi.lol/v0/subjects/13/image?type=large',
  ]))
})

test('Bangumi website lookup uses health-ranked official aliases', async () => {
  resetNetworkSourceHealth()
  const fetchImpl = jest.fn(async url => {
    if (String(url).startsWith('https://bgm.tv/')) {
      throw new TypeError('first alias is unavailable')
    }
    return {
      ok: true,
      status: 200,
      text: async () => '<html>Bangumi</html>',
    }
  })
  const result = await fetchBangumiWebsite({
    pathname: '/subject/1',
    fetchImpl,
    region: 'cn',
  })
  expect(result.source).toBe('bangumi-web-bangumi')
  expect(await result.value.text()).toContain('Bangumi')
})
