import { Buffer } from 'buffer'

import {
  fetchFirstAvailable,
  fetchWithTimeout,
} from './network.js'

export const POSTER_SELECTION_VERSION = 2

const BANGUMI_WEBSITE_ORIGINS = [
  'https://bgm.tv',
  'https://bangumi.tv',
  'https://chii.in',
]
const BANGUMI_SUBJECT_PAGE = subjectId =>
  `https://bgm.tv/subject/${encodeURIComponent(subjectId)}`
const BANGUMI_SUBJECT_API = subjectId =>
  `https://api.bgm.tv/v0/subjects/${encodeURIComponent(subjectId)}`
const BANGUMI_SUBJECT_IMAGE_API = subjectId =>
  `${BANGUMI_SUBJECT_API(subjectId)}/image?type=large`

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

async function fetchSubjectReference ({
  origin,
  fetchImpl,
  timeoutMs,
}) {
  const subjectId = bangumiSubjectId(origin)
  let pageError = null
  let pageReference = null
  try {
    const routes = BANGUMI_WEBSITE_ORIGINS.map(origin => (
      `${origin}/subject/${encodeURIComponent(subjectId)}`
    ))
    const { response } = await fetchFirstAvailable(
      fetchImpl,
      routes,
      {
        headers: {
          Accept: 'text/html',
          'Cache-Control': 'no-cache',
          'User-Agent': 'TypingManiaNovel/20260719 (verified poster lookup)',
        },
      },
      {
        timeoutMs: Math.min(timeoutMs, 3600),
        perAttemptMs: 1200,
      },
    )
    const reference = parseBangumiSubjectPage(await response.text(), subjectId)
    pageReference = reference
    if (reference.title && reference.imageUrl) {
      if (!titlesMatch(origin.work_title, reference.title)) {
        if (origin.title_scope !== 'direct-production') {
          throw new PosterIdentityMismatchError(
            origin.work_title,
            reference.title,
          )
        }
        pageError = new PosterIdentityMismatchError(
          origin.work_title,
          reference.title,
        )
      } else {
        return reference
      }
    }
    if (!pageError) {
      pageError = new Error('Bangumi subject page has no usable cover')
    }
  } catch (error) {
    if (error instanceof PosterIdentityMismatchError) throw error
    pageError = error
  }

  try {
    const response = await fetchWithTimeout(
      fetchImpl,
      BANGUMI_SUBJECT_API(subjectId),
      {
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache',
          'User-Agent': 'TypingManiaNovel/20260719 (verified poster lookup)',
        },
      },
      timeoutMs,
    )
    if (!response.ok) throw new Error(`Bangumi subject API ${response.status}`)
    const subject = await response.json()
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
    const verifiedImageUrl = imageUrl || pageReference?.imageUrl || ''
    if (!verifiedImageUrl) {
      throw new Error('Bangumi subject API has no usable cover')
    }
    return {
      title: String(origin.work_title || ''),
      imageUrl: verifiedImageUrl,
      source: 'bangumi-subject-api',
    }
  } catch (error) {
    if (error instanceof PosterIdentityMismatchError) throw error
    throw origin.title_scope === 'direct-production'
      ? error
      : pageError || error
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
    [
      reference.imageUrl,
      BANGUMI_SUBJECT_IMAGE_API(subjectId),
    ],
    {
      headers: {
        Accept: 'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.5',
        'Cache-Control': 'no-cache',
        'User-Agent': 'TypingManiaNovel/20260719 (verified poster lookup)',
      },
      redirect: 'follow',
    },
    {
      timeoutMs,
      perAttemptMs: Math.max(1200, Math.ceil(timeoutMs / 2)),
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

export default class AnimePosterResolver {
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
    if (!subjectId) {
      return { checked: true, poster: null, reason: 'no-bangumi-subject' }
    }
    if (this.cache.has(subjectId)) return this.cache.get(subjectId)
    if (this.networkDisabled) {
      return { checked: false, poster: null, reason: 'network-disabled' }
    }
    try {
      const poster = await fetchAnimePoster({
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
      this.cache.set(subjectId, result)
      return result
    } catch (error) {
      if (error instanceof PosterIdentityMismatchError) {
        const result = {
          checked: true,
          poster: null,
          reason: 'identity-mismatch',
          error: error.message,
        }
        this.cache.set(subjectId, result)
        return result
      }
      this.consecutiveNetworkFailures++
      // The failed request already tried the official subject API, all
      // official website domains, and the direct image endpoint.
      if (this.consecutiveNetworkFailures >= 1) this.networkDisabled = true
      return {
        checked: false,
        poster: null,
        reason: 'network-error',
        error: error.message,
      }
    }
  }
}
