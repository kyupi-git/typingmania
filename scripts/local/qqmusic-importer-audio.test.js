import { test } from '@jest/globals'

import { detectDecryptedAudioContainer } from './qqmusic-audio.js'

test.each([
  [Buffer.from('fLaC'), '.flac'],
  [Buffer.from('OggS'), '.ogg'],
  [Buffer.from('ID3x'), '.mp3'],
  [Buffer.from([0xFF, 0xFB, 0x00, 0x00]), '.mp3'],
  [Buffer.concat([Buffer.alloc(4), Buffer.from('ftyp'), Buffer.alloc(4)]), '.m4a'],
])('recognizes supported decrypted QQ Music audio', (audio, extension) => {
  expect(detectDecryptedAudioContainer(audio).extension).toBe(extension)
})

test('rejects a decrypted payload without an audio signature', () => {
  expect(() => detectDecryptedAudioContainer(Buffer.from('xxxx')))
    .toThrow(/did not decrypt/iu)
})
