const CJK_CREDIT_PREFIX = /^(?:(?:作詞・作曲|作詞作曲|作词作曲|詞曲|词曲|作詞|作词|作曲|作編曲|作编曲|編曲|编曲|詞|词|曲|填詞|填词|譜曲|谱曲|監修|监制|監製|制作人|製作人|プロデュース|歌手|原唱|演唱|歌唱|歌|唄|和聲|和声|録音|录音|錄音|混音|母帶|母带|吉他|ギター|貝斯|贝斯|ベース|鼓|ドラム|鍵盤|键盘|キーボード|弦樂|弦乐|翻譯|翻译|譯|译|發行|发行|出品|版權|版权)(?:\s*(?:[・/&、,+]|and)\s*(?:作詞|作词|作曲|作編曲|作编曲|編曲|编曲|詞|词|曲|填詞|填词|譜曲|谱曲|監修|监制|監製|制作人|製作人|歌|唄))*)(?:\s*[:：∶]|\s+)/iu
const ENGLISH_CREDIT_PREFIX = /^(?:(?:lyrics?|words|music|compos(?:ed|er|ition)|written|songwrit(?:er|ing)|arrang(?:ed|er|ement)|produc(?:ed|er|tion)|perform(?:ed|er)|vocals?|mix(?:ed|er|ing)|master(?:ed|ing)|record(?:ed|ing)|publish(?:ed|er)|translation|translated)(?:\s*(?:&|and|\/|\+)\s*(?:lyrics?|words|music|compos(?:ed|er|ition)|written|songwrit(?:er|ing)|arrang(?:ed|er|ement)|produc(?:ed|er|tion)))?\s*(?:(?:by|from)\s*[:：]?|[:：]))/iu
const COPYRIGHT_PREFIX = /^(?:©|℗|copyright\b|all rights reserved\b|未經許可|未经许可|本歌曲来自|本歌曲來自|qq音乐|qq音樂)/iu
const ROMANIZED_CREDIT_PREFIX = /^(?:shi|xi|sakushi|kyoku|kiyoku|sakkyoku|henkyoku|henkiyoku|seisakujin)\s*[:：]/iu
const LRC_METADATA = /^\[(?:ar|al|ti|by|offset|kana|language|re|ve):/iu
const SECTION_HEADER = /^(?:[\[【(（]\s*)?(?:verse|chorus|pre[\s-]?chorus|bridge|intro|outro|hook|refrain|interlude|instrumental|rap|spoken|主歌|副歌|前奏|间奏|間奏|尾奏|サビ|[ABC]メロ)(?:\s*\d+)?\s*(?:[\]】)）]|[:：])?$/iu
const NON_VOCAL_PLACEHOLDER =
  /^(?:纯音乐(?:[，,]?请欣赏)?|純音樂(?:[，,]?請欣賞)?|纯音乐无歌词|純音楽|暂无歌词|暫無歌詞|该歌曲暂无歌词|該歌曲暫無歌詞|此歌曲为没有填词的纯音乐|此歌曲為沒有填詞的純音樂|无歌词|無歌詞|歌詞なし|インスト(?:ゥ?ルメンタル)?|inst(?:rumental)?\.?|instrumental music|no lyrics|music only|background music|bgm)$/iu
const NON_VOCAL_TITLE =
  /(?:^|[\s([（【._-])(?:inst(?:rumental)?\.?|karaoke|off(?:[\s-]+main)?[\s-]?vocal|backing track|伴奏|纯音乐|純音樂|純音楽|カラオケ|インスト(?:ゥ?ルメンタル)?|bgm)(?:$|[\s)\]）】._-])/iu
export const LYRIC_QUALITY_VERSION = 10

export function isNonVocalTrackMetadata (metadata = {}) {
  return NON_VOCAL_TITLE.test(
    `${metadata.rawTitle || ''} ${metadata.title || ''} ${metadata.subtitle || ''}`,
  )
}

export function stripInlineLyricRuby (text) {
  return String(text || '').replace(
    /([\p{Script=Han}々〆ヵヶ]+)[\(（]([\p{Script=Hiragana}\p{Script=Katakana}ー・\s]+)[\)）]/gu,
    '$1',
  ).replace(
    /([\p{Script=Han}々〆ヵヶ]+)[\(（]([\p{Script=Hiragana}\p{Script=Katakana}ー・\s]+)$/gu,
    '$1',
  )
}

export function inlineLyricRubyReading (text) {
  const source = String(text || '')
  let replacements = 0
  const reading = source.replace(
    /([\p{Script=Han}々〆ヵヶ]+)[\(（]([\p{Script=Hiragana}\p{Script=Katakana}ー・\s]+)[\)）]/gu,
    (_, _written, value) => {
      replacements++
      return value
    },
  ).replace(
    /([\p{Script=Han}々〆ヵヶ]+)[\(（]([\p{Script=Hiragana}\p{Script=Katakana}ー・\s]+)$/gu,
    (_, _written, value) => {
      replacements++
      return value
    },
  )
  return replacements > 0 && !/[\p{Script=Han}々〆ヵヶ]/u.test(reading)
    ? reading
    : ''
}

export function normalizeLyricComparable (value) {
  return stripInlineLyricRuby(value)
    .replace(/^(?:\[[^\]]+\])+/, '')
    .replace(/\(\d+,\d+\)/g, '')
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}\s]/gu, '')
}

export function normalizeReading (text) {
  const normalized = text
    .normalize('NFKC')
    .replace(/['’‘]/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[_\s]+/g, '')
    .trim()
  const unsupportedLetters = [...normalized]
    .filter(character => /[\p{L}\p{N}]/u.test(character) && !/[\x20-\x7E]/.test(character))
  return {
    text: normalized.replace(/[^\x20-\x7E]/g, ''),
    unsupportedLetters,
  }
}

export function lyricLineKind (line, {
  metadata = {},
  index = 0,
  romanized = false,
} = {}) {
  const text = String(line?.text ?? line ?? '').normalize('NFKC').trim()
  if (!text || !/[\p{L}\p{N}]/u.test(text)) {
    return 'decoration'
  }
  if (LRC_METADATA.test(text)) {
    return 'metadata'
  }
  if (SECTION_HEADER.test(text)) {
    return 'header'
  }
  if (NON_VOCAL_PLACEHOLDER.test(text)) {
    return 'non-vocal'
  }
  const compactLabel = text.replace(/\s+/g, '')
  if (
    CJK_CREDIT_PREFIX.test(text) ||
    CJK_CREDIT_PREFIX.test(compactLabel) ||
    ENGLISH_CREDIT_PREFIX.test(text) ||
    COPYRIGHT_PREFIX.test(text) ||
    (romanized && ROMANIZED_CREDIT_PREFIX.test(compactLabel))
  ) {
    return 'credit'
  }

  const start = Number(line?.start) || 0
  const identityValues = [
    metadata.title,
    metadata.rawTitle,
    metadata.artist,
    ...(metadata.artistNames || []),
    metadata.album,
  ]
    .map(normalizeLyricComparable)
    .filter(Boolean)
  if (
    index <= 3 &&
    start <= 3000 &&
    identityValues.includes(normalizeLyricComparable(text))
  ) {
    return 'header'
  }
  if (index <= 1 && start <= 20_000 && /\s[-–—]\s/.test(text)) {
    return 'header'
  }
  return 'lyric'
}

export function filterLyricLines (lines, metadata, options = {}) {
  const kept = []
  const removed = []
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    const kind = lyricLineKind(line, { metadata, index, ...options })
    if (kind === 'lyric') {
      kept.push(line)
    } else {
      removed.push({ ...line, kind })
    }
  }
  return { kept, removed }
}

export function longestCommonSubsequenceLength (left, right) {
  if (left.length < right.length) {
    [left, right] = [right, left]
  }
  const row = new Uint32Array(right.length + 1)
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    let diagonal = 0
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const previous = row[rightIndex]
      if (left[leftIndex - 1] === right[rightIndex - 1]) {
        row[rightIndex] = diagonal + 1
      } else if (row[rightIndex - 1] > row[rightIndex]) {
        row[rightIndex] = row[rightIndex - 1]
      }
      diagonal = previous
    }
  }
  return row[right.length]
}

function lyricNgrams (text, size = 3) {
  const values = new Set()
  if (text.length < size) return values
  for (let index = 0; index <= text.length - size; index++) {
    values.add(text.slice(index, index + size))
  }
  return values
}

/**
 * Compare two lyric resources without depending on identical line breaks or
 * timestamps. Trigram containment tolerates punctuation, provider-specific
 * wrapping, and an extra translation track, while the length/line guards keep
 * a shared chorus from falsely validating an unrelated or incomplete lyric.
 */
export function timedLyricsAgreement (
  leftLines,
  rightLines,
  { metadata = {} } = {},
) {
  const comparable = lines => filterLyricLines(lines || [], metadata).kept
    .map(line => normalizeLyricComparable(line?.text ?? line))
    .filter(Boolean)
  const left = comparable(leftLines)
  const right = comparable(rightLines)
  const leftText = left.join('')
  const rightText = right.join('')
  const shorterCharacters = Math.min(leftText.length, rightText.length)
  const longerCharacters = Math.max(leftText.length, rightText.length)
  if (
    left.length < 4 ||
    right.length < 4 ||
    shorterCharacters < 24
  ) {
    return {
      confident: false,
      confidence: 0,
      containment: 0,
      lengthBalance: longerCharacters
        ? shorterCharacters / longerCharacters
        : 0,
      exactLineCoverage: 0,
    }
  }

  const leftNgrams = lyricNgrams(leftText)
  const rightNgrams = lyricNgrams(rightText)
  const smaller = leftNgrams.size <= rightNgrams.size
    ? leftNgrams
    : rightNgrams
  const larger = smaller === leftNgrams ? rightNgrams : leftNgrams
  let overlap = 0
  for (const value of smaller) {
    if (larger.has(value)) overlap++
  }
  const containment = overlap / Math.max(1, smaller.size)
  const lengthBalance = shorterCharacters / Math.max(1, longerCharacters)
  const leftSet = new Set(left)
  const rightSet = new Set(right)
  const smallerLines = left.length <= right.length ? left : right
  const otherLines = smallerLines === left ? rightSet : leftSet
  const exactLineCoverage = smallerLines.filter(line => otherLines.has(line))
    .length / Math.max(1, smallerLines.length)
  const confidence = containment * (
    0.75 + Math.min(1, lengthBalance) * 0.25
  )
  return {
    confident: (
      containment >= 0.72 &&
      lengthBalance >= 0.34 &&
      (
        exactLineCoverage >= 0.2 ||
        containment >= 0.86
      )
    ),
    confidence,
    containment,
    lengthBalance,
    exactLineCoverage,
  }
}

function pairNearestLines (leftLines, rightLines, maximumDelta = 500) {
  const unused = new Set(rightLines.map((_, index) => index))
  return leftLines.map(left => {
    let bestIndex = -1
    let bestDelta = Infinity
    for (const index of unused) {
      const delta = Math.abs(rightLines[index].start - left.start)
      if (delta < bestDelta) {
        bestIndex = index
        bestDelta = delta
      }
    }
    if (bestIndex >= 0 && bestDelta <= maximumDelta) {
      unused.delete(bestIndex)
      return { left, right: rightLines[bestIndex], delta: bestDelta }
    }
    return { left, right: null, delta: null }
  })
}

export function reconcileQrcWithOfficial ({
  mainLines,
  readingLines,
  officialLines = [],
}) {
  const unchanged = {
    mainLines,
    confident: false,
    confidence: 0,
    replacements: 0,
    recoveredLines: 0,
  }
  if (!mainLines.length || !readingLines.length || !officialLines.length) {
    return unchanged
  }

  const mainToOfficial = pairNearestLines(mainLines, officialLines)
  const aligned = mainToOfficial.filter(pair => pair.right)
  const exactAnchors = aligned.filter(pair => (
    normalizeLyricComparable(pair.left.text) === normalizeLyricComparable(pair.right.text)
  )).length
  const timelineCoverage = aligned.length / Math.max(mainLines.length, officialLines.length)
  const anchorCoverage = exactAnchors / Math.max(1, Math.min(mainLines.length, officialLines.length))
  const mainText = mainLines.map(line => normalizeLyricComparable(line.text)).join('')
  const officialText = officialLines.map(line => normalizeLyricComparable(line.text)).join('')
  const commonCharacters = longestCommonSubsequenceLength(mainText, officialText)
  const sequenceCoverage = commonCharacters / Math.max(1, Math.max(mainText.length, officialText.length))
  const confidence = Math.min(timelineCoverage, Math.max(anchorCoverage, sequenceCoverage))
  const confident = timelineCoverage >= 0.75 && (anchorCoverage >= 0.60 || sequenceCoverage >= 0.95)
  if (!confident) {
    return { ...unchanged, confidence }
  }

  const usedOfficial = new Set()
  let replacements = 0
  const repaired = mainToOfficial.map(pair => {
    if (!pair.right) return pair.left
    usedOfficial.add(pair.right)
    const local = normalizeLyricComparable(pair.left.text)
    const official = normalizeLyricComparable(pair.right.text)
    const lineCommon = longestCommonSubsequenceLength(local, official)
    const lineSimilarity = lineCommon / Math.max(1, Math.max(local.length, official.length))
    if (local === official || lineSimilarity >= 0.72) {
      if (pair.left.text !== pair.right.text) replacements++
      return { ...pair.left, text: pair.right.text }
    }
    return pair.left
  })

  const readingToMain = pairNearestLines(readingLines, mainLines)
  let recoveredLines = 0
  for (const pair of readingToMain) {
    if (pair.right) continue
    let best = null
    let bestDelta = Infinity
    for (const official of officialLines) {
      if (usedOfficial.has(official)) continue
      const delta = Math.abs(official.start - pair.left.start)
      if (delta < bestDelta) {
        best = official
        bestDelta = delta
      }
    }
    if (best && bestDelta <= 500) {
      usedOfficial.add(best)
      repaired.push({
        start: pair.left.start,
        end: pair.left.end,
        text: best.text,
        tokens: [],
        recoveredFromOfficial: true,
      })
      recoveredLines++
    }
  }

  repaired.sort((left, right) => left.start - right.start)
  return {
    mainLines: repaired,
    confident: true,
    confidence,
    replacements,
    recoveredLines,
  }
}
