import { jest, test } from '@jest/globals'

import SongController from './4-song.js'

test('a recovered frame error cannot permanently stop the animation loop', () => {
  const previousRaf = globalThis.requestAnimationFrame
  const requestFrame = jest.fn(() => 73)
  globalThis.requestAnimationFrame = requestFrame
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const controller = Object.create(SongController.prototype)
    controller.in_screen = true
    controller.animation_frame_id = null
    controller.animation_frame_callback = jest.fn()
    controller.animation_error_count = 0
    controller.game = {
      media: {
        getCurrentTime () {
          throw new Error('transient frame failure')
        },
      },
    }

    controller.animationFrame(1000)

    expect(controller.animation_error_count).toBe(1)
    expect(requestFrame).toHaveBeenCalledWith(
      controller.animation_frame_callback,
    )
    expect(controller.animation_frame_id).toBe(73)
  } finally {
    consoleError.mockRestore()
    globalThis.requestAnimationFrame = previousRaf
  }
})

test('Tab seeks beyond the current line and keeps the optional MV in sync', () => {
  const controller = Object.create(SongController.prototype)
  const line = { end_time: 12, isCompleted: () => false }
  controller.game = {
    typing: {
      current_line: 3,
      getCurrentLine: () => line,
    },
    media: {
      getCurrentTime: () => 7,
      skipTo: jest.fn(),
    },
    music_video: { skipTo: jest.fn() },
    song_screen: { finishKeyEffectLine: jest.fn() },
  }

  expect(controller.skipCurrentLine()).toBe(true)
  expect(controller.game.media.skipTo).toHaveBeenCalledWith(12.01)
  expect(controller.game.music_video.skipTo)
    .toHaveBeenCalledWith(controller.game.media)
})

test('auto mode catches up crossed lines one at a time without misses or time regression', () => {
  const previousRaf = globalThis.requestAnimationFrame
  globalThis.requestAnimationFrame = jest.fn(() => 1)
  const lines = [0, 1, 2, 3].map((id) => ({
    start_time: id,
    end_time: id + 1,
    done: false,
    getRemainingText: () => '',
    isCompleted () { return this.done },
    makeActive: jest.fn(),
  }))
  const transitions = []
  const typing = {
    lines,
    current_line: 0,
    getCurrentLine () { return lines[this.current_line] || false },
    getNextLine () { return lines[this.current_line + 1] || false },
    hasEnded () { return this.current_line >= lines.length },
    advanceTo (time, limit = Infinity) {
      const result = []
      while (result.length < limit && this.current_line < lines.length && time > lines[this.current_line].end_time) {
        const lineId = this.current_line++
        result.push({ lineId, endTime: lines[lineId].end_time, leftover: 0 })
      }
      transitions.push(...result)
      return result
    },
  }
  const keyfall = { finishKeyEffectLine: jest.fn(), updateKeyEffects: jest.fn() }
  const scoreTimes = []
  const controller = Object.create(SongController.prototype)
  controller.in_screen = true
  controller.animation_frame_id = null
  controller.animation_frame_callback = jest.fn()
  controller.optional_frame_failures = new Set()
  controller.animation_error_count = 0
  controller.demo_player = {
    update: jest.fn(() => {
      const line = typing.getCurrentLine()
      if (line) line.done = true
    }),
  }
  controller.game = {
    game_mode: 'blind',
    media: { getCurrentTime: () => 10, getDuration: () => 12, ended: false },
    typing,
    song_screen: {
      updateKeyEffects: keyfall.updateKeyEffects,
      finishKeyEffectLine: keyfall.finishKeyEffectLine,
      ui_time: { text: jest.fn() },
      ui_progress_all: { progress: jest.fn() },
      ui_progress_int: { progress: jest.fn() },
      setTypingRuby: jest.fn(),
      setTypingText: jest.fn(),
    },
    score: {
      setToSongScreen: jest.fn(),
      onLineEnd: jest.fn(),
      onLineStart: jest.fn((time) => scoreTimes.push(time)),
    },
    sfx: { play: jest.fn() },
  }
  controller.current_line = lines[0]
  controller.current_typing = -1
  controller.assist_player = null
  controller.animationFrame()
  globalThis.requestAnimationFrame = previousRaf

  expect(lines.every(line => line.done)).toBe(true)
  expect(typing.current_line).toBe(lines.length)
  expect(transitions.map(item => item.lineId)).toEqual([0, 1, 2, 3])
  expect(keyfall.finishKeyEffectLine).toHaveBeenCalledTimes(4)
  expect(keyfall.finishKeyEffectLine.mock.calls.every(call => call[2] === false)).toBe(true)
  expect(scoreTimes).toEqual([1, 2, 3, 4])
  expect(scoreTimes.every((time, index) => index === 0 || time >= scoreTimes[index - 1])).toBe(true)
  expect(controller.demo_player.update.mock.calls.length).toBeGreaterThanOrEqual(4)
})

test('demo optional frame errors are retried instead of disabled permanently', () => {
  const controller = Object.create(SongController.prototype)
  controller.optional_frame_failures = new Set()
  const error = jest.spyOn(console, 'error').mockImplementation(() => {})
  let attempts = 0
  try {
    expect(() => controller.runOptionalFramePart('demo', () => {
      attempts++
      if (attempts === 1) throw new Error('temporary')
    })).not.toThrow()
    controller.runOptionalFramePart('demo', () => { attempts++ })
    expect(attempts).toBe(2)
    expect(controller.optional_frame_failures.has('demo')).toBe(false)
  } finally {
    error.mockRestore()
  }
})
