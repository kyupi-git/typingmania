import childProcess from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  rebuildSongIndex,
  resetLibraryToBaseline,
} from './local/library.js'
import {
  deleteLibrarySongs,
  inspectEditableLibrary,
  pruneUnusedLibraryCaches,
  recoverLibraryEditTransactions,
} from './local/library-editor.js'
import { importRecentQQMusicSongs } from './local/qqmusic-importer.js'
import { refreshQQMusicLyricsAndPace } from './local/lyrics-maintenance.js'
import {
  refreshOutdatedAnimePosters,
} from './local/poster-maintenance.js'
import { refreshMissingSongOrigins } from './local/song-origin-maintenance.js'
import { refreshQQMusicSongTitles } from './local/song-title-maintenance.js'
import { readPackedSongArtwork } from './local/packed-song-reader.js'

const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)))
const args = new Set(process.argv.slice(2))
const portArgument = process.argv.find(argument => argument.startsWith('--port='))
const PORT = Number(portArgument?.split('=')[1] || process.env.TMN_PORT || 8765)
const HOST = '127.0.0.1'
const SESSION_TOKEN = crypto.randomBytes(24).toString('base64url')
const INSTANCE_PROTOCOL = 1

const MIME_TYPES = {
  '.avif': 'image/avif',
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
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.typingmania': 'application/octet-stream',
  '.wav': 'audio/wav',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
}

let libraryStatus = {
  songs: 0,
  scannedFiles: 0,
  invalidFiles: 0,
  lastScan: null,
}
let importJob = {
  state: 'idle',
  phase: 'idle',
  message: 'Ready',
  result: null,
  error: null,
  startedAt: null,
  completedAt: null,
}
let libraryMutationRunning = false
let startupMaintenance = Promise.resolve()
let originMaintenanceRunning = false

function publicJob () {
  return JSON.parse(JSON.stringify(importJob))
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

function startImportJob (limit) {
  importJob = {
    state: 'running',
    phase: 'starting',
    message: 'Starting QQ Music import...',
    result: null,
    error: null,
    startedAt: new Date().toISOString(),
    completedAt: null,
  }

  startupMaintenance
    .catch(() => {})
    .then(() => importRecentQQMusicSongs({
      root: ROOT,
      limit,
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
      importJob = {
        ...importJob,
        state: 'error',
        phase: 'error',
        message: error.message || 'QQ Music import failed.',
        result: null,
        error: { code: error.code || 'QQMUSIC_IMPORT_FAILED', message: error.message },
        completedAt: new Date().toISOString(),
      }
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

async function handleApi (request, response, url) {
  const pathname = url.pathname
  if (
    request.method === 'GET' &&
    pathname === '/api/local/song-artwork'
  ) {
    return sendSongArtwork(request, response, url)
  }
  if (request.method === 'GET' && pathname === '/api/local/status') {
    return sendJson(response, 200, {
      available: true,
      instance: {
        protocol: INSTANCE_PROTOCOL,
        root: ROOT,
        features: [
          'keyfall-predictive',
          'library-editor',
          'song-artwork-preview',
          'graceful-shutdown',
        ],
      },
      token: SESSION_TOKEN,
      library: libraryStatus,
      import: publicJob(),
      maintenance: {
        origin: originMaintenanceRunning,
      },
    })
  }
  if (request.method === 'GET' && pathname === '/api/qqmusic/import/status') {
    if (!authorized(request)) return sendJson(response, 403, { error: 'Forbidden' })
    return sendJson(response, 200, publicJob())
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
  if (request.method === 'POST' && pathname === '/api/qqmusic/import') {
    if (!authorized(request)) return sendJson(response, 403, { error: 'Forbidden' })
    if (importJob.state === 'running') return sendJson(response, 409, publicJob())
    try {
      const body = await readJsonBody(request)
      const limit = Math.max(1, Math.min(20, Number(body.limit) || 20))
      startImportJob(limit)
      return sendJson(response, 202, publicJob())
    } catch (error) {
      return sendJson(response, 400, { error: error.message })
    }
  }
  if (request.method === 'POST' && pathname === '/api/library/rescan') {
    if (!authorized(request)) return sendJson(response, 403, { error: 'Forbidden' })
    await refreshLibrary()
    return sendJson(response, 200, libraryStatus)
  }
  if (request.method === 'GET' && pathname === '/api/library/editable') {
    if (!authorized(request)) return sendJson(response, 403, { error: 'Forbidden' })
    return sendJson(response, 200, await inspectEditableLibrary(ROOT))
  }
  if (request.method === 'POST' && pathname === '/api/library/delete') {
    if (!authorized(request)) return sendJson(response, 403, { error: 'Forbidden' })
    if (
      importJob.state === 'running' ||
      libraryMutationRunning ||
      originMaintenanceRunning
    ) {
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
    if (
      importJob.state === 'running' ||
      libraryMutationRunning ||
      originMaintenanceRunning
    ) {
      return sendJson(response, 409, { error: 'The local library is busy' })
    }
    try {
      const body = await readJsonBody(request)
      if (body.confirm !== 'RESTORE_STARTER_LIBRARY') {
        return sendJson(response, 400, { error: 'Explicit confirmation is required' })
      }
      libraryMutationRunning = true
      const result = await resetLibraryToBaseline(ROOT)
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

await recoverLibraryEditTransactions(ROOT)
await pruneUnusedLibraryCaches(ROOT).catch(() => {})
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
const lyricsMaintenance = await refreshQQMusicLyricsAndPace({
  root: ROOT,
  onProgress: progress => {
    console.log(`Lyrics and reference pace: ${progress.inspected}/${progress.total}`)
  },
})
if (lyricsMaintenance.inspected) {
  console.log(
    `Lyrics and reference pace: ${lyricsMaintenance.refreshed} refreshed, ` +
    `${lyricsMaintenance.removed} non-lyric line(s) removed, ` +
    `${lyricsMaintenance.failed} failed`,
  )
}
await refreshLibrary()
server.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}/`
  console.log(`TypingManiaNovel local server: ${url}`)
  console.log(`Library: ${libraryStatus.songs} song(s), ${libraryStatus.invalidFiles} invalid package(s)`)
  originMaintenanceRunning = true
  startupMaintenance = refreshMissingSongOrigins({
    root: ROOT,
    onProgress: progress => {
      console.log(`Original work titles: ${progress.inspected}/${progress.total}`)
    },
  }).then(async originMaintenance => {
    if (originMaintenance.inspected) {
      console.log(
        `Original work titles: ${originMaintenance.refreshed} refreshed, ` +
        `${originMaintenance.unresolved} unresolved, ` +
        `${originMaintenance.hidden} hidden, ${originMaintenance.failed} failed`,
      )
      await refreshLibrary()
    }
    const posterMaintenance = await refreshOutdatedAnimePosters({
      root: ROOT,
      onProgress: progress => {
        console.log(
          `Verified anime posters: ${progress.inspected}/${progress.total}`,
        )
      },
    })
    if (posterMaintenance.inspected) {
      console.log(
        `Verified anime posters: ${posterMaintenance.refreshed} refreshed, ` +
        `${posterMaintenance.removed} removed, ` +
        `${posterMaintenance.unavailable} deferred, ` +
        `${posterMaintenance.failed} failed`,
      )
      await refreshLibrary()
    }
    return { originMaintenance, posterMaintenance }
  }).catch(error => {
    console.error(`Original work title maintenance failed: ${error.message}`)
  }).finally(() => {
    originMaintenanceRunning = false
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
