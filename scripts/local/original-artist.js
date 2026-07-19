import fs from 'fs/promises'
import path from 'path'

import { fetchWithRetry } from './network.js'

export const ORIGINAL_ARTIST_VERSION = 3

const CACHE_MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000
const NEGATIVE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const ROLE_CREDIT = /(?:\bCV\s*[:：.]|\bfeat\.?\b|\bfeaturing\b|\bfrom\b|\bwith\b)/iu
const LOCALIZED_BILINGUAL = /^[\p{Script=Han}\s·・]+[\(（][^\)）]*[A-Za-z\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}][^\)）]*[\)）]$/u
const SIMPLIFIED_JAPANESE_FORMS = /[亚爱边滨仓处单岛东发广龟国华画会纪乐丽龙门气冈归实树岁团图万为盐应驿运战泽转阳间乡濑户宫樱线黑变读铁观]/u
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
      hasNativeScript(candidate, family)
    ) {
      return candidate
    }
  }
  return ''
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

  const localized = looksLocalizedArtistName(raw, { language, detail })
  const family = scriptFamilyForDetail(detail, language)
  const items = wikiItems(detail?.wiki)
  const candidates = []
  for (const key of ORIGINAL_NAME_KEYS) {
    const value = cleanName(items.get(key))
    for (const variant of candidateNameVariants(value, family)) {
      candidates.push({ value: variant, source: `qqmusic-wiki-${key}` })
    }
  }
  const foreignName = cleanName(detail?.ex_info?.foreign_name)
  for (const variant of candidateNameVariants(foreignName, family)) {
    candidates.push({
      value: variant,
      source: 'qqmusic-singer-foreign-name',
    })
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
      if (!artist.mid || cacheIsFresh(this.cache.entries[artist.mid])) continue
      if (looksLocalizedArtistName(artist.name, {
        language: artist.language,
      })) continue
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
        !cacheIsFresh(this.cache.entries[artist.mid]) &&
        looksLocalizedArtistName(artist.name, {
          language: artist.language,
        })
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
          // The request already includes a bounded retry. Avoid repeating a
          // regional outage for every artist in the same import batch.
          if (this.consecutiveNetworkFailures >= 1) this.networkDisabled = true
        }
      }
    }
    if (cacheChanged) await this.save().catch(() => {})

    const resolvedArtists = input.map(artist => {
      const entry = artist.mid && cacheIsFresh(this.cache.entries[artist.mid])
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
    const originalNames = resolvedArtists
      .map(artist => artist.originalName)
      .filter(Boolean)
    return {
      version: ORIGINAL_ARTIST_VERSION,
      artist: originalNames.join(' / '),
      artistNames: originalNames,
      rawArtistNames: input.map(artist => artist.name),
      artists: resolvedArtists,
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
