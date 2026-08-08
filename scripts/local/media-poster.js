import { Buffer } from 'buffer'

import {
  bangumiImageCandidates,
  fetchBangumiApiJson,
  fetchBangumiWebsite,
} from './bangumi-routes.js'
import {
  fetchFirstAvailable,
  fetchWithTimeout,
} from './network.js'

export const POSTER_SELECTION_VERSION = 2

const BANGUMI_SUBJECT_PAGE = subjectId =>
  `https://bgm.tv/subject/${encodeURIComponent(subjectId)}`
const BANGUMI_SUBJECT_API = subjectId =>
  `https://api.bgm.tv/v0/subjects/${encodeURIComponent(subjectId)}`

class PosterIdentityMismatchError extends Error {
  constructor (expected, actual) {
    super(`poster subject mismatch: expected "${expected}", received "${actual}"`)
    this.name = 'PosterIdentityMismatchError'
  }
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
    .replace(/&([a-z]+);/giu, (full, name) => (
      named[name.toLocaleLowerCase()] || full
    ))
    .replace(/\s+/gu, ' ')
    .trim()
}

function comparableTitle (value) {
  return decodeHtmlText(value)
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]/gu, '')
}

function titlesMatch (expected, actual) {
  const left = comparableTitle(expected)
  const right = comparableTitle(actual)
  return Boolean(left && right && left === right)
}

function subjectDirectTitles (subject) {
  const titles = [
    subject?.name,
    subject?.name_cn,
  ]
  for (const item of subject?.infobox || []) {
    const key = String(item?.key || '')
    if (!/^(?:别名|別名|日文名|日本名|英文名|韩文名|韓文名)$/u.test(key)) {
      continue
    }
    const values = Array.isArray(item.value) ? item.value : [item.value]
    for (const value of values) {
      if (typeof value === 'string') titles.push(value)
      else if (value && typeof value === 'object') {
        titles.push(
          value.v || value.value || value.title || value.name,
        )
      }
    }
  }
  return titles.filter(Boolean)
}

function subjectMatchesOrigin (origin, subject) {
  return subjectDirectTitles(subject)
    .some(title => titlesMatch(origin?.work_title, title))
}

function absoluteHttpUrl (value, base) {
  try {
    const url = new URL(decodeHtmlText(value), base)
    return /^https?:$/u.test(url.protocol) ? url.href : ''
  } catch {
    return ''
  }
}

export function parseBangumiSubjectPage (html, subjectId) {
  const text = String(html || '')
  const heading = text.match(
    /<h1[^>]*class="[^"]*\bnameSingle\b[^"]*"[\s\S]*?<a[^>]*href="\/subject\/\d+"[^>]*>([\s\S]*?)<\/a>/iu,
  )
  const pageTitle = text.match(/<title>([\s\S]*?)<\/title>/iu)?.[1]
    ?.split(/\s*[|｜]\s*Bangumi/iu)[0]
  const title = decodeHtmlText(heading?.[1] || pageTitle)
  const cover = text.match(
    /<a[^>]*href="([^"]+)"[^>]*class="[^"]*\bcover\b[^"]*"[^>]*>/iu,
  )?.[1] || text.match(
    /<img[^>]*src="([^"]+)"[^>]*class="[^"]*\bcover\b[^"]*"[^>]*>/iu,
  )?.[1]
  return {
    title,
    imageUrl: absoluteHttpUrl(
      cover,
      BANGUMI_SUBJECT_PAGE(subjectId),
    ),
    source: 'bangumi-subject-page',
  }
}

function imageType (buffer, contentType = '') {
  const bytes = new Uint8Array(buffer)
  if (bytes.length >= 3 && bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return { extension: '.jpg', mime: 'image/jpeg' }
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4E &&
    bytes[3] === 0x47
  ) {
    return { extension: '.png', mime: 'image/png' }
  }
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) {
    return { extension: '.webp', mime: 'image/webp' }
  }
  if (/image\/jpeg/iu.test(contentType)) return { extension: '.jpg', mime: 'image/jpeg' }
  if (/image\/png/iu.test(contentType)) return { extension: '.png', mime: 'image/png' }
  if (/image\/webp/iu.test(contentType)) return { extension: '.webp', mime: 'image/webp' }
  return null
}

function bangumiSubjectId (origin) {
  if (
    String(origin?.catalog || '').toLocaleLowerCase() !== 'bangumi' ||
    !/^\d+$/u.test(String(origin?.catalog_id || ''))
  ) {
    return ''
  }
  return String(origin.catalog_id)
}

function externalPosterUrl (origin) {
  const catalog = String(origin?.catalog || '').toLocaleLowerCase()
  const value = String(origin?.poster_url || '')
  if (!['anilist', 'tvmaze', 'tmdb', 'wikidata', 'vndb'].includes(catalog)) return ''
  try {
    const url = new URL(value)
    const validHost = catalog === 'tvmaze'
      ? /(?:^|\.)tvmaze\.com$/iu.test(url.hostname)
      : catalog === 'anilist'
        ? url.hostname === 's4.anilist.co'
        : catalog === 'tmdb'
          ? url.hostname === 'image.tmdb.org'
          : catalog === 'vndb'
            ? /(?:^|\.)vndb\.org$/iu.test(url.hostname)
            : /(?:^|\.)wikimedia\.org$/iu.test(url.hostname)
    return url.protocol === 'https:' && validHost ? url.href : ''
  } catch {
    return ''
  }
}

async function fetchExternalCatalogPoster ({
  origin,
  fetchImpl,
  timeoutMs,
}) {
  const imageUrl = externalPosterUrl(origin)
  if (!imageUrl) return null
  const response = await fetchWithTimeout(fetchImpl, imageUrl, {
    headers: {
      Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.5',
      'User-Agent': 'TypingManiaNovel/20260808 (verified poster lookup)',
    },
    redirect: 'follow',
  }, timeoutMs)
  if (!response.ok) throw new Error(`Catalog poster HTTP ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  const type = imageType(buffer, response.headers?.get?.('content-type') || '')
  if (!type || buffer.length < 256 || buffer.length > 12 * 1024 * 1024) {
    throw new Error('Catalog poster response is not a usable image')
  }
  return {
    buffer,
    extension: type.extension,
    mime: type.mime,
    version: POSTER_SELECTION_VERSION,
    source: `${origin.catalog}-verified-production-poster`,
    referenceSource: `${origin.catalog}-catalog`,
    catalog: origin.catalog,
    catalogId: String(origin.catalog_id || ''),
    workTitle: String(origin.work_title || ''),
    identityVerified: true,
    checkedAt: new Date().toISOString(),
    verifiedOnline: true,
  }
}

async function fetchSubjectReference ({
  origin,
  fetchImpl,
  timeoutMs,
}) {
  const subjectId = bangumiSubjectId(origin)
  let apiError = null
  try {
    const result = await fetchBangumiApiJson({
      pathname: `/v0/subjects/${subjectId}`,
      fetchImpl,
      options: {
        headers: {
          'Cache-Control': 'no-cache',
        },
      },
      timeoutMs,
      accept: value => String(value?.id || '') === String(subjectId),
    })
    const subject = result?.value
    if (!subject) throw new Error('Bangumi subject API returned no subject')
    if (!subjectMatchesOrigin(origin, subject)) {
      throw new PosterIdentityMismatchError(
        origin.work_title,
        subject?.name || '',
      )
    }
    const imageUrl = absoluteHttpUrl(
      subject?.images?.large || subject?.images?.common,
      BANGUMI_SUBJECT_API(subjectId),
    )
    if (!imageUrl) {
      throw new Error('Bangumi subject API has no usable cover')
    }
    return {
      title: String(origin.work_title || ''),
      imageUrl,
      source: result.source === 'bangumi-api'
        ? 'bangumi-subject-api'
        : `bangumi-subject-api:${result.source}`,
    }
  } catch (error) {
    if (error instanceof PosterIdentityMismatchError) throw error
    apiError = error
  }

  try {
    const result = await fetchBangumiWebsite({
      pathname: `/subject/${encodeURIComponent(subjectId)}`,
      fetchImpl,
      timeoutMs: Math.min(timeoutMs, 3600),
      options: {
        headers: {
          Accept: 'text/html',
          'Cache-Control': 'no-cache',
          'User-Agent': 'TypingManiaNovel/20260808 (verified poster lookup)',
        },
      },
    })
    const reference = parseBangumiSubjectPage(
      await result.value.text(),
      subjectId,
    )
    if (!reference.title || !reference.imageUrl) {
      throw new Error('Bangumi subject page has no usable cover')
    }
    if (!titlesMatch(origin.work_title, reference.title)) {
      throw new PosterIdentityMismatchError(
        origin.work_title,
        reference.title,
      )
    }
    return reference
  } catch (error) {
    if (error instanceof PosterIdentityMismatchError) throw error
    throw apiError || error
  }
}

export async function fetchAnimePoster ({
  origin,
  fetchImpl = globalThis.fetch,
  timeoutMs = 6000,
} = {}) {
  const subjectId = bangumiSubjectId(origin)
  if (!subjectId) return null
  const reference = await fetchSubjectReference({
    origin,
    fetchImpl,
    timeoutMs,
  })
  const { response } = await fetchFirstAvailable(
    fetchImpl,
    bangumiImageCandidates(reference.imageUrl, subjectId),
    {
      headers: {
        Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.5',
        'Cache-Control': 'no-cache',
        'User-Agent': 'TypingManiaNovel/20260808 (verified poster lookup)',
      },
      redirect: 'follow',
    },
    {
      timeoutMs: Math.max(6500, timeoutMs),
      perAttemptMs: Math.max(
        1200,
        Math.min(2200, Math.ceil(timeoutMs / 3)),
      ),
    },
  )
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`Bangumi poster HTTP ${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  const type = imageType(buffer, response.headers?.get?.('content-type') || '')
  if (!type || buffer.length < 256 || buffer.length > 12 * 1024 * 1024) {
    throw new Error('Bangumi poster response is not a usable image')
  }
  return {
    buffer,
    extension: type.extension,
    mime: type.mime,
    version: POSTER_SELECTION_VERSION,
    source: 'bangumi-verified-subject-poster',
    referenceSource: reference.source,
    catalog: 'bangumi',
    catalogId: subjectId,
    workTitle: reference.title,
    identityVerified: true,
    checkedAt: new Date().toISOString(),
    verifiedOnline: true,
  }
}

export default class MediaPosterResolver {
  constructor ({
    fetchImpl = globalThis.fetch,
    timeoutMs = 6000,
  } = {}) {
    this.fetchImpl = fetchImpl
    this.timeoutMs = timeoutMs
    this.cache = new Map()
    this.consecutiveNetworkFailures = 0
    this.networkDisabled = false
  }

  async resolve (origin) {
    const subjectId = bangumiSubjectId(origin)
    const externalUrl = externalPosterUrl(origin)
    if (!subjectId && !externalUrl) {
      return { checked: true, poster: null, reason: 'no-verified-poster' }
    }
    const cacheKey = subjectId
      ? `bangumi:${subjectId}`
      : `${origin.catalog}:${origin.catalog_id}:${externalUrl}`
    if (this.cache.has(cacheKey)) return this.cache.get(cacheKey)
    if (this.networkDisabled) {
      return { checked: false, poster: null, reason: 'network-disabled' }
    }
    try {
      const poster = subjectId
        ? await fetchAnimePoster({
            origin,
            fetchImpl: this.fetchImpl,
            timeoutMs: this.timeoutMs,
          })
        : await fetchExternalCatalogPoster({
            origin,
            fetchImpl: this.fetchImpl,
            timeoutMs: this.timeoutMs,
          })
      this.consecutiveNetworkFailures = 0
      const result = {
        checked: true,
        poster,
        reason: poster ? 'available' : 'not-found',
      }
      this.cache.set(cacheKey, result)
      return result
    } catch (error) {
      if (error instanceof PosterIdentityMismatchError) {
        const result = {
          checked: true,
          poster: null,
          reason: 'identity-mismatch',
          error: error.message,
        }
        this.cache.set(cacheKey, result)
        return result
      }
      this.consecutiveNetworkFailures++
      // The failed request already tried the official subject API, all
      // official website domains, and the direct image endpoint.
      if (this.consecutiveNetworkFailures >= 3) this.networkDisabled = true
      return {
        checked: false,
        poster: null,
        reason: 'network-error',
        error: error.message,
      }
    }
  }
}
