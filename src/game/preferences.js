export const KEY_EFFECTS_STORAGE_KEY = 'typingmania:preferences:key-effects'
export const MUSIC_VIDEO_STORAGE_KEY = 'typingmania:preferences:music-video'
export const SONG_SORT_MODE_STORAGE_KEY = 'typingmania:preferences:song-sort-mode'
export const SONG_SORT_DIRECTION_STORAGE_KEY = 'typingmania:preferences:song-sort-direction'

const SONG_SORT_MODES = new Set(['added', 'cpm', 'title', 'artist'])
const SONG_SORT_DIRECTIONS = new Set(['asc', 'desc'])
const PLAY_STYLES = new Set(['normal', 'simple', 'demo'])

function browserStorage () {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

function browserPrefersReducedMotion () {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function storedBoolean (storage, key) {
  try {
    const value = storage?.getItem(key)
    if (value === 'true') return true
    if (value === 'false') return false
  } catch {}
  return null
}

function storedChoice (storage, key, choices, fallback) {
  try {
    const value = storage?.getItem(key)
    return choices.has(value) ? value : fallback
  } catch {
    return fallback
  }
}

export default class GamePreferences {
  constructor ({
    storage = undefined,
    prefersReducedMotion = undefined,
  } = {}) {
    this.storage = storage === undefined ? browserStorage() : storage
    const reducedMotion = prefersReducedMotion === undefined
      ? browserPrefersReducedMotion()
      : Boolean(prefersReducedMotion)
    this.reducedMotion = reducedMotion
    const savedKeyEffects = storedBoolean(
      this.storage,
      KEY_EFFECTS_STORAGE_KEY,
    )
    // Reduced motion changes the animation profile instead of silently
    // disabling feedback on a new computer.
    this.keyEffectsEnabled = savedKeyEffects ?? true
    this.musicVideoEnabled = storedBoolean(
      this.storage,
      MUSIC_VIDEO_STORAGE_KEY,
    ) ?? false
    this.songSortMode = storedChoice(
      this.storage,
      SONG_SORT_MODE_STORAGE_KEY,
      SONG_SORT_MODES,
      'added',
    )
    this.songSortDirection = storedChoice(
      this.storage,
      SONG_SORT_DIRECTION_STORAGE_KEY,
      SONG_SORT_DIRECTIONS,
      'asc',
    )
    // Play style is deliberately session-scoped. Every launch starts in the
    // score-comparable Standard mode; Simple and Demo remain explicit choices
    // for the current session only.
    this.playStyle = 'normal'
  }

  setKeyEffectsEnabled (enabled) {
    const next = Boolean(enabled)
    if (next === this.keyEffectsEnabled) return false
    this.keyEffectsEnabled = next
    try {
      this.storage?.setItem(KEY_EFFECTS_STORAGE_KEY, String(next))
    } catch {}
    return true
  }

  toggleKeyEffects () {
    this.setKeyEffectsEnabled(!this.keyEffectsEnabled)
    return this.keyEffectsEnabled
  }

  setMusicVideoEnabled (enabled) {
    const next = Boolean(enabled)
    if (next === this.musicVideoEnabled) return false
    this.musicVideoEnabled = next
    try {
      this.storage?.setItem(MUSIC_VIDEO_STORAGE_KEY, String(next))
    } catch {}
    return true
  }

  toggleMusicVideo () {
    this.setMusicVideoEnabled(!this.musicVideoEnabled)
    return this.musicVideoEnabled
  }

  setSongSort (mode, direction) {
    const nextMode = SONG_SORT_MODES.has(mode) ? mode : 'added'
    const nextDirection = SONG_SORT_DIRECTIONS.has(direction)
      ? direction
      : 'asc'
    const changed = nextMode !== this.songSortMode ||
      nextDirection !== this.songSortDirection
    this.songSortMode = nextMode
    this.songSortDirection = nextDirection
    try {
      this.storage?.setItem(SONG_SORT_MODE_STORAGE_KEY, nextMode)
      this.storage?.setItem(
        SONG_SORT_DIRECTION_STORAGE_KEY,
        nextDirection,
      )
    } catch {}
    return changed
  }

  setPlayStyle (style) {
    const next = PLAY_STYLES.has(style) ? style : 'normal'
    if (next === this.playStyle) return false
    this.playStyle = next
    return true
  }

}
