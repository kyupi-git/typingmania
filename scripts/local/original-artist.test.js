import fs from 'fs/promises'
import os from 'os'
import path from 'path'

import { test } from '@jest/globals'

import OriginalArtistResolver, {
  looksLocalizedArtistName,
  originalArtistFromDetail,
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

test('localized detection distinguishes simplified aliases from Japanese shinjitai', () => {
  expect(looksLocalizedArtistName('仓木麻衣', { language: 'JP' })).toBe(true)
  expect(looksLocalizedArtistName('国府田マリ子', { language: 'JP' })).toBe(false)
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
