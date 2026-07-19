import { originalSongTitle } from '../../src/song/song-title.js'

function normalizeIdentityPart (value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]/gu, '')
}

export function canonicalSongTitle (value) {
  return normalizeIdentityPart(originalSongTitle(value))
}

function artistParts (value) {
  const withoutReadings = String(value || '')
    .normalize('NFKC')
    .replace(/\([^)]*\)|\[[^\]]*\]|【[^】]*】/gu, ' ')
  return withoutReadings
    .split(/\s*(?:\/|&|、|,|_| feat(?:uring)?\.?)\s*/iu)
    .map(normalizeIdentityPart)
    .filter(part => part.length >= 2)
}

function artistsEquivalent (left, right) {
  const leftParts = artistParts(left)
  const rightParts = artistParts(right)
  if (!leftParts.length || !rightParts.length) return false
  return leftParts.some(leftPart => rightParts.includes(leftPart))
}

export function songsAreEquivalent (left, right) {
  const leftSource = left.source || {}
  const rightSource = right.source || {}
  if (
    leftSource.service === 'qqmusic' &&
    rightSource.service === 'qqmusic' &&
    leftSource.song_mid &&
    leftSource.song_mid === rightSource.song_mid
  ) {
    return true
  }
  if (
    !canonicalSongTitle(left.title) ||
    canonicalSongTitle(left.title) !== canonicalSongTitle(right.title) ||
    !artistsEquivalent(left.artist, right.artist)
  ) {
    return false
  }
  const leftDuration = Number(left.duration) || 0
  const rightDuration = Number(right.duration) || 0
  return leftDuration > 0 && rightDuration > 0 && Math.abs(leftDuration - rightDuration) <= 5
}

export function songContentIdentity (song) {
  return [
    artistParts(song.artist).join('+'),
    canonicalSongTitle(song.title),
    Math.round((Number(song.duration) || 0) / 5) * 5,
  ].join(':')
}
