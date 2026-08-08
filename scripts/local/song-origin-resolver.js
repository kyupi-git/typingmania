import fs from 'fs/promises'
import path from 'path'

import {
  hasVerifiedOriginalWorkTitle,
  parseSongOrigin,
  SONG_ORIGIN_VERSION,
} from '../../src/song/song-origin.js'
import {
  fetchBangumiApiJson,
  fetchBangumiWebsite,
} from './bangumi-routes.js'
import { resolveGeneralMediaWork } from './media-catalog-api.js'
import { inferNetworkRegion } from './network-source-planner.js'

export { SONG_ORIGIN_VERSION }

const SONG_ORIGIN_CACHE_VERSION = 7
const CACHE_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000
const NEGATIVE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const USER_AGENT =
  'TypingManiaNovel/20260808 (music metadata resolver)'

function normalize (value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]/gu, '')
}

function chineseNumber (value) {
  const digits = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  }
  if (value === '十') return 10
  if (value.startsWith('十')) return 10 + (digits[value[1]] || 0)
  if (value.endsWith('十')) return (digits[value[0]] || 0) * 10
  return digits[value] || value
}

function workNameVariants (value) {
  const input = String(value || '').normalize('NFKC')
  const values = [
    input,
    input.replace(/\([^)]*\)|（[^）]*）|\[[^\]]*\]|【[^】]*】/gu, ''),
  ]
  return [...new Set(values.map(item => normalize(
    item
      .replace(/第([一二三四五六七八九十]+)(?:季|期)/gu, (_, number) => (
        `第${chineseNumber(number)}季`
      ))
      .replace(/第(\d+)(?:季|期)/gu, '第$1季'),
  )).filter(Boolean))]
}

function isOrderedSubsequence (shorter, longer) {
  let index = 0
  for (const character of longer) {
    if (character === shorter[index]) index++
    if (index === shorter.length) return true
  }
  return false
}

function editDistance (left, right) {
  if (left.length < right.length) [left, right] = [right, left]
  const row = new Uint16Array(right.length + 1)
  for (let index = 0; index <= right.length; index++) row[index] = index
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    let diagonal = row[0]
    row[0] = leftIndex
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const previous = row[rightIndex]
      row[rightIndex] = left[leftIndex - 1] === right[rightIndex - 1]
        ? diagonal
        : Math.min(diagonal, row[rightIndex], row[rightIndex - 1]) + 1
      diagonal = previous
    }
  }
  return row[right.length]
}

function textSimilarity (left, right) {
  if (!left || !right) return 0
  if (left === right) return 1
  return 1 - editDistance(left, right) / Math.max(left.length, right.length)
}

function namesEquivalent (left, right) {
  const leftVariants = workNameVariants(left)
  const rightVariants = workNameVariants(right)
  return leftVariants.some(leftValue => rightVariants.some(rightValue => (
    leftValue === rightValue
  )))
}

function namesFuzzilyEquivalent (left, right) {
  const leftVariants = workNameVariants(left)
  const rightVariants = workNameVariants(right)
  return leftVariants.some(leftValue => rightVariants.some(rightValue => {
    const shorter = leftValue.length <= rightValue.length ? leftValue : rightValue
    const longer = shorter === leftValue ? rightValue : leftValue
    return (
      shorter.length >= 6 &&
      (
        textSimilarity(shorter, longer) >= 0.68 ||
        (
          shorter.length / longer.length >= 0.35 &&
          isOrderedSubsequence(shorter, longer)
        )
      )
    )
  }))
}

function namesSimilarity (left, right) {
  const leftVariants = workNameVariants(left)
  const rightVariants = workNameVariants(right)
  let best = 0
  for (const leftValue of leftVariants) {
    for (const rightValue of rightVariants) {
      best = Math.max(best, textSimilarity(leftValue, rightValue))
    }
  }
  return best
}

function seasonNumber (value) {
  const normalized = String(value || '')
    .normalize('NFKC')
    .replace(/第([一二三四五六七八九十]+)(?:季|期)/gu, (_, number) => (
      `第${chineseNumber(number)}季`
    ))
  return normalized.match(/第\s*(\d+)\s*(?:季|期)|\bseason\s*(\d+)\b/iu)
    ?.slice(1)
    .find(Boolean) || ''
}

function stringsFromValue (value, output = []) {
  if (typeof value === 'string') {
    if (value.trim()) output.push(value.trim())
  } else if (Array.isArray(value)) {
    for (const child of value) stringsFromValue(child, output)
  } else if (value && typeof value === 'object') {
    for (const child of Object.values(value)) stringsFromValue(child, output)
  }
  return output
}

function candidateNames (candidate) {
  const names = [
    candidate.name,
    candidate.name_cn,
  ]
  for (const item of candidate.infobox || []) {
    if (/^(?:别名|中文名|原名|日文名)$/u.test(item.key || '')) {
      names.push(...stringsFromValue(item.value))
    }
  }
  return names.filter(Boolean)
}

function evidenceText (candidate) {
  return stringsFromValue(candidate.infobox || [])
    .join(' ')
    .normalize('NFKC')
    .toLocaleLowerCase()
}

function exactNameKind (query, candidate) {
  if (!normalize(query)) return ''
  if (namesEquivalent(query, candidate.name_cn)) return 'localized'
  if (namesEquivalent(query, candidate.name)) return 'original'
  if (candidateNames(candidate).some(name => namesEquivalent(query, name))) {
    return 'alias'
  }
  if (candidateNames(candidate).some(name => namesFuzzilyEquivalent(query, name))) {
    return 'fuzzy'
  }
  return ''
}

function platformScore (medium, platform) {
  const value = String(platform || '').toLocaleLowerCase()
  if (!medium || !value) return 0
  if (medium === 'tv') {
    return /(?:^|\b)tv(?:\b|$)/iu.test(value) ? 15 : -20
  }
  if (medium === 'film') {
    return /(?:剧场|劇場|movie|film)/iu.test(value) ? 15 : -20
  }
  if (medium === 'television') {
    return /(?:电视剧|電視劇|ドラマ|\btv\b|television)/iu.test(value)
      ? 15
      : -20
  }
  if (medium === 'movie') {
    return /(?:电影|電影|映画|movie|film)/iu.test(value) ? 15 : -20
  }
  if (medium === 'documentary') {
    return /(?:纪录|紀錄|記録|documentary)/iu.test(value) ? 15 : -15
  }
  if (medium === 'commercial') {
    return /(?:广告|廣告|コマーシャル|\bCM\b|commercial|advert)/iu
      .test(value) ? 15 : -15
  }
  if (medium === 'variety') {
    return /(?:综艺|綜藝|バラエティ|variety)/iu.test(value) ? 15 : -15
  }
  if (medium === 'sports-event') {
    return /(?:体育|體育|スポーツ|sport|tournament|competition)/iu
      .test(value) ? 15 : -15
  }
  if (medium === 'visual-novel') {
    return /(?:visual\s+novel|ビジュアルノベル|ギャルゲー|game)/iu
      .test(value) ? 15 : -10
  }
  if (medium === 'jrpg') {
    return /(?:jrpg|rpg|game|ゲーム)/iu.test(value) ? 15 : -10
  }
  if (medium === 'game') {
    return /(?:game|ゲーム|游戏|遊戲)/iu.test(value) ? 15 : -10
  }
  return 0
}

function matchScore (query, metadata, parts, candidate, qqOriginalTitle) {
  const kind = exactNameKind(query, candidate)
  if (!kind) return -Infinity
  let score = kind === 'localized'
    ? 100
    : kind === 'original'
      ? 95
      : kind === 'alias'
        ? 90
        : 80
  if (kind === 'fuzzy') {
    score += Math.max(
      ...candidateNames(candidate)
        .map(name => namesSimilarity(query, name)),
      0,
    ) * 15
  }
  score += platformScore(parts.media, candidate.platform)
  const querySeason = seasonNumber(query)
  const candidateSeason = candidateNames(candidate)
    .map(seasonNumber)
    .find(Boolean) || ''
  if (querySeason) {
    score += candidateSeason === querySeason
      ? 20
      : candidateSeason
        ? -50
        : -20
  }
  // A season-less query describes the direct/base production. A sequel may
  // still fuzzy-match the localized wording, but must lose to an otherwise
  // comparable unnumbered work unless the query explicitly names its season.
  if (!querySeason && candidateSeason) score -= 18

  const evidence = normalize(evidenceText(candidate))
  const title = normalize(metadata.title)
  if (title && evidence.includes(title)) score += 35
  if ((metadata.artistNames || []).some(artist => {
    const value = normalize(artist)
    return value.length >= 3 && evidence.includes(value)
  })) {
    score += 25
  }
  if (
    qqOriginalTitle &&
    normalize(candidate.name) === normalize(qqOriginalTitle)
  ) {
    score += 40
  }
  score += Math.min(10, Math.log10(Number(candidate.collection?.collect || 0) + 1) * 2)
  return score
}

function originalLanguage (candidate) {
  const title = String(candidate.name || '')
  // The primary title itself is stronger evidence than production-region
  // tags. This matters for Korean source works adapted or distributed by
  // Japanese animation partners.
  if (/\p{Script=Hangul}/u.test(title)) return 'ko'
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(title)) return 'ja'

  const regionValues = (candidate.infobox || [])
    .filter(item => /^(?:地区|地區|国家|國家|制作国家|製作國家)$/u.test(item.key || ''))
    .flatMap(item => stringsFromValue(item.value))
  const tags = [
    ...(candidate.meta_tags || []),
    ...(candidate.tags || []).map(tag => tag.name),
    ...regionValues,
  ].join(' ')
  if (/(?:日本|日漫|日本动画|日本動畫)/u.test(tags)) return 'ja'
  if (/(?:中国|中國|国产|國產|国创|國創)/u.test(tags)) return 'zh'
  if (/(?:韩国|韓國|韩漫|韓漫)/u.test(tags)) return 'ko'
  if (/(?:美国|美國|英国|英國|欧美|歐美)/u.test(tags)) return 'en'
  return 'und'
}

function normalizedTrackLanguage (metadata) {
  const language = String(metadata?.language || '').toLocaleLowerCase()
  if (language === 'jp' || language === 'ja') return 'ja'
  if (language === 'kr' || language === 'ko') return 'ko'
  if (language === 'cn' || language === 'zh') return 'zh'
  if (language === 'en') return 'en'
  return ''
}

function labeledTitleAliases (candidate) {
  const aliases = []
  const add = (label, value) => {
    const title = String(value || '').trim()
    if (title) aliases.push({
      label: String(label || '').trim(),
      title,
    })
  }
  for (const item of candidate?.infobox || []) {
    const key = String(item?.key || '').trim()
    if (/^(?:日文名|日本名|英文名|韩文名|韓文名|原名)$/u.test(key)) {
      for (const value of stringsFromValue(item.value)) add(key, value)
      continue
    }
    if (!/^(?:别名|別名|alias|aliases)$/iu.test(key)) continue
    const values = Array.isArray(item.value) ? item.value : [item.value]
    for (const value of values) {
      if (value && typeof value === 'object') {
        add(
          value.k || value.key || value.label || key,
          value.v || value.value || value.title || value.name,
        )
      }
    }
  }
  return aliases
}

function aliasLanguage (alias) {
  const label = String(alias?.label || '')
  if (/(?:日文|日本|Japanese)/iu.test(label)) return 'ja'
  if (/(?:韩文|韓文|韩国|韓國|Korean)/iu.test(label)) return 'ko'
  if (/(?:中文|中国|中國|Chinese)/iu.test(label)) return 'zh'
  if (/(?:英文|英语|英語|English)/iu.test(label)) return 'en'
  return ''
}

function needsDirectEditionTitle (candidate, metadata) {
  const primary = String(candidate?.name || '')
  const trackLanguage = normalizedTrackLanguage(metadata)
  const hasJapaneseKana =
    /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(primary)
  return trackLanguage === 'ja' && (
    /\p{Script=Hangul}/u.test(primary) ||
    (!hasJapaneseKana && looksChineseLocalizedText(primary))
  )
}

function directProductionTitle (
  candidate,
  metadata,
  { requireEdition = false } = {},
) {
  const primary = String(candidate?.name || '').trim()
  if (!primary) return null

  // For a Japanese song, an all-Han candidate is commonly Bangumi's Chinese
  // display title.  Region/tags are not proof that this string is the
  // original title; require an explicit Japanese alias (or kana in the
  // primary title) before accepting it.
  if (
    normalizedTrackLanguage(metadata) === 'ja' &&
    !/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(primary) &&
    looksChineseLocalizedText(primary) &&
    !labeledTitleAliases(candidate).some(alias => aliasLanguage(alias) === 'ja')
  ) return null

  // The catalog record is already the direct audiovisual production. Never
  // inspect its 原作/source-work field for a song origin. When a Japanese
  // release uses a distinct official title, select that named edition rather
  // than carrying the adapted comic or novel's primary-language title into
  // the anime credit.
  if (needsDirectEditionTitle(candidate, metadata)) {
    const japanese = labeledTitleAliases(candidate)
      .find(alias => aliasLanguage(alias) === 'ja')
    if (japanese) return {
      title: japanese.title,
      language: 'ja',
      edition: 'ja',
    }
    if (requireEdition) return null
  }

  return {
    title: primary,
    language: originalLanguage(candidate),
    edition: '',
  }
}

function looksChineseLocalizedText (value) {
  const text = String(value || '').normalize('NFKC')
  return /(?:第\s*\d+\s*季|动画|動畫|少男少女|花季|的|与|與|之|们|們|这|這|后|後|里|裡|为|為|从|從|个|個)/u
    .test(text)
}

function verifiedCatalogOriginal (
  candidate,
  qqOriginalTitle = '',
  metadata = {},
  options = {},
) {
  const direct = directProductionTitle(candidate, metadata, options)
  const title = direct?.title || ''
  const language = direct?.language || 'und'
  if (!direct) return null

  if (language === 'und') {
    if (
      !candidate.name_cn ||
      namesEquivalent(title, candidate.name_cn) ||
      looksChineseLocalizedText(title)
    ) {
      return null
    }
    return { title, language, edition: direct.edition }
  }

  if (language === 'ja') {
    const hasKana = /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(title)
    const differsFromChinese = candidate.name_cn &&
      !namesEquivalent(title, candidate.name_cn)
    const matchesSoundtrack = qqOriginalTitle &&
      namesEquivalent(title, qqOriginalTitle)
    if (
      !hasKana &&
      !matchesSoundtrack &&
      (!differsFromChinese || looksChineseLocalizedText(title))
    ) {
      return null
    }
  }
  if (language === 'ko' && !/\p{Script=Hangul}/u.test(title)) return null

  return {
    title,
    language,
    edition: direct.edition,
  }
}

function buildOrigin (parts, originalTitle, details = {}) {
  return {
    version: SONG_ORIGIN_VERSION,
    work_title: originalTitle,
    original_language: details.originalLanguage || 'und',
    original_verified: true,
    title_source: details.titleSource || '',
    medium: parts.media,
    season: parts.season,
    episodes: parts.episodes,
    role: parts.role,
    sequence: parts.roleNumber,
    catalog: details.catalog || '',
    catalog_id: details.catalogId ? String(details.catalogId) : '',
    evidence: details.evidence || '',
    confidence: Number(details.confidence || 0),
    poster_url: details.posterUrl || undefined,
    corroborated_by: Array.isArray(details.corroboratedBy) &&
      details.corroboratedBy.length
      ? [...new Set(details.corroboratedBy.map(String))]
      : undefined,
    title_scope: 'direct-production',
    verified_at: new Date().toISOString(),
  }
}

function explicitSeasonNumber (value) {
  return String(value || '').match(
    /(?:season|series|第)\s*(\d+)\s*(?:季|期)?/iu,
  )?.[1] || ''
}

export function needsDirectProductionTitleRefresh (origin, metadata) {
  return Boolean(
    hasVerifiedOriginalWorkTitle(origin) &&
    needsDirectEditionTitle({ name: origin.work_title }, metadata),
  )
}

export function normalizeOriginalTitleLanguage (origin) {
  if (!origin || typeof origin !== 'object') return origin
  const title = String(origin.work_title || '')
  const scriptLanguage = /\p{Script=Hangul}/u.test(title)
    ? 'ko'
    : /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(title)
        ? 'ja'
        : ''
  if (!scriptLanguage || origin.original_language === scriptLanguage) {
    return origin
  }
  return {
    ...origin,
    original_language: scriptLanguage,
  }
}

function applyCurrentStructure (origin, metadata) {
  const parts = parseSongOrigin(metadata.subtitle)
  if (!hasVerifiedOriginalWorkTitle(origin) || !parts) return null
  return {
    ...normalizeOriginalTitleLanguage(origin),
    version: SONG_ORIGIN_VERSION,
    medium: parts.media,
    season: parts.season,
    episodes: parts.episodes,
    role: parts.role,
    sequence: parts.roleNumber,
  }
}

export function japaneseAlbumTitle (query, albums) {
  const expected = normalize(query)
  for (const album of albums.filter(Boolean)) {
    const value = String(album.title || album.album || '').trim()
    if (!value) continue
    const withoutLocalized = value.replace(
      /[\(（]([^()（）]+)[\)）]/gu,
      (match, inner) => normalize(inner) === expected ? '' : match,
    )
    const explicit = withoutLocalized.match(
      /(?:TV\s*アニメ|テレビアニメ|劇場版アニメ|アニメ映画)?\s*[『「｢]([^』」｣]{2,120})[』」｣]/u,
    )?.[1]
    const structural = withoutLocalized.split(
      /\s*(?:キャラクターソング(?:アルバム|集)?|イメージソング(?:アルバム|集)?|オリジナル[・\s]*(?:サウンドトラック| soundtrack)|サウンドトラック|\bOST\b|original\s+(?:soundtrack|score))/iu,
    )[0]
    const title = String(explicit || structural)
      .trim()
      .replace(/^(?:TV\s*アニメ|テレビアニメ|劇場版アニメ|アニメ映画)\s*/u, '')
      .replace(/^[『「｢]|[』」｣]$/gu, '')
      .replace(/[\-–—:：・\s]+$/u, '')
    if (
      title &&
      normalize(title) !== expected &&
      /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(title) &&
      !/(?:キャラクターソング|サウンドトラック)/u.test(title) &&
      (
        explicit ||
        normalize(value).includes(expected) ||
        /(?:キャラクターソング|サウンドトラック|TV\s*アニメ)/iu.test(value)
      )
    ) {
      return {
        title,
        albumMid: album.albumMid || album.album_mid || '',
      }
    }
  }
  return null
}

function bangumiSubjectType (medium) {
  if ([
    'television',
    'movie',
    'documentary',
    'commercial',
    'variety',
    'sports-event',
  ].includes(medium)) return 6
  if (['visual-novel', 'jrpg', 'game'].includes(medium)) return 4
  return 2
}

async function searchBangumiApi (
  query,
  fetchImpl,
  timeoutMs,
  medium = 'tv',
) {
  const result = await fetchBangumiApiJson({
    pathname: '/v0/search/subjects?limit=20&offset=0',
    fetchImpl,
    options: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        keyword: query,
        sort: 'match',
        filter: {
          type: [bangumiSubjectType(medium)],
          nsfw: false,
        },
      }),
    },
    timeoutMs,
    accept: value => Array.isArray(value?.data),
  })
  const payload = result?.value || {}
  return Array.isArray(payload.data) ? payload.data : []
}

async function fetchBangumiSubject (id, fetchImpl, timeoutMs) {
  if (!/^\d+$/u.test(String(id || ''))) return null
  const result = await fetchBangumiApiJson({
    pathname: `/v0/subjects/${id}`,
    fetchImpl,
    options: {
      headers: {
        'Cache-Control': 'no-cache',
      },
    },
    timeoutMs,
    accept: value => String(value?.id || '') === String(id),
  })
  const subject = result?.value
  return subject && String(subject.id || '') === String(id)
    ? subject
    : null
}

function decodeHtmlText (value) {
  const named = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    nbsp: ' ',
    quot: '"',
  }
  return String(value || '')
    .replace(/<[^>]*>/gu, ' ')
    .replace(/&#x([a-f0-9]+);/giu, (_, code) => (
      String.fromCodePoint(Number.parseInt(code, 16))
    ))
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&([a-z]+);/giu, (full, name) => named[name.toLocaleLowerCase()] || full)
    .replace(/\s+/gu, ' ')
    .trim()
}

function parseBangumiWebsiteResults (html, medium = 'tv') {
  const candidates = []
  for (const match of String(html || '').matchAll(
    /<li id="item_(\d+)"[\s\S]*?<\/li>/gu,
  )) {
    const block = match[0]
    const heading = block.match(
      /<h3>[\s\S]*?<a[^>]*href="\/subject\/\d+"[^>]*>([\s\S]*?)<\/a>\s*(?:<small class="grey">([\s\S]*?)<\/small>)?/u,
    )
    if (!heading) continue
    const localizedTitle = decodeHtmlText(heading[1])
    const originalTitle = decodeHtmlText(heading[2])
    const name = originalTitle || localizedTitle
    if (!name) continue
    candidates.push({
      id: Number(match[1]),
      type: bangumiSubjectType(medium),
      name,
      name_cn: originalTitle ? localizedTitle : '',
      platform: /\bTV\b/iu.test(block) ? 'TV' : '',
      meta_tags: [],
      infobox: [],
      collection: {},
    })
  }
  return candidates
}

async function searchBangumiWebsite (
  query,
  fetchImpl,
  timeoutMs,
  medium = 'tv',
) {
  const result = await fetchBangumiWebsite({
    pathname: `/subject_search/${encodeURIComponent(query)}?cat=${
      bangumiSubjectType(medium)
    }`,
    fetchImpl,
    timeoutMs: Math.min(timeoutMs, 3600),
    options: {
      headers: {
        Accept: 'text/html',
        'User-Agent': USER_AGENT,
      },
    },
  })
  return parseBangumiWebsiteResults(await result.value.text(), medium)
}

function broaderWorkQuery (value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(
      /\s*(?:第\s*(?:\d+|[一二三四五六七八九十]+)\s*(?:季|期)|\bseason\s*\d+\b)\s*$/iu,
      '',
    )
    .trim()
}

function rankCatalogCandidates ({
  candidates,
  query,
  metadata,
  parts,
  qqOriginal,
}) {
  return candidates
    .map(candidate => {
      const verified = verifiedCatalogOriginal(
        candidate,
        qqOriginal?.title,
        metadata,
      )
      const kind = exactNameKind(query, candidate)
      return {
        candidate,
        kind,
        verified,
        score: verified
          ? matchScore(
              query,
              metadata,
              parts,
              candidate,
              qqOriginal?.title,
            )
          : -Infinity,
      }
    })
    .filter(result => Number.isFinite(result.score))
    .sort((left, right) => right.score - left.score)
}

function confidentCatalogResult (ranked) {
  const best = ranked[0]
  if (!best) return null
  const minimumScore = best.kind === 'fuzzy' ? 90 : 80
  if (best.score < minimumScore) return null
  if (
    best.kind === 'fuzzy' &&
    ranked[1] &&
    best.score - ranked[1].score < 8
  ) {
    return null
  }
  return best
}

export async function resolveSongOrigin ({
  metadata,
  cover = null,
  fetchImpl = globalThis.fetch,
  timeoutMs = 5000,
}) {
  const parts = parseSongOrigin(metadata.subtitle)
  if (!parts) return null

  const qqOriginal = japaneseAlbumTitle(parts.workTitle, [
    cover,
    {
      title: metadata.album,
      albumMid: metadata.albumMid,
    },
  ])
  const generalMedia = [
    'tv',
    'film',
    'television',
    'movie',
    'documentary',
    'commercial',
    'variety',
    'sports-event',
    'visual-novel',
    'jrpg',
    'game',
  ].includes(parts.media)
  const region = inferNetworkRegion()
  let generalTried = false
  let generalError = null
  const resolveGeneral = async () => {
    if (!generalMedia || generalTried) return null
    generalTried = true
    try {
      const match = await resolveGeneralMediaWork(parts, {
        fetchImpl,
        timeoutMs,
        region,
      })
      return match
        ? buildOrigin(parts, match.title, {
            originalLanguage: match.language,
            titleSource: 'catalog-primary',
            catalog: match.catalog,
            catalogId: match.catalogId,
            evidence: match.evidence,
            confidence: match.confidence,
            posterUrl: match.posterUrl,
            corroboratedBy: match.corroboratedBy,
          })
        : null
    } catch (error) {
      generalError = error
      return null
    }
  }
  const bangumiPreferredMedia = new Set([
    'tv',
    'film',
    'visual-novel',
    'jrpg',
    'game',
  ])
  let generalOrigin = null
  if (
    generalMedia &&
    (
      !bangumiPreferredMedia.has(parts.media) ||
      ['hk', 'tw', 'kr', 'sea', 'us', 'eu', 'global'].includes(region)
    )
  ) {
    // Keep the first result as evidence, but still consult Bangumi. Returning
    // here used to make a reachable general catalog suppress the more
    // medium-specific Bangumi check on non-mainland networks.
    generalOrigin = await resolveGeneral()
  }

  let candidates = []
  let websiteUsed = false
  let bangumiError = null
  try {
    candidates = await searchBangumiApi(
      parts.workTitle,
      fetchImpl,
      timeoutMs,
      parts.media,
    )
    websiteUsed = false
    if (!candidates.length) {
      candidates = await searchBangumiWebsite(
        parts.workTitle,
        fetchImpl,
        timeoutMs,
        parts.media,
      )
      websiteUsed = candidates.length > 0
    }
  } catch (error) {
    try {
      candidates = await searchBangumiWebsite(
        parts.workTitle,
        fetchImpl,
        timeoutMs,
        parts.media,
      )
      websiteUsed = candidates.length > 0
    } catch (fallbackError) {
      bangumiError = error
      candidates = []
    }
  }

  let ranked = rankCatalogCandidates({
    candidates,
    query: parts.workTitle,
    metadata,
    parts,
    qqOriginal,
  })
  let best = confidentCatalogResult(ranked)
  const broaderQuery = broaderWorkQuery(parts.workTitle)
  if (!best && broaderQuery && normalize(broaderQuery) !== normalize(parts.workTitle)) {
    try {
      const broaderCandidates = websiteUsed
        ? await searchBangumiWebsite(
            broaderQuery,
            fetchImpl,
            timeoutMs,
            parts.media,
          )
        : await searchBangumiApi(
            broaderQuery,
            fetchImpl,
            timeoutMs,
            parts.media,
          )
      const byId = new Map(
        [...candidates, ...broaderCandidates]
          .map(candidate => [String(candidate.id || candidate.name), candidate]),
      )
      ranked = rankCatalogCandidates({
        candidates: [...byId.values()],
        query: parts.workTitle,
        metadata,
        parts,
        qqOriginal,
      })
      best = confidentCatalogResult(ranked)
    } catch {}
  }

  if (!best && websiteUsed) {
    try {
      const apiCandidates = await searchBangumiApi(
        parts.workTitle,
        fetchImpl,
        timeoutMs,
        parts.media,
      )
      const byId = new Map(
        [...candidates, ...apiCandidates]
          .map(candidate => [String(candidate.id || candidate.name), candidate]),
      )
      ranked = rankCatalogCandidates({
        candidates: [...byId.values()],
        query: parts.workTitle,
        metadata,
        parts,
        qqOriginal,
      })
      best = confidentCatalogResult(ranked)
    } catch {}
  }

  if (best) {
    let candidate = best.candidate
    if (
      needsDirectEditionTitle(candidate, metadata) &&
      !labeledTitleAliases(candidate)
        .some(alias => aliasLanguage(alias) === 'ja')
    ) {
      try {
        candidate = await fetchBangumiSubject(
          candidate.id,
          fetchImpl,
          timeoutMs,
        )
      } catch {
        candidate = null
      }
    }
    const verified = candidate
      ? verifiedCatalogOriginal(
          candidate,
          qqOriginal?.title,
          metadata,
          { requireEdition: true },
        )
      : null
    if (!verified) best = null
    else best = { ...best, candidate, verified }
  }

  if (best) {
    if (!generalTried) generalOrigin = await resolveGeneral()
    const bangumiOrigin = buildOrigin(parts, best.verified.title, {
      originalLanguage: best.verified.language,
      titleSource: 'catalog-primary',
      catalog: 'bangumi',
      catalogId: best.candidate.id,
      evidence: best.verified.edition
        ? 'catalog-direct-release-title'
        : qqOriginal &&
          normalize(qqOriginal.title) === normalize(best.verified.title)
        ? 'qqmusic-soundtrack+catalog'
        : best.kind === 'fuzzy'
          ? 'catalog-fuzzy-localized-title'
          : 'catalog-exact-title',
      confidence: Math.min(1, best.score / 150),
      corroboratedBy: generalOrigin?.catalog && namesEquivalent(
        best.verified.title,
        generalOrigin.work_title,
      )
        ? ['bangumi', generalOrigin.catalog]
        : ['bangumi'],
    })
    const realProduction = [
      'television',
      'movie',
      'documentary',
      'commercial',
      'variety',
      'sports-event',
    ].includes(parts.media)
    if (
      realProduction &&
      generalOrigin &&
      !parts.season &&
      explicitSeasonNumber(bangumiOrigin.work_title) &&
      !explicitSeasonNumber(generalOrigin.work_title)
    ) {
      // A broad series query must not silently become season 1 merely because
      // that is the first Bangumi real-subject hit. Keep the independently
      // verified series/film identity unless the song relationship names a
      // particular season.
      return generalOrigin
    }
    return bangumiOrigin
  }

  if (!generalTried) generalOrigin = await resolveGeneral()
  if (generalOrigin) return generalOrigin

  if (qqOriginal) {
    return buildOrigin(parts, qqOriginal.title, {
      originalLanguage: 'ja',
      titleSource: 'soundtrack-album',
      catalog: 'qqmusic',
      catalogId: qqOriginal.albumMid,
      evidence: 'soundtrack-album',
      confidence: 0.9,
    })
  }
  if (bangumiError || generalError) {
    throw bangumiError || generalError
  }
  return null
}

function cacheKey (metadata) {
  const parts = parseSongOrigin(metadata.subtitle)
  if (!parts) return ''
  return `${metadata.language || ''}:${normalize(parts.workTitle)}`
}

export default class SongOriginResolver {
  constructor ({
    root,
    fetchImpl = globalThis.fetch,
    timeoutMs = 5000,
  }) {
    this.filename = path.join(root, 'data', 'song-origin-cache.json')
    this.legacyFilenames = [
      path.join(root, 'data', 'qqmusic-origin-cache.json'),
    ]
    this.fetchImpl = fetchImpl
    this.timeoutMs = timeoutMs
    this.cache = { version: SONG_ORIGIN_CACHE_VERSION, entries: {} }
    this.loaded = false
    this.lastLookupFailed = false
  }

  async load () {
    if (this.loaded) return
    this.loaded = true
    for (const filename of [this.filename, ...this.legacyFilenames]) {
      try {
        const stored = JSON.parse(await fs.readFile(filename, 'utf8'))
        if (stored?.version !== SONG_ORIGIN_CACHE_VERSION || !stored.entries) {
          continue
        }
        this.cache = stored
        let changed = filename !== this.filename
        for (const entry of Object.values(this.cache.entries)) {
          const normalized = normalizeOriginalTitleLanguage(entry?.origin)
          if (normalized !== entry?.origin) {
            entry.origin = normalized
            changed = true
          }
        }
        if (changed) {
          await this.save().catch(() => {})
          if (filename !== this.filename) {
            await fs.rm(filename, { force: true }).catch(() => {})
          }
        }
        return
      } catch {}
    }
  }

  async save () {
    await fs.mkdir(path.dirname(this.filename), { recursive: true })
    await fs.writeFile(this.filename, JSON.stringify(this.cache), 'utf8')
  }

  async resolve (metadata, cover = null, { forceRefresh = false } = {}) {
    this.lastLookupFailed = false
    const key = cacheKey(metadata)
    if (!key) return null
    await this.load()
    const entry = this.cache.entries[key]
    const age = Date.now() - Date.parse(entry?.checked_at || 0)
    const maximumAge = entry?.origin
      ? CACHE_MAX_AGE_MS
      : NEGATIVE_CACHE_MAX_AGE_MS
    if (
      !forceRefresh &&
      entry &&
      age >= 0 &&
      age < maximumAge &&
      !needsDirectProductionTitleRefresh(entry.origin, metadata)
    ) {
      return applyCurrentStructure(entry.origin, metadata)
    }

    let origin = null
    try {
      origin = await resolveSongOrigin({
        metadata,
        cover,
        fetchImpl: this.fetchImpl,
        timeoutMs: this.timeoutMs,
      })
    } catch {
      // A route outage is not evidence that the production is unknown. Do not
      // write a negative cache entry and do not disable later songs: another
      // source or a later request may still succeed on this device.
      this.lastLookupFailed = true
      return null
    }
    this.cache.entries[key] = {
      checked_at: new Date().toISOString(),
      origin,
    }
    await this.save().catch(() => {})
    return applyCurrentStructure(origin, metadata)
  }
}
