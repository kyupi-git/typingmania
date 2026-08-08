import { test } from '@jest/globals'

import {
  auditLyricContent,
  auditMetadata,
} from './library-quality-audit.js'
import { ORIGINAL_ARTIST_VERSION } from './original-artist.js'

function metadata (overrides = {}) {
  return {
    title: 'Test Song',
    artist: 'Test Artist',
    language: 'EN',
    duration: 12,
    cpm: 0,
    max_cpm: 0,
    ...overrides,
  }
}

function metadataEntries () {
  return {
    audio: 1,
    'lyrics.csv': 1,
  }
}

function localizedArtistIssue (songMetadata) {
  return auditMetadata(songMetadata, metadataEntries())
    .find(found => found.code === 'localized-artist-name-visible')
}

test('trusted artist resolution is not rejected by the lyric language', () => {
  const result = localizedArtistIssue(metadata({
    artist: '東京ディズニーシー',
    source: {
      checks: { artist_original: true },
      artist_resolution: {
        version: ORIGINAL_ARTIST_VERSION,
        resolved: true,
        artists: [{
          raw_name: '東京ディズニーシー',
          original_name: '東京ディズニーシー',
          resolved: true,
        }],
      },
    },
  }), metadataEntries())

  expect(result).toBeUndefined()
})

test('an unverified Chinese artist alias remains an audit error in English', () => {
  const result = localizedArtistIssue(metadata({
    artist: '迪士尼乐园',
  }), metadataEntries())

  expect(result).toEqual(expect.objectContaining({
    severity: 'error',
    code: 'localized-artist-name-visible',
  }), metadataEntries())
})

test('an explicitly pending localized artist alias is a warning', () => {
  const result = auditMetadata(metadata({
    artist: '迪士尼乐园',
    source: {
      checks: { artist_original: false },
      artist_resolution: {
        version: ORIGINAL_ARTIST_VERSION,
        status: 'pending',
        resolved: false,
      },
    },
  }), metadataEntries())

  expect(result).toEqual(expect.arrayContaining([
    expect.objectContaining({
      severity: 'warning',
      code: 'artist-original-pending',
    }),
  ]))
  expect(result).not.toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'localized-artist-name-visible' }),
  ]))
})

test('a localized alias marked verified remains an audit error', () => {
  const result = localizedArtistIssue(metadata({
    artist: '迪士尼乐园',
    source: {
      checks: { artist_original: true },
      artist_resolution: {
        version: ORIGINAL_ARTIST_VERSION,
        status: 'verified',
        resolved: true,
        artists: [{
          raw_name: '迪士尼乐园',
          original_name: '迪士尼乐园',
          resolved: true,
        }],
      },
    },
  }), metadataEntries())

  expect(result).toEqual(expect.objectContaining({
    severity: 'error',
    code: 'localized-artist-name-visible',
  }))
})

test('an invalid biography artist remains an audit error while pending', () => {
  const result = auditMetadata(metadata({
    artist: '歌手简介：1995年出生，版权所有',
    source: {
      checks: { artist_original: false },
      artist_resolution: {
        status: 'pending',
        resolved: false,
      },
    },
  }), metadataEntries())

  expect(result).toEqual(expect.arrayContaining([
    expect.objectContaining({ severity: 'error', code: 'artist-invalid' }),
  ]))
})

test('an untrusted Japanese reading replacement remains an audit error', () => {
  const result = localizedArtistIssue(metadata({
    language: 'JP',
    artist: '迪士尼乐园（東京ディズニーシー）',
    source: {
      checks: { artist_original: false },
      artist_resolution: {
        version: 5,
        resolved: false,
        artists: [{
          raw_name: '迪士尼乐园',
          original_name: '東京ディズニーシー',
          resolved: false,
        }],
      },
    },
  }))

  expect(result).toEqual(expect.objectContaining({
    severity: 'error',
    code: 'localized-artist-name-visible',
  }))
})

test('the audit identifies an English production credit as playable text', () => {
  const csv = [
    '0,1000,Lyrics by:Example Writer',
    '1000,2000,First real lyric',
    '2000,3000,Second real lyric',
    '3000,4000,Third real lyric',
    '4000,5000,Fourth real lyric',
  ].join('\n')
  const result = auditLyricContent(metadata(), csv)

  expect(result.issues).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'non-lyric-credit' }),
  ]))
})

test('the audit requires pinyin for Chinese Han lyric lines', () => {
  const csv = [
    '0,1000,晨光落在窗前',
    '1000,2000,星光落在指尖',
    '2000,3000,我们一起向前',
    '3000,4000,歌声飞过天边',
    '4000,5000,明天就在眼前',
  ].join('\n')
  const result = auditLyricContent(metadata({
    language: 'ZH',
  }), csv)

  expect(result.issues).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'chinese-pinyin-missing' }),
  ]))
})

test('the audit rejects an instrumental break attached to a short lyric', () => {
  const csv = [
    '0,2000,Keep moving',
    '2000,4000,Sing it now',
    '4000,11500,Stay',
    '11500,13500,Come back',
    '13500,15500,One more',
  ].join('\n')
  const result = auditLyricContent(metadata({ duration: 16 }), csv)

  expect(result.issues).toEqual(expect.arrayContaining([
    expect.objectContaining({
      code: 'instrumental-gap-attached-to-lyric',
    }),
  ]))
})

test('the audit rejects a Chinese translation stored for a Japanese track', () => {
  const csv = [
    '0,1000,心中悄然萌生爱恋',
    '1000,2000,两个人相遇的奇迹',
    '2000,3000,想把这份心意告诉你',
    '3000,4000,明天也要一起向前',
    '4000,5000,直到永远都不分离',
  ].join('\n')
  const result = auditLyricContent(metadata({
    title: '恋するココロ',
    language: 'JP',
  }), csv)

  expect(result.issues).toEqual(expect.arrayContaining([
    expect.objectContaining({ code: 'translated-lyric-layer' }),
  ]))
})
