import { test } from '@jest/globals'

import { createDemoLineSchedule } from '../game/demo-player.js'
import Score from '../game/score.js'
import Typing from '../typing/typing.js'
import {
  buildSongLyrics,
  estimateAssistReferencePace,
  estimateReferencePace,
} from './song-meta.js'
import AssistPlayer, { createAssistLinePlan } from '../game/assist-player.js'

test('song speed metadata predicts the deterministic demo average and 5s peak', () => {
  const lyrics = [
    [2000, 8000, 'follow the rhythm'],
    [10000, 16000, 'keep a steady pace'],
    [18000, 24000, 'finish with the music'],
  ]

  const [, averageCpm, peakCpm] = buildSongLyrics(lyrics, {
    durationMs: 26000,
  })
  const reference = estimateReferencePace(lyrics, { durationMs: 26000 })
  expect(averageCpm).toBe(reference.averageCpm)
  expect(peakCpm).toBe(reference.peakCpm)
  expect(averageCpm).toBeGreaterThan(0)
  expect(peakCpm).toBeGreaterThan(averageCpm)
})

test('building lyrics no longer mutates caller order', () => {
  const lyrics = [
    [1000, 2000, 'b'],
    [0, 1000, 'a'],
  ]
  const [csv] = buildSongLyrics(lyrics)
  expect(csv.startsWith('0,1000,a')).toBe(true)
  expect(lyrics[0][2]).toBe('b')
})

test('reference metadata equals a perfect run through the real score model', () => {
  const lyrics = [
    [2000, 3900, 'a fast opening line'],
    [5000, 11000, 'follow the gentle rhythm'],
    [11000, 15500, 'finish together'],
  ]
  const duration = 17
  const [csv, averageCpm, peakCpm] = buildSongLyrics(lyrics, {
    durationMs: duration * 1000,
  })
  const typing = new Typing(csv)
  const score = new Score(typing.getScoringCharCount(), {
    totalLines: typing.getPlayableLineCount(),
  })

  for (let lineId = 0; lineId < typing.lines.length; lineId++) {
    const line = typing.lines[lineId]
    score.onLineStart(line.start_time)
    const schedule = createDemoLineSchedule({
      text: line.getRemainingText(),
      startTime: line.start_time,
      endTime: line.end_time,
      lineId,
    })
    for (let index = 0; index < schedule.keys.length; index++) {
      score.onType(
        schedule.times[index],
        line.accept(schedule.keys[index]),
      )
    }
  }
  score.finish(duration)
  const result = score.getResultData(duration)
  expect(result.missed).toBe(0)
  expect(result.averageCpm).toBe(averageCpm)
  expect(result.rollingPeakCpm).toBe(peakCpm)
})

test('Simple mode pace and score count only player-required initials', () => {
  const csv = '0,8000,letters wake beneath the light'
  const reference = estimateAssistReferencePace(csv, 'EN', {
    durationMs: 10000,
  })
  const typing = new Typing(csv)
  const plan = createAssistLinePlan(typing.lines[0], 'EN')
  const requiredText = plan.gates.map(index => plan.keys[index]).join('')
  const schedule = createDemoLineSchedule({
    text: requiredText,
    startTime: typing.lines[0].start_time,
    endTime: typing.lines[0].end_time,
    lineId: 0,
  })
  const score = new Score(reference.requiredKeys, { totalLines: 1 })
  score.onLineStart(typing.lines[0].start_time)
  let gateIndex = 0
  const typer = {
    updateTypingLine: () => {},
    type: (key, options = {}) => {
      const accepted = typing.getCurrentLine().accept(key)
      if (options.recordScore !== false) {
        score.onType(schedule.times[gateIndex++], accepted)
      }
      return accepted
    },
  }
  const player = new AssistPlayer(typing, typer, { language: 'EN' })
  for (const key of schedule.keys) player.type(key)
  score.finish(10)

  const result = score.getResultData(10)
  expect(requiredText).toBe('lwbtl')
  expect(result.correct).toBe(reference.requiredKeys)
  expect(result.scoringChar).toBe(reference.requiredKeys)
  expect(result.averageCpm).toBe(reference.averageCpm)
  expect(result.rollingPeakCpm).toBe(reference.peakCpm)
  expect(result.correct).toBeLessThan(typing.getScoringCharCount())
})
