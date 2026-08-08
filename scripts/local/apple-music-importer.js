import childProcess from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

import {
  appleMusicStorefrontLanguage,
  AppleMusicImportError,
  normalizeAppleMusicUrls,
} from './apple-music-url.js'
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
import { loadBundledFallbackCover } from './fallback-artwork.js'
import { enrichImportedSong } from './imported-song-enrichment.js'
import { rebuildSongIndex, scanSongLibrary, songsAreEquivalent } from './library.js'
import {
  mergeCatalogMetadata,
  resolveImportedCatalogMatch,
} from './catalog-resolver.js'
import {
  fetchNeteaseLyrics,
  searchNeteaseTrack,
} from './netease-api.js'
import { lyricLanguage } from './pronunciation.js'
import {
  alignTrackSpecificReadings,
  convertTimedLyrics,
  parseLrc,
} from './timed-lyrics.js'
import { anyWindowsProcessRunning } from './windows-process.js'

const execFile = promisify(childProcess.execFile)
const APPLE_RUNTIME = path.join('tools', 'importers', 'apple-music', 'runtime')
const APPLE_RUNNER = path.join('tools', 'importers', 'apple-music', 'run-gamdl.py')
const APPLE_COOKIE_EXTRACTOR = path.join(
  'tools',
  'importers',
  'apple-music',
  'extract-apple-cookies.py',
)
const AUDIO_EXTENSIONS = new Set(['.m4a', '.mp4'])

async function fileExists (filename) {
  try {
    return (await fs.stat(filename)).isFile()
  } catch {
    return false
  }
}

function hasAppleMusicToken (contents) {
  return /\bmedia-user-token\b(?:\t|\s*=\s*)[^\s]{20,}/u.test(contents)
}

async function findAppleMusicCookies (root, staging, signal) {
  const candidates = [
    process.env.APPLE_MUSIC_COOKIES,
    path.join(root, 'data', 'apple-music', 'cookies.txt'),
    path.join(os.homedir(), '.gamdl', 'cookies.txt'),
  ].filter(Boolean)
  for (const filename of candidates) {
    if (!await fileExists(filename)) continue
    const contents = await fs.readFile(filename, 'utf8')
    if (hasAppleMusicToken(contents)) return filename
  }

  const { python, cookieExtractor } = await verifyAppleComponent(root)
  const extracted = path.join(staging, 'apple-music-cookies.txt')
  try {
    await execFile(python, ['-B', cookieExtractor, extracted], {
      windowsHide: true,
      timeout: 30_000,
      maxBuffer: 512 * 1024,
      env: {
        ...process.env,
        PYTHONDONTWRITEBYTECODE: '1',
        PYTHONUTF8: '1',
      },
      signal,
    })
    const contents = await fs.readFile(extracted, 'utf8')
    if (hasAppleMusicToken(contents)) return extracted
  } catch {}

  await fs.rm(extracted, { force: true }).catch(() => {})
  throw new AppleMusicImportError(
    'APPLE_MUSIC_NOT_LOGGED_IN',
    'A usable music.apple.com browser session was not found.',
  )
}

async function verifyAppleComponent (root) {
  const python = path.join(root, APPLE_RUNTIME, 'python.exe')
  const runner = path.join(root, APPLE_RUNNER)
  const cookieExtractor = path.join(root, APPLE_COOKIE_EXTRACTOR)
  const gamdl = path.join(
    root,
    APPLE_RUNTIME,
    'Lib',
    'site-packages',
    'gamdl',
    '__init__.py',
  )
  if (
    !await fileExists(python) ||
    !await fileExists(runner) ||
    !await fileExists(cookieExtractor) ||
    !await fileExists(gamdl)
  ) {
    throw new AppleMusicImportError(
      'APPLE_MUSIC_COMPONENT_MISSING',
      'The bundled Apple Music import runtime is missing or incomplete.',
    )
  }
  return { python, runner, cookieExtractor }
}

async function runGamdl ({
  root,
  urls,
  cookies,
  staging,
  limit,
  skipTrackIds,
  signal,
}) {
  const { python, runner } = await verifyAppleComponent(root)
  const output = path.join(staging, 'output')
  const temporary = path.join(staging, 'temporary')
  await Promise.all([
    fs.mkdir(output, { recursive: true }),
    fs.mkdir(temporary, { recursive: true }),
  ])
  const skipFile = path.join(staging, 'existing-track-ids.txt')
  await fs.writeFile(skipFile, [...skipTrackIds].join('\n'), 'utf8')
  const args = appleMusicGamdlArguments({
    runner,
    urls,
    cookies,
    staging,
    output,
  })
  try {
    await execFile(python, args, {
      windowsHide: true,
      timeout: 15 * 60 * 1000,
      maxBuffer: 8 * 1024 * 1024,
      env: {
        ...process.env,
        PYTHONDONTWRITEBYTECODE: '1',
        PYTHONUTF8: '1',
        PYTHONIOENCODING: 'utf-8',
        TMN_GAMDL_LIMIT: String(limit),
        TMN_GAMDL_SKIP_FILE: skipFile,
      },
      signal,
    })
  } catch (error) {
    if (signal?.aborted || error?.name === 'AbortError') throw error
    const detail = `${error?.stdout || ''}\n${error?.stderr || ''}`
    if (/active Apple Music subscription|media-user-token|cookie/iu.test(detail)) {
      throw new AppleMusicImportError(
        'APPLE_MUSIC_NOT_LOGGED_IN',
        'The Apple Music session expired or the signed-in account cannot play the selected music.',
      )
    }
    if (/429|too many requests|license exchange/iu.test(detail)) {
      throw new AppleMusicImportError(
        'APPLE_MUSIC_RATE_LIMITED',
        'Apple Music temporarily rate-limited the license request.',
      )
    }
    throw new AppleMusicImportError(
      'APPLE_MUSIC_DOWNLOAD_FAILED',
      'Apple Music could not prepare playable local media.',
    )
  }
  return output
}

export function appleMusicGamdlArguments ({
  runner,
  urls,
  cookies,
  staging,
  output = path.join(staging, 'output'),
}) {
  const temporary = path.join(staging, 'temporary')
  const template = '{title_id}'
  return [
    '-B',
    runner,
    '--no-config-file',
    '--no-exceptions',
    '--cookies-path', cookies,
    '--language', appleMusicStorefrontLanguage(urls[0]),
    '--output-path', output,
    '--temp-path', temporary,
    '--database-path', path.join(staging, 'downloads.sqlite3'),
    '--synced-lyrics-format', 'lrc',
    '--song-codec-priority', 'aac-web',
    '--download-mode', 'ytdlp',
    '--cover-format', 'jpg',
    '--cover-size', '1200',
    '--save-cover',
    '--single-disc-file-template', template,
    '--multi-disc-file-template', template,
    '--no-album-file-template', template,
    '--playlist-file-template', template,
    '--truncate', '120',
    ...urls,
  ]
}

async function collectFiles (directory, output = []) {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  for (const entry of entries) {
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) await collectFiles(filename, output)
    else if (entry.isFile()) output.push(filename)
  }
  return output
}

export async function discoverAppleMusicOutput (directory) {
  const files = await collectFiles(directory)
  const mediaFiles = files.filter(filename => (
    AUDIO_EXTENSIONS.has(path.extname(filename).toLocaleLowerCase())
  ))
  return mediaFiles.map(filename => ({
    media: filename,
    lyrics: files.find(candidate => (
      path.dirname(candidate).toLocaleLowerCase() ===
        path.dirname(filename).toLocaleLowerCase() &&
      path.extname(candidate).toLocaleLowerCase() === '.lrc' &&
      path.basename(candidate, path.extname(candidate)) ===
        path.basename(filename, path.extname(filename))
    )) || '',
  }))
}

async function findCompanionLyrics (audioFilename, allFiles) {
  const stem = path.basename(audioFilename, path.extname(audioFilename))
  const directory = path.dirname(audioFilename).toLocaleLowerCase()
  const exact = allFiles.find(filename => (
    path.dirname(filename).toLocaleLowerCase() === directory &&
    path.extname(filename).toLocaleLowerCase() === '.lrc' &&
    path.basename(filename, path.extname(filename)) === stem
  ))
  if (!exact) throw new Error('Apple Music synced LRC lyrics are unavailable')
  return fs.readFile(exact, 'utf8')
}

function appleTrackId (filename, audioInfo) {
  const stem = path.basename(filename, path.extname(filename))
  if (/^\d+$/u.test(stem)) return stem
  const freeform = audioInfo.parsed.native?.iTunes || []
  for (const tag of freeform) {
    if (!/(?:title|song).*id/iu.test(String(tag.id || ''))) continue
    const value = String(tag.value || '').match(/\d{5,}/u)?.[0]
    if (value) return value
  }
  return stem
}

function metadataFromAppleAudio (audioInfo) {
  const common = audioInfo.parsed.common || {}
  const artistNames = Array.isArray(common.artists) && common.artists.length
    ? common.artists.map(value => String(value).trim()).filter(Boolean)
    : String(common.artist || common.albumartist || '')
      .split(/\s*[;/]\s*/u)
      .filter(Boolean)
  return {
    title: String(common.title || '').trim(),
    rawTitle: String(common.title || '').trim(),
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

export async function importAppleMusicSongs ({
  root,
  limit = 10,
  urls = [],
  onProgress = () => {},
  shouldCancel = () => false,
  signal,
}) {
  const result = createImportBatchResult(limit)
  if (process.platform !== 'win32') {
    throw new AppleMusicImportError(
      'APPLE_MUSIC_WINDOWS_REQUIRED',
      'The bundled Apple Music importer currently requires Windows x64.',
    )
  }
  const targets = normalizeAppleMusicUrls(urls)
  await verifyAppleComponent(root)
  onProgress({ phase: 'session', message: 'Checking Apple Music...', ...result })
  if (!await anyWindowsProcessRunning(['applemusic.exe', 'applemusicwin.exe'])) {
    throw new AppleMusicImportError(
      'APPLE_MUSIC_NOT_RUNNING',
      'Start Apple Music and sign in.',
    )
  }
  const staging = await fs.mkdtemp(path.join(os.tmpdir(), 'tmn-apple-music-'))
  try {
    const cookies = await findAppleMusicCookies(root, staging, signal)
    const library = await scanSongLibrary(root)
    const existingTrackIds = new Set(
      library.records
        .filter(song => song.source?.service === 'apple-music')
        .map(song => String(song.source?.track_id || ''))
        .filter(Boolean),
    )
    onProgress({ phase: 'download', message: 'Preparing Apple Music media...', ...result })
    const output = await runGamdl({
      root,
      urls: targets,
      cookies,
      staging,
      limit,
      skipTrackIds: existingTrackIds,
      signal,
    })
    const files = await collectFiles(output)
    const discovered = await discoverAppleMusicOutput(output)
    const mediaFiles = discovered.map(value => value.media)
    if (!mediaFiles.length) {
      throw new AppleMusicImportError(
        'APPLE_MUSIC_NO_USABLE_TRACKS',
        'Apple Music did not produce any complete AAC media files.',
      )
    }

    for (const filename of mediaFiles) {
      if (shouldCancel()) {
        result.cancelled = true
        break
      }
      if (!needsMoreNewSongs(result)) break
      result.inspected++
      let metadata = null
      try {
        onProgress({ phase: 'metadata', message: 'Reading Apple Music metadata...', ...result })
        const audio = await fs.readFile(filename)
        const audioInfo = await inspectImportedAudio(audio, filename)
        metadata = metadataFromAppleAudio(audioInfo)
        const independentCatalog = await resolveImportedCatalogMatch({
          root,
          metadata,
          provider: 'apple-music',
        }).catch(() => null)
        if (independentCatalog) {
          metadata = mergeCatalogMetadata(
            metadata,
            independentCatalog.metadata,
          )
        }
        const trackId = appleTrackId(filename, audioInfo)
        if (existingTrackIds.has(trackId)) {
          result.skipped++
          onProgress({ phase: 'duplicate', songTitle: metadata.title, ...result })
          continue
        }
        if (library.records.some(song => songsAreEquivalent(song, metadata))) {
          result.duplicates++
          continue
        }

        onProgress({ phase: 'lyrics', songTitle: metadata.title, ...result })
        const lrc = await findCompanionLyrics(filename, files)
        const mainLines = parseLrc(lrc, { durationMs: audioInfo.duration * 1000 })
        const family = lyricLanguage('U', mainLines.map(line => line.text).join('\n'))
        metadata.language = ({ zh: 'ZH', ja: 'JP', en: 'EN' })[family]
        let readingLines = []
        let pronunciationSource = 'visible-kana'
        if (family === 'ja' && mainLines.some(line => /\p{Script=Han}/u.test(line.text))) {
          const matched = await searchNeteaseTrack(metadata)
          if (matched?.id) {
            const resource = await fetchNeteaseLyrics(matched.id)
            const sourceLines = parseLrc(resource.main, {
              durationMs: audioInfo.duration * 1000,
            })
            const sourceReadings = parseLrc(resource.romanized, {
              durationMs: audioInfo.duration * 1000,
            })
            readingLines = alignTrackSpecificReadings({
              targetLines: mainLines,
              sourceLines,
              sourceReadings,
            })
            pronunciationSource = 'netease-crosscheck-romalrc'
          }
        }
        metadata = retainVerifiableArtistNames(metadata)
        const lyrics = await convertTimedLyrics({
          mainLines,
          readingLines,
          metadata,
          readingSource: pronunciationSource,
        })

        onProgress({ phase: 'cover', songTitle: metadata.title, ...result })
        const cover = embeddedArtwork(audioInfo) ||
          await loadBundledFallbackCover(root)
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

        onProgress({ phase: 'pack', songTitle: metadata.title, ...result })
        const written = await writeImportedSongPackage({
          root,
          provider: 'apple-music',
          trackId,
          metadata,
          lyrics,
          cover,
          posterResolution: enrichment.posterResolution,
          audio,
          audioInfo,
          source: {
            apple_music_track_id: trackId,
            source_format: 'aac-web',
            checks: {
              apple_music_account_access: true,
              lyrics_online: true,
            },
          },
        })
        library.records.push(written.song)
        existingTrackIds.add(trackId)
        result.imported++
        result.selected = result.imported
      } catch (error) {
        if (shouldCancel() || error?.name === 'AbortError') {
          result.cancelled = true
          break
        }
        recordImportFailure(result, {
          error,
          stage: 'import',
          title: metadata?.title || path.basename(filename),
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
      throw new AppleMusicImportError(
        'APPLE_MUSIC_NO_USABLE_TRACKS',
        'No Apple Music track passed audio, lyric, pronunciation, and artwork checks.',
      )
    }
    return result
  } finally {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => {})
  }
}
