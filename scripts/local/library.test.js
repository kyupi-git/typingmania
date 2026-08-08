import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { TextDecoder, TextEncoder } from 'util'

import { test } from '@jest/globals'

import PackedFile from '../../src/lib/packedfile.js'

globalThis.TextDecoder = TextDecoder
globalThis.TextEncoder = TextEncoder

import {
  canonicalSongTitle,
  songsAreEquivalent,
} from './song-identity.js'
import {
  makeSongsIndex,
  sanitizeUnverifiedImportedArtists,
  scanSongPackages,
} from './library.js'

test('parenthetical aliases do not create a second song identity', () => {
  expect(canonicalSongTitle('サンプル曲 (示例歌曲) (示例歌曲)'))
    .toBe(canonicalSongTitle('サンプル曲 (示例歌曲)'))
  expect(songsAreEquivalent(
    { title: 'サンプル曲 (示例歌曲)', artist: '示例歌手', duration: 272 },
    { title: 'サンプル曲 (示例歌曲) (示例歌曲)', artist: '示例歌手', duration: 270 },
  )).toBe(true)
})

test('named alternate versions and different performers remain distinct', () => {
  expect(songsAreEquivalent(
    { title: 'サンプル曲', artist: '示例歌手甲', duration: 258 },
    { title: 'サンプル曲 (Another ver.)', artist: '示例歌手甲', duration: 258 },
  )).toBe(false)
  expect(songsAreEquivalent(
    { title: '別のサンプル曲', artist: '示例歌手甲', duration: 243 },
    { title: '別のサンプル曲', artist: '示例歌手乙', duration: 243 },
  )).toBe(false)
})

test('QQ Music index preserves chronological added order', () => {
  const index = makeSongsIndex([
    {
      title: 'Newest',
      artist: 'A',
      source: {
        service: 'qqmusic',
        imported_at: '2026-07-03T00:00:00.000Z',
      },
      _local_filename: 'new.typingmania',
    },
    {
      title: 'Oldest fallback',
      artist: 'B',
      source: {
        service: 'qqmusic',
        verified_at: '2026-07-01T00:00:00.000Z',
      },
      _local_filename: 'old.typingmania',
    },
    {
      title: 'Middle',
      artist: 'C',
      source: {
        service: 'qqmusic',
        imported_at: '2026-07-02T00:00:00.000Z',
      },
      _local_filename: 'middle.typingmania',
    },
  ])

  expect(index[0].contents.map(song => song.title))
    .toEqual(['Oldest fallback', 'Middle', 'Newest'])
})

test('each imported provider collection exposes distinct local preview artwork', () => {
  const services = ['qqmusic', 'netease', 'apple-music', 'local-files']
  const index = makeSongsIndex(services.map((service, index) => ({
    title: `Song ${index}`,
    artist: 'Artist',
    source: { service, imported_at: `2026-07-${20 + index}T00:00:00.000Z` },
    _local_filename: `${service}.typingmania`,
  })))
  const collections = index.filter(item => item.type === 'collection')
  expect(collections.map(collection => collection.preview_image_url))
    .toEqual([
      'assets/provider-art/qqmusic.svg',
      'assets/provider-art/netease.svg',
      'assets/provider-art/apple-music.svg',
      'assets/provider-art/local-files.svg',
    ])
})

test('imported translated lyric layers are kept out of the playable index', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-library-lyrics-'))
  const filename = path.join(root, 'translated.typingmania')
  const packed = new PackedFile()
  try {
    packed.addFile('song.json', Buffer.from(JSON.stringify({
      title: '恋するココロ',
      artist: 'eufonius',
      language: 'JP',
      duration: 20,
      cpm: 100,
      max_cpm: 100,
      audio: 'audio.mp3',
      source: { service: 'netease' },
    })))
    packed.addFile('audio.mp3', new Uint8Array([1]))
    packed.addFile('lyrics.csv', Buffer.from([
      '0,3000,心中悄然萌生爱恋',
      '3000,6000,两个人相遇的奇迹',
      '6000,9000,想把这份心意告诉你',
      '9000,12000,明天也要一起向前',
      '12000,15000,直到永远都不分离',
    ].join('\n')))
    await fs.writeFile(filename, Buffer.from(packed.pack()))
    const result = await scanSongPackages(root)

    expect(result.records).toHaveLength(0)
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({
        filename,
        error: expect.stringContaining('translated Chinese lyric layer'),
      }),
    ]))
  } finally {
    packed.destroy()
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('an older unverified Japanese artist alias is retained as pending in the index', () => {
  const song = sanitizeUnverifiedImportedArtists({
    artist: '七音阿卡莉 / Sou',
    artistNames: ['七音阿卡莉', 'Sou'],
    language: 'JP',
    source: {
      service: 'netease',
      artist_resolution: { version: 4, resolved: true },
    },
  })

  expect(song.artist).toBe('七音阿卡莉 / Sou')
  expect(song.rawArtistNames).toEqual(['七音阿卡莉', 'Sou'])
})
