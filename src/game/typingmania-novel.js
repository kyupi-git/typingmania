import Viewport from '../graphics/viewport.js'
import InputHandler from './input.js'
import Sound from '../media/sound.js'
import Sfx from '../media/sfx.js'
import SongSystem from '../song/songsystem.js'
import LoadingController from './controller/1-loading.js'
import MenuController from './controller/2-menu.js'
import SongLoadController from './controller/3-song-load.js'
import SongController from './controller/4-song.js'
import ResultController from './controller/5-result.js'
import VolumeController from './controller/9-volume.js'
import LoadingScreen from '../screen/1-loading.js'
import MenuScreen from '../screen/2-menu.js'
import SongScreen from '../screen/4-song.js'
import ResultScreen from '../screen/5-result.js'
import SongInfoScreen from '../screen/8-songinfo.js'
import BackgroundScreen from '../screen/9-background.js'
import I18n from '../i18n.js'
import GamePreferences from './preferences.js'

function clearLegacySongTranslationCache () {
  try {
    const storage = window.localStorage
    const keys = []
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index)
      if (key?.startsWith('typingmania:song-translations:')) keys.push(key)
    }
    for (const key of keys) storage.removeItem(key)
  } catch {}
}

export default class TypingManiaNovel {
  constructor (config) {
    this.config = Object.assign({}, {
      assets_url: 'assets/assets.dat',
      songs_url: 'data/songs.json',
    }, config)

    this.viewport = new Viewport(1920, 1080)
    this.input = new InputHandler()
    this.i18n = new I18n()
    this.preferences = new GamePreferences()
    this.sound = new Sound()
    this.sfx = new Sfx(this.sound)
    this.songs = new SongSystem(this.sound)
    clearLegacySongTranslationCache()

    // Will be set in song-load because they're not global
    this.typing = null
    this.score = null
    this.media = null

    this.background_screen = new BackgroundScreen(this.viewport, this.i18n)
    this.songinfo_screen = new SongInfoScreen(this.viewport, this.i18n)
    this.loading_screen = new LoadingScreen(this.viewport, this.i18n)
    this.menu_screen = new MenuScreen(this.viewport, this.i18n)
    this.song_screen = new SongScreen(this.viewport, this.i18n)
    this.result_screen = new ResultScreen(this.viewport, this.i18n)
    this.menu_screen.setKeyEffectsEnabled(
      this.preferences.keyEffectsEnabled,
    )
    this.song_screen.setKeyEffectsEnabled(
      this.preferences.keyEffectsEnabled,
    )
    this.song_screen.setKeyEffectsReducedMotion(
      this.preferences.reducedMotion,
    )

    this.loading_controller = new LoadingController(this)
    this.menu_controller = new MenuController(this)
    this.song_load_controller = new SongLoadController(this)
    this.song_controller = new SongController(this)
    this.result_controller = new ResultController(this)

    this.volume_controller = new VolumeController(this)

    this.game_mode = 'normal'
    this.i18n.subscribe(() => this.applyLocale())
  }

  applyLocale () {
    for (const screen of [
      this.background_screen,
      this.songinfo_screen,
      this.loading_screen,
      this.menu_screen,
      this.song_screen,
      this.result_screen,
    ]) {
      screen.setLocale?.()
    }
    if (this.menu_controller.current_collection) {
      this.menu_controller.resortCurrentCollection()
    }
  }

  waitForOptionalStage (promise, timeoutMs = 15000) {
    return new Promise(resolve => {
      const timer = setTimeout(() => {
        resolve({ status: 'timeout' })
      }, timeoutMs)
      promise.then(
        value => {
          clearTimeout(timer)
          resolve({ status: 'complete', value })
        },
        error => {
          clearTimeout(timer)
          resolve({ status: 'error', error })
        },
      )
    })
  }

  reset () {
    // Reset all song-dependant system
    if (this.media) {
      this.media.pause()
      this.media.destroy()
    }
    this.typing = null
    this.score = null
    this.media = null
  }

  // Main game/input loop
  async run () {
    let runner = this.loading_controller

    while (true) {
      runner = await runner.run()
      if (!runner) {
        break
      }
    }
  }
}
