function clamp (value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value))
}

/**
 * Tension is an exponentially weighted "flow" score rather than cumulative
 * accuracy. A streak steadily approaches 100; recent mistakes remain visible
 * without permanently defining the whole run.
 */
export function nextTension (current, outcome, severity = 1) {
  const value = clamp(Number(current) || 0, 0, 100)
  if (outcome === 'correct') {
    return clamp(value + (100 - value) * 0.13, 0, 100)
  }
  if (outcome === 'miss') {
    return clamp(value * 0.66, 0, 100)
  }
  if (outcome === 'skip') {
    const skipped = clamp(Math.ceil(Number(severity) || 1), 1, 8)
    return clamp(value * Math.pow(0.82, skipped), 0, 100)
  }
  return value
}

function normalizeEvents (events, duration) {
  return (events || [])
    .map(event => ({
      time: clamp(Number(event.time) || 0, 0, duration),
      outcome: event.outcome,
      tension: clamp(Number(event.tension) || 0, 0, 100),
    }))
    .filter(event => ['correct', 'miss', 'skip'].includes(event.outcome))
    .sort((left, right) => left.time - right.time)
}

function averageTension (events, duration) {
  if (duration <= 0 || events.length === 0) return 0
  let area = 0
  let previousTime = 0
  let previousValue = 0
  for (const event of events) {
    area += previousValue * Math.max(0, event.time - previousTime)
    previousTime = event.time
    previousValue = event.tension
  }
  area += previousValue * Math.max(0, duration - previousTime)
  return area / duration
}

export function buildPerformanceSummary (
  rawEvents,
  rawDuration,
  {
    sampleCount = 72,
    paceWindow = 5,
  } = {},
) {
  const duration = Math.max(0.1, Number(rawDuration) || 0.1)
  const events = normalizeEvents(rawEvents, duration)
  const tension = [{ time: 0, value: 0 }]
  for (const event of events) {
    tension.push({
      time: event.time,
      value: event.tension,
      outcome: event.outcome,
    })
  }
  tension.push({
    time: duration,
    value: events.at(-1)?.tension || 0,
  })

  const samples = Math.max(12, Math.floor(Number(sampleCount) || 72))
  const windowSeconds = clamp(Number(paceWindow) || 5, 2, 10)
  const correctTimes = events
    .filter(event => event.outcome === 'correct')
    .map(event => event.time)
  const pace = []
  let peakPace = 0
  let smoothedPace = 0

  // Calculate the reported peak at every real input event. Sampling is useful
  // for drawing a compact chart, but it can miss a short burst and makes the
  // result depend on the chart width. The event-based value is deterministic
  // and can also be predicted by the same schedule used by demo play.
  for (let index = 0; index < correctTimes.length; index++) {
    const time = correctTimes[index]
    const windowStart = Math.max(0, time - windowSeconds)
    let first = index
    while (first > 0 && correctTimes[first - 1] > windowStart) first--
    const count = index - first + 1
    const effectiveWindow = Math.max(1, time - windowStart)
    peakPace = Math.max(peakPace, count * 60 / effectiveWindow)
  }

  for (let index = 0; index <= samples; index++) {
    const time = duration * index / samples
    const windowStart = Math.max(0, time - windowSeconds)
    const count = correctTimes.filter(
      eventTime => eventTime > windowStart && eventTime <= time,
    ).length
    const effectiveWindow = Math.max(1, time - windowStart)
    const instantPace = count * 60 / effectiveWindow
    smoothedPace = index === 0
      ? instantPace
      : smoothedPace * 0.52 + instantPace * 0.48
    const value = Math.max(0, smoothedPace)
    pace.push({ time, value })
  }

  return {
    duration,
    tension,
    pace,
    peakPace: Math.round(peakPace),
    averageTension: averageTension(events, duration),
  }
}
