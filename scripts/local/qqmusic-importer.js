import fs from 'node:fs/promises'
import path from 'node:path'

import * as qmcCrypto from '../../vendor/runtime/node_modules/@clamber_l/crypto/dist/loader.mjs'
import { parseBuffer } from '../../vendor/runtime/node_modules/music-metadata/lib/index.js'

import PackedFile from '../../src/lib/packedfile.js'
import { SONG_ORIGIN_VERSION } from '../../src/song/song-origin.js'
import { PACE_METADATA_VERSION } from '../../src/util/song-meta.js'
import {
  analyzeSongTitle,
  SONG_TITLE_CLEANUP_VERSION,
} from '../../src/song/song-title.js'
import {
  isAnimeThemeSong,
  selectAnimeCoverCandidate,
} from './cover-selection.js'
import {
  COVER_SELECTION_VERSION,
  coverSourceInfo,
  refreshPackedSongCover,
} from './cover-package.js'
import AnimePosterResolver from './anime-poster.js'
import {
  artistResolutionSourceInfo,
  refreshPackedSongArtist,
} from './artist-package.js'
import OriginalArtistResolver, {
  ORIGINAL_ARTIST_VERSION,
} from './original-artist.js'
import {
  convertQrcFiles,
  LYRIC_QUALITY_VERSION,
} from './qqmusic-qrc.js'
import {
  rebuildSongIndex,
  scanSongLibrary,
  songsAreEquivalent,
} from './library.js'
import SongOriginResolver from './song-origin-resolver.js'
import { refreshPackedSongOrigin } from './song-origin-package.js'
import { needsSongOriginRefresh } from './song-origin-maintenance.js'
import { refreshQQMusicSongTitles } from './song-title-maintenance.js'
import {
  createImportBatchResult,
  finishImportBatch,
  needsMoreNewSongs,
  prioritizeUnseenTracks,
} from './import-batch.js'
import {
  compareOfficialLyrics,
  discoverQQMusicCache,
  fetchOfficialCover,
  fetchOfficialLyrics,
  fetchTrackEkey,
  fetchTrackMetadata,
  isQQMusicNetworkError,
  QQMusicImportError,
  readQQMusicSession,
  searchQQMusicTracks,
  validImage,
} from './qqmusic-api.js'
import {
  compareOfficialPronunciation,
  lyricLanguage,
  PRONUNCIATION_QUALITY_VERSION,
} from './pronunciation.js'
import { rankLyricsCandidates } from './qrc-candidate.js'
import { NetworkCircuitBreaker } from './network.js'

function parseQrcFilename (root) {
  const parts = root.split(' - ')
  let durationIndex = -1
  for (let index = parts.length - 1; index >= 1; index--) {
    if (/^\d+$/.test(parts[index].trim())) {
      durationIndex = index
      break
    }
  }
  if (durationIndex < 2) {
    return { artist: parts[0] || '', title: parts.slice(1).join(' - '), duration: 0, album: '' }
  }
  return {
    artist: parts[0],
    title: parts.slice(1, durationIndex).join(' - '),
    duration: Number(parts[durationIndex]),
    album: parts.slice(durationIndex + 1).join(' - '),
  }
}

export async function buildQrcCatalog (lyricsDirectory) {
  const entries = await fs.readdir(lyricsDirectory, { withFileTypes: true })
  const groups = new Map()
  for (const entry of entries) {
    if (!entry.isFile()) continue
    let kind
    let root
    if (/_qmRoma\.qrc$/i.test(entry.name)) {
      kind = 'roma'
      root = entry.name.replace(/_qmRoma\.qrc$/i, '')
    } else if (/_qm\.qrc$/i.test(entry.name)) {
      kind = 'main'
      root = entry.name.replace(/_qm\.qrc$/i, '')
    } else {
      continue
    }
    if (!groups.has(root)) {
      groups.set(root, { root, ...parseQrcFilename(root), main: null, roma: null })
    }
    groups.get(root)[kind] = path.join(lyricsDirectory, entry.name)
  }
  return [...groups.values()].filter(group => group.main)
}

async function listRecentEncryptedTracks (dutyDirectory) {
  const entries = await fs.readdir(dutyDirectory, { withFileTypes: true })
  const tracks = []
  for (const entry of entries) {
    if (!/\.mflac$/i.test(entry.name)) continue
    const container = path.join(dutyDirectory, entry.name)
    let filename = container
    if (entry.isDirectory()) {
      const expected = path.join(container, entry.name)
      try {
        if ((await fs.stat(expected)).isFile()) filename = expected
        else continue
      } catch {
        continue
      }
    } else if (!entry.isFile()) {
      continue
    }
    try {
      const stat = await fs.stat(filename)
      const localFilename = path.basename(filename)
      const stem = localFilename.replace(/\.mflac$/i, '')
      const mediaMid = /^[A-Z0-9]{4}/i.test(stem) ? stem.slice(4) : ''
      if (!mediaMid) continue
      tracks.push({
        filename,
        localFilename,
        qualityPrefix: stem.slice(0, 4).toUpperCase(),
        mediaMid,
        bytes: stat.size,
        modifiedMs: stat.mtimeMs,
      })
    } catch {}
  }
  tracks.sort((left, right) => right.modifiedMs - left.modifiedMs)
  const unique = new Map()
  for (const track of tracks) {
    if (!unique.has(track.mediaMid)) unique.set(track.mediaMid, track)
  }
  return [...unique.values()]
}

async function buildCoverCatalog (cacheRoot) {
  const directory = path.join(cacheRoot, 'QQMusicPicture')
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true })
    return entries
      .filter(entry => entry.isFile())
      .map(entry => ({ name: entry.name, filename: path.join(directory, entry.name) }))
  } catch {
    return []
  }
}

async function localCover (metadata, catalog, albumMids = [metadata.albumMid]) {
  const mids = albumMids.filter(Boolean)
  if (!mids.length) return null
  const matches = catalog.filter(entry => (
    mids.some(albumMid => entry.name.includes(albumMid))
  ))
  matches.sort((left, right) => Number(/500x500/i.test(right.name)) - Number(/500x500/i.test(left.name)))
  for (const match of matches) {
    try {
      const buffer = await fs.readFile(match.filename)
      if (!validImage(buffer)) continue
      const extension = path.extname(match.filename).toLowerCase() || '.jpg'
      const albumMid = mids.find(mid => match.name.includes(mid)) || metadata.albumMid
      return {
        buffer,
        extension,
        verifiedOnline: false,
        albumMid,
        album: metadata.album,
        strategy: 'local-cache',
        animeRelated: false,
      }
    } catch {}
  }
  return null
}

function createCoverPolicy () {
  return {
    searchCache: new Map(),
    searchFailures: 0,
    searchDisabled: false,
    remoteFailures: 0,
    remoteDisabled: false,
  }
}

async function getVerifiedCover (metadata, catalog, cookie, policy) {
  let selected = null
  let lastNetworkError = null
  if (isAnimeThemeSong(metadata) && !policy.searchDisabled) {
    const query = `${
      metadata.title
    } ${
      metadata.artistNames?.[0] ||
      metadata.rawArtistNames?.[0] ||
      metadata.artist
    }`.trim()
    try {
      let candidates = policy.searchCache.get(query)
      if (!candidates) {
        candidates = await searchQQMusicTracks(query, cookie)
        policy.searchCache.set(query, candidates)
      }
      selected = selectAnimeCoverCandidate(metadata, candidates)
      policy.searchFailures = 0
    } catch (error) {
      if (isQQMusicNetworkError(error)) {
        lastNetworkError = error
        policy.searchFailures++
        if (policy.searchFailures >= 1) policy.searchDisabled = true
      }
    }
  }

  const albums = []
  if (selected?.albumMid) {
    albums.push({
      albumMid: selected.albumMid,
      album: selected.album,
      strategy: 'anime-album',
      animeRelated: true,
    })
  }
  if (metadata.albumMid && !albums.some(album => album.albumMid === metadata.albumMid)) {
    albums.push({
      albumMid: metadata.albumMid,
      album: metadata.album,
      strategy: 'track-album',
      animeRelated: false,
    })
  }

  if (!policy.remoteDisabled) {
    for (const album of albums) {
      try {
        const cover = await fetchOfficialCover(album.albumMid, cookie)
        policy.remoteFailures = 0
        return { ...cover, ...album }
      } catch (error) {
        if (isQQMusicNetworkError(error)) {
          lastNetworkError = error
          policy.remoteFailures++
          if (policy.remoteFailures >= 1) {
            policy.remoteDisabled = true
            break
          }
        }
      }
    }
  }

  const fallback = await localCover(
    metadata,
    catalog,
    albums.map(album => album.albumMid),
  )
  if (fallback) return fallback
  if (lastNetworkError) throw lastNetworkError
  throw new Error('no valid album cover is available')
}

function decryptFlac (encrypted, ekey, expectedBytes) {
  const footer = qmcCrypto.QMCFooter.parse(encrypted.subarray(Math.max(0, encrypted.length - 1024)))
  const audioSize = footer ? encrypted.length - footer.size : encrypted.length
  if (footer) footer.free()
  if (expectedBytes && audioSize !== expectedBytes) {
    throw new Error(`cached FLAC is incomplete (${audioSize}/${expectedBytes} bytes)`)
  }
  const audio = Buffer.from(encrypted.subarray(0, audioSize))
  const cipher = new qmcCrypto.QMC2(ekey)
  try {
    cipher.decrypt(audio, 0)
  } finally {
    cipher.free()
  }
  if (audio.length < 4 || audio.toString('ascii', 0, 4) !== 'fLaC') {
    throw new Error('ekey did not decrypt the cached audio')
  }
  return audio
}

async function verifyFlac (audio, metadata) {
  const parsed = await parseBuffer(audio, { mimeType: 'audio/flac', size: audio.length }, {
    duration: true,
    skipCovers: true,
  })
  const duration = Number(parsed.format.duration)
  if (!parsed.format.lossless || !duration) {
    throw new Error('decrypted audio is not a complete lossless FLAC')
  }
  if (metadata.duration && Math.abs(duration - metadata.duration) > 3) {
    throw new Error(`audio duration does not match metadata (${duration.toFixed(2)}s/${metadata.duration}s)`)
  }
  return {
    duration,
    sampleRate: parsed.format.sampleRate,
    channels: parsed.format.numberOfChannels,
  }
}

async function writeSongPackage ({
  root,
  metadata,
  lyrics,
  cover,
  posterResolution,
  audio,
  audioInfo,
  lyricVerification,
  pronunciationVerification,
}) {
  const imageName = `cover${cover.extension}`
  const poster = posterResolution?.poster || null
  const posterName = poster ? `poster${poster.extension}` : ''
  const audioName = 'audio.flac'
  const verifiedAt = new Date().toISOString()
  const titleCleanup = metadata.titleCleanup || analyzeSongTitle(
    metadata.rawTitle || metadata.title,
    { language: metadata.language },
  )
  const song = {
    title: titleCleanup.title,
    subtitle: metadata.subtitle,
    artist: metadata.artist,
    latin_title: titleCleanup.title,
    latin_subtitle: metadata.subtitle,
    latin_artist: metadata.artist,
    language: metadata.language,
    cpm: lyrics.cpm,
    max_cpm: lyrics.maxCpm,
    duration: Math.ceil(audioInfo.duration),
    image: imageName,
    poster: posterName || undefined,
    audio: audioName,
    origin: metadata.origin || undefined,
    source: {
      service: 'qqmusic',
      song_mid: metadata.songMid,
      media_mid: metadata.mediaMid,
      imported_at: verifiedAt,
      verified_at: verifiedAt,
      origin_resolution: metadata.origin
        ? {
            version: SONG_ORIGIN_VERSION,
            resolved: true,
            checked_at: verifiedAt,
          }
        : undefined,
      title_cleanup: {
        version: SONG_TITLE_CLEANUP_VERSION,
      },
      artist_resolution: artistResolutionSourceInfo(
        metadata.artistResolution,
      ),
      checks: {
        metadata: true,
        title_original: true,
        artist_original: Boolean(metadata.artistResolution?.resolved),
        flac_size: true,
        flac_decode: true,
        cover_online: cover.verifiedOnline,
        poster_online: poster?.verifiedOnline || (
          posterResolution?.checked ? false : null
        ),
        lyrics_online: lyricVerification.checked ? lyricVerification.passed : null,
        pronunciation_online: pronunciationVerification.checked
          ? pronunciationVerification.passed
          : null,
        origin_original: metadata.origin ? true : null,
      },
      cover: coverSourceInfo(cover, posterResolution),
      lyrics_fingerprint: lyrics.fingerprint,
      pronunciation_fingerprint: lyrics.pronunciationFingerprint,
      quality: {
        version: lyrics.stats.qualityVersion,
        pronunciation_version: lyrics.stats.pronunciationVersion,
        playable_lines: lyrics.stats.playableLines,
        display_only_lines: lyrics.stats.displayOnlyLines,
        removed_metadata_lines:
          lyrics.stats.removedMainMetadataLines + lyrics.stats.removedRomaMetadataLines,
        pronunciation_timing_lines: lyrics.stats.timingValidatedLines,
        generated_pinyin_lines: lyrics.stats.generatedPinyinLines,
        song_specific_pronunciation_lines:
          lyrics.stats.songSpecificPronunciationLines,
        pronunciation_override_lines:
          lyrics.stats.pronunciationOverrideLines,
        pronunciation_offline_trusted:
          pronunciationVerification.offlineTrusted,
        pronunciation_online_local_coverage:
          pronunciationVerification.checked
            ? pronunciationVerification.localCoverage
            : null,
        pronunciation_online_official_coverage:
          pronunciationVerification.checked
            ? pronunciationVerification.officialCoverage
            : null,
        max_timing_delta_ms: lyrics.stats.maxTimingDeltaMs,
        official_text_replacements: lyrics.stats.officialTextReplacements,
        official_recovered_lines: lyrics.stats.officialRecoveredLines,
        official_reconciliation_confidence:
          lyrics.stats.officialReconciliationConfidence,
        online_local_coverage: lyricVerification.checked
          ? lyricVerification.localCoverage
          : null,
        online_official_coverage: lyricVerification.checked
          ? lyricVerification.officialCoverage
          : null,
      },
      pace: {
        version: PACE_METADATA_VERSION,
        model: 'demo-human-cadence',
        average: 'score-typing-time',
        peak: 'event-based-5-second-window',
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

  const directory = path.join(root, 'data', 'qqmusic')
  await fs.mkdir(directory, { recursive: true })
  const output = path.join(directory, `${metadata.songMid}.typingmania`)
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

function progressMessage (metadata, action) {
  return metadata?.title ? `${action}: ${metadata.title}` : action
}

function hasCurrentImportQuality (song) {
  const source = song?.source
  const checks = source?.checks || {}
  const quality = source?.quality || {}
  return (
    source?.service === 'qqmusic' &&
    Number(quality.version || 0) >= LYRIC_QUALITY_VERSION &&
    Number(quality.pronunciation_version || 0) >=
      PRONUNCIATION_QUALITY_VERSION &&
    Number(source.pace?.version || 0) >= PACE_METADATA_VERSION &&
    Number(quality.playable_lines || 0) > 0 &&
    Number(quality.display_only_lines || 0) === 0 &&
    /^[a-f0-9]{64}$/i.test(source.lyrics_fingerprint || '') &&
    /^[a-f0-9]{64}$/i.test(source.pronunciation_fingerprint || '') &&
    checks.metadata === true &&
    checks.flac_size === true &&
    checks.flac_decode === true &&
    Object.hasOwn(checks, 'cover_online') &&
    Object.hasOwn(checks, 'lyrics_online') &&
    checks.lyrics_online !== false &&
    Object.hasOwn(checks, 'pronunciation_online') &&
    checks.pronunciation_online !== false &&
    (
      lyricLanguage(song.language) !== 'ja' ||
      (
        Number(quality.song_specific_pronunciation_lines || 0) ===
          Number(quality.playable_lines || 0) &&
        (
          quality.pronunciation_offline_trusted === true ||
          checks.pronunciation_online === true
        )
      )
    )
  )
}

function hasCurrentCoverQuality (song) {
  return (
    !isAnimeThemeSong(song) ||
    (
      Number(song?.source?.cover?.version || 0) >= COVER_SELECTION_VERSION &&
      song?.source?.cover?.poster_checked === true
    )
  )
}

function hasCurrentOriginQuality (song) {
  return (
    !isAnimeThemeSong(song) ||
    !needsSongOriginRefresh(song)
  )
}

function hasCurrentArtistQuality (song) {
  const resolution = song?.source?.artist_resolution || {}
  if (Number(resolution.version || 0) < ORIGINAL_ARTIST_VERSION) return false
  if (resolution.resolved === true) return true
  const age = Date.now() - Date.parse(resolution.checked_at || 0)
  return age >= 0 && age < 7 * 24 * 60 * 60 * 1000
}

export async function importRecentQQMusicSongs ({
  root,
  limit = 20,
  coverRefreshOnly = false,
  onProgress = () => {},
}) {
  await qmcCrypto.ready
  const result = createImportBatchResult(limit)

  onProgress({ phase: 'session', message: 'Checking QQ Music session...', ...result })
  const session = await readQQMusicSession()
  try {
    onProgress({ phase: 'cache', message: 'Locating QQMusicCache...', ...result })
    const cache = await discoverQQMusicCache(root, session.cachePaths)
    const [tracks, qrcCatalog, coverCatalog, library] = await Promise.all([
      listRecentEncryptedTracks(cache.duty),
      buildQrcCatalog(cache.lyrics),
      buildCoverCatalog(cache.path),
      scanSongLibrary(root),
    ])
    await refreshQQMusicSongTitles({
      root,
      records: library.records,
    })
    if (!tracks.length) throw new QQMusicImportError('QQMUSIC_CACHE_EMPTY', 'No complete .mflac files were found in QQMusicCache.')

    const selectedSongIds = new Set()
    const selectedSongs = []
    const coverPolicy = createCoverPolicy()
    const originResolver = new SongOriginResolver({ root })
    const posterResolver = new AnimePosterResolver()
    const artistResolver = new OriginalArtistResolver({
      root,
      cookie: session.cookie,
    })
    let consecutiveNetworkFailures = 0
    const lyricNetworkCircuit = new NetworkCircuitBreaker(2)
    const existingMediaIds = new Set(
      library.records
        .map(song => song.source?.media_mid)
        .filter(Boolean),
    )
    const validatedMediaIds = new Set(
      library.records
        .filter(song => (
          hasCurrentImportQuality(song) &&
          hasCurrentCoverQuality(song) &&
          hasCurrentOriginQuality(song) &&
          hasCurrentArtistQuality(song) &&
          song.source.media_mid
        ))
        .map(song => song.source.media_mid),
    )
    const prioritizedTracks = prioritizeUnseenTracks(
      tracks,
      existingMediaIds,
    )

    for (const track of prioritizedTracks) {
      if (!coverRefreshOnly && !needsMoreNewSongs(result)) break
      result.inspected++
      let metadata = null
      try {
        if (coverRefreshOnly && !existingMediaIds.has(track.mediaMid)) {
          result.skipped++
          continue
        }
        if (validatedMediaIds.has(track.mediaMid)) {
          result.skipped++
          onProgress({
            phase: 'duplicate',
            message: `Already in library: cached track ${result.inspected}`,
            songTitle: null,
            ...result,
          })
          continue
        }

        onProgress({
          phase: 'metadata',
          message: `Checking cached track ${result.inspected}...`,
          songTitle: null,
          ...result,
        })
        metadata = await fetchTrackMetadata(track.mediaMid, session.cookie)
        metadata = await artistResolver.resolveMetadata(metadata)
        if (selectedSongIds.has(metadata.songMid)) {
          result.duplicates++
          continue
        }
        if (selectedSongs.some(song => songsAreEquivalent(song, metadata))) {
          result.duplicates++
          continue
        }

        // Existing songs receive only the inexpensive metadata/title/duration comparison.
        const existingSong = library.records.find(song => (
          (
            song.source?.service === 'qqmusic' &&
            song.source.song_mid === metadata.songMid
          ) ||
          songsAreEquivalent(song, metadata)
        ))
        const needsQualityRefresh = (
          existingSong?.source?.service === 'qqmusic' &&
          !hasCurrentImportQuality(existingSong)
        )
        const needsCoverRefresh = (
          existingSong?.source?.service === 'qqmusic' &&
          !hasCurrentCoverQuality(existingSong)
        )
        const needsOriginRefresh = (
          existingSong?.source?.service === 'qqmusic' &&
          !hasCurrentOriginQuality(existingSong)
        )
        const needsArtistRefresh = (
          existingSong?.source?.service === 'qqmusic' &&
          !hasCurrentArtistQuality(existingSong)
        )
        let workingSong = existingSong
        if (needsArtistRefresh && !needsQualityRefresh) {
          workingSong = await refreshPackedSongArtist(
            existingSong,
            metadata.artistResolution,
          )
          const existingIndex = library.records.indexOf(existingSong)
          if (existingIndex >= 0) library.records[existingIndex] = workingSong
        }
        if (
          existingSong &&
          !needsQualityRefresh &&
          !needsCoverRefresh &&
          !needsOriginRefresh
        ) {
          selectedSongIds.add(metadata.songMid)
          selectedSongs.push(metadata)
          if (needsArtistRefresh) {
            result.refreshed++
            validatedMediaIds.add(metadata.mediaMid)
          } else {
            result.skipped++
          }
          consecutiveNetworkFailures = 0
          onProgress({
            phase: 'duplicate',
            message: progressMessage(
              metadata,
              needsArtistRefresh
                ? 'Restored original artist name'
                : 'Already in library',
            ),
            songTitle: metadata.title,
            ...result,
          })
          continue
        }

        if (needsCoverRefresh && !needsQualityRefresh) {
          onProgress({
            phase: 'cover',
            message: progressMessage(metadata, 'Selecting anime-related cover'),
            songTitle: metadata.title,
            ...result,
          })
          const cover = await getVerifiedCover(
            metadata,
            coverCatalog,
            session.cookie,
            coverPolicy,
          )
          let refreshedSong = workingSong
          let resolvedOrigin = workingSong.origin || null
          if (needsOriginRefresh) {
            onProgress({
              phase: 'origin',
              message: progressMessage(metadata, 'Resolving original work title'),
              songTitle: metadata.title,
              ...result,
            })
            const origin = await originResolver.resolve(metadata, cover)
            if (origin || !originResolver.lastLookupFailed) {
              resolvedOrigin = origin
              refreshedSong = await refreshPackedSongOrigin(
                refreshedSong,
                origin,
              )
            }
          }
          const posterResolution = await posterResolver.resolve(resolvedOrigin)
          refreshedSong = await refreshPackedSongCover(
            refreshedSong,
            cover,
            posterResolution,
          )
          const existingIndex = library.records.indexOf(workingSong)
          if (existingIndex >= 0) library.records[existingIndex] = refreshedSong
          selectedSongIds.add(metadata.songMid)
          selectedSongs.push(metadata)
          validatedMediaIds.add(metadata.mediaMid)
          result.refreshed++
          consecutiveNetworkFailures = 0
          continue
        }

        if (needsOriginRefresh && !needsQualityRefresh) {
          onProgress({
            phase: 'origin',
            message: progressMessage(metadata, 'Resolving original work title'),
            songTitle: metadata.title,
            ...result,
          })
          const origin = await originResolver.resolve(
            metadata,
            workingSong.source?.cover,
          )
          if (origin || !originResolver.lastLookupFailed) {
            const refreshedSong = await refreshPackedSongOrigin(
              workingSong,
              origin,
            )
            const existingIndex = library.records.indexOf(workingSong)
            if (existingIndex >= 0) library.records[existingIndex] = refreshedSong
            validatedMediaIds.add(metadata.mediaMid)
            result.refreshed++
          } else {
            result.skipped++
          }
          selectedSongIds.add(metadata.songMid)
          selectedSongs.push(metadata)
          consecutiveNetworkFailures = 0
          continue
        }

        if (coverRefreshOnly) {
          result.skipped++
          consecutiveNetworkFailures = 0
          continue
        }

        const lyricCandidates = rankLyricsCandidates(metadata, qrcCatalog).slice(0, 8)
        if (!lyricCandidates.length) {
          throw new Error('matching QRC lyrics were not found')
        }

        onProgress({
          phase: 'lyrics',
          message: progressMessage(metadata, 'Reconciling lyrics'),
          songTitle: metadata.title,
          ...result,
        })
        const officialLyrics = lyricNetworkCircuit.open
          ? {
              checked: false,
              lines: [],
              reason: 'online lyric checks skipped after repeated network failures',
              readingChecked: false,
              readingLines: [],
              readingReason:
                'online pronunciation checks skipped after repeated network failures',
              networkFailed: false,
            }
          : await fetchOfficialLyrics(
              metadata.songMid,
              session.cookie,
              metadata,
            )
        if (officialLyrics.networkFailed) {
          lyricNetworkCircuit.recordFailure()
        } else {
          lyricNetworkCircuit.recordSuccess()
        }
        let chosenLyrics = null
        const lyricErrors = []
        for (const candidate of lyricCandidates) {
          try {
            const converted = await convertQrcFiles({
              crypto: qmcCrypto,
              mainFile: candidate.main,
              romaFile: candidate.roma,
              metadata,
              officialLines: officialLyrics.checked ? officialLyrics.lines : [],
            })
            const verification = compareOfficialLyrics(
              converted.verificationLines,
              officialLyrics,
            )
            if (verification.checked && !verification.passed) {
              throw new Error(
                `official text coverage is ` +
                `${(Math.min(verification.localCoverage, verification.officialCoverage) * 100).toFixed(1)}%`,
              )
            }
            const pronunciationVerification = compareOfficialPronunciation(
              converted.verificationReadings,
              officialLyrics,
              metadata.language,
            )
            pronunciationVerification.offlineTrusted =
              candidate.offlinePronunciationTrusted
            if (
              pronunciationVerification.checked &&
              !pronunciationVerification.passed
            ) {
              throw new Error(
                `official pronunciation coverage is ` +
                `${(Math.min(
                  pronunciationVerification.localCoverage,
                  pronunciationVerification.officialCoverage,
                ) * 100).toFixed(1)}%`,
              )
            }
            if (
              lyricLanguage(metadata.language) === 'ja' &&
              !pronunciationVerification.checked &&
              !candidate.offlinePronunciationTrusted
            ) {
              throw new Error(
                'Japanese pronunciation cannot be verified online or by exact offline QRC identity',
              )
            }
            const score = candidate.matchScore +
              (verification.checked
                ? (verification.localCoverage + verification.officialCoverage) * 1000
                : 0) +
              (pronunciationVerification.checked
                ? (
                    pronunciationVerification.localCoverage +
                    pronunciationVerification.officialCoverage
                  ) * 250
                : 0) -
              converted.stats.officialRecoveredLines * 2 -
              converted.stats.officialTextReplacements * 0.1
            if (!chosenLyrics || score > chosenLyrics.score) {
              chosenLyrics = {
                score,
                lyrics: converted,
                verification,
                pronunciationVerification,
              }
            }
            if (!officialLyrics.checked) break
          } catch (error) {
            lyricErrors.push(error.message)
          }
        }
        if (!chosenLyrics) {
          throw new Error(
            `no QRC candidate passed automatic lyric reconciliation` +
            (lyricErrors[0] ? ` (${lyricErrors[0]})` : ''),
          )
        }
        const lyrics = chosenLyrics.lyrics
        const lyricVerification = chosenLyrics.verification
        const pronunciationVerification =
          chosenLyrics.pronunciationVerification

        onProgress({
          phase: 'cover',
          message: progressMessage(metadata, 'Verifying album cover'),
          songTitle: metadata.title,
          ...result,
        })
        const cover = await getVerifiedCover(
          metadata,
          coverCatalog,
          session.cookie,
          coverPolicy,
        )
        if (isAnimeThemeSong(metadata)) {
          onProgress({
            phase: 'origin',
            message: progressMessage(metadata, 'Resolving original work title'),
            songTitle: metadata.title,
            ...result,
          })
          metadata.origin = await originResolver.resolve(metadata, cover)
        }
        const posterResolution = isAnimeThemeSong(metadata)
          ? await posterResolver.resolve(metadata.origin)
          : { checked: true, poster: null, reason: 'not-anime-related' }

        onProgress({
          phase: 'audio',
          message: progressMessage(metadata, 'Decrypting audio'),
          songTitle: metadata.title,
          ...result,
        })
        let ekey = await fetchTrackEkey({
          metadata,
          localFilename: track.localFilename,
          cookie: session.cookie,
          uin: session.uin,
        })
        const encrypted = await fs.readFile(track.filename)
        const expectedBytes = track.qualityPrefix === 'F0M0' ? metadata.expectedFlacBytes : 0
        const audio = decryptFlac(encrypted, ekey, expectedBytes)
        ekey = ''
        const audioInfo = await verifyFlac(audio, metadata)

        onProgress({
          phase: 'pack',
          message: progressMessage(metadata, 'Adding to library'),
          songTitle: metadata.title,
          ...result,
        })
        const written = await writeSongPackage({
          root,
          metadata,
          lyrics,
          cover,
          posterResolution,
          audio,
          audioInfo,
          lyricVerification,
          pronunciationVerification,
        })
        selectedSongIds.add(metadata.songMid)
        selectedSongs.push(metadata)
        validatedMediaIds.add(metadata.mediaMid)
        if (needsQualityRefresh) {
          const existingIndex = library.records.indexOf(existingSong)
          if (existingIndex >= 0) library.records[existingIndex] = written.song
          result.refreshed++
        } else {
          library.records.push(written.song)
          result.imported++
          result.selected = result.imported
        }
        consecutiveNetworkFailures = 0
      } catch (error) {
        result.failed++
        if (result.failures.length < 20) {
          result.failures.push({
            title: metadata?.title || `cached track ${result.inspected}`,
            reason: error.message,
          })
        }
        onProgress({
          phase: 'skipping',
          message: progressMessage(metadata, 'Skipped unusable track'),
          songTitle: metadata?.title || null,
          ...result,
        })
        if (isQQMusicNetworkError(error)) {
          consecutiveNetworkFailures++
          if (consecutiveNetworkFailures >= 2) {
            result.networkInterrupted = true
            break
          }
        } else {
          consecutiveNetworkFailures = 0
        }
      }
    }

    finishImportBatch(result, tracks.length)
    if (result.networkInterrupted) result.cacheExhausted = false
    onProgress({ phase: 'index', message: 'Refreshing song library...', ...result })
    const rebuilt = await rebuildSongIndex(root)
    result.librarySongs = rebuilt.records.length
    result.cacheMedia = cache.mediaCount
    result.cacheLyrics = cache.lyricCount
    if (result.networkInterrupted && !result.imported && !result.refreshed) {
      throw new QQMusicImportError(
        'QQMUSIC_NETWORK_UNAVAILABLE',
        'QQ Music could not be reached repeatedly. Try again later.',
      )
    }
    if (!result.imported && !result.refreshed && !result.skipped) {
      throw new QQMusicImportError(
        'QQMUSIC_NO_USABLE_TRACKS',
        'No usable cached tracks were found. Check that FLAC and QRC downloads are complete.',
      )
    }
    return result
  } finally {
    session.cookie = ''
    session.uin = ''
  }
}
