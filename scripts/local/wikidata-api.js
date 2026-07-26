import {
  catalogTextSimilarity,
} from './catalog-identity.js'
import { fetchWithTimeout } from './network.js'
import { inferNetworkRegion } from './network-source-planner.js'

const API = 'https://www.wikidata.org/w/api.php'
const ENTITY = 'https://www.wikidata.org/wiki/Special:EntityData'
const REGION_LANGUAGE = Object.freeze({
  cn: 'zh',
  hk: 'zh',
  tw: 'zh',
  jp: 'ja',
  kr: 'ko',
  sea: 'en',
  us: 'en',
  eu: 'en',
  global: 'en',
})
const ORIGINAL_LANGUAGE = new Map([
  ['Q5287', 'ja'],
  ['Q7850', 'zh'],
  ['Q1860', 'en'],
  ['Q9176', 'ko'],
  ['Q150', 'fr'],
  ['Q188', 'de'],
  ['Q1321', 'es'],
  ['Q652', 'it'],
  ['Q5146', 'pt'],
  ['Q7737', 'ru'],
])
const INSTANCE_MEDIA = new Map([
  ['Q5398426', 'television'],
  ['Q15416', 'variety'],
  ['Q11424', 'movie'],
  ['Q202866', 'film'],
  ['Q93204', 'documentary'],
  ['Q7889', 'game'],
  ['Q689445', 'visual-novel'],
  ['Q744038', 'jrpg'],
  ['Q16510064', 'sports-event'],
])

function values (entity, property) {
  return (entity?.claims?.[property] || [])
    .map(claim => claim?.mainsnak?.datavalue?.value)
    .filter(value => value !== undefined && value !== null)
}

function entityLanguages (entity) {
  return values(entity, 'P364')
    .map(value => ORIGINAL_LANGUAGE.get(String(value?.id || '')))
    .filter(Boolean)
}

function originalTitle (entity) {
  const languages = entityLanguages(entity)
  const namedTitles = values(entity, 'P1476')
    .map(value => ({
      title: String(value?.text || '').trim(),
      language: String(value?.language || '').trim(),
    }))
    .filter(value => value.title)
  const preferred = namedTitles.find(value => languages.includes(value.language)) ||
    namedTitles[0]
  if (preferred) return preferred
  for (const language of languages) {
    const label = String(entity?.labels?.[language]?.value || '').trim()
    if (label) return { title: label, language }
  }
  return null
}

function textValues (entity) {
  return [
    ...Object.values(entity?.labels || {}).map(value => value?.value),
    ...Object.values(entity?.aliases || {})
      .flatMap(items => items.map(value => value?.value)),
  ].map(value => String(value || '').trim()).filter(Boolean)
}

function descriptionText (entity, searchResult) {
  return [
    ...Object.values(entity?.descriptions || {}).map(value => value?.value),
    searchResult?.description,
  ].filter(Boolean).join(' ')
}

function inferredMedia (entity, searchResult) {
  const direct = values(entity, 'P31')
    .map(value => INSTANCE_MEDIA.get(String(value?.id || '')))
    .find(Boolean)
  if (direct) return direct
  const description = descriptionText(entity, searchResult)
  const patterns = [
    ['documentary', /documentary|纪录片|紀錄片|ドキュメンタリー/iu],
    ['commercial', /commercial|advertisement|广告|廣告|コマーシャル|\bCM\b/iu],
    ['sports-event', /sports?\s+(?:event|competition|tournament)|体育赛事|體育賽事|スポーツ(?:大会|イベント)/iu],
    ['variety', /variety\s+show|综艺|綜藝|バラエティ番組/iu],
    ['visual-novel', /visual\s+novel|视觉小说|視覺小說|ビジュアルノベル/iu],
    ['jrpg', /\bJRPG\b|role-playing video game|日式角色扮演|ロールプレイングゲーム/iu],
    ['game', /video game|电子游戏|電子遊戲|コンピュータゲーム/iu],
    ['film', /animated\s+film|anime\s+film|动画电影|動畫電影|劇場版アニメ/iu],
    ['movie', /\bfilm\b|\bmovie\b|电影|電影|映画/iu],
    ['television', /television\s+(?:series|program|show)|电视剧|電視劇|テレビ番組/iu],
  ]
  return patterns.find(([, pattern]) => pattern.test(description))?.[0] || ''
}

function mediaCompatible (expected, actual) {
  if (!expected || !actual) return false
  if (expected === actual) return true
  if (expected === 'tv') return ['television', 'variety'].includes(actual)
  if (expected === 'film') return ['film', 'movie'].includes(actual)
  return false
}

function posterUrl (entity) {
  const filename = String(values(entity, 'P18')[0] || '').trim()
  return filename
    ? `https://commons.wikimedia.org/wiki/Special:Redirect/file/${
        encodeURIComponent(filename)
      }?width=1200`
    : ''
}

function queryLanguages (title, region) {
  const detected = /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(title)
    ? 'ja'
    : /\p{Script=Hangul}/u.test(title)
      ? 'ko'
      : /^[\p{Script=Latin}\p{N}\p{P}\p{S}\s]+$/u.test(title)
        ? 'en'
        : REGION_LANGUAGE[region] || 'en'
  return [...new Set([
    detected,
    REGION_LANGUAGE[region] || 'en',
    'en',
  ])].slice(0, 2)
}

async function fetchJson (fetchImpl, url, timeoutMs) {
  const response = await fetchWithTimeout(fetchImpl, url, {
    headers: {
      Accept: 'application/json',
      'User-Agent':
        'TypingManiaNovel/20260726 (verified production metadata lookup)',
    },
  }, timeoutMs)
  if (!response.ok) throw new Error(`Wikidata HTTP ${response.status}`)
  return response.json()
}

async function searchEntities (
  title,
  { fetchImpl, timeoutMs, region },
) {
  const found = new Map()
  for (const language of queryLanguages(title, region)) {
    const url = new URL(API)
    url.searchParams.set('action', 'wbsearchentities')
    url.searchParams.set('search', title)
    url.searchParams.set('language', language)
    url.searchParams.set('uselang', language)
    url.searchParams.set('type', 'item')
    url.searchParams.set('limit', '6')
    url.searchParams.set('format', 'json')
    url.searchParams.set('origin', '*')
    const payload = await fetchJson(fetchImpl, url, timeoutMs)
    for (const result of payload.search || []) {
      if (/^Q\d+$/u.test(String(result?.id || ''))) {
        found.set(result.id, result)
      }
    }
    if (found.size >= 4) break
  }
  return [...found.values()].slice(0, 4)
}

export async function searchWikidataWork (
  parts,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = 3800,
    region = inferNetworkRegion(),
  } = {},
) {
  const query = String(parts?.workTitle || '').trim()
  if (!query || !parts?.media) return null
  const results = await searchEntities(query, {
    fetchImpl,
    timeoutMs: Math.min(timeoutMs, 2400),
    region,
  })
  const candidates = []
  for (const result of results) {
    const payload = await fetchJson(
      fetchImpl,
      `${ENTITY}/${encodeURIComponent(result.id)}.json`,
      timeoutMs,
    )
    const entity = payload?.entities?.[result.id]
    if (!entity) continue
    const media = inferredMedia(entity, result)
    if (!mediaCompatible(parts.media, media)) continue
    const aliases = [
      result.label,
      result.match?.text,
      ...(result.aliases || []),
      ...textValues(entity),
    ].filter(Boolean)
    const similarity = Math.max(
      ...aliases.map(value => catalogTextSimilarity(query, value)),
      0,
    )
    const original = originalTitle(entity)
    if (!original?.title || similarity < 0.84) continue
    candidates.push({
      title: original.title,
      language: original.language || 'und',
      catalog: 'wikidata',
      catalogId: result.id,
      posterUrl: posterUrl(entity),
      evidence: 'wikidata-original-title',
      confidence: Math.min(0.92, similarity * 0.88 + 0.04),
    })
  }
  candidates.sort((left, right) => right.confidence - left.confidence)
  if (
    candidates[1] &&
    candidates[0].confidence - candidates[1].confidence < 0.035
  ) {
    return null
  }
  return candidates[0] || null
}
