import Typing from '../../typing/typing.js'
import SyncedVideoOverlay from '../../media/synced-video-overlay.js'
import { shouldResolveMusicVideo } from '../../song/starter-song.js'
import Score from '../score.js'
import { estimateAssistReferencePace } from '../../util/song-meta.js'

async function localSession (timeoutMs = 1400) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch('/api/local/status', {
      cache: 'no-store',
      signal: controller.signal,
    })
    return response.ok ? response.json() : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export default class SongLoadController {
  constructor (game) {
    this.game = game
    this.abort_signal = null

    window.addEventListener('keydown', (e) => {
      if (
        (e.key === 'Escape' || e.key === 'Backspace') &&
        this.abort_signal
      ) {
        this.abort_signal()
      }
    })
  }

  disableMusicVideoPreference () {
    this.game.preferences.setMusicVideoEnabled(false)
    this.game.menu_screen.setMusicVideoEnabled(false)
  }

  async run () {
    const t = this.game.i18n.t.bind(this.game.i18n)
    const song = this.game.songs.current_song
    this.game.loading_screen.show()
    this.game.sfx.play('decide')

    // Load song
    this.game.loading_screen.setMainText(t('loading.loading'))
    this.game.loading_screen.setSubText(t('songLoad.song', { percent: 0 }))

    let is_error = false
    try {
      if (!song.loaded) {
        // Load abort controller
        const abort_controller = new AbortController()
        const abort_signal = abort_controller.signal
        this.abort_signal = () => {
          abort_controller.abort()
        }

        // If song hasn't been load yet, then load song with progress
        await song.load((progress) => {
          if (!is_error) {
            const p = Math.floor(progress * 100)
            this.game.loading_screen.setSubText(t('songLoad.song', { percent: p }))
          }
        }, abort_signal)

        this.abort_signal = null
      }
    } catch (error) {
      is_error = true
      console.log(error)
      this.game.loading_screen.setMainText(t('loading.error'))
      switch (error) {
        case 'ABORTED':
          // Exit to menu if aborted
          this.game.loading_screen.hide()
          this.game.reset()
          return this.game.menu_controller
        case 'NETWORK_ERROR':
          this.game.loading_screen.setSubText(t('songLoad.songNetwork'))
          break
        case 'NOT_FOUND':
          this.game.loading_screen.setSubText(t('songLoad.songMissing'))
          break
        case 'HTTP_ERROR':
        default:
          this.game.loading_screen.setSubText(t('songLoad.songError'))
      }
    }

    if (is_error) {
      this.game.sfx.play('error')
      await this.game.input.waitForAnyKey()
      this.game.loading_screen.hide()
      return this.game.menu_controller
    }

    // Set Song Image
    this.game.background_screen.showSongBackground(
      song.poster_url || song.image_url,
      song.poster_url ? song.image_url : '',
      { preferUpperPortrait: Boolean(song.poster_url) },
    )

    // Process lyrics
    this.game.loading_screen.setSubText(t('songLoad.lyrics'))
    try {
      this.game.typing = new Typing(song.lyrics_csv)
      const assistPace = estimateAssistReferencePace(
        this.game.typing,
        song.language,
        { durationMs: Number(song.duration) * 1000 },
      )
      song.assist_cpm = assistPace.averageCpm
      song.assist_max_cpm = assistPace.peakCpm
      this.game.score = new Score(
        this.game.game_mode === 'assist'
          ? assistPace.requiredKeys
          : this.game.typing.getScoringCharCount(),
        {
          totalLines: this.game.typing.getPlayableLineCount(),
        },
      )
    } catch (e) {
      console.log(e)
      this.game.loading_screen.setMainText(t('loading.error'))
      this.game.loading_screen.setSubText(t('songLoad.lyricsError'))
      this.game.sfx.play('error')
      await this.game.input.waitForAnyKey()
      this.game.loading_screen.hide()
      return this.game.menu_controller
    }

    // Process media
    this.game.loading_screen.setSubText(t('songLoad.media'))
    try {
      if (song.media_type === 'youtube') {
        this.game.loading_screen.setSubText(t('songLoad.youtube'))
        const available = await this.game.sound.loadYouTubeAPI()
        if (!available) throw new Error('YOUTUBE_UNAVAILABLE')
      }
      this.game.media = this.game.sound.createMedia(song)
      const loading = this.game.media.load(
        this.game.background_screen.getSongBackgroundContainer(),
      )
      if (song.media_type === 'youtube') {
        const outcome = await this.game.waitForOptionalStage(loading, 5000)
        if (outcome.status !== 'complete') {
          throw new Error('YOUTUBE_UNAVAILABLE')
        }
      } else {
        await loading
      }
    } catch (error) {
      console.warn('Unable to start song media.', error)
      this.game.loading_screen.setMainText(t('loading.error'))
      this.game.loading_screen.setSubText(
        error?.message === 'YOUTUBE_UNAVAILABLE'
          ? t('songLoad.youtubeUnavailable')
          : t('songLoad.mediaError'),
      )
      this.game.sfx.play('error')
      this.game.reset()
      await this.game.input.waitForAnyKey()
      this.game.loading_screen.hide()
      return this.game.menu_controller
    }

    // An MV is optional and never replaces the verified local song audio.
    // The downloaded video's muted picture follows the song clock, while the
    // original audio remains the single timing/scoring source.
    if (shouldResolveMusicVideo(
      song,
      this.game.preferences.musicVideoEnabled,
    )) {
      this.game.loading_screen.setSubText(t('songLoad.musicVideo'))
      const local = await localSession()
      let musicVideoReady = false
      if (local?.token && local.instance?.features?.includes('music-video-cache')) {
        try {
          const response = await fetch('/api/music-video/resolve', {
            method: 'POST',
            cache: 'no-store',
            headers: {
              'Content-Type': 'application/json',
              'X-TMN-Token': local.token,
            },
            body: JSON.stringify({ songUrl: song.url }),
          })
          const resolved = response.ok ? await response.json() : null
          if (resolved?.available && resolved.url) {
            const overlay = new SyncedVideoOverlay({
              url: resolved.url,
              offsetSeconds: resolved.offsetSeconds,
              loop: resolved.mode === 'production-loop' || resolved.loop,
            })
            await overlay.load(
              this.game.background_screen.getSongBackgroundContainer(),
            )
            this.game.music_video = overlay
            this.game.background_screen.hideSongPoster()
            musicVideoReady = true
          }
        } catch (error) {
          console.info('A verified MV is unavailable; using the poster.', error)
          this.game.music_video?.destroy()
          this.game.music_video = null
        }
      }
      // Enabling MV grants one lookup attempt for the selected song. Keep the
      // preference on only after a verified video has loaded (freshly cached
      // or reused), so unavailable songs do not repeat network work on every
      // subsequent play.
      if (!musicVideoReady) this.disableMusicVideoPreference()
    }

    // Ready
    if (!this.game.specified_song && this.game.game_mode !== 'auto') {
      this.game.loading_screen.setMainText(t('loading.ready'))
      this.game.loading_screen.setSubText(t('loading.pressAnyKey'))

      // Wait for key
      const key = await this.game.input.waitForAnyKey()
      if (key.key === 'Escape' || key.key === 'Backspace') {
        // Exit to menu if Esc or Backspace is pressed
        this.game.loading_screen.hide()
        this.game.reset()
        return this.game.menu_controller
      }
    } else if (this.game.specified_song) {
      this.game.specified_song = null
    }
    this.game.loading_screen.hide()
    this.game.sfx.play('intro')
    return this.game.song_controller
  }
}
