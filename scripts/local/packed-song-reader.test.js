import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { TextEncoder } from 'util'

import { test } from '@jest/globals'

import PackedFile from '../../src/lib/packedfile.js'
import {
  readPackedSongArtwork,
  readPackedSongMetadata,
} from './packed-song-reader.js'

globalThis.TextEncoder = TextEncoder

test('reads metadata and artwork without unpacking the audio entry', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-artwork-'))
  const filename = path.join(directory, 'song.typingmania')
  const packed = new PackedFile()
  try {
    packed.addFile('song.json', new TextEncoder().encode(JSON.stringify({
      title: 'Test',
      image: 'album.jpg',
      poster: 'poster.png',
      audio: 'audio.flac',
    })))
    packed.addFile('album.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
    packed.addFile('poster.png', Buffer.from([137, 80, 78, 71]))
    packed.addFile('audio.flac', Buffer.alloc(2 * 1024 * 1024, 1))
    await fs.writeFile(filename, Buffer.from(packed.pack()))

    expect((await readPackedSongMetadata(filename)).title).toBe('Test')
    const poster = await readPackedSongArtwork(filename, 'poster')
    expect(poster.mimeType).toBe('image/png')
    expect([...poster.buffer]).toEqual([137, 80, 78, 71])
  } finally {
    packed.destroy()
    await fs.rm(directory, { recursive: true, force: true })
  }
})
