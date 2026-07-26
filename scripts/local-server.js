import childProcess from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  rebuildSongIndex,
} from './local/library.js'
import {
  deleteLibrarySongs,
  inspectEditableLibrary,
  pruneUnusedLibraryCaches,
  recoverLibraryEditTransactions,
} from './local/library-editor.js'
import { inspectLibraryDuplicates } from './local/library-deduplication.js'
import {
  musicImportProvider,
  musicImportProviderIds,
} from './local/music-import-providers.js'
import { refreshImportedLibraryMetadata } from './local/library-metadata-maintenance.js'
import { resetLibraryScope } from './local/library-reset.js'
import {
  createUploadSession,
  disposeUploadSession,
  getUploadSession,
  receiveUploadFile,
} from './local/upload-sessions.js'
import { refreshImportedLyricsAndPace } from './local/lyrics-maintenance.js'
import {
  refreshOutdatedMediaPosters,
} from './local/poster-maintenance.js'
import { hideUnverifiedLocalizedArtistNames } from './local/artist-maintenance.js'
import { refreshMissingSongOrigins } from './local/song-origin-maintenance.js'
import { refreshQQMusicSongTitles } from './local/song-title-maintenance.js'
import { readPackedSongArtwork } from './local/packed-song-reader.js'
import {
  resolveMusicVideoFile,
  resolveSongMusicVideo,
} from './local/mv-resolver.js'

const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)))
const args = new Set(process.argv.slice(2))
const portArgument = process.argv.find(argument => argument.startsWith('--port='))
const PORT = Number(portArgument?.split('=')[1] || process.env.TMN_PORT || 8765)
const HOST = '127.0.0.1'
const SESSION_TOKEN = crypto.randomBytes(24).toString('base64url')
const INSTANCE_PROTOCOL = 3
const SERVER_STARTED_AT = new Date().toISOString()

function latestServerSourceVersion () {
  const files = [fileURLToPath(import.meta.url)]
  const visit = directory => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(filename)
      else if (entry.isFile() && path.extname(entry.name) === '.js') files.push(filename)
    }
  }
  visit(path.join(ROOT, 'scripts', 'local'))
  return Math.max(...files.map(filename => Math.trunc(fs.statSync(filename).mtimeMs)))
}

const SERVER_SOURCE_VERSION = latestServerSourceVersion()

const MIME_TYPES = {
  '.avif': 'image/avif',
  '.aac': 'audio/aac',
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.dat': 'application/octet-stream',
  '.flac': 'audio/flac',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.mp4': 'video/mp4',
  '.ogg': 'audio/ogg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.typingmania': 'application/octet-stream',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

let libraryStatus = {
  songs: 0,
  scannedFiles: 0,
  invalidFiles: 0,
  lastScan: null,
}
let startupStatus = {
  state: 'starting',
  phase: 'binding',
  message: 'Starting the local service...',
  ready: false,
  error: null,
  startedAt: SERVER_STARTED_AT,
  completedAt: null,
}
let importJob = {
  state: 'idle',
  provider: null,
  phase: 'idle',
  message: 'Ready',
  result: null,
  error: null,
  startedAt: null,
  completedAt: null,
}
let importAbortController = null
let libraryMutationRunning = false
let startupMaintenance = Promise.resolve()
let startupBackgroundRunning = false
let originMaintenanceRunning = false
let metadataMaintenanceRunning = false
let metadataRefreshJob = {
  state: 'idle',
  message: 'Ready',
  result: null,
  error: null,
  startedAt: null,
  completedAt: null,
}
let metadataAbortController = null

function publicJob () {
  return JSON.parse(JSON.stringify(importJob))
}

function publicMetadataJob () {
  return JSON.parse(JSON.stringify(metadataRefreshJob))
}

function publicStartupStatus () {
  return JSON.parse(JSON.stringify(startupStatus))
}

function updateStartupStatus (values) {
  startupStatus = { ...startupStatus, ...values }
}

function libraryIsBusy () {
  return Boolean(
    importJob.state === 'running' ||
    libraryMutationRunning ||
    startupBackgroundRunning ||
    originMaintenanceRunning ||
    metadataMaintenanceRunning
  )
}

function importCannotStart () {
  return Boolean(
    importJob.state === 'running' ||
    libraryMutationRunning ||
    metadataMaintenanceRunning
  )
}

function sendJson (response, status, value) {
  const body = Buffer.from(JSON.stringify(value))
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(body)
}

async function refreshLibrary () {
  const result = await rebuildSongIndex(ROOT)
  libraryStatus = {
    songs: result.records.length,
    scannedFiles: result.scannedFiles,
    invalidFiles: result.errors.length,
    lastScan: new Date().toISOString(),
  }
  return result
}

function sameOrigin (request) {
  const origin = request.headers.origin
  if (!origin) return true
  return origin === `http://${request.headers.host}`
}

function authorized (request) {
  return sameOrigin(request) && request.headers['x-tmn-token'] === SESSION_TOKEN
}

async function readJsonBody (request) {
  const chunks = []
  let total = 0
  for await (const chunk of request) {
    total += chunk.length
    if (total > 64 * 1024) throw new Error('request body is too large')
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function startImportJob (providerId, options = {}) {
  const provider = musicImportProvider(providerId)
  if (!provider) throw new Error(`Unknown music import provider: ${providerId}`)
  const maximumBatchSize = Math.min(
    500,
    Number(provider.maximumBatchSize) || 500,
  )
  const limit = Math.max(1, Math.min(
    maximumBatchSize,
    Number(options.limit) || Math.min(10, maximumBatchSize),
  ))
  importAbortController = new AbortController()
  importJob = {
    state: 'running',
    provider: provider.id,
    phase: 'starting',
    message: `Starting ${provider.label} import...`,
    result: null,
    error: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
  }

  startupMaintenance
    .catch(() => {})
    .then(() => provider.importSongs({
      root: ROOT,
      limit,
      urls: options.urls,
      sessionId: options.sessionId,
      signal: importAbortController.signal,
      shouldCancel: () => importAbortController?.signal.aborted === true,
      onProgress: progress => {
        importJob = { ...importJob, ...progress, state: 'running' }
      },
    }))
    .then(async result => {
      await refreshLibrary()
      let message
      if (result.batchComplete) {
        message = `Added the next ${result.imported} songs.`
      } else if (result.imported) {
        message = `Added ${result.imported} new song${result.imported === 1 ? '' : 's'}; no more usable cached songs were found.`
      } else if (result.refreshed) {
        message = `Refreshed ${result.refreshed} song${result.refreshed === 1 ? '' : 's'}; no new usable cached songs were found.`
      } else {
        message = 'No new usable cached songs were found.'
      }
      importJob = {
        ...importJob,
        state: 'complete',
        phase: 'complete',
        message,
        result,
        error: null,
        completedAt: new Date().toISOString(),
      }
    }).catch(error => {
      if (importAbortController?.signal.aborted) {
        const result = error.result || importJob.result || {
          requested: limit,
          imported: 0,
          refreshed: 0,
          skipped: 0,
          duplicates: 0,
          failed: 0,
          failures: [],
          cancelled: true,
        }
        result.cancelled = true
        importJob = {
          ...importJob,
          state: 'complete',
          phase: 'cancelled',
          message: 'Import stopped; completed songs were kept.',
          result,
          error: null,
          completedAt: new Date().toISOString(),
        }
        return
      }
      importJob = {
        ...importJob,
        state: 'error',
        phase: 'error',
        message: error.message || `${provider.label} import failed.`,
        result: error.result || null,
        error: {
          code: error.code || 'MUSIC_IMPORT_FAILED',
          message: error.message,
        },
        completedAt: new Date().toISOString(),
      }
    }).finally(() => {
      importAbortController = null
    })
}

function startMetadataRefreshJob () {
  metadataAbortController = new AbortController()
  metadataMaintenanceRunning = true
  metadataRefreshJob = {
    state: 'running',
    message: 'Checking imported song metadata...',
    result: null,
    error: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
  }
  startupMaintenance
    .catch(() => {})
    .then(() => refreshImportedLibraryMetadata({
      root: ROOT,
      signal: metadataAbortController.signal,
      shouldCancel: () => metadataAbortController?.signal.aborted === true,
      onProgress: progress => {
        metadataRefreshJob = {
          ...metadataRefreshJob,
          ...progress,
          state: 'running',
        }
      },
    }))
    .then(async result => {
      await refreshLibrary()
      metadataRefreshJob = {
        ...metadataRefreshJob,
        state: 'complete',
        message: `Updated ${result.updated} imported song records.`,
        result,
        error: null,
        completedAt: new Date().toISOString(),
      }
    })
    .catch(error => {
      metadataRefreshJob = {
        ...metadataRefreshJob,
        state: 'error',
        message: error.message || 'Song metadata update failed.',
        result: null,
        error: {
          code: error.code || 'METADATA_REFRESH_FAILED',
          message: error.message,
        },
        completedAt: new Date().toISOString(),
      }
    })
    .finally(() => {
      metadataMaintenanceRunning = false
      metadataAbortController = null
    })
}

function resolveSongPackage (source) {
  if (!source) return null
  let decoded
  try {
    decoded = decodeURIComponent(source).replaceAll('/', path.sep)
  } catch {
    return null
  }
  if (path.isAbsolute(decoded)) return null
  const filename = path.resolve(ROOT, decoded)
  if (
    !filename.startsWith(ROOT + path.sep) ||
    path.extname(filename).toLocaleLowerCase() !== '.typingmania' ||
    path.relative(ROOT, filename)
      .split(path.sep)
      .some(segment => segment.toLocaleLowerCase() === 'qqmusiccache')
  ) {
    return null
  }
  return filename
}

async function sendSongArtwork (request, response, url) {
  if (!sameOrigin(request)) {
    return sendJson(response, 403, { error: 'Forbidden' })
  }
  const filename = resolveSongPackage(url.searchParams.get('src'))
  if (!filename) {
    return sendJson(response, 400, { error: 'Invalid song package' })
  }
  try {
    const artwork = await readPackedSongArtwork(
      filename,
      url.searchParams.get('kind') === 'image' ? 'image' : 'poster',
    )
    response.writeHead(200, {
      'Content-Type': artwork.mimeType,
      'Content-Length': artwork.buffer.length,
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    })
    response.end(artwork.buffer)
  } catch {
    sendJson(response, 404, { error: 'Artwork not found' })
  }
}

async function sendMusicVideo (request, response, url) {
  if (!sameOrigin(request)) {
    return sendJson(response, 403, { error: 'Forbidden' })
  }
  const filename = await resolveMusicVideoFile(
    ROOT,
    url.searchParams.get('key'),
  )
  if (!filename) return sendJson(response, 404, { error: 'MV not found' })
  const stat = await fsp.stat(filename)
  const type = MIME_TYPES[path.extname(filename).toLocaleLowerCase()] ||
    'video/mp4'
  const range = String(request.headers.range || '')
  const match = range.match(/^bytes=(\d*)-(\d*)$/u)
  if (!match) {
    response.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stat.size,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    })
    return fs.createReadStream(filename).pipe(response)
  }
  const start = match[1] ? Number(match[1]) : 0
  const end = match[2]
    ? Math.min(Number(match[2]), stat.size - 1)
    : stat.size - 1
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end < start ||
    start >= stat.size
  ) {
    response.writeHead(416, { 'Content-Range': `bytes */${stat.size}` })
    return response.end()
  }
  response.writeHead(206, {
    'Content-Type': type,
    'Content-Length': end - start + 1,
    'Content-Range': `bytes ${start}-${end}/${stat.size}`,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
  })
  fs.createReadStream(filename, { start, end }).pipe(response)
}

async function handleApi (request, response, url) {
  const pathname = url.pathname
  if (
    request.method === 'GET' &&
    pathname === '/api/local/song-artwork'
  ) {
    return sendSongArtwork(request, response, url)
  }
  if (
    request.method === 'GET' &&
    pathname === '/api/local/music-video'
  ) {
    return sendMusicVideo(request, response, url)
  }
  if (request.method === 'GET' && pathname === '/api/local/status') {
    return sendJson(response, 200, {
      available: true,
      instance: {
        protocol: INSTANCE_PROTOCOL,
        root: ROOT,
        sourceVersion: SERVER_SOURCE_VERSION,
        startedAt: SERVER_STARTED_AT,
        features: [
          'keyfall-predictive',
          'library-editor',
          'library-deduplication',
          'local-folder-import',
          'metadata-refresh',
          'music-import-providers',
          'music-video-cache',
          'scoped-library-reset',
          'song-artwork-preview',
          'startup-readiness',
          'graceful-shutdown',
        ],
      },
      token: SESSION_TOKEN,
      startup: publicStartupStatus(),
      library: {
        ...libraryStatus,
        ready: startupStatus.ready,
      },
      import: publicJob(),
      importProviders: musicImportProviderIds(),
      maintenance: {
        startup: startupBackgroundRunning,
        origin: originMaintenanceRunning,
        metadata: metadataMaintenanceRunning,
      },
    })
  }
  if (request.method === 'GET' && pathname === '/api/qqmusic/import/status') {
    if (!authorized(request)) return sendJson(response, 403, { error: 'Forbidden' })
    return sendJson(response, 200, publicJob())
  }
  if (request.method === 'GET' && pathname === '/api/music-import/status') {
    if (!authorized(request)) return sendJson(response, 403, { error: 'Forbidden' })
    return sendJson(response, 200, publicJob())
  }
  if (request.method === 'POST' && pathname === '/api/music-import/cancel') {
    if (!authorized(request)) return sendJson(response, 403, { error: 'Forbidden' })
    if (importJob.state !== 'running' || !importAbortController) {
      return sendJson(response, 200, { cancelling: false, job: publicJob() })
    }
    importAbortController.abort()
    importJob = {
      ...importJob,
      phase: 'cancelling',
      message: 'Stopping after the current safe checkpoint...',
    }
    return sendJson(response, 202, { cancelling: true, job: publicJob() })
  }
  if (
    request.method === 'GET' &&
    pathname === '/api/library/metadata-refresh/status'
  ) {
    if (!authorized(request)) return sendJson(response, 403, { error: 'Forbidden' })
    return sendJson(response, 200, publicMetadataJob())
  }
  if (
    request.method === 'POST' &&
    pathname === '/api/library/metadata-refresh/cancel'
  ) {
    if (!authorized(request)) return sendJson(response, 403, { error: 'Forbidden' })
    if (metadataRefreshJob.state !== 'running' || !metadataAbortController) {
      return sendJson(response, 200, {
        cancelling: false,
        job: publicMetadataJob(),
      })
    }
    metadataAbortController.abort()
    metadataRefreshJob = {
      ...metadataRefreshJob,
      message: 'Stopping after the current safe checkpoint...',
    }
    return sendJson(response, 202, {
      cancelling: true,
      job: publicMetadataJob(),
    })
  }
  if (request.method === 'POST' && pathname === '/api/local/shutdown') {
    if (!authorized(request)) {
      return sendJson(response, 403, { error: 'Forbidden' })
    }
    sendJson(response, 202, { stopping: true })
    setImmediate(() => {
      const forcedExit = setTimeout(() => process.exit(0), 2000)
      forcedExit.unref()
      server.close(() => process.exit(0))
    })
    return
  }
  if (request.method === 'POST' && pathname === '/api/music-video/resolve') {
    if (!authorized(request)) return sendJson(response, 403, { error: 'Forbidden' })
    try {
      const body = await readJsonBody(request)
      const filename = resolveSongPackage(body.songUrl)
      if (!filename) {
        return sendJson(response, 400, { error: 'Invalid song package' })
      }
      const result = await resolveSongMusicVideo({
        root: ROOT,
        songFilename: filename,
      })
      return sendJson(response, 200, result.available
        ? {
            ...result,
            url: `/api/local/music-video?key=${encodeURIComponent(result.key)}`,
          }
        : result)
    } catch (error) {
      return sendJson(response, 200, {
        available: false,
        reason: error?.message || 'MV lookup failed',
      })
    }
  }
  if (request.method === 'POST' && pathname === '/api/local-folder/session') {
    if (!authorized(request)) return sendJson(response, 403, { error: 'Forbidden' })
    if (importJob.state === 'running') return sendJson(response, 409, publicJob())
    return sendJson(response, 201, await createUploadSession())
  }
  if (request.method === 'PUT' && pathname === '/api/local-folder/file') {
    if (!authorized(request)) return sendJson(response, 403, { error: 'Forbidden' })
    const session = getUploadSession(url.searchParams.get('session'), {
      requireOpen: true,
    })
    if (!session) return sendJson(response, 404, { error: 'Upload session not found' })
    try {
      const result = await receiveUploadFile(
        request,
        session,
        url.searchParams.get('path'),
      )
      return sendJson(response, 200, result)
    } catch (error) {
      return sendJson(response, 400, { error: error.message })
    }
  }
  if (request.method === 'DELETE' && pathname === '/api/local-folder/session') {
    if (!authorized(request)) return sendJson(response, 403, { error: 'Forbidden' })
    const session = getUploadSession(url.searchParams.get('session'))
    if (!session) return sendJson(response, 200, { disposed: false })
    await disposeUploadSession(session)
    return sendJson(response, 200, { disposed: true })
  }
  if (request.method === 'POST' && pathname === '/api/qqmusic/import') {
    if (!authorized(request)) return sendJson(response, 403, { error: 'Forbidden' })
    if (importCannotStart()) {
      return sendJson(response, 409, publicJob())
    }
    try {
      const body = await readJsonBody(request)
      const limit = Math.max(1, Math.min(500, Number(body.limit) || 10))
      startImportJob('qqmusic', { limit })
      return sendJson(response, 202, publicJob())
    } catch (error) {
      return sendJson(response, 400, { error: error.message })
    }
  }
  if (request.method === 'POST' && pathname.startsWith('/api/music-import/')) {
    if (!authorized(request)) return sendJson(response, 403, { error: 'Forbidden' })
    if (importCannotStart()) {
      return sendJson(response, 409, publicJob())
    }
    try {
      const providerId = decodeURIComponent(
        pathname.slice('/api/music-import/'.length),
      )
      if (!musicImportProvider(providerId)) {
        return sendJson(response, 404, { error: 'Unknown music import provider' })
      }
      const body = await readJsonBody(request)
      startImportJob(providerId, {
        limit: body.limit,
        urls: Array.isArray(body.urls) ? body.urls.slice(0, 20) : [],
        sessionId: body.sessionId,
      })
      return sendJson(response, 202, publicJob())
    } catch (error) {
      return sendJson(response, 400, {
        code: error.code,
        error: error.message,
      })
    }
  }
  if (request.method === 'POST' && pathname === '/api/library/rescan') {
    if (!authorized(request)) return sendJson(response, 403, { error: 'Forbidden' })
    await refreshLibrary()
    return sendJson(response, 200, libraryStatus)
  }
  if (
    request.method === 'POST' &&
    pathname === '/api/library/metadata-refresh'
  ) {
    if (!authorized(request)) return sendJson(response, 403, { error: 'Forbidden' })
    if (libraryIsBusy()) {
      return sendJson(response, 409, publicMetadataJob())
    }
    startMetadataRefreshJob()
    return sendJson(response, 202, publicMetadataJob())
  }
  if (request.method === 'GET' && pathname === '/api/library/editable') {
    if (!authorized(request)) return sendJson(response, 403, { error: 'Forbidden' })
    return sendJson(response, 200, await inspectEditableLibrary(ROOT))
  }
  if (request.method === 'GET' && pathname === '/api/library/duplicates') {
    if (!authorized(request)) return sendJson(response, 403, { error: 'Forbidden' })
    if (libraryIsBusy()) {
      return sendJson(response, 409, { error: 'The local library is busy' })
    }
    return sendJson(response, 200, await inspectLibraryDuplicates(ROOT))
  }
  if (request.method === 'POST' && pathname === '/api/library/delete') {
    if (!authorized(request)) return sendJson(response, 403, { error: 'Forbidden' })
    if (libraryIsBusy()) {
      return sendJson(response, 409, { error: 'The local library is busy' })
    }
    try {
      const body = await readJsonBody(request)
      if (body.confirm !== 'DELETE_SELECTED_SONGS') {
        return sendJson(response, 400, { error: 'Explicit confirmation is required' })
      }
      libraryMutationRunning = true
      const result = await deleteLibrarySongs(ROOT, body.songIds)
      await refreshLibrary()
      return sendJson(response, 200, result)
    } catch (error) {
      const status = error?.code ? 400 : 500
      return sendJson(response, status, {
        code: error?.code || 'LIBRARY_DELETE_FAILED',
        error: error?.message || 'Unable to delete the selected songs.',
      })
    } finally {
      libraryMutationRunning = false
    }
  }
  if (request.method === 'POST' && pathname === '/api/library/reset') {
    if (!authorized(request)) return sendJson(response, 403, { error: 'Forbidden' })
    if (libraryIsBusy()) {
      return sendJson(response, 409, { error: 'The local library is busy' })
    }
    try {
      const body = await readJsonBody(request)
      const scope = String(body.scope || 'all')
      if (body.confirm !== 'RESET_LIBRARY_SCOPE') {
        return sendJson(response, 400, { error: 'Explicit confirmation is required' })
      }
      libraryMutationRunning = true
      const result = await resetLibraryScope(ROOT, scope)
      await refreshLibrary()
      return sendJson(response, result.restored ? 200 : 207, result)
    } finally {
      libraryMutationRunning = false
    }
  }
  return sendJson(response, 404, { error: 'Not found' })
}

function safeFilename (pathname) {
  const decoded = decodeURIComponent(pathname === '/' ? '/index.html' : pathname)
  if (decoded.includes('\0')) return null
  const filename = path.resolve(ROOT, `.${decoded}`)
  if (filename !== ROOT && !filename.startsWith(ROOT + path.sep)) return null
  return filename
}

async function serveFile (request, response, pathname) {
  if (!['GET', 'HEAD'].includes(request.method)) {
    response.writeHead(405, { Allow: 'GET, HEAD' })
    return response.end()
  }
  const filename = safeFilename(pathname)
  if (!filename) {
    response.writeHead(403)
    return response.end('Forbidden')
  }
  let stat
  try {
    stat = await fsp.stat(filename)
  } catch {
    response.writeHead(404)
    return response.end('Not found')
  }
  if (!stat.isFile()) {
    response.writeHead(404)
    return response.end('Not found')
  }
  const headers = {
    'Content-Type': MIME_TYPES[path.extname(filename).toLowerCase()] || 'application/octet-stream',
    'Content-Length': stat.size,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': pathname.startsWith('/data/') ? 'no-store' : 'no-cache',
  }
  response.writeHead(200, headers)
  if (request.method === 'HEAD') return response.end()
  fs.createReadStream(filename).pipe(response)
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || `${HOST}:${PORT}`}`)
    if (url.pathname.startsWith('/api/')) {
      await handleApi(request, response, url)
    } else if (url.pathname === '/favicon.ico') {
      response.writeHead(204, { 'Cache-Control': 'public, max-age=86400' })
      response.end()
    } else {
      await serveFile(request, response, url.pathname)
    }
  } catch (error) {
    if (!response.headersSent) sendJson(response, 500, { error: error.message })
    else response.destroy(error)
  }
})

async function prepareLocalLibrary () {
  updateStartupStatus({
    phase: 'recovering-library',
    message: 'Checking the local song library...',
  })
  await recoverLibraryEditTransactions(ROOT)
  await pruneUnusedLibraryCaches(ROOT).catch(error => {
    console.warn(`Unable to prune an unused library cache: ${error.message}`)
  })
  updateStartupStatus({
    phase: 'scanning-library',
    message: 'Scanning playable songs...',
  })
  await refreshLibrary()
  updateStartupStatus({
    state: 'ready',
    phase: 'ready',
    message: 'Ready',
    ready: true,
    error: null,
    completedAt: new Date().toISOString(),
  })
}

async function maintainLocalLibrary () {
  startupBackgroundRunning = true
  try {
    const artistCleanup = await hideUnverifiedLocalizedArtistNames({
      root: ROOT,
      onProgress: progress => {
        console.log(
          `Unverified localized artist aliases: ` +
          `${progress.inspected}/${progress.total}`,
        )
      },
    })
    if (artistCleanup.inspected) {
      console.log(
        `Unverified localized artist aliases: ${artistCleanup.hidden} hidden, ` +
        `${artistCleanup.failed} failed`,
      )
      await refreshLibrary()
    }
    const titleMaintenance = await refreshQQMusicSongTitles({
      root: ROOT,
      onProgress: progress => {
        console.log(`Original song titles: ${progress.inspected}/${progress.total}`)
      },
    })
    if (titleMaintenance.inspected) {
      console.log(
        `Original song titles: ${titleMaintenance.refreshed} refreshed, ` +
        `${titleMaintenance.failed} failed`,
      )
    }
    const lyricsMaintenance = await refreshImportedLyricsAndPace({
      root: ROOT,
      onProgress: progress => {
        console.log(`Lyrics and reference pace: ${progress.inspected}/${progress.total}`)
      },
    })
    if (lyricsMaintenance.inspected) {
      console.log(
        `Imported lyrics and reference pace: ${lyricsMaintenance.refreshed} refreshed, ` +
        `${lyricsMaintenance.removed} non-lyric line(s) removed, ` +
        `${lyricsMaintenance.failed} failed`,
      )
    }
    if (titleMaintenance.refreshed || lyricsMaintenance.refreshed) {
      await refreshLibrary()
    }

    originMaintenanceRunning = true
    const originMaintenance = await refreshMissingSongOrigins({
      root: ROOT,
      onProgress: progress => {
        console.log(`Original work titles: ${progress.inspected}/${progress.total}`)
      },
    })
    if (originMaintenance.inspected) {
      console.log(
        `Original work titles: ${originMaintenance.refreshed} refreshed, ` +
        `${originMaintenance.unresolved} unresolved, ` +
        `${originMaintenance.hidden} hidden, ${originMaintenance.failed} failed`,
      )
      await refreshLibrary()
    }
    const posterMaintenance = await refreshOutdatedMediaPosters({
      root: ROOT,
      onProgress: progress => {
        console.log(
          `Verified media posters: ${progress.inspected}/${progress.total}`,
        )
      },
    })
    if (posterMaintenance.inspected) {
      console.log(
        `Verified media posters: ${posterMaintenance.refreshed} refreshed, ` +
        `${posterMaintenance.removed} removed, ` +
        `${posterMaintenance.unavailable} deferred, ` +
        `${posterMaintenance.failed} failed`,
      )
      await refreshLibrary()
    }
    return {
      titleMaintenance,
      lyricsMaintenance,
      originMaintenance,
      posterMaintenance,
    }
  } finally {
    originMaintenanceRunning = false
    startupBackgroundRunning = false
  }
}

server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}/`
  console.log(`TypingManiaNovel local server: ${url}`)
  startupMaintenance = prepareLocalLibrary().then(() => {
    console.log(
      `Library: ${libraryStatus.songs} song(s), ` +
      `${libraryStatus.invalidFiles} invalid package(s)`,
    )
    return maintainLocalLibrary().catch(error => {
      console.error(
        `Background library maintenance failed: ${error.stack || error.message}`,
      )
    })
  }).catch(error => {
    updateStartupStatus({
      state: 'error',
      phase: 'error',
      message: 'Unable to prepare the local song library.',
      ready: false,
      error: {
        code: error.code || 'LOCAL_LIBRARY_STARTUP_FAILED',
        message: error.message,
      },
      completedAt: new Date().toISOString(),
    })
    console.error(`Local library startup failed: ${error.stack || error.message}`)
  })
  if (args.has('--open')) {
    if (process.platform === 'win32') {
      childProcess.spawn('explorer.exe', [url], {
        detached: true,
        windowsHide: true,
        stdio: 'ignore',
      }).unref()
    }
  }
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)))
}
