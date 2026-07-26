import { analyzeSongTitle } from '../../src/song/song-title.js'
import { catalogIdentitiesEquivalent } from './catalog-identity.js'
import { normalizeLyricComparable } from './lyrics-quality.js'
import { fetchFirstAvailable, fetchWithRetry } from './network.js'
import { validImage } from './qqmusic-api.js'

const REQUEST_HEADERS = Object.freeze({
  Accept: 'application/json, text/plain, */*',
  Referer: 'https://music.163.com/',
  'User-Agent': 'Mozilla/5.0 TypingManiaNovel/20260726',
})

export class NeteaseImportError extends Error {
  constructor (code, message = code) {
    super(message)
    this.name = 'NeteaseImportError'
    this.code = code
  }
}

function endpoints (pathname) {
  return [
    `https://music.163.com${pathname}`,
    `https://interface.music.163.com${pathname}`,
  ]
}

async function fetchJsonFallback (urls, options = {}) {
  const { response } = await fetchFirstAvailable(
    globalThis.fetch,
    urls,
    { headers: REQUEST_HEADERS, ...options },
    { timeoutMs: 5200, perAttemptMs: 2400 },
  )
  return response.json()
}

function lyricValue (value) {
  return String(value?.lyric || '').trim()
}

export async function fetchNeteaseLyrics (trackId) {
  if (!/^\d+$/u.test(String(trackId || ''))) {
    throw new Error('NetEase track ID is unavailable')
  }
  const query = `/api/song/lyric?id=${encodeURIComponent(trackId)}` +
    '&lv=-1&kv=-1&tv=-1&rv=-1&yv=-1&ytv=-1'
  const payload = await fetchJsonFallback(endpoints(query))
  const main = lyricValue(payload.lrc)
  if (!main) throw new Error('NetEase timed lyrics are unavailable')
  return {
    main,
    romanized: lyricValue(payload.romalrc),
    translated: lyricValue(payload.tlyric),
    wordTimed: lyricValue(payload.yrc),
    trackId: String(trackId),
  }
}

function normalizeIdentity (value) {
  return normalizeLyricComparable(String(value || ''))
}

function artistNames (song) {
  return (song?.artists || song?.ar || [])
    .map(artist => String(artist?.name || '').trim())
    .filter(Boolean)
}

function candidateScore (candidate, metadata) {
  const expectedTitle = normalizeIdentity(metadata.title)
  const candidateTitle = normalizeIdentity(candidate.name)
  if (!expectedTitle || !candidateTitle) return -Infinity
  let score = catalogIdentitiesEquivalent(expectedTitle, candidateTitle)
    ? 600
    : 0
  if (!score && (
    expectedTitle.includes(candidateTitle) ||
    candidateTitle.includes(expectedTitle)
  )) score = 260
  if (!score) return -Infinity

  const expectedArtists = (metadata.artistNames || [metadata.artist])
    .map(normalizeIdentity)
    .filter(Boolean)
  const candidates = artistNames(candidate).map(normalizeIdentity)
  const artistMatch = expectedArtists.some(expected => (
    candidates.some(actual => (
      catalogIdentitiesEquivalent(expected, actual) ||
      expected.includes(actual) ||
      actual.includes(expected)
    ))
  ))
  if (expectedArtists.length && !artistMatch) return -Infinity
  if (artistMatch) score += 300
  const duration = Number(candidate.duration || candidate.dt) / 1000
  if (metadata.duration && duration) {
    const delta = Math.abs(metadata.duration - duration)
    if (delta > 5) return -Infinity
    score += Math.max(0, 140 - delta * 28)
  }
  return score
}

export async function searchNeteaseTrack (metadata) {
  const title = String(metadata.title || '').trim()
  const artist = String(metadata.artistNames?.[0] || metadata.artist || '').trim()
  const candidateMap = new Map()
  const collect = async query => {
    const params = new URLSearchParams({
      s: query,
      type: '1',
      offset: '0',
      total: 'true',
      limit: '30',
    })
    const payload = await fetchJsonFallback(
      endpoints(`/api/search/get/web?${params}`),
    )
    for (const song of payload.result?.songs || []) {
      if (song?.id) candidateMap.set(String(song.id), song)
    }
  }
  const best = () => [...candidateMap.values()]
    .map(song => ({ song, score: candidateScore(song, metadata) }))
    .filter(candidate => candidate.score >= 600)
    .sort((left, right) => right.score - left.score)[0]?.song || null
  await collect(`${title} ${artist}`.trim())
  let matched = best()
  if (!matched && artist) {
    await collect(title)
    matched = best()
  }
  return matched
}

export async function resolveNeteaseLyrics (metadata, preferredTrackId = '') {
  let preferredError = null
  if (/^\d+$/u.test(String(preferredTrackId || ''))) {
    try {
      return await fetchNeteaseLyrics(preferredTrackId)
    } catch (error) {
      preferredError = error
    }
  }
  const matched = await searchNeteaseTrack(metadata)
  if (!matched?.id) {
    throw preferredError || new Error('No matching NetEase lyric record was found')
  }
  return fetchNeteaseLyrics(matched.id)
}

export async function fetchNeteaseTrackDetail (trackId) {
  if (!/^\d+$/u.test(String(trackId || ''))) return null
  const ids = encodeURIComponent(`[${trackId}]`)
  const payload = await fetchJsonFallback(
    endpoints(`/api/song/detail/?id=${trackId}&ids=${ids}`),
  )
  return payload.songs?.[0] || null
}

export function metadataFromNeteaseRecord (record, fallback = {}) {
  const rawTitle = String(record?.name || fallback.title || '').trim()
  const language = String(fallback.language || 'U')
  const cleanup = analyzeSongTitle(rawTitle, { language })
  const artists = artistNames(record)
  return {
    ...fallback,
    title: cleanup.title,
    rawTitle,
    titleCleanup: cleanup,
    artist: artists.join(' / ') || fallback.artist || '',
    artistNames: artists.length ? artists : fallback.artistNames || [],
    album: String(record?.album?.name || record?.al?.name || fallback.album || ''),
    albumId: String(record?.album?.id || record?.al?.id || fallback.albumId || ''),
    albumPic: String(
      record?.album?.picUrl || record?.al?.picUrl || fallback.albumPic || '',
    ),
    mvId: String(record?.mvid || record?.mv || fallback.mvId || ''),
    duration: Number(record?.duration || record?.dt) / 1000 || fallback.duration || 0,
  }
}

export async function fetchNeteaseCover (url) {
  const normalizedUrl = String(url || '').replace(/^http:\/\//iu, 'https://')
  if (!/^https:\/\//iu.test(normalizedUrl)) {
    throw new Error('NetEase cover URL is unavailable')
  }
  const candidate = new URL(normalizedUrl)
  if (!candidate.searchParams.has('param')) {
    candidate.searchParams.set('param', '1200y1200')
  }
  const response = await fetchWithRetry(
    globalThis.fetch,
    candidate,
    { headers: REQUEST_HEADERS },
    { timeoutMs: 4500, perAttemptMs: 2400 },
  )
  if (!response.ok) throw new Error(`NetEase cover HTTP ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  if (!validImage(buffer)) throw new Error('NetEase cover is not a valid image')
  const type = response.headers.get('content-type') || ''
  return {
    buffer,
    extension: type.includes('png') ? '.png' : type.includes('webp') ? '.webp' : '.jpg',
    verifiedOnline: true,
    strategy: 'netease-album-artwork',
  }
}
