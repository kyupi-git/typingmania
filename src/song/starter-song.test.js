import { test } from '@jest/globals'

import {
  isStarterSong,
  shouldResolveMusicVideo,
} from './starter-song.js'

test('only verified baseline demo songs are starter songs', () => {
  expect(isStarterSong({
    source: { service: 'typingmania-demo', baseline: true },
  })).toBe(true)
  expect(isStarterSong({
    source: { service: 'typingmania-demo', baseline: false },
  })).toBe(false)
  expect(isStarterSong({
    source: { service: 'qqmusic', baseline: true },
  })).toBe(false)
})

test('starter songs always bypass optional MV lookup', () => {
  const starter = {
    source: { service: 'typingmania-demo', baseline: true },
  }
  const imported = {
    source: { service: 'qqmusic' },
  }
  expect(shouldResolveMusicVideo(starter, true)).toBe(false)
  expect(shouldResolveMusicVideo(imported, true)).toBe(true)
  expect(shouldResolveMusicVideo(imported, false)).toBe(false)
})
