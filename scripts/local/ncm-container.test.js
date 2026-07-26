import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { expect, test } from '@jest/globals'

import { readNcmMetadata } from './ncm-container.js'

const META_KEY = Buffer.from([
  0x23, 0x31, 0x34, 0x6c, 0x6a, 0x6b, 0x5f, 0x21,
  0x5c, 0x5d, 0x26, 0x30, 0x55, 0x3c, 0x27, 0x28,
])

function metadataBlock (value) {
  const cipher = crypto.createCipheriv('aes-128-ecb', META_KEY, null)
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(`music:${JSON.stringify(value)}`, 'utf8')),
    cipher.final(),
  ])
  const block = Buffer.from(
    `163 key(Don't modify):${encrypted.toString('base64')}`,
    'ascii',
  )
  for (let index = 0; index < block.length; index++) block[index] ^= 0x63
  return block
}

test('NCM metadata is read without exposing or modifying the audio payload', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-ncm-test-'))
  try {
    const filename = path.join(directory, 'sample.ncm')
    const metadata = metadataBlock({
      musicId: 123456,
      musicName: '示例歌曲',
      artist: [['示例歌手', 8]],
      album: '示例专辑',
      albumId: 9,
      albumPic: 'http://p1.music.126.net/example.jpg',
      duration: 180000,
      bitrate: 999000,
      format: 'flac',
    })
    const key = Buffer.from([0])
    const file = Buffer.concat([
      Buffer.from('CTENFDAM', 'ascii'),
      Buffer.alloc(2),
      Buffer.from([key.length, 0, 0, 0]),
      key,
      Buffer.from([
        metadata.length & 0xff,
        (metadata.length >> 8) & 0xff,
        (metadata.length >> 16) & 0xff,
        (metadata.length >> 24) & 0xff,
      ]),
      metadata,
      Buffer.from('audio-is-not-read'),
    ])
    await fs.writeFile(filename, file)

    await expect(readNcmMetadata(filename)).resolves.toMatchObject({
      trackId: '123456',
      title: '示例歌曲',
      artist: '示例歌手',
      duration: 180,
      format: 'flac',
    })
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})
