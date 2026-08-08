import { test } from '@jest/globals'

import {
  mergeCatalogMetadata,
  trustedMetadata,
} from './catalog-resolver.js'

test('verified catalog fields can repair a misspelled local identity', () => {
  const result = mergeCatalogMetadata({
    title: 'Eternl Star (English Ver.)',
    rawTitle: 'Eternl Star (English Ver.)',
    artist: 'Incomplete Artist',
    duration: 239.8,
    language: 'U',
  }, {
    title: 'Eternal Star (English Ver.)',
    rawTitle: 'Eternal Star (English Ver.)',
    artist: 'Original Artist',
    artistNames: ['Original Artist'],
    album: 'Original Soundtrack',
    duration: 240,
    language: 'EN',
    catalogVerification: {
      source: 'multi-source-consensus',
      safe: true,
      confidence: 0.96,
      verifiedFields: ['title', 'artist', 'artistNames', 'album'],
    },
  })

  expect(result).toMatchObject({
    title: 'Eternal Star (English Ver.)',
    artist: 'Original Artist',
    album: 'Original Soundtrack',
    duration: 239.8,
    language: 'EN',
  })
})

test('uncertain catalog fields never replace local metadata', () => {
  const result = mergeCatalogMetadata({
    title: 'Known Local Title',
    artist: 'Known Artist',
    album: 'Known Album',
    duration: 200,
  }, {
    title: 'Unrelated Result',
    artist: 'Another Artist',
    album: 'Another Album',
    duration: 310,
    catalogVerification: {
      source: 'catalog',
      safe: false,
      confidence: 0.4,
      verifiedFields: [],
    },
  })

  expect(result).toMatchObject({
    title: 'Known Local Title',
    artist: 'Known Artist',
    album: 'Known Album',
    duration: 200,
  })
  expect(result.catalogVerification.safe).toBe(false)
})

test('verified catalog artist evidence replaces a stale local resolution', () => {
  const result = mergeCatalogMetadata({
    title: '異人たちの時間',
    artist: '楠木灯',
    artistNames: ['楠木灯'],
    artistResolution: { version: 4, resolved: true },
  }, {
    title: '異人たちの時間',
    artist: '楠木ともり',
    artistNames: ['楠木ともり'],
    artistResolution: {
      version: 5,
      resolved: true,
      artists: [{ originalName: '楠木ともり' }],
    },
    catalogVerification: {
      safe: true,
      verifiedFields: ['title', 'artist', 'artistNames'],
    },
  })

  expect(result.artist).toBe('楠木ともり')
  expect(result.artistResolution.version).toBe(5)
})

test('a single catalog near-spelling cannot replace the local title', () => {
  const result = mergeCatalogMetadata({
    title: 'It’s only the fairy tale',
    artist: 'Yuko Miyamura',
  }, {
    title: "It's Only the Fairly Tale",
    artist: 'Yuko Miyamura',
    catalogVerification: {
      source: 'itunes-search',
      safe: true,
      confidence: 0.931,
      verifiedFields: ['title', 'artist'],
    },
  })
  expect(result.title).toBe('It’s only the fairy tale')
  expect(result.artist).toBe('Yuko Miyamura')
  expect(result.catalogVerification.verifiedFields).not.toContain('title')
})

test('single catalog punctuation and width differences remain safe', () => {
  expect(mergeCatalogMetadata({ title: 'It’s only the fairy tale' }, {
    title: "It's Only The Fairy Tale",
    catalogVerification: {
      source: 'itunes-search', safe: true, verifiedFields: ['title'],
    },
  }).title).toBe("It's Only The Fairy Tale")
})

test('independent catalog consensus can correct a non-equivalent title', () => {
  expect(mergeCatalogMetadata({ title: 'Eternl Star' }, {
    title: 'Eternal Star',
    catalogVerification: {
      source: 'multi-source-consensus', safe: true, confidence: 0.96,
      verifiedFields: ['title'], corroboratedBy: ['itunes', 'musicbrainz'],
    },
  }).title).toBe('Eternal Star')
})

test('a provider alias cannot certify a localized artist as an original name', () => {
  const suspicious = trustedMetadata({
    title: 'はじめてのSEASON',
    artist: '纯情的Afilia',
    artistNames: ['纯情的Afilia'],
    language: 'JP',
    duration: 244,
  }, 'provider-catalog')
  expect(suspicious.catalogVerification).toMatchObject({
    safe: false,
  })
  expect(suspicious.catalogVerification.verifiedFields).not.toContain('artist')

  const original = trustedMetadata({
    title: 'はじめてのSEASON',
    artist: '純情のアフィリア',
    artistNames: ['純情のアフィリア'],
    language: 'JP',
    duration: 244,
  }, 'provider-catalog')
  expect(original.catalogVerification.safe).toBe(true)
  expect(original.catalogVerification.verifiedFields).toContain('artist')
})
