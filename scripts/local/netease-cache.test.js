import { expect, test } from '@jest/globals'

import {
  assertCompleteNeteaseCacheSize,
  decodeNeteaseCacheAudio,
} from './netease-cache.js'

function encryptLegacyCache (audio) {
  return Buffer.from(Uint8Array.from(audio, byte => byte ^ 0xA3))
}

test('NetEase legacy cache decoding accepts real MP3 and FLAC signatures', () => {
  const mp3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(5000)])
  const flac = Buffer.concat([Buffer.from('fLaC'), Buffer.alloc(5000)])

  expect(decodeNeteaseCacheAudio(encryptLegacyCache(mp3))).toMatchObject({
    audio: mp3,
    extension: '.mp3',
  })
  expect(decodeNeteaseCacheAudio(encryptLegacyCache(flac))).toMatchObject({
    audio: flac,
    extension: '.flac',
  })
  expect(() => decodeNeteaseCacheAudio(Buffer.alloc(5000)))
    .toThrow(/not a complete MP3 or FLAC/iu)
})

test('NetEase cache completeness uses current and legacy quality byte counts', () => {
  expect(() => assertCompleteNeteaseCacheSize({
    sq: { size: 12_345 },
  }, 12_345)).not.toThrow()
  expect(() => assertCompleteNeteaseCacheSize({
    hMusic: { size: 54_321 },
  }, 54_321)).not.toThrow()
  expect(() => assertCompleteNeteaseCacheSize({
    h: { size: 12_345 },
  }, 8_000)).toThrow(/incomplete/iu)
  expect(() => assertCompleteNeteaseCacheSize({}, 12_345))
    .toThrow(/did not publish a complete size/iu)
})
