import { expect, test } from '@jest/globals'

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
