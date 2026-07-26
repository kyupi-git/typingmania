import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { TextDecoder, TextEncoder } from 'util'

import { jest, test } from '@jest/globals'

import PackedFile from '../../src/lib/packedfile.js'
import { readPackedSongMetadata } from './library.js'
import {
  needsSongOriginRefresh,
  refreshMissingSongOrigins,
} from './song-origin-maintenance.js'
import { SONG_ORIGIN_VERSION } from './song-origin-resolver.js'

globalThis.TextEncoder = TextEncoder
globalThis.TextDecoder = TextDecoder

test('startup maintenance adds an original work title to an existing package', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-origin-maintenance-'))
  const filename = path.join(root, 'existing.typingmania')
  try {
    const encode = value => new Uint8Array(Buffer.from(value, 'utf8'))
    const packed = new PackedFile()
    packed.addFile('song.json', encode(JSON.stringify({
      title: 'サンプル曲',
      subtitle: '《示例作品》TV动画片尾曲2',
      artist: 'サンプル歌手',
      language: 'JP',
      image: 'cover.jpg',
      audio: 'audio.flac',
      source: {
        service: 'qqmusic',
        song_mid: 'test-mid',
        checks: { metadata: true },
      },
    })))
    packed.addFile('cover.jpg', new Uint8Array([1, 2, 3]))
    packed.addFile('lyrics.csv', encode('0,1000,test'))
    packed.addFile('audio.flac', new Uint8Array([0x66, 0x4C, 0x61, 0x43]))
    await fs.writeFile(filename, Buffer.from(packed.pack()))

    const record = {
      ...(await readPackedSongMetadata(filename)),
      _local_filename: filename,
    }
    const resolver = {
      resolve: jest.fn(async () => ({
        version: SONG_ORIGIN_VERSION,
        work_title: 'サンプル作品',
        original_language: 'ja',
        original_verified: true,
        title_source: 'catalog-primary',
        medium: 'tv',
        season: '',
        episodes: [],
        role: 'ending',
        sequence: '2',
      })),
    }
    const result = await refreshMissingSongOrigins({
      root,
      records: [record],
      resolver,
    })

    expect(result).toEqual({
      inspected: 1,
      refreshed: 1,
      unresolved: 0,
      hidden: 0,
      failed: 0,
    })
    expect(resolver.resolve).toHaveBeenCalledTimes(1)
    expect((await readPackedSongMetadata(filename)).origin).toMatchObject({
      version: SONG_ORIGIN_VERSION,
      work_title: 'サンプル作品',
      role: 'ending',
      sequence: '2',
    })
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('startup maintenance removes an unverified translated origin when no original is found', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-origin-hidden-'))
  const filename = path.join(root, 'existing.typingmania')
  try {
    const encode = value => new Uint8Array(Buffer.from(value, 'utf8'))
    const packed = new PackedFile()
    packed.addFile('song.json', encode(JSON.stringify({
      title: 'サンプル曲',
      subtitle: '《示例中文译名》TV动画片头曲',
      artist: 'サンプル歌手',
      language: 'JP',
      image: 'cover.jpg',
      audio: 'audio.flac',
      origin: {
        version: 2,
        work_title: '示例中文译名',
        original_language: 'ja',
        medium: 'tv',
        role: 'opening',
      },
      source: {
        service: 'qqmusic',
        song_mid: 'test-mid-hidden',
        checks: { origin_original: true },
      },
    })))
    packed.addFile('cover.jpg', new Uint8Array([1, 2, 3]))
    packed.addFile('lyrics.csv', encode('0,1000,test'))
    packed.addFile('audio.flac', new Uint8Array([0x66, 0x4C, 0x61, 0x43]))
    await fs.writeFile(filename, Buffer.from(packed.pack()))

    const record = {
      ...(await readPackedSongMetadata(filename)),
      _local_filename: filename,
    }
    const resolver = {
      lastLookupFailed: false,
      resolve: jest.fn(async () => null),
    }
    const result = await refreshMissingSongOrigins({
      root,
      records: [record],
      resolver,
    })

    expect(result).toEqual({
      inspected: 1,
      refreshed: 0,
      unresolved: 1,
      hidden: 1,
      failed: 0,
    })
    const refreshed = await readPackedSongMetadata(filename)
    expect(refreshed.origin).toBeUndefined()
    expect(refreshed.source.checks.origin_original).toBe(false)
    expect(refreshed.source.origin_resolution).toMatchObject({
      version: SONG_ORIGIN_VERSION,
      resolved: false,
    })
    expect(needsSongOriginRefresh(refreshed)).toBe(false)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('startup maintenance refreshes a source-work title used for a Japanese anime', () => {
  expect(needsSongOriginRefresh({
    subtitle: '《我独自盗墓》TV动画片头曲',
    origin: {
      version: SONG_ORIGIN_VERSION,
      work_title: '도굴왕',
      original_language: 'ja',
      original_verified: true,
    },
    source: {
      service: 'qqmusic',
      origin_resolution: {
        version: SONG_ORIGIN_VERSION,
        resolved: true,
        checked_at: new Date().toISOString(),
      },
    },
  })).toBe(true)
})

test('startup origin maintenance also covers non-QQ imported sources', () => {
  expect(needsSongOriginRefresh({
    subtitle: 'TV动画《示例作品》片头曲',
    source: { service: 'netease' },
  })).toBe(true)
})

test('a native Japanese direct title remains current even when it contains 後', () => {
  expect(needsSongOriginRefresh({
    title: 'license',
    subtitle: '《世界最强的后卫 ～迷宫国的新人探索者～》TV动画片头曲',
    language: 'JP',
    origin: {
      version: SONG_ORIGIN_VERSION,
      work_title: '世界最強の後衛 ～迷宮国の新人探索者～',
      original_language: 'ja',
      original_verified: true,
      title_source: 'catalog-primary',
    },
    source: {
      service: 'qqmusic',
    },
  })).toBe(false)
})
