import { test } from '@jest/globals'

import { createDemoLineSchedule } from '../game/demo-player.js'
import Score from '../game/score.js'
import Typing from '../typing/typing.js'
import {
  buildSongLyrics,
  estimateReferencePace,
} from './song-meta.js'

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
