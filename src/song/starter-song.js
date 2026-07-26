export function isStarterSong (song) {
  return song?.source?.service === 'typingmania-demo' &&
    song?.source?.baseline === true
}

export function shouldResolveMusicVideo (song, enabled) {
  return Boolean(enabled) && !isStarterSong(song)
}
