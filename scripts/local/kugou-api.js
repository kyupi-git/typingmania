import zlib from 'node:zlib'

import { analyzeSongTitle } from '../../src/song/song-title.js'
import {
  catalogIdentitiesEquivalent,
  catalogIdentity,
} from './catalog-identity.js'
import { fetchWithRetry } from './network.js'

const REQUEST_HEADERS = Object.freeze({
  Accept: 'application/json, text/plain, */*',
  Referer: 'https://www.kugou.com/',
  'User-Agent': 'Mozilla/5.0 TypingManiaNovel/20260808',
})
const KRC_KEY = Buffer.from([
  0x40, 0x47, 0x61, 0x77, 0x5E, 0x32, 0x74, 0x47,
  0x51, 0x36, 0x31, 0x2D, 0xCE, 0xD2, 0x6E, 0x69,
])

function durationMatches (left, right, tolerance = 5) {
  const first = Number(left)
  const second = Number(right)
  return !first || !second || Math.abs(first - second) <= tolerance
}

function titleMatches (left, right, language = '') {
  return catalogIdentitiesEquivalent(
    analyzeSongTitle(left, { language }).title,
    analyzeSongTitle(right, { language }).title,
  )
}

function artistMatches (candidate, metadata) {
  const expected = metadata.artistNames?.length
    ? metadata.artistNames
    : [metadata.artist]
  const actual = String(candidate || '').split(/\s*[,/&、;]\s*/u)
  return expected.some(left => actual.some(right => (
    catalogIdentitiesEquivalent(left, right) ||
    catalogIdentity(left).includes(catalogIdentity(right)) ||
    catalogIdentity(right).includes(catalogIdentity(left))
  )))
}

async function fetchJson (url) {
  const response = await fetchWithRetry(globalThis.fetch, url, {
    headers: REQUEST_HEADERS,
  }, {
    timeoutMs: 5200,
    perAttemptMs: 2800,
  })
  if (!response.ok) throw new Error(`KuGou HTTP ${response.status}`)
  return response.json()
}

export async function searchKugouTracks (metadata) {
  const url = new URL('https://songsearch.kugou.com/song_search_v2')
  url.searchParams.set(
    'keyword',
    `${metadata.title} ${metadata.artistNames?.[0] || metadata.artist}`.trim(),
  )
  url.searchParams.set('page', '1')
  url.searchParams.set('pagesize', '30')
  url.searchParams.set('platform', 'WebFilter')
  const payload = await fetchJson(url)
  const candidates = payload.data?.lists || []
  return candidates
    .map(candidate => {
      const title = candidate.SongName || ''
      const artist = candidate.SingerName || ''
      const duration = Number(candidate.Duration) || 0
      if (
        !titleMatches(title, metadata.title, metadata.language) ||
        !artistMatches(artist, metadata) ||
        !durationMatches(duration, metadata.duration)
      ) return null
      const albumMatch = catalogIdentitiesEquivalent(
        candidate.AlbumName || '',
        metadata.album || '',
      )
      return {
        hash: String(candidate.FileHash || '').toLocaleUpperCase(),
        title,
        artist,
        album: String(candidate.AlbumName || ''),
        duration,
        score: 100 + Number(albumMatch) * 20 -
          Math.abs(duration - Number(metadata.duration || duration)),
      }
    })
    .filter(candidate => candidate?.hash)
    .sort((left, right) => right.score - left.score)
}

export async function searchKugouTrack (metadata) {
  return (await searchKugouTracks(metadata))[0] || null
}

function decodeKrc (encoded) {
  const encrypted = Buffer.from(String(encoded || ''), 'base64')
  if (encrypted.subarray(0, 4).toString('ascii') !== 'krc1') {
    throw new Error('KuGou returned an invalid KRC container')
  }
  const compressed = Buffer.alloc(encrypted.length - 4)
  for (let index = 4; index < encrypted.length; index++) {
    compressed[index - 4] = encrypted[index] ^
      KRC_KEY[(index - 4) % KRC_KEY.length]
  }
  return zlib.inflateSync(compressed).toString('utf8')
}

function languageLayers (text) {
  const encoded = text.match(/^\[language:([^\]]+)\]$/mu)?.[1]
  if (!encoded) return []
  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))
    return Array.isArray(payload.content) ? payload.content : []
  } catch {
    return []
  }
}

export function parseDecodedKrc (text) {
  const mainLines = []
  for (const rawLine of String(text || '').split(/\r?\n/u)) {
    const match = rawLine.match(/^\[(\d+),(\d+)\]([\s\S]*)$/u)
    if (!match) continue
    const start = Number(match[1])
    const duration = Number(match[2])
    const value = match[3]
      .replace(/<\d+,\d+,\d+>/gu, '')
      .normalize('NFKC')
      .trim()
    if (value && duration > 0) {
      mainLines.push({ start, end: start + duration, text: value, tokens: [] })
    }
  }
  const romanized = languageLayers(text).find(layer => Number(layer.type) === 0)
  const rows = Array.isArray(romanized?.lyricContent)
    ? romanized.lyricContent
    : []
  const readingLines = mainLines.flatMap((line, index) => {
    const reading = Array.isArray(rows[index])
      ? rows[index].flat(Infinity).join(' ').trim()
      : ''
    return /\p{Script=Latin}/u.test(reading)
      ? [{ ...line, text: reading, tokens: [] }]
      : []
  })
  return { mainLines, readingLines }
}

async function searchKugouLyrics (metadata, track) {
  const url = new URL('https://lyrics.kugou.com/search')
  const values = {
    ver: '1',
    man: 'yes',
    client: 'pc',
    keyword: `${metadata.title} ${metadata.artistNames?.[0] || metadata.artist}`.trim(),
    duration: String(Math.round(Number(metadata.duration) * 1000)),
    hash: track.hash,
  }
  for (const [key, value] of Object.entries(values)) {
    url.searchParams.set(key, value)
  }
  const payload = await fetchJson(url)
  return (payload.candidates || [])
    .filter(candidate => (
      titleMatches(candidate.song, metadata.title, metadata.language) &&
      artistMatches(candidate.singer, metadata) &&
      durationMatches(Number(candidate.duration) / 1000, metadata.duration)
    ))
    .sort((left, right) => (
      Math.abs(Number(left.duration) - metadata.duration * 1000) -
      Math.abs(Number(right.duration) - metadata.duration * 1000)
    ))
}

export async function resolveKugouLyrics (metadata) {
  const tracks = await searchKugouTracks(metadata)
  if (!tracks.length) throw new Error('KuGou has no safely matched recording')
  let mainFallback = null
  let attempts = 0
  for (const track of tracks.slice(0, 4)) {
    const candidates = await searchKugouLyrics(metadata, track)
    for (const candidate of candidates.slice(0, 3)) {
      if (!candidate?.id || !candidate?.accesskey || attempts++ >= 6) continue
      const url = new URL('https://lyrics.kugou.com/download')
      const values = {
        ver: '1',
        client: 'pc',
        id: String(candidate.id),
        accesskey: String(candidate.accesskey),
        fmt: 'krc',
        charset: 'utf8',
      }
      for (const [key, value] of Object.entries(values)) {
        url.searchParams.set(key, value)
      }
      const payload = await fetchJson(url)
      const parsed = parseDecodedKrc(decodeKrc(payload.content))
      if (parsed.mainLines.length < 5) continue
      const resolved = {
        ...parsed,
        service: 'kugou',
        trackId: String(candidate.id),
        romanized: parsed.readingLines.length > 0,
      }
      if (resolved.romanized) return resolved
      mainFallback ||= resolved
    }
  }
  if (mainFallback) return mainFallback
  throw new Error('KuGou has no verified synchronized lyrics')
}
