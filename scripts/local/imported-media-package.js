import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { parseBuffer } from '../../vendor/runtime/node_modules/music-metadata/lib/index.js'

import PackedFile from '../../src/lib/packedfile.js'
import { SONG_ORIGIN_VERSION } from '../../src/song/song-origin.js'
import {
  ASSIST_PACE_METADATA_VERSION,
  estimateAssistReferencePace,
  PACE_METADATA_VERSION,
} from '../../src/util/song-meta.js'
import {
  analyzeSongTitle,
  SONG_TITLE_CLEANUP_VERSION,
} from '../../src/song/song-title.js'
import { validImage } from './qqmusic-api.js'
import { artistResolutionSourceInfo } from './artist-package.js'
import { normalizeArtistCredits } from './original-artist.js'

const AUDIO_MIME = Object.freeze({
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.mp3': 'audio/mpeg',
  '.mp4': 'audio/mp4',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
})

function imageExtension (mimeType = '') {
  const normalized = String(mimeType).toLocaleLowerCase()
  if (normalized.includes('png')) return '.png'
  if (normalized.includes('webp')) return '.webp'
  return '.jpg'
}

export async function inspectImportedAudio (
  audio,
  filename,
  expectedDuration = 0,
) {
  const extension = path.extname(filename).toLocaleLowerCase()
  const mimeType = AUDIO_MIME[extension]
  if (!mimeType) throw new Error(`Unsupported audio format: ${extension || 'unknown'}`)
  const parsed = await parseBuffer(audio, { mimeType, size: audio.length }, {
    duration: true,
    skipCovers: false,
  })
  const duration = Number(parsed.format.duration)
  if (!duration || audio.length < 4096) {
    throw new Error('The converted audio is incomplete or unreadable')
  }
  if (extension === '.m4a' || extension === '.mp4') {
    const encryptedSampleEntry = audio.indexOf(Buffer.from('enca', 'ascii'))
    const playableAudioEntry = audio.indexOf(Buffer.from('mp4a', 'ascii'))
    if (encryptedSampleEntry >= 0 || playableAudioEntry < 0) {
      throw new Error('The Apple Music audio stream is still encrypted or malformed')
    }
  }
  if (expectedDuration && Math.abs(duration - expectedDuration) > 4) {
    throw new Error(
      `Audio duration does not match metadata ` +
      `(${duration.toFixed(2)}s/${Number(expectedDuration).toFixed(2)}s)`,
    )
  }
  return {
    duration,
    extension,
    mimeType,
    parsed,
    sampleRate: parsed.format.sampleRate,
    channels: parsed.format.numberOfChannels,
  }
}

export function embeddedArtwork (audioInfo) {
  for (const picture of audioInfo?.parsed?.common?.picture || []) {
    const buffer = Buffer.from(picture.data || [])
    if (!validImage(buffer)) continue
    return {
      buffer,
      extension: imageExtension(picture.format),
      verifiedOnline: false,
      strategy: 'embedded-track-artwork',
    }
  }
  return null
}

function safeTrackId (provider, trackId, metadata) {
  const preferred = String(trackId || '').replace(/[^a-z0-9._-]/giu, '_')
  if (preferred && preferred.length <= 96) return preferred
  return crypto
    .createHash('sha256')
    .update(`${provider}\n${metadata.title}\n${metadata.artist}\n${metadata.album}`)
    .digest('hex')
    .slice(0, 32)
}

export async function writeImportedSongPackage ({
  root,
  provider,
  trackId,
  metadata,
  lyrics,
  cover,
  posterResolution = null,
  audio,
  audioInfo,
  source = {},
}) {
  if (!validImage(cover?.buffer || Buffer.alloc(0))) {
    throw new Error('A valid cover image is required')
  }
  const packageId = safeTrackId(provider, trackId, metadata)
  const imageName = `cover${cover.extension || '.jpg'}`
  const poster = posterResolution?.poster || null
  const posterName = poster ? `poster${poster.extension}` : ''
  const audioName = `audio${audioInfo.extension}`
  const verifiedAt = new Date().toISOString()
  const titleCleanup = analyzeSongTitle(metadata.rawTitle || metadata.title, {
    language: metadata.language,
  })
  if (!String(titleCleanup.title || '').trim()) {
    throw new Error('A verified song title is required before packaging')
  }
  const artistNames = normalizeArtistCredits(metadata.artistNames?.length
    ? metadata.artistNames
    : metadata.artist)
  if (!artistNames.length) {
    throw new Error('A plausible artist is required before packaging')
  }
  const assistPace = estimateAssistReferencePace(
    lyrics.lyricsCsv,
    metadata.language,
    { durationMs: audioInfo.duration * 1000 },
  )
  const song = {
    title: titleCleanup.title,
    subtitle: metadata.subtitle || '',
    artist: artistNames.join(' / '),
    latin_title: titleCleanup.title,
    latin_subtitle: metadata.subtitle || '',
    latin_artist: artistNames.join(' / '),
    language: metadata.language || 'U',
    cpm: lyrics.cpm,
    max_cpm: lyrics.maxCpm,
    assist_cpm: assistPace.averageCpm,
    assist_max_cpm: assistPace.peakCpm,
    duration: Math.ceil(audioInfo.duration),
    image: imageName,
    poster: posterName || undefined,
    audio: audioName,
    origin: metadata.origin || undefined,
    source: {
      ...source,
      service: provider,
      track_id: String(trackId || packageId),
      imported_at: verifiedAt,
      verified_at: verifiedAt,
      title_cleanup: { version: SONG_TITLE_CLEANUP_VERSION },
      origin_resolution: metadata.origin
        ? {
            version: SONG_ORIGIN_VERSION,
            resolved: true,
            checked_at: verifiedAt,
          }
        : undefined,
      checks: {
        metadata: true,
        audio_decode: true,
        lyrics_timed: true,
        pronunciation_complete: ['verified', 'ruby-assisted'].includes(
          lyrics.stats.pronunciationStatus || 'verified',
        ),
        cover: true,
        artist_original: metadata.artistResolution?.resolved === true,
        ...(source.checks || {}),
      },
      artist_resolution: artistResolutionSourceInfo(metadata.artistResolution),
      cover: {
        strategy: cover.strategy || 'provider-artwork',
        verified_online: Boolean(cover.verifiedOnline),
        poster_checked: Boolean(posterResolution?.checked),
        album: metadata.album || '',
        album_mid: metadata.albumMid || metadata.albumId || '',
      },
      lyrics_fingerprint: lyrics.fingerprint,
      pronunciation_fingerprint: lyrics.pronunciationFingerprint,
      quality: {
        version: lyrics.stats.qualityVersion,
        pronunciation_version: lyrics.stats.pronunciationVersion,
        playable_lines: lyrics.stats.playableLines,
        display_only_lines: lyrics.stats.displayOnlyLines,
        removed_metadata_lines:
          lyrics.stats.removedMainMetadataLines +
          lyrics.stats.removedRomaMetadataLines,
        generated_pinyin_lines: lyrics.stats.generatedPinyinLines,
        song_specific_pronunciation_lines:
          lyrics.stats.songSpecificPronunciationLines,
        pronunciation_override_lines:
          lyrics.stats.pronunciationOverrideLines,
        pronunciation_status: lyrics.stats.pronunciationStatus || 'verified',
        explicit_ruby_lines: lyrics.stats.explicitRubyLines || 0,
        dictionary_pronunciation_lines: lyrics.stats.dictionaryPronunciationLines || 0,
        pending_pronunciation_lines: lyrics.stats.pendingPronunciationLines || 0,
        timing_windows_adjusted:
          lyrics.stats.timingWindowsAdjusted || 0,
        instrumental_gap_ms_removed:
          lyrics.stats.instrumentalGapMsRemoved || 0,
        typical_ms_per_key:
          lyrics.stats.typicalMsPerKey || 0,
      },
      pace: {
        version: PACE_METADATA_VERSION,
        model: 'demo-human-cadence',
        average: 'score-typing-time',
        peak: 'event-based-5-second-window',
      },
      assist_pace: {
        version: ASSIST_PACE_METADATA_VERSION,
        required_keys: assistPace.requiredKeys,
        average: 'manual-anchor-typing-time',
        peak: 'manual-anchor-event-based-5-second-window',
      },
    },
  }

  const packer = new PackedFile()
  const encoder = new TextEncoder()
  packer.addFile('song.json', encoder.encode(JSON.stringify(song)))
  packer.addFile('lyrics.csv', encoder.encode(lyrics.lyricsCsv))
  packer.addFile(imageName, cover.buffer)
  if (poster) packer.addFile(posterName, poster.buffer)
  packer.addFile(audioName, audio)

  const directory = path.join(root, 'data', provider)
  await fs.mkdir(directory, { recursive: true })
  const output = path.join(directory, `${packageId}.typingmania`)
  const temporary = `${output}.${process.pid}.tmp`
  try {
    await fs.writeFile(temporary, Buffer.from(packer.pack()))
    await fs.rename(temporary, output)
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => {})
    throw error
  }
  return { output, song }
}
