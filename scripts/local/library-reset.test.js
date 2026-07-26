import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { TextEncoder } from 'node:util'

import { expect, test } from '@jest/globals'

import PackedFile from '../../src/lib/packedfile.js'
import { scanSongLibrary } from './library.js'
import { resetLibraryScope } from './library-reset.js'

globalThis.TextEncoder = TextEncoder

async function writeSong (root, service, id) {
  const packed = new PackedFile()
  packed.addFile('song.json', new TextEncoder().encode(JSON.stringify({
    title: `${service}-${id}`,
    subtitle: '',
    artist: 'Test Artist',
    language: 'EN',
    cpm: 200,
    max_cpm: 300,
    duration: 60,
    audio: 'audio.mp3',
    image: 'cover.jpg',
    source: { service, track_id: id },
  })))
  packed.addFile('lyrics.csv', new TextEncoder().encode('0,1000,test\n'))
  packed.addFile('audio.mp3', new Uint8Array([1, 2, 3]))
  packed.addFile('cover.jpg', new Uint8Array([4, 5, 6]))
  const filename = path.join(root, 'data', service, `${id}.typingmania`)
  await fs.mkdir(path.dirname(filename), { recursive: true })
  await fs.writeFile(filename, Buffer.from(packed.pack()))
}

test.each(['qqmusic', 'netease', 'apple-music', 'local-files'])(
  'scoped reset deletes only %s packages',
  async scope => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-reset-'))
    try {
      for (const service of ['qqmusic', 'netease', 'apple-music', 'local-files']) {
        await writeSong(root, service, service)
      }
      const result = await resetLibraryScope(root, scope)
      expect(result).toMatchObject({
        scope,
        deleted: 1,
        remaining: 0,
        restored: true,
      })
      const library = await scanSongLibrary(root)
      expect(library.records.map(song => song.source.service).sort())
        .toEqual(
          ['qqmusic', 'netease', 'apple-music', 'local-files']
            .filter(service => service !== scope)
            .sort(),
        )
    } finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  },
)

test('reset rejects unknown scopes without deleting songs', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-reset-unknown-'))
  try {
    await writeSong(root, 'netease', 'keep')
    await expect(resetLibraryScope(root, 'unknown')).rejects.toThrow(/unknown/iu)
    expect((await scanSongLibrary(root)).records).toHaveLength(1)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('full reset restores only the three verified starter songs', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-reset-all-'))
  try {
    await fs.mkdir(path.join(root, 'songs'), { recursive: true })
    for (const name of [
      'demo-chinese.typingmania',
      'demo-english.typingmania',
      'demo-japanese.typingmania',
    ]) {
      await fs.copyFile(
        path.join(process.cwd(), 'songs', name),
        path.join(root, 'songs', name),
      )
    }
    await writeSong(root, 'qqmusic', 'remove-qq')
    await writeSong(root, 'netease', 'remove-netease')

    const result = await resetLibraryScope(root, 'all')
    expect(result).toMatchObject({ restored: true, failed: 0 })
    const library = await scanSongLibrary(root)
    expect(library.records).toHaveLength(3)
    expect(new Set(library.records.map(song => song.source.service)))
      .toEqual(new Set(['typingmania-demo']))
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
