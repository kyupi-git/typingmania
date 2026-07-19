import { format_time } from '../../screen/0-common.js'
import HTMLTypingLine from '../../typing/dom/htmltypingline.js'
import { nextPlayableTypingKey } from '../../typing/typing-text.js'
import DemoPlayer from '../demo-player.js'
import {
  songLeadInDuration,
  waitForResultReveal,
} from '../song-transition.js'

export default class SongController {
  constructor (game) {
    this.game = game
    this.in_screen = false

    this.demo_player = null
    this.auto_paused = false

    this.vis_bins = new Uint8Array(game.sound.analyser.frequencyBinCount)

    // To pause song when tab go out of focus
    // This is kinda important because the main loop use the requestAnimationFrame mechanism
    document.addEventListener('visibilitychange', this.visibilityChanged.bind(this))
  }

  async run () {
    this.game.song_screen.show()
    this.game.song_screen.setTypingRuby(false)
    this.game.song_screen.setKeyEffectsEnabled(
      this.game.preferences.keyEffectsEnabled,
    )
    this.game.song_screen.beginKeyEffects(
      ['normal', 'easy', 'tempo', 'auto'].includes(this.game.game_mode)
        ? this.game.typing.lines.map((line, id) => ({
            id,
            text: line.getRemainingText(),
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
    this.in_screen = true
    this.animationFrame()

    // Play media
    this.game.media.play()
    this.triggerTypingChange()

    if (this.game.media.hasVideo()) {
      this.game.background_screen.hideSongBackground()
    }

    // End signaler from main loop to input loop (this function)
    this.ended_signal = new Promise((resolve) => {
      this.signal_end = resolve
    })

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
        const line = this.game.typing.getCurrentLine()
        if (line) {
          this.game.song_screen.finishKeyEffectLine(
            this.game.typing.current_line,
            this.game.media.getCurrentTime(),
            !line.isCompleted(),
          )
          this.game.media.skipTo(line.end_time - 0.2)
        }
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
          this.type(key)
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

    if (this.game.media.hasVideo()) {
      this.game.background_screen.showSongBackground()
    }

    if (this.demo_player) {
      this.demo_player.stop()
      this.demo_player = null
    }
    this.game.score.finish(this.game.media.getCurrentTime())

    return this.game.result_controller
  }

  type (key, {
    displayKey = key,
    showFeedback = true,
  } = {}) {
    // Try to process input key
    const lineId = this.game.typing.current_line
    const accept = this.current_line.accept(key)

    const currentTime = this.game.media.getCurrentTime()
    this.game.score.onType(currentTime, accept)
    let keyFeedback = null
    if (showFeedback) {
      keyFeedback = this.game.song_screen.showKeyFeedback(
        displayKey,
        accept >= 0,
        {
          lineId,
          remainingText: this.current_line.getRemainingText(),
          currentTime,
        },
      )
    }
    this.updateTypingLine()

    // Play sfx
    if (accept < 0) {
      this.game.sfx.play('error')
    } else {
      this.game.sfx.play('key', { volume: 0.36 })
      if (
        Number(keyFeedback?.streak || 0) >= 25 &&
        keyFeedback.streak % 25 === 0
      ) {
        this.game.sfx.play('ready', { volume: 0.18 })
      }
    }

    // If line is completed
    if (this.current_line.isCompleted()) {
      this.game.score.onLineEnd(0, currentTime)
      this.triggerTypingChange()
    }
  }

  updateTypingLine () {
    // This update the typing text at the bottom of the screen
    // Blind mode only shows 1 char, blank mode shows nothing.
    if (this.current_line && this.game.game_mode !== 'blank') {
      this.game.song_screen.setTypingText(this.current_line.getRemainingText(), this.game.game_mode === 'blind')
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

  animationFrame () {
    // Only request animation frame if screen is still active
    if (this.in_screen) {
      const current_time = this.game.media.getCurrentTime()
      const duration = this.game.media.getDuration()
      this.game.song_screen.updateKeyEffects(current_time)

      // Update song playback info on screen
      this.game.song_screen.ui_time.text(`${format_time(current_time)} / ${format_time(duration)}`)

      // Main progress bar
      this.game.song_screen.ui_progress_all.progress(current_time / duration)

      // Interval progress bar
      const current_line = this.game.typing.getCurrentLine()
      if (current_line && this.game.game_mode !== 'blank') {
        this.game.song_screen.ui_progress_int.progress((current_time - current_line.start_time) / (current_line.duration))
      } else {
        this.game.song_screen.ui_progress_int.progress(0)
      }

      // Update typing system
      if (this.demo_player) {
        this.demo_player.update(current_time)
      }
      if (this.game.game_mode === 'easy' && current_line && current_time > current_line.end_time && !current_line.isCompleted()) {
        // In easy mode, wait for the line to complete before advancing
        const left_percent =  (1 - (current_line.getLeftoverCharCount() / current_line.getCharacterCount()))
        this.game.media.skipTo(current_line.start_time + left_percent * (current_line.end_time - current_line.start_time))
      } else {
        const previousLine = this.game.typing.current_line
        const [changed, leftover] = this.game.typing.update(current_time)
        if (changed) {
          this.game.song_screen.finishKeyEffectLine(
            previousLine,
            current_time,
            leftover > 0,
          )
          // Typing line has changed
          if (leftover > 0) {
            // The line isn't completed, update the score
            this.game.score.onLineEnd(leftover, current_time)
            // Play skip sfx when line is skipped
            this.game.sfx.play('skip')
          }

          // Trigger start of the new line
          this.game.score.onLineStart(current_time)
          this.triggerTypingChange()
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

      // Visualization
      this.game.sound.analyser.getByteFrequencyData(this.vis_bins)
      this.game.song_screen.showVisualization(this.vis_bins)

      requestAnimationFrame(this.animationFrame.bind(this))
    }
  }

  visibilityChanged () {
    if (document.hidden) {
      this.auto_paused = true
      if (this.game.media)
        this.game.media.pause()
    } else {
      this.auto_paused = false
      if (this.game.media && this.in_screen)
        this.game.media.play()
    }
  }
}
