import { test } from '@jest/globals'

import { mergeCatalogMetadata } from './catalog-resolver.js'

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
