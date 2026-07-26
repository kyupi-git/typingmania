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
