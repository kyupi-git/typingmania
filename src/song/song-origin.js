const ORIGIN_BRACKET_PAIRS = {
  '《': '》',
  '「': '」',
  '『': '』',
  '【': '】',
  '“': '”',
  '"': '"',
}

const TITLE_BRACKET_PAIRS = {
  ...ORIGIN_BRACKET_PAIRS,
  '(': ')',
  '（': '）',
  '[': ']',
}

function matchingBracketEnd (text, start) {
  const first = text[start]
  if (!ORIGIN_BRACKET_PAIRS[first]) return -1
  const stack = [first]
  for (let index = start + 1; index < text.length; index++) {
    const character = text[index]
    const expected = ORIGIN_BRACKET_PAIRS[stack.at(-1)]
    if (character === expected) {
      stack.pop()
      if (!stack.length) return index
    } else if (ORIGIN_BRACKET_PAIRS[character]) {
      stack.push(character)
    } else if (Object.values(ORIGIN_BRACKET_PAIRS).includes(character)) {
      // A mismatched closer means this is not a reliable outer title pair.
      return -1
    }
  }
  return -1
}

function bracketedOrigin (text) {
  for (let index = 0; index < text.length; index++) {
    if (!ORIGIN_BRACKET_PAIRS[text[index]]) continue
    const end = matchingBracketEnd(text, index)
    if (end < 0) continue
    const suffix = `${text.slice(0, index)} ${text.slice(end + 1)}`.trim()
    if (!firstMatch(suffix, ROLE_PATTERNS)) continue
    return {
      index,
      end,
      title: text.slice(index + 1, end).trim(),
      suffix,
    }
  }
  return null
}

function hasBalancedTitleBrackets (text) {
  const closers = new Set(Object.values(TITLE_BRACKET_PAIRS))
  const stack = []
  for (const character of String(text || '')) {
    const expected = stack.length
      ? TITLE_BRACKET_PAIRS[stack.at(-1)]
      : ''
    if (character === expected) {
      stack.pop()
    } else if (TITLE_BRACKET_PAIRS[character]) {
      stack.push(character)
    } else if (closers.has(character)) {
      return false
    }
  }
  return stack.length === 0
}

export const SONG_ORIGIN_VERSION = 3

const MEDIA_PATTERNS = [
  ['tv', /\bTV\s*(?:动画|動畫|アニメ|anime)/iu],
  ['film', /(?:剧场版|劇場版|anime\s+film|animated\s+film)/iu],
]

const ROLE_PATTERNS = [
  ['character', /(?:角色歌(?:曲)?|キャラクターソング|character\s+song)/iu],
  ['image', /(?:印象曲|イメージソング|image\s+song)/iu],
  ['insert', /(?:插入曲|插曲|挿入歌|insert\s+song)/iu],
  ['opening', /(?:片头(?:主题)?曲|片頭(?:主題)?曲|オープニング(?:テーマ|主題歌)?|opening(?:\s+(?:theme|song))?|\bOP\b)/iu],
  ['ending', /(?:片尾(?:主题)?曲|エンディング(?:テーマ|主題歌)?|ending(?:\s+(?:theme|song))?|\bED\b)/iu],
  ['theme', /(?:主题曲|主題歌|theme\s+song)/iu],
]

function firstMatch (text, patterns) {
  for (const [kind, pattern] of patterns) {
    const match = text.match(pattern)
    if (match) return { kind, match }
  }
  return null
}

function numberList (text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) return match[1].match(/\d+/g) || []
  }
  return []
}

function englishList (numbers) {
  if (numbers.length < 2) return numbers[0] || ''
  if (numbers.length === 2) return `${numbers[0]} and ${numbers[1]}`
  return `${numbers.slice(0, -1).join(', ')}, and ${numbers.at(-1)}`
}

function roleNumber (suffix, role) {
  const rest = suffix.slice((role.match.index || 0) + role.match[0].length)
  const after = rest.match(/^\s*(?:#|No\.?\s*)?(\d+)/iu)?.[1]
  if (after) return after
  const before = suffix.slice(0, role.match.index || 0)
  return before.match(/(?:第\s*)?(\d+)(?:\s*首)?\s*$/u)?.[1] || ''
}

export function parseSongOrigin (text) {
  const value = String(text || '')
  const outer = bracketedOrigin(value)
  if (!outer) return null

  const suffix = outer.suffix
  const role = firstMatch(suffix, ROLE_PATTERNS)
  if (!role) return null

  const media = firstMatch(suffix, MEDIA_PATTERNS)?.kind || ''
  const season = numberList(suffix, [
    /第\s*(\d+)\s*(?:季|期)/u,
    /\bseason\s*(\d+)\b/iu,
  ])[0] || ''
  const episodes = numberList(suffix, [
    /第\s*([\d\s、,，・和及&\-–—~～至]+)\s*(?:话|話)/u,
    /\bepisodes?\s*([\d\s,，・&\-–—~～toand]+)\b/iu,
  ])

  return {
    workTitle: outer.title,
    media,
    season,
    episodes,
    role: role.kind,
    roleNumber: roleNumber(suffix, role),
  }
}

const ROLE_TEXT = {
  zh: {
    opening: '片头曲',
    ending: '片尾曲',
    theme: '主题曲',
    insert: '插曲',
    character: '角色歌',
    image: '印象曲',
  },
  en: {
    opening: 'opening theme',
    ending: 'ending theme',
    theme: 'theme song',
    insert: 'insert song',
    character: 'character song',
    image: 'image song',
  },
  ja: {
    opening: 'オープニングテーマ',
    ending: 'エンディングテーマ',
    theme: '主題歌',
    insert: '挿入歌',
    character: 'キャラクターソング',
    image: 'イメージソング',
  },
}

function localizeChinese (parts) {
  const work = `《${parts.workTitle}》`
  const subject = parts.media === 'tv'
    ? `TV动画${work}`
    : parts.media === 'film'
      ? `剧场版动画${work}`
      : work
  const qualifiers = [
    parts.season ? `第${parts.season}季` : '',
    parts.episodes.length ? `第${parts.episodes.join('、')}话` : '',
  ].join('')
  const role = parts.roleNumber
    ? `第${parts.roleNumber}首${ROLE_TEXT.zh[parts.role]}`
    : ROLE_TEXT.zh[parts.role]
  return `${subject}${qualifiers}${role}`
}

function localizeEnglish (parts) {
  const work = `“${parts.workTitle}”`
  let subject = parts.media === 'tv'
    ? `the TV anime ${work}`
    : parts.media === 'film'
      ? `the anime film ${work}`
      : work
  if (parts.season) subject = `season ${parts.season} of ${subject}`
  if (parts.episodes.length) {
    subject = `${
      parts.episodes.length === 1 ? 'episode' : 'episodes'
    } ${englishList(parts.episodes)} of ${subject}`
  }
  const role = `${ROLE_TEXT.en[parts.role]}${
    parts.roleNumber ? ` ${parts.roleNumber}` : ''
  }`
  return `${role[0].toLocaleUpperCase()}${role.slice(1)} for ${subject}`
}

function localizeJapanese (parts) {
  const subject = parts.media === 'tv'
    ? `TVアニメ『${parts.workTitle}』`
    : parts.media === 'film'
      ? `劇場版アニメ『${parts.workTitle}』`
      : `『${parts.workTitle}』`
  const qualifiers = [
    parts.season ? `第${parts.season}期` : '',
    parts.episodes.length ? `第${parts.episodes.join('・')}話` : '',
  ].join('')
  const role = parts.roleNumber
    ? `第${parts.roleNumber}${ROLE_TEXT.ja[parts.role]}`
    : ROLE_TEXT.ja[parts.role]
  return `${subject}${qualifiers}${role}`
}

function normalizeParts (origin) {
  if (!origin) return null
  const workTitle = String(
    origin.work_title || origin.workTitle || origin.work || '',
  ).trim()
  const role = String(origin.role || '')
  if (!workTitle || !ROLE_TEXT.en[role]) return null
  return {
    workTitle,
    media: String(origin.medium || origin.media || ''),
    season: String(origin.season || ''),
    episodes: Array.isArray(origin.episodes)
      ? origin.episodes.map(String).filter(Boolean)
      : [],
    role,
    roleNumber: String(
      origin.sequence || origin.role_number || origin.roleNumber || '',
    ),
  }
}

export function hasVerifiedOriginalWorkTitle (origin) {
  return Boolean(
    Number(origin?.version || 0) >= SONG_ORIGIN_VERSION &&
    origin?.original_verified === true &&
    String(origin?.work_title || '').trim() &&
    hasBalancedTitleBrackets(origin?.work_title) &&
    ['catalog-primary', 'soundtrack-album'].includes(origin?.title_source),
  )
}

export function formatSongOrigin (
  origin,
  locale,
  { requireVerified = false } = {},
) {
  if (requireVerified && !hasVerifiedOriginalWorkTitle(origin)) return ''
  const parts = normalizeParts(origin)
  if (!parts) return ''
  if (locale === 'zh') return localizeChinese(parts)
  if (locale === 'ja') return localizeJapanese(parts)
  if (locale === 'en') return localizeEnglish(parts)
  return ''
}

/**
 * Localizes the structural part of an anime-song origin without a network
 * service. The work title inside brackets is intentionally preserved.
 */
export function localizeSongOrigin (text, locale) {
  const value = String(text || '')
  const parts = parseSongOrigin(value)
  if (!parts) return value
  return formatSongOrigin(parts, locale) || value
}
