import { test } from '@jest/globals'

import {
  buildPerformanceSummary,
  nextTension,
} from './performance.js'

test('tension rewards streaks and reacts strongly to recent mistakes', () => {
  let tension = 0
  for (let index = 0; index < 20; index++) {
    tension = nextTension(tension, 'correct')
  }
  expect(tension).toBeGreaterThan(90)

  const afterMiss = nextTension(tension, 'miss')
  expect(afterMiss).toBeLessThan(tension - 25)
  expect(nextTension(afterMiss, 'correct')).toBeGreaterThan(afterMiss)
  expect(nextTension(tension, 'skip', 5)).toBeLessThan(afterMiss)
})

test('performance summary uses song time and produces rolling pace', () => {
  const events = [
    { time: 1, outcome: 'correct', tension: 13 },
    { time: 1.25, outcome: 'correct', tension: 24.31 },
    { time: 1.5, outcome: 'correct', tension: 34.15 },
    { time: 4, outcome: 'miss', tension: 22.54 },
    { time: 5, outcome: 'correct', tension: 32.61 },
  ]
  const summary = buildPerformanceSummary(events, 10, {
    sampleCount: 20,
    paceWindow: 3,
  })

  expect(summary.tension[0]).toEqual({ time: 0, value: 0 })
  expect(summary.tension.at(-1).time).toBe(10)
  expect(summary.pace).toHaveLength(21)
  expect(summary.peakPace).toBeGreaterThan(0)
  expect(summary.averageTension).toBeGreaterThan(0)
  expect(summary.averageTension).toBeLessThan(100)
})
