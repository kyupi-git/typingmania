import { test } from '@jest/globals'

import {
  artworkObjectPosition,
  DEFAULT_ARTWORK_POSITION,
  PORTRAIT_ARTWORK_POSITION,
} from './artwork-layout.js'

test('portrait key art uses an upper-biased crop', () => {
  expect(artworkObjectPosition(700, 1000, {
    preferUpperPortrait: true,
  })).toBe(PORTRAIT_ARTWORK_POSITION)
})

test('landscape and album art stay centered', () => {
  expect(artworkObjectPosition(1920, 1080, {
    preferUpperPortrait: true,
  })).toBe(DEFAULT_ARTWORK_POSITION)
  expect(artworkObjectPosition(700, 1000)).toBe(DEFAULT_ARTWORK_POSITION)
})
