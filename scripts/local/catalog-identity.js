import { pinyin } from '../../vendor/runtime/node_modules/pinyin-pro/dist/index.mjs'

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
  return artists
    .flatMap(artist => String(artist || '').split(/\s*[,/&、;]\s*/u))
    .map(artist => artist.trim())
    .filter(Boolean)
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
  let artistSimilarity = 0
  for (const left of expectedArtists) {
    for (const right of candidateArtists) {
      artistSimilarity = Math.max(
        artistSimilarity,
        catalogTextSimilarity(left, right),
      )
      const literalLeft = catalogIdentity(left)
      const literalRight = catalogIdentity(right)
      if (
        Math.min(literalLeft.length, literalRight.length) >= 3 &&
        (
          literalLeft.includes(literalRight) ||
          literalRight.includes(literalLeft)
        )
      ) {
        artistSimilarity = Math.max(artistSimilarity, 0.86)
      }
    }
  }

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

  let confidence = titleSimilarity * 0.54 +
    artistSimilarity * 0.30 +
    durationScore
  if (titleSimilarity === 1) confidence += 0.04
  if (artistSimilarity === 1) confidence += 0.03
  confidence = Math.min(1, confidence)

  const safe = (
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
    verifiedFields,
  }
}
