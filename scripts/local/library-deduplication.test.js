import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { TextEncoder } from 'node:util'
import { test } from '@jest/globals'

import PackedFile from '../../src/lib/packedfile.js'
import { inspectLibraryDuplicates } from './library-deduplication.js'

globalThis.TextEncoder = TextEncoder

async function writeSong (root, name, metadata) {
  const packed = new PackedFile()
  const encoder = new TextEncoder()
  packed.addFile('song.json', encoder.encode(JSON.stringify({
    language: 'EN',
    cpm: 100,
    max_cpm: 120,
    image: 'cover.svg',
    audio: 'audio.wav',
    ...metadata,
  })))
  packed.addFile('lyrics.csv', encoder.encode('0,1000,test'))
  packed.addFile('cover.svg', encoder.encode('<svg/>'))
  packed.addFile('audio.wav', new Uint8Array(64))
  const directory = path.join(root, 'data', metadata.source.service)
  await fs.mkdir(directory, { recursive: true })
  await fs.writeFile(
    path.join(directory, `${name}.typingmania`),
    Buffer.from(packed.pack()),
  )
  packed.destroy()
}

test('deduplication only proposes lower-quality matches from one provider', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-dedupe-'))
  try {
    await writeSong(root, 'a', {
      title: 'Same Song',
      artist: 'Same Artist',
      duration: 180,
      source: {
        service: 'netease',
        track_id: '1',
        quality: { version: 3 },
      },
    })
    await writeSong(root, 'b', {
      title: 'Same Song',
      artist: 'Same Artist',
      duration: 181,
      source: { service: 'netease', track_id: '2' },
    })
    await writeSong(root, 'c', {
      title: 'Same Song',
      artist: 'Same Artist',
      duration: 180,
      source: { service: 'qqmusic', track_id: '3' },
    })
    const result = await inspectLibraryDuplicates(root)
    expect(result.groupCount).toBe(1)
    expect(result.songs).toHaveLength(1)
    expect(result.groups[0].reference.id).toContain('a.typingmania')
    expect(result.songs[0].source).toBe('netease')
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
