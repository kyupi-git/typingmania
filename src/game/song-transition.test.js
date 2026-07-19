import { test } from '@jest/globals'

import {
  EARLY_LYRIC_LEAD_IN_MS,
  resultRevealDelay,
  RESULT_REVEAL_DELAY_MS,
  songLeadInDuration,
} from './song-transition.js'

test('natural song completion pauses briefly before the result screen', () => {
  expect(RESULT_REVEAL_DELAY_MS).toBeGreaterThanOrEqual(1000)
  expect(RESULT_REVEAL_DELAY_MS).toBeLessThanOrEqual(2000)
  expect(resultRevealDelay(true)).toBe(RESULT_REVEAL_DELAY_MS)
  expect(resultRevealDelay(false)).toBe(0)
})

test('an early first lyric receives a pre-play lead-in without shifting media', () => {
  expect(songLeadInDuration(0)).toBe(EARLY_LYRIC_LEAD_IN_MS)
  expect(songLeadInDuration(1.49)).toBe(EARLY_LYRIC_LEAD_IN_MS)
  expect(songLeadInDuration(1.5)).toBe(0)
  expect(songLeadInDuration(4)).toBe(0)
  expect(songLeadInDuration(undefined)).toBe(0)
})
