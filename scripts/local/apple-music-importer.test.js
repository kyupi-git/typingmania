/** @jest-environment node */

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { expect, test } from '@jest/globals'

import {
  appleMusicGamdlArguments,
  discoverAppleMusicOutput,
} from './apple-music-importer.js'

import {
  appleMusicStorefrontLanguage,
  normalizeAppleMusicUrls,
} from './apple-music-url.js'

test('Apple Music input accepts songs, albums, and playlists only', () => {
  expect(normalizeAppleMusicUrls([
    'https://music.apple.com/jp/album/example/1?i=2',
    'https://music.apple.com/us/playlist/example/pl.123',
  ])).toHaveLength(2)
  expect(() => normalizeAppleMusicUrls(
    'https://music.apple.com/us/artist/example/1',
  )).toThrow(/Only Apple Music song/iu)
  expect(() => normalizeAppleMusicUrls('https://example.com/song'))
    .toThrow(/Apple Music/iu)
})

test('Apple Music selects a stable catalog language from the first URL', () => {
  expect(appleMusicStorefrontLanguage('https://music.apple.com/jp/album/example/1'))
    .toBe('ja-JP')
  expect(appleMusicStorefrontLanguage('https://music.apple.com/cn/song/example/2'))
    .toBe('zh-CN')
  expect(appleMusicStorefrontLanguage('https://music.apple.com/us/song/example/3'))
    .toBe('en-US')
  expect(appleMusicStorefrontLanguage('')).toBe('en-US')
})

test('Apple Music simulation builds a bounded AAC and synced-lyrics job', () => {
  const args = appleMusicGamdlArguments({
    runner: 'run-gamdl.py',
    urls: ['https://music.apple.com/jp/song/example/12345'],
    cookies: 'cookies.txt',
    staging: 'staging',
    output: 'staging/output',
  })
  expect(args).toEqual(expect.arrayContaining([
    '--no-config-file',
    '--no-exceptions',
    '--song-codec-priority',
    'aac-web',
    '--download-mode',
    'ytdlp',
    '--synced-lyrics-format',
    'lrc',
    '--save-cover',
    'https://music.apple.com/jp/song/example/12345',
  ]))
})

test('Apple Music simulation discovers only supported media and exact LRC companions', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-apple-sim-'))
  try {
    const album = path.join(root, 'album')
    await fs.mkdir(album, { recursive: true })
    await Promise.all([
      fs.writeFile(path.join(album, '12345.m4a'), 'simulated media'),
      fs.writeFile(path.join(album, '12345.lrc'), '[00:01.00]simulated lyric'),
      fs.writeFile(path.join(album, 'cover.jpg'), 'not media'),
      fs.writeFile(path.join(album, 'unpaired.mp4'), 'simulated media'),
    ])
    const output = await discoverAppleMusicOutput(root)
    expect(output).toHaveLength(2)
    expect(output.find(value => value.media.endsWith('12345.m4a'))?.lyrics)
      .toMatch(/12345\.lrc$/u)
    expect(output.find(value => value.media.endsWith('unpaired.mp4'))?.lyrics)
      .toBe('')
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
