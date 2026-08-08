import { analyzeSongTitle } from '../../src/song/song-title.js'
import { normalizeLyricComparable } from './lyrics-quality.js'
import { fetchWithTimeout } from './network.js'
import { LRCLIB_API_ROUTES } from './network-route-catalog.js'
import {
  inferNetworkRegion,
  tryNetworkSources,
} from './network-source-planner.js'

const CLIENT = 'TypingManiaNovel/20260808 (https://github.com/kyupi-git/typingmania)'

function normalizedTitle (value, language) {
  return normalizeLyricComparable(analyzeSongTitle(value, { language }).title)
}

function normalizedArtist (value) {
  return normalizeLyricComparable(value)
}

function matchesSignature (record, metadata) {
  const expectedTitle = normalizedTitle(metadata.title, metadata.language)
  const actualTitle = normalizedTitle(record?.trackName, metadata.language)
  if (!expectedTitle || expectedTitle !== actualTitle) return false
  const expectedArtist = normalizedArtist(
    metadata.artistNames?.[0] || metadata.artist,
  )
  const actualArtist = normalizedArtist(record?.artistName)
  if (
    expectedArtist &&
    actualArtist &&
    expectedArtist !== actualArtist &&
    !expectedArtist.includes(actualArtist) &&
    !actualArtist.includes(expectedArtist)
  ) return false
  const expectedDuration = Number(metadata.duration)
  const actualDuration = Number(record?.duration)
  return !expectedDuration || !actualDuration ||
    Math.abs(expectedDuration - actualDuration) <= 2.2
}

async function fetchJsonRoutes (pathname, fetchImpl) {
  const sources = LRCLIB_API_ROUTES.map(route => ({
    ...route,
    category: 'lyrics',
    run: async () => {
      const response = await fetchWithTimeout(
        fetchImpl,
        `${route.baseUrl}${pathname}`,
        {
          headers: {
            Accept: 'application/json',
            'User-Agent': CLIENT,
            'Lrclib-Client': CLIENT,
          },
        },
        2600,
      )
      if (!response.ok) throw new Error(`${route.name} HTTP ${response.status}`)
      return response.json()
    },
  }))
  const resolved = await tryNetworkSources(sources, {
    accept: value => Boolean(value),
    region: inferNetworkRegion(),
  })
  if (!resolved) throw new Error('LRCLIB API routes are unavailable')
  return resolved.value
}

function lyricResource (record) {
  const main = String(record?.syncedLyrics || '').trim()
  return main
    ? {
        main,
        romanized: '',
        translated: '',
        trackId: String(record.id || ''),
        service: 'lrclib',
      }
    : null
}

export async function resolveLrclibLyrics (
  metadata,
  { fetchImpl = globalThis.fetch } = {},
) {
  const exact = new URLSearchParams({
    track_name: String(metadata.title || ''),
    artist_name: String(metadata.artistNames?.[0] || metadata.artist || ''),
    album_name: String(metadata.album || ''),
    duration: String(Math.round(Number(metadata.duration) || 0)),
  })
  try {
    const record = await fetchJsonRoutes(`/api/get?${exact}`, fetchImpl)
    if (matchesSignature(record, metadata)) {
      const resource = lyricResource(record)
      if (resource) return resource
    }
  } catch {}

  const search = new URLSearchParams({
    track_name: String(metadata.title || ''),
    artist_name: String(metadata.artistNames?.[0] || metadata.artist || ''),
  })
  const records = await fetchJsonRoutes(`/api/search?${search}`, fetchImpl)
  const matched = Array.isArray(records)
    ? records.find(record => matchesSignature(record, metadata))
    : null
  const resource = lyricResource(matched)
  if (!resource) throw new Error('LRCLIB has no verified synchronized lyrics')
  return resource
}
