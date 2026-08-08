import childProcess from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

import {
  readPackedSongBinary,
  readPackedSongMetadata,
} from './packed-song-reader.js'
import {
  alignAudioEnvelopes,
  pcmEnergyEnvelope,
} from './mv-alignment.js'
import {
  fetchAnimeThemesProductionVideo,
} from './animethemes-api.js'
import {
  inferNetworkRegion,
  rankedNetworkSources,
} from './network-source-planner.js'
import { canonicalSongTitle } from './song-identity.js'

const execFile = promisify(childProcess.execFile)
const MAX_MV_BYTES = 600 * 1024 * 1024
const MAX_RESOLUTION_MS = 120_000
const MUSIC_VIDEO_CACHE_VERSION = 2
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mkv', '.mov'])

function normalize (value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]/gu, '')
}

function artistTokens (value) {
  return String(value || '')
    .split(/\s*(?:\/|&|、|,|feat(?:uring)?\.?)\s*/iu)
    .map(normalize)
    .filter(token => token.length >= 2)
}

function artistMatches (expected, candidate) {
  const left = artistTokens(expected)
  const right = artistTokens(candidate)
  return left.length > 0 && left.some(token => (
    right.some(other => token === other || (
      Math.min(token.length, other.length) >= 4 &&
      (token.includes(other) || other.includes(token))
    ))
  ))
}

export function candidateMetadataScore (song, candidate) {
  const expectedTitle = canonicalSongTitle(song.title)
  const candidateTitle = canonicalSongTitle(candidate.title)
  if (!expectedTitle || !candidateTitle) return -Infinity
  const titleMatches = candidateTitle.includes(expectedTitle) ||
    expectedTitle.includes(candidateTitle)
  const candidateArtistEvidence = [
    candidate.artist,
    candidate.uploader,
    candidate.title,
  ].filter(Boolean).join(' ')
  if (!titleMatches || !artistMatches(song.artist, candidateArtistEvidence)) {
    return -Infinity
  }
  const duration = Number(candidate.duration) || 0
  const songDuration = Number(song.duration) || 0
  if (
    duration > 0 &&
    songDuration > 0 &&
    (duration < songDuration - 18 || duration > songDuration + 75)
  ) {
    return -Infinity
  }
  const label = `${candidate.title || ''} ${candidate.description || ''}`
  // Passing the strict title/artist gate should leave enough margin for the
  // normal one-to-two-second duration rounding difference between catalogs.
  let score = 110
  if (/\b(?:official|mv|music video|op|opening|ed|ending)\b|公式|官方|主題歌|主题曲|뮤직비디오/iu.test(label)) score += 30
  const originTitle = song.origin?.original_title || song.origin?.work_title
  if (originTitle && normalize(label).includes(normalize(originTitle))) {
    score += 28
  }
  if (/\b(?:cover|reaction|live|nightcore|slowed|sped up|remix|instrumental|karaoke)\b|翻唱|演奏してみた|歌ってみた/iu.test(label)) score -= 90
  if (duration && songDuration) score -= Math.abs(duration - songDuration) * 0.4
  return score
}

export function productionMetadataScore (song, candidate) {
  if (candidate.source === 'animethemes') return 220
  const origin = normalize(song.origin?.original_title || song.origin?.work_title)
  const label = `${candidate.title || ''} ${candidate.description || ''}`
  const normalizedLabel = normalize(label)
  if (!origin || !normalizedLabel.includes(origin)) return -Infinity
  if (
    /\b(?:reaction|review|gameplay|cover|live|nightcore|remix)\b|翻唱|解说|解説|実況|剪辑|切り抜き|\bAMV\b|\bMAD\b/iu
      .test(label)
  ) {
    return -Infinity
  }
  const duration = Number(candidate.duration) || 0
  if (duration && (duration < 20 || duration > 1800)) return -Infinity
  let score = 100
  if (
    /\b(?:official|trailer|teaser|opening|ending|op|ed|pv)\b|公式|官方|预告|予告|片头|片尾|ノンクレジット/iu
      .test(label)
  ) {
    score += 35
  }
  if (candidate.source === 'animethemes') score += 80
  return score
}

function runtimePaths (root) {
  return {
    python: path.join(
      root,
      'tools',
      'importers',
      'apple-music',
      'runtime',
      'python.exe',
    ),
    ffmpeg: path.join(root, 'tools', 'media', 'ffmpeg.exe'),
  }
}

async function exists (filename) {
  try {
    return (await fs.stat(filename)).isFile()
  } catch {
    return false
  }
}

async function runYtDlp (python, args, options = {}) {
  const { stdout } = await execFile(
    python,
    ['-m', 'yt_dlp', '--no-warnings', '--no-playlist', ...args],
    {
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
      timeout: options.timeout || 25_000,
      signal: options.signal,
    },
  )
  return stdout
}

function flattenYtDlpPayload (payload, source) {
  const entries = payload?.entries || [payload]
  return entries.filter(Boolean).map(entry => ({
    source,
    id: String(entry.id || ''),
    webpageUrl: String(entry.webpage_url || entry.original_url || ''),
    title: String(entry.title || ''),
    uploader: String(
      entry.artist || entry.creator || entry.uploader || entry.channel || '',
    ),
    artist: String(entry.artist || ''),
    description: String(entry.description || ''),
    duration: Number(entry.duration) || 0,
  })).filter(candidate => candidate.webpageUrl)
}

async function inspectSource (python, source, signal) {
  const stdout = await runYtDlp(
    python,
    ['--dump-single-json', '--skip-download', source.url],
    { signal, timeout: 22_000 },
  )
  return flattenYtDlpPayload(JSON.parse(stdout), source.id)
}

function providerSources (song) {
  const source = song.source || {}
  const service = String(source.service || '')
  const values = []
  if (service === 'netease' && /^\d+$/u.test(String(source.mv_id || ''))) {
    values.push({
      id: 'netease',
      url: `https://music.163.com/#/mv?id=${source.mv_id}`,
    })
  }
  if (
    service === 'qqmusic' &&
    /^[A-Za-z0-9]+$/u.test(String(source.mv_id || source.mv_vid || ''))
  ) {
    values.push({
      id: 'qqmusic',
      url: `https://y.qq.com/n/ryqq/mv/${source.mv_id || source.mv_vid}`,
    })
  }
  if (/^https?:\/\//iu.test(String(source.mv_url || ''))) {
    values.push({ id: service || 'provider', url: source.mv_url })
  }
  return values
}

function publicSources (song, region) {
  const origin = String(song.origin?.original_title || '').trim()
  const query = [
    `"${song.title}"`,
    song.artist,
    origin,
    'official music video',
  ].filter(Boolean).join(' ')
  return rankedNetworkSources([
    {
      id: 'bilibili',
      url: `bilisearch5:${query}`,
      priority: 32,
      regionalPriority: { cn: 72, hk: 32, tw: 22, jp: 4, us: 10, global: -5 },
    },
    {
      id: 'youtube',
      url: `ytsearch5:${query}`,
      priority: 30,
      regionalPriority: { jp: 48, us: 52, eu: 48, global: 42, cn: -80 },
    },
    {
      id: 'niconico',
      url: `nicosearch5:${query}`,
      priority: 22,
      regionalPriority: { jp: 48, hk: 18, tw: 18, us: 8, global: 5, cn: -85 },
    },
  ], { region })
}

function productionPublicSources (song, region) {
  const origin = String(
    song.origin?.original_title || song.origin?.work_title || '',
  ).trim()
  if (!origin) return []
  const query = `"${origin}" official trailer opening ending PV`
  return publicSources({
    title: origin,
    artist: '',
    origin: {},
  }, region).map(source => ({
    ...source,
    id: `${source.id}-production`,
    url: source.url.replace(/:[\s\S]*$/u, `:${query}`),
  }))
}

export function plannedMusicVideoSources (song, region) {
  return [
    ...providerSources(song),
    ...publicSources(song, region),
  ]
}

export function musicVideoCacheKey (songFilename, song) {
  const providerIds = [
    song.source?.song_mid,
    song.source?.track_id,
    song.source?.media_mid,
    song.source?.netease_track_id,
  ].map(value => String(value || '').trim()).filter(Boolean)
  return crypto.createHash('sha256').update(JSON.stringify({
    cacheVersion: MUSIC_VIDEO_CACHE_VERSION,
    filename: providerIds.length ? '' : path.basename(songFilename),
    service: song.source?.service || '',
    providerIds,
    title: providerIds.length ? '' : normalize(song.title),
    artist: providerIds.length ? '' : normalize(song.artist),
    duration: providerIds.length ? 0 : Math.round(Number(song.duration) || 0),
  })).digest('hex').slice(0, 24)
}

function legacyMusicVideoCacheKey (songFilename, stat, song) {
  return crypto.createHash('sha256').update(JSON.stringify({
    cacheVersion: MUSIC_VIDEO_CACHE_VERSION,
    filename: path.basename(songFilename),
    size: stat.size,
    modified: Math.trunc(stat.mtimeMs),
    title: song.title,
    artist: song.artist,
    origin: {
      title: song.origin?.work_title || '',
      catalog: song.origin?.catalog || '',
      id: song.origin?.catalog_id || '',
      role: song.origin?.role || '',
      sequence: song.origin?.sequence || '',
    },
  })).digest('hex').slice(0, 24)
}

async function extractPcm (ffmpeg, input, output, signal) {
  await execFile(ffmpeg, [
    '-nostdin',
    '-hide_banner',
    '-loglevel', 'error',
    '-i', input,
    '-vn',
    '-ac', '1',
    '-ar', '8000',
    '-f', 'f32le',
    '-y',
    output,
  ], {
    windowsHide: true,
    timeout: 90_000,
    signal,
  })
  const buffer = await fs.readFile(output)
  const sampleCount = Math.floor(buffer.byteLength / 4)
  const samples = new Float32Array(sampleCount)
  for (let index = 0; index < sampleCount; index++) {
    samples[index] = buffer.readFloatLE(index * 4)
  }
  return samples
}

async function verifyAlignment ({
  ffmpeg,
  songFilename,
  song,
  videoFilename,
  staging,
  signal,
}) {
  const entryName = String(song.audio || song.video || '')
  if (!entryName) return null
  const sourceExtension = path.extname(entryName) || '.bin'
  const sourceFilename = path.join(staging, `source${sourceExtension}`)
  const songPcmFilename = path.join(staging, 'song.f32le')
  const videoPcmFilename = path.join(staging, 'video.f32le')
  await fs.writeFile(
    sourceFilename,
    await readPackedSongBinary(songFilename, entryName),
  )
  const [songPcm, videoPcm] = await Promise.all([
    extractPcm(ffmpeg, sourceFilename, songPcmFilename, signal),
    extractPcm(ffmpeg, videoFilename, videoPcmFilename, signal),
  ])
  return alignAudioEnvelopes(
    pcmEnergyEnvelope(songPcm),
    pcmEnergyEnvelope(videoPcm),
  )
}

async function downloadCandidate ({
  python,
  ffmpeg,
  candidate,
  cacheDirectory,
  key,
  signal,
}) {
  const template = path.join(cacheDirectory, `${key}.download.%(ext)s`)
  await runYtDlp(python, [
    '--max-filesize', String(MAX_MV_BYTES),
    '--ffmpeg-location', ffmpeg,
    // Never fall back to an audio-only result. A previous generic fallback
    // produced a valid WebM container with no video frames, which browsers
    // correctly rendered as a black screen.
    '--format', 'bv*[vcodec!=none]+ba/b[vcodec!=none]',
    '--merge-output-format', 'mp4',
    '--output', template,
    candidate.webpageUrl,
  ], { signal, timeout: 180_000 })
  const files = await fs.readdir(cacheDirectory)
  const downloaded = files
    .filter(filename => filename.startsWith(`${key}.download.`))
    .map(filename => path.join(cacheDirectory, filename))
    .find(filename => VIDEO_EXTENSIONS.has(path.extname(filename).toLocaleLowerCase()))
  if (!downloaded) throw new Error('video download did not produce a playable file')
  return downloaded
}

async function makeCompatibleVideo ({
  ffmpeg,
  input,
  output,
  staging,
  signal,
}) {
  await fs.rm(output, { force: true }).catch(() => {})
  await execFile(ffmpeg, [
    '-nostdin',
    '-hide_banner',
    '-loglevel', 'error',
    '-i', input,
    '-map', '0:v:0',
    '-vf', 'scale=1280:-2:force_original_aspect_ratio=decrease',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '23',
    '-pix_fmt', 'yuv420p',
    '-an',
    '-movflags', '+faststart',
    '-y',
    output,
  ], {
    windowsHide: true,
    timeout: 120_000,
    signal,
  })
  const frame = path.join(staging, 'video-probe.jpg')
  await fs.rm(frame, { force: true }).catch(() => {})
  await execFile(ffmpeg, [
    '-nostdin',
    '-hide_banner',
    '-loglevel', 'error',
    '-ss', '0.2',
    '-i', output,
    '-map', '0:v:0',
    '-frames:v', '1',
    '-q:v', '4',
    '-y',
    frame,
  ], {
    windowsHide: true,
    timeout: 20_000,
    signal,
  })
  const [videoStat, frameStat] = await Promise.all([
    fs.stat(output),
    fs.stat(frame),
  ])
  if (videoStat.size < 4096 || frameStat.size < 256) {
    throw new Error('MV has no usable video frames')
  }
  return output
}

export async function readCachedMusicVideoResolution (cacheDirectory, key) {
  const manifestFilename = path.join(cacheDirectory, `${key}.json`)
  try {
    const manifest = JSON.parse(await fs.readFile(manifestFilename, 'utf8'))
    const videoFilename = path.join(cacheDirectory, path.basename(manifest.filename))
    if (
      manifest.version !== MUSIC_VIDEO_CACHE_VERSION ||
      path.extname(videoFilename).toLocaleLowerCase() !== '.mp4' ||
      !await exists(videoFilename)
    ) {
      await fs.rm(videoFilename, { force: true }).catch(() => {})
      await fs.rm(manifestFilename, { force: true }).catch(() => {})
      return null
    }
    return { ...manifest, key }
  } catch {
    return null
  }
}

async function writeCacheManifest (cacheDirectory, key, manifest) {
  const target = path.join(cacheDirectory, `${key}.json`)
  const temporary = path.join(
    cacheDirectory,
    `${key}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`,
  )
  try {
    await fs.writeFile(temporary, JSON.stringify(manifest, null, 2))
    await fs.rm(target, { force: true })
    await fs.rename(temporary, target)
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {})
  }
}

async function migrateCachedResolution (cacheDirectory, cached, key) {
  if (!cached || cached.key === key) return cached
  const previousManifest = path.join(cacheDirectory, `${cached.key}.json`)
  const previousVideo = path.join(
    cacheDirectory,
    path.basename(cached.filename),
  )
  const filename = `${key}.mp4`
  const video = path.join(cacheDirectory, filename)
  const manifest = { ...cached, filename }
  delete manifest.key
  await fs.rm(video, { force: true }).catch(() => {})
  await fs.rename(previousVideo, video)
  try {
    await writeCacheManifest(cacheDirectory, key, manifest)
    await fs.rm(previousManifest, { force: true }).catch(() => {})
    return { ...manifest, key }
  } catch (error) {
    await fs.rename(video, previousVideo).catch(() => {})
    throw error
  }
}

export async function pruneLegacyMusicVideoCache (cacheDirectory) {
  const entries = await fs.readdir(cacheDirectory, {
    withFileTypes: true,
  }).catch(() => [])
  const referenced = new Set()
  const removals = []
  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name) !== '.json') continue
    const manifestFilename = path.join(cacheDirectory, entry.name)
    try {
      const manifest = JSON.parse(await fs.readFile(manifestFilename, 'utf8'))
      const filename = path.basename(String(manifest.filename || ''))
      if (
        manifest.version === MUSIC_VIDEO_CACHE_VERSION &&
        path.extname(filename).toLocaleLowerCase() === '.mp4'
      ) {
        referenced.add(filename)
        continue
      }
      if (filename) {
        removals.push(fs.rm(path.join(cacheDirectory, filename), {
          force: true,
        }).catch(() => {}))
      }
      removals.push(fs.rm(manifestFilename, { force: true }).catch(() => {}))
    } catch {
      removals.push(fs.rm(manifestFilename, { force: true }).catch(() => {}))
    }
  }
  for (const entry of entries) {
    if (
      entry.isFile() &&
      VIDEO_EXTENSIONS.has(path.extname(entry.name).toLocaleLowerCase()) &&
      path.extname(entry.name).toLocaleLowerCase() !== '.mp4' &&
      !referenced.has(entry.name)
    ) {
      removals.push(fs.rm(path.join(cacheDirectory, entry.name), {
        force: true,
      }).catch(() => {}))
    }
  }
  await Promise.all(removals)
}

async function persistCompatibleVideo ({
  ffmpeg,
  downloaded,
  cacheDirectory,
  staging,
  key,
  candidate,
  mode,
  alignment = null,
  signal,
}) {
  const compatible = path.join(staging, `${mode}.mp4`)
  await makeCompatibleVideo({
    ffmpeg,
    input: downloaded,
    output: compatible,
    staging,
    signal,
  })
  const filename = `${key}.mp4`
  const finalFilename = path.join(cacheDirectory, filename)
  await fs.rm(finalFilename, { force: true }).catch(() => {})
  await fs.rename(compatible, finalFilename)
  const manifest = {
    version: MUSIC_VIDEO_CACHE_VERSION,
    filename,
    mode,
    loop: mode === 'production-loop',
    source: candidate.source,
    sourceUrl: candidate.webpageUrl,
    title: candidate.title,
    offsetSeconds: alignment?.offsetSeconds || 0,
    correlation: alignment?.correlation || undefined,
    coverage: alignment?.coverage || undefined,
    verifiedAt: new Date().toISOString(),
  }
  await writeCacheManifest(cacheDirectory, key, manifest)
  return manifest
}

export async function resolveSongMusicVideo ({
  root,
  songFilename,
  signal,
  onProgress = () => {},
}) {
  const song = await readPackedSongMetadata(songFilename)
  const stat = await fs.stat(songFilename)
  const key = musicVideoCacheKey(songFilename, song)
  const legacyKey = legacyMusicVideoCacheKey(songFilename, stat, song)
  const cacheDirectory = path.join(root, 'data', 'mv-cache')
  await fs.mkdir(cacheDirectory, { recursive: true })
  await pruneLegacyMusicVideoCache(cacheDirectory)
  let cached = await readCachedMusicVideoResolution(cacheDirectory, key)
  if (!cached && legacyKey !== key) {
    const legacy = await readCachedMusicVideoResolution(
      cacheDirectory,
      legacyKey,
    )
    if (legacy) {
      cached = await migrateCachedResolution(cacheDirectory, legacy, key)
    }
  }
  if (cached) return { available: true, cached: true, ...cached }

  const { python, ffmpeg } = runtimePaths(root)
  if (!await exists(python) || !await exists(ffmpeg)) {
    return { available: false, reason: 'MV runtime is unavailable' }
  }
  const deadlineController = new AbortController()
  const deadline = setTimeout(() => {
    deadlineController.abort(new DOMException(
      'MV lookup exceeded its time budget',
      'TimeoutError',
    ))
  }, MAX_RESOLUTION_MS)
  deadline.unref?.()
  const effectiveSignal = signal
    ? AbortSignal.any([signal, deadlineController.signal])
    : deadlineController.signal

  const region = inferNetworkRegion()
  const sources = plannedMusicVideoSources(song, region)
  const candidates = []
  try {
    for (const source of sources) {
      if (effectiveSignal.aborted) {
        throw effectiveSignal.reason ||
          new DOMException('MV lookup cancelled', 'AbortError')
      }
      onProgress({ phase: 'search', source: source.id })
      try {
        const inspected = await inspectSource(python, source, effectiveSignal)
        candidates.push(...inspected)
      } catch (error) {
        if (effectiveSignal.aborted) throw error
      }
      if (candidates.some(candidate => (
        candidate.source === source.id &&
        candidateMetadataScore(song, candidate) >= 120
      ))) break
    }
  } catch (error) {
    if (deadlineController.signal.aborted && !signal?.aborted) {
      return { available: false, reason: 'MV lookup timed out' }
    }
    throw error
  }
  const ranked = candidates
    .map(candidate => ({
      candidate,
      score: candidateMetadataScore(song, candidate),
    }))
    .filter(item => item.score >= 100)
    .sort((left, right) => right.score - left.score)
    .slice(0, 2)

  const staging = path.join(cacheDirectory, `${key}.work`)
  await fs.rm(staging, { recursive: true, force: true }).catch(() => {})
  await fs.mkdir(staging, { recursive: true })
  try {
    for (const { candidate } of ranked) {
      if (effectiveSignal.aborted) {
        throw effectiveSignal.reason ||
          new DOMException('MV lookup cancelled', 'AbortError')
      }
      onProgress({ phase: 'verify', source: candidate.source })
      let downloaded = null
      try {
        downloaded = await downloadCandidate({
          python,
          ffmpeg,
          candidate,
          cacheDirectory,
          key,
          signal: effectiveSignal,
        })
        const alignment = await verifyAlignment({
          ffmpeg,
          songFilename,
          song,
          videoFilename: downloaded,
          staging,
          signal: effectiveSignal,
        })
        if (!alignment?.accepted) {
          await fs.rm(downloaded, { force: true })
          continue
        }
        const manifest = await persistCompatibleVideo({
          ffmpeg,
          downloaded,
          cacheDirectory,
          staging,
          key,
          candidate,
          mode: 'exact-sync',
          alignment,
          signal: effectiveSignal,
        })
        await fs.rm(downloaded, { force: true }).catch(() => {})
        return { available: true, cached: false, key, ...manifest }
      } catch (error) {
        if (effectiveSignal.aborted) {
          if (deadlineController.signal.aborted && !signal?.aborted) {
            return { available: false, reason: 'MV lookup timed out' }
          }
          throw error
        }
        if (downloaded) await fs.rm(downloaded, { force: true }).catch(() => {})
      }
    }

    const tryProductionCandidates = async values => {
      const rankedProduction = values
        .map(candidate => ({
          candidate,
          score: productionMetadataScore(song, candidate),
        }))
        .filter(item => item.score >= 100)
        .sort((left, right) => right.score - left.score)
        .slice(0, 2)
      for (const { candidate } of rankedProduction) {
        if (effectiveSignal.aborted) {
          throw effectiveSignal.reason ||
            new DOMException('MV lookup cancelled', 'AbortError')
        }
        onProgress({ phase: 'production', source: candidate.source })
        let downloaded = null
        try {
          downloaded = await downloadCandidate({
            python,
            ffmpeg,
            candidate,
            cacheDirectory,
            key,
            signal: effectiveSignal,
          })
          const manifest = await persistCompatibleVideo({
            ffmpeg,
            downloaded,
            cacheDirectory,
            staging,
            key,
            candidate,
            mode: 'production-loop',
            signal: effectiveSignal,
          })
          await fs.rm(downloaded, { force: true }).catch(() => {})
          return manifest
        } catch (error) {
          if (downloaded) {
            await fs.rm(downloaded, { force: true }).catch(() => {})
          }
          if (effectiveSignal.aborted) throw error
        }
      }
      return null
    }

    let production = null
    try {
      production = await fetchAnimeThemesProductionVideo(song, {
        timeoutMs: 6500,
      })
    } catch {}
    let manifest = production
      ? await tryProductionCandidates([production])
      : null
    if (!manifest) {
      const visualCandidates = []
      for (const source of productionPublicSources(song, region)) {
        if (effectiveSignal.aborted) break
        onProgress({ phase: 'production-search', source: source.id })
        try {
          visualCandidates.push(
            ...await inspectSource(python, source, effectiveSignal),
          )
        } catch (error) {
          if (effectiveSignal.aborted) throw error
        }
      }
      manifest = await tryProductionCandidates(visualCandidates)
    }
    if (manifest) {
      return { available: true, cached: false, key, ...manifest }
    }
    return {
      available: false,
      reason: ranked.length
        ? 'No exact MV or verified production footage was usable'
        : 'No trustworthy MV or production footage was found',
    }
  } finally {
    clearTimeout(deadline)
    await fs.rm(staging, { recursive: true, force: true }).catch(() => {})
    const leftovers = await fs.readdir(cacheDirectory).catch(() => [])
    await Promise.all(leftovers
      .filter(filename => filename.startsWith(`${key}.download.`))
      .map(filename => fs.rm(path.join(cacheDirectory, filename), {
        force: true,
      }).catch(() => {})))
  }
}

export function musicVideoCacheFilename (root, key) {
  if (!/^[a-f0-9]{24}$/u.test(String(key || ''))) return null
  return path.join(root, 'data', 'mv-cache', `${key}.json`)
}

export async function resolveMusicVideoFile (root, key) {
  const manifestFilename = musicVideoCacheFilename(root, key)
  if (!manifestFilename) return null
  try {
    const manifest = JSON.parse(await fs.readFile(manifestFilename, 'utf8'))
    if (manifest.version !== MUSIC_VIDEO_CACHE_VERSION) return null
    const filename = path.join(
      root,
      'data',
      'mv-cache',
      path.basename(String(manifest.filename || '')),
    )
    return (
      path.extname(filename).toLocaleLowerCase() === '.mp4' &&
      await exists(filename)
    )
      ? filename
      : null
  } catch {
    return null
  }
}
