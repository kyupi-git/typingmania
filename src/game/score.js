import { format_decimal_fixed, format_number_comma, format_number_fixed } from '../screen/0-common.js'
import {
  buildPerformanceSummary,
  nextTension,
} from './performance.js'

export default class Score {
  constructor (scoring_char, { totalLines = 0 } = {}) {
    this.score = 0
    this.scoring_char = scoring_char
    this.total_lines = totalLines

    this.combo = 0
    this.max_combo = 0

    this.completed_line = 0
    this.perfect_line = 0
    this.skipped_line = 0
    this.skipped_char = 0

    this.correct = 0
    this.missed = 0

    this.missed_in_this_line = 0
    this.line_score = 0

    this.typing_time = 0
    this.last_type_time = 0
    this.play_duration = 0

    this.tension = 0
    this.performance_events = []

    // Calculate base score
    this.base_score = scoring_char * 1250
  }

  getClass () {
    if (this.score >= this.base_score * 1.25) return 'SSS'
    if (this.score >= this.base_score * 1.10) return 'SS'
    if (this.score >= this.base_score * 1.05) return 'S+'
    if (this.score >= this.base_score * 1.00) return 'S'
    if (this.score >= this.base_score * 0.95) return 'A+'
    if (this.score >= this.base_score * 0.90) return 'A'
    if (this.score >= this.base_score * 0.85) return 'B+'
    if (this.score >= this.base_score * 0.80) return 'B'
    if (this.score >= this.base_score * 0.75) return 'C+'
    if (this.score >= this.base_score * 0.70) return 'C'
    if (this.score >= this.base_score * 0.60) return 'D+'
    if (this.score >= this.base_score * 0.50) return 'D'
    if (this.score >= this.base_score * 0.40) return 'E+'
    if (this.score >= this.base_score * 0.30) return 'E'
    if (this.score >= this.base_score * 0.20) return 'F+'
    return 'F'

  }

  getCorrectPercent () {
    if (this.correct === 0)
      return 0
    return this.correct / (this.correct + this.missed)
  }

  getCorrectPercentWithSkipped () {
    if (this.correct === 0)
      return 0
    return this.correct / (this.correct + this.missed + this.skipped_char)
  }

  getCPM () {
    if (this.typing_time === 0) {
      return 0
    }
    return Math.round(60 * this.correct / this.typing_time)
  }

  onLineStart (timestamp) {
    this.last_type_time = timestamp
    this.missed_in_this_line = 0
    this.line_score = 0
  }

  onLineEnd (leftover, timestamp = this.last_type_time) {
    if (leftover === 0) {
      this.completed_line++
      if (this.missed_in_this_line === 0) this.perfect_line++

      // Line complete bonus
      this.score += Math.ceil(this.line_score * 0.1)

      if (this.missed_in_this_line === 0) {
        // Line perfect bonus
        this.score += Math.ceil(this.line_score * 0.15)
      }
    } else {
      this.skipped_char += leftover
      this.skipped_line++
      this.recordPerformance(timestamp, 'skip', leftover)
    }
  }

  recordPerformance (timestamp, outcome, severity = 1) {
    this.tension = nextTension(this.tension, outcome, severity)
    const previousTime = this.performance_events.at(-1)?.time || 0
    const time = Math.max(previousTime, Number(timestamp) || 0)
    this.performance_events.push({
      time,
      outcome,
      tension: this.tension,
    })
  }

  finish (timestamp) {
    this.play_duration = Math.max(
      this.play_duration,
      Number(timestamp) || 0,
      this.performance_events.at(-1)?.time || 0,
    )
  }

  // This get called on every typing
  // Minus score factor indicate missed.
  onType (timestamp, score_factor) {
    if (score_factor < 0) {
      // Missed penalty
      this.score -= 500

      this.missed++
      this.missed_in_this_line++
      this.combo = 0
      this.recordPerformance(timestamp, 'miss')
    } else {
      this.correct++
      this.combo += score_factor
      this.max_combo = Math.max(this.combo, this.max_combo)

      // Score = base_score (1000) + CPM bonus (*.25) + combo bonus
      // I want to use current typing CPM, but due to low resolution
      // of the timing, we can get Infinity CPM easily for fast typist.
      const cpm_score = this.getCPM() * 0.25
      const combo_score = this.combo
      const score = Math.ceil(1000 + cpm_score + combo_score) * score_factor

      this.score += score
      this.line_score += score

      this.typing_time += timestamp - this.last_type_time
      this.recordPerformance(timestamp, 'correct')
    }

    this.last_type_time = timestamp
  }

  setToSongScreen (screen) {
    screen.ui_score.text(format_number_comma(this.score))
    screen.ui_max_combo.text(format_number_fixed(this.max_combo, 3))
    screen.ui_completed.text(format_number_fixed(this.completed_line, 3))
    screen.ui_skipped.text(format_number_fixed(this.skipped_char, 3))

    screen.ui_typing_speed.text(format_number_fixed(this.getCPM(), 3))
    screen.ui_correct.text(format_number_fixed(this.correct, 3))
    screen.ui_missed.text(format_number_fixed(this.missed, 3))
    screen.ui_accuracy.text(format_decimal_fixed(this.getCorrectPercentWithSkipped() * 100, 1, 1) + '%')
    screen.ui_class.text(this.getClass())

    if (this.combo >= 2) {
      screen.ui_combo_label.show()
      screen.ui_combo.text(this.combo).show()
    } else {
      screen.ui_combo_label.hide()
      screen.ui_combo.text(this.combo).hide()
    }
  }

  getResultData (duration = this.play_duration) {
    const performance = buildPerformanceSummary(
      this.performance_events,
      Math.max(duration || 0, this.play_duration || 0),
    )
    return {
      className: this.getClass(),
      score: this.score,
      maxCombo: this.max_combo,
      scoringChar: this.scoring_char,
      totalInputs: this.correct + this.missed,
      correct: this.correct,
      missed: this.missed,
      completedLine: this.completed_line,
      perfectLine: this.perfect_line,
      totalLines: this.total_lines,
      skippedLine: this.skipped_line,
      skippedChar: this.skipped_char,
      averageCpm: this.getCPM(),
      rollingPeakCpm: performance.peakPace,
      accuracy: this.getCorrectPercent() * 100,
      overallAccuracy: this.getCorrectPercentWithSkipped() * 100,
      averageTension: performance.averageTension,
      penalty: this.missed * 500,
      performance,
    }
  }

  setToResultScreen (screen, options = {}) {
    screen.updateResult(this.getResultData(options.duration), options)
  }
}
