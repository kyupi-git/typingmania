import { expect, jest, test } from '@jest/globals'

import {
  searchTmdbWork,
  searchTvmazeWork,
} from './media-catalog-api.js'

test('TVmaze verifies a localized alias before using the primary show title', async () => {
  const fetchImpl = jest.fn(async url => {
    if (String(url).includes('/akas')) {
      return {
        ok: true,
        json: async () => [{ name: '示例电视剧', country: { code: 'CN' } }],
      }
    }
    return {
      ok: true,
      json: async () => [{
        score: 0.92,
        show: {
          id: 88,
          name: 'Example Drama',
          language: 'English',
          image: { original: 'https://img.test/drama.jpg' },
        },
      }],
    }
  })
  await expect(searchTvmazeWork({
    media: 'television',
    workTitle: '示例电视剧',
  }, { fetchImpl })).resolves.toMatchObject({
    title: 'Example Drama',
    language: 'en',
    catalog: 'tvmaze',
    catalogId: '88',
    evidence: 'catalog-alias',
  })
})

test('TMDB keeps the original film title instead of the localized query title', async () => {
  const fetchImpl = jest.fn(async () => ({
    ok: true,
    json: async () => ({
      results: [{
        id: 99,
        title: '示例电影',
        original_title: 'Example Film',
        original_language: 'en',
        poster_path: '/poster.jpg',
      }],
    }),
  }))
  await expect(searchTmdbWork({
    media: 'movie',
    workTitle: '示例电影',
  }, {
    fetchImpl,
    token: 'test-token',
    region: 'cn',
  })).resolves.toMatchObject({
    title: 'Example Film',
    language: 'en',
    catalog: 'tmdb',
    catalogId: '99',
  })
})
