import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import { test } from '@jest/globals'

import OriginalArtistResolver, {
  ORIGINAL_ARTIST_VERSION,
  looksLocalizedArtistName,
  originalArtistFromDetail,
  splitArtistCredits,
  normalizeArtistCredits,
} from './original-artist.js'

const nanaDetail = {
  basic_info: {
    singer_mid: '0027n73d00Pkeq',
    name: '七音阿卡莉 (NANAOAKARI)',
  },
  ex_info: {
    area: 2,
    desc: 'ナナヲアカリ (1995年11月12日-)は、日本の女性ロック歌手。',
    foreign_name: '',
  },
  wiki: '<info><basic><item><key><![CDATA[外文名]]></key>' +
    '<value><![CDATA[ナナヲアカリ]]></value></item>' +
    '<item><key><![CDATA[别名]]></key>' +
    '<value><![CDATA[NANAOAKARI]]></value></item></basic></info>',
}

const tomoriDetail = {
  basic_info: {
    singer_mid: '002EsuGX1jjaaM',
    name: '楠木灯 (楠木ともり)',
  },
  ex_info: {
    area: 2,
    desc: '楠木灯是日本的女性声优。',
    foreign_name: '楠木ともり',
  },
  wiki: '<info><basic><item><key><![CDATA[外文名]]></key>' +
    '<value><![CDATA[くすのき ともり]]></value></item></basic></info>',
}

const manakaDetail = {
  basic_info: {
    singer_mid: 'manaka-mid',
    name: '石見舞菜香 (いわみ まなか)',
  },
  ex_info: {
    area: 2,
    foreign_name: 'いわみ まなか',
  },
}

test('QQ Music wiki foreign name replaces a localized Japanese singer name', () => {
  expect(looksLocalizedArtistName(
    '七音阿卡莉 (NANAOAKARI)',
    { language: 'JP', detail: nanaDetail },
  )).toBe(true)
  expect(originalArtistFromDetail({
    rawName: '七音阿卡莉 (NANAOAKARI)',
    detail: nanaDetail,
    language: 'JP',
    singerMid: '0027n73d00Pkeq',
  })).toMatchObject({
    originalName: 'ナナヲアカリ',
    resolved: true,
    source: 'qqmusic-wiki-外文名',
    confidence: 1,
  })
})

test('singer detail resolves an unmarked all-Han localized alias', () => {
  expect(originalArtistFromDetail({
    rawName: '楠木灯',
    detail: tomoriDetail,
    language: 'JP',
    singerMid: '002EsuGX1jjaaM',
  })).toMatchObject({
    originalName: '楠木ともり',
    resolved: true,
    source: 'qqmusic-singer-foreign-name',
    confidence: 1,
  })
})

test('Japanese Han writing is not replaced by a kana pronunciation field', () => {
  expect(originalArtistFromDetail({
    rawName: '石見舞菜香',
    detail: manakaDetail,
    language: 'JP',
  })).toMatchObject({
    originalName: '石見舞菜香',
    resolved: true,
    source: 'qqmusic-track-name',
  })
  expect(originalArtistFromDetail({
    rawName: '前島麻由',
    detail: {
      ex_info: { area: 2, foreign_name: 'まえしま まゆ' },
      basic_info: { name: '前島麻由 (まえしま まゆ)' },
    },
    language: 'JP',
  }).originalName).toBe('前島麻由')
})

test('written-name parentheses keep trustworthy primary scripts', () => {
  expect(originalArtistFromDetail({
    rawName: '石見舞菜香 (いわみ まなか)', language: 'JP',
  })).toMatchObject({ originalName: '石見舞菜香', resolved: true })
  expect(originalArtistFromDetail({
    rawName: '周杰伦 (Jay Chou)', language: 'ZH',
  }).originalName).toBe('周杰伦')
  expect(originalArtistFromDetail({
    rawName: 'Taylor Swift (泰勒·斯威夫特)', language: 'EN',
  }).originalName).toBe('Taylor Swift')
  expect(originalArtistFromDetail({
    rawName: '仓木麻衣 (くらき まい)', language: 'JP',
  })).toMatchObject({ originalName: '', resolved: false })
})

test('track-language localization is not cleared by a different detail family', () => {
  expect(originalArtistFromDetail({
    rawName: '七音阿卡莉',
    language: 'EN',
    detail: {
      ex_info: { area: 2 },
      basic_info: { name: '七音阿卡莉' },
    },
  })).toMatchObject({
    originalName: '',
    resolved: false,
  })
})

test('English tracks can resolve a Japanese original from independent detail evidence', () => {
  expect(originalArtistFromDetail({
    rawName: '七音阿卡莉',
    language: 'EN',
    detail: {
      ex_info: { area: 2, foreign_name: 'ナナヲアカリ' },
      basic_info: { name: '七音阿卡莉 (ナナヲアカリ)' },
    },
  })).toMatchObject({
    originalName: 'ナナヲアカリ',
    resolved: true,
  })
})

test('localized detection distinguishes simplified aliases from Japanese shinjitai', () => {
  expect(looksLocalizedArtistName('仓木麻衣', { language: 'JP' })).toBe(true)
  expect(looksLocalizedArtistName('纯情的Afilia', { language: 'JP' })).toBe(true)
  expect(looksLocalizedArtistName('纯情的Afilia')).toBe(true)
  expect(looksLocalizedArtistName('国府田マリ子', { language: 'JP' })).toBe(false)
})

test('a mixed translated band alias resolves to its official Japanese name', () => {
  expect(originalArtistFromDetail({
    rawName: '纯情的Afilia',
    language: 'JP',
    detail: {
      ex_info: {
        area: 2,
        foreign_name: '純情のアフィリア',
      },
    },
  })).toMatchObject({
    originalName: '純情のアフィリア',
    resolved: true,
    source: 'qqmusic-singer-foreign-name',
  })
})

test('a compound wiki alias field yields one native primary name', () => {
  const resolution = originalArtistFromDetail({
    rawName: '青木阳菜',
    language: 'JP',
    detail: {
      ex_info: { area: 2 },
      wiki: '<item><key><![CDATA[外文名]]></key>' +
        '<value><![CDATA[Aoki Hina、青木陽菜]]></value></item>',
    },
  })
  expect(resolution.originalName).toBe('青木陽菜')

  const withReading = originalArtistFromDetail({
    rawName: '前岛麻由',
    language: 'JP',
    detail: {
      ex_info: { area: 2 },
      wiki: '<item><key><![CDATA[外文名]]></key>' +
        '<value><![CDATA[前島 麻由(まえしま まゆ)、Maeshima Mayu]]>' +
        '</value></item>',
    },
  })
  expect(withReading.originalName).toBe('前島麻由')
})

test('role credits and already-native artist names remain intact', () => {
  expect(originalArtistFromDetail({
    rawName: 'マジカルフィジカル☆くるる(CV:釘宮理恵)',
    language: 'JP',
  }).originalName).toBe('マジカルフィジカル☆くるる(CV:釘宮理恵)')
  expect(originalArtistFromDetail({
    rawName: 'LiSA',
    language: 'JP',
  }).originalName).toBe('LiSA')
  expect(originalArtistFromDetail({
    rawName: '中島美嘉',
    language: 'JP',
  }).originalName).toBe('中島美嘉')
})

test('role CV credit is one semantic artist and biographies are rejected', () => {
  expect(splitArtistCredits('メリダ=アンジェル（C.V.楠木ともり）'))
    .toEqual(['メリダ=アンジェル(C.V.楠木ともり)'])
  expect(originalArtistFromDetail({
    rawName: '1995年出生，是日本的女性歌手。', language: 'JP',
  })).toMatchObject({ originalName: '', resolved: false })
  expect(splitArtistCredits('Earth, Wind & Fire')).toEqual(['Earth, Wind & Fire'])
  expect(splitArtistCredits('Simon & Garfunkel')).toEqual(['Simon & Garfunkel'])
  expect(normalizeArtistCredits([
    'メリダ=アンジェル（CV.楠木ともり）', '楠木ともり',
  ])).toEqual(['メリダ=アンジェル(CV.楠木ともり)'])
  // Two unrelated provider array items remain two singers: no inferred CV link.
  expect(normalizeArtistCredits(['角色A', '声优B'])).toEqual(['角色A', '声优B'])
  expect(originalArtistFromDetail({ rawName: 'Born', language: 'EN' }).originalName)
    .toBe('Born')
})

test('localized Han alias may use explicit Japanese stage-name evidence', () => {
  expect(originalArtistFromDetail({
    rawName: '爱缪', language: 'JP', detail: {
      ex_info: { area: 2, foreign_name: 'あいみょん', desc: '1995年出生，是日本歌手。' },
      basic_info: { name: '爱缪 (あいみょん)' },
    },
  })).toMatchObject({ originalName: 'あいみょん', resolved: true })
  expect(originalArtistFromDetail({
    rawName: '石見舞菜香', language: 'JP', detail: {
      ex_info: { area: 2, foreign_name: 'いわみ まなか' },
    },
  }).originalName).toBe('石見舞菜香')
})

test('a suspicious localization is blank when no trustworthy original exists', () => {
  expect(originalArtistFromDetail({
    rawName: '七音阿卡莉 (NANAOAKARI)',
    language: 'JP',
  })).toMatchObject({
    originalName: '',
    resolved: false,
    source: 'network-unavailable',
  })
  expect(originalArtistFromDetail({
    rawName: '中岛美嘉',
    language: 'JP',
  }).originalName).toBe('')
  expect(originalArtistFromDetail({
    rawName: '水树奈奈',
    language: 'JP',
  }).originalName).toBe('')
  expect(originalArtistFromDetail({
    rawName: '防弹少年团',
    language: 'KO',
  }).originalName).toBe('')
  expect(originalArtistFromDetail({
    rawName: '泰勒·斯威夫特',
    language: 'EN',
  }).originalName).toBe('')
})

test('Korean and English localizations use the domestic native-name field', () => {
  expect(originalArtistFromDetail({
    rawName: '防弹少年团',
    language: 'KO',
    detail: {
      ex_info: { area: 3 },
      wiki: '<item><key><![CDATA[外文名]]></key>' +
        '<value><![CDATA[방탄소년단]]></value></item>',
    },
  }).originalName).toBe('방탄소년단')
  expect(originalArtistFromDetail({
    rawName: '泰勒·斯威夫特',
    language: 'EN',
    detail: {
      wiki: '<item><key><![CDATA[外文名]]></key>' +
        '<value><![CDATA[Taylor Swift]]></value></item>',
    },
  }).originalName).toBe('Taylor Swift')
})

test('resolver batches QQ Music domestic details and reuses its local cache', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-original-artist-'))
  let calls = 0
  let requestedUrl = ''
  let requestedMids = []
  const fetchImpl = async (url, options) => {
    calls++
    requestedUrl = String(url)
    requestedMids = JSON.parse(options.body).req.param.singer_mids
    return {
      ok: true,
      status: 200,
      json: async () => ({
        req: {
          code: 0,
          data: { singer_list: [nanaDetail] },
        },
      }),
    }
  }
  try {
    const first = new OriginalArtistResolver({
      root,
      cookie: 'test-cookie',
      fetchImpl,
    })
    const resolved = await first.resolve([{
      id: 2119260,
      mid: '0027n73d00Pkeq',
      name: '七音阿卡莉 (NANAOAKARI)',
    }], { language: 'JP' })
    expect(first.lastNetworkError).toBe('')
    expect(resolved).toMatchObject({
      artist: 'ナナヲアカリ',
      resolved: true,
    })
    expect(requestedUrl).toBe('https://u.y.qq.com/cgi-bin/musicu.fcg')
    expect(requestedMids).toEqual(['0027n73d00Pkeq'])

    const second = new OriginalArtistResolver({
      root,
      cookie: 'test-cookie',
      fetchImpl,
    })
    const cached = await second.resolve([{
      id: 2119260,
      mid: '0027n73d00Pkeq',
      name: '七音阿卡莉 (NANAOAKARI)',
    }], { language: 'JP' })
    expect(cached.artist).toBe('ナナヲアカリ')
    expect(calls).toBe(1)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('fresh localized cache entries are re-fetched instead of trusted', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-stale-artist-cache-'))
  let calls = 0
  const mid = '0027n73d00Pkeq'
  try {
    await fs.mkdir(path.join(root, 'data'), { recursive: true })
    await fs.writeFile(path.join(root, 'data', 'qqmusic-artist-cache.json'), JSON.stringify({
      version: ORIGINAL_ARTIST_VERSION,
      entries: {
        [mid]: {
          checked_at: new Date().toISOString(),
          raw_name: '仓木麻衣',
          original_name: '仓木麻衣',
          resolved: true,
          source: 'stale-test',
          confidence: 1,
        },
      },
    }))
    const resolver = new OriginalArtistResolver({
      root,
      fetchImpl: async () => {
        calls++
        return {
          ok: true,
          status: 200,
          json: async () => ({ req: { code: 0, data: { singer_list: [nanaDetail] } } }),
        }
      },
    })
    await expect(resolver.resolve([{
      mid,
      name: '仓木麻衣',
      language: 'JP',
    }])).resolves.toMatchObject({ artist: 'ナナヲアカリ', resolved: true })
    expect(calls).toBe(1)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('fresh negative cache entries stay unresolved without re-fetching', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-negative-artist-cache-'))
  const mid = '0027n73d00Pkeq'
  let calls = 0
  try {
    await fs.mkdir(path.join(root, 'data'), { recursive: true })
    await fs.writeFile(path.join(root, 'data', 'qqmusic-artist-cache.json'), JSON.stringify({
      version: ORIGINAL_ARTIST_VERSION,
      entries: {
        [mid]: {
          checked_at: new Date().toISOString(),
          raw_name: '楠木灯',
          original_name: '',
          resolved: false,
          source: 'negative-test',
          confidence: 0,
        },
      },
    }))
    const resolver = new OriginalArtistResolver({
      root,
      fetchImpl: async () => {
        calls++
        throw new Error('should not fetch fresh negative cache')
      },
    })
    await expect(resolver.resolve([{
      mid,
      name: '楠木灯',
      language: 'JP',
    }])).resolves.toMatchObject({ artist: '', resolved: false })
    expect(calls).toBe(0)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('resolver verifies an all-Han Japanese catalog name before trusting it', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-han-artist-'))
  let calls = 0
  try {
    const resolver = new OriginalArtistResolver({
      root,
      fetchImpl: async () => {
        calls++
        return {
          ok: true,
          status: 200,
          json: async () => ({
            req: {
              code: 0,
              data: { singer_list: [tomoriDetail] },
            },
          }),
        }
      },
    })
    await expect(resolver.resolve([{
      mid: '002EsuGX1jjaaM',
      name: '楠木灯',
    }], { language: 'JP' })).resolves.toMatchObject({
      artist: '楠木ともり',
      resolved: true,
    })
    expect(calls).toBe(1)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('resolver confirms an evidently native artist without a network request', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-native-artist-'))
  let calls = 0
  try {
    const resolver = new OriginalArtistResolver({
      root,
      fetchImpl: async () => {
        calls++
        throw new Error('network should not be used')
      },
    })
    const resolved = await resolver.resolve([{
      mid: 'native-mid',
      name: 'ナナヲアカリ',
    }], { language: 'JP' })
    expect(resolved).toMatchObject({
      artist: 'ナナヲアカリ',
      resolved: true,
    })
    expect(calls).toBe(0)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('resolver verifies an all-Han alias when track language is unknown', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-unknown-artist-'))
  let calls = 0
  try {
    const resolver = new OriginalArtistResolver({
      root,
      fetchImpl: async () => {
        calls++
        return {
          ok: true,
          status: 200,
          json: async () => ({
            req: {
              code: 0,
              data: { singer_list: [tomoriDetail] },
            },
          }),
        }
      },
    })
    const resolved = await resolver.resolve([{
      mid: '002EsuGX1jjaaM',
      name: '楠木灯',
    }])
    expect(resolved).toMatchObject({
      artist: '楠木ともり',
      resolved: true,
    })
    expect(calls).toBe(1)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('resolver fails closed for an unverified all-Han alias', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-offline-artist-'))
  try {
    const resolver = new OriginalArtistResolver({
      root,
      fetchImpl: async () => { throw new Error('offline') },
      timeoutMs: 100,
    })
    const resolved = await resolver.resolve([{
      mid: 'unknown-mid',
      name: '楠木灯',
    }])
    expect(resolved).toMatchObject({ artist: '', resolved: false })
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
