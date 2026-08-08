import { expect, jest, test } from '@jest/globals'

import { resolveLrclibLyrics } from './lrclib-api.js'
import { resetNetworkSourceHealth } from './network-source-planner.js'

function response (value, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => value }
}

test('LRCLIB exact matches require synchronized lyrics and duration identity', async () => {
  const fetchImpl = jest.fn(async () => response({
    id: 42,
    trackName: 'Example Song',
    artistName: 'Example Artist',
    albumName: 'Example Album',
    duration: 240,
    syncedLyrics: '[00:01.00]First line',
  }))
  await expect(resolveLrclibLyrics({
    title: 'Example Song',
    artist: 'Example Artist',
    album: 'Example Album',
    duration: 240.8,
  }, { fetchImpl })).resolves.toMatchObject({
    service: 'lrclib',
    trackId: '42',
  })
})

test('LRCLIB rejects a similarly named recording with the wrong duration', async () => {
  const fetchImpl = jest.fn(async url => (
    String(url).includes('/api/get?')
      ? response({}, { ok: false, status: 404 })
      : response([{
          id: 9,
          trackName: 'Example Song',
          artistName: 'Example Artist',
          duration: 260,
          syncedLyrics: '[00:01.00]Wrong recording',
        }])
  ))
  await expect(resolveLrclibLyrics({
    title: 'Example Song',
    artist: 'Example Artist',
    album: 'Example Album',
    duration: 240,
  }, { fetchImpl })).rejects.toThrow(/no verified/iu)
})

test('LRCLIB falls back to its compatible www endpoint', async () => {
  resetNetworkSourceHealth()
  const fetchImpl = jest.fn(async url => {
    if (new URL(String(url)).hostname === 'lrclib.net') {
      throw new TypeError('primary endpoint unavailable')
    }
    return response({
      id: 43,
      trackName: 'Mirror Song',
      artistName: 'Mirror Artist',
      albumName: 'Mirror Album',
      duration: 201,
      syncedLyrics: '[00:01.00]Verified line',
    })
  })
  await expect(resolveLrclibLyrics({
    title: 'Mirror Song',
    artist: 'Mirror Artist',
    album: 'Mirror Album',
    duration: 201,
  }, { fetchImpl })).resolves.toMatchObject({ trackId: '43' })
  expect(fetchImpl).toHaveBeenCalledTimes(2)
})
