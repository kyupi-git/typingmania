import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import {
  createImportBatchResult,
  finishImportBatch,
  needsMoreNewSongs,
  recordImportFailure,
} from './import-batch.js'
import {
  embeddedArtwork,
  inspectImportedAudio,
  writeImportedSongPackage,
} from './imported-media-package.js'
import { retainVerifiableArtistNames } from './imported-artist.js'
import {
  enrichImportedSong,
  matchQQMusicTrack,
} from './imported-song-enrichment.js'
import { rebuildSongIndex, scanSongLibrary, songsAreEquivalent } from './library.js'
import { resolveKugouLyrics } from './kugou-api.js'
import { resolveLrclibLyrics } from './lrclib-api.js'
import { loadBundledFallbackCover } from './fallback-artwork.js'
import {
  mergeCatalogMetadata,
  resolveImportedCatalogMatch,
} from './catalog-resolver.js'
import {
  collectFiles,
  IMPORTABLE_AUDIO_EXTENSIONS,
  IMPORTABLE_FOLDER_EXTENSIONS,
} from './media-file-discovery.js'
import {
  fetchNeteaseCover,
  fetchNeteaseLyrics,
  resolveNeteaseLyrics,
} from './netease-api.js'
import {
  rankedNetworkSources,
  tryNetworkSources,
} from './network-source-planner.js'
import { fetchCoverArtArchive } from './musicbrainz-api.js'
import { lyricLanguage } from './pronunciation.js'
import { timedLyricsAgreement } from './lyrics-quality.js'
import {
  alignTrackSpecificReadings,
  convertTimedLyrics,
  parseLrc,
} from './timed-lyrics.js'
import {
  fetchOfficialCover,
  fetchBestQQMusicLyrics,
  validImage,
} from './qqmusic-api.js'
import {
  disposeUploadSession,
  getUploadSession,
  sealUploadSession,
} from './upload-sessions.js'

export class LocalFolderImportError extends Error {
  constructor (code, message = code, result = null) {
    super(message)
    this.name = 'LocalFolderImportError'
    this.code = code
    this.result = result
  }
}

export {
  mergeCatalogMetadata,
  resolveImportedCatalogMatch,
} from './catalog-resolver.js'

function artistNames (common) {
  const values = common.artists?.length
    ? common.artists
    : [common.artist || common.albumartist]
  return values
    .flatMap(value => String(value || '').split(/\s*[;/]\s*/u))
    .map(value => value.trim())
    .filter(Boolean)
}

function metadataFromAudio (audioInfo, filename) {
  const common = audioInfo.parsed.common || {}
  const artists = artistNames(common)
  const fallbackTitle = path.basename(filename, path.extname(filename))
    .replace(/^\d+\s*[-._]\s*/u, '')
  const title = String(common.title || fallbackTitle).trim()
  return {
    title,
    rawTitle: title,
    subtitle: '',
    artist: artists.join(' / '),
    artistNames: artists,
    album: String(common.album || '').trim(),
    albumId: '',
    albumPic: '',
    duration: audioInfo.duration,
    language: 'U',
  }
}

function sameStem (left, right) {
  return path.basename(left, path.extname(left)).toLocaleLowerCase() ===
    path.basename(right, path.extname(right)).toLocaleLowerCase()
}

async function companionLyrics (audioFilename, files) {
  const sameDirectory = files.filter(file => (
    path.dirname(file.filename).toLocaleLowerCase() ===
      path.dirname(audioFilename).toLocaleLowerCase()
  ))
  const exact = sameDirectory
    .filter(file => (
      ['.lrc', '.txt'].includes(file.extension) &&
      sameStem(file.filename, audioFilename)
    ))
    .sort((left, right) => (
      Number(right.extension === '.lrc') - Number(left.extension === '.lrc')
    ))[0]
  if (!exact) return ''
  return fs.readFile(exact.filename, 'utf8')
}

function imageType (buffer, extension) {
  if (!validImage(buffer)) return null
  const value = extension === '.jpeg' ? '.jpg' : extension
  return ['.jpg', '.png', '.webp'].includes(value) ? value : '.jpg'
}

async function companionCover (audioFilename, files) {
  const directory = path.dirname(audioFilename).toLocaleLowerCase()
  const images = files.filter(file => (
    path.dirname(file.filename).toLocaleLowerCase() === directory &&
    ['.jpg', '.jpeg', '.png', '.webp'].includes(file.extension)
  ))
  images.sort((left, right) => {
    const leftExact = sameStem(left.filename, audioFilename) ? 2 :
      /^(?:cover|folder|front)$/iu.test(path.basename(left.filename, left.extension)) ? 1 : 0
    const rightExact = sameStem(right.filename, audioFilename) ? 2 :
      /^(?:cover|folder|front)$/iu.test(path.basename(right.filename, right.extension)) ? 1 : 0
    return rightExact - leftExact || right.bytes - left.bytes
  })
  for (const image of images) {
    const buffer = await fs.readFile(image.filename)
    const extension = imageType(buffer, image.extension)
    if (extension) {
      return {
        buffer,
        extension,
        verifiedOnline: false,
        strategy: 'local-companion-artwork',
      }
    }
  }
  return null
}

function detectLyricLanguage (metadata, mainLines) {
  const family = lyricLanguage('U', mainLines.map(line => line.text).join('\n'))
  metadata.language = ({ zh: 'ZH', ja: 'JP', en: 'EN' })[family]
}

function convertTextResource ({ metadata, localLrc, resource, service }) {
  const durationMs = metadata.duration * 1000
  const localLines = localLrc
    ? parseLrc(localLrc, { durationMs })
    : []
  if (service === 'qqmusic') {
    const providerMain = resource.lines || []
    const useLocal = localLines.length && (
      !providerMain.length ||
      timedLyricsAgreement(localLines, providerMain, { metadata }).confident
    )
    const mainLines = useLocal ? localLines : providerMain
    if (!mainLines.length) throw new Error('Timed LRC lyrics could not be matched')
    detectLyricLanguage(metadata, mainLines)
    const readingLines = useLocal && resource.readingLines.length
      ? alignTrackSpecificReadings({
          targetLines: mainLines,
          sourceLines: providerMain,
          sourceReadings: resource.readingLines,
        })
      : resource.readingLines
    return convertTimedLyrics({
      mainLines,
      readingLines,
      metadata,
      readingSource: 'qqmusic-roma-crosscheck',
    })
  }

  const providerMain = resource?.mainLines || parseLrc(resource?.main || '', {
    durationMs,
  })
  const useLocal = localLines.length && (
    !providerMain.length ||
    timedLyricsAgreement(localLines, providerMain, { metadata }).confident
  )
  const mainLines = useLocal ? localLines : providerMain
  if (!mainLines.length) throw new Error('Timed LRC lyrics could not be matched')
  detectLyricLanguage(metadata, mainLines)
  const providerReadings = resource?.readingLines || parseLrc(
    resource?.romanized || '',
    { durationMs },
  )
  const readingLines = useLocal && providerReadings.length
    ? alignTrackSpecificReadings({
        targetLines: mainLines,
        sourceLines: providerMain,
        sourceReadings: providerReadings,
      })
    : providerReadings
  return convertTimedLyrics({
    mainLines,
    readingLines,
    metadata,
    readingSource: `${service}-timed-reading`,
  })
}

export async function resolveImportedLyrics ({
  metadata,
  localLrc,
  matched,
  qqCookie = '',
}) {
  let offlineError = null
  let offlineResolution = null
  if (localLrc) {
    try {
      offlineResolution = {
        lyrics: convertTextResource({
          metadata,
          localLrc,
          resource: { main: localLrc, romanized: '' },
          service: 'local',
        }),
        online: false,
        service: 'local',
      }
    } catch (error) {
      offlineError = error
    }
  }

  const sources = []
  const addQQ = (
    id,
    cookie = qqCookie,
    preferredSongId = matched?.metadata?.songId || '',
  ) => sources.push({
    id: 'qqmusic-lyrics',
    priority: matched?.service === 'qqmusic' ? 45 : 35,
    regionalPriority: {
      cn: 50,
      hk: 15,
      tw: 10,
      jp: -10,
      us: -15,
      global: 0,
    },
    run: async () => {
      let songId = id
      let numericSongId = preferredSongId
      if (!songId) {
        const detail = await matchQQMusicTrack(metadata, { qqCookie: cookie })
        songId = detail?.songMid
        numericSongId = detail?.songId || ''
      }
      if (!songId) return null
      const resource = await fetchBestQQMusicLyrics({
        songMid: songId,
        songId: numericSongId,
        cookie,
        metadata,
      })
      return {
        lyrics: convertTextResource({
          metadata,
          localLrc,
          resource,
          service: 'qqmusic',
        }),
        online: resource.checked,
        service: 'qqmusic',
      }
    },
  })
  const addNetease = id => sources.push({
    id: 'netease-lyrics',
    priority: matched?.service === 'netease' ? 45 : 30,
    regionalPriority: {
      cn: 42,
      hk: 10,
      tw: 8,
      jp: -10,
      us: -15,
      global: 0,
    },
    run: async () => {
      const resource = await resolveNeteaseLyrics(metadata, id)
      return {
        lyrics: convertTextResource({
          metadata,
          localLrc,
          resource,
          service: 'netease',
        }),
        online: true,
        service: 'netease',
      }
    },
  })
  addQQ(matched?.service === 'qqmusic' ? matched.id : '')
  addNetease(matched?.service === 'netease' ? matched.id : '')
  sources.push({
    id: 'kugou-lyrics',
    priority: 25,
    regionalPriority: {
      cn: 34,
      hk: 8,
      tw: 5,
      jp: -15,
      us: -20,
      global: -5,
    },
    run: async () => {
      const resource = await resolveKugouLyrics(metadata)
      return {
        lyrics: convertTextResource({
          metadata,
          localLrc,
          resource,
          service: 'kugou',
        }),
        online: true,
        service: 'kugou',
      }
    },
  })
  sources.push({
    id: 'lrclib-lyrics',
    priority: 10,
    regionalPriority: {
      cn: 0,
      hk: 30,
      tw: 30,
      jp: 34,
      us: 42,
      global: 35,
    },
    run: async () => {
      const resource = await resolveLrclibLyrics(metadata)
      return {
        lyrics: convertTextResource({
          metadata,
          localLrc,
          resource,
          service: 'lrclib',
        }),
        online: true,
        service: 'lrclib',
      }
    },
  })
  try {
    // A valid local sidecar is a safe fallback, but it must not prevent an
    // online source from detecting that the file belongs to another song.
    // Bound validation to the two best live/regional routes so an offline
    // import does not wait through every unavailable service.
    const candidates = offlineResolution
      ? rankedNetworkSources(sources).slice(0, 2)
      : sources
    const resolved = await tryNetworkSources(candidates)
    if (resolved?.value) return resolved.value
  } catch (error) {
    if (!offlineResolution && !offlineError) throw error
  }
  if (offlineResolution) return offlineResolution
  throw offlineError || new Error('Timed LRC lyrics could not be matched')
}

function fallbackTrackId (metadata, audio) {
  return crypto
    .createHash('sha256')
    .update(`${metadata.title}\n${metadata.artist}\n${metadata.album}\n`)
    .update(audio.subarray(0, Math.min(audio.length, 1024 * 1024)))
    .digest('hex')
    .slice(0, 32)
}

export async function importMediaDirectorySongs ({
  root,
  directory,
  provider = 'local-files',
  qqCookie = '',
  limit = 10,
  onProgress = () => {},
  shouldCancel = () => false,
}) {
  const result = createImportBatchResult(limit)
  onProgress({ phase: 'cache', message: 'Scanning complete local media...', ...result })
  const files = await collectFiles(directory, {
    extensions: IMPORTABLE_FOLDER_EXTENSIONS,
    maximumDepth: 24,
    maximumEntries: 100_000,
  })
  const mediaFiles = files
    .filter(file => IMPORTABLE_AUDIO_EXTENSIONS.has(file.extension))
    .sort((left, right) => right.modifiedMs - left.modifiedMs)
  if (!mediaFiles.length) {
    throw new LocalFolderImportError(
      'LOCAL_FOLDER_EMPTY',
      'No supported audio files were found in the selected folder.',
    )
  }
  const library = await scanSongLibrary(root)
  const existingIds = new Set(
    library.records
      .filter(song => song.source?.service === provider)
      .map(song => String(song.source?.track_id || ''))
      .filter(Boolean),
  )

  for (const file of mediaFiles) {
    if (shouldCancel()) {
      result.cancelled = true
      break
    }
    if (!needsMoreNewSongs(result)) break
    result.inspected++
    let metadata = null
    let stage = 'metadata'
    try {
      onProgress({ phase: 'metadata', number: result.inspected, ...result })
      const audio = await fs.readFile(file.filename)
      const audioInfo = await inspectImportedAudio(audio, file.filename)
      metadata = metadataFromAudio(audioInfo, file.filename)
      if (!metadata.title || !metadata.artist) {
        throw new Error('Title and artist tags are required for safe lyric matching')
      }
      const matched = await resolveImportedCatalogMatch({
        metadata,
        provider,
        qqCookie,
      }).catch(() => null)
      if (provider === 'qqmusic' && !matched) {
        throw new Error('The ordinary download could not be matched safely to QQ Music')
      }
      if (matched) metadata = mergeCatalogMetadata(metadata, matched.metadata)
      const trackId = String(matched?.id || fallbackTrackId(metadata, audio))
      if (existingIds.has(trackId)) {
        result.skipped++
        continue
      }
      if (library.records.some(song => songsAreEquivalent(song, metadata))) {
        result.duplicates++
        continue
      }

      stage = 'lyrics'
      onProgress({ phase: stage, songTitle: metadata.title, ...result })
      const localLrc = await companionLyrics(file.filename, files)
      const lyricResolution = await resolveImportedLyrics({
        metadata,
        localLrc,
        matched,
        qqCookie,
      })
      metadata = retainVerifiableArtistNames(metadata)

      stage = 'cover'
      onProgress({ phase: stage, songTitle: metadata.title, ...result })
      let cover = embeddedArtwork(audioInfo)
      if (!cover) cover = await companionCover(file.filename, files)
      if (!cover && matched?.service === 'qqmusic' && metadata.albumMid) {
        cover = await fetchOfficialCover(metadata.albumMid, qqCookie).catch(() => null)
      }
      if (!cover && matched?.service === 'netease' && metadata.albumPic) {
        cover = await fetchNeteaseCover(metadata.albumPic).catch(() => null)
      }
      if (
        !cover &&
        matched?.metadata?.musicBrainzReleaseId
      ) {
        cover = await fetchCoverArtArchive(
          matched.metadata.musicBrainzReleaseId,
        ).catch(() => null)
      }
      if (!cover) cover = await loadBundledFallbackCover(root)

      stage = 'origin'
      const enrichment = await enrichImportedSong({
        root,
        metadata,
        cover,
        qqCookie,
        onOrigin: value => onProgress({
          phase: 'origin',
          songTitle: value.title,
          ...result,
        }),
      })
      metadata = enrichment.metadata

      stage = 'pack'
      onProgress({ phase: stage, songTitle: metadata.title, ...result })
      const written = await writeImportedSongPackage({
        root,
        provider,
        trackId,
        metadata,
        lyrics: lyricResolution.lyrics,
        cover,
        posterResolution: enrichment.posterResolution,
        audio,
        audioInfo,
        source: {
          source_format: file.extension.slice(1),
          catalog_service: matched?.service || null,
          checks: {
            lyrics_online: lyricResolution.online,
            lyric_service: lyricResolution.service,
            cover_verified:
              cover.strategy !== 'bundled-neutral-artwork',
            source_file_copy: true,
          },
        },
      })
      library.records.push(written.song)
      existingIds.add(trackId)
      result.imported++
      result.selected = result.imported
    } catch (error) {
      recordImportFailure(result, {
        error,
        stage,
        title: metadata?.title || path.basename(file.filename),
      })
      onProgress({ phase: 'skipping', songTitle: metadata?.title || null, ...result })
    }
  }

  finishImportBatch(result, mediaFiles.length)
  onProgress({ phase: 'index', message: 'Refreshing song library...', ...result })
  const rebuilt = await rebuildSongIndex(root)
  result.librarySongs = rebuilt.records.length
  result.cacheMedia = mediaFiles.length
  if (
    !result.cancelled &&
    !result.imported &&
    !result.skipped &&
    !result.duplicates
  ) {
    throw new LocalFolderImportError(
      'LOCAL_FOLDER_NO_USABLE_TRACKS',
      'No local audio passed the metadata, timed lyric, and pronunciation checks.',
      result,
    )
  }
  return result
}

export async function importLocalFolderSongs (options) {
  const session = getUploadSession(options.sessionId, { requireOpen: true })
  if (!session) {
    throw new LocalFolderImportError(
      'LOCAL_FOLDER_SESSION_INVALID',
      'The selected local folder session has expired.',
    )
  }
  sealUploadSession(session)
  try {
    return await importMediaDirectorySongs({
      ...options,
      directory: session.directory,
      provider: 'local-files',
    })
  } finally {
    await disposeUploadSession(session)
  }
}
