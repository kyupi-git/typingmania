import { jest, test } from '@jest/globals'

import MediaPosterResolver, {
  fetchAnimePoster,
  parseBangumiSubjectPage,
  POSTER_SELECTION_VERSION,
} from './media-poster.js'

const origin = {
  catalog: 'bangumi',
  catalog_id: '496276',
  work_title: '攻殻機動隊 THE GHOST IN THE SHELL',
}

test('official Bangumi subject image becomes a verified poster', async () => {
  const jpeg = new Uint8Array(512)
  jpeg.set([0xFF, 0xD8, 0xFF])
  let calls = 0
  const poster = await fetchAnimePoster({
    origin,
    fetchImpl: async url => {
      calls++
      if (String(url).includes('/v0/subjects/496276')) {
        expect(url).toBe('https://api.bgm.tv/v0/subjects/496276')
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 496276,
            name: '攻殻機動隊 THE GHOST IN THE SHELL',
            images: {
              large: 'https://lain.bgm.tv/pic/cover/l/test.jpg',
            },
          }),
        }
      }
      expect(url).toBe('https://lain.bgm.tv/pic/cover/l/test.jpg')
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'image/jpeg' },
        arrayBuffer: async () => jpeg.buffer,
      }
    },
  })
  expect(poster).toMatchObject({
    extension: '.jpg',
    version: POSTER_SELECTION_VERSION,
    source: 'bangumi-verified-subject-poster',
    catalogId: '496276',
    workTitle: origin.work_title,
    identityVerified: true,
    verifiedOnline: true,
  })
})

test('subject page parser keeps the current large cover and native title', () => {
  expect(parseBangumiSubjectPage(`
    <title>最強出涸らし皇子の暗躍帝位争い | Bangumi 番组计划</title>
    <h1 class="nameSingle"><a href="/subject/456081">
      最強出涸らし皇子の暗躍帝位争い
    </a></h1>
    <a href="//lain.bgm.tv/pic/cover/l/current.jpg"
      class="thickbox cover"><img class="cover"></a>
  `, '456081')).toEqual({
    title: '最強出涸らし皇子の暗躍帝位争い',
    imageUrl: 'https://lain.bgm.tv/pic/cover/l/current.jpg',
    source: 'bangumi-subject-page',
  })
})

test('a direct release alias validates the same production poster', async () => {
  const directOrigin = {
    catalog: 'bangumi',
    catalog_id: '621835',
    work_title: '盗掘王',
    title_scope: 'direct-production',
  }
  const jpeg = new Uint8Array(512)
  jpeg.set([0xFF, 0xD8, 0xFF])
  const poster = await fetchAnimePoster({
    origin: directOrigin,
    fetchImpl: async url => {
      if (url === 'https://bgm.tv/subject/621835') {
        return {
          ok: true,
          status: 200,
          text: async () => `
            <h1 class="nameSingle"><a href="/subject/621835">
              도굴왕
            </a></h1>
            <a href="https://img.test/tomb-raider-king.jpg"
              class="thickbox cover"></a>
          `,
        }
      }
      if (url === 'https://api.bgm.tv/v0/subjects/621835') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 621835,
            name: '도굴왕',
            name_cn: '我独自盗墓',
            infobox: [{
              key: '别名',
              value: [{ k: '日文版', v: '盗掘王' }],
            }, {
              key: '原作',
              value: '산지직송',
            }],
            images: {
              large: 'https://img.test/tomb-raider-king.jpg',
            },
          }),
        }
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'image/jpeg' },
        arrayBuffer: async () => jpeg.buffer,
      }
    },
  })
  expect(poster).toMatchObject({
    workTitle: '盗掘王',
    catalogId: '621835',
    identityVerified: true,
    referenceSource: 'bangumi-subject-api',
  })
})

test('resolver caches a poster and skips gracefully after repeated network failures', async () => {
  let calls = 0
  const successful = new MediaPosterResolver({
    fetchImpl: async url => {
      calls++
      if (String(url).includes('/v0/subjects/496276')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: 496276,
            name: origin.work_title,
            images: { large: 'https://img.test/poster.png' },
          }),
        }
      }
      const png = new Uint8Array(512)
      png.set([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'image/png' },
        arrayBuffer: async () => png.buffer,
      }
    },
  })
  await successful.resolve(origin)
  await successful.resolve(origin)
  expect(calls).toBe(2)

  const offline = new MediaPosterResolver({
    fetchImpl: async () => { throw new TypeError('offline') },
  })
  expect((await offline.resolve(origin)).checked).toBe(false)
  expect((await offline.resolve({ ...origin, catalog_id: '2' })).checked).toBe(false)
  expect((await offline.resolve({
    ...origin,
    catalog_id: '3',
  })).checked).toBe(false)
  const skipped = await offline.resolve({ ...origin, catalog_id: '4' })
  expect(skipped).toMatchObject({
    checked: false,
    reason: 'network-disabled',
  })
})

test('a mismatched catalog identity removes the poster instead of guessing', async () => {
  const resolver = new MediaPosterResolver({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      text: async () => `
        <h1 class="nameSingle"><a href="/subject/496276">
          まったく別の作品
        </a></h1>
        <a href="https://img.test/wrong.jpg" class="thickbox cover"></a>
      `,
    }),
  })
  expect(await resolver.resolve(origin)).toMatchObject({
    checked: true,
    poster: null,
    reason: 'identity-mismatch',
  })
})

test('a verified TV catalog poster is cached without an anime-only lookup', async () => {
  const jpeg = new Uint8Array(512)
  jpeg.set([0xFF, 0xD8, 0xFF])
  const fetchImpl = jest.fn(async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'image/jpeg' },
    arrayBuffer: async () => jpeg.buffer,
  }))
  const resolver = new MediaPosterResolver({ fetchImpl })
  const televisionOrigin = {
    catalog: 'tvmaze',
    catalog_id: '88',
    work_title: 'Example Drama',
    poster_url: 'https://static.tvmaze.com/uploads/images/original_untouched/example.jpg',
  }
  await expect(resolver.resolve(televisionOrigin)).resolves.toMatchObject({
    checked: true,
    poster: {
      catalog: 'tvmaze',
      catalogId: '88',
      identityVerified: true,
    },
  })
  await resolver.resolve(televisionOrigin)
  expect(fetchImpl).toHaveBeenCalledTimes(1)
})

test('a verified AniList production poster uses the direct CDN image', async () => {
  const jpeg = new Uint8Array(512)
  jpeg.set([0xFF, 0xD8, 0xFF])
  const resolver = new MediaPosterResolver({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'image/jpeg' },
      arrayBuffer: async () => jpeg.buffer,
    }),
  })
  await expect(resolver.resolve({
    catalog: 'anilist',
    catalog_id: '14813',
    work_title: 'やはり俺の青春ラブコメはまちがっている。',
    poster_url: 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/example.jpg',
  })).resolves.toMatchObject({
    checked: true,
    poster: {
      catalog: 'anilist',
      catalogId: '14813',
      identityVerified: true,
    },
  })
})

test('a verified Wikidata production poster accepts Wikimedia Commons', async () => {
  const jpeg = new Uint8Array(512)
  jpeg.set([0xFF, 0xD8, 0xFF])
  const resolver = new MediaPosterResolver({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'image/jpeg' },
      arrayBuffer: async () => jpeg.buffer,
    }),
  })
  await expect(resolver.resolve({
    catalog: 'wikidata',
    catalog_id: 'Q42',
    work_title: 'Example Documentary',
    poster_url:
      'https://commons.wikimedia.org/wiki/Special:Redirect/file/Example.jpg?width=1200',
  })).resolves.toMatchObject({
    checked: true,
    poster: {
      catalog: 'wikidata',
      catalogId: 'Q42',
      identityVerified: true,
    },
  })
})

test('a verified VNDB production poster accepts the official image host', async () => {
  const jpeg = new Uint8Array(512)
  jpeg.set([0xFF, 0xD8, 0xFF])
  const resolver = new MediaPosterResolver({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'image/jpeg' },
      arrayBuffer: async () => jpeg.buffer,
    }),
  })
  await expect(resolver.resolve({
    catalog: 'vndb',
    catalog_id: 'v123',
    work_title: 'サンプルノベル',
    poster_url: 'https://t.vndb.org/cv/12/12345.jpg',
  })).resolves.toMatchObject({
    checked: true,
    poster: {
      catalog: 'vndb',
      catalogId: 'v123',
      identityVerified: true,
    },
  })
})
