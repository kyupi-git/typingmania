import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { TextDecoder, TextEncoder } from 'util'

import { test } from '@jest/globals'

import PackedFile from '../../src/lib/packedfile.js'
import { refreshPackedSongOrigin } from './song-origin-package.js'

globalThis.TextEncoder = TextEncoder
globalThis.TextDecoder = TextDecoder

function exactArrayBuffer (buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

test('origin refresh preserves every bundled playable asset', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-origin-'))
  const filename = path.join(directory, 'song.typingmania')
  try {
    const encode = value => new Uint8Array(Buffer.from(value, 'utf8'))
    const original = new PackedFile()
    original.addFile('song.json', encode(JSON.stringify({
      title: 'サンプル曲',
      subtitle: '《示例作品》TV动画片尾曲2',
      image: 'cover.jpg',
      audio: 'audio.flac',
      source: {
        service: 'qqmusic',
        song_mid: 'test-mid',
        checks: { metadata: true },
      },
    })))
    original.addFile('cover.jpg', new Uint8Array([1, 2, 3]))
    original.addFile('lyrics.csv', encode('0,1000,test'))
    original.addFile('audio.flac', new Uint8Array([0x66, 0x4C, 0x61, 0x43]))
    await fs.writeFile(filename, Buffer.from(original.pack()))

    const origin = {
      version: 1,
      work_title: 'サンプル作品',
      original_language: 'ja',
      medium: 'tv',
      role: 'ending',
      sequence: '2',
      episodes: [],
    }
    await refreshPackedSongOrigin({
      _local_filename: filename,
      source: { service: 'qqmusic', song_mid: 'test-mid' },
    }, origin)

    const refreshed = new PackedFile()
    refreshed.unpackFromBuffer(exactArrayBuffer(await fs.readFile(filename)))
    const metadata = JSON.parse(refreshed.getAsText('song.json'))
    expect(metadata.origin).toEqual(origin)
    expect(metadata.source.checks.origin_original).toBe(true)
    expect([...new Uint8Array(refreshed.getFileAsBuffer('audio.flac'))])
      .toEqual([0x66, 0x4C, 0x61, 0x43])
    expect([...new Uint8Array(refreshed.getFileAsBuffer('cover.jpg'))])
      .toEqual([1, 2, 3])
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})
