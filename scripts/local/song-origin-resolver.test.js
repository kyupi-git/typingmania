import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import { jest, test } from '@jest/globals'

import SongOriginResolver, {
  japaneseAlbumTitle,
  resolveSongOrigin,
  SONG_ORIGIN_VERSION,
} from './song-origin-resolver.js'

test('Japanese character-song albums expose the native production title', () => {
  expect(japaneseAlbumTitle('草莓棉花糖', [{
    album: '苺ましまろ キャラクターソングアルバム (草莓棉花糖 角色歌专辑)',
    albumMid: 'album-1',
  }])).toEqual({
    title: '苺ましまろ',
    albumMid: 'album-1',
  })
  expect(japaneseAlbumTitle('我的青春恋爱物语果然有问题。', [{
    album: 'TVアニメ｢やはり俺の青春ラブコメはまちがっている｡｣キャラクターソング集',
  }])).toMatchObject({
    title: 'やはり俺の青春ラブコメはまちがっている｡',
  })
})

function metadata (overrides = {}) {
  return {
    title: 'サンプル曲',
    subtitle: '《示例作品》TV动画片尾曲2',
    artist: 'サンプル歌手',
    artistNames: ['サンプル歌手'],
    album: 'サンプル曲',
    albumMid: 'single',
    language: 'JP',
    ...overrides,
  }
}

function showDownFetchImpl () {
  return jest.fn(async url => {
    const requestUrl = String(url)
    if (requestUrl.includes('/subject_search/')) {
      throw new TypeError('Use the catalog API in this test.')
    }
    if (requestUrl.endsWith('/subjects/621835')) {
      return {
        ok: true,
        json: async () => ({
          id: 621835,
          type: 2,
          name: '도굴왕',
          name_cn: '我独自盗墓',
          platform: 'TV',
          meta_tags: ['日本', '韩国', 'TV'],
          infobox: [{
            key: '别名',
            value: [
              { k: '日文版', v: '盗掘王' },
              { k: '英文版', v: 'Tomb Raider King' },
              { k: '漫画版', v: '我独自盗墓' },
            ],
          }, {
            key: '原作',
            value: '산지직송',
          }],
        }),
      }
    }
    return {
      ok: true,
      json: async () => ({
        data: [{
          id: 621835,
          type: 2,
          name: '도굴왕',
          name_cn: '我独自盗墓',
          platform: 'TV',
          meta_tags: ['日本', '韩国', 'TV'],
          collection: { collect: 5000 },
        }],
      }),
    }
  })
}

test('an exact catalog match stores the official original title and structure', async () => {
  const fetchImpl = jest.fn(async () => ({
    ok: true,
    json: async () => ({
      data: [{
        id: 123456,
        type: 2,
        name: 'サンプル作品',
        name_cn: '示例作品',
        platform: 'TV',
        infobox: [{
          key: '主题歌演出',
          value: 'サンプル歌手（ED2）',
        }],
        meta_tags: ['日本', 'TV'],
        collection: { collect: 7000 },
      }],
    }),
  }))
  const origin = await resolveSongOrigin({
    metadata: metadata(),
    fetchImpl,
  })
  expect(origin).toMatchObject({
    version: SONG_ORIGIN_VERSION,
    work_title: 'サンプル作品',
    original_language: 'ja',
    original_verified: true,
    title_source: 'catalog-primary',
    medium: 'tv',
    role: 'ending',
    sequence: '2',
    catalog: 'bangumi',
    catalog_id: '123456',
  })
  expect(fetchImpl).toHaveBeenCalledTimes(2)
})

test('a theme uses the direct Japanese anime title, not its source-work title', async () => {
  const fetchImpl = showDownFetchImpl()
  const origin = await resolveSongOrigin({
    metadata: metadata({
      title: 'SHOW DOWN',
      subtitle: '《我独自盗墓》TV动画片头曲',
      artist: 'QWER',
      artistNames: ['QWER'],
    }),
    fetchImpl,
  })
  expect(origin).toMatchObject({
    work_title: '盗掘王',
    original_language: 'ja',
    original_verified: true,
    title_source: 'catalog-primary',
    title_scope: 'direct-production',
    evidence: 'catalog-direct-release-title',
  })
  expect(fetchImpl).toHaveBeenCalledTimes(5)
})

test('Japanese kanji and kana are not mistaken for a localized Chinese title', async () => {
  const fetchImpl = jest.fn(async () => ({
    ok: true,
    json: async () => ({
      data: [{
        id: 583862,
        type: 2,
        name: '世界最強の後衛 ～迷宮国の新人探索者～',
        name_cn: '世界最强的后卫 ～迷宫国的新人探索者～',
        platform: 'TV',
        meta_tags: ['日本', 'TV'],
      }],
    }),
  }))
  const origin = await resolveSongOrigin({
    metadata: metadata({
      subtitle: '《世界最强的后卫 ～迷宫国的新人探索者～》TV动画片头曲',
    }),
    fetchImpl,
  })
  expect(origin).toMatchObject({
    work_title: '世界最強の後衛 ～迷宮国の新人探索者～',
    original_language: 'ja',
  })
  expect(fetchImpl).toHaveBeenCalledTimes(2)
})

test('unrelated search results are rejected instead of guessing', async () => {
  const origin = await resolveSongOrigin({
    metadata: metadata(),
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        data: [{
          id: 1,
          name: '別の作品',
          name_cn: '另一个作品',
          platform: 'TV',
        }],
      }),
    }),
  })
  expect(origin).toBeNull()
})

test('live-action productions use Bangumi real-subject search, not anime records', async () => {
  const fetchImpl = jest.fn(async url => {
    expect(String(url)).toContain('cat=6')
    return {
      ok: true,
      text: async () => `
        <li id="item_654" class="item odd clearit">
          <div class="inner"><h3>
            <a href="/subject/654" class="l">示例电视剧</a>
            <small class="grey">Example Drama</small>
          </h3></div>
        </li>
      `,
    }
  })
  const origin = await resolveSongOrigin({
    metadata: metadata({
      subtitle: '电视剧《示例电视剧》片头曲',
      language: 'EN',
    }),
    fetchImpl,
  })
  expect(origin).toMatchObject({
    work_title: 'Example Drama',
    medium: 'television',
    role: 'opening',
    catalog: 'bangumi',
    catalog_id: '654',
  })
})

test('a localized catalog primary title is rejected for a Japanese work', async () => {
  const origin = await resolveSongOrigin({
    metadata: metadata({
      subtitle: '《示例花季少年 第2季》TV动画片头曲',
    }),
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        data: [{
          id: 2,
          name: '示例花季少年 第2季',
          name_cn: '示例花季少年 第二季',
          platform: 'TV',
          meta_tags: ['日本', 'TV'],
        }],
      }),
    }),
  })
  expect(origin).toBeNull()
})

test('a small error in a localized season title still resolves to a verified original', async () => {
  const origin = await resolveSongOrigin({
    metadata: metadata({
      subtitle: '《示例花季少年 第2季》TV动画片头曲',
    }),
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        data: [{
          id: 3,
          name: 'サンプル花ざかり 第2期',
          name_cn: '示例花样少年 第二季',
          platform: 'TV',
          meta_tags: ['日本', 'TV'],
          collection: { collect: 500 },
        }],
      }),
    }),
  })
  expect(origin).toMatchObject({
    work_title: 'サンプル花ざかり 第2期',
    original_language: 'ja',
    original_verified: true,
    title_source: 'catalog-primary',
    evidence: 'catalog-fuzzy-localized-title',
  })
})

test('the mainland-accessible catalog website exposes localized and original titles separately', async () => {
  const fetchImpl = jest.fn(async () => ({
    ok: true,
    text: async () => `
      <li id="item_321" class="item odd clearit">
        <div class="inner"><h3>
          <a href="/subject/321" class="l">示例花样少年 第二季</a>
          <small class="grey">サンプル花ざかり 第2期</small>
        </h3></div>
      </li>
    `,
  }))
  const origin = await resolveSongOrigin({
    metadata: metadata({
      subtitle: '《示例花季少年 第2季》TV动画片头曲',
    }),
    fetchImpl,
  })

  expect(fetchImpl).toHaveBeenCalledTimes(1)
  expect(origin).toMatchObject({
    work_title: 'サンプル花ざかり 第2期',
    original_language: 'ja',
    original_verified: true,
    title_source: 'catalog-primary',
  })
})

test('a verified QQ Music soundtrack title is a network-failure fallback', async () => {
  const origin = await resolveSongOrigin({
    metadata: metadata({
      title: 'サンプル映画主題歌',
      subtitle: '《示例电影》剧场版主题曲',
    }),
    cover: {
      albumMid: 'soundtrack',
      album: 'サンプル映画 オリジナル・サウンドトラック (示例电影)',
    },
    fetchImpl: async () => {
      throw new TypeError('network unavailable')
    },
  })
  expect(origin).toMatchObject({
    work_title: 'サンプル映画',
    original_language: 'ja',
    original_verified: true,
    title_source: 'soundtrack-album',
    medium: 'film',
    role: 'theme',
    catalog: 'qqmusic',
    catalog_id: 'soundtrack',
    evidence: 'soundtrack-album',
  })
})

test('a cached work identity keeps each song own role and episode structure', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-origin-cache-'))
  try {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        data: [{
          id: 999,
          type: 2,
          name: 'サンプル群像',
          name_cn: '示例群像',
          platform: 'TV',
          meta_tags: ['日本', 'TV'],
        }],
      }),
    }))
    const resolver = new SongOriginResolver({ root, fetchImpl })
    const opening = await resolver.resolve(metadata({
      subtitle: '《示例群像》TV动画片头曲',
    }))
    const ending = await resolver.resolve(metadata({
      subtitle: '《示例群像》TV动画第6、8话片尾曲',
    }))

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(opening).toMatchObject({
      work_title: 'サンプル群像',
      role: 'opening',
      episodes: [],
    })
    expect(ending).toMatchObject({
      work_title: 'サンプル群像',
      role: 'ending',
      episodes: ['6', '8'],
    })
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('catalog aliases tolerate parenthetical, expanded, and season-number variants', async () => {
  const cases = [
    {
      subtitle: '《示例青春二周目》TV动画片头曲',
      artist: '示例歌手甲',
      expected: 'サンプル青春ニューゲーム',
      candidate: {
        name: 'サンプル青春ニューゲーム',
        name_cn: '示例青春游戏的完整标题',
        alias: '示例青春二周目（NEW GAME+）',
      },
    },
    {
      subtitle: '《示例书痴 领主养女》TV动画片尾曲',
      artist: '示例歌手乙',
      expected: 'サンプル書物語 領主の養女',
      candidate: {
        name: 'サンプル書物語 領主の養女',
        name_cn: '示例书痴 〜为了成为图书管理员〜 领主养女',
      },
    },
    {
      subtitle: '《示例市民系列 第2季》TV动画片尾曲',
      artist: '示例歌手丙',
      expected: 'サンプル市民シリーズ 第2期',
      candidate: {
        name: 'サンプル市民シリーズ 第2期',
        name_cn: '示例市民系列 第二季',
      },
    },
  ]

  for (const [index, item] of cases.entries()) {
    const origin = await resolveSongOrigin({
      metadata: metadata({
        subtitle: item.subtitle,
        artist: item.artist,
        artistNames: [item.artist],
      }),
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          data: [{
            id: index + 1,
            name: item.candidate.name,
            name_cn: item.candidate.name_cn,
            platform: 'TV',
            infobox: [
              ...(item.candidate.alias
                ? [{ key: '别名', value: [{ v: item.candidate.alias }] }]
                : []),
              { key: '主题歌演出', value: item.artist },
            ],
            meta_tags: ['日本', 'TV'],
          }],
        }),
      }),
    })
    expect(origin?.work_title).toBe(item.expected)
  }
})

test('a cached source-work title is replaced by the direct anime title', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-origin-cache-'))
  const filename = path.join(root, 'data', 'song-origin-cache.json')
  const entryKey = 'JP:我独自盗墓'
  try {
    await fs.mkdir(path.dirname(filename), { recursive: true })
    await fs.writeFile(filename, JSON.stringify({
      version: 4,
      entries: {
        [entryKey]: {
          checked_at: new Date().toISOString(),
          origin: {
            version: SONG_ORIGIN_VERSION,
            work_title: '도굴왕',
            original_language: 'ja',
            original_verified: true,
            title_source: 'catalog-primary',
            medium: 'tv',
            role: 'opening',
          },
        },
      },
    }))
    const resolver = new SongOriginResolver({
      root,
      fetchImpl: showDownFetchImpl(),
    })
    const origin = await resolver.resolve(metadata({
      subtitle: '《我独自盗墓》TV动画片头曲',
    }))
    expect(origin).toMatchObject({
      work_title: '盗掘王',
      original_language: 'ja',
      title_scope: 'direct-production',
    })
    const cache = JSON.parse(await fs.readFile(filename, 'utf8'))
    expect(cache.entries[entryKey].origin).toMatchObject({
      work_title: '盗掘王',
      original_language: 'ja',
      title_scope: 'direct-production',
    })
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
