import { SONG_TITLE_CLEANUP_VERSION } from '../../src/song/song-title.js'
import { ORIGINAL_ARTIST_VERSION } from './original-artist.js'
import { rewritePackedSongMetadata } from './packed-song-writer.js'

function changedValue (song, field, value) {
  const normalized = String(value || '').trim()
  if (!normalized || normalized === String(song[field] || '')) return false
  song[field] = normalized
  return true
}

function pendingArtistResolution (metadata, verification) {
  const names = Array.isArray(metadata.artistNames) && metadata.artistNames.length
    ? metadata.artistNames
    : [metadata.artist]
  const rawNames = Array.isArray(metadata.rawArtistNames) && metadata.rawArtistNames.length
    ? metadata.rawArtistNames
    : names
  const artists = Array.isArray(metadata.artistResolution?.artists) &&
    metadata.artistResolution.artists.length
    ? metadata.artistResolution.artists
    : names.map((name, index) => ({
        rawName: rawNames[index] || name,
        originalName: '',
        resolved: false,
      }))
  return {
    version: ORIGINAL_ARTIST_VERSION,
    status: 'pending',
    resolved: false,
    checked_at: new Date().toISOString(),
    artists: artists.map(artist => ({
      singer_mid: artist.singerMid || artist.singer_mid || '',
      singer_id: Number(artist.singerId || artist.singer_id) || 0,
      raw_name: artist.rawName || artist.raw_name || '',
      original_name: artist.originalName || artist.original_name || '',
      resolved: false,
      source: artist.source || verification.source || 'catalog-pending',
      confidence: Number(artist.confidence) || 0,
      status: 'pending',
    })),
  }
}

export async function refreshPackedSongCatalogMetadata (
  existingSong,
  metadata,
) {
  const verification = metadata?.catalogVerification || {}
  const catalogSafe = verification.safe === true
  const languageSafe = metadata?.language && metadata.language !== 'U'
  if (!catalogSafe && !languageSafe) return existingSong
  const fields = new Set(
    catalogSafe ? verification.verifiedFields || [] : [],
  )
  return rewritePackedSongMetadata(existingSong, song => {
    const previousTitle = String(song.title || '')
    const previousArtist = String(song.artist || '')
    let changed = false
    if (fields.has('title')) {
      changed = changedValue(song, 'title', metadata.title) || changed
      if (
        !song.latin_title ||
        song.latin_title === previousTitle
      ) {
        song.latin_title = song.title
      }
    }
    if (fields.has('artist')) {
      changed = changedValue(song, 'artist', metadata.artist) || changed
      if (
        !song.latin_artist ||
        song.latin_artist === previousArtist
      ) {
        song.latin_artist = song.artist
      }
    }
    const previousResolution = song.source?.artist_resolution || {}
    const previousChecks = song.source?.checks || {}
    const pendingArtist = Boolean(
      metadata.artist &&
      metadata.artistResolution?.resolved !== true &&
      previousResolution.resolved !== true &&
      previousChecks.artist_original !== true,
    )
    const pendingResolutionNeedsUpdate = pendingArtist && (
      Number(previousResolution.version || 0) < ORIGINAL_ARTIST_VERSION ||
      previousResolution.status !== 'pending' ||
      !Array.isArray(previousResolution.artists) ||
      previousResolution.artists.length === 0
    )
    const verifiedArtist = Boolean(fields.has('artist') && metadata.artist)
    const verifiedResolutionNeedsUpdate = verifiedArtist && (
      Number(previousResolution.version || 0) < ORIGINAL_ARTIST_VERSION ||
      previousResolution.resolved !== true ||
      previousChecks.artist_original !== true
    )
    changed = pendingResolutionNeedsUpdate || verifiedResolutionNeedsUpdate || changed
    if (pendingArtist) {
      changed = changedValue(song, 'artist', metadata.artist) || changed
      if (!song.latin_artist || song.latin_artist === previousArtist) {
        song.latin_artist = song.artist
      }
    }
    if (fields.has('subtitle')) {
      const previousSubtitle = String(song.subtitle || '')
      changed = changedValue(song, 'subtitle', metadata.subtitle) || changed
      if (
        !song.latin_subtitle ||
        song.latin_subtitle === previousSubtitle
      ) {
        song.latin_subtitle = song.subtitle
      }
    }
    if (metadata.language && metadata.language !== 'U') {
      changed = changedValue(song, 'language', metadata.language) || changed
    }
    if (!changed) return false

    song.source = song.source || {}
    song.source.title_cleanup = {
      version: SONG_TITLE_CLEANUP_VERSION,
    }
    if (catalogSafe) {
      song.source.metadata_resolution = {
        source: verification.source || '',
        confidence: Number(verification.confidence || 0),
        corroborated_by: verification.corroboratedBy || [],
        checked_at: new Date().toISOString(),
      }
    }
    if (verifiedArtist) {
      const artistNames = Array.isArray(metadata.artistNames) &&
        metadata.artistNames.length
        ? metadata.artistNames
        : [metadata.artist]
      song.source.artist_resolution = {
        version: ORIGINAL_ARTIST_VERSION,
        status: 'verified',
        resolved: true,
        checked_at: new Date().toISOString(),
        artists: artistNames.map(name => ({
          raw_name: name,
          original_name: name,
          resolved: true,
          source: verification.source || 'verified-catalog',
          confidence: Number(verification.confidence || 0),
        })),
      }
    } else if (pendingArtist) {
      song.source.artist_resolution = pendingArtistResolution(metadata, verification)
    }
    song.source.checks = {
      ...(song.source.checks || {}),
      metadata: true,
      metadata_canonical: catalogSafe,
      lyric_language_detected: Boolean(languageSafe),
      ...(fields.has('artist') && metadata.artist
        ? { artist_original: true }
        : pendingArtist
          ? { artist_original: false }
          : {}),
    }
    if (metadata.album) {
      song.source.cover = {
        ...(song.source.cover || {}),
        album: metadata.album,
      }
    }
    return true
  }, { operation: 'catalog-metadata' })
}
