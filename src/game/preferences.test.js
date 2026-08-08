import { test } from '@jest/globals'

import GamePreferences, {
  KEY_EFFECTS_STORAGE_KEY,
  MUSIC_VIDEO_STORAGE_KEY,
  SONG_SORT_DIRECTION_STORAGE_KEY,
  SONG_SORT_MODE_STORAGE_KEY,
} from './preferences.js'

function memoryStorage (initial = {}) {
  if (typeof initial === 'string') {
    initial = { [KEY_EFFECTS_STORAGE_KEY]: initial }
  }
  const storage = {
    values: { ...initial },
    get value () {
      return storage.values[KEY_EFFECTS_STORAGE_KEY] ?? null
    },
    getItem: key => storage.values[key] ?? null,
    setItem: (key, value) => {
      storage.values[key] = value
    },
  }
  return storage
}

test('key effects default on with a visible reduced-motion profile', () => {
  const memory = memoryStorage()
  expect(new GamePreferences({
    storage: memory,
    prefersReducedMotion: false,
  }).keyEffectsEnabled).toBe(true)
  expect(new GamePreferences({
    storage: memory,
    prefersReducedMotion: true,
  }).keyEffectsEnabled).toBe(true)
  expect(new GamePreferences({
    storage: memory,
    prefersReducedMotion: true,
  }).reducedMotion).toBe(true)
})

test('an explicit key effect preference wins and persists', () => {
  const memory = memoryStorage('true')
  const preferences = new GamePreferences({
    storage: memory,
    prefersReducedMotion: true,
  })
  expect(preferences.keyEffectsEnabled).toBe(true)
  expect(preferences.toggleKeyEffects()).toBe(false)
  expect(memory.value).toBe('false')
  expect(preferences.setKeyEffectsEnabled(false)).toBe(false)
})

test('song sorting defaults, validates, and persists', () => {
  const memory = memoryStorage({
    [SONG_SORT_MODE_STORAGE_KEY]: 'cpm',
    [SONG_SORT_DIRECTION_STORAGE_KEY]: 'desc',
  })
  const preferences = new GamePreferences({ storage: memory })
  expect(preferences.songSortMode).toBe('cpm')
  expect(preferences.songSortDirection).toBe('desc')

  expect(preferences.setSongSort('artist', 'asc')).toBe(true)
  expect(memory.values[SONG_SORT_MODE_STORAGE_KEY]).toBe('artist')
  expect(memory.values[SONG_SORT_DIRECTION_STORAGE_KEY]).toBe('asc')

  preferences.setSongSort('unsupported', 'sideways')
  expect(preferences.songSortMode).toBe('added')
  expect(preferences.songSortDirection).toBe('asc')
})

test('music video playback is explicitly opt-in and persisted', () => {
  const storage = memoryStorage()
  const preferences = new GamePreferences({ storage })
  expect(preferences.musicVideoEnabled).toBe(false)
  expect(preferences.toggleMusicVideo()).toBe(true)
  expect(storage.getItem(MUSIC_VIDEO_STORAGE_KEY)).toBe('true')
  expect(new GamePreferences({ storage }).musicVideoEnabled).toBe(true)
})

test('play style starts in Standard mode for every session', () => {
  const storage = memoryStorage()
  const preferences = new GamePreferences({ storage })
  expect(preferences.playStyle).toBe('normal')
  expect(preferences.setPlayStyle('simple')).toBe(true)
  expect(new GamePreferences({ storage }).playStyle).toBe('normal')
  expect(preferences.setPlayStyle('unsupported')).toBe(true)
  expect(preferences.playStyle).toBe('normal')
})
