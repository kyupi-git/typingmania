import { test } from '@jest/globals'

import {
  fetchFirstAvailable,
  fetchWithRetry,
  fetchWithTimeout,
  NetworkCircuitBreaker,
} from './network.js'

test('a failed regional route falls back to the next route', async () => {
  const requested = []
  const result = await fetchFirstAvailable(
    async url => {
      requested.push(String(url))
      if (String(url).includes('primary')) {
        throw new TypeError('network unavailable')
      }
      return { ok: true, status: 200 }
    },
    [
      'https://primary.example/item',
      'https://backup.example/item',
    ],
  )

  expect(result.url).toBe('https://backup.example/item')
  expect(requested).toEqual([
    'https://primary.example/item',
    'https://backup.example/item',
  ])
})

test('transient server errors retry within the request budget', async () => {
  let attempts = 0
  const response = await fetchWithRetry(
    async () => {
      attempts++
      return {
        ok: attempts > 1,
        status: attempts > 1 ? 200 : 503,
      }
    },
    'https://service.example/data',
  )

  expect(response.ok).toBe(true)
  expect(attempts).toBe(2)
})

test('a timeout has a stable error type', async () => {
  await expect(fetchWithTimeout(
    (url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener('abort', () => {
        const error = new Error('aborted')
        error.name = 'AbortError'
        reject(error)
      })
    }),
    'https://slow.example/data',
    {},
    50,
  )).rejects.toMatchObject({ name: 'TimeoutError' })
})

test('repeated network failures open a batch circuit breaker', () => {
  const circuit = new NetworkCircuitBreaker(2)
  circuit.recordFailure()
  expect(circuit.open).toBe(false)
  circuit.recordSuccess()
  circuit.recordFailure()
  circuit.recordFailure()
  expect(circuit.open).toBe(true)
})
