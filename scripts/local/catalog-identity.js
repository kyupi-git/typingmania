import { pinyin } from '../../vendor/runtime/node_modules/pinyin-pro/dist/index.mjs'
import { isLikelyArtistName, normalizeArtistCredits, splitArtistCredits } from './original-artist.js'

export function catalogIdentity (value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]/gu, '')
}

export function phoneticCjkIdentity (value) {
  return [...String(value || '').normalize('NFKC')]
    .map(character => {
      if (!/\p{Script=Han}/u.test(character)) return catalogIdentity(character)
      return pinyin(character, {
        toneType: 'none',
        type: 'string',
        nonZh: 'consecutive',
      }).replace(/\s+/gu, '')
    })
    .join('')
}

export function catalogIdentitiesEquivalent (left, right) {
  const literalLeft = catalogIdentity(left)
  const literalRight = catalogIdentity(right)
  if (!literalLeft || !literalRight) return false
  if (literalLeft === literalRight) return true
  if (!/\p{Script=Han}/u.test(String(left)) || !/\p{Script=Han}/u.test(String(right))) {
    return false
  }
  return phoneticCjkIdentity(left) === phoneticCjkIdentity(right)
}

function editDistance (left, right) {
  if (left.length < right.length) [left, right] = [right, left]
  const row = new Uint16Array(right.length + 1)
  for (let index = 0; index <= right.length; index++) row[index] = index
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    let diagonal = row[0]
    row[0] = leftIndex
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const previous = row[rightIndex]
      row[rightIndex] = left[leftIndex - 1] === right[rightIndex - 1]
        ? diagonal
        : Math.min(diagonal, row[rightIndex], row[rightIndex - 1]) + 1
      diagonal = previous
    }
  }
  return row[right.length]
}

export function catalogTextSimilarity (left, right) {
  const first = catalogIdentity(left)
  const second = catalogIdentity(right)
  if (!first || !second) return 0
  if (catalogIdentitiesEquivalent(left, right)) return 1
  const distance = editDistance(first, second)
  return Math.max(0, 1 - distance / Math.max(first.length, second.length))
}

function metadataArtists (value) {
  const artists = value?.artistNames?.length
    ? value.artistNames
    : [value?.artist]
  return normalizeArtistCredits(artists.flatMap(artist => splitArtistCredits(artist)))
    .filter(isLikelyArtistName)
}

function artistSetSimilarity (expected, candidate) {
  if (!expected.length || !candidate.length || expected.length !== candidate.length) return 0
  const used = new Set()
  let total = 0
  for (const left of expected) {
    let best = 0
    let bestIndex = -1
    candidate.forEach((right, index) => {
      if (used.has(index)) return
      const score = catalogTextSimilarity(left, right)
      if (score > best) { best = score; bestIndex = index }
    })
    if (bestIndex < 0) return 0
    used.add(bestIndex)
    total += best
  }
  return total / expected.length
}

/**
 * Scores whether two metadata records describe the same recording.
 *
 * Duration and artist evidence prevent a small spelling correction from
 * turning into a same-title false match. The returned verified fields are the
 * only fields an importer may use to replace local tags.
 */
export function catalogMetadataConfidence (expected, candidate) {
  const titleSimilarity = catalogTextSimilarity(
    expected?.title,
    candidate?.title,
  )
  const expectedArtists = metadataArtists(expected)
  const candidateArtists = metadataArtists(candidate)
  let artistSimilarity = artistSetSimilarity(expectedArtists, candidateArtists)
  // A single maximum pair is unsafe: a cover by one matching artist, or a
  // role/CV row split into two fields, must not replace a multi-artist song.

  const expectedDuration = Number(expected?.duration) || 0
  const candidateDuration = Number(candidate?.duration) || 0
  const durationDelta = expectedDuration && candidateDuration
    ? Math.abs(expectedDuration - candidateDuration)
    : null
  const durationScore = durationDelta === null
    ? 0.06
    : durationDelta <= 1.5
      ? 0.16
      : durationDelta <= 3
        ? 0.12
        : durationDelta <= 5
          ? 0.05
        : 0

  const versionMarker = value => String(value || '').normalize('NFKC')
    .toLocaleLowerCase()
    .match(/(?:\blive\b|\bcover\b|\bremix\b|\bkaraoke\b|\boff[- ]?vocal\b|翻唱|现场|現場|混音|重混|伴奏|カバー|ライブ|リミックス)/iu)?.[0] || ''
  const expectedVersion = versionMarker(expected?.title)
  const candidateVersion = versionMarker(candidate?.title)
  const versionMismatch = expectedVersion !== candidateVersion &&
    Boolean(expectedVersion || candidateVersion)

  let confidence = titleSimilarity * 0.54 +
    artistSimilarity * 0.30 +
    durationScore
  if (titleSimilarity === 1) confidence += 0.04
  if (artistSimilarity === 1) confidence += 0.03
  confidence = Math.min(1, confidence)

  const safe = !versionMismatch && (
    titleSimilarity >= 0.82 &&
    artistSimilarity >= 0.72 &&
    (durationDelta === null || durationDelta <= 5) &&
    confidence >= 0.78
  )
  const verifiedFields = safe
    ? [
        'title',
        ...(artistSimilarity >= 0.82 ? ['artist', 'artistNames'] : []),
        ...(candidate?.album ? ['album'] : []),
        ...(durationDelta !== null && durationDelta <= 3 ? ['duration'] : []),
      ]
    : []
  return {
    safe,
    confidence,
    titleSimilarity,
    artistSimilarity,
    durationDelta,
    versionMismatch,
    verifiedFields,
  }
}
