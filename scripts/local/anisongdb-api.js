import { analyzeSongTitle } from '../../src/song/song-title.js'
import { catalogIdentitiesEquivalent } from './catalog-identity.js'
import { fetchWithRetry } from './network.js'

const SEARCH_URL = 'https://anisongdb.com/api/search_request'
const HEADERS = Object.freeze({
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'User-Agent': 'TypingManiaNovel/20260726 (https://github.com/kyupi-git/typingmania)',
})

function cleanTitle (value, language) {
  return analyzeSongTitle(value, { language }).title
}

function songTypeParts (value) {
  const text = String(value || '')
  const number = text.match(/\b(\d+)\b/u)?.[1] || ''
  if (/opening/iu.test(text)) return { role: 'opening theme', number }
  if (/ending/iu.test(text)) return { role: 'ending theme', number }
  if (/insert/iu.test(text)) return { role: 'insert song', number }
  return null
}

function mediumLabel (value) {
  const type = String(value || '').toLocaleUpperCase()
  if (type === 'TV') return 'TV anime'
  if (type === 'MOVIE') return 'anime film'
  if (type === 'OVA' || type === 'ONA') return `${type} anime`
  return 'anime'
}

function workTitleHint (record) {
  const japanese = String(record.animeJPName || '').trim()
  const english = String(record.animeENName || '').trim()
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(japanese)) {
    return japanese
  }
  return english || japanese
}

export function selectAnisongOriginCandidate (records, metadata) {
  const matches = (records || []).filter(record => (
    catalogIdentitiesEquivalent(
      cleanTitle(record.songName, metadata.language),
      cleanTitle(metadata.title, metadata.language),
    ) &&
    songTypeParts(record.songType) &&
    String(record.animeJPName || record.animeENName || '').trim()
  ))
  const uniqueOrigins = new Map(matches.map(record => [
    `${record.annId}:${record.songType}`,
    record,
  ]))
  return uniqueOrigins.size === 1 ? [...uniqueOrigins.values()][0] : null
}

export async function inferAnisongOrigin (metadata) {
  const response = await fetchWithRetry(globalThis.fetch, SEARCH_URL, {
    method: 'POST',
    headers: HEADERS,
    body: JSON.stringify({
      song_name_search_filter: {
        search: String(metadata.title || ''),
        partial_match: false,
        match_case: false,
      },
      and_logic: true,
      ignore_duplicate: false,
    }),
  }, {
    timeoutMs: 4800,
    perAttemptMs: 2600,
  })
  if (!response.ok) throw new Error(`AniSongDB HTTP ${response.status}`)
  const matched = selectAnisongOriginCandidate(await response.json(), metadata)
  if (!matched) return null
  const type = songTypeParts(matched.songType)
  const workTitle = workTitleHint(matched)
  return {
    subtitle: `${mediumLabel(matched.animeType)} 「${workTitle}」 ${type.role}` +
      (type.number ? ` ${type.number}` : ''),
    sourceHint: {
      service: 'anisongdb',
      annId: Number(matched.annId) || null,
      songId: Number(matched.annSongId) || null,
    },
  }
}
