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
