import { expect, jest, test } from '@jest/globals'

import {
  searchAniListWork,
  selectAniListWorkCandidate,
} from './anilist-api.js'

test('a localized alias resolves to the direct production native title', () => {
  expect(selectAniListWorkCandidate([{
    id: 14813,
    format: 'TV',
    title: {
      native: 'やはり俺の青春ラブコメはまちがっている。',
      romaji: 'Yahari Ore no Seishun Love Come wa Machigatteiru.',
      english: 'My Teen Romantic Comedy SNAFU',
    },
    synonyms: ['我的青春恋爱物语果然有问题'],
    coverImage: { extraLarge: 'https://s4.anilist.co/file/poster.jpg' },
  }], {
    media: 'tv',
    workTitle: '我的青春恋爱物语果然有问题。',
  })).toMatchObject({
    title: 'やはり俺の青春ラブコメはまちがっている。',
    language: 'ja',
    catalog: 'anilist',
    catalogId: '14813',
    evidence: 'catalog-alias',
  })
})

test('country of origin overrides Han-only title script inference', () => {
  expect(selectAniListWorkCandidate([{
    id: 4155,
    format: 'TV',
    countryOfOrigin: 'JP',
    title: { native: '舞-HiME', romaji: 'Mai-HiME' },
  }], { media: 'tv', workTitle: 'Mai-HiME' })).toMatchObject({
    title: '舞-HiME', language: 'ja', catalogId: '4155',
  })
  expect(selectAniListWorkCandidate([{
    id: 7001,
    format: 'TV',
    countryOfOrigin: 'CN',
    title: { native: '大鱼海棠', romaji: 'Da Yu Hai Tang' },
  }], { media: 'tv', workTitle: '大鱼海棠' })).toMatchObject({
    title: '大鱼海棠', language: 'zh', catalogId: '7001',
  })
})

test('an ambiguous partial title is not accepted', () => {
  const base = {
    format: 'TV',
    title: { native: 'サンプル作品', romaji: 'Sample Work' },
    synonyms: ['示例作品'],
  }
  expect(selectAniListWorkCandidate([
    { ...base, id: 1 },
    { ...base, id: 2, title: { native: 'サンプル作品 続編' } },
  ], {
    media: 'tv',
    workTitle: '示例',
  })).toBeNull()
})

test('AniList lookup is bounded and parses GraphQL media records', async () => {
  const fetchImpl = jest.fn(async () => ({
    ok: true,
    json: async () => ({
      data: {
        Page: {
          media: [{
            id: 488,
            format: 'TV',
            title: {
              native: '苺ましまろ',
              romaji: 'Ichigo Mashimaro',
              english: 'Strawberry Marshmallow',
            },
            synonyms: ['草莓棉花糖'],
            coverImage: { large: 'https://s4.anilist.co/poster.jpg' },
          }],
        },
      },
    }),
  }))
  await expect(searchAniListWork({
    media: 'tv',
    workTitle: '草莓棉花糖',
  }, { fetchImpl })).resolves.toMatchObject({
    title: '苺ましまろ',
    catalogId: '488',
  })
  expect(fetchImpl).toHaveBeenCalledWith(
    'https://graphql.anilist.co',
    expect.objectContaining({ method: 'POST' }),
  )
})

test('AniList ID lookup uses country of origin for Japanese Han-only titles', async () => {
  const fetchImpl = jest.fn(async () => ({
    ok: true,
    json: async () => ({ data: { Media: {
      id: 4155,
      format: 'TV',
      countryOfOrigin: 'JP',
      title: { native: '舞-HiME' },
      coverImage: {},
    } } }),
  }))
  const { fetchAniListWorkById } = await import('./anilist-api.js')
  await expect(fetchAniListWorkById(4155, { fetchImpl })).resolves.toMatchObject({
    title: '舞-HiME', language: 'ja', catalogId: '4155',
  })
})
