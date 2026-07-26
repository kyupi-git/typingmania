export function decodeNeteaseCacheAudio (encrypted) {
  const audio = Buffer.allocUnsafe(encrypted.length)
  for (let index = 0; index < encrypted.length; index++) {
    audio[index] = encrypted[index] ^ 0xA3
  }
  if (audio.toString('ascii', 0, 4) === 'fLaC') {
    return { audio, extension: '.flac' }
  }
  if (
    audio.toString('ascii', 0, 3) === 'ID3' ||
    (audio[0] === 0xFF && (audio[1] & 0xE0) === 0xE0)
  ) return { audio, extension: '.mp3' }
  throw new Error('The NetEase cache item is not a complete MP3 or FLAC stream')
}

function expectedMediaSizes (detail) {
  return ['hr', 'sq', 'h', 'm', 'l', 'hMusic', 'mMusic', 'lMusic', 'bMusic']
    .map(key => Number(detail?.[key]?.size))
    .filter(size => Number.isSafeInteger(size) && size > 4096)
}

export function assertCompleteNeteaseCacheSize (detail, actualSize) {
  const sizes = expectedMediaSizes(detail)
  if (!sizes.length) {
    throw new Error('NetEase did not publish a complete size for this cache item')
  }
  // A partially cached file can still expose a valid header and duration.
  // Require one of the provider's complete-media byte counts.
  // The small tolerance covers harmless tag padding between client versions.
  if (!sizes.some(size => Math.abs(size - actualSize) <= 64)) {
    throw new Error('The NetEase cache item is incomplete')
  }
}
