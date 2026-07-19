import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { TextEncoder } from 'util'

import { test } from '@jest/globals'

import PackedFile from '../../src/lib/packedfile.js'
import {
  deleteLibrarySongs,
  inspectEditableLibrary,
} from './library-editor.js'
import { scanSongLibrary } from './library.js'

globalThis.TextEncoder = TextEncoder

async function writeSong (filename, {
  title,
  songMid,
  singerMid,
  catalogId,
  service = 'qqmusic',
}) {
  const packed = new PackedFile()
  packed.addFile('song.json', new TextEncoder().encode(JSON.stringify({
    title,
    subtitle: '',
    artist: `Artist ${title}`,
    language: 'JP',
    cpm: 300,
    max_cpm: 450,
    duration: 120,
    audio: 'audio.flac',
    image: 'cover.jpg',
    origin: catalogId ? { catalog_id: catalogId } : null,
    source: {
      service,
      song_mid: songMid,
      artist_resolution: {
        artists: singerMid ? [{ singer_mid: singerMid }] : [],
      },
    },
  })))
  packed.addFile('lyrics.csv', new TextEncoder().encode('0,1000,test\n'))
  packed.addFile('audio.flac', new Uint8Array([1, 2, 3]))
  packed.addFile('cover.jpg', new Uint8Array([4, 5, 6]))
  await fs.mkdir(path.dirname(filename), { recursive: true })
  await fs.writeFile(filename, Buffer.from(packed.pack()))
}

test('selected songs are deleted transactionally while protected songs remain', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-editor-'))
  try {
    await writeSong(path.join(root, 'data', 'qqmusic', 'first.typingmania'), {
      title: 'First',
      songMid: 'first',
      singerMid: 'artist-first',
      catalogId: 'work-first',
    })
    await writeSong(path.join(root, 'data', 'qqmusic', 'second.typingmania'), {
      title: 'Second',
      songMid: 'second',
      singerMid: 'artist-second',
      catalogId: 'work-second',
    })
    await writeSong(path.join(root, 'songs', 'keep.typingmania'), {
      title: 'Keep',
      songMid: 'keep',
      singerMid: 'artist-keep',
      catalogId: 'work-keep',
      service: 'local',
    })
    await writeSong(path.join(root, 'songs', 'demo-english.typingmania'), {
      title: 'Protected',
      songMid: 'protected',
      service: 'typingmania-demo',
    })
    await fs.mkdir(path.join(root, 'data'), { recursive: true })
    await fs.writeFile(
      path.join(root, 'data', 'qqmusic-artist-cache.json'),
      JSON.stringify({
        version: 1,
        entries: {
          'artist-first': {},
          'artist-second': {},
          'artist-keep': {},
        },
      }),
    )
    await fs.writeFile(
      path.join(root, 'data', 'qqmusic-origin-cache.json'),
      JSON.stringify({
        version: 1,
        entries: {
          first: { origin: { catalog_id: 'work-first' } },
          second: { origin: { catalog_id: 'work-second' } },
          keep: { origin: { catalog_id: 'work-keep' } },
        },
      }),
    )

    const editable = await inspectEditableLibrary(root)
    expect(editable.songs.map(song => song.title).sort())
      .toEqual(['First', 'Keep', 'Second'])
    const ids = editable.songs
      .filter(song => ['First', 'Second'].includes(song.title))
      .map(song => song.id)
    const result = await deleteLibrarySongs(root, ids)
    expect(result).toMatchObject({
      deleted: 2,
      remaining: 2,
      prunedCaches: { artists: 2, origins: 2 },
    })

    const remaining = await scanSongLibrary(root)
    expect(remaining.records.map(song => song.title).sort())
      .toEqual(['Keep', 'Protected'])
    await expect(
      fs.access(path.join(root, 'songs', 'demo-english.typingmania')),
    ).resolves.toBeUndefined()
    await expect(
      fs.access(path.join(root, 'data', '.library-trash')),
    ).rejects.toThrow()
    const artistCache = JSON.parse(await fs.readFile(
      path.join(root, 'data', 'qqmusic-artist-cache.json'),
      'utf8',
    ))
    expect(Object.keys(artistCache.entries)).toEqual(['artist-keep'])
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('a protected or unknown selection aborts without deleting valid songs', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-editor-safe-'))
  try {
    await writeSong(path.join(root, 'data', 'song.typingmania'), {
      title: 'Editable',
      songMid: 'editable',
    })
    await writeSong(path.join(root, 'songs', 'demo-english.typingmania'), {
      title: 'Protected',
      songMid: 'protected',
      service: 'typingmania-demo',
    })
    const editable = await inspectEditableLibrary(root)
    await expect(deleteLibrarySongs(root, [
      editable.songs[0].id,
      'songs/demo-english.typingmania',
    ])).rejects.toMatchObject({
      code: 'SONG_NOT_EDITABLE',
    })
    expect((await scanSongLibrary(root)).records).toHaveLength(2)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
