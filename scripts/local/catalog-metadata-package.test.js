import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { TextDecoder, TextEncoder } from 'util'

import { expect, test } from '@jest/globals'

import PackedFile from '../../src/lib/packedfile.js'
import { refreshPackedSongCatalogMetadata } from './catalog-metadata-package.js'

globalThis.TextEncoder = TextEncoder
globalThis.TextDecoder = TextDecoder

function pendingMetadata () {
  return {
    artist: '高橋洋子',
    artistNames: ['高橋洋子'],
    artistResolution: {
      resolved: false,
      artists: [{ rawName: '高橋洋子', originalName: '', resolved: false }],
    },
    language: 'JP',
  }
}

test('catalog refresh persists a pending artist without downgrading verified identity', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-catalog-artist-'))
  const filename = path.join(directory, 'song.typingmania')
  const packed = new PackedFile()
  try {
    packed.addFile('song.json', new TextEncoder().encode(JSON.stringify({
      title: 'Song',
      artist: '高橋洋子',
      language: 'JP',
      source: { checks: { artist_original: false } },
    })))
    await fs.writeFile(filename, Buffer.from(packed.pack()))
  } finally {
    packed.destroy()
  }
  try {
    await refreshPackedSongCatalogMetadata(
      { _local_filename: filename },
      pendingMetadata(),
    )
    const output = new PackedFile()
    const bytes = await fs.readFile(filename)
    output.unpackFromBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
    expect(JSON.parse(output.getAsText('song.json'))).toMatchObject({
      artist: '高橋洋子',
      source: {
        checks: { artist_original: false },
        artist_resolution: { status: 'pending', resolved: false },
      },
    })
    output.destroy()
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})

test('catalog refresh upgrades same-text pending artist to verified resolution', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-catalog-verified-'))
  const filename = path.join(directory, 'song.typingmania')
  const packed = new PackedFile()
  try {
    packed.addFile('song.json', new TextEncoder().encode(JSON.stringify({
      title: 'Song',
      artist: 'ナナヲアカリ',
      language: 'JP',
      source: {
        checks: { artist_original: true },
        artist_resolution: { version: 1, status: 'verified', resolved: true },
      },
    })))
    await fs.writeFile(filename, Buffer.from(packed.pack()))
  } finally {
    packed.destroy()
  }
  try {
    await refreshPackedSongCatalogMetadata({ _local_filename: filename }, {
      artist: 'ナナヲアカリ',
      artistNames: ['ナナヲアカリ'],
      artistResolution: { resolved: true },
      language: 'JP',
      catalogVerification: {
        safe: true,
        source: 'multi-source-consensus',
        confidence: 0.98,
        verifiedFields: ['artist', 'artistNames'],
      },
    })
    const output = new PackedFile()
    const bytes = await fs.readFile(filename)
    output.unpackFromBuffer(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
    expect(JSON.parse(output.getAsText('song.json'))).toMatchObject({
      artist: 'ナナヲアカリ',
      source: {
        checks: { artist_original: true },
        artist_resolution: { status: 'verified', resolved: true },
      },
    })
    output.destroy()
  } finally {
    await fs.rm(directory, { recursive: true, force: true })
  }
})
