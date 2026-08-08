import { pinyin } from '../../vendor/runtime/node_modules/pinyin-pro/dist/index.mjs'
import { longestCommonSubsequenceLength } from './lyrics-quality.js'
import { japaneseReading, parseJapaneseRuby } from './japanese-pronunciation.js'

export const PRONUNCIATION_QUALITY_VERSION = 2

export { japaneseReading, parseJapaneseRuby }

const PINYIN_UMLAUT = new Map([
  ['ü', 'v'], ['ǖ', 'v'], ['ǘ', 'v'], ['ǚ', 'v'], ['ǜ', 'v'],
  ['Ü', 'V'], ['Ǖ', 'V'], ['Ǘ', 'V'], ['Ǚ', 'V'], ['Ǜ', 'V'],
])

function normalizedLanguageFamily (value) {
  const language = String(value || '').toLocaleUpperCase()
  if (/^(?:JP|JA|JPN)$/u.test(language)) return 'ja'
  if (/^(?:ZH|CN|CHI|ZHO)$/u.test(language)) return 'zh'
  if (/^(?:EN|ENG)$/u.test(language)) return 'en'
  return ''
}

export function lyricScriptProfile (text = '') {
  const source = String(text || '').normalize('NFKC')
  return {
    kana: (source.match(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu) || []).length,
    han: (source.match(/\p{Script=Han}/gu) || []).length,
    latin: (source.match(/\p{Script=Latin}/gu) || []).length,
  }
}

export function expectedLyricLanguage (metadata = {}, text = '') {
  const declared = normalizedLanguageFamily(metadata.language)
  if (declared) return declared
  const identity = `${metadata.title || ''}\n${metadata.rawTitle || ''}`
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(identity)) return 'ja'
  const profile = lyricScriptProfile(text)
  if (profile.kana >= 2) return 'ja'
  if (profile.han >= 8 && profile.kana === 0) return 'zh'
  if (profile.latin >= 8 && profile.han + profile.kana === 0) return 'en'
  return ''
}

/**
 * Reject a translated or otherwise wrong lyric layer before it can redefine
 * the song language. A whole Japanese vocal lyric containing substantial Han
 * text but no kana is overwhelmingly likely to be a Chinese translation; an
 * isolated Han-only Japanese row remains valid when the rest of the song
 * supplies Japanese script evidence.
 */
export function assertOriginalLyricLayer (metadata = {}, lines = []) {
  const text = (lines || []).map(line => line?.text || '').join('\n')
  const profile = lyricScriptProfile(text)
  const expected = expectedLyricLanguage(metadata, text)
  const cjk = profile.han + profile.kana
  if (
    expected === 'ja' &&
    profile.han >= 12 &&
    profile.kana === 0
  ) {
    throw new Error(
      'Japanese track matched a translated Chinese lyric layer',
    )
  }
  if (
    expected === 'zh' &&
    profile.kana >= 4 &&
    profile.kana / Math.max(1, cjk) >= 0.08
  ) {
    throw new Error('Chinese track matched a Japanese lyric layer')
  }
  if (
    expected === 'en' &&
    cjk >= 12 &&
    profile.latin < cjk * 0.4
  ) {
    throw new Error('English track matched a CJK translation lyric layer')
  }
  return { expected, profile }
}

export function lyricLanguage (value, text = '') {
  const declared = String(value || '').toLocaleUpperCase()
  const source = String(text || '')
  const hasKana = /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(source)
  const hasHan = /\p{Script=Han}/u.test(source)
  const hasLatin = /\p{Script=Latin}/u.test(source)
  if (hasKana) return 'ja'
  if (hasHan) {
    return /^(?:JP|JA|JPN)$/u.test(declared) ? 'ja' : 'zh'
  }
  // A declared song language describes the track, not necessarily every
  // lyric row. Pure Latin rows in Japanese and Chinese songs are typed as
  // their visible English text and must not require an invented reading.
  if (hasLatin) return 'en'
  if (/^(?:ZH|CN|CHI|ZHO)$/u.test(declared)) return 'zh'
  if (/^(?:JP|JA|JPN)$/u.test(declared)) return 'ja'
  if (/^(?:EN|ENG)$/u.test(declared)) return 'en'
  return 'en'
}

function replacePinyinUmlaut (value) {
  return Array.from(value, character => (
    PINYIN_UMLAUT.get(character) || character
  )).join('')
}

export function normalizePronunciation (value, language = '') {
  let normalized = replacePinyinUmlaut(
    String(value || '').normalize('NFKC'),
  )
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/['’‘`´]/g, '')
    .toLocaleLowerCase()
  if (lyricLanguage(language) === 'zh') {
    normalized = normalized.replace(/([a-zv])([1-5])/g, '$1')
  }
  return normalized
    .replace(/[_\s]+/g, '')
    .replace(/[^a-z]/g, '')
}

export function generateChinesePinyin (text) {
  return normalizePronunciation(pinyin(String(text || ''), {
    toneType: 'none',
    type: 'string',
    nonZh: 'consecutive',
  }), 'zh')
}

export function requiresSongSpecificReading (language, text = '') {
  return (
    lyricLanguage(language, text) === 'ja' &&
    /[\p{L}\p{N}]/u.test(String(text || ''))
  )
}

export function compareOfficialPronunciation (
  localLines,
  officialResult,
  language = '',
) {
  if (!officialResult?.readingChecked) {
    return {
      checked: false,
      passed: null,
      reason: officialResult?.readingReason || 'official pronunciation unavailable',
    }
  }
  const normalizeLine = line => normalizePronunciation(
    line?.reading ?? line?.text ?? line,
    language,
  )
  const local = (localLines || []).map(normalizeLine).filter(Boolean).join('')
  const official = (officialResult.readingLines || [])
    .map(normalizeLine)
    .filter(Boolean)
    .join('')
  if (!local || !official) {
    return {
      checked: false,
      passed: null,
      reason: 'official pronunciation unavailable',
    }
  }
  const matchedCharacters = longestCommonSubsequenceLength(local, official)
  const localCoverage = matchedCharacters / local.length
  const officialCoverage = matchedCharacters / official.length
  return {
    checked: true,
    passed: localCoverage >= 0.985 && officialCoverage >= 0.985,
    matchedCharacters,
    localCharacters: local.length,
    officialCharacters: official.length,
    localCoverage,
    officialCoverage,
  }
}

export async function pronunciationForLine ({
  text,
  providedReading = '',
  language = '',
}) {
  const family = lyricLanguage(language, text)
  const provided = normalizePronunciation(providedReading, family)
  if (provided) {
    return {
      family,
      reading: provided,
      source: 'qqmusic-qrc-roma',
      status: 'verified',
    }
  }
  if (family === 'zh' && /\p{Script=Han}/u.test(text)) {
    return {
      family,
      reading: generateChinesePinyin(text),
      source: 'pinyin-pro',
    }
  }
  if (family === 'ja') {
    const result = await japaneseReading(text, { explicitReading: providedReading })
    if (result.reading) return { family, ...result }
    return { family, ...result, source: result.source || 'missing' }
  }
  return {
    family,
    reading: '',
    source: family === 'en' ? 'original-text' : 'missing',
  }
}
