import { jest, test } from '@jest/globals'

import Sfx from './sfx.js'

test('sound effects support a local volume without changing master volume', () => {
  const source = {
    connect: jest.fn(),
    addEventListener: jest.fn(),
    start: jest.fn(),
    buffer: null,
  }
  const localGain = {
    connect: jest.fn(),
    disconnect: jest.fn(),
    gain: { value: 1 },
  }
  const masterGain = {}
  const sound = {
    gain: masterGain,
    context: {
      createBufferSource: jest.fn(() => source),
      createGain: jest.fn(() => localGain),
    },
  }
  const sfx = new Sfx(sound)
  sfx.sfx.key = { id: 'key-buffer' }

  expect(sfx.play('key', { volume: 0.28 })).toBe(source)
  expect(localGain.gain.value).toBe(0.28)
  expect(source.connect).toHaveBeenCalledWith(localGain)
  expect(localGain.connect).toHaveBeenCalledWith(masterGain)
  expect(source.start).toHaveBeenCalledTimes(1)
})
