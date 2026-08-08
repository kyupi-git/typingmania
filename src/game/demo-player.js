import {
  nextPlayableTypingKey,
  playableTypingKeys,
} from '../typing/typing-text.js'

const CADENCE_PATTERN = [1, 0.94, 1.07, 0.97, 1.03, 0.91, 1.09, 0.98]

function clamp (value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value))
}

function cadenceWeight (keys, index, seed) {
  const base = CADENCE_PATTERN[(index + seed) % CADENCE_PATTERN.length]
  return keys[index] === ' ' ? base * 1.24 : base
}

export function createDemoLineSchedule ({
  text,
  startTime,
  endTime,
  lineId = 0,
}) {
  const keys = playableTypingKeys(text)
  if (!keys.length) return { keys, times: [] }

  const start = Number(startTime) || 0
  const end = Math.max(start + 0.1, Number(endTime) || start + 0.1)
  const duration = end - start
  const reactionDelay = clamp(duration * 0.055, 0.12, 0.3)
  const finishReserve = clamp(duration * 0.1, 0.28, 0.7)
  const firstTime = start + reactionDelay
  const lastTime = Math.max(firstTime, end - finishReserve)

  if (keys.length === 1) {
    return {
      keys,
      times: [firstTime + Math.min(0.16, (lastTime - firstTime) * 0.35)],
    }
  }

  const seed = Math.abs(Number(lineId) || 0) % CADENCE_PATTERN.length
  const weights = []
  let totalWeight = 0
  for (let index = 0; index < keys.length - 1; index++) {
    const weight = cadenceWeight(keys, index, seed)
    weights.push(weight)
    totalWeight += weight
  }

  const times = [firstTime]
  let elapsedWeight = 0
  for (const weight of weights) {
    elapsedWeight += weight
    times.push(firstTime + (
      (lastTime - firstTime) * elapsedWeight / totalWeight
    ))
  }
  return { keys, times }
}

export default class DemoPlayer {
  constructor (typing, typer) {
    this.typing = typing
    this.typer = typer
    this.lineId = null
    this.schedule = { keys: [], times: [] }
    this.cursor = 0
    this.stopped = false
    this.error_count = 0
    this.last_input_time = -Infinity
  }

  prepareLine (lineId, line) {
    this.lineId = lineId
    this.cursor = 0
    this.schedule = line
      ? createDemoLineSchedule({
          text: line.getRemainingText(),
          startTime: line.start_time,
          endTime: line.end_time,
          lineId,
        })
      : { keys: [], times: [] }
  }

  update (currentTime) {
    if (this.stopped || this.typer.auto_paused) return 0
    const lineId = this.typing.current_line
    const line = this.typing.getCurrentLine()
    if (lineId !== this.lineId) this.prepareLine(lineId, line)
    if (!line || line.isCompleted()) return 0

    let typed = 0
    let attempts = 0
    while (
      this.cursor < this.schedule.times.length &&
      currentTime >= this.schedule.times[this.cursor] &&
      !line.isCompleted() &&
      attempts++ < this.schedule.times.length + 1
    ) {
      const key = nextPlayableTypingKey(line.getRemainingText())
      if (!key) break
      try {
        const inputTime = Math.max(
          this.schedule.times[this.cursor],
          this.last_input_time,
        )
        const accepted = this.typer.type(key, {
          showFeedback: true,
          inputTime,
        })
        if (accepted < 0) break
        this.cursor++
        typed++
        this.last_input_time = inputTime
        this.error_count = 0
      } catch (error) {
        this.error_count++
        if (this.error_count <= 3 || this.error_count % 120 === 0) {
          console.error('Demo input recovered from a runtime error', error)
        }
        break
      }
    }
    return typed
  }

  stop () {
    this.stopped = true
  }
}
