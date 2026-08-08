import { analyzeSongTitle } from '../../src/song/song-title.js'
import { catalogIdentitiesEquivalent } from './catalog-identity.js'
import { fetchWithRetry } from './network.js'
import { japaneseReading } from './japanese-pronunciation.js'

const SEARCH_URL = 'https://anisongdb.com/api/search_request'
const HEADERS = Object.freeze({
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'User-Agent': 'TypingManiaNovel/20260808 (https://github.com/kyupi-git/typingmania)',
})

function cleanTitle (value, language) {
  return analyzeSongTitle(value, { language }).title
}

export function anisongTitleQueries (value) {
  const original = String(value || '')
  const asciiApostrophe = original.replace(/[’‘‛′＇]/gu, "'")
  return [...new Set([original, asciiApostrophe].filter(Boolean))].slice(0, 2)
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

export async function selectAnisongOriginCandidate (records, metadata) {
  const matches = []
  for (const record of records || []) {
    if (
      catalogIdentitiesEquivalent(
        cleanTitle(record.songName, metadata.language),
        cleanTitle(metadata.title, metadata.language),
      ) &&
      songTypeParts(record.songType) &&
      String(record.animeJPName || record.animeENName || '').trim() &&
      await artistMatches(record, metadata)
    ) matches.push(record)
  }
  const uniqueWorks = new Map(matches.map(record => [
    String(record.annId || `${record.animeJPName || ''}:${record.animeENName || ''}`),
    record,
  ]))
  if (uniqueWorks.size !== 1) return null
  const values = [...uniqueWorks.values()]
  const roles = new Set(matches.map(record => songTypeParts(record.songType).role))
  if (roles.size > 1) return { ...values[0], ambiguousRole: true, songType: 'soundtrack song' }
  return values[0]
}

async function artistAliases (metadata) {
  const values = metadata.artistNames?.length ? metadata.artistNames : [metadata.artist]
  const aliases = []
  for (const value of values) {
    aliases.push(cleanTitle(value, metadata.language))
    const cv = String(value || '').match(/(?:\bCV\b|声優|聲優)\s*[:：]?\s*([^()（）]+)/iu)?.[1]?.trim()
    if (!cv) continue
    const reading = await japaneseReading(cv)
    if (reading?.reading && !reading.unknown) aliases.push(reading.reading)
  }
  return aliases.filter(Boolean)
}

function latinArtistEquivalent (left, right) {
  const normalize = value => String(value || '').toLocaleLowerCase()
    .replace(/[^a-z\s]/gu, ' ').replace(/\s+/gu, ' ').trim()
  const leftForms = [normalize(left)].flatMap(value => [
    value, value.replace(/([aeiou])\1/gu, '$1'),
  ]).filter(Boolean)
  const tokens = normalize(right).split(' ').filter(Boolean)
  const rightForms = [
    tokens.join(' '),
    [...tokens].reverse().join(' '),
    tokens.join(''),
    [...tokens].reverse().join(''),
  ]
  return leftForms.some(value => rightForms.includes(value))
}

async function artistMatches (record, metadata) {
  const expected = await artistAliases(metadata)
  const actual = (record.artistNames?.length
    ? record.artistNames
    : record.songArtistNames?.length
      ? record.songArtistNames
      : [record.songArtist || record.artist || record.artistName])
    .map(value => cleanTitle(value, metadata.language)).filter(Boolean)
  if (!expected.length || !actual.length) return true
  return expected.some(left => actual.some(right => (
    catalogIdentitiesEquivalent(left, right) || latinArtistEquivalent(left, right)
  )))
}

export async function inferAnisongOrigin (metadata) {
  const records = []
  for (const query of anisongTitleQueries(metadata.title)) {
    const response = await fetchWithRetry(globalThis.fetch, SEARCH_URL, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({
        song_name_search_filter: {
          search: query,
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
    records.push(...(await response.json()))
  }
  const matched = await selectAnisongOriginCandidate(records, metadata)
  if (!matched) return null
  const type = matched.ambiguousRole
    ? { role: 'soundtrack song', number: '' }
    : songTypeParts(matched.songType)
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
