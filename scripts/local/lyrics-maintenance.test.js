import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { TextDecoder, TextEncoder } from 'util'

import { test } from '@jest/globals'

import PackedFile from '../../src/lib/packedfile.js'
import { refreshQQMusicLyricsAndPace } from './lyrics-maintenance.js'

globalThis.TextEncoder = TextEncoder
globalThis.TextDecoder = TextDecoder

function exactArrayBuffer (buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}

test('maintenance removes Blue-style credits and recalculates reference pace', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-lyrics-maintenance-'))
  const directory = path.join(root, 'data', 'qqmusic')
  const filename = path.join(directory, 'blue.typingmania')
  await fs.mkdir(directory, { recursive: true })
  const packed = new PackedFile()
  try {
    packed.addFile('song.json', new TextEncoder().encode(JSON.stringify({
      title: 'Blue',
      artist: 'Test',
      language: 'EN',
      duration: 20,
      cpm: 1207,
      max_cpm: 1994,
      image: 'cover.jpg',
      audio: 'audio.flac',
      source: {
        service: 'qqmusic',
        song_mid: 'blue',
        quality: { version: 3, removed_metadata_lines: 0 },
      },
    })))
    packed.addFile('lyrics.csv', new TextEncoder().encode([
      '0,1000,Lyrics by:Saya Gray/Daniel Caesar',
      '1000,2000,Composed by:Saya Gray/Daniel Caesar/Daiki Tsuneta',
      '2000,4000,Blue like my very mood',
      '5000,7000,Music is the answer tonight',
      '8000,10000,Written in the stars above',
      '11000,13000,Keep the moving rhythm near',
      '14000,17000,Finish every line with care',
    ].join('\n')))
    packed.addFile('cover.jpg', new Uint8Array([1, 2]))
    packed.addFile('audio.flac', new Uint8Array([3, 4]))
    await fs.writeFile(filename, Buffer.from(packed.pack()))
  } finally {
    packed.destroy()
  }

  try {
    const result = await refreshQQMusicLyricsAndPace({ root })
    expect(result).toMatchObject({
      refreshed: 1,
      removed: 2,
      failed: 0,
    })
    const refreshed = new PackedFile()
    const buffer = await fs.readFile(filename)
    refreshed.unpackFromBuffer(exactArrayBuffer(buffer))
    const song = JSON.parse(refreshed.getAsText('song.json'))
    const lyrics = refreshed.getAsText('lyrics.csv')
    expect(lyrics).not.toContain('Lyrics by:')
    expect(lyrics).not.toContain('Composed by:')
    expect(lyrics).toContain('Music is the answer tonight')
    expect(lyrics).toContain('Written in the stars above')
    expect(song.cpm).not.toBe(1207)
    expect(song.source.quality).toMatchObject({
      version: 5,
      removed_metadata_lines: 2,
    })
    expect(song.source.pace).toMatchObject({
      version: 3,
      model: 'demo-human-cadence',
    })
    expect([...new Uint8Array(refreshed.getFileAsBuffer('audio.flac'))])
      .toEqual([3, 4])
    refreshed.destroy()
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
