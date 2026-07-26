import { jest, test } from '@jest/globals'

import LoadingController from './1-loading.js'

function response (body, { ok = true } = {}) {
  return {
    ok,
    json: async () => body,
  }
}

test('static deployments skip the local-library readiness endpoint', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = jest.fn(async () => response(null, { ok: false }))
  try {
    const controller = new LoadingController({
      loading_screen: { setSubText: jest.fn() },
    })
    await expect(controller.waitForLocalLibraryReady(key => key))
      .resolves.toBeUndefined()
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('local startup waits for the initial library scan instead of failing', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = jest.fn()
    .mockResolvedValueOnce(response({
      available: true,
      instance: { protocol: 3 },
      startup: { state: 'starting', ready: false },
    }))
    .mockResolvedValueOnce(response({
      available: true,
      instance: { protocol: 3 },
      startup: { state: 'ready', ready: true },
    }))
  const setSubText = jest.fn()
  try {
    const controller = new LoadingController({
      loading_screen: { setSubText },
    })
    await controller.waitForLocalLibraryReady(key => key)
    expect(globalThis.fetch).toHaveBeenCalledTimes(2)
    expect(setSubText).toHaveBeenCalledWith('loading.localLibrary')
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('local startup reports a real scan failure', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = jest.fn(async () => response({
    available: true,
    instance: { protocol: 3 },
    startup: {
      state: 'error',
      ready: false,
      error: { message: 'library index is not writable' },
    },
  }))
  try {
    const controller = new LoadingController({
      loading_screen: { setSubText: jest.fn() },
    })
    await expect(controller.waitForLocalLibraryReady(key => key))
      .rejects.toThrow('library index is not writable')
  } finally {
    globalThis.fetch = previousFetch
  }
})
