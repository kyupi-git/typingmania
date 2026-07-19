import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { TextDecoder, TextEncoder } from 'util'

import { test } from '@jest/globals'

import PackedFile from '../../src/lib/packedfile.js'
import {
  refreshPackedSongCover,
  refreshPackedSongPoster,
} from './cover-package.js'

globalThis.TextEncoder = TextEncoder
globalThis.TextDecoder = TextDecoder

function exactArrayBuffer (buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

test('cover refresh preserves audio and lyrics while updating package metadata', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-cover-'))
  const filename = path.join(directory, 'song.typingmania')
  try {
    const encode = value => new Uint8Array(Buffer.from(value, 'utf8'))
    const original = new PackedFile()
    original.addFile('song.json', encode(JSON.stringify({
      title: 'test',
      subtitle: '《test anime》TV动画片尾曲',
      image: 'cover.jpg',
      audio: 'audio.flac',
      source: {
        service: 'qqmusic',
        song_mid: 'test-mid',
        checks: { cover_online: false },
      },
    })))
    original.addFile('cover.jpg', new Uint8Array([1, 2, 3]))
    original.addFile('lyrics.csv', encode('0,1000,test'))
    original.addFile('audio.flac', new Uint8Array([0x66, 0x4C, 0x61, 0x43]))
    await fs.writeFile(filename, Buffer.from(original.pack()))

    await refreshPackedSongCover({
      _local_filename: filename,
      source: { service: 'qqmusic', song_mid: 'test-mid' },
    }, {
      buffer: new Uint8Array([9, 8, 7]),
      extension: '.png',
      verifiedOnline: true,
      strategy: 'anime-album',
      albumMid: 'anime-album',
      album: 'test soundtrack',
      animeRelated: true,
    }, {
      checked: true,
      poster: {
        buffer: new Uint8Array([6, 5, 4]),
        extension: '.jpg',
        source: 'bangumi-subject-poster',
        catalog: 'bangumi',
        catalogId: '123',
      },
    })

    const refreshed = new PackedFile()
    refreshed.unpackFromBuffer(exactArrayBuffer(await fs.readFile(filename)))
    const metadata = JSON.parse(refreshed.getAsText('song.json'))
    expect(metadata.image).toBe('cover.png')
    expect(metadata.poster).toBe('poster.jpg')
    expect(metadata.source.cover).toMatchObject({
      version: 3,
      strategy: 'anime-album',
      album_mid: 'anime-album',
      anime_related: true,
      poster_checked: true,
      poster_available: true,
      poster_catalog_id: '123',
    })
    expect([...new Uint8Array(refreshed.getFileAsBuffer('audio.flac'))])
      .toEqual([0x66, 0x4C, 0x61, 0x43])
    expect(refreshed.hasFile('cover.jpg')).toBe(false)
    expect(refreshed.hasFile('cover.png')).toBe(true)
    expect(refreshed.hasFile('poster.jpg')).toBe(true)
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('poster-only refresh preserves album cover, audio, and lyrics', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-poster-'))
  const filename = path.join(directory, 'song.typingmania')
  const original = new PackedFile()
  try {
    const encode = value => new Uint8Array(Buffer.from(value, 'utf8'))
    original.addFile('song.json', encode(JSON.stringify({
      title: 'poster test',
      image: 'cover.jpg',
      poster: 'poster.jpg',
      source: {
        service: 'qqmusic',
        cover: {
          version: 2,
          strategy: 'track-album',
          album_mid: 'album',
          poster_catalog_id: '123',
        },
      },
    })))
    original.addFile('cover.jpg', new Uint8Array([1, 2, 3]))
    original.addFile('poster.jpg', new Uint8Array([4, 5, 6]))
    original.addFile('audio.flac', new Uint8Array([7, 8]))
    original.addFile('lyrics.csv', new Uint8Array([9, 10]))
    await fs.writeFile(filename, Buffer.from(original.pack()))

    const refreshedSong = await refreshPackedSongPoster({
      _local_filename: filename,
    }, {
      checked: true,
      poster: {
        buffer: new Uint8Array([11, 12, 13]),
        extension: '.png',
        source: 'bangumi-verified-subject-poster',
        catalog: 'bangumi',
        catalogId: '456',
        workTitle: '作品原名',
        identityVerified: true,
        checkedAt: '2026-07-19T00:00:00.000Z',
        verifiedOnline: true,
      },
    })

    const refreshed = new PackedFile()
    refreshed.unpackFromBuffer(exactArrayBuffer(await fs.readFile(filename)))
    const metadata = JSON.parse(refreshed.getAsText('song.json'))
    expect(refreshedSong.poster).toBe('poster.png')
    expect(metadata.image).toBe('cover.jpg')
    expect(metadata.poster).toBe('poster.png')
    expect(metadata.source.cover).toMatchObject({
      version: 3,
      strategy: 'track-album',
      album_mid: 'album',
      poster_version: 2,
      poster_catalog_id: '456',
      poster_work_title: '作品原名',
      poster_identity_verified: true,
      poster_checked_at: '2026-07-19T00:00:00.000Z',
    })
    expect([...new Uint8Array(refreshed.getFileAsBuffer('cover.jpg'))])
      .toEqual([1, 2, 3])
    expect([...new Uint8Array(refreshed.getFileAsBuffer('audio.flac'))])
      .toEqual([7, 8])
    expect([...new Uint8Array(refreshed.getFileAsBuffer('lyrics.csv'))])
      .toEqual([9, 10])
    expect(refreshed.hasFile('poster.jpg')).toBe(false)
    expect([...new Uint8Array(refreshed.getFileAsBuffer('poster.png'))])
      .toEqual([11, 12, 13])
    refreshed.destroy()
  } finally {
    original.destroy()
    await fs.rm(directory, { recursive: true, force: true })
  }
})
