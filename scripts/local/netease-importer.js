import childProcess from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

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
import { refreshPackedSongPoster } from './cover-package.js'
import { retainVerifiableArtistNames } from './imported-artist.js'
import { loadBundledFallbackCover } from './fallback-artwork.js'
import { enrichImportedSong } from './imported-song-enrichment.js'
import { rebuildSongIndex, scanSongLibrary, songsAreEquivalent } from './library.js'
import {
  mergeCatalogMetadata,
  resolveImportedCatalogMatch,
  resolveImportedLyrics,
} from './local-folder-importer.js'
import {
  assertCompleteNeteaseCacheSize,
  decodeNeteaseCacheAudio,
} from './netease-cache.js'
import {
  fetchNeteaseCover,
  fetchNeteaseTrackDetail,
  metadataFromNeteaseRecord,
  NeteaseImportError,
} from './netease-api.js'
import { readNcmMetadata } from './ncm-container.js'
import { refreshPackedSongOrigin } from './song-origin-package.js'
import { parseLrc } from './timed-lyrics.js'
import { anyWindowsProcessRunning } from './windows-process.js'

const execFile = promisify(childProcess.execFile)
const NCM_TOOL = path.join('tools', 'importers', 'netease', 'ncmdump.exe')
const MAX_EXISTING_ORIGIN_REFRESHES = 3
const COMPLETE_EXTENSIONS = new Set([
  '.aac', '.flac', '.m4a', '.mp3', '.mp4', '.ncm', '.ogg', '.uc', '.uc!', '.wav',
])
const CLIENT_RESOURCE_DIRECTORIES = new Set(['resource', 'resources'])

function isNetworkError (error) {
  return (
    error?.name === 'TimeoutError' ||
    error?.name === 'AbortError' ||
    error instanceof TypeError ||
    /(?:fetch|network|socket|timed? ?out|econn|enotfound|dns)/iu
      .test(error?.message || '')
  )
}

async function directoryExists (directory) {
  try {
    return (await fs.stat(directory)).isDirectory()
  } catch {
    return false
  }
}

async function collectNeteaseMedia (
  directory,
  output,
  { depth = 0, maximumDepth = 8, remaining = 100_000 } = {},
) {
  if (depth > maximumDepth || remaining <= 0) return remaining
  let entries
  try {
    entries = await fs.readdir(directory, { withFileTypes: true })
  } catch {
    return remaining
  }
  for (const entry of entries) {
    if (--remaining < 0) break
    const filename = path.join(directory, entry.name)
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) {
      remaining = await collectNeteaseMedia(filename, output, {
        depth: depth + 1,
        maximumDepth,
        remaining,
      })
      continue
    }
    const extension = path.extname(entry.name).toLocaleLowerCase()
    if (!entry.isFile() || !COMPLETE_EXTENSIONS.has(extension)) continue
    // Both .uc and .uc! exist across desktop-client generations. The suffix
    // alone is not treated as proof of completeness: decoded media must parse
    // and match the provider duration before it becomes importable.
    try {
      const stat = await fs.stat(filename)
      if (stat.size < 4096) continue
      output.push({
        filename,
        extension,
        modifiedMs: stat.mtimeMs,
        bytes: stat.size,
        kind: extension === '.ncm'
          ? 'ncm'
            : extension === '.uc' || extension === '.uc!'
            ? 'cache'
            : 'audio',
      })
    } catch {}
  }
  return remaining
}

function candidateNeteaseDirectories (root) {
  const home = os.homedir()
  const values = [
    process.env.NETEASE_CLOUD_MUSIC_DIR,
    process.env.NETEASE_MUSIC_DIR,
    process.env.NETEASE_MUSIC_CACHE_DIR,
    path.join(root, 'NeteaseCloudMusic'),
    path.join(root, 'NetEaseCloudMusic'),
    path.join(root, 'CloudMusic'),
    path.join(root, '网易云音乐'),
    path.join(home, 'Music', '网易云音乐'),
    path.join(home, 'Music', 'CloudMusic'),
    path.join(home, 'Downloads', 'CloudMusic'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'NetEase', 'CloudMusic'),
    process.env.APPDATA && path.join(process.env.APPDATA, 'NetEase', 'CloudMusic'),
  ]
  return [...new Set(values.filter(Boolean).map(value => path.resolve(value)))]
}

export async function discoverNeteaseDownloads (root) {
  const directories = candidateNeteaseDirectories(root)
  for (let code = 'A'.charCodeAt(0); code <= 'Z'.charCodeAt(0); code++) {
    const drive = `${String.fromCharCode(code)}:\\`
    if (!await directoryExists(drive)) continue
    directories.push(
      path.join(drive, 'CloudMusic'),
      path.join(drive, 'NeteaseCloudMusic'),
      path.join(drive, '网易云音乐'),
      path.join(drive, 'Tools', 'CloudMusic'),
      path.join(drive, 'Apps', 'CloudMusic'),
      path.join(drive, 'Applications', 'CloudMusic'),
      path.join(drive, 'Program Files', 'NetEase', 'CloudMusic'),
      path.join(drive, 'Program Files (x86)', 'NetEase', 'CloudMusic'),
    )
  }
  const tracks = []
  for (const directory of directories) {
    if (await directoryExists(directory)) {
      await collectNeteaseMedia(directory, tracks)
    }
  }
  tracks.sort((left, right) => right.modifiedMs - left.modifiedMs)
  const seen = new Set()
  let ignoredClientResources = 0
  return {
    directories,
    tracks: tracks.filter(track => {
      const segments = path.resolve(track.filename)
        .split(path.sep)
        .map(segment => segment.toLocaleLowerCase())
      if (segments.some(segment => CLIENT_RESOURCE_DIRECTORIES.has(segment))) {
        ignoredClientResources++
        return false
      }
      const key = path.resolve(track.filename).toLocaleLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }),
    ignoredClientResources,
  }
}

async function findLocalLyrics (trackId, audioFilename, directories) {
  const stem = path.basename(audioFilename, path.extname(audioFilename))
  const names = [
    trackId && `${trackId}.lrc`,
    trackId && `lyric-${trackId}.lrc`,
    trackId && `${trackId}.txt`,
    `${stem}.lrc`,
  ].filter(Boolean)
  const roots = [
    path.dirname(audioFilename),
    ...directories.flatMap(directory => [
      directory,
      path.join(directory, 'Lyrics'),
      path.join(directory, 'lyrics'),
      path.join(directory, 'webdata', 'lyric'),
    ]),
  ]
  for (const root of roots) {
    for (const name of names) {
      try {
        const text = await fs.readFile(path.join(root, name), 'utf8')
        if (parseLrc(text).length >= 5) return { main: text, romanized: '' }
      } catch {}
    }
  }
  return null
}

async function convertedAudioPath (directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const matches = entries.filter(entry => (
    entry.isFile() && ['.flac', '.mp3'].includes(
      path.extname(entry.name).toLocaleLowerCase(),
    )
  ))
  if (matches.length !== 1) {
    throw new Error('ncmdump did not produce exactly one audio file')
  }
  return path.join(directory, matches[0].name)
}

async function convertNcm (root, track, signal) {
  const tool = path.join(root, NCM_TOOL)
  try {
    if (!(await fs.stat(tool)).isFile()) throw new Error()
  } catch {
    throw new NeteaseImportError(
      'NETEASE_COMPONENT_MISSING',
      'The bundled ncmdump component is missing.',
    )
  }
  const staging = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-netease-'))
  try {
    await execFile(tool, [track.filename, '-o', staging], {
      windowsHide: true,
      timeout: 90_000,
      maxBuffer: 2 * 1024 * 1024,
      signal,
    })
    const filename = await convertedAudioPath(staging)
    return {
      audio: await fs.readFile(filename),
      filename,
      dispose: () => fs.rm(staging, { recursive: true, force: true }),
    }
  } catch (error) {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => {})
    throw error
  }
}

function cacheTrackId (filename) {
  return path.basename(filename).match(/(?:^|\D)(\d{5,})(?:\D|$)/u)?.[1] || ''
}

function containerMetadata (container) {
  return {
    title: container.title,
    rawTitle: container.title,
    subtitle: '',
    artist: container.artist,
    artistNames: container.artistNames,
    album: container.album,
    albumId: container.albumId,
    albumPic: container.albumPic,
    duration: container.duration,
    language: 'U',
  }
}

function audioMetadata (audioInfo, filename) {
  const common = audioInfo.parsed.common || {}
  const artistNames = (common.artists?.length
    ? common.artists
    : [common.artist || common.albumartist])
    .flatMap(value => String(value || '').split(/\s*[;/]\s*/u))
    .map(value => value.trim())
    .filter(Boolean)
  const title = String(
    common.title || path.basename(filename, path.extname(filename)),
  ).trim()
  return {
    title,
    rawTitle: title,
    subtitle: '',
    artist: artistNames.join(' / '),
    artistNames,
    album: String(common.album || '').trim(),
    albumId: '',
    albumPic: '',
    duration: audioInfo.duration,
    language: 'U',
  }
}

async function prepareTrack (root, track, identified = {}, signal) {
  if (track.kind === 'ncm') {
    const container = identified.container || await readNcmMetadata(track.filename)
    const converted = await convertNcm(root, track, signal)
    return {
      ...converted,
      trackId: container.trackId,
      metadata: containerMetadata(container),
      catalogMatch: {
        service: 'netease',
        id: String(container.trackId),
      },
      sourceFormat: 'ncm',
      checks: { ncm_container: true },
    }
  }
  if (track.kind === 'cache') {
    const trackId = cacheTrackId(track.filename)
    if (!trackId) throw new Error('The complete cache filename has no track ID')
    const decoded = decodeNeteaseCacheAudio(await fs.readFile(track.filename))
    const filename = `${track.filename}${decoded.extension}`
    const audioInfo = await inspectImportedAudio(decoded.audio, filename)
    const detail = await fetchNeteaseTrackDetail(trackId)
    if (!detail) throw new Error('NetEase cache metadata is unavailable')
    assertCompleteNeteaseCacheSize(detail, decoded.audio.length)
    const metadata = metadataFromNeteaseRecord(detail, audioMetadata(audioInfo, filename))
    await inspectImportedAudio(decoded.audio, filename, metadata.duration)
    return {
      audio: decoded.audio,
      filename,
      trackId,
      metadata,
      audioInfo,
      catalogMatch: { service: 'netease', id: String(trackId) },
      sourceFormat: 'uc-cache',
      checks: { cache_complete: true },
      dispose: async () => {},
    }
  }

  const audio = await fs.readFile(track.filename)
  const audioInfo = await inspectImportedAudio(audio, track.filename)
  let metadata = audioMetadata(audioInfo, track.filename)
  if (!metadata.title || !metadata.artist) {
    throw new Error('The ordinary download lacks title or artist tags')
  }
  const matched = await resolveImportedCatalogMatch({
    metadata,
    provider: 'local-files',
  })
  if (!matched?.id) throw new Error('The ordinary download could not be matched safely')
  metadata = mergeCatalogMetadata(metadata, matched.metadata)
  await inspectImportedAudio(audio, track.filename, metadata.duration)
  return {
    audio,
    filename: track.filename,
    trackId: matched.service === 'netease'
      ? String(matched.id)
      : `${matched.service}:${matched.id}`,
    metadata,
    audioInfo,
    catalogMatch: matched,
    sourceFormat: track.extension.slice(1),
    checks: { ordinary_download: true },
    dispose: async () => {},
  }
}

async function identifyTrack (track) {
  if (track.kind === 'ncm') {
    const container = await readNcmMetadata(track.filename)
    return {
      trackId: String(container.trackId || ''),
      metadata: containerMetadata(container),
      container,
    }
  }
  if (track.kind === 'cache') {
    return { trackId: cacheTrackId(track.filename) }
  }
  return { trackId: '' }
}

export async function importRecentNeteaseSongs ({
  root,
  limit = 10,
  onProgress = () => {},
  shouldCancel = () => false,
  signal,
}) {
  const result = createImportBatchResult(limit)
  if (process.platform !== 'win32') {
    throw new NeteaseImportError(
      'NETEASE_WINDOWS_REQUIRED',
      'NetEase Cloud Music import currently requires Windows.',
    )
  }
  onProgress({ phase: 'session', message: 'Checking NetEase Cloud Music...', ...result })
  if (!await anyWindowsProcessRunning(['cloudmusic.exe'])) {
    throw new NeteaseImportError(
      'NETEASE_NOT_RUNNING',
      'Start NetEase Cloud Music and sign in, then try again.',
    )
  }

  onProgress({ phase: 'cache', message: 'Locating complete downloads and cache media...', ...result })
  const discovered = await discoverNeteaseDownloads(root)
  if (!discovered.tracks.length) {
    throw new NeteaseImportError(
      'NETEASE_CACHE_NOT_FOUND',
      'No complete NetEase downloads or cache media were found.',
    )
  }
  const library = await scanSongLibrary(root)
  const existingTrackIds = new Set(
    library.records
      .filter(song => song.source?.service === 'netease')
      .map(song => String(song.source?.track_id || ''))
      .filter(Boolean),
  )
  let consecutiveNetworkFailures = 0
  let existingOriginRefreshes = 0

  for (const track of discovered.tracks) {
    if (shouldCancel()) {
      result.cancelled = true
      break
    }
    if (!needsMoreNewSongs(result)) break
    result.inspected++
    let metadata = null
    let prepared = null
    let stage = 'metadata'
    try {
      onProgress({ phase: stage, number: result.inspected, ...result })
      const identified = await identifyTrack(track)
      prepared = (
        identified.trackId &&
        identified.metadata &&
        existingTrackIds.has(identified.trackId)
      )
        ? {
            trackId: identified.trackId,
            metadata: identified.metadata,
            dispose: async () => {},
          }
        : await prepareTrack(root, track, identified, signal)
      metadata = prepared.metadata
      if (existingTrackIds.has(prepared.trackId)) {
        const existingSong = library.records.find(song => (
          song.source?.service === 'netease' &&
          String(song.source?.track_id || '') === prepared.trackId
        ))
        if (
          existingSong &&
          !existingSong.origin &&
          existingOriginRefreshes < MAX_EXISTING_ORIGIN_REFRESHES
        ) {
          existingOriginRefreshes++
          const enrichment = await enrichImportedSong({
            root,
            metadata,
            cover: existingSong.source?.cover || null,
            onOrigin: value => onProgress({
              phase: 'origin',
              songTitle: value.title,
              ...result,
            }),
          })
          if (enrichment.metadata.origin) {
            let refreshed = await refreshPackedSongOrigin(
              existingSong,
              enrichment.metadata.origin,
            )
            refreshed = await refreshPackedSongPoster(
              refreshed,
              enrichment.posterResolution,
            )
            const index = library.records.indexOf(existingSong)
            if (index >= 0) library.records[index] = refreshed
            result.refreshed++
          } else {
            result.skipped++
          }
        } else {
          result.skipped++
        }
        continue
      }
      if (library.records.some(song => songsAreEquivalent(song, metadata))) {
        result.duplicates++
        continue
      }

      if (track.kind === 'ncm') {
        const detail = await fetchNeteaseTrackDetail(prepared.trackId).catch(() => null)
        if (detail) metadata = metadataFromNeteaseRecord(detail, metadata)
      }
      const independentCatalog = await resolveImportedCatalogMatch({
        metadata,
        provider: 'netease',
        excludeServices: ['netease'],
      }).catch(() => null)
      if (independentCatalog) {
        metadata = mergeCatalogMetadata(
          metadata,
          independentCatalog.metadata,
        )
      }
      stage = 'lyrics'
      onProgress({ phase: stage, songTitle: metadata.title, ...result })
      const localLyricResource = await findLocalLyrics(
        prepared.trackId,
        track.filename,
        discovered.directories,
      )
      const lyricResolution = await resolveImportedLyrics({
        metadata,
        localLrc: localLyricResource?.main || '',
        matched: prepared.catalogMatch || {
          service: 'netease',
          id: prepared.trackId,
        },
      })
      metadata = retainVerifiableArtistNames(metadata)
      const lyrics = lyricResolution.lyrics

      stage = 'audio'
      onProgress({ phase: stage, songTitle: metadata.title, ...result })
      const audioInfo = prepared.audioInfo || await inspectImportedAudio(
        prepared.audio,
        prepared.filename,
        metadata.duration,
      )
      metadata.duration = audioInfo.duration

      stage = 'cover'
      onProgress({ phase: stage, songTitle: metadata.title, ...result })
      let cover = embeddedArtwork(audioInfo)
      if (!cover && metadata.albumPic) {
        cover = await fetchNeteaseCover(metadata.albumPic).catch(() => null)
      }
      if (!cover) cover = await loadBundledFallbackCover(root)

      stage = 'origin'
      const enrichment = await enrichImportedSong({
        root,
        metadata,
        cover,
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
        provider: 'netease',
        trackId: prepared.trackId,
        metadata,
        lyrics,
        cover,
        posterResolution: enrichment.posterResolution,
        audio: prepared.audio,
        audioInfo,
        source: {
          netease_track_id: prepared.trackId,
          mv_id: metadata.mvId || undefined,
          source_format: prepared.sourceFormat,
          checks: {
            ...prepared.checks,
            lyrics_online: lyricResolution.online,
            lyric_service: lyricResolution.service,
            catalog_service: prepared.catalogMatch?.service || 'netease',
          },
        },
      })
      library.records.push(written.song)
      existingTrackIds.add(prepared.trackId)
      result.imported++
      result.selected = result.imported
      consecutiveNetworkFailures = 0
    } catch (error) {
      if (shouldCancel() || error?.name === 'AbortError') {
        result.cancelled = true
        break
      }
      recordImportFailure(result, {
        error,
        stage,
        title: metadata?.title || path.basename(track.filename),
      })
      onProgress({ phase: 'skipping', songTitle: metadata?.title || null, ...result })
      if (isNetworkError(error)) {
        consecutiveNetworkFailures++
        if (consecutiveNetworkFailures >= 2) {
          result.networkInterrupted = true
          break
        }
      } else {
        consecutiveNetworkFailures = 0
      }
    } finally {
      await prepared?.dispose?.().catch(() => {})
    }
  }

  finishImportBatch(result, discovered.tracks.length)
  if (result.networkInterrupted) result.cacheExhausted = false
  onProgress({ phase: 'index', message: 'Refreshing song library...', ...result })
  const rebuilt = await rebuildSongIndex(root)
  result.librarySongs = rebuilt.records.length
  result.cacheMedia = discovered.tracks.filter(track => track.kind === 'cache').length
  result.downloadMedia = discovered.tracks.length - result.cacheMedia
  result.ignoredClientResources = discovered.ignoredClientResources
  if (
    !result.cancelled &&
    !result.imported &&
    !result.refreshed &&
    !result.skipped &&
    !result.duplicates
  ) {
    const error = new NeteaseImportError(
      result.networkInterrupted
        ? 'NETEASE_NETWORK_UNAVAILABLE'
        : 'NETEASE_NO_USABLE_TRACKS',
      result.networkInterrupted
        ? 'NetEase services could not be reached repeatedly.'
        : 'No playable complete NetEase media passed every check.',
    )
    error.result = result
    throw error
  }
  return result
}
