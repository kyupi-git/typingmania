import { test } from '@jest/globals'

import {
  filterLyricLines,
  isNonVocalTrackMetadata,
  longestCommonSubsequenceLength,
  normalizeLyricComparable,
  normalizeReading,
  normalizeExplicitPronunciation,
  reconcileQrcWithOfficial,
  stripInlineLyricRuby,
  timedLyricsAgreement,
  LYRIC_QUALITY_VERSION,
} from './lyrics-quality.js'

test('lyric quality version is bumped for structural metadata filtering', () => {
  expect(LYRIC_QUALITY_VERSION).toBe(14)
})

test('copyright and unauthorized-use notices are removed across languages', () => {
  const result = filterLyricLines([
    { start: 0, text: '未经著作权人许可不得翻唱翻录或使用' },
    { start: 500, text: '本作品未经许可，不得翻唱、翻录或以其他方式使用' },
    { start: 1000, text: '未經著作權人許可，不得翻唱、翻錄或以其他方式使用' },
    { start: 1500, text: 'Copyright © 2026 All rights reserved' },
    { start: 2000, text: 'Unauthorized reproduction and distribution prohibited.' },
    { start: 2500, text: '無断転載禁止' },
    { start: 3000, text: '著作権者の許諾なく複製・配信禁止' },
    { start: 3500, text: '未经许可的爱不能停止' },
    { start: 4000, text: 'You are the right one for me' },
    { start: 4500, text: '配信の夜に君と歌う' },
  ])
  expect(result.removed.map(line => line.text)).toEqual([
    '未经著作权人许可不得翻唱翻录或使用',
    '本作品未经许可，不得翻唱、翻录或以其他方式使用',
    '未經著作權人許可，不得翻唱、翻錄或以其他方式使用',
    'Copyright © 2026 All rights reserved',
    'Unauthorized reproduction and distribution prohibited.',
    '無断転載禁止',
    '著作権者の許諾なく複製・配信禁止',
  ])
  expect(result.kept.map(line => line.text)).toEqual([
    '未经许可的爱不能停止',
    'You are the right one for me',
    '配信の夜に君と歌う',
  ])
})

test('explicit pronunciation separators are normalized without changing display text', () => {
  expect(normalizeExplicitPronunciation('<<心 的 歌>>[ko ko no uta]'))
    .toBe('<<心 的 歌>>[kokonouta]')
  expect(normalizeExplicitPronunciation('<<心 的 歌>>[ko’ko‘no\u0027uta]'))
    .toBe('<<心 的 歌>>[kokonouta]')
  expect(normalizeExplicitPronunciation('<<歌>>[huxannki-(emi)...]', 'JP'))
    .toBe('<<歌>>[huxannkiemi]')
  expect(normalizeExplicitPronunciation('<<歌>>[2ninn]', 'JP'))
    .toBe('<<歌>>[futari]')
  expect(normalizeExplicitPronunciation('visible lyric')).toBe('visible lyric')
  expect(() => normalizeExplicitPronunciation('<<歌>>[こえ]')).toThrow(/unsupported/iu)
  expect(() => normalizeExplicitPronunciation('<<歌>>[ko-ko2]')).toThrow(/unsupported/iu)
})

test('Chinese, English and Japanese credit/speaker blocks are removed', () => {
  const result = filterLyricLines([
    { start: 0, text: '和声编写/和声：陈真' },
    { start: 500, text: '人声编辑：蔡志成' },
    { start: 1000, text: '混音工程师：Aki' },
    { start: 1500, text: '音楽総監督：山田' },
    { start: 2000, text: 'PGM：Studio' },
    { start: 2500, text: '张远：' },
    { start: 3000, text: '歌手/观众：' },
    { start: 9000, text: '心：你听见了吗' },
  ], { artistNames: ['张远'] })
  expect(result.removed.map(line => line.text)).toEqual([
    '和声编写/和声：陈真', '人声编辑：蔡志成', '混音工程师：Aki',
    '音楽総監督：山田', 'PGM：Studio', '张远：', '歌手/观众：',
  ])
  expect(result.kept.map(line => line.text)).toEqual(['心：你听见了吗'])
})

test('music coordination credits are removed across script variants', () => {
  const result = filterLyricLines([
    { start: 0, text: '音乐统筹：许夙 @ELEVENZ' },
    { start: 1000, text: '音樂統籌：許夙' },
    { start: 2000, text: '音楽統括：山田' },
    { start: 3000, text: 'We sing beneath the open sky' },
  ], {})
  expect(result.removed.map(line => line.text)).toEqual([
    '音乐统筹：许夙 @ELEVENZ', '音樂統籌：許夙', '音楽統括：山田',
  ])
  expect(result.kept.map(line => line.text)).toEqual([
    'We sing beneath the open sky',
  ])
})

test('recording edition title headers are removed only at the beginning', () => {
  const result = filterLyricLines([
    { start: 0, text: '那一天' },
    { start: 16000, text: '那一天' },
    { start: 18000, text: '我们终于再见' },
  ], { title: '那一天（女声版）' })
  expect(result.removed).toEqual([{ start: 0, text: '那一天', kind: 'header' }])
  expect(result.kept.map(line => line.text)).toEqual(['那一天', '我们终于再见'])
})

test('empty multilingual speaker labels are removed while natural colons remain', () => {
  const result = filterLyricLines([
    { start: 7000, text: 'Pakway：' },
    { start: 9000, text: 'Alaric的窗台：' },
    { start: 10000, text: '合：' },
    { start: 10500, text: 'All:' },
    { start: 11000, text: '心：你还好吗' },
  ], {})
  expect(result.removed.map(line => line.text)).toEqual([
    'Pakway：', 'Alaric的窗台：', '合：', 'All:',
  ])
  expect(result.kept.map(line => line.text)).toEqual(['心：你还好吗'])
})

test('speaker-shaped lines with正文 are retained even for verified names', () => {
  const result = filterLyricLines([
    { start: 7000, text: '张三/李四：我们一起唱' },
    { start: 8000, text: 'All: everybody sing along' },
    { start: 9000, text: '张远：我们一起唱' },
  ], { artistNames: ['张远'] })
  expect(result.kept.map(line => line.text)).toEqual([
    '张三/李四：我们一起唱', 'All: everybody sing along',
    '张远：我们一起唱',
  ])
  expect(result.removed).toEqual([])
})

test('instrumental titles and provider no-lyrics placeholders are rejected', () => {
  expect(isNonVocalTrackMetadata({ title: 'Sample Song (Instrumental)' })).toBe(true)
  expect(isNonVocalTrackMetadata({ title: 'Sample Song (Inst.)' })).toBe(true)
  expect(isNonVocalTrackMetadata({ title: 'サンプル曲 -off vocal-' })).toBe(true)
  expect(isNonVocalTrackMetadata({ title: 'Sample Song (Off Main Vocal)' })).toBe(true)
  expect(isNonVocalTrackMetadata({ title: 'サンプル曲（インストルメンタル）' })).toBe(true)
  expect(isNonVocalTrackMetadata({ title: '示例歌曲（伴奏）' })).toBe(true)
  expect(isNonVocalTrackMetadata({ title: 'Sample Song (English Ver.)' })).toBe(false)

  const result = filterLyricLines([
    { start: 0, text: '纯音乐，请欣赏' },
    { start: 1000, text: '暂无歌词' },
    { start: 2000, text: 'Music carries me home' },
  ], { language: 'EN' })
  expect(result.kept.map(line => line.text)).toEqual(['Music carries me home'])
  expect(result.removed.map(line => line.kind)).toEqual(['non-vocal', 'non-vocal'])
})

test('QQ Music title and credit rows are removed before pronunciation pairing', () => {
  const lines = [
    { start: 0, text: 'サンプル曲 - サンプル歌手' },
    { start: 5000, text: '词:示例作词人' },
    { start: 6000, text: '编 曲 : 示例作曲人' },
    { start: 7000, text: 'サンプル曲の歌詞です' },
  ]
  const result = filterLyricLines(lines, { title: 'サンプル曲' })
  expect(result.kept.map(line => line.text)).toEqual(['サンプル曲の歌詞です'])
  expect(result.removed.map(line => line.kind)).toEqual(['header', 'credit', 'credit'])
})

test('romanized credit labels with QQ Music spacing are removed', () => {
  const lines = [
    { start: 0, text: 'xi : fulu ya xin' },
    { start: 5000, text: 'he n kyo ku : HoneyWorks' },
    { start: 6000, text: 'to ri ko ni na n te' },
  ]
  const result = filterLyricLines(lines, {}, { romanized: true })
  expect(result.kept.map(line => line.text)).toEqual(['to ri ko ni na n te'])
})

test('English byline credits are removed without deleting real lyrics', () => {
  const lines = [
    { start: 1000, text: 'Lyrics by:Saya Gray/Daniel Caesar' },
    { start: 2000, text: 'Composed by:Saya Gray/Daniel Caesar/Daiki Tsuneta' },
    { start: 3000, text: 'Written in the stars above' },
    { start: 4000, text: 'Music is the answer tonight' },
  ]
  const result = filterLyricLines(lines, { language: 'EN' })
  expect(result.kept.map(line => line.text)).toEqual([
    'Written in the stars above',
    'Music is the answer tonight',
  ])
  expect(result.removed.map(line => line.kind)).toEqual(['credit', 'credit'])
})

test('Chinese production credits and Japanese compound credits are removed', () => {
  const lines = [
    { start: 1000, text: '填词：示例作者' },
    { start: 2000, text: '监制：示例监制' },
    { start: 3000, text: '作詞・作曲：サンプル作者' },
    { start: 4000, text: '混音：示例工程师' },
    { start: 5000, text: '音乐让今晚闪亮' },
    { start: 6000, text: '歌を歌って歩こう' },
  ]
  const result = filterLyricLines(lines, {})
  expect(result.kept.map(line => line.text)).toEqual([
    '音乐让今晚闪亮',
    '歌を歌って歩こう',
  ])
  expect(result.removed).toHaveLength(4)
})

test('ratio-colon credit separators from NetEase lyrics are removed', () => {
  const result = filterLyricLines([
    { start: 1000, text: '作词∶示例作者/作曲∶示例作曲' },
    { start: 2000, text: '风吹过安静的街道' },
  ], { language: 'ZH' })
  expect(result.kept.map(line => line.text)).toEqual(['风吹过安静的街道'])
  expect(result.removed.map(line => line.kind)).toEqual(['credit'])
})

test('unpunctuated CJK credits and English section headings are not lyrics', () => {
  const result = filterLyricLines([
    { start: 0, text: '作词 李明' },
    { start: 500, text: '作詞作曲 山田花子' },
    { start: 1000, text: '[Verse 1]' },
    { start: 1500, text: 'Chorus:' },
    { start: 2000, text: 'Music carries me home' },
  ], { language: 'EN' })

  expect(result.kept.map(line => line.text)).toEqual([
    'Music carries me home',
  ])
  expect(result.removed.map(line => line.kind)).toEqual([
    'credit',
    'credit',
    'header',
    'header',
  ])
})

test('reading normalization removes separators and display-only symbols', () => {
  expect(normalizeReading("to ri ko ni na 't te → a i")).toEqual({
    text: 'torikoninatteai',
    unsupportedLetters: [],
  })
})

test('lyric comparison ignores punctuation and inline Japanese ruby', () => {
  expect(normalizeLyricComparable('運命共同体(しんゆう)からキスなんて!'))
    .toBe(normalizeLyricComparable('運命共同体からキスなんて'))
  expect(longestCommonSubsequenceLength('abcdef', 'abqdef')).toBe(5)
  expect(stripInlineLyricRuby('夕焼(ゆうや)けの空')).toBe('夕焼けの空')
  expect(stripInlineLyricRuby('ため息(いき')).toBe('ため息')
})

test('whole-song lyric agreement tolerates wrapping but rejects another song', () => {
  const line = text => ({ start: 0, text })
  const local = [
    line('Every word is moving through the quiet night'),
    line('We follow every light across the open sky'),
    line('Nothing ever slows the rhythm in our hands'),
    line('The final line is waiting for us there'),
  ]
  const sameSong = [
    line('Every word is moving'),
    line('through the quiet night'),
    line('We follow every light across the open sky'),
    line('Nothing ever slows the rhythm in our hands'),
    line('The final line is waiting for us there!'),
  ]
  const unrelated = [
    line('A distant river wakes below the mountain'),
    line('Morning settles softly on the empty road'),
    line('Someone leaves a letter by the doorway'),
    line('Winter turns the rooftops silver white'),
  ]

  expect(timedLyricsAgreement(local, sameSong).confident).toBe(true)
  expect(timedLyricsAgreement(local, unrelated).confident).toBe(false)
})

test('an exact timed title header is removed without deleting later title lyrics', () => {
  const result = filterLyricLines([
    { start: 0, text: 'オレンジ' },
    { start: 4000, text: 'オレンジ' },
    { start: 7000, text: '笑顔で歩いて行こう' },
  ], { title: 'オレンジ', artist: '釘宮理恵' })
  expect(result.removed).toEqual([
    { start: 0, text: 'オレンジ', kind: 'header' },
  ])
  expect(result.kept.map(line => line.text)).toEqual([
    'オレンジ',
    '笑顔で歩いて行こう',
  ])
})

test('high-confidence official timing repairs text and a missing QRC main line', () => {
  const line = (start, text) => ({ start, end: start + 900, text, tokens: [] })
  const result = reconcileQrcWithOfficial({
    mainLines: [line(1000, 'first'), line(3000, 'thrid'), line(4000, 'fourth')],
    readingLines: [line(1000, 'faasuto'), line(2000, 'sekando'), line(3000, 'saado'), line(4000, 'foosu')],
    officialLines: [line(1000, 'first'), line(2000, 'second'), line(3000, 'third'), line(4000, 'fourth')],
  })
  expect(result.confident).toBe(true)
  expect(result.replacements).toBe(1)
  expect(result.recoveredLines).toBe(1)
  expect(result.mainLines.map(item => item.text)).toEqual(['first', 'second', 'third', 'fourth'])
})

test('unrelated official text is never used to rewrite a QRC candidate', () => {
  const line = (start, text) => ({ start, end: start + 900, text, tokens: [] })
  const original = [line(1000, 'completely wrong'), line(2000, 'other song')]
  const result = reconcileQrcWithOfficial({
    mainLines: original,
    readingLines: [line(1000, 'wrong'), line(2000, 'song')],
    officialLines: [line(1000, 'correct lyric'), line(2000, 'right track')],
  })
  expect(result.confident).toBe(false)
  expect(result.mainLines).toBe(original)
})
