import { expect, jest, test } from '@jest/globals'

import {
  searchSteamWork,
  searchTmdbWork,
  searchTvmazeWork,
  searchVndbWork,
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

test('VNDB resolves a visual novel to its Japanese main title', async () => {
  const fetchImpl = jest.fn(async (_url, options) => ({
    ok: true,
    json: async () => ({
      results: [{
        id: 'v123',
        title: 'Sample Story',
        alttitle: 'サンプル物語',
        titles: [
          { lang: 'ja', title: 'サンプル物語', main: true },
          { lang: 'en', title: 'Sample Story', main: false },
        ],
        image: { url: 'https://img.test/v123.jpg' },
      }],
    }),
  }))
  await expect(searchVndbWork({
    media: 'visual-novel',
    workTitle: 'サンプル物語',
  }, { fetchImpl })).resolves.toMatchObject({
    title: 'サンプル物語',
    language: 'ja',
    catalog: 'vndb',
    catalogId: 'v123',
  })
  expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toMatchObject({
    filters: ['search', '=', 'サンプル物語'],
  })
})

test('Steam is collected as exact game identity evidence', async () => {
  const fetchImpl = jest.fn(async () => ({
    ok: true,
    json: async () => ({
      items: [{ id: 321, name: 'Example Quest' }],
    }),
  }))
  await expect(searchSteamWork({
    media: 'jrpg',
    workTitle: 'Example Quest',
  }, { fetchImpl })).resolves.toMatchObject({
    title: 'Example Quest',
    language: 'und',
    catalog: 'steam',
    catalogId: '321',
  })
})
