import { originalArtistFromDetail } from './original-artist.js'

export function retainVerifiableArtistNames (metadata) {
  const candidates = Array.isArray(metadata.artistNames) && metadata.artistNames.length
    ? metadata.artistNames
    : String(metadata.artist || '').split(/\s*[;/]\s*/u)
  const artists = candidates
    .map(rawName => originalArtistFromDetail({
      rawName,
      language: metadata.language,
    }))
  const names = artists
    .map(artist => artist.originalName)
    .filter(Boolean)
  return {
    ...metadata,
    artist: names.join(' / '),
    artistNames: names,
    rawArtistNames: candidates.map(value => String(value).trim()).filter(Boolean),
    artistResolution: {
      resolved: artists.length > 0 && artists.every(artist => artist.resolved),
      artists,
    },
  }
}
