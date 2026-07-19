import crypto from 'crypto'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { TextEncoder } from 'util'

import { test } from '@jest/globals'

import PackedFile from '../../src/lib/packedfile.js'
import { LIBRARY_BASELINE } from './library-baseline.js'
import {
  inspectResettableLibrary,
  resetLibraryToBaseline,
} from './library.js'

globalThis.TextEncoder = TextEncoder

async function writeSong (filename, source = { service: 'user' }) {
  const packed = new PackedFile()
  try {
    packed.addFile('song.json', new TextEncoder().encode(JSON.stringify({
      title: 'Temporary song',
      subtitle: '',
      artist: 'Test',
      language: 'EN',
      duration: 10,
      audio: 'audio.wav',
      image: 'cover.svg',
      source,
    })))
    packed.addFile('lyrics.csv', new TextEncoder().encode('0,1000,test'))
    packed.addFile('audio.wav', new Uint8Array([1, 2, 3]))
    packed.addFile('cover.svg', new TextEncoder().encode('<svg/>'))
    await fs.mkdir(path.dirname(filename), { recursive: true })
    await fs.writeFile(filename, Buffer.from(packed.pack()))
  } finally {
    packed.destroy()
  }
}

async function sha256 (filename) {
  const hash = crypto.createHash('sha256')
  hash.update(await fs.readFile(filename))
  return hash.digest('hex')
}

test('reset restores the verified demo and removes every added package and cache', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-library-reset-'))
  const baseline = path.join(
    root,
    ...LIBRARY_BASELINE.songs[0].relativePath.split('/'),
  )
  const userSong = path.join(root, 'songs', 'user.typingmania')
  const qqSong = path.join(root, 'data', 'qqmusic', 'qq.typingmania')
  const invalidSong = path.join(root, 'nested', 'invalid.typingmania')
  const cacheSong = path.join(root, 'QQMusicCache', 'keep.typingmania')
  try {
    await fs.mkdir(path.dirname(baseline), { recursive: true })
    await fs.writeFile(baseline, 'private replacement')
    await writeSong(userSong)
    await writeSong(qqSong, { service: 'qqmusic', song_mid: 'test-mid' })
    await fs.mkdir(path.dirname(invalidSong), { recursive: true })
    await fs.writeFile(invalidSong, 'invalid package')
    await writeSong(cacheSong, { service: 'qqmusic', song_mid: 'cache-copy' })
    await fs.mkdir(path.join(root, 'data', 'trial-itsaetara'), { recursive: true })
    await fs.writeFile(path.join(root, 'data', 'trial-itsaetara', 'ekey.txt'), 'private')
    await fs.writeFile(path.join(root, 'data', 'qqmusic-origin-cache.json'), '{}')
    await fs.writeFile(path.join(root, 'data', 'qqmusic-artist-cache.json'), '{}')
    await fs.writeFile(path.join(root, 'data', 'cover-refresh.out.log'), 'private title')

    await expect(inspectResettableLibrary(root)).resolves.toMatchObject({
      count: 3,
      hasChanges: true,
    })
    const result = await resetLibraryToBaseline(root)
    expect(result).toMatchObject({
      baselineVersion: LIBRARY_BASELINE.version,
      baselineRepaired: true,
      deleted: 3,
      failed: 0,
      remaining: 0,
      restored: true,
    })
    for (const song of LIBRARY_BASELINE.songs) {
      expect(await sha256(path.join(root, ...song.relativePath.split('/'))))
        .toBe(song.sha256)
    }
    await expect(fs.access(userSong)).rejects.toThrow()
    await expect(fs.access(qqSong)).rejects.toThrow()
    await expect(fs.access(invalidSong)).rejects.toThrow()
    await expect(fs.access(cacheSong)).resolves.toBeUndefined()
    await expect(
      fs.access(path.join(root, 'data', 'trial-itsaetara')),
    ).rejects.toThrow()
    await expect(
      fs.access(path.join(root, 'data', 'qqmusic-origin-cache.json')),
    ).rejects.toThrow()
    await expect(
      fs.access(path.join(root, 'data', 'qqmusic-artist-cache.json')),
    ).rejects.toThrow()

    const index = JSON.parse(
      await fs.readFile(path.join(root, 'data', 'songs.json'), 'utf8'),
    )
    expect(index).toHaveLength(LIBRARY_BASELINE.songs.length)
    for (const song of LIBRARY_BASELINE.songs) {
      expect(index).toContainEqual(expect.objectContaining({
        title: song.title,
        url: song.relativePath,
        source: expect.objectContaining({
          service: song.sourceService,
          baseline: true,
        }),
      }))
    }
    const titlesByAddedTime = [...index]
      .sort((left, right) => (
        Date.parse(left.source.imported_at) -
        Date.parse(right.source.imported_at)
      ))
      .map(song => song.title)
    expect(titlesByAddedTime).toEqual([
      '指尖星光',
      'Letters in the Light',
      '明日へのリズム',
    ])
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
