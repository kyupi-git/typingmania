function clamp (value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value))
}

export function pcmEnergyEnvelope (
  pcm,
  { sampleRate = 8000, binsPerSecond = 10 } = {},
) {
  const samples = pcm instanceof Float32Array
    ? pcm
    : new Float32Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 4))
  const binSize = Math.max(1, Math.round(sampleRate / binsPerSecond))
  const output = new Float32Array(Math.floor(samples.length / binSize))
  for (let bin = 0; bin < output.length; bin++) {
    let sum = 0
    const start = bin * binSize
    for (let index = start; index < start + binSize; index++) {
      const value = samples[index]
      sum += value * value
    }
    output[bin] = Math.log1p(Math.sqrt(sum / binSize) * 40)
  }
  return output
}

function correlationAtLag (song, video, lag) {
  const songStart = Math.max(0, -lag)
  const videoStart = Math.max(0, lag)
  const count = Math.min(
    song.length - songStart,
    video.length - videoStart,
  )
  if (count < 300) return null
  let songMean = 0
  let videoMean = 0
  for (let index = 0; index < count; index++) {
    songMean += song[songStart + index]
    videoMean += video[videoStart + index]
  }
  songMean /= count
  videoMean /= count
  let covariance = 0
  let songVariance = 0
  let videoVariance = 0
  for (let index = 0; index < count; index++) {
    const left = song[songStart + index] - songMean
    const right = video[videoStart + index] - videoMean
    covariance += left * right
    songVariance += left * left
    videoVariance += right * right
  }
  const denominator = Math.sqrt(songVariance * videoVariance)
  return denominator > 0
    ? { correlation: covariance / denominator, count }
    : null
}

/**
 * Finds the constant video-time offset that best aligns two audio envelopes.
 * Positive offsets mean video.currentTime should be ahead of song.currentTime.
 */
export function alignAudioEnvelopes (
  song,
  video,
  { binsPerSecond = 10, maximumOffsetSeconds = 30 } = {},
) {
  const maximumLag = Math.round(maximumOffsetSeconds * binsPerSecond)
  let best = null
  for (let lag = -maximumLag; lag <= maximumLag; lag++) {
    const match = correlationAtLag(song, video, lag)
    if (!match || (best && match.correlation <= best.correlation)) continue
    best = { ...match, lag }
  }
  if (!best) {
    return { accepted: false, correlation: 0, coverage: 0, offsetSeconds: 0 }
  }
  const coverage = best.count / Math.max(1, song.length)
  return {
    accepted: best.correlation >= 0.62 && coverage >= 0.72,
    correlation: clamp(best.correlation, -1, 1),
    coverage: clamp(coverage, 0, 1),
    offsetSeconds: best.lag / binsPerSecond,
  }
}
