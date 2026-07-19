import { test } from '@jest/globals'

import {
  canonicalSongTitle,
  songsAreEquivalent,
} from './song-identity.js'
import { makeSongsIndex } from './library.js'

test('parenthetical aliases do not create a second song identity', () => {
  expect(canonicalSongTitle('サンプル曲 (示例歌曲) (示例歌曲)'))
    .toBe(canonicalSongTitle('サンプル曲 (示例歌曲)'))
  expect(songsAreEquivalent(
    { title: 'サンプル曲 (示例歌曲)', artist: '示例歌手', duration: 272 },
    { title: 'サンプル曲 (示例歌曲) (示例歌曲)', artist: '示例歌手', duration: 270 },
  )).toBe(true)
})

test('named alternate versions and different performers remain distinct', () => {
  expect(songsAreEquivalent(
    { title: 'サンプル曲', artist: '示例歌手甲', duration: 258 },
    { title: 'サンプル曲 (Another ver.)', artist: '示例歌手甲', duration: 258 },
  )).toBe(false)
  expect(songsAreEquivalent(
    { title: '別のサンプル曲', artist: '示例歌手甲', duration: 243 },
    { title: '別のサンプル曲', artist: '示例歌手乙', duration: 243 },
  )).toBe(false)
})

test('QQ Music index preserves chronological added order', () => {
  const index = makeSongsIndex([
    {
      title: 'Newest',
      artist: 'A',
      source: {
        service: 'qqmusic',
        imported_at: '2026-07-03T00:00:00.000Z',
      },
      _local_filename: 'new.typingmania',
    },
    {
      title: 'Oldest fallback',
      artist: 'B',
      source: {
        service: 'qqmusic',
        verified_at: '2026-07-01T00:00:00.000Z',
      },
      _local_filename: 'old.typingmania',
    },
    {
      title: 'Middle',
      artist: 'C',
      source: {
        service: 'qqmusic',
        imported_at: '2026-07-02T00:00:00.000Z',
      },
      _local_filename: 'middle.typingmania',
    },
  ])

  expect(index[0].contents.map(song => song.title))
    .toEqual(['Oldest fallback', 'Middle', 'Newest'])
})
