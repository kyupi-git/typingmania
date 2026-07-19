export const RESULT_REVEAL_DELAY_MS = 1400
export const EARLY_LYRIC_THRESHOLD_SECONDS = 1.5
export const EARLY_LYRIC_LEAD_IN_MS = 2100

export function songLeadInDuration (firstPlayableStart) {
  const start = Number(firstPlayableStart)
  return Number.isFinite(start) &&
    start >= 0 &&
    start < EARLY_LYRIC_THRESHOLD_SECONDS
    ? EARLY_LYRIC_LEAD_IN_MS
    : 0
}

export function resultRevealDelay (naturalEnd) {
  return naturalEnd ? RESULT_REVEAL_DELAY_MS : 0
}

export function waitForResultReveal (naturalEnd) {
  const delay = resultRevealDelay(naturalEnd)
  return delay
    ? new Promise(resolve => setTimeout(resolve, delay))
    : Promise.resolve()
}
