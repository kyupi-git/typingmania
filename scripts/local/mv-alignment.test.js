import {
  alignAudioEnvelopes,
  pcmEnergyEnvelope,
} from './mv-alignment.js'

test('finds a constant positive video offset', () => {
  const song = Float32Array.from(
    { length: 900 },
    (_, index) => Math.sin(index * 0.071) + Math.sin(index * 0.019) * 0.3,
  )
  const video = new Float32Array(940)
  video.set(song, 20)
  const result = alignAudioEnvelopes(song, video, {
    binsPerSecond: 10,
    maximumOffsetSeconds: 5,
  })
  expect(result.accepted).toBe(true)
  expect(result.offsetSeconds).toBeCloseTo(2, 1)
})

test('rejects unrelated audio', () => {
  const song = Float32Array.from({ length: 500 }, (_, index) => index % 7)
  const video = Float32Array.from({ length: 500 }, (_, index) => index % 11)
  expect(alignAudioEnvelopes(song, video).accepted).toBe(false)
})

test('builds a compact energy envelope from PCM', () => {
  const pcm = new Float32Array(8000).fill(0.5)
  expect(pcmEnergyEnvelope(pcm)).toHaveLength(10)
})
