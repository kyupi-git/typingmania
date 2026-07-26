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
  // Some provider catalogs omit the TV prefix for character and image
  // songs. Film-specific wording is checked first, so a remaining generic
  // animation label safely describes the television/series production.
  ['tv', /(?:动画|動畫|アニメ|\banime\b)/iu],
  ['documentary', /(?:纪录片|紀錄片|記録映画|ドキュメンタリー|documentary)/iu],
  ['commercial', /(?:广告片|廣告片|广告|廣告|コマーシャル|テレビCM|\bCM\b|\bcommercial\b|\badvert(?:isement|ising)?\b)/iu],
  ['variety', /(?:综艺节目|綜藝節目|综艺|綜藝|バラエティ番組|\bvariety\s+show\b)/iu],
  ['sports-event', /(?:体育赛事|體育賽事|体育比赛|體育比賽|スポーツ(?:大会|イベント|中継)|\bsports?\s+(?:event|broadcast|tournament|competition)\b)/iu],
  ['television', /(?:电视剧|電視劇|电视连续剧|電視連續劇|テレビドラマ|\bTV\s*(?:drama|series|show)\b|television\s+(?:drama|series))/iu],
  ['movie', /(?:电影|電影|実写映画|映画|\bmovie\b|motion\s+picture|\bfilm\b)/iu],
  ['visual-novel', /(?:视觉小说|視覺小說|美少女游戏|美少女遊戲|ギャルゲー|ビジュアルノベル|visual\s+novel|galgame)/iu],
  ['jrpg', /(?:日式角色扮演游戏|日式角色扮演遊戲|JRPG|RPG)/iu],
  ['game', /(?:电子游戏|電子遊戲|游戏|遊戲|ゲーム|video\s+game|\bgame\b)/iu],
]

const ROLE_PATTERNS = [
  ['soundtrack', /(?:原声带(?:收录)?歌曲|原聲帶(?:收錄)?歌曲|サウンドトラック収録曲|soundtrack\s+(?:song|track))/iu],
  ['character', /(?:角色(?:歌(?:曲)?|曲)|キャラクターソング|character\s+song)/iu],
  ['image', /(?:印象曲|イメージソング|image\s+song)/iu],
  ['insert', /(?:插入曲|插曲|挿入歌|insert\s+song)/iu],
  ['opening', /(?:片头(?:主题)?曲|片頭(?:主題)?曲|オープニング(?:テーマ|主題歌)?|opening(?:\s+(?:theme|song))?|\bOP\b)/iu],
  ['ending', /(?:片尾(?:主题)?曲|エンディング(?:テーマ|主題歌)?|ending(?:\s+(?:theme|song))?|\bED\b)/iu],
  ['theme', /(?:主题曲|主題歌|テーマソング|theme\s+song)/iu],
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
    soundtrack: '原声带歌曲',
  },
  en: {
    opening: 'opening theme',
    ending: 'ending theme',
    theme: 'theme song',
    insert: 'insert song',
    character: 'character song',
    image: 'image song',
    soundtrack: 'soundtrack song',
  },
  ja: {
    opening: 'オープニングテーマ',
    ending: 'エンディングテーマ',
    theme: '主題歌',
    insert: '挿入歌',
    character: 'キャラクターソング',
    image: 'イメージソング',
    soundtrack: 'サウンドトラック収録曲',
  },
}

function localizeChinese (parts) {
  const work = `《${parts.workTitle}》`
  const subject = parts.media === 'tv'
    ? `TV动画${work}`
    : parts.media === 'film'
      ? `剧场版动画${work}`
      : parts.media === 'television'
        ? `电视剧${work}`
        : parts.media === 'movie'
          ? `电影${work}`
          : parts.media === 'documentary'
            ? `纪录片${work}`
            : parts.media === 'commercial'
              ? `广告片${work}`
              : parts.media === 'variety'
                ? `综艺节目${work}`
                : parts.media === 'sports-event'
                  ? `体育赛事${work}`
          : parts.media === 'visual-novel'
            ? `视觉小说${work}`
            : parts.media === 'jrpg'
              ? `日式角色扮演游戏${work}`
              : parts.media === 'game'
                ? `游戏${work}`
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
      : parts.media === 'television'
        ? `the TV series ${work}`
        : parts.media === 'movie'
          ? `the film ${work}`
          : parts.media === 'documentary'
            ? `the documentary ${work}`
            : parts.media === 'commercial'
              ? `the commercial ${work}`
              : parts.media === 'variety'
                ? `the variety show ${work}`
                : parts.media === 'sports-event'
                  ? `the sports event ${work}`
          : parts.media === 'visual-novel'
            ? `the visual novel ${work}`
            : parts.media === 'jrpg'
              ? `the JRPG ${work}`
              : parts.media === 'game'
                ? `the game ${work}`
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
      : parts.media === 'television'
        ? `テレビドラマ『${parts.workTitle}』`
        : parts.media === 'movie'
          ? `映画『${parts.workTitle}』`
          : parts.media === 'documentary'
            ? `ドキュメンタリー『${parts.workTitle}』`
            : parts.media === 'commercial'
              ? `CM『${parts.workTitle}』`
              : parts.media === 'variety'
                ? `バラエティ番組『${parts.workTitle}』`
                : parts.media === 'sports-event'
                  ? `スポーツイベント『${parts.workTitle}』`
          : parts.media === 'visual-novel'
            ? `ビジュアルノベル『${parts.workTitle}』`
            : parts.media === 'jrpg'
              ? `JRPG『${parts.workTitle}』`
              : parts.media === 'game'
                ? `ゲーム『${parts.workTitle}』`
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
 * Localizes the structural part of a screen-song origin without a network
 * service. The work title inside brackets is intentionally preserved.
 */
export function localizeSongOrigin (text, locale) {
  const value = String(text || '')
  const parts = parseSongOrigin(value)
  if (!parts) return value
  return formatSongOrigin(parts, locale) || value
}
