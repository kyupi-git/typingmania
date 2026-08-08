import fs from 'fs/promises'
import path from 'path'

import { fetchWithRetry } from './network.js'

export const ORIGINAL_ARTIST_VERSION = 8

const CACHE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000
const NEGATIVE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const ROLE_CREDIT = /(?:\bC\.?V\.?\s*[:：.]|\bfeat\.?\b|\bfeaturing\b|\bfrom\b|\bwith\b)/iu
// Track rows occasionally contain a singer biography instead of the singer
// field.  Treat these as invalid input; accepting them poisons both catalog
// matching and work-title searches.
const ARTIST_BIOGRAPHY = /(?:出生(?:于|地|日期)?|年出生|生于\s*\d{4}|职业\s*[:：]|简介\s*[:：]|歌手简介|代表作|音乐人简介|\bborn\s+(?:in|on)\b|\bborn\s*:\s*|\bborn\s+\d{4}\b|birthplace|occupation\s*[:：]|singer\s+bio|copyright|\b(?:all rights reserved|℗|©)\b|作词\s*[:：]|作曲\s*[:：]|编曲\s*[:：]|作詞\s*[:：]|作曲\s*[:：]|編曲\s*[:：])/iu

export function isLikelyArtistName (value) {
  const name = cleanName(value)
  if (!name || ARTIST_BIOGRAPHY.test(name)) return false
  return name.length <= 160 && !/^(?:未知|佚名|unknown|various artists|群星)$/iu.test(name)
}

// Split only at delimiters outside role-credit parentheses.  A role credit is
// one semantic singer (character + CV), not two collaborating singers.
export function splitArtistCredits (value) {
  const text = cleanName(value)
  const output = []
  let start = 0
  let depth = 0
  for (let index = 0; index < text.length; index++) {
    const character = text[index]
    if (character === '(' || character === '（') depth++
    else if (character === ')' || character === '）') depth = Math.max(0, depth - 1)
    const commaDelimiter = character === '、' || /[；;]/u.test(character)
    const slashDelimiter = !depth && /\s\/\s/u.test(text.slice(index, index + 3))
    if (!depth && (commaDelimiter || slashDelimiter)) {
      const part = cleanName(text.slice(start, index))
      if (isLikelyArtistName(part)) output.push(part)
      start = commaDelimiter ? index + 1 : index + 3
      if (start > text.length) start = text.length
      if (start === index + 3) index += 2
    }
  }
  const last = cleanName(text.slice(start))
  if (isLikelyArtistName(last)) output.push(last)
  return output
}

export function normalizeArtistCredits (values) {
  const names = (Array.isArray(values) ? values : splitArtistCredits(values))
    .map(value => cleanName(value)).filter(isLikelyArtistName)
  const roleVoices = new Set()
  for (const name of names) {
    const match = name.match(/[（(]\s*C\.?V\.?\s*[.:：]?\s*([^）)]+)[）)]/iu)
    if (match) roleVoices.add(comparable(match[1]))
  }
  return names.filter((name, index) => {
    const key = comparable(name)
    if (roleVoices.has(key) && !/[（(]\s*C\.?V\.?/iu.test(name)) return false
    return true
  }).filter((name, index, list) => list.findIndex(value => comparable(value) === comparable(name)) === index)
}
const LOCALIZED_BILINGUAL = /^[\p{Script=Han}\s·・]+[\(（][^\)）]*[A-Za-z\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}][^\)）]*[\)）]$/u
// Only include simplified forms that differ from normal Japanese shinjitai.
// Shared characters such as 国, 会, 気, 実, 戦, 図, 駅, and 読 are valid in
// native Japanese names and must not make an artist look localized.
const SIMPLIFIED_JAPANESE_FORMS = /[亚爱边滨仓处单岛东发广龟华纪乐丽龙门冈归树岁团盐应驿运战泽转阳乡濑宫樱线黑变读铁观纯]/u
const CHINESE_TRANSLATION_GRAMMAR = /(?:的|组合|樂團|乐团|少女組|少女组|偶像組合|偶像组合)/u
const WIKI_ITEM = /<item>\s*<key><!\[CDATA\[([\s\S]*?)\]\]><\/key>\s*<value><!\[CDATA\[([\s\S]*?)\]\]><\/value>\s*<\/item>/gu
const ORIGINAL_NAME_KEYS = [
  '原文名',
  '日文名',
  '日本語名',
  '韩文名',
  '韓文名',
  '外文名',
]

function normalizeLanguage (value) {
  const language = String(value || '').toLocaleUpperCase()
  if (['JP', 'JA', 'JPN'].includes(language)) return 'JP'
  if (['KO', 'KR', 'KOR'].includes(language)) return 'KO'
  if (['ZH', 'CN', 'ZHO'].includes(language)) return 'ZH'
  if (['EN', 'ENG'].includes(language)) return 'EN'
  return 'U'
}

function cleanName (value) {
  return String(value || '')
    .replace(/<[^>]+>/gu, '')
    .replace(/&amp;/gu, '&')
    .replace(/&quot;/gu, '"')
    .replace(/&#39;|&apos;/gu, "'")
    .normalize('NFKC')
    .replace(/\s+/gu, ' ')
    .trim()
}

function comparable (value) {
  return cleanName(value)
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]/gu, '')
}

function wikiItems (wiki) {
  const items = new Map()
  for (const match of String(wiki || '').matchAll(WIKI_ITEM)) {
    const key = cleanName(match[1])
    const value = cleanName(match[2])
    if (key && value && !items.has(key)) items.set(key, value)
  }
  return items
}

function scriptFamilyForDetail (detail, language) {
  const area = String(detail?.ex_info?.area || '')
  if (area === '2') return 'JP'
  if (area === '3') return 'KO'
  return normalizeLanguage(language)
}

function hasNativeScript (value, family) {
  const text = cleanName(value)
  if (!text) return false
  if (family === 'JP') {
    return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(text)
  }
  if (family === 'KO') return /\p{Script=Hangul}/u.test(text)
  if (family === 'ZH') return /\p{Script=Han}/u.test(text)
  if (family === 'EN') return /[A-Za-z]/u.test(text)
  return /[\p{L}\p{N}]/u.test(text)
}

function candidateNameVariants (value, family) {
  const variants = cleanName(value)
    .split(/\s*(?:、|,|，|;|；|\/|／)\s*/u)
    .map(name => {
      let candidate = cleanName(name)
      if (family === 'JP') {
        candidate = candidate.replace(
          /[\(（][\p{Script=Hiragana}\p{Script=Katakana}\s]+[\)）]$/u,
          '',
        )
        candidate = candidate.replace(
          /(?<=\p{Script=Han})\s+(?=\p{Script=Han})/gu,
          '',
        )
      }
      return cleanName(candidate)
    })
    .filter(Boolean)
  if (family === 'JP') {
    return variants
      .map((name, index) => ({
        name,
        index,
        score: /\p{Script=Han}/u.test(name)
          ? 3
          : /\p{Script=Katakana}/u.test(name)
            ? 2
            : /\p{Script=Hiragana}/u.test(name)
              ? 1
              : 0,
      }))
      .sort((left, right) => right.score - left.score || left.index - right.index)
      .map(candidate => candidate.name)
  }
  return variants
}

function isJapaneseReadingOnly (value, family) {
  return family === 'JP' &&
    !/[\p{Script=Han}]/u.test(cleanName(value)) &&
    /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(cleanName(value))
}

function leadingDescriptionName (detail, family) {
  const descriptions = [
    detail?.ex_info?.desc,
    String(detail?.wiki || '').match(/<desc><!\[CDATA\[([\s\S]*?)\]\]><\/desc>/u)?.[1],
  ]
  for (const description of descriptions) {
    const candidate = cleanName(description)
      .split(/\s*(?:[\(（]|[,，。]|(?:は|是)[、，\s])/u)[0]
      .trim()
    if (
      candidate &&
      candidate.length <= 80 &&
      isLikelyArtistName(candidate) &&
      hasNativeScript(candidate, family)
    ) {
      return candidate
    }
  }
  return ''
}

function detailNameMarksLocalizedAlias (rawName, detail, family) {
  const raw = cleanName(rawName)
  const detailName = cleanName(detail?.basic_info?.name)
  if (!raw || !detailName || family === 'ZH') return false
  const prefix = detailName.match(/^(.+?)\s*[\(（]([^\)）]+)[\)）]$/u)
  if (!prefix || comparable(prefix[1]) !== comparable(raw)) return false
  return (
    comparable(prefix[2]) !== comparable(raw) &&
    hasNativeScript(prefix[2], family) &&
    !isJapaneseReadingOnly(prefix[2], family)
  )
}

function trustworthyParentheticalPrimary (raw, family) {
  const match = cleanName(raw).match(/^(.+?)\s*[\(（]([^\)）]+)[\)）]$/u)
  if (!match) return ''
  const primary = cleanName(match[1])
  const annotation = cleanName(match[2])
  if (family === 'JP' &&
      /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(primary) &&
      /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(annotation) &&
      !/[\p{Script=Han}]/u.test(annotation) &&
      !SIMPLIFIED_JAPANESE_FORMS.test(primary)) return primary
  if (family === 'ZH' && /\p{Script=Han}/u.test(primary) && /[A-Za-z]/u.test(annotation)) return primary
  if (family === 'EN' && /[A-Za-z]/u.test(primary) && /[\p{Script=Han}]/u.test(annotation)) return primary
  if (family === 'KO' && /\p{Script=Hangul}/u.test(primary) && !/[\p{Script=Han}]/u.test(annotation)) return primary
  return ''
}

export function needsOriginalNameDetail (artist) {
  if (looksLocalizedArtistName(artist.name, {
    language: artist.language,
  })) return true
  const family = normalizeLanguage(artist.language)
  // A Japanese catalog frequently localizes an artist to an all-Han Chinese
  // alias without any parenthetical marker (for example, 楠木灯). The compact
  // track row cannot distinguish that alias from a legitimate Japanese Kanji
  // name. Query the batched singer detail before declaring it original.
  return (
    ['JP', 'U'].includes(family) &&
    /\p{Script=Han}/u.test(artist.name) &&
    !/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(artist.name)
  )
}

export function looksLocalizedArtistName (
  value,
  {
    language = '',
    detail = null,
  } = {},
) {
  const name = cleanName(value)
  if (!name || ROLE_CREDIT.test(name)) return false
  if (LOCALIZED_BILINGUAL.test(name)) return true
  const family = scriptFamilyForDetail(detail, language)
  if (
    family !== 'ZH' &&
    /[A-Za-z]/u.test(name) &&
    /\p{Script=Han}/u.test(name) &&
    (
      SIMPLIFIED_JAPANESE_FORMS.test(name) ||
      CHINESE_TRANSLATION_GRAMMAR.test(name)
    )
  ) return true
  if (
    family === 'KO' &&
    /\p{Script=Han}/u.test(name) &&
    !/\p{Script=Hangul}/u.test(name)
  ) return true
  if (
    family === 'EN' &&
    /\p{Script=Han}/u.test(name) &&
    !/[A-Za-z]/u.test(name)
  ) return true
  return family === 'JP' && SIMPLIFIED_JAPANESE_FORMS.test(name)
}

export function originalArtistFromDetail ({
  rawName,
  detail = null,
  language = '',
  singerMid = '',
} = {}) {
  const raw = cleanName(rawName)
  if (!raw) {
    return {
      singerMid,
      rawName: '',
      originalName: '',
      resolved: false,
      source: 'missing',
      confidence: 0,
    }
  }
  if (!isLikelyArtistName(raw)) {
    return {
      singerMid,
      rawName: raw,
      originalName: '',
      resolved: false,
      source: 'invalid-artist-field',
      confidence: 0,
    }
  }
  if (ROLE_CREDIT.test(raw)) {
    return {
      singerMid,
      rawName: raw,
      originalName: raw,
      resolved: true,
      source: 'qqmusic-track-role-credit',
      confidence: 1,
    }
  }

  const family = scriptFamilyForDetail(detail, language)
  const parentheticalPrimary = trustworthyParentheticalPrimary(raw, family)
  if (parentheticalPrimary) {
    return {
      singerMid,
      rawName: raw,
      originalName: parentheticalPrimary,
      resolved: true,
      source: 'qqmusic-track-written-name',
      confidence: 0.95,
    }
  }
  // Keep the track language's localization signal even when singer detail
  // supplies a different native family. Otherwise an unchanged provider alias
  // can be accepted merely because detail says the singer is Japanese.
  const localized = (
    looksLocalizedArtistName(raw, { language }) ||
    looksLocalizedArtistName(raw, { language, detail }) ||
    detailNameMarksLocalizedAlias(raw, detail, family)
  )
  const items = wikiItems(detail?.wiki)
  const candidates = []
  const detailBasicName = cleanName(detail?.basic_info?.name)
  const detailWrittenName = detailBasicName.replace(
    /\s*[\(（][^\)）]+[\)）]\s*$/u,
    '',
  )
  if (family !== 'JP' || /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(detailWrittenName)) {
    for (const variant of candidateNameVariants(detailWrittenName, family)) {
      candidates.push({ value: variant, source: 'qqmusic-singer-detail-name' })
    }
  }
  // QQ Music's foreign_name is the catalog's canonical non-localized display
  // field. Prefer it to a wiki reading such as くすのき ともり, which is
  // pronunciation evidence but not necessarily the artist's written name.
  const foreignName = cleanName(detail?.ex_info?.foreign_name)
  for (const variant of candidateNameVariants(foreignName, family)) {
    if (isJapaneseReadingOnly(variant, family) && /\p{Script=Han}/u.test(raw) && !localized) continue
    candidates.push({
      value: variant,
      source: 'qqmusic-singer-foreign-name',
    })
  }
  for (const key of ORIGINAL_NAME_KEYS) {
    const value = cleanName(items.get(key))
    for (const variant of candidateNameVariants(value, family)) {
      candidates.push({ value: variant, source: `qqmusic-wiki-${key}` })
    }
  }
  const leadingName = leadingDescriptionName(detail, family)
  if (leadingName) {
    candidates.push({ value: leadingName, source: 'qqmusic-singer-description' })
  }

  const nativeCandidate = candidates.find(candidate => (
    candidate.value.length <= 120 &&
    comparable(candidate.value) !== comparable(raw) &&
    hasNativeScript(candidate.value, family)
  ))
  if (localized && nativeCandidate) {
    return {
      singerMid,
      rawName: raw,
      originalName: nativeCandidate.value,
      resolved: true,
      source: nativeCandidate.source,
      confidence: 1,
    }
  }
  if (!localized) {
    return {
      singerMid,
      rawName: raw,
      originalName: raw,
      resolved: true,
      source: 'qqmusic-track-name',
      confidence: 0.9,
    }
  }
  return {
    singerMid,
    rawName: raw,
    originalName: '',
    resolved: false,
    source: detail ? 'qqmusic-original-name-unavailable' : 'network-unavailable',
    confidence: 0,
  }
}

async function fetchSingerDetails ({
  singerMids,
  cookie,
  fetchImpl,
  timeoutMs,
}) {
  if (!singerMids.length) return new Map()
  const body = {
    comm: { ct: 24, cv: 0 },
    req: {
      module: 'music.musichallSinger.SingerInfoInter',
      method: 'GetSingerDetail',
      param: {
        singer_mids: singerMids,
        ex_singer: 1,
        wiki_singer: 1,
        group_singer: 0,
      },
    },
  }
  const response = await fetchWithRetry(
    fetchImpl,
    'https://u.y.qq.com/cgi-bin/musicu.fcg',
    {
      method: 'POST',
      headers: {
        'User-Agent': 'QQMusic/21',
        'Content-Type': 'application/json',
        Cookie: cookie,
      },
      body: JSON.stringify(body),
    },
    {
      timeoutMs,
      perAttemptMs: Math.max(1000, Math.ceil(timeoutMs / 2)),
    },
  )
  if (!response.ok) throw new Error(`singer detail HTTP ${response.status}`)
  const payload = await response.json()
  if (Number(payload.req?.code || 0) !== 0) {
    throw new Error(`singer detail API ${payload.req?.code}`)
  }
  const details = new Map()
  for (const detail of payload.req?.data?.singer_list || []) {
    const mid = cleanName(detail?.basic_info?.singer_mid)
    if (mid) details.set(mid, detail)
  }
  return details
}

function cacheAge (entry) {
  return Date.now() - Date.parse(entry?.checked_at || 0)
}

function cacheIsFresh (entry) {
  const age = cacheAge(entry)
  const maximumAge = entry?.original_name
    ? CACHE_MAX_AGE_MS
    : NEGATIVE_CACHE_MAX_AGE_MS
  return age >= 0 && age < maximumAge
}

function cacheEntryUsable (entry, artist) {
  if (!cacheIsFresh(entry)) return false
  if (!entry?.original_name) return true
  return isLikelyArtistName(entry.original_name) &&
    !looksLocalizedArtistName(entry.original_name, {
      language: artist?.language,
    })
}

function chunks (values, size) {
  const output = []
  for (let index = 0; index < values.length; index += size) {
    output.push(values.slice(index, index + size))
  }
  return output
}

export default class OriginalArtistResolver {
  constructor ({
    root,
    cookie = '',
    fetchImpl = globalThis.fetch,
    timeoutMs = 6000,
  }) {
    this.filename = path.join(root, 'data', 'qqmusic-artist-cache.json')
    this.cookie = cookie
    this.fetchImpl = fetchImpl
    this.timeoutMs = timeoutMs
    this.cache = { version: ORIGINAL_ARTIST_VERSION, entries: {} }
    this.loaded = false
    this.consecutiveNetworkFailures = 0
    this.networkDisabled = false
    this.lastNetworkError = ''
  }

  async load () {
    if (this.loaded) return
    this.loaded = true
    try {
      const stored = JSON.parse(await fs.readFile(this.filename, 'utf8'))
      if (stored?.version === ORIGINAL_ARTIST_VERSION && stored.entries) {
        this.cache = stored
      }
    } catch {}
  }

  async save () {
    await fs.mkdir(path.dirname(this.filename), { recursive: true })
    await fs.writeFile(this.filename, JSON.stringify(this.cache), 'utf8')
  }

  async resolve (artists, { language = '' } = {}) {
    await this.load()
    const input = (artists || [])
      .map(artist => ({
        id: Number(artist?.id) || 0,
        mid: cleanName(artist?.mid),
        name: cleanName(artist?.name),
        language: normalizeLanguage(artist?.language || language),
      }))
      .filter(artist => artist.name)
    let cacheChanged = false
    for (const artist of input) {
      if (!artist.mid || cacheEntryUsable(this.cache.entries[artist.mid], artist)) continue
      if (needsOriginalNameDetail(artist)) continue
      const resolution = originalArtistFromDetail({
        rawName: artist.name,
        language: artist.language,
        singerMid: artist.mid,
      })
      this.cache.entries[artist.mid] = {
        checked_at: new Date().toISOString(),
        raw_name: resolution.rawName,
        original_name: resolution.originalName,
        resolved: resolution.resolved,
        source: resolution.source,
        confidence: resolution.confidence,
      }
      cacheChanged = true
    }
    const pending = [...new Set(input
      .filter(artist => (
        artist.mid &&
        !cacheEntryUsable(this.cache.entries[artist.mid], artist) &&
        needsOriginalNameDetail(artist)
      ))
      .map(artist => artist.mid))]
    const details = new Map()

    if (!this.networkDisabled) {
      for (const group of chunks(pending, 20)) {
        if (this.networkDisabled) break
        try {
          const fetched = await fetchSingerDetails({
            singerMids: group,
            cookie: this.cookie,
            fetchImpl: this.fetchImpl,
            timeoutMs: this.timeoutMs,
          })
          for (const [mid, detail] of fetched) details.set(mid, detail)
          this.consecutiveNetworkFailures = 0
          this.lastNetworkError = ''
          for (const mid of group) {
            const artist = input.find(item => item.mid === mid)
            const resolution = originalArtistFromDetail({
              rawName: artist?.name,
              detail: fetched.get(mid) || {},
              language: artist?.language || language,
              singerMid: mid,
            })
            this.cache.entries[mid] = {
              checked_at: new Date().toISOString(),
              raw_name: resolution.rawName,
              original_name: resolution.originalName,
              resolved: resolution.resolved,
              source: resolution.source,
              confidence: resolution.confidence,
            }
            cacheChanged = true
          }
        } catch (error) {
          this.lastNetworkError = error?.message || String(error)
          this.consecutiveNetworkFailures++
          // Each request is bounded, but one transient provider failure must
          // not disable verification for every later artist in the batch.
          // The short batch-level circuit breaker still avoids a long stall
          // during a sustained regional outage.
          if (this.consecutiveNetworkFailures >= 3) this.networkDisabled = true
        }
      }
    }
    if (cacheChanged) await this.save().catch(() => {})

    const resolvedArtists = input.map(artist => {
      const entry = artist.mid && cacheEntryUsable(this.cache.entries[artist.mid], artist)
        ? this.cache.entries[artist.mid]
        : null
      if (entry) {
        return {
          singerMid: artist.mid,
          singerId: artist.id,
          rawName: artist.name,
          originalName: cleanName(entry.original_name),
          resolved: Boolean(entry.resolved && entry.original_name),
          source: entry.source,
          confidence: Number(entry.confidence) || 0,
        }
      }
      if (needsOriginalNameDetail(artist) && !details.has(artist.mid)) {
        return {
          singerMid: artist.mid,
          singerId: artist.id,
          rawName: artist.name,
          originalName: '',
          resolved: false,
          source: 'network-unavailable',
          confidence: 0,
        }
      }
      return {
        ...originalArtistFromDetail({
          rawName: artist.name,
          detail: details.get(artist.mid) || null,
          language: artist.language || language,
          singerMid: artist.mid,
        }),
        singerId: artist.id,
      }
    })
    const originalNames = normalizeArtistCredits(resolvedArtists
      .map(artist => artist.originalName)
      .filter(Boolean))
    const kept = new Set(originalNames.map(name => comparable(name)))
    const normalizedArtists = resolvedArtists.filter(artist => (
      !artist.originalName || kept.has(comparable(artist.originalName))
    ))
    return {
      version: ORIGINAL_ARTIST_VERSION,
      artist: originalNames.join(' / '),
      artistNames: originalNames,
      rawArtistNames: normalizedArtists.map(artist => artist.rawName),
      artists: normalizedArtists,
      resolved: resolvedArtists.length > 0 &&
        resolvedArtists.every(artist => artist.resolved),
      checkedAt: new Date().toISOString(),
      networkDisabled: this.networkDisabled,
    }
  }

  async resolveMetadata (metadata) {
    const resolution = await this.resolve(metadata?.artists || [], {
      language: metadata?.language,
    })
    return {
      ...metadata,
      artist: resolution.artist,
      artistNames: resolution.artistNames,
      rawArtistNames: resolution.rawArtistNames,
      artistResolution: resolution,
    }
  }
}
