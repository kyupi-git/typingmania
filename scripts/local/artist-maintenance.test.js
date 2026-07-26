import { jest, test } from '@jest/globals'

import {
  hideUnverifiedLocalizedArtistNames,
  needsUnverifiedLocalizedArtistCleanup,
} from './artist-maintenance.js'

test('legacy localized artist aliases are hidden without dropping the song', async () => {
  const song = {
    title: 'Song',
    artist: '仓木麻衣',
    language: 'JP',
    _local_filename: 'song.typingmania',
    source: {
      service: 'netease',
      checks: { artist_original: false },
    },
  }
  const refreshArtist = jest.fn(async (existing, resolution) => ({
    ...existing,
    artist: resolution.artist,
  }))

  expect(needsUnverifiedLocalizedArtistCleanup(song)).toBe(true)
  const result = await hideUnverifiedLocalizedArtistNames({
    records: [song],
    refreshArtist,
  })

  expect(result).toMatchObject({ inspected: 1, hidden: 1, failed: 0 })
  expect(refreshArtist).toHaveBeenCalledWith(
    song,
    expect.objectContaining({
      artist: '',
      resolved: false,
    }),
  )
})

test('verified or native Japanese artist names are preserved', () => {
  expect(needsUnverifiedLocalizedArtistCleanup({
    artist: '国府田マリ子',
    language: 'JP',
    source: {
      service: 'netease',
      checks: { artist_original: false },
    },
  })).toBe(false)
  expect(needsUnverifiedLocalizedArtistCleanup({
    artist: '仓木麻衣',
    language: 'JP',
    source: {
      service: 'netease',
      checks: { artist_original: true },
    },
  })).toBe(false)
})
