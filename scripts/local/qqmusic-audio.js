export function detectDecryptedAudioContainer (audio) {
  if (audio.length >= 4 && audio.toString('ascii', 0, 4) === 'fLaC') {
    return { extension: '.flac', mimeType: 'audio/flac', codec: 'flac' }
  }
  if (audio.length >= 4 && audio.toString('ascii', 0, 4) === 'OggS') {
    return { extension: '.ogg', mimeType: 'audio/ogg', codec: 'ogg' }
  }
  if (
    audio.length >= 3 &&
    (
      audio.toString('ascii', 0, 3) === 'ID3' ||
      (audio[0] === 0xFF && (audio[1] & 0xE0) === 0xE0)
    )
  ) {
    return { extension: '.mp3', mimeType: 'audio/mpeg', codec: 'mp3' }
  }
  if (
    audio.length >= 12 &&
    audio.toString('ascii', 4, 8) === 'ftyp'
  ) {
    return { extension: '.m4a', mimeType: 'audio/mp4', codec: 'mp4' }
  }
  throw new Error('ekey did not decrypt the cached audio')
}
