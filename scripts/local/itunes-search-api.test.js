import { expect, jest, test } from '@jest/globals'

import { searchItunesTrack } from './itunes-search-api.js'

test('iTunes Search uses the regional storefront and verifies identity', async () => {
  const fetchImpl = jest.fn(async () => ({
    ok: true,
    json: async () => ({
      results: [{
        trackId: 42,
        collectionId: 7,
        trackName: 'Example Song',
        artistName: 'Example Artist',
        collectionName: 'Example Soundtrack',
        trackTimeMillis: 180500,
      }],
    }),
  }))
  const result = await searchItunesTrack({
    title: 'Example Song',
    artist: 'Example Artist',
    duration: 180,
  }, {
    fetchImpl,
    region: 'jp',
  })
  expect(String(fetchImpl.mock.calls[0][0])).toContain('country=JP')
  expect(result).toMatchObject({
    service: 'itunes-search',
    id: '42',
    metadata: {
      title: 'Example Song',
      catalogVerification: {
        source: 'itunes-search',
      },
    },
  })
})
