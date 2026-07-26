import { expect, jest, test } from '@jest/globals'

import {
  fetchAnimeThemesProductionVideo,
  selectAnimeThemesSongOrigin,
  selectAnimeThemesProductionVideo,
} from './animethemes-api.js'

test('a transliterated single title recovers its direct TV anime origin', () => {
  expect(selectAnimeThemesSongOrigin([{
    id: 2106,
    title: 'Yoake Umare Kuru Shoujo',
    animethemes: [{
      id: 2106,
      sequence: 1,
      type: 'ED',
      anime: {
        id: 2573,
        name: 'Shakugan no Shana',
        slug: 'shakugan_no_shana',
        media_format: 'TV',
      },
    }],
  }], {
    title: '夜明け生まれ来る少女',
  }, ['Yoake umareru Shoujo'])).toMatchObject({
    subtitle: 'TV anime 「Shakugan no Shana」 ending theme',
    sourceHint: {
      service: 'animethemes',
      animeId: 2573,
      animeSlug: 'shakugan_no_shana',
    },
  })
})

const origin = {
  original_verified: true,
  work_title: 'サンプル作品',
  medium: 'tv',
  role: 'ending',
  sequence: '1',
  catalog: 'anilist',
  catalog_id: '123',
}

test('selects safe footage for the verified role and sequence', () => {
  expect(selectAnimeThemesProductionVideo({
    id: 9,
    name: 'Sample Work',
    animethemes: [{
      id: 10,
      type: 'OP',
      slug: 'OP1',
      animethemeentries: [{
        nsfw: false,
        videos: [{ link: 'https://v.animethemes.moe/op.webm' }],
      }],
    }, {
      id: 11,
      type: 'ED',
      sequence: 1,
      slug: 'ED1',
      animethemeentries: [{
        nsfw: false,
        spoiler: false,
        videos: [{
          link: 'https://v.animethemes.moe/ed.webm',
          nc: true,
          resolution: 1080,
        }],
      }],
    }],
  }, origin)).toMatchObject({
    source: 'animethemes',
    webpageUrl: 'https://v.animethemes.moe/ed.webm',
    themeId: '11',
  })
})

test('fetches production footage by a verified AniList identity', async () => {
  const fetchImpl = jest.fn(async () => ({
    ok: true,
    json: async () => ({
      anime: [{
        id: 9,
        name: 'Sample Work',
        animethemes: [{
          id: 11,
          type: 'ED',
          sequence: 1,
          slug: 'ED1',
          animethemeentries: [{
            nsfw: false,
            videos: [{ link: 'https://v.animethemes.moe/ed.webm' }],
          }],
        }],
      }],
    }),
  }))
  await expect(fetchAnimeThemesProductionVideo({
    origin,
  }, { fetchImpl })).resolves.toMatchObject({
    source: 'animethemes',
    themeId: '11',
  })
  expect(String(fetchImpl.mock.calls[0][0]))
    .toContain('filter%5Bexternal_id%5D=123')
})
