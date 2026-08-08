import { format_time } from '../../screen/0-common.js'
import HTMLTypingLine from '../../typing/dom/htmltypingline.js'
import { nextPlayableTypingKey } from '../../typing/typing-text.js'
import DemoPlayer from '../demo-player.js'
import AssistPlayer from '../assist-player.js'
import {
  songLeadInDuration,
  waitForResultReveal,
} from '../song-transition.js'

export default class SongController {
  constructor (game) {
    this.game = game
    this.in_screen = false

    this.demo_player = null
    this.assist_player = null
    this.auto_paused = false

    this.animation_frame_id = null
    this.animation_frame_callback = this.animationFrame.bind(this)
    this.animation_error_count = 0
    this.optional_frame_failures = new Set()

    // To pause song when tab go out of focus
    // This is kinda important because the main loop use the requestAnimationFrame mechanism
    document.addEventListener('visibilitychange', this.visibilityChanged.bind(this))
  }

  async run () {
    this.optional_frame_failures.clear()
    this.animation_error_count = 0
    this.game.song_screen.show()
    this.game.song_screen.setTypingRuby(false)
    this.game.song_screen.setKeyEffectsEnabled(
      this.game.preferences.keyEffectsEnabled,
    )
    if (this.game.game_mode === 'assist') {
      this.assist_player = new AssistPlayer(this.game.typing, this, {
        language: this.game.songs.current_song?.language,
      })
    }
    this.game.song_screen.beginKeyEffects(
      ['normal', 'easy', 'tempo', 'auto', 'assist'].includes(this.game.game_mode)
        ? this.game.typing.lines.map((line, id) => ({
            id,
            text: this.assist_player
              ? this.assist_player.lineEffectText(id)
              : line.getRemainingText(),
            startTime: line.start_time,
            endTime: line.end_time,
          }))
        : [],
    )
    this.game.background_screen.showSongUI(true)
    this.game.score.setToSongScreen(this.game.song_screen)

    // These variables contain the lyrics display info
    this.typing_dom = null
    this.current_line = null
    this.current_typing = -1

    // Set up split progressbar
    if (this.game.game_mode !== 'blank') {
      // No interval info for BLANK mode
      const song_intervals = this.game.typing.getIntervals().map((x) => x / this.game.media.getDuration())
      if (song_intervals[song_intervals.length - 1] < 1) {
        song_intervals.push(1)
      }
      this.game.song_screen.ui_progress_all.chapter(song_intervals)
    } else {
      this.game.song_screen.ui_progress_all.chapter([1])
    }

    const firstPlayableLine = this.game.typing.lines.find(
      line => line.getCharacterCount() > 0,
    )
    await this.game.song_screen.playLeadIn(
      songLeadInDuration(firstPlayableLine?.start_time),
      { reducedMotion: this.game.preferences.reducedMotion },
    )

    // Media time remains at zero during the lead-in, so lyric timing,
    // predictive Keyfall targets, scoring, and CPM retain one shared clock.
    // Create the end signal before the first frame. Empty or malformed
    // timelines must never be able to call an undefined signal handler.
    this.ended_signal = new Promise((resolve) => {
      this.signal_end = resolve
    })
    this.in_screen = true
    this.animation_frame_id = requestAnimationFrame(
      this.animation_frame_callback,
    )

    // Play media
    this.game.media.play()
    this.game.music_video?.play(this.game.media)
    this.triggerTypingChange()

    if (this.game.media.hasVideo()) {
      this.game.background_screen.hideSongBackground()
    } else if (this.game.music_video) {
      this.game.background_screen.hideSongPoster()
    }

    // Set up the human-paced perfect demonstration.
    if (this.game.game_mode === 'auto') {
      this.demo_player = new DemoPlayer(this.game.typing, this)
    }

    let naturalEnd = false
    while (true) {
      const keyEvent = await Promise.any([this.game.input.waitForAnyKey(), this.ended_signal])

      // End signal received
      if (keyEvent === true) {
        naturalEnd = true
        break
      }

      // Either familiar back key exits immediately.
      if (
        keyEvent.key === 'Escape' ||
        keyEvent.key === 'Backspace'
      ) {
        break
      }

      // A demonstration is deterministic and perfect. Player keystrokes do
      // not compete with its synthetic input; both back keys remain available.
      if (this.game.game_mode === 'auto') {
        continue
      }

      // Skip line
      if (keyEvent.key === 'Tab') {
        this.skipCurrentLine()
        continue
      }

      // If it is typing key
      if (
        /^[a-z]$/i.test(keyEvent.key) &&
        this.current_line &&
        !this.current_line.isCompleted()
      ) {
        const key = keyEvent.key
        if (this.game.game_mode === 'tempo') {
          if (this.current_line && !this.current_line.isCompleted()) {
            const target = nextPlayableTypingKey(
              this.current_line.getRemainingText(),
            )
            if (target) this.type(target, { displayKey: key })
          }
        } else {
          if (this.game.game_mode === 'assist') {
            this.assist_player?.type(key)
          } else {
            this.type(key)
          }
        }
      }
    }

    // Let the final lyric, sound, and key feedback settle before replacing
    // the playfield. Explicit abandonment remains immediate.
    await waitForResultReveal(naturalEnd)

    this.game.song_screen.hide()
    this.game.song_screen.endKeyEffects()
    this.game.background_screen.showSongUI(false)
    this.in_screen = false
    if (this.animation_frame_id !== null) {
      cancelAnimationFrame(this.animation_frame_id)
      this.animation_frame_id = null
    }

    if (this.game.media.hasVideo() || this.game.music_video) {
      this.game.background_screen.showSongBackground()
    }
    this.game.music_video?.pause()

    if (this.demo_player) {
      this.demo_player.stop()
      this.demo_player = null
    }
    this.assist_player = null
    this.game.score.finish(this.game.media.getCurrentTime())

    return this.game.result_controller
  }

  type (key, {
    displayKey = key,
    showFeedback = true,
    playSound = true,
    updateDisplay = true,
    finishLine = true,
    recordScore = true,
    feedbackKind = 'player',
    forceReject = false,
    inputTime = null,
  } = {}) {
    // Try to process input key
    const lineId = this.game.typing.current_line
    const accept = forceReject ? -1 : this.current_line.accept(key)

    const currentTime = inputTime === null
      ? this.game.media.getCurrentTime()
      : inputTime
    if (recordScore) this.game.score.onType(currentTime, accept)
    let keyFeedback = null
    if (showFeedback) {
      keyFeedback = this.game.song_screen.showKeyFeedback(
        displayKey,
        accept >= 0,
        {
          lineId,
          remainingText: this.current_line.getRemainingText(),
          currentTime,
          kind: feedbackKind,
        },
      )
    }
    if (updateDisplay) this.updateTypingLine()

    // Play sfx
    if (playSound && accept < 0) {
      this.game.sfx.play('error')
    } else if (playSound) {
      this.game.sfx.play('key', { volume: 0.36 })
      if (
        Number(keyFeedback?.streak || 0) >= 25 &&
        keyFeedback.streak % 25 === 0
      ) {
        this.game.sfx.play('ready', { volume: 0.18 })
      }
    }

    // If line is completed
    if (finishLine && this.current_line.isCompleted()) {
      this.game.score.onLineEnd(0, currentTime)
      this.triggerTypingChange()
    }
    return accept
  }

  updateTypingLine () {
    // This update the typing text at the bottom of the screen
    // Blind mode only shows 1 char, blank mode shows nothing.
    if (this.current_line && this.game.game_mode !== 'blank') {
      const text = this.game.game_mode === 'assist' && this.assist_player
        ? this.assist_player.requiredText()
        : this.current_line.getRemainingText()
      this.game.song_screen.setTypingText(text, this.game.game_mode === 'blind')
    } else {
      this.game.song_screen.setTypingText('')
    }

    // Also update score
    this.game.score.setToSongScreen(this.game.song_screen)
  }

  triggerTypingChange () {
    const current_line = this.game.typing.getCurrentLine()
    const next_line = this.game.typing.getNextLine()

    this.current_line = current_line

    if (current_line && !current_line.isCompleted()) {
      // The typing line is active
      if (this.current_typing !== this.game.typing.current_line) {
        // First time, create new typing
        this.current_typing = this.game.typing.current_line
        if (this.game.game_mode !== 'blind' && this.game.game_mode !== 'blank') {
          this.typing_dom = new HTMLTypingLine(current_line)
          this.game.song_screen.setTypingRuby(this.typing_dom.el)
        }
      }
      current_line.makeActive()
      this.assist_player?.syncLine()
      this.updateTypingLine()
    } else if (next_line) {
      // Show the next line preview if the line is completed
      if (this.current_typing !== this.game.typing.current_line + 1) {
        // First time, create new typing
        this.current_typing = this.game.typing.current_line + 1
        if (this.game.game_mode !== 'blind' && this.game.game_mode !== 'blank') {
          this.typing_dom = new HTMLTypingLine(next_line)
          this.game.song_screen.setTypingRuby(this.typing_dom.el)
        }
      }
      this.updateTypingLine()
    } else {
      this.game.song_screen.setTypingRuby(false)
      this.updateTypingLine()
    }
  }

  runOptionalFramePart (name, callback) {
    if (this.optional_frame_failures.has(name)) return
    try {
      callback()
    } catch (error) {
      // Demo input is retried on the next frame; a transient failure must not
      // disable auto mode for the remainder of the song.
      if (name !== 'demo') {
        this.optional_frame_failures.add(name)
        console.error('Disabled optional song effect after a runtime error:', name, error)
      } else {
        this.demo_frame_failures = (this.demo_frame_failures || 0) + 1
        if (this.demo_frame_failures <= 3 || this.demo_frame_failures % 120 === 0) {
          console.error('Recovered demo input from a runtime error', error)
        }
      }
      if (name === 'keyfall') {
        try {
          this.game.song_screen.endKeyEffects()
        } catch {}
      }
    }
  }

  skipCurrentLine () {
    const line = this.game.typing.getCurrentLine()
    if (!line) return false
    const currentTime = this.game.media.getCurrentTime()
    this.game.song_screen.finishKeyEffectLine(
      this.game.typing.current_line,
      currentTime,
      !line.isCompleted(),
    )
    // Seek just beyond the scoring window. The former -0.2 second target
    // often rendered the same line again and made Tab appear ineffective.
    this.game.media.skipTo(Math.max(currentTime, line.end_time + 0.01))
    this.game.music_video?.skipTo(this.game.media)
    return true
  }

  reportAnimationError (error) {
    this.animation_error_count++
    // Avoid flooding the console when a browser extension or a damaged
    // element causes the same operation to fail on successive frames.
    if (
      this.animation_error_count <= 3 ||
      this.animation_error_count % 120 === 0
    ) {
      console.error('Song frame recovered from a runtime error', error)
    }
  }

  animationFrame () {
    this.animation_frame_id = null
    if (!this.in_screen) return
    try {
      const current_time = this.game.media.getCurrentTime()
      const duration = this.game.media.getDuration()
      this.runOptionalFramePart('keyfall', () => {
        this.game.song_screen.updateKeyEffects(current_time)
      })
      this.runOptionalFramePart('music-video', () => {
        this.game.music_video?.sync(this.game.media)
      })

      // Update song playback info on screen
      this.game.song_screen.ui_time.text(`${format_time(current_time)} / ${format_time(duration)}`)

      // Main progress bar
      this.game.song_screen.ui_progress_all.progress(
        duration > 0 ? current_time / duration : 0,
      )

      // Interval progress bar
      const current_line = this.game.typing.getCurrentLine()
      if (current_line && this.game.game_mode !== 'blank') {
        this.game.song_screen.ui_progress_int.progress((current_time - current_line.start_time) / (current_line.duration))
      } else {
        this.game.song_screen.ui_progress_int.progress(0)
      }

      // Update typing system
      if (this.demo_player) {
        this.runOptionalFramePart('demo', () => {
          this.demo_player.update(current_time)
        })
      }
      if (this.game.game_mode === 'easy' && current_line && current_time > current_line.end_time && !current_line.isCompleted()) {
        // In easy mode, wait for the line to complete before advancing
        const left_percent =  (1 - (current_line.getLeftoverCharCount() / current_line.getCharacterCount()))
        this.game.media.skipTo(current_line.start_time + left_percent * (current_line.end_time - current_line.start_time))
      } else {
        if (
          this.assist_player &&
          current_line &&
          current_time > current_line.end_time &&
          !current_line.isCompleted()
        ) {
          this.assist_player.finishExpiredLine(this.game.typing.current_line)
        }
        let skipped = false
        const processTransition = (transition) => {
          const leftover = this.assist_player
            ? this.assist_player.takeMissed(transition.lineId)
            : transition.leftover
          this.runOptionalFramePart('keyfall', () => {
            this.game.song_screen.finishKeyEffectLine(
              transition.lineId,
              current_time,
              leftover > 0,
            )
          })
          if (leftover > 0) {
            this.game.score.onLineEnd(
              leftover,
              transition.endTime,
            )
            skipped = true
          }
          // TypingMania NEO starts the next scoring window at the frame that
          // actually observed the transition. Keeping that clock preserves
          // score comparability when a delayed frame crosses several lines.
          // Auto input uses per-key scheduled timestamps. Start the next
          // scoring window at the transition boundary so a delayed frame
          // cannot make the following scheduled key go backwards in time.
          this.game.score.onLineStart(
            this.demo_player ? transition.endTime : current_time,
          )
        }
        let transitions = []
        if (this.demo_player) {
          // A delayed frame must finish each auto line before advancing it.
          let guard = 0
          while (guard++ <= this.game.typing.lines.length) {
            const active = this.game.typing.getCurrentLine()
            if (!active || current_time <= active.end_time) break
            if (!active.isCompleted()) this.demo_player.update(current_time)
            if (!active.isCompleted()) break
            const transition = this.game.typing.advanceTo(current_time, 1)
            if (!transition.length) break
            processTransition(transition[0])
            transitions.push(transition[0])
            this.triggerTypingChange()
            this.demo_player.update(current_time)
          }
        } else {
          transitions = this.game.typing.advanceTo(current_time)
          for (const transition of transitions) processTransition(transition)
        }
        if (transitions.length) {
          if (skipped) this.game.sfx.play('skip')
          if (!this.demo_player) this.triggerTypingChange()
        }
      }

      // If typing has ended
      if (this.game.typing.hasEnded()) {
        this.signal_end(true)
      }

      // Or media has ended
      if (this.game.media.ended) {
        this.signal_end(true)
      }

      this.animation_error_count = 0
    } catch (error) {
      this.reportAnimationError(error)
    } finally {
      // One rendering exception must not permanently stop the visual loop
      // while the independently decoded audio keeps playing.
      if (this.in_screen) {
        this.animation_frame_id = requestAnimationFrame(
          this.animation_frame_callback,
        )
      }
    }
  }

  visibilityChanged () {
    if (document.hidden) {
      this.auto_paused = true
      if (this.game.media)
        this.game.media.pause()
      this.game.music_video?.pause()
    } else {
      this.auto_paused = false
      if (this.game.media && this.in_screen) {
        this.game.media.play()
        this.game.music_video?.play(this.game.media)
      }
    }
  }
}
