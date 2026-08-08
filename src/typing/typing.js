import Romanizer from './romanizer.js'
import latinTable from '../../latin-table/latin-table.js'
import TypingLine from './typingline.js'

const romanizer = new Romanizer(latinTable)

export default class Typing {
  constructor (lyrics_csv) {
    this.lines = []
    this.current_line = 0

    // Parse lyrics
    const lines = lyrics_csv.split(/\r?\n/)
    let current_time = 0
    for (const line of lines) {
      if (line.trim().length === 0) {
        continue
      }
      const [start, end, ...lyrics] = line.split(',')
      const lyric = lyrics.join(',')
      const start_time = Number(start)
      const end_time = Number(end)
      if (
        !Number.isFinite(start_time) ||
        !Number.isFinite(end_time) ||
        end_time < start_time
      ) {
        continue
      }

      if (start_time > current_time) {
        // Add buffer line
        this.lines.push(new TypingLine(
          '',
          current_time / 1000,
          start_time / 1000,
          romanizer,
        ))
      }
      this.lines.push(new TypingLine(
        lyric,
        start_time / 1000,
        end_time / 1000,
        romanizer,
      ))

      current_time = Math.max(current_time, end_time)
    }
  }

  hasEnded () {
    return this.current_line >= this.lines.length
  }

  getCurrentLine () {
    if (this.current_line < this.lines.length)
      return this.lines[this.current_line]
    return false
  }

  getNextLine () {
    if (this.current_line + 1 < this.lines.length)
      return this.lines[this.current_line + 1]
    return false
  }

  getScoringCharCount () {
    let scoring_char = 0
    for (const l of this.lines) {
      scoring_char += l.getCharacterCount()
    }
    return scoring_char
  }

  getPlayableLineCount () {
    return this.lines.filter(line => line.getCharacterCount() > 0).length
  }

  // This is used to draw split progressbar
  getIntervals () {
    const t = []
    for (const l of this.lines) {
      t.push(l.end_time)
    }
    return t
  }

  update (current_time) {
    let changed = false
    let leftover = 0

    const current_line = this.getCurrentLine()
    if (current_line) {
      if (current_time > current_line.end_time) {
        // Line end, move
        this.current_line++
        changed = true

        if (!current_line.isCompleted()) {
          leftover = current_line.getLeftoverCharCount()
        }
      }
    }

    // 0 = nothing, 1 = line changed, 2 = line changed, skipped
    return [changed, leftover]
  }

  /**
   * Advance through every line that has expired at the supplied media time.
   *
   * Browsers can occasionally delay an animation frame (window movement,
   * decoder work, power saving, or a busy device). Advancing only one line per
   * frame makes the renderer fall progressively behind the audio after such a
   * delay. Returning every transition lets the controller catch up in one
   * bounded pass; the loop is safe because current_line always increases.
   */
  advanceTo (current_time, maxTransitions = Infinity) {
    const transitions = []
    while (transitions.length < maxTransitions) {
      const line = this.getCurrentLine()
      if (!line || current_time <= line.end_time) break
      const lineId = this.current_line
      this.current_line++
      transitions.push({
        lineId,
        endTime: line.end_time,
        leftover: line.isCompleted()
          ? 0
          : line.getLeftoverCharCount(),
      })
    }
    return transitions
  }
}
