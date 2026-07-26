import { test } from '@jest/globals'

import Score from './score.js'

test('score result data includes detailed performance statistics', () => {
  const score = new Score(3, { totalLines: 1 })
  score.onLineStart(1)
  score.onType(1.2, 1)
  score.onType(1.4, -1)
  score.onType(1.6, 1)
  score.onLineEnd(0, 1.6)
  score.finish(2)

  const result = score.getResultData()
  expect(result.correct).toBe(2)
  expect(result.missed).toBe(1)
  expect(result.totalInputs).toBe(3)
  expect(result.completedLine).toBe(1)
  expect(result.perfectLine).toBe(0)
  expect(result.penalty).toBe(500)
  expect(result.averageCpm).toBeGreaterThan(0)
  expect(result.rollingPeakCpm).toBeGreaterThan(0)
  expect(result).not.toHaveProperty('peakCpm')
  expect(result.performance.tension).toHaveLength(5)
  expect(result.performance.duration).toBe(2)
})

test('mistake-free completed lines are counted as perfect', () => {
  const score = new Score(2, { totalLines: 1 })
  score.onLineStart(0.5)
  score.onType(0.8, 1)
  score.onType(1.1, 1)
  score.onLineEnd(0, 1.1)
  score.finish(1.5)

  const result = score.getResultData()
  expect(result.completedLine).toBe(1)
  expect(result.perfectLine).toBe(1)
  expect(result.overallAccuracy).toBe(100)
  expect(result.averageTension).toBeGreaterThan(0)
})

test('score and rank remain byte-for-byte compatible with TypingMania NEO rules', () => {
  const score = new Score(6, { totalLines: 2 })
  score.onLineStart(1)
  score.onType(1.25, 1)
  score.onType(1.5, 1)
  score.onType(1.7, -1)
  score.onType(2, 1)
  score.onLineEnd(0, 2)
  score.onLineStart(3)
  score.onType(3.2, 1)
  score.onType(3.45, 1)
  score.onLineEnd(1, 4)

  // Reference values are produced by the unmodified TypingMania NEO
  // algorithm: 1,000 base points, live CPM × .25, combo bonus, -500 per
  // error, and the original 10% / 15% line bonuses and rank thresholds.
  expect(score.score).toBe(5191)
  expect(score.base_score).toBe(7500)
  expect(score.getClass()).toBe('D+')
  expect(score.correct).toBe(5)
  expect(score.missed).toBe(1)
  expect(score.completed_line).toBe(1)
  expect(score.skipped_char).toBe(1)
})
