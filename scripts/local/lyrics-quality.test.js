import { test } from '@jest/globals'

import {
  filterLyricLines,
  longestCommonSubsequenceLength,
  normalizeLyricComparable,
  normalizeReading,
  reconcileQrcWithOfficial,
} from './lyrics-quality.js'

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
