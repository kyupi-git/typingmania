import { SONG_TITLE_CLEANUP_VERSION } from '../../src/song/song-title.js'
import { rewritePackedSongMetadata } from './packed-song-writer.js'

function changedValue (song, field, value) {
  const normalized = String(value || '').trim()
  if (!normalized || normalized === String(song[field] || '')) return false
  song[field] = normalized
  return true
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
    song.source.checks = {
      ...(song.source.checks || {}),
      metadata: true,
      metadata_canonical: catalogSafe,
      lyric_language_detected: Boolean(languageSafe),
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
