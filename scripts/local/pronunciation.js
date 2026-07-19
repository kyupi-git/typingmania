import { pinyin } from '../../vendor/runtime/node_modules/pinyin-pro/dist/index.mjs'
import { longestCommonSubsequenceLength } from './lyrics-quality.js'

export const PRONUNCIATION_QUALITY_VERSION = 1

const PINYIN_UMLAUT = new Map([
  ['ü', 'v'], ['ǖ', 'v'], ['ǘ', 'v'], ['ǚ', 'v'], ['ǜ', 'v'],
  ['Ü', 'V'], ['Ǖ', 'V'], ['Ǘ', 'V'], ['Ǚ', 'V'], ['Ǜ', 'V'],
])

export function lyricLanguage (value, text = '') {
  const declared = String(value || '').toLocaleUpperCase()
  if (/^(?:ZH|CN|CHI|ZHO)$/.test(declared)) return 'zh'
  if (/^(?:JP|JA|JPN)$/.test(declared)) return 'ja'
  if (/^(?:EN|ENG)$/.test(declared)) return 'en'
  if (/[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text)) return 'ja'
  if (/\p{Script=Han}/u.test(text)) return 'zh'
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

export function pronunciationForLine ({
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
    }
  }
  if (family === 'zh' && /\p{Script=Han}/u.test(text)) {
    return {
      family,
      reading: generateChinesePinyin(text),
      source: 'pinyin-pro',
    }
  }
  return {
    family,
    reading: '',
    source: family === 'en' ? 'original-text' : 'missing',
  }
}
