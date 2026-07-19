function normalizeMatchText (value, removeParenthetical = false) {
  let text = String(value || '').normalize('NFKC').toLocaleLowerCase()
  if (removeParenthetical) {
    text = text.replace(/\([^)]*\)|（[^）]*）|\[[^\]]*\]|【[^】]*】/g, '')
  }
  return text.replace(/[\p{P}\p{S}\s]/gu, '')
}

function similarText (left, right) {
  const variants = value => [
    normalizeMatchText(value),
    normalizeMatchText(value, true),
  ].filter(Boolean)
  for (const leftVariant of variants(left)) {
    for (const rightVariant of variants(right)) {
      if (
        leftVariant === rightVariant ||
        (
          Math.min(leftVariant.length, rightVariant.length) >= 4 &&
          (
            leftVariant.includes(rightVariant) ||
            rightVariant.includes(leftVariant)
          )
        )
      ) {
        return true
      }
    }
  }
  return false
}

export function rankLyricsCandidates (metadata, catalog) {
  const ranked = []
  const metadataTitles = [
    metadata.title,
    metadata.rawTitle,
  ].filter(Boolean)
  const artistNames = [
    ...(metadata.artistNames || []),
    ...(metadata.rawArtistNames || []),
  ]
  for (const group of catalog) {
    const durationDelta = metadata.duration && group.duration
      ? Math.abs(metadata.duration - group.duration)
      : 0
    if (
      durationDelta > 4 ||
      !metadataTitles.some(title => similarText(title, group.title))
    ) {
      continue
    }
    const exactTitleMatch = metadataTitles.some(title => (
      normalizeMatchText(title) === normalizeMatchText(group.title)
    ))
    const artistMatch = artistNames.some(artist => (
      similarText(artist, group.artist)
    ))
    const albumMatch = Boolean(
      metadata.album &&
      group.album &&
      similarText(metadata.album, group.album),
    )
    const durationVerified = Boolean(
      metadata.duration &&
      group.duration &&
      durationDelta <= 2,
    )
    let score = 100 - durationDelta * 5
    if (exactTitleMatch) score += 50
    if (artistMatch) score += 30
    if (albumMatch) score += 10
    if (group.roma) score += 10
    ranked.push({
      ...group,
      matchScore: score,
      exactTitleMatch,
      artistMatch,
      albumMatch,
      durationVerified,
      offlinePronunciationTrusted: Boolean(
        group.roma &&
        exactTitleMatch &&
        durationVerified &&
        (artistMatch || albumMatch),
      ),
    })
  }
  return ranked.sort((left, right) => right.matchScore - left.matchScore)
}

export function findBestLyrics (metadata, catalog) {
  return rankLyricsCandidates(metadata, catalog)[0] || null
}
