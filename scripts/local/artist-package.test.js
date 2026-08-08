import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { TextDecoder, TextEncoder } from 'util'

import { test } from '@jest/globals'

import PackedFile from '../../src/lib/packedfile.js'
import { refreshPackedSongArtist } from './artist-package.js'
import { ORIGINAL_ARTIST_VERSION } from './original-artist.js'

globalThis.TextEncoder = TextEncoder
globalThis.TextDecoder = TextDecoder

function exactArrayBuffer (buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

test('artist refresh changes metadata while preserving private media', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-artist-'))
  const filename = path.join(directory, 'song.typingmania')
  const packed = new PackedFile()
  try {
    packed.addFile('song.json', new TextEncoder().encode(JSON.stringify({
      title: '∞劣等星',
      artist: '七音阿卡莉 (NANAOAKARI)',
      latin_artist: '七音阿卡莉 (NANAOAKARI)',
      image: 'cover.jpg',
      audio: 'audio.flac',
      source: { service: 'qqmusic', song_mid: 'test' },
    })))
    packed.addFile('lyrics.csv', new TextEncoder().encode('0,1000,test'))
    packed.addFile('cover.jpg', new Uint8Array([1, 2]))
    packed.addFile('audio.flac', new Uint8Array([3, 4]))
    await fs.writeFile(filename, Buffer.from(packed.pack()))
  } finally {
    packed.destroy()
  }

  try {
    await refreshPackedSongArtist({ _local_filename: filename }, {
      artist: 'ナナヲアカリ',
      resolved: true,
      checkedAt: '2026-07-19T00:00:00.000Z',
      artists: [{
        singerMid: '0027n73d00Pkeq',
        singerId: 2119260,
        rawName: '七音阿卡莉 (NANAOAKARI)',
        originalName: 'ナナヲアカリ',
        resolved: true,
        source: 'qqmusic-wiki-外文名',
        confidence: 1,
      }],
    })
    const refreshed = new PackedFile()
    const buffer = await fs.readFile(filename)
    refreshed.unpackFromBuffer(exactArrayBuffer(buffer))
    const song = JSON.parse(refreshed.getAsText('song.json'))
    expect(song).toMatchObject({
      artist: 'ナナヲアカリ',
      latin_artist: 'ナナヲアカリ',
      source: {
        checks: { artist_original: true },
        artist_resolution: {
          version: ORIGINAL_ARTIST_VERSION,
          resolved: true,
          artists: [{
            singer_mid: '0027n73d00Pkeq',
            original_name: 'ナナヲアカリ',
          }],
        },
      },
    })
    expect([...new Uint8Array(refreshed.getFileAsBuffer('audio.flac'))])
      .toEqual([3, 4])
    refreshed.destroy()
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})
