import {
  needsOriginalNameDetail,
  originalArtistFromDetail,
  ORIGINAL_ARTIST_VERSION,
  splitArtistCredits,
  isLikelyArtistName,
  normalizeArtistCredits,
} from './original-artist.js'

export function retainVerifiableArtistNames (metadata) {
  const previous = metadata.artistResolution
  if (
    Number(previous?.version || 0) >= ORIGINAL_ARTIST_VERSION &&
    previous?.resolved === true &&
    Array.isArray(previous.artists) &&
    previous.artists.length > 0 &&
    previous.artists.every(artist => (
      isLikelyArtistName(artist?.originalName) &&
      isLikelyArtistName(artist?.rawName)
    ))
  ) {
    const names = normalizeArtistCredits(previous.artists
      .map(artist => String(artist.originalName || '').trim())
      .filter(Boolean))
    if (names.length === previous.artists.length) {
      return {
        ...metadata,
        artist: names.join(' / '),
        artistNames: names,
        rawArtistNames: previous.artists
          .map(artist => String(artist.rawName || '').trim())
          .filter(Boolean),
      }
    }
  }
  const verification = metadata.catalogVerification || {}
  const catalogNames = normalizeArtistCredits(Array.isArray(metadata.artistNames)
    ? metadata.artistNames.map(value => String(value || '').trim()).filter(Boolean)
    : [] )
  const catalogSafe = verification.safe === true &&
    Array.isArray(verification.verifiedFields) &&
    verification.verifiedFields.includes('artist') &&
    verification.verifiedFields.includes('artistNames') &&
    catalogNames.length > 0 &&
    (Number(verification.confidence || 0) >= 0.86 ||
      verification.source === 'multi-source-consensus')
  if (catalogSafe) {
    const rawNames = (metadata.rawArtistNames || catalogNames)
      .map(value => String(value || '').trim()).filter(Boolean)
    const artists = catalogNames.map((name, index) => ({
      rawName: rawNames[index] || name,
      originalName: name,
      resolved: true,
      source: verification.source || 'catalog-verification',
      confidence: Number(verification.confidence) || 0.86,
      corroboratedBy: verification.corroboratedBy || [],
    }))
    return {
      ...metadata,
      artist: catalogNames.join(' / '),
      artistNames: catalogNames,
      rawArtistNames: rawNames,
      artistResolution: {
        version: ORIGINAL_ARTIST_VERSION,
        status: 'verified',
        resolved: true,
        artists,
        source: verification.source || 'catalog-verification',
        confidence: Number(verification.confidence) || 0.86,
        corroboratedBy: verification.corroboratedBy || [],
      },
    }
  }
  const candidates = Array.isArray(metadata.artistNames) && metadata.artistNames.length
    ? normalizeArtistCredits(metadata.artistNames)
    : splitArtistCredits(metadata.artist || '')
      .filter(isLikelyArtistName)
  const previousRaw = Array.isArray(previous?.artists)
    ? previous.artists.map(artist => artist?.rawName || artist?.raw_name)
      .filter(isLikelyArtistName)
    : []
  const rawCandidates = candidates.length
    ? candidates
    : normalizeArtistCredits(previousRaw.length ? previousRaw : metadata.rawArtistNames || [])
  const artists = rawCandidates.map(rawName => {
    const candidate = {
      name: rawName,
      language: metadata.language,
    }
    if (needsOriginalNameDetail(candidate)) {
      return {
        rawName,
        originalName: '',
        resolved: false,
        source: 'original-name-verification-required',
        confidence: 0,
      }
    }
    return originalArtistFromDetail({
      rawName,
      language: metadata.language,
    })
  })
  const names = artists.map(artist => (
    artist.resolved && isLikelyArtistName(artist.originalName)
      ? artist.originalName
      : isLikelyArtistName(artist.rawName) ? artist.rawName : ''
  )).filter(Boolean)
  const allResolved = artists.length > 0 && artists.every(artist => (
    artist.resolved === true && isLikelyArtistName(artist.originalName)
  ))
  return {
    ...metadata,
    artist: names.join(' / '),
    artistNames: names,
    rawArtistNames: rawCandidates.map(value => String(value).trim()).filter(Boolean),
    artistResolution: {
      version: ORIGINAL_ARTIST_VERSION,
      status: allResolved ? 'verified' : 'pending',
      resolved: allResolved,
      artists,
    },
  }
}
