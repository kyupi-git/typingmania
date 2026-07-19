const RETRYABLE_STATUS = new Set([408, 425, 429])

export class NetworkCircuitBreaker {
  constructor (failureLimit = 2) {
    this.failureLimit = Math.max(1, Number(failureLimit) || 1)
    this.failures = 0
    this.open = false
  }

  recordFailure () {
    this.failures++
    if (this.failures >= this.failureLimit) this.open = true
  }

  recordSuccess () {
    this.failures = 0
  }
}

function timeoutError (url, timeoutMs) {
  const error = new Error(
    `Network request timed out after ${timeoutMs} ms: ${url}`,
  )
  error.name = 'TimeoutError'
  return error
}

function retryableResponse (response) {
  return Boolean(
    response &&
    (
      RETRYABLE_STATUS.has(Number(response.status)) ||
      Number(response.status) >= 500
    ),
  )
}

export async function fetchWithTimeout (
  fetchImpl,
  url,
  options = {},
  timeoutMs = 4000,
) {
  const duration = Math.max(50, Number(timeoutMs) || 4000)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), duration)
  try {
    return await fetchImpl(url, {
      ...options,
      signal: controller.signal,
    })
  } catch (error) {
    if (controller.signal.aborted && error?.name === 'AbortError') {
      throw timeoutError(url, duration)
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

export async function fetchWithRetry (
  fetchImpl,
  url,
  options = {},
  {
    attempts = 2,
    timeoutMs = 6000,
    perAttemptMs = 3200,
  } = {},
) {
  const maximumAttempts = Math.max(1, Number(attempts) || 1)
  const deadline = Date.now() + Math.max(100, Number(timeoutMs) || 6000)
  let lastError = null
  let lastResponse = null

  for (let attempt = 0; attempt < maximumAttempts; attempt++) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) break
    try {
      const response = await fetchWithTimeout(
        fetchImpl,
        url,
        options,
        Math.min(remaining, perAttemptMs),
      )
      lastResponse = response
      if (!retryableResponse(response) || attempt + 1 >= maximumAttempts) {
        return response
      }
    } catch (error) {
      lastError = error
      if (attempt + 1 >= maximumAttempts) throw error
    }
  }

  if (lastResponse) return lastResponse
  throw lastError || timeoutError(url, timeoutMs)
}

export async function fetchFirstAvailable (
  fetchImpl,
  urls,
  options = {},
  {
    timeoutMs = 4500,
    perAttemptMs = 1600,
  } = {},
) {
  const candidates = [...new Set(
    (urls || []).map(String).filter(Boolean),
  )]
  if (!candidates.length) {
    throw new Error('No network route was provided')
  }

  const deadline = Date.now() + Math.max(100, Number(timeoutMs) || 4500)
  let lastError = null
  for (const url of candidates) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) break
    try {
      const response = await fetchWithTimeout(
        fetchImpl,
        url,
        options,
        Math.min(remaining, perAttemptMs),
      )
      if (response.ok) return { response, url }
      lastError = new Error(`HTTP ${response.status} from ${url}`)
    } catch (error) {
      lastError = error
    }
  }
  throw lastError || timeoutError(candidates[0], timeoutMs)
}
