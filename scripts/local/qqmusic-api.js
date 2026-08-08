import childProcess from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

import { analyzeSongTitle } from '../../src/song/song-title.js'
import * as qmcCrypto from '../../vendor/runtime/node_modules/@clamber_l/crypto/dist/loader.mjs'
import {
  filterLyricLines,
  longestCommonSubsequenceLength,
  normalizeLyricComparable,
} from './lyrics-quality.js'
import { fetchWithRetry } from './network.js'
import { extractLyricContent, parseTimedQrcLines } from './qqmusic-qrc.js'

const execFile = promisify(childProcess.execFile)
const SESSION_SCRIPT = fileURLToPath(new URL('./read-qqmusic-session.ps1', import.meta.url))
const POWERSHELL = process.env.TMN_POWERSHELL || 'powershell.exe'

const ERROR_MESSAGES = {
  QQMUSIC_NOT_RUNNING: 'Please start QQ Music and sign in, then try again.',
  QQMUSIC_ACCESS_DENIED: 'TypingManiaNovel cannot read QQ Music. Start both applications with the same Windows account.',
  QQMUSIC_NOT_LOGGED_IN: 'Please sign in to QQ Music, then try again.',
  QQMUSIC_SESSION_INVALID: 'The QQ Music session is not usable. Sign out and sign in again, then retry.',
  QQMUSIC_CACHE_NOT_FOUND: 'QQMusicCache was not found. Set QQMUSIC_CACHE_DIR or move the cache into the game folder.',
}

export class QQMusicImportError extends Error {
  constructor (code, message = ERROR_MESSAGES[code] || code) {
    super(message)
    this.name = 'QQMusicImportError'
    this.code = code
  }
}

export function interpretQQMusicSessionResult (result) {
  if (!result?.ok) {
    throw new QQMusicImportError(
      result?.error || 'QQMUSIC_SESSION_READ_FAILED',
    )
  }
  return {
    cookie: result.cookie,
    uin: String(result.uin),
    cachePaths: Array.isArray(result.cachePaths) ? result.cachePaths : [],
  }
}

function parseJsonOutput (stdout) {
  const lines = String(stdout || '').trim().split(/\r?\n/).filter(Boolean)
  for (let index = lines.length - 1; index >= 0; index--) {
    try {
      return JSON.parse(lines[index])
    } catch {}
  }
  return null
}

export async function readQQMusicSession () {
  if (process.platform !== 'win32') {
    throw new QQMusicImportError('QQMUSIC_WINDOWS_REQUIRED', 'QQ Music cache import currently requires Windows.')
  }

  let stdout = ''
  try {
    const result = await execFile(POWERSHELL, [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', SESSION_SCRIPT,
    ], { windowsHide: true, maxBuffer: 1024 * 1024, timeout: 60000 })
    stdout = result.stdout
  } catch (error) {
    stdout = error.stdout || ''
  }
  const result = parseJsonOutput(stdout)
  return interpretQQMusicSessionResult(result)
}

async function listDriveRoots () {
  if (process.platform !== 'win32') {
    return []
  }
  try {
    const { stdout } = await execFile(POWERSHELL, [
      '-NoProfile',
      '-Command',
      "@(Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DriveType -in 2,3 } | ForEach-Object { $_.DeviceID + '\\\\' }) | ConvertTo-Json -Compress",
    ], { windowsHide: true, timeout: 15000 })
    const value = JSON.parse(stdout.trim() || '[]')
    return Array.isArray(value) ? value : value ? [value] : []
  } catch {
    return []
  }
}

async function cacheStats (candidate) {
  const duty = path.join(candidate, 'downloadproxyNew', 'tp2p', '.tpfs', 'duty')
  const lyrics = path.join(candidate, 'QQMusicLyricNew')
  try {
    const [mediaEntries, lyricEntries] = await Promise.all([
      fs.readdir(duty, { withFileTypes: true }),
      fs.readdir(lyrics, { withFileTypes: true }),
    ])
    const mediaCount = mediaEntries.filter(entry => /\.m(?:flac|gg)$/i.test(entry.name)).length
    const lyricCount = lyricEntries.filter(entry => entry.isFile() && /_qm\.qrc$/i.test(entry.name)).length
    if (!mediaCount || !lyricCount) {
      return null
    }
    return { path: candidate, duty, lyrics, mediaCount, lyricCount }
  } catch {
    return null
  }
}

function extractCachePaths (buffer) {
  const output = new Set()
  for (const text of [buffer.toString('utf8'), buffer.toString('utf16le')]) {
    for (const match of text.matchAll(/[A-Za-z]:\\[^\x00\r\n"<>|?*]{0,700}?QQMusicCache/gi)) {
      output.add(match[0])
    }
  }
  return [...output]
}

async function findPathsInQQMusicConfig () {
  const roots = [
    process.env.APPDATA && path.join(process.env.APPDATA, 'Tencent', 'QQMusic'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Tencent', 'QQMusic'),
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'QQMusic'),
  ].filter(Boolean)
  const found = new Set()
  let inspected = 0

  async function inspect (directory, depth) {
    if (depth > 4 || inspected >= 250) return
    let entries
    try {
      entries = await fs.readdir(directory, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (inspected >= 250) break
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        await inspect(filename, depth + 1)
      } else if (entry.isFile()) {
        inspected++
        try {
          const stat = await fs.stat(filename)
          if (stat.size > 2 * 1024 * 1024) continue
          const buffer = await fs.readFile(filename)
          for (const candidate of extractCachePaths(buffer)) found.add(candidate)
        } catch {}
      }
    }
  }

  for (const root of roots) await inspect(root, 0)
  return [...found]
}

export async function discoverQQMusicCache (projectRoot, memoryPaths = []) {
  const candidates = []
  const seen = new Set()
  const add = candidate => {
    if (!candidate) return
    const resolved = path.resolve(candidate)
    const key = resolved.toLocaleLowerCase()
    if (!seen.has(key)) {
      seen.add(key)
      candidates.push(resolved)
    }
  }

  // Required discovery order: game folder first, then each drive root.
  add(path.join(projectRoot, 'QQMusicCache'))
  for (const drive of await listDriveRoots()) add(path.join(drive, 'QQMusicCache'))

  // Process-memory hints, an explicit environment override, and common locations
  // cover custom installations without recursively crawling users' disks.
  for (const candidate of memoryPaths) add(candidate)
  add(process.env.QQMUSIC_CACHE_DIR)
  const home = os.homedir()
  add(path.join(home, 'QQMusicCache'))
  add(path.join(home, 'Music', 'QQMusicCache'))
  add(path.join(home, 'Documents', 'QQMusicCache'))
  if (process.env.LOCALAPPDATA) add(path.join(process.env.LOCALAPPDATA, 'Tencent', 'QQMusic', 'QQMusicCache'))
  if (process.env.APPDATA) add(path.join(process.env.APPDATA, 'Tencent', 'QQMusic', 'QQMusicCache'))
  for (const candidate of await findPathsInQQMusicConfig()) add(candidate)

  for (const candidate of candidates) {
    const stats = await cacheStats(candidate)
    if (stats) return stats
  }
  throw new QQMusicImportError('QQMUSIC_CACHE_NOT_FOUND')
}

export async function discoverQQMusicDownloadDirectories (
  projectRoot,
  { cachePath = '', memoryPaths = [] } = {},
) {
  const candidates = []
  const seen = new Set()
  const add = value => {
    if (!value) return
    const resolved = path.resolve(value)
    const key = resolved.toLocaleLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    candidates.push(resolved)
  }
  add(process.env.QQMUSIC_DOWNLOAD_DIR)
  add(path.join(projectRoot, 'QQMusicDownloads'))
  add(path.join(projectRoot, 'QQMusic'))
  const home = os.homedir()
  add(path.join(home, 'Music', 'QQMusic'))
  add(path.join(home, 'Music', 'QQ音乐'))
  add(path.join(home, 'Downloads', 'QQMusic'))
  if (cachePath) {
    const parent = path.dirname(cachePath)
    add(path.join(parent, 'QQMusic'))
    add(path.join(parent, 'QQMusicDownload'))
    add(path.join(parent, 'QQMusicDownloads'))
  }
  for (const memoryPath of memoryPaths) {
    const parent = path.dirname(memoryPath)
    add(path.join(parent, 'QQMusic'))
    add(path.join(parent, 'QQMusicDownload'))
  }
  for (const drive of await listDriveRoots()) {
    add(path.join(drive, 'QQMusic'))
    add(path.join(drive, 'QQMusicDownload'))
    add(path.join(drive, 'QQ音乐'))
  }
  const existing = []
  for (const candidate of candidates) {
    try {
      if ((await fs.stat(candidate)).isDirectory()) existing.push(candidate)
    } catch {}
  }
  return existing
}

function qqHeaders (cookie) {
  return {
    'User-Agent': 'QQMusic/21',
    Cookie: cookie,
  }
}

export function isQQMusicNetworkError (error) {
  return (
    error?.name === 'TimeoutError' ||
    error?.name === 'AbortError' ||
    error instanceof TypeError ||
    /(?:fetch failed|network|socket|timed? ?out|econn|enotfound|dns)/iu
      .test(error?.message || '')
  )
}

function languageCode (value) {
  return ({ 1: 'ZH', 2: 'ZH', 3: 'JP', 4: 'KO', 5: 'EN' })[Number(value)] || 'U'
}

export async function fetchTrackMetadata (mediaMid, cookie) {
  const url = new URL('https://c.y.qq.com/v8/fcg-bin/fcg_play_single_song.fcg')
  url.searchParams.set('songmid', mediaMid)
  url.searchParams.set('format', 'json')
  const response = await fetchWithRetry(globalThis.fetch, url, {
    headers: qqHeaders(cookie),
  }, {
    timeoutMs: 6500,
    perAttemptMs: 3400,
  })
  if (!response.ok) throw new Error(`metadata HTTP ${response.status}`)
  const payload = await response.json()
  const raw = payload.data?.[0]
  if (!raw?.mid || !raw.file) throw new Error('metadata is unavailable')
  const language = languageCode(raw.language)
  const rawTitle = raw.title || raw.name || ''
  const titleCleanup = analyzeSongTitle(rawTitle, { language })
  const artists = (raw.singer || [])
    .map(singer => ({
      id: Number(singer.id) || 0,
      mid: String(singer.mid || ''),
      name: String(singer.name || singer.title || '').trim(),
    }))
    .filter(artist => artist.name)
  const artistNames = artists.map(artist => artist.name)
  return {
    songId: String(raw.id || ''),
    songMid: raw.mid,
    mediaMid: raw.file.media_mid || mediaMid,
    title: titleCleanup.title,
    rawTitle,
    titleCleanup,
    subtitle: raw.subtitle || '',
    artist: artistNames.join(' / '),
    artistNames,
    rawArtistNames: artistNames,
    artists,
    album: raw.album?.title || '',
    albumMid: raw.album?.mid || '',
    mvId: String(raw.mv?.vid || raw.mv?.id || ''),
    duration: Number(raw.interval) || 0,
    expectedFlacBytes: Number(raw.file.size_flac) || 0,
    language,
  }
}

export async function fetchTrackMetadataWithFallback (
  mediaMid,
  cookie,
  {
    hints = [],
    searchCache = new Map(),
    candidateCache = new Map(),
    batchSize = 4,
    fetchMetadata = fetchTrackMetadata,
    searchTracks = searchQQMusicTracks,
  } = {},
) {
  let directError = null
  let networkFailure = false
  try {
    return await fetchMetadata(mediaMid, cookie)
  } catch (error) {
    directError = error
    networkFailure = isQQMusicNetworkError(error)
  }

  const resolveCandidate = async candidate => {
    if (!candidate?.songMid) return null
    const metadata = await fetchMetadata(candidate.songMid, cookie)
    if (!metadata?.mediaMid || String(metadata.mediaMid) !== String(mediaMid)) {
      throw new Error('recovered metadata media ID does not match cached media')
    }
    return metadata
  }
  if (candidateCache.has(mediaMid)) {
    try {
      return await resolveCandidate(candidateCache.get(mediaMid))
    } catch {}
  }

  const uniqueHints = []
  const seenQueries = new Set()
  for (const hint of hints) {
    const query = `${hint?.title || ''} ${hint?.artist || ''}`.trim()
    const normalized = query.normalize('NFKC').toLocaleLowerCase()
    if (!normalized || seenQueries.has(normalized)) continue
    seenQueries.add(normalized)
    uniqueHints.push(query)
  }
  // QRC catalogs can be very large; bounded hint recovery keeps imports responsive.
  uniqueHints.splice(12)
  const width = Math.max(1, Math.min(6, Number(batchSize) || 4))
  for (let offset = 0; offset < uniqueHints.length; offset += width) {
    const batch = uniqueHints.slice(offset, offset + width)
    const outcomes = await Promise.allSettled(batch.map(async query => {
      if (!searchCache.has(query)) {
        searchCache.set(query, Promise.resolve(
          searchTracks(query, cookie, { limit: 30 }),
        ))
      }
      try {
        const candidates = await searchCache.get(query)
        searchCache.set(query, candidates)
        return candidates
      } catch (error) {
        if (isQQMusicNetworkError(error)) networkFailure = true
        searchCache.delete(query)
        throw error
      }
    }))
    for (const outcome of outcomes) {
      if (outcome.status !== 'fulfilled') continue
      for (const candidate of outcome.value) {
        if (candidate.mediaMid && !candidateCache.has(candidate.mediaMid)) {
          candidateCache.set(candidate.mediaMid, candidate)
        }
      }
    }
    if (candidateCache.has(mediaMid)) {
      try {
        return await resolveCandidate(candidateCache.get(mediaMid))
      } catch {}
    }
  }
  if (directError && !networkFailure) directError.code = 'QQMUSIC_METADATA_UNAVAILABLE'
  throw directError || new Error('metadata is unavailable')
}

export async function fetchTrackEkey ({ metadata, localFilename, cookie, uin }) {
  const body = {
    comm: {
      cv: 4747474,
      ct: 24,
      format: 'json',
      uin: Number(uin),
      g_tk: 5381,
    },
    req_1: {
      module: 'vkey.GetVkeyServer',
      method: 'CgiGetVkey',
      param: {
        filename: [localFilename],
        guid: '10000',
        songmid: [metadata.songMid],
        songtype: [0],
        uin,
        loginflag: 1,
        platform: '20',
      },
    },
  }
  const response = await fetchWithRetry(
    globalThis.fetch,
    'https://u.y.qq.com/cgi-bin/musicu.fcg',
    {
    method: 'POST',
    headers: { ...qqHeaders(cookie), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    },
    {
      timeoutMs: 6500,
      perAttemptMs: 3400,
    },
  )
  if (!response.ok) throw new Error(`ekey HTTP ${response.status}`)
  const payload = await response.json()
  const ekey = payload.req_1?.data?.midurlinfo?.[0]?.ekey || ''
  if (!ekey) {
    throw new Error(
      'QQ Music did not grant access to this track for the signed-in account',
    )
  }
  return ekey
}

function validImage (buffer) {
  if (buffer.length < 1024) return false
  return (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer.at(-2) === 0xFF && buffer.at(-1) === 0xD9) ||
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) ||
    (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP')
}

export async function fetchOfficialCover (albumMid, cookie) {
  if (!albumMid) throw new Error('album MID is unavailable')
  const url = `https://y.gtimg.cn/music/photo_new/T002R500x500M000${encodeURIComponent(albumMid)}_1.jpg`
  const response = await fetchWithRetry(globalThis.fetch, url, {
    headers: qqHeaders(cookie),
  }, {
    timeoutMs: 4500,
    perAttemptMs: 2400,
  })
  if (!response.ok) throw new Error(`cover HTTP ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  if (!validImage(buffer)) throw new Error('official cover is not a valid image')
  const contentType = response.headers.get('content-type') || ''
  const extension = contentType.includes('png') ? '.png' : contentType.includes('webp') ? '.webp' : '.jpg'
  return { buffer, extension, verifiedOnline: true }
}

function stripSearchMarkup (value) {
  return String(value || '').replace(/<[^>]*>/g, '')
}

export async function searchQQMusicTracks (
  query,
  cookie,
  { limit = 20, timeoutMs = 6000 } = {},
) {
  const value = String(query || '').trim()
  if (!value) return []
  const url = new URL('https://c.y.qq.com/soso/fcgi-bin/client_search_cp')
  url.searchParams.set('p', '1')
  url.searchParams.set('n', String(limit))
  url.searchParams.set('format', 'json')
  url.searchParams.set('w', value)
  const response = await fetchWithRetry(globalThis.fetch, url, {
    headers: {
      ...qqHeaders(cookie),
      Referer: 'https://y.qq.com/',
    },
  }, {
    timeoutMs,
    perAttemptMs: Math.max(1000, Math.ceil(timeoutMs / 2)),
  })
  if (!response.ok) throw new Error(`search HTTP ${response.status}`)
  const payload = await response.json()
  return (payload.data?.song?.list || []).map(raw => {
    const artistNames = (raw.singer || [])
      .map(artist => stripSearchMarkup(artist.name))
      .filter(Boolean)
    return {
      songId: String(raw.songid || raw.id || ''),
      songMid: raw.songmid || '',
      mediaMid: raw.strMediaMid || raw.media_mid || raw.file?.media_mid || '',
      title: stripSearchMarkup(raw.songname),
      artist: artistNames.join(' / '),
      artistNames,
      album: stripSearchMarkup(raw.albumname),
      albumMid: raw.albummid || '',
      duration: Number(raw.interval) || 0,
    }
  })
}

export function parseOfficialLyricLines (
  lyric,
  metadata,
  { romanized = false } = {},
) {
  const timed = []
  const plain = []
  for (const rawLine of lyric.split(/\r?\n/)) {
    const match = rawLine.match(/^\[(\d+):(\d+(?:\.\d+)?)\]([\s\S]*)$/)
    if (match) {
      timed.push({
        start: Number(match[1]) * 60_000 + Number(match[2]) * 1000,
        text: match[3].trim(),
      })
    } else if (rawLine.trim() && !rawLine.trim().startsWith('[')) {
      plain.push({ start: 0, text: rawLine.trim() })
    }
  }
  const candidates = timed.length ? timed : plain
  const lines = filterLyricLines(candidates, metadata, { romanized }).kept
  const durationMs = Number(metadata.duration) > 0 ? Number(metadata.duration) * 1000 : 0
  return lines.map((line, index) => ({
    ...line,
    end: lines[index + 1]?.start ?? (durationMs || null),
  }))
}

function decodeServiceLyric (value) {
  const text = String(value || '')
  if (
    text &&
    !text.includes('[') &&
    text.length % 4 === 0 &&
    /^[A-Za-z0-9+/=\r\n]+$/.test(text)
  ) {
    const decoded = Buffer.from(text, 'base64').toString('utf8')
    if (decoded.includes('[') || /[\r\n]/u.test(decoded)) return decoded
  }
  return text
}

export function parseOfficialLyricsPayload (payload, metadata = {}) {
  const lyric = decodeServiceLyric(payload?.lyric)
  const roma = decodeServiceLyric(
    payload?.roma || payload?.romanization || payload?.roma_lyric,
  )
  const lines = parseOfficialLyricLines(lyric, metadata)
  const readingLines = parseOfficialLyricLines(roma, metadata, {
    romanized: true,
  })
  return {
    checked: lines.length > 0,
    lines,
    reason: lines.length ? null : 'official lyrics unavailable',
    readingChecked: readingLines.length > 0,
    readingLines,
    readingReason: readingLines.length
      ? null
      : 'official pronunciation unavailable',
    networkFailed: false,
  }
}

export function compareOfficialLyrics (localLines, officialResult) {
  if (!officialResult.checked) {
    return officialResult
  }
  const official = officialResult.lines
    .map(line => normalizeLyricComparable(line.text))
    .filter(line => line.length >= 2)
    .join('')
  const local = localLines.map(normalizeLyricComparable).filter(line => line.length >= 2).join('')
  if (!official.length || !local.length) {
    return { checked: false, reason: 'official lyrics unavailable' }
  }
  const matchedCharacters = longestCommonSubsequenceLength(local, official)
  const localCoverage = matchedCharacters / local.length
  const officialCoverage = matchedCharacters / official.length
  return {
    checked: true,
    matchedCharacters,
    localCharacters: local.length,
    officialCharacters: official.length,
    localCoverage,
    officialCoverage,
    passed: localCoverage >= 0.995 && officialCoverage >= 0.995,
  }
}

export async function fetchOfficialLyrics (songMid, cookie, metadata = {}) {
  try {
    const url = new URL('https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg')
    url.searchParams.set('songmid', songMid)
    url.searchParams.set('format', 'json')
    url.searchParams.set('nobase64', '1')
    url.searchParams.set('roma', '1')
    const response = await fetchWithRetry(globalThis.fetch, url, {
      headers: { ...qqHeaders(cookie), Referer: 'https://y.qq.com/' },
    }, {
      timeoutMs: 4500,
      perAttemptMs: 2400,
    })
    if (!response.ok) {
      const reason = `HTTP ${response.status}`
      return {
        checked: false,
        lines: [],
        reason,
        readingChecked: false,
        readingLines: [],
        readingReason: reason,
        networkFailed: (
          response.status >= 500 ||
          [408, 425, 429].includes(Number(response.status))
        ),
      }
    }
    const payload = await response.json()
    return parseOfficialLyricsPayload(payload, metadata)
  } catch (error) {
    return {
      checked: false,
      lines: [],
      reason: error.message,
      readingChecked: false,
      readingLines: [],
      readingReason: error.message,
      networkFailed: isQQMusicNetworkError(error),
    }
  }
}

function decodedPcQrc (xml, fieldName) {
  const match = String(xml || '').match(
    new RegExp(`<${fieldName}>([\\s\\S]*?)<\\/${fieldName}>`, 'iu'),
  )
  const hex = String(match?.[1] || '')
    .replace(/^\s*<!\[CDATA\[/u, '')
    .replace(/\]\]>\s*$/u, '')
    .trim()
  if (!hex || hex.length % 2 || !/^[a-f0-9]+$/iu.test(hex)) return ''
  const decrypted = qmcCrypto.decryptQRCFile(Buffer.from(hex, 'hex'))
  return new TextDecoder().decode(decrypted)
}

export async function fetchQQMusicPcLyrics (
  songId,
  cookie,
  metadata = {},
) {
  if (!/^\d+$/u.test(String(songId || ''))) {
    throw new Error('QQ Music numeric song ID is unavailable')
  }
  const url = new URL('https://c.y.qq.com/qqmusic/fcgi-bin/lyric_download.fcg')
  url.searchParams.set('version', '15')
  url.searchParams.set('miniversion', '82')
  url.searchParams.set('lrctype', '4')
  url.searchParams.set('musicid', String(songId))
  const response = await fetchWithRetry(globalThis.fetch, url, {
    headers: { ...qqHeaders(cookie), Referer: 'https://y.qq.com/' },
  }, {
    timeoutMs: 5000,
    perAttemptMs: 2700,
  })
  if (!response.ok) throw new Error(`PC lyric HTTP ${response.status}`)
  const xml = await response.text()
  const parse = fieldName => {
    const qrc = decodedPcQrc(xml, fieldName)
    return qrc ? parseTimedQrcLines(extractLyricContent(qrc)) : []
  }
  const lines = filterLyricLines(parse('content'), metadata).kept
  const readingLines = filterLyricLines(
    parse('contentroma'),
    metadata,
    { romanized: true },
  ).kept
  return {
    checked: lines.length > 0,
    lines,
    reason: lines.length ? null : 'QQ Music PC lyrics unavailable',
    readingChecked: readingLines.length > 0,
    readingLines,
    readingReason: readingLines.length
      ? null
      : 'QQ Music PC pronunciation unavailable',
    networkFailed: false,
  }
}

export async function fetchBestQQMusicLyrics ({
  songMid,
  songId = '',
  cookie = '',
  metadata = {},
}) {
  const web = await fetchOfficialLyrics(songMid, cookie, metadata)
  if (web.readingLines.length || !songId) return web
  try {
    const pc = await fetchQQMusicPcLyrics(songId, cookie, metadata)
    return {
      ...web,
      checked: pc.checked || web.checked,
      lines: pc.lines.length ? pc.lines : web.lines,
      reason: pc.lines.length ? null : web.reason,
      readingChecked: pc.readingChecked,
      readingLines: pc.readingLines,
      readingReason: pc.readingReason,
      networkFailed: false,
    }
  } catch {
    return web
  }
}

export async function verifyOfficialLyrics (songMid, localLines, cookie, metadata = {}) {
  const official = await fetchOfficialLyrics(songMid, cookie, metadata)
  return compareOfficialLyrics(localLines, official)
}

export { validImage }
