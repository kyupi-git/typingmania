import { playableTypingKeys } from '../typing/typing-text.js'

export const KEYFALL_LANE_COUNT = 10
export const KEYFALL_LEAD_SECONDS = 0.52
export const KEYFALL_LANDING_SECONDS = 0.68
export const KEYFALL_LINGER_SECONDS = 0.72

function finiteNumber (value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

export function normalizeKeyfallText (text) {
  return playableTypingKeys(text)
}

export function keyfallNoteTiming (plan, index, count) {
  const duration = Math.max(0.1, plan.endTime - plan.startTime)
  const landingDuration = Math.min(
    KEYFALL_LANDING_SECONDS,
    Math.max(0.24, duration * 0.22),
  )
  const startPadding = Math.min(0.12, duration * 0.08)
  const hitStart = plan.startTime + startPadding
  const hitEnd = Math.max(hitStart, plan.endTime - landingDuration)
  const position = count <= 1
    ? 0.25
    : Math.max(0, Math.min(1, index / (count - 1)))
  const targetTime = hitStart + (hitEnd - hitStart) * position
  const landTime = Math.max(
    targetTime,
    Math.min(plan.endTime, targetTime + landingDuration),
  )

  return {
    targetTime,
    spawnTime: targetTime - KEYFALL_LEAD_SECONDS,
    landTime,
    removeTime: landTime + KEYFALL_LINGER_SECONDS,
  }
}

export function createKeyfallNote (plan, label, index, count) {
  return {
    ...keyfallNoteTiming(plan, index, count),
    id: `${plan.id}:${index}`,
    lineId: plan.id,
    index,
    lane: (plan.ordinalStart + index) % KEYFALL_LANE_COUNT,
    label,
    state: 'pending',
    consumed: false,
    cancelled: false,
    spawned: false,
    retired: false,
    forcedGround: false,
    impacted: false,
    element: null,
    glyph: null,
    resultMark: null,
    pulse: null,
    streakBadge: null,
  }
}

export function createKeyfallPlans (lines) {
  const plans = []

  for (const [fallbackId, source] of Array.from(lines || []).entries()) {
    const labels = normalizeKeyfallText(source?.text)
    if (!labels.length) continue

    const startTime = finiteNumber(source.startTime)
    const endTime = Math.max(
      startTime + 0.1,
      finiteNumber(source.endTime, startTime + 0.1),
    )
    const plan = {
      id: source.id ?? fallbackId,
      startTime,
      endTime,
      // Each lyric line reads like its own left-to-right phrase.
      ordinalStart: 0,
      notes: [],
      active: false,
      finished: false,
    }
    plan.notes = labels.map((label, index) => (
      createKeyfallNote(plan, label, index, labels.length)
    ))
    plan.spawnStart = Math.min(...plan.notes.map(note => note.spawnTime))
    plans.push(plan)
  }

  return plans.sort((left, right) => left.spawnStart - right.spawnStart)
}

export function keyfallLaneX (lane, width) {
  const center = 114 + Math.max(0, Math.min(
    KEYFALL_LANE_COUNT - 1,
    Number(lane) || 0,
  )) * 188
  return center - width / 2
}
