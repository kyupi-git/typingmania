import { describe, expect, test } from '@jest/globals'

import {
  fetchTrackMetadataWithFallback,
  interpretQQMusicSessionResult,
  parseOfficialLyricsPayload,
  QQMusicImportError,
} from './qqmusic-api.js'

describe('QQ Music session result handling', () => {
  test.each([
    'QQMUSIC_NOT_RUNNING',
    'QQMUSIC_NOT_LOGGED_IN',
    'QQMUSIC_SESSION_INVALID',
  ])('preserves the actionable %s status code', code => {
    expect(() => interpretQQMusicSessionResult({
      ok: false,
      error: code,
    })).toThrow(expect.objectContaining({
      name: 'QQMusicImportError',
      code,
    }))
  })

  test('normalizes a usable signed-in session', () => {
    expect(interpretQQMusicSessionResult({
      ok: true,
      cookie: 'uin=123;',
      uin: 123,
      cachePaths: ['D:\\QQMusicCache'],
    })).toEqual({
      cookie: 'uin=123;',
      uin: '123',
      cachePaths: ['D:\\QQMusicCache'],
    })
  })

  test('uses the generic read failure for malformed output', () => {
    expect(() => interpretQQMusicSessionResult(null))
      .toThrow(new QQMusicImportError('QQMUSIC_SESSION_READ_FAILED'))
  })
})

test('cached media metadata falls back through lyric search hints', async () => {
  const metadataCalls = []
  const fetchMetadata = async value => {
    metadataCalls.push(value)
    if (value === 'song-mid') return { songMid: value, title: 'Found' }
    throw new Error('metadata is unavailable')
  }
  const result = await fetchTrackMetadataWithFallback(
    'media-mid',
    'cookie',
    {
      hints: [
        { title: 'Wrong', artist: 'Artist' },
        { title: 'Right', artist: 'Artist' },
      ],
      fetchMetadata,
      searchTracks: async query => (
        query.startsWith('Right')
          ? [{ mediaMid: 'media-mid', songMid: 'song-mid' }]
          : [{ mediaMid: 'other-media', songMid: 'other-song' }]
      ),
      batchSize: 2,
    },
  )

  expect(result).toEqual({ songMid: 'song-mid', title: 'Found' })
  expect(metadataCalls).toEqual(['media-mid', 'song-mid'])
})

test('official lyric payload keeps the service-provided Roma track', () => {
  const lyric = [
    '[00:01.00]宇宙を見上げる',
    '[00:03.00]明日へ歩く',
  ].join('\n')
  const roma = [
    '[00:01.00]so ra o mi a ge ru',
    '[00:03.00]a shi ta e a ru ku',
  ].join('\n')
  expect(parseOfficialLyricsPayload({
    lyric,
    roma: Buffer.from(roma).toString('base64'),
  }, {
    language: 'JP',
  })).toMatchObject({
    checked: true,
    readingChecked: true,
    lines: [
      { start: 1000, text: '宇宙を見上げる' },
      { start: 3000, text: '明日へ歩く' },
    ],
    readingLines: [
      { start: 1000, text: 'so ra o mi a ge ru' },
      { start: 3000, text: 'a shi ta e a ru ku' },
    ],
  })
})

test('official lyric parsing degrades cleanly when Roma is unavailable', () => {
  expect(parseOfficialLyricsPayload({
    lyric: '[00:01.00]宇宙を見上げる',
  }, {
    language: 'JP',
  })).toMatchObject({
    checked: true,
    readingChecked: false,
    readingLines: [],
    readingReason: 'official pronunciation unavailable',
  })
})
