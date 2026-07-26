import { jest } from '@jest/globals'

import SyncedVideoOverlay from './synced-video-overlay.js'

test('keeps a verified silent video on the primary song clock', () => {
  const overlay = new SyncedVideoOverlay({
    url: '/mv.mp4',
    offsetSeconds: 2,
  })
  overlay.ready = true
  overlay.element = document.createElement('video')
  Object.defineProperty(overlay.element, 'currentTime', {
    value: 0,
    writable: true,
  })
  overlay.element.play = jest.fn(() => Promise.resolve())
  const primary = { getCurrentTime: () => 10 }
  overlay.sync(primary)
  expect(overlay.element.currentTime).toBe(12)
})

test('loops production footage against the authoritative song clock', () => {
  const overlay = new SyncedVideoOverlay({
    url: '/production.mp4',
    loop: true,
  })
  overlay.ready = true
  overlay.element = document.createElement('video')
  Object.defineProperty(overlay.element, 'duration', { value: 8 })
  Object.defineProperty(overlay.element, 'currentTime', {
    value: 0,
    writable: true,
  })
  overlay.element.play = jest.fn(() => Promise.resolve())

  overlay.sync({ getCurrentTime: () => 18 })

  expect(overlay.element.currentTime).toBe(2)
})
