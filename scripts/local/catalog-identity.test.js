import { expect, test } from '@jest/globals'

import {
  catalogIdentitiesEquivalent,
  catalogMetadataConfidence,
  catalogTextSimilarity,
} from './catalog-identity.js'

test('Chinese-localized and Japanese character variants compare phonetically', () => {
  expect(catalogIdentitiesEquivalent('产巣日の时', '産巣日の時')).toBe(true)
  expect(catalogIdentitiesEquivalent('釘宮理恵', '钉宫理惠')).toBe(true)
  expect(catalogIdentitiesEquivalent('小さな恋', '大きな恋')).toBe(false)
})

test('small title typos can be corrected with artist and duration evidence', () => {
  expect(catalogTextSimilarity('Eternal Str', 'Eternal Star'))
    .toBeGreaterThan(0.85)
  const matched = catalogMetadataConfidence({
    title: 'Eternal Str',
    artist: 'Example Artist',
    duration: 214,
  }, {
    title: 'Eternal Star',
    artist: 'Example Artist',
    duration: 214.8,
    album: 'Example Film Soundtrack',
  })
  expect(matched.safe).toBe(true)
  expect(matched.verifiedFields).toEqual(expect.arrayContaining([
    'title',
    'artist',
    'album',
    'duration',
  ]))
})

test('same-title recordings by another artist are never safe corrections', () => {
  expect(catalogMetadataConfidence({
    title: 'Blue',
    artist: 'Artist One',
    duration: 210,
  }, {
    title: 'Blue',
    artist: 'Artist Two',
    duration: 210,
  }).safe).toBe(false)
})
