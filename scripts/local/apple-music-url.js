export class AppleMusicImportError extends Error {
  constructor (code, message = code) {
    super(message)
    this.name = 'AppleMusicImportError'
    this.code = code
  }
}

export function appleMusicStorefrontLanguage (url) {
  let storefront = ''
  try {
    storefront = new URL(String(url || '')).pathname.split('/').filter(Boolean)[0]
  } catch {}
  if (storefront === 'jp') return 'ja-JP'
  if (storefront === 'cn') return 'zh-CN'
  if (storefront === 'tw') return 'zh-TW'
  if (storefront === 'hk') return 'zh-HK'
  return 'en-US'
}

export function normalizeAppleMusicUrls (values) {
  const source = Array.isArray(values)
    ? values
    : String(values || '').split(/[\r\n\s]+/u)
  const urls = []
  for (const value of source) {
    if (!String(value || '').trim()) continue
    let url
    try {
      url = new URL(String(value).trim())
    } catch {
      throw new AppleMusicImportError(
        'APPLE_MUSIC_URL_INVALID',
        'Enter a valid Apple Music song, album, or playlist URL.',
      )
    }
    const host = url.hostname.toLocaleLowerCase()
    if (
      url.protocol !== 'https:' ||
      !(host === 'music.apple.com' || host.endsWith('.music.apple.com')) ||
      /\/artist\//iu.test(url.pathname)
    ) {
      throw new AppleMusicImportError(
        'APPLE_MUSIC_URL_INVALID',
        'Only Apple Music song, album, and playlist URLs are supported.',
      )
    }
    urls.push(url.toString())
  }
  const unique = [...new Set(urls)]
  if (!unique.length) {
    throw new AppleMusicImportError(
      'APPLE_MUSIC_URL_REQUIRED',
      'Paste at least one Apple Music song, album, or playlist URL.',
    )
  }
  return unique.slice(0, 20)
}
