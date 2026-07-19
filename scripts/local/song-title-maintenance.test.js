import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { TextDecoder, TextEncoder } from 'util'

import { test } from '@jest/globals'

import PackedFile from '../../src/lib/packedfile.js'
import { SONG_TITLE_CLEANUP_VERSION } from '../../src/song/song-title.js'
import { readPackedSongMetadata } from './library.js'
import {
  needsSongTitleRefresh,
  refreshQQMusicSongTitles,
} from './song-title-maintenance.js'

globalThis.TextEncoder = TextEncoder
globalThis.TextDecoder = TextDecoder

function exactArrayBuffer (buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

test('startup maintenance cleans an old QQ Music title without changing playable assets', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-song-title-'))
  const filename = path.join(root, 'existing.typingmania')
  try {
    const encode = value => new Uint8Array(Buffer.from(value, 'utf8'))
    const packed = new PackedFile()
    packed.addFile('song.json', encode(JSON.stringify({
      title: '潮風のシンフォニー (海风交响曲) (Live ver.)',
      latin_title: '潮風のシンフォニー (海风交响曲) (Live ver.)',
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
    expect(needsSongTitleRefresh(record)).toBe(true)

    const result = await refreshQQMusicSongTitles({
      root,
      records: [record],
    })
    expect(result).toEqual({
      inspected: 1,
      refreshed: 1,
      failed: 0,
    })

    const metadata = await readPackedSongMetadata(filename)
    expect(metadata.title).toBe('潮風のシンフォニー (Live ver.)')
    expect(metadata.latin_title).toBe('潮風のシンフォニー (Live ver.)')
    expect(metadata.source.title_cleanup).toEqual({
      version: SONG_TITLE_CLEANUP_VERSION,
    })
    expect(metadata.source.checks.title_original).toBe(true)

    const refreshed = new PackedFile()
    refreshed.unpackFromBuffer(exactArrayBuffer(await fs.readFile(filename)))
    expect([...new Uint8Array(refreshed.getFileAsBuffer('audio.flac'))])
      .toEqual([0x66, 0x4C, 0x61, 0x43])
    expect([...new Uint8Array(refreshed.getFileAsBuffer('cover.jpg'))])
      .toEqual([1, 2, 3])
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('non-QQ Music songs and uncertain same-script titles are never rewritten', () => {
  expect(needsSongTitleRefresh({
    title: 'サンプル曲 (Sample Song)',
    language: 'JP',
    source: { service: 'offline-demo' },
  })).toBe(false)
  expect(needsSongTitleRefresh({
    title: '青空 (青春篇)',
    language: 'JP',
    source: { service: 'qqmusic' },
  })).toBe(false)
})
