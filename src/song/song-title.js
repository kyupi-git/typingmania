export const SONG_TITLE_CLEANUP_VERSION = 3

const BRACKETED_TEXT = /\(([^()]*)\)|（([^（）]*)）|\[([^\[\]]*)\]|【([^【】]*)】/gu

const VERSION_MARKER = /(?:^|[\s._-])(?:another|alternate|album|anime|acoustic|demo|edit|full|instrumental|karaoke|live|mix|mono|movie|off[\s-]?vocal|original|radio|remaster(?:ed)?|remix|reprise|short|single|special|stereo|the first take|tv|unplugged|version|ver)(?:$|[\s._-])|(?:现场|現場|伴奏|纯音乐|純音楽|翻唱|重制|重製|短版|完整版|劇場版|剧场版|電影版|电影版|特別版|特别版|テレビ版|アニメ版|日本語版|日语版|日語版|中文版|中国語版|英語版|英文版|韓国語版|韩语版|韓語版)/iu
const PERFORMANCE_MARKER = /^(?:feat(?:uring)?|ft|with|cv|vocal|vocals|performed by|sung by|歌|唄|歌唱|演唱|ボーカル)\b|^(?:歌|唄|歌唱|演唱|ボーカル)\s*[:：]/iu
const SOURCE_MARKER = /^(?:from|ost|op|ed|opening|ending|insert(?: song)?|theme)\b/iu
const NUMBER_MARKER = /^(?:[#№]\s*)?\d+(?:[.\-/]\d+)*$|^(?:part|pt|chapter|episode|ep|act|movement|take|disc|disk|track|season)\s*[#№.:_-]?\s*\d+/iu
const STRUCTURAL_MARKER = /(?:章|篇|編|部|幕|話)$/u
const EXPLICIT_ALIAS_MARKER = /^(?:translated title|translation|english title|chinese title|japanese title|korean title|中文(?:译名|譯名|名)?|英文(?:译名|譯名)?|日文(?:译名|譯名)?|韩文(?:译名|譯名)?|韓文(?:译名|譯名)?)\s*[:：]/iu

// Keep this detector intentionally narrow: common Han/Japanese new-form
// characters such as 体, 恋, and 号 are not evidence of Chinese translation.
const NARROW_SIMPLIFIED_MARKER = /[类译语话门间过这还远边进]/u
const NARROW_JAPANESE_MARKER = /[々〆ヶ偽間類]/u

function normalizeForComparison (value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]/gu, '')
}

function bracketContent (match) {
  return match.slice(1).find(value => value !== undefined) || ''
}

function characterProfile (value) {
  const profile = {
    han: 0,
    kana: 0,
    hangul: 0,
    latin: 0,
  }
  for (const character of String(value || '')) {
    if (/\p{Script=Hiragana}|\p{Script=Katakana}/u.test(character)) profile.kana++
    else if (/\p{Script=Hangul}/u.test(character)) profile.hangul++
    else if (/\p{Script=Han}/u.test(character)) profile.han++
    else if (/\p{Script=Latin}/u.test(character)) profile.latin++
  }
  return profile
}

function primaryScript (profile) {
  if (profile.kana) return 'japanese'
  if (profile.hangul) return 'korean'
  if (profile.han) return 'han'
  if (profile.latin) return 'latin'
  return ''
}

function normalizedLanguage (value) {
  const language = String(value || '').toLocaleUpperCase()
  if (/^(?:JP|JA|JPN)$/.test(language)) return 'japanese'
  if (/^(?:KO|KR|KOR)$/.test(language)) return 'korean'
  if (/^(?:ZH|CN|ZHO|CHI)$/.test(language)) return 'han'
  if (/^(?:EN|ENG)$/.test(language)) return 'latin'
  return ''
}

function isShortAcronym (value) {
  const compact = String(value || '').replace(/\s+/g, '')
  return /^[A-Z][A-Z0-9&+._-]{1,7}$/.test(compact)
}

function hasSharedLatinPrefixWithDifferentHanSuffix (baseTitle, content, language) {
  if (normalizedLanguage(language) !== 'japanese') return false
  const split = value => String(value || '')
    .normalize('NFKC')
    .trim()
    .match(/^([A-Za-z][A-Za-z0-9&+._-]{1,15})\s*(.+)$/u)
  const base = split(baseTitle)
  const alias = split(content)
  return Boolean(
    base &&
    alias &&
    base[1].toLocaleLowerCase() === alias[1].toLocaleLowerCase() &&
    normalizeForComparison(base[2]) !== normalizeForComparison(alias[2]) &&
    /\p{Script=Han}/u.test(base[2]) &&
    /\p{Script=Han}/u.test(alias[2]),
  )
}

export function isSongTitleQualifier (value) {
  const content = String(value || '').normalize('NFKC').trim()
  return Boolean(
    !content ||
    VERSION_MARKER.test(content) ||
    PERFORMANCE_MARKER.test(content) ||
    SOURCE_MARKER.test(content) ||
    NUMBER_MARKER.test(content) ||
    STRUCTURAL_MARKER.test(content) ||
    isShortAcronym(content)
  )
}

function isTrailingBracketSequence (title, end) {
  return !title
    .slice(end)
    .replace(BRACKETED_TEXT, '')
    .trim()
}

function aliasDecision ({
  baseTitle,
  content,
  language,
  trailing,
}) {
  const trimmed = content.trim()
  if (!trimmed || isSongTitleQualifier(trimmed)) {
    return { remove: false, reason: 'title-qualifier' }
  }
  if (EXPLICIT_ALIAS_MARKER.test(trimmed)) {
    return { remove: true, reason: 'explicit-translation-label' }
  }

  const baseComparable = normalizeForComparison(baseTitle)
  const contentComparable = normalizeForComparison(trimmed)
  if (!baseComparable || !contentComparable) {
    return { remove: false, reason: 'insufficient-text' }
  }
  if (baseComparable === contentComparable) {
    return { remove: true, reason: 'duplicate-title' }
  }
  if (!trailing) {
    return { remove: false, reason: 'embedded-parenthetical' }
  }
  if (hasSharedLatinPrefixWithDifferentHanSuffix(
    baseTitle,
    trimmed,
    language,
  )) {
    return { remove: true, reason: 'shared-prefix-translation' }
  }

  if (
    normalizedLanguage(language) === 'japanese' &&
    NARROW_SIMPLIFIED_MARKER.test(trimmed) &&
    NARROW_JAPANESE_MARKER.test(baseTitle)
  ) {
    return { remove: true, reason: 'same-script-simplified-alias' }
  }

  const baseScript = primaryScript(characterProfile(baseTitle))
  const contentScript = primaryScript(characterProfile(trimmed))
  if (!baseScript || !contentScript || baseScript === contentScript) {
    return { remove: false, reason: 'same-or-unknown-script' }
  }

  let confidence = 3
  const declaredScript = normalizedLanguage(language)
  if (declaredScript && declaredScript === baseScript) confidence++
  if (trimmed.length >= 2 && trimmed.length <= 64) confidence++
  return confidence >= 4
    ? { remove: true, reason: 'cross-script-alias' }
    : { remove: false, reason: 'uncertain-cross-script' }
}

export function analyzeSongTitle (value, { language = '' } = {}) {
  const rawTitle = String(value || '').trim()
  if (!rawTitle) {
    return {
      version: SONG_TITLE_CLEANUP_VERSION,
      rawTitle,
      title: rawTitle,
      removedAliases: [],
      changed: false,
    }
  }

  const matches = [...rawTitle.matchAll(BRACKETED_TEXT)]
  const baseTitle = rawTitle.replace(BRACKETED_TEXT, ' ').replace(/\s+/g, ' ').trim()
  const removedAliases = []
  const decisions = new Map()
  for (const match of matches) {
    const content = bracketContent(match)
    const decision = aliasDecision({
      baseTitle,
      content,
      language,
      trailing: isTrailingBracketSequence(rawTitle, match.index + match[0].length),
    })
    decisions.set(match.index, decision)
    if (decision.remove) {
      removedAliases.push({
        text: content.trim(),
        reason: decision.reason,
      })
    }
  }

  let offset = 0
  const pieces = []
  for (const match of matches) {
    pieces.push(rawTitle.slice(offset, match.index))
    if (!decisions.get(match.index)?.remove) pieces.push(match[0])
    offset = match.index + match[0].length
  }
  pieces.push(rawTitle.slice(offset))
  const title = pieces
    .join('')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim() || rawTitle

  return {
    version: SONG_TITLE_CLEANUP_VERSION,
    rawTitle,
    title,
    removedAliases,
    changed: title !== rawTitle,
  }
}

export function originalSongTitle (value, language = '') {
  return analyzeSongTitle(value, { language }).title
}
