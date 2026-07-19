import { test } from '@jest/globals'

import AnimePosterResolver, {
  fetchAnimePoster,
  parseBangumiSubjectPage,
  POSTER_SELECTION_VERSION,
} from './anime-poster.js'

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
      if (calls === 1) {
        expect(url).toBe('https://bgm.tv/subject/496276')
        return {
          ok: true,
          status: 200,
          text: async () => `
            <title>攻殻機動隊 THE GHOST IN THE SHELL | Bangumi</title>
            <h1 class="nameSingle"><a href="/subject/496276">
              攻殻機動隊 THE GHOST IN THE SHELL
            </a></h1>
            <a href="//lain.bgm.tv/pic/cover/l/test.jpg"
              class="thickbox cover"><img class="cover"></a>
          `,
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
  const successful = new AnimePosterResolver({
    fetchImpl: async url => {
      calls++
      if (String(url).includes('/subject/496276')) {
        return {
          ok: true,
          status: 200,
          text: async () => `
            <h1 class="nameSingle"><a href="/subject/496276">
              ${origin.work_title}
            </a></h1>
            <a href="https://img.test/poster.png"
              class="thickbox cover"></a>
          `,
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

  const offline = new AnimePosterResolver({
    fetchImpl: async () => { throw new TypeError('offline') },
  })
  expect((await offline.resolve(origin)).checked).toBe(false)
  expect((await offline.resolve({ ...origin, catalog_id: '2' })).checked).toBe(false)
  const skipped = await offline.resolve({ ...origin, catalog_id: '3' })
  expect(skipped).toMatchObject({
    checked: false,
    reason: 'network-disabled',
  })
})

test('a mismatched catalog identity removes the poster instead of guessing', async () => {
  const resolver = new AnimePosterResolver({
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
