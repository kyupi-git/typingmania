import {
  nextPlayableTypingKey,
  playableTypingKeys,
} from '../typing/typing-text.js'

function normalizedLanguage (value) {
  const language = String(value || '').toLocaleLowerCase()
  if (/^(?:zh|zho|chi|cn)/u.test(language)) return 'zh'
  if (/^(?:ja|jp|jpn)/u.test(language)) return 'ja'
  if (/^(?:en|eng)/u.test(language)) return 'en'
  return 'unknown'
}

function isLatinBase (value) {
  return /^[A-Za-z]+$/u.test(String(value || '').normalize('NFKC'))
}

function isHanBase (value) {
  return /\p{Script=Han}/u.test(String(value || ''))
}

function isJapaneseBase (value) {
  return /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(
    String(value || ''),
  )
}

const PINYIN_INITIALS = [
  '', 'b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h',
  'j', 'q', 'x', 'zh', 'ch', 'sh', 'r', 'z', 'c', 's', 'y', 'w',
]
const PINYIN_FINALS = [
  'a', 'o', 'e', 'i', 'u', 'v', 'ai', 'ei', 'ao', 'ou', 'an', 'en',
  'ang', 'eng', 'ong', 'er', 'ia', 'ie', 'iao', 'iu', 'ian', 'in',
  'iang', 'ing', 'iong', 'ua', 'uo', 'uai', 'ui', 'uan', 'un',
  'uang', 'ueng', 'ue', 've', 'van', 'vn',
]
const PINYIN_SYLLABLES = new Set([
  'n', 'ng', ...PINYIN_INITIALS.flatMap(initial => (
    PINYIN_FINALS.map(final => `${initial}${final}`)
  )),
])

function hanCount (value) {
  return Array.from(String(value || ''))
    .filter(character => /\p{Script=Han}/u.test(character))
    .length
}

function pinyinGateOffsets (keys, expectedSyllables) {
  if (!keys.length || expectedSyllables <= 0) return []
  const memo = new Map()
  const split = (offset, remaining) => {
    const memoKey = `${offset}:${remaining}`
    if (memo.has(memoKey)) return memo.get(memoKey)
    if (offset === keys.length && remaining === 0) return []
    if (offset >= keys.length || remaining <= 0) return null
    for (let end = keys.length; end > offset; end--) {
      if (!PINYIN_SYLLABLES.has(keys.slice(offset, end))) continue
      const tail = split(end, remaining - 1)
      if (tail) {
        const result = [offset, ...tail]
        memo.set(memoKey, result)
        return result
      }
    }
    memo.set(memoKey, null)
    return null
  }
  return split(0, expectedSyllables) || []
}

const JAPANESE_CLUSTERS = new Set([
  'sh', 'ch', 'ts', 'ky', 'gy', 'ny', 'hy', 'by', 'py', 'my', 'ry',
  'sy', 'zy', 'jy', 'ty', 'dy', 'cy', 'kw', 'gw', 'sw', 'tw', 'dw',
  'fw', 'vw',
])

function japaneseGateOffsets (keys) {
  const gates = []
  const vowels = 'aeiou'
  let previousVowel = ''
  let offset = 0
  while (offset < keys.length) {
    const character = keys[offset]
    if (vowels.includes(character)) {
      const extendsPrevious = character === previousVowel ||
        (previousVowel === 'o' && character === 'u')
      if (!extendsPrevious) gates.push(offset)
      previousVowel = character
      offset++
      continue
    }

    gates.push(offset)
    const next = keys[offset + 1] || ''
    if (
      (character === 'n' && (!next || (!vowels.includes(next) && next !== 'y'))) ||
      (character === next && character !== 'n')
    ) {
      previousVowel = ''
      offset++
      continue
    }

    let cursor = offset + 1
    if (JAPANESE_CLUSTERS.has(`${character}${keys[cursor] || ''}`)) {
      cursor++
    }
    if (vowels.includes(keys[cursor] || '')) {
      previousVowel = keys[cursor]
      cursor++
    } else {
      previousVowel = ''
    }
    offset = Math.max(offset + 1, cursor)
  }
  return gates
}

/**
 * Build the small set of physical keys a player must supply in Simple mode.
 * The plan is based on the recording-specific playable reading already stored
 * in the song package, so Japanese special readings and Chinese pinyin remain
 * authoritative instead of being regenerated here.
 */
export function createAssistLinePlan (line, language = 'unknown') {
  const rubyEntries = []
  const keys = []
  for (const ruby of line?.rubies || []) {
    const rubyKeys = playableTypingKeys(ruby.getRemainingText())
    const start = keys.length
    keys.push(...rubyKeys)
    rubyEntries.push({
      base: String(ruby.base || ''),
      start,
      length: rubyKeys.length,
    })
  }

  const gates = new Set()
  const locale = normalizedLanguage(language)
  let latinGroup = []
  const flushLatin = () => {
    if (!latinGroup.length) return
    gates.add(latinGroup[0].start)
    latinGroup = []
  }

  for (const entry of rubyEntries) {
    if (entry.length && isLatinBase(entry.base)) {
      latinGroup.push(entry)
      continue
    }
    flushLatin()
    if (!entry.length) continue
    const entryKeys = keys.slice(entry.start, entry.start + entry.length)
      .join('').toLocaleLowerCase()
    if (locale === 'ja' || isJapaneseBase(entry.base)) {
      for (const offset of japaneseGateOffsets(entryKeys)) {
        gates.add(entry.start + offset)
      }
    } else if (isHanBase(entry.base)) {
      const pinyinOffsets = pinyinGateOffsets(entryKeys, hanCount(entry.base))
      gates.add(entry.start)
      for (const offset of pinyinOffsets.slice(1)) {
        gates.add(entry.start + offset)
      }
    } else {
      gates.add(entry.start)
    }
  }
  flushLatin()
  if (keys.length && !gates.size) gates.add(0)
  return {
    keys,
    gates: [...gates].sort((left, right) => left - right),
  }
}

export default class AssistPlayer {
  constructor (typing, typer, { language = 'unknown' } = {}) {
    this.typing = typing
    this.typer = typer
    this.language = language
    this.plans = typing.lines.map(line => ({
      ...createAssistLinePlan(line, language),
      cursor: 0,
      missed: 0,
    }))
  }

  planFor (lineId = this.typing.current_line) {
    return this.plans[lineId] || { keys: [], gates: [], cursor: 0, missed: 0 }
  }

  requiredText (lineId = this.typing.current_line) {
    const plan = this.planFor(lineId)
    return plan.gates
      .filter(index => index >= plan.cursor)
      .map(index => plan.keys[index])
      .join(' ')
      .toUpperCase()
  }

  lineRequiredText (lineId) {
    const plan = this.planFor(lineId)
    return plan.gates.map(index => plan.keys[index]).join('').toUpperCase()
  }

  lineEffectText (lineId) {
    return this.planFor(lineId).keys.join('').toUpperCase()
  }

  isGate (plan) {
    return plan.gates.includes(plan.cursor)
  }

  autoUntilGate () {
    const lineId = this.typing.current_line
    const line = this.typing.getCurrentLine()
    const plan = this.planFor(lineId)
    let typed = 0
    while (line && !line.isCompleted() && !this.isGate(plan)) {
      const key = nextPlayableTypingKey(line.getRemainingText())
      if (!key) break
      const accepted = this.typer.type(key, {
        feedbackKind: 'assisted',
        playSound: false,
        updateDisplay: false,
        recordScore: false,
      })
      if (accepted < 0) break
      plan.cursor++
      typed++
    }
    if (typed && line && !line.isCompleted()) this.typer.updateTypingLine()
    return typed
  }

  syncLine () {
    this.autoUntilGate()
  }

  type (key) {
    const lineId = this.typing.current_line
    const line = this.typing.getCurrentLine()
    if (!line || line.isCompleted()) return -1
    this.autoUntilGate()
    const plan = this.planFor(lineId)
    const expected = String(plan.keys[plan.cursor] || '')
      .toLocaleLowerCase()
    const supplied = String(key || '').toLocaleLowerCase()
    // TypingChar accepts several valid romanization paths (for example
    // Kunrei and Hepburn alternatives). Simple mode has already published one
    // exact gate sequence, so accepting another path here would desynchronize
    // plan.cursor from TypingLine and could let assisted input cross the next
    // word/mora boundary. Treat every non-prompted key as an ordinary miss
    // without mutating the lyric cursor.
    const accepted = supplied === expected
      ? this.typer.type(key)
      : this.typer.type(key, { forceReject: true })
    if (accepted >= 0) {
      plan.cursor++
      this.autoUntilGate()
      if (!line.isCompleted()) this.typer.updateTypingLine()
    }
    return accepted
  }

  finishExpiredLine (lineId) {
    const line = this.typing.lines[lineId]
    const plan = this.planFor(lineId)
    if (!line || line.isCompleted()) return 0
    while (!line.isCompleted()) {
      const key = nextPlayableTypingKey(line.getRemainingText())
      if (!key) break
      const required = this.isGate(plan)
      const accepted = this.typer.type(key, {
        showFeedback: true,
        feedbackKind: required ? 'missed' : 'assisted',
        playSound: false,
        updateDisplay: false,
        finishLine: false,
        recordScore: false,
      })
      if (accepted < 0) break
      if (required) plan.missed++
      plan.cursor++
    }
    return plan.missed
  }

  takeMissed (lineId) {
    const plan = this.planFor(lineId)
    const missed = plan.missed
    plan.missed = 0
    return missed
  }
}
