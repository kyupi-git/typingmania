import TypingLine from '../typing/typingline.js'
import Romanizer from '../typing/romanizer.js'
import latinTable from '../../latin-table/latin-table.js'
import { createDemoLineSchedule } from '../game/demo-player.js'
import { buildPerformanceSummary } from '../game/performance.js'
import { createAssistLinePlan } from '../game/assist-player.js'
import Typing from '../typing/typing.js'

const romanizer = new Romanizer(latinTable)
export const PACE_METADATA_VERSION = 3
export const ASSIST_PACE_METADATA_VERSION = 1

export function songMetaFromAss (assInfo) {
  const metadataFields = ['title', 'subtitle', 'artist']
  const songMetadata = {}
  for (const field of metadataFields) {
    if (!(field in assInfo)) {
      throw new Error(`Key ${field} not found in .ass file`)
    }

    const split = assInfo[field].split('//')
    if (split.length === 1) {
      songMetadata[field] = split[0].trim()
      songMetadata[`latin_${field}`] = split[0].trim()
    } else {
      songMetadata[field] = split[0].trim()
      songMetadata[`latin_${field}`] = split[1].trim()
    }
  }

  songMetadata.language = assInfo.language || 'U'

  return songMetadata
}

export function estimateReferencePace (songLyrics, {
  durationMs = 0,
} = {}) {
  let correct = 0
  let typingTime = 0
  let lastEnd = 0
  let previousEndMs = 0
  let typingLineId = 0
  const events = []

  for (let index = 0; index < songLyrics.length; index++) {
    const lyric = songLyrics[index]
    const start = Number(lyric[0]) / 1000
    const end = Number(lyric[1]) / 1000
    if (Number(lyric[0]) !== previousEndMs) typingLineId++
    const typingLine = new TypingLine(lyric[2], start, end, romanizer)
    const schedule = createDemoLineSchedule({
      text: typingLine.getRemainingText(),
      startTime: start,
      endTime: end,
      lineId: typingLineId,
    })
    if (schedule.times.length) {
      correct += schedule.times.length
      typingTime += schedule.times.at(-1) - start
      for (const time of schedule.times) {
        events.push({ time, outcome: 'correct', tension: 0 })
      }
    }
    lastEnd = Math.max(lastEnd, end)
    previousEndMs = Number(lyric[1])
    typingLineId++
  }

  const duration = Math.max(lastEnd, Number(durationMs) / 1000 || 0, 0.1)
  const performance = buildPerformanceSummary(events, duration)
  return {
    averageCpm: typingTime > 0
      ? Math.round(60 * correct / typingTime)
      : 0,
    peakCpm: performance.peakPace,
  }
}

export function estimateAssistReferencePace (
  lyricsCsv,
  language = 'U',
  { durationMs = 0 } = {},
) {
  const typing = lyricsCsv instanceof Typing
    ? lyricsCsv
    : new Typing(String(lyricsCsv || ''))
  let correct = 0
  let typingTime = 0
  let lastEnd = 0
  const events = []
  for (let lineId = 0; lineId < typing.lines.length; lineId++) {
    const line = typing.lines[lineId]
    const plan = createAssistLinePlan(line, language)
    const text = plan.gates.map(index => plan.keys[index]).join('')
    const schedule = createDemoLineSchedule({
      text,
      startTime: line.start_time,
      endTime: line.end_time,
      lineId,
    })
    if (schedule.times.length) {
      correct += schedule.times.length
      typingTime += schedule.times.at(-1) - line.start_time
      for (const time of schedule.times) {
        events.push({ time, outcome: 'correct', tension: 0 })
      }
    }
    lastEnd = Math.max(lastEnd, line.end_time)
  }
  const duration = Math.max(lastEnd, Number(durationMs) / 1000 || 0, 0.1)
  const performance = buildPerformanceSummary(events, duration)
  return {
    requiredKeys: correct,
    averageCpm: typingTime > 0
      ? Math.round(60 * correct / typingTime)
      : 0,
    peakCpm: performance.peakPace,
  }
}

export function buildSongLyrics (songLyrics, options = {}) {
  const sortedLyrics = [...songLyrics].sort((a, b) => {
    return a[0] - b[0]
  })

  let csv = ''

  for (const lyric of sortedLyrics) {
    csv += `${lyric[0]},${lyric[1]},${lyric[2]}\n`
  }
  const reference = estimateReferencePace(sortedLyrics, options)
  return [csv, reference.averageCpm, reference.peakCpm]
}
