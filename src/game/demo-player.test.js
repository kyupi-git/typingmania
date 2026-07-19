import { test } from '@jest/globals'

import DemoPlayer, { createDemoLineSchedule } from './demo-player.js'

test('demo schedule follows playable text with a varied human cadence', () => {
  const schedule = createDemoLineSchedule({
    text: 'AB_CD\u00a0\u00a0E!? 2026',
    startTime: 2,
    endTime: 8,
    lineId: 3,
  })

  expect(schedule.keys).toEqual(['A', 'B', 'C', 'D', 'E'])
  expect(schedule.times).toHaveLength(schedule.keys.length)
  expect(schedule.times[0]).toBeGreaterThan(2)
  expect(schedule.times.at(-1)).toBeLessThan(8)

  const intervals = schedule.times.slice(1).map((time, index) =>
    Number((time - schedule.times[index]).toFixed(3)),
  )
  expect(new Set(intervals).size).toBeGreaterThan(2)
  expect(intervals[2]).not.toBe(intervals[0])
})

test('demo player types every scheduled key correctly and can be stopped', () => {
  let remaining = 'ABC'
  const line = {
    start_time: 1,
    end_time: 4,
    getRemainingText: () => remaining,
    isCompleted: () => remaining.length === 0,
  }
  const typing = {
    current_line: 0,
    getCurrentLine: () => line,
  }
  const calls = []
  const typer = {
    auto_paused: false,
    type: (key, options) => {
      calls.push([key, options])
      remaining = remaining.slice(1)
    },
  }
  const player = new DemoPlayer(typing, typer)

  expect(player.update(1)).toBe(0)
  expect(player.update(4)).toBe(3)
  expect(calls).toEqual([
    ['A', { showFeedback: true }],
    ['B', { showFeedback: true }],
    ['C', { showFeedback: true }],
  ])

  remaining = 'D'
  typing.current_line = 1
  player.stop()
  expect(player.update(10)).toBe(0)
  expect(remaining).toBe('D')
})
