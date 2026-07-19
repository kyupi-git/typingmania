import { jest, test } from '@jest/globals'

import Sound from './sound.js'

function soundWithContext (context) {
  const sound = Object.create(Sound.prototype)
  sound.context = context
  return sound
}

test('sound initialization waits for a delayed AudioContext resume', async () => {
  let finishResume
  const context = {
    state: 'suspended',
    resume: jest.fn(() => new Promise(resolve => {
      finishResume = () => {
        context.state = 'running'
        resolve()
      }
    })),
  }
  const initialization = soundWithContext(context).initializeSound()

  expect(context.resume).toHaveBeenCalledTimes(1)
  finishResume()
  await expect(initialization).resolves.toBeUndefined()
})

test('an already running AudioContext does not resume again', async () => {
  const context = {
    state: 'running',
    resume: jest.fn(),
  }

  await expect(soundWithContext(context).initializeSound()).resolves.toBeUndefined()
  expect(context.resume).not.toHaveBeenCalled()
})

test('a closed AudioContext cannot be initialized', async () => {
  const context = {
    state: 'closed',
    resume: jest.fn(),
  }

  await expect(soundWithContext(context).initializeSound()).rejects.toThrow('SOUND_ERROR')
  expect(context.resume).not.toHaveBeenCalled()
})

test('YouTube API loading times out without blocking the game', async () => {
  const originalYT = window.YT
  delete window.YT
  document.querySelectorAll('script[data-typingmania-youtube]')
    .forEach(element => element.remove())
  const append = jest.spyOn(document.body, 'append')
  const sound = Object.create(Sound.prototype)
  sound.youtube_api_request = null
  sound.youtube_api_available = false

  await expect(sound.loadYouTubeAPI(1)).resolves.toBe(false)
  expect(append).toHaveBeenCalled()
  await expect(sound.loadYouTubeAPI(1)).resolves.toBe(false)
  expect(append).toHaveBeenCalledTimes(1)

  document.querySelectorAll('script[data-typingmania-youtube]')
    .forEach(element => element.remove())
  append.mockRestore()
  window.YT = originalYT
})
