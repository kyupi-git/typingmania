import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { TextDecoder, TextEncoder } from 'node:util'

import { expect, test } from '@jest/globals'

import PackedFile from '../../src/lib/packedfile.js'
import { scanSongLibrary } from './library.js'

globalThis.TextEncoder = TextEncoder
globalThis.TextDecoder = TextDecoder

import {
  abortableMetadataStage,
  canSafelyApplyOrigin,
  exactCatalogMetadata,
  originIsImplausibleForSong,
  refreshImportedLibraryMetadata,
} from './library-metadata-maintenance.js'
import { mergeCatalogMetadata } from './catalog-resolver.js'
import { SONG_ORIGIN_VERSION } from './song-origin-resolver.js'

const verified = {
  version: SONG_ORIGIN_VERSION,
  work_title: '作品原名',
  original_verified: true,
  title_source: 'catalog-primary',
  catalog: 'bangumi',
  catalog_id: '12345',
}

test('catalog cover with partial artist overlap cannot replace a formal recording', () => {
  const local = {
    title: '君にまつわるミステリー',
    artist: '佐藤聡美 / 茅野愛衣',
    artistNames: ['佐藤聡美', '茅野愛衣'],
    duration: 256,
  }
  const remote = {
    title: local.title,
    artist: '璃夜纱Ryosa / 耗子',
    artistNames: ['璃夜纱Ryosa', '耗子'],
    duration: 256,
    catalogVerification: {
      source: 'catalog',
      safe: true,
      verifiedFields: ['title', 'artist', 'artistNames', 'duration'],
    },
  }
  const result = mergeCatalogMetadata(local, remote)
  expect(result.artist).toBe(local.artist)
  expect(result.artistNames).toEqual(local.artistNames)
})

test('metadata maintenance adds or updates only a verified matching origin', () => {
  expect(canSafelyApplyOrigin(null, verified)).toBe(true)
  expect(canSafelyApplyOrigin(verified, {
    ...verified,
    work_title: '更新后的原名',
  })).toBe(true)
  expect(canSafelyApplyOrigin(verified, {
    ...verified,
    catalog_id: '99999',
  })).toBe(false)
  expect(canSafelyApplyOrigin({
    ...verified,
    catalog: 'qqmusic',
    catalog_id: 'album-mid',
    work_title: 'この美術部には問題がある!',
    medium: 'tv',
    role: 'ending',
  }, {
    ...verified,
    work_title: 'この美術部には問題がある！',
    medium: 'tv',
    role: 'ending',
    title_source: 'catalog-primary',
    confidence: 0.92,
  })).toBe(true)
  expect(canSafelyApplyOrigin({
    ...verified,
    catalog: 'qqmusic',
    catalog_id: 'album-mid',
    medium: 'tv',
  }, {
    ...verified,
    catalog_id: 'another-work',
    work_title: '別の作品',
    medium: 'movie',
    title_source: 'catalog-primary',
    confidence: 0.99,
    corroborated_by: ['bangumi', 'anilist'],
  })).toBe(false)
  expect(canSafelyApplyOrigin(verified, {
    ...verified,
    original_verified: false,
  })).toBe(false)
})

test('an exact provider ID recovers a missing title but keeps ambiguous Han artist pending', () => {
  const result = exactCatalogMetadata({
    title: '',
    artist: '',
    duration: 253,
    language: 'JP',
  }, {
    title: '夜明け生まれ来る少女',
    rawTitle: '夜明け生まれ来る少女',
    artist: '高橋洋子',
    artistNames: ['高橋洋子'],
    album: '夜明け生まれ来る少女',
    duration: 252.293,
    language: 'JP',
  }, 'netease-exact-track')
  expect(result).toMatchObject({
    title: '夜明け生まれ来る少女',
    artist: '高橋洋子',
    catalogVerification: {
      safe: true,
      verifiedFields: expect.arrayContaining(['title', 'duration']),
    },
  })
  expect(result.catalogVerification.verifiedFields)
    .not.toEqual(expect.arrayContaining(['artist', 'artistNames']))
})

test('an exact provider ID can verify an unambiguous kana artist', () => {
  expect(exactCatalogMetadata({
    title: 'Song',
    artist: '',
    duration: 120,
    language: 'JP',
  }, {
    title: 'Song',
    artist: 'ナナヲアカリ',
    artistNames: ['ナナヲアカリ'],
    duration: 120,
    language: 'JP',
  }, 'qqmusic-exact-track').catalogVerification.verifiedFields)
    .toEqual(expect.arrayContaining(['artist', 'artistNames']))
})

test('a provider album hint cannot claim that the song title is the work', () => {
  expect(originIsImplausibleForSong({
    work_title: 'いつだってコミュニケーション',
    catalog: 'qqmusic',
    title_source: 'soundtrack-album',
  }, {
    title: 'いつだってコミュニケーション',
  })).toBe(true)
  expect(originIsImplausibleForSong({
    work_title: '星屑テレパス',
    catalog: 'bangumi',
    title_source: 'catalog-primary',
  }, {
    title: '点と線',
  })).toBe(false)
})

test('an active metadata lookup stops as soon as its signal is aborted', async () => {
  const controller = new AbortController()
  const started = Date.now()
  const refresh = refreshImportedLibraryMetadata({
    root: process.cwd(),
    records: [{
      title: 'Waiting song',
      source: { service: 'local-files' },
      _local_filename: 'unused.typingmania',
    }],
    signal: controller.signal,
    providerMetadataResolver: () => new Promise(() => {}),
  })
  controller.abort()

  await expect(refresh).resolves.toMatchObject({
    cancelled: true,
    failed: 0,
  })
  expect(Date.now() - started).toBeLessThan(250)
})

test('an abortable metadata stage rejects without waiting for network timeout', async () => {
  const controller = new AbortController()
  const stage = abortableMetadataStage(new Promise(() => {}), controller.signal)
  controller.abort()
  await expect(stage).rejects.toMatchObject({ name: 'AbortError' })
})

test('route failures do not abandon the rest of a clean-device refresh batch', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-metadata-batch-'))
  try {
    for (let index = 0; index < 5; index++) {
      const packed = new PackedFile()
      packed.addFile('song.json', new TextEncoder().encode(JSON.stringify({
        title: `Song ${index}`,
        artist: 'Artist',
        language: 'EN',
        duration: 120,
        audio: 'audio.mp3',
        image: 'cover.jpg',
        source: { service: 'local-files', track_id: String(index) },
      })))
      packed.addFile('lyrics.csv', new TextEncoder().encode('0,1000,test\n'))
      packed.addFile('audio.mp3', new Uint8Array([1]))
      packed.addFile('cover.jpg', new Uint8Array([2]))
      const filename = path.join(root, 'data', 'local-files', `${index}.typingmania`)
      await fs.mkdir(path.dirname(filename), { recursive: true })
      await fs.writeFile(filename, Buffer.from(packed.pack()))
    }
    const records = (await scanSongLibrary(root)).records
    const result = await refreshImportedLibraryMetadata({
      root,
      records,
      providerMetadataResolver: song => ({
        metadata: {
          title: song.title,
          rawTitle: song.title,
          artist: song.artist,
          artistNames: [song.artist],
          duration: song.duration,
          language: song.language,
        },
        cover: null,
      }),
      catalogResolver: async () => { throw new TypeError('route blocked') },
      songEnricher: async ({ metadata }) => ({
        metadata,
        lookupFailed: true,
        posterResolution: {
          checked: false,
          poster: null,
          reason: 'poster-network-unavailable',
        },
      }),
    })
    expect(result).toMatchObject({
      inspected: 5,
      total: 5,
      failed: 0,
      networkInterrupted: false,
      networkDegraded: true,
    })
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
