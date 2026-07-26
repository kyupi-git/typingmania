import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { test } from '@jest/globals'

import {
  collectFiles,
  IMPORTABLE_AUDIO_EXTENSIONS,
  IMPORTABLE_FOLDER_EXTENSIONS,
} from './media-file-discovery.js'

test('recursive media discovery includes ordinary downloads and skips fragments', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-media-discovery-'))
  try {
    await fs.mkdir(path.join(root, 'album'), { recursive: true })
    await Promise.all([
      fs.writeFile(path.join(root, 'album', 'song.mp3'), Buffer.alloc(5000)),
      fs.writeFile(path.join(root, 'album', 'song.flac'), Buffer.alloc(6000)),
      fs.writeFile(path.join(root, 'album', 'partial.uc!'), Buffer.alloc(7000)),
      fs.writeFile(path.join(root, 'album', 'tiny.wav'), Buffer.alloc(100)),
    ])
    const files = await collectFiles(root, {
      extensions: IMPORTABLE_AUDIO_EXTENSIONS,
    })
    expect(files.map(file => file.extension).sort()).toEqual(['.flac', '.mp3'])
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('folder discovery keeps small lyric companions but rejects tiny audio', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-folder-discovery-'))
  try {
    await Promise.all([
      fs.writeFile(path.join(root, 'song.lrc'), '[00:01.00]hello world\n'),
      fs.writeFile(path.join(root, 'tiny.mp3'), Buffer.alloc(100)),
    ])
    const files = await collectFiles(root, {
      extensions: IMPORTABLE_FOLDER_EXTENSIONS,
    })
    expect(files.map(file => file.extension)).toEqual(['.lrc'])
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
