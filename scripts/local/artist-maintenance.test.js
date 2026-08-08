import { jest, test } from '@jest/globals'

import {
  hideUnverifiedLocalizedArtistNames,
  needsArtistRefresh,
  needsUnverifiedLocalizedArtistCleanup,
  refreshImportedArtistNames,
} from './artist-maintenance.js'
import { ORIGINAL_ARTIST_VERSION } from './original-artist.js'

test('legacy localized artist aliases become pending without dropping the song', async () => {
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
      artist: '仓木麻衣',
      resolved: false,
    }),
  )
})

test('native names are preserved but contradictory localized aliases fail closed', () => {
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
  })).toBe(true)
})

function legacyArtistSong (service, artist = 'いわみ まなか') {
  return {
    title: `${service} song`,
    artist,
    language: 'JP',
    _local_filename: `${service}.typingmania`,
    source: {
      service,
      artist_resolution: {
        version: 5,
        resolved: false,
        artists: [{
          raw_name: '石見舞菜香',
          original_name: artist,
          singer_mid: `${service}-singer-mid`,
        }],
      },
    },
  }
}

test('legacy QQ and NetEase artist packages use raw names, not stale original names', async () => {
  const songs = [legacyArtistSong('qqmusic'), legacyArtistSong('netease')]
  const resolver = {
    resolve: jest.fn(async artists => ({
      artists: artists.map(artist => ({
        ...artist,
        singerMid: artist.mid,
        rawName: artist.name,
        originalName: '石見舞菜香',
        resolved: true,
        source: 'test-singer-detail',
        confidence: 1,
      })),
    })),
  }
  const refreshArtist = jest.fn(async (song, resolution) => ({
    ...song,
    artist: resolution.artist,
  }))

  expect(songs.every(needsArtistRefresh)).toBe(true)
  const result = await refreshImportedArtistNames({
    root: 'test-root',
    records: songs,
    resolver,
    refreshArtist,
  })

  expect(result).toMatchObject({ inspected: 2, refreshed: 2, resolved: 2, failed: 0 })
  expect(resolver.resolve).toHaveBeenCalledWith([
    expect.objectContaining({ name: '石見舞菜香', mid: 'qqmusic-singer-mid' }),
    expect.objectContaining({ name: '石見舞菜香', mid: 'netease-singer-mid' }),
  ])
  expect(refreshArtist.mock.calls.map(([, resolution]) => resolution.artist))
    .toEqual(['石見舞菜香', '石見舞菜香'])
})

test('non-Japanese and current artist packages are not rewritten', async () => {
  const current = legacyArtistSong('netease', '石見舞菜香')
  current.source.artist_resolution.version = ORIGINAL_ARTIST_VERSION
  current.source.artist_resolution.resolved = true
  const english = legacyArtistSong('apple-music', 'Jane Doe')
  english.language = 'EN'
  english.source.artist_resolution.version = ORIGINAL_ARTIST_VERSION
  english.source.artist_resolution.resolved = true
  const resolver = { resolve: jest.fn() }
  const refreshArtist = jest.fn()

  expect(needsArtistRefresh(current)).toBe(false)
  expect(needsArtistRefresh(english)).toBe(false)
  const result = await refreshImportedArtistNames({
    root: 'test-root',
    records: [current, english],
    resolver,
    refreshArtist,
  })

  expect(result).toMatchObject({ inspected: 0, refreshed: 0, failed: 0 })
  expect(resolver.resolve).not.toHaveBeenCalled()
  expect(refreshArtist).not.toHaveBeenCalled()
})

test('current verified packages with poisoned visible artist tags remain refresh-eligible', () => {
  const biography = legacyArtistSong('netease', '1995年出生，是日本歌手')
  biography.source.artist_resolution.version = ORIGINAL_ARTIST_VERSION
  biography.source.artist_resolution.resolved = true
  const localized = legacyArtistSong('qqmusic', '仓木麻衣')
  localized.source.artist_resolution.version = ORIGINAL_ARTIST_VERSION
  localized.source.artist_resolution.resolved = true

  expect(needsArtistRefresh(biography)).toBe(true)
  expect(needsArtistRefresh(localized)).toBe(true)
  const valid = legacyArtistSong('netease', '石見舞菜香')
  valid.source.artist_resolution.version = ORIGINAL_ARTIST_VERSION
  valid.source.artist_resolution.resolved = true
  expect(needsArtistRefresh(valid)).toBe(false)
})

test('artist network failure leaves legacy package unchanged', async () => {
  const song = legacyArtistSong('netease')
  const refreshArtist = jest.fn(async (existing, resolution) => ({
    ...existing,
    artist: resolution.artist,
  }))
  const result = await refreshImportedArtistNames({
    root: 'test-root',
    records: [song],
    resolver: { resolve: jest.fn().mockRejectedValue(new Error('offline')) },
    refreshArtist,
  })

  expect(result).toMatchObject({ inspected: 1, refreshed: 1, unresolved: 1, failed: 1 })
  expect(song.artist).toBe('いわみ まなか')
  expect(refreshArtist).toHaveBeenCalledWith(song, expect.objectContaining({
    status: 'pending', artist: '石見舞菜香',
  }))
})

test('an unresolved resolver result is counted as unresolved, not refreshed', async () => {
  const song = legacyArtistSong('qqmusic')
  const refreshArtist = jest.fn()
  const result = await refreshImportedArtistNames({
    root: 'test-root',
    records: [song],
    resolver: {
      resolve: jest.fn(async artists => ({
        artists: artists.map(artist => ({
          ...artist,
          originalName: '',
          resolved: false,
        })),
      })),
    },
    refreshArtist,
  })

  expect(result).toMatchObject({ inspected: 1, refreshed: 1, resolved: 0, unresolved: 1, failed: 0 })
  expect(refreshArtist).toHaveBeenCalled()
})

test('a native no-MID kana name upgrades offline without network access', async () => {
  const song = legacyArtistSong('local-files', 'ナナヲアカリ')
  song.source.artist_resolution.artists[0].singer_mid = ''
  song.source.artist_resolution.artists[0].raw_name = 'ナナヲアカリ'
  const resolver = {
    resolve: jest.fn(async artists => ({
      artists: artists.map(artist => ({
        ...artist,
        originalName: artist.name,
        resolved: true,
      })),
    })),
  }
  const refreshArtist = jest.fn(async (existing, resolution) => ({
    ...existing,
    artist: resolution.artist,
  }))

  const result = await refreshImportedArtistNames({
    root: 'test-root',
    records: [song],
    resolver,
    refreshArtist,
  })

  expect(result).toMatchObject({ inspected: 1, refreshed: 1, resolved: 1, unresolved: 0 })
  expect(resolver.resolve).toHaveBeenCalledWith([
    expect.objectContaining({ name: 'ナナヲアカリ', mid: '' }),
  ])
  expect(refreshArtist).toHaveBeenCalledWith(
    song,
    expect.objectContaining({ artist: 'ナナヲアカリ', resolved: true }),
  )
})

test('a native no-MID English name upgrades offline without network access', async () => {
  const song = legacyArtistSong('apple-music', 'Taylor Swift')
  song.language = 'EN'
  song.source.artist_resolution.artists[0].singer_mid = ''
  song.source.artist_resolution.artists[0].raw_name = 'Taylor Swift'
  const refreshArtist = jest.fn()
  const resolver = {
    resolve: jest.fn(async artists => ({
      artists: artists.map(artist => ({
        ...artist,
        originalName: artist.name,
        resolved: true,
      })),
    })),
  }
  const result = await refreshImportedArtistNames({
    root: 'test-root', records: [song], resolver, refreshArtist,
  })
  expect(result).toMatchObject({ refreshed: 1, resolved: 1, unresolved: 0 })
})

test('a suspicious no-MID localized alias remains pending and is written', async () => {
  const song = legacyArtistSong('local-files', '楠木灯')
  song.source.artist_resolution.artists[0].singer_mid = ''
  song.source.artist_resolution.artists[0].raw_name = '楠木灯'
  const resolver = {
    resolve: jest.fn(async artists => ({
      artists: artists.map(artist => ({
        ...artist,
        originalName: '',
        resolved: false,
      })),
    })),
  }
  const refreshArtist = jest.fn()

  const result = await refreshImportedArtistNames({
    root: 'test-root',
    records: [song],
    resolver,
    refreshArtist,
  })

  expect(result).toMatchObject({ inspected: 1, refreshed: 1, resolved: 0, unresolved: 1 })
  expect(refreshArtist).toHaveBeenCalled()
})

test('exact QQ media ID recovery accepts media_mid when songMid differs', async () => {
  const song = legacyArtistSong('qqmusic', '旧显示名')
  song.source.media_mid = 'media-1'
  const refreshArtist = jest.fn(async (existing, resolution) => ({ ...existing, artist: resolution.artist }))
  const result = await refreshImportedArtistNames({
    root: 'test-root', records: [song], refreshArtist,
    fetchQQMetadata: async id => ({
      songMid: 'song-1', mediaMid: id, title: 'qqmusic song', duration: 120,
      artists: [{ mid: 'artist-mid', name: '石見舞菜香' }],
    }),
    resolver: { resolve: async artists => ({ artists: artists.map(artist => ({
      ...artist, rawName: artist.name, originalName: artist.name, resolved: true,
    })) }) },
  })
  expect(result).toMatchObject({ refreshed: 1, resolved: 1 })
  expect(refreshArtist).toHaveBeenCalledWith(song, expect.objectContaining({ artist: '石見舞菜香' }))
})

test('exact QQ ID mismatch does not overwrite the pending artist', async () => {
  const song = legacyArtistSong('qqmusic', '旧显示名')
  song.source.song_mid = 'wanted'
  const refreshArtist = jest.fn(async (existing, resolution) => ({ ...existing, artist: resolution.artist }))
  await refreshImportedArtistNames({
    root: 'test-root', records: [song], refreshArtist,
    fetchQQMetadata: async () => ({
      songMid: 'other', mediaMid: 'other-media', title: 'qqmusic song', duration: 120,
      artists: [{ name: 'Wrong Artist' }],
    }),
    resolver: { resolve: async artists => ({ artists: artists.map(artist => ({
      ...artist, rawName: artist.name, originalName: '', resolved: false,
    })) }) },
  })
  expect(refreshArtist).toHaveBeenCalledWith(song, expect.objectContaining({
    status: 'pending', artist: '石見舞菜香',
  }))
})

test('empty artist rows recover through an exact NetEase track ID', async () => {
  const song = legacyArtistSong('netease', '')
  song.artist = ''
  song.source.artist_resolution.artists = []
  song.source.track_id = '12345'
  const refreshArtist = jest.fn(async (existing, resolution) => ({ ...existing, artist: resolution.artist }))
  const result = await refreshImportedArtistNames({
    root: 'test-root', records: [song], refreshArtist,
    fetchNetEaseMetadata: async id => ({
      id: Number(id), name: 'netease song', dt: 120000,
      ar: [{ id: 1, name: '石見舞菜香' }],
    }),
    resolver: { resolve: async artists => ({ artists: artists.map(artist => ({
      ...artist, rawName: artist.name, originalName: artist.name, resolved: true,
    })) }) },
  })
  expect(result).toMatchObject({ inspected: 1, refreshed: 1, resolved: 1 })
  expect(refreshArtist).toHaveBeenCalledWith(song, expect.objectContaining({ artist: '石見舞菜香' }))
})

test('an exact track with no plausible artist remains unresolved', async () => {
  const song = legacyArtistSong('netease', '')
  song.artist = ''
  song.source.artist_resolution.artists = []
  song.source.track_id = '12345'
  const refreshArtist = jest.fn()
  const result = await refreshImportedArtistNames({
    root: 'test-root', records: [song], refreshArtist,
    fetchNetEaseMetadata: async id => ({ id: Number(id), name: 'netease song', dt: 120000, ar: [] }),
    resolver: { resolve: jest.fn() },
  })
  expect(result).toMatchObject({ inspected: 1, unresolved: 1, refreshed: 0, resolved: 0 })
  expect(refreshArtist).not.toHaveBeenCalled()
})

test('plausible embedded artist tags become pending when rows were cleared', async () => {
  const song = legacyArtistSong('local-files', '楠木灯')
  song.artist = '楠木灯'
  song.source.artist_resolution.artists = []
  const refreshArtist = jest.fn(async (existing, resolution) => ({ ...existing, artist: resolution.artist }))
  const result = await refreshImportedArtistNames({
    root: 'test-root', records: [song], refreshArtist,
    resolver: { resolve: async artists => ({ artists: artists.map(artist => ({
      ...artist, rawName: artist.name, originalName: '', resolved: false,
    })) }) },
  })
  expect(result).toMatchObject({ inspected: 1, unresolved: 1, refreshed: 1, resolved: 0 })
  expect(refreshArtist).toHaveBeenCalledWith(song, expect.objectContaining({
    status: 'pending', artist: '楠木灯',
  }))
})
