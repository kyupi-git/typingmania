import { expect, test } from '@jest/globals'

import {
  alignTrackSpecificReadings,
  convertTimedLyrics,
  normalizeLyricTimingWindows,
  parseLrc,
} from './timed-lyrics.js'

function lrc (lines) {
  return lines.map((text, index) => (
    `[00:${String(index * 3).padStart(2, '0')}.00]${text}`
  )).join('\n')
}

test('recording-specific readings align by text despite a timing offset', () => {
  const aligned = alignTrackSpecificReadings({
    targetLines: [
      { start: 1000, end: 3000, text: '明日へ' },
      { start: 3000, end: 5000, text: '走り出す' },
    ],
    sourceLines: [
      { start: 2750, end: 4750, text: '明日へ' },
      { start: 4750, end: 6750, text: '走り出す' },
    ],
    sourceReadings: [
      { start: 2750, end: 4750, text: 'a shi ta e' },
      { start: 4750, end: 6750, text: 'ha shi ri da su' },
    ],
  })

  expect(aligned).toEqual([
    { start: 1000, end: 3000, text: 'a shi ta e', tokens: [] },
    { start: 3000, end: 5000, text: 'ha shi ri da su', tokens: [] },
  ])
})

test('LRC parsing applies offsets and derives line end times', () => {
  const lines = parseLrc('[offset:250]\n[00:01.50]First\n[00:03.00]Second')
  expect(lines).toEqual([
    { start: 1750, end: 3250, text: 'First', tokens: [] },
    { start: 3250, end: 8250, text: 'Second', tokens: [] },
  ])
})

test('an instrumental break is not assigned to the previous short lyric', () => {
  const lines = [
    [1_000, 3_000, 'We sing', 'wesing'],
    [3_000, 5_000, 'Moving on', 'movingon'],
    [5_000, 35_000, 'Stay', 'stay'],
    [35_000, 37_000, 'Back again', 'backagain'],
    [37_000, 39_000, 'One more time', 'onemoretime'],
  ]
  const stats = normalizeLyricTimingWindows(lines)
  expect(lines[2][1]).toBeLessThanOrEqual(10_500)
  expect(stats.adjusted).toBe(1)
  expect(stats.removedGapMs).toBeGreaterThan(20_000)
})

test('a dense lyric with a legitimately long duration is not shortened', () => {
  const lines = [
    [1_000, 4_000, 'We sing together', 'wesingtogether'],
    [4_000, 7_000, 'Moving through the night', 'movingthroughthenight'],
    [7_000, 16_000, 'Every little word is carried by the melody tonight', 'everylittlewordiscarriedbythemelodytonight'],
    [16_000, 19_000, 'Back again', 'backagain'],
    [19_000, 22_000, 'One more time', 'onemoretime'],
  ]
  const originalEnd = lines[2][1]
  expect(normalizeLyricTimingWindows(lines).adjusted).toBe(0)
  expect(lines[2][1]).toBe(originalEnd)
})

test('a short lyric cannot inherit a seven-second instrumental gap', () => {
  const lines = [
    [1_000, 3_000, 'Keep moving', 'keepmoving'],
    [3_000, 5_000, 'Sing it now', 'singitnow'],
    [5_000, 12_500, 'Stay', 'stay'],
    [12_500, 14_500, 'Come back', 'comeback'],
    [14_500, 16_500, 'One more', 'onemore'],
  ]
  const stats = normalizeLyricTimingWindows(lines)
  expect(stats.adjusted).toBe(1)
  expect(lines[2][1]).toBeLessThan(10_000)
})

test('a moderate lyric cannot inherit a long instrumental break', () => {
  const lines = [
    [40_000, 44_000, '<<言葉を重ねて>>[kotobawokasanete]'],
    [44_000, 48_000, '<<心を揺らして>>[kokorowoyurashite]'],
    [50_370, 63_890, '<<きっとそれだけなんだ>>[kittosoredakenanda]'],
    [66_600, 70_400, '<<明日へ向かう>>[ashitaemukau]'],
    [70_400, 74_200, '<<また会えるよ>>[mataaeruyo]'],
  ]
  const stats = normalizeLyricTimingWindows(lines)
  expect(stats.adjusted).toBe(1)
  expect(lines[2][1]).toBeLessThan(62_000)
  expect(stats.removedGapMs).toBeGreaterThan(2_000)
})

test('instrumental metadata and token-poor placeholder lyrics are not playable', async () => {
  const instrumentalLines = parseLrc(lrc([
    'la',
    'la',
    'la',
    'la',
    'la',
  ]), { durationMs: 15_000 })
  await expect(convertTimedLyrics({
    mainLines: instrumentalLines,
    metadata: { language: 'EN', title: 'Demo (Instrumental)', duration: 15 },
  })).rejects.toThrow(/instrumental|non-vocal/iu)

  const placeholderLines = parseLrc(lrc([
    'No lyrics',
    'Instrumental',
    'Please enjoy',
    'Music only',
    'BGM',
  ]), { durationMs: 15_000 })
  await expect(convertTimedLyrics({
    mainLines: placeholderLines,
    metadata: { language: 'EN', title: 'Demo', duration: 15 },
  })).rejects.toThrow(/playable timed lines/iu)
})

test('timed conversion rejects a translated lyric layer after metadata filtering', async () => {
  const lines = parseLrc(lrc([
    '不管你在什么地方都会寻找你的身影',
    '即使找到你也无法说些什么',
    '今天过去明天无法预见',
    '世界仍然继续旋转',
  ]), { durationMs: 12_000 })
  await expect(convertTimedLyrics({
    mainLines: lines,
    metadata: { language: 'JP', title: '恋するココロ', duration: 12 },
  })).rejects.toThrow(/translated Chinese lyric layer/iu)
})

test('English conversion removes credits and keeps only letter input', async () => {
  const lines = parseLrc(lrc([
    'Lyrics by Example Writer',
    'We type the lights',
    'Across the quiet room',
    'Every word is moving',
    'Nothing slows the rhythm',
    'And the ending lands',
  ]), { durationMs: 18_000 })
  const converted = await convertTimedLyrics({
    mainLines: lines,
    metadata: { language: 'EN', duration: 18 },
  })
  expect(converted.stats.removedMainMetadataLines).toBe(1)
  expect(converted.stats.playableLines).toBe(5)
  expect(converted.lyricsCsv).not.toContain('Lyrics by Example Writer')
})

test('Chinese conversion generates offline pinyin for every lyric line', async () => {
  const lines = parseLrc(lrc([
    '星光落在指尖',
    '微风穿过窗前',
    '我们写下今天',
    '让旋律不停歇',
    '明天依然相见',
  ]), { durationMs: 15_000 })
  const converted = await convertTimedLyrics({
    mainLines: lines,
    metadata: { language: 'ZH', duration: 15 },
  })
  expect(converted.stats.generatedPinyinLines).toBe(5)
  expect(converted.stats.displayOnlyLines).toBe(0)
})

test('Japanese Kanji without verification is accepted as pending dictionary pronunciation', async () => {
  const mainLines = parseLrc(lrc([
    '明日へ走る',
    '光を探す',
    '心を重ねる',
    '未来へ届け',
    '今ここで歌う',
  ]), { durationMs: 15_000 })
  const pending = await convertTimedLyrics({
    mainLines,
    metadata: { language: 'JP', duration: 15 },
  })
  expect(pending.stats.pronunciationStatus).toBe('pending')

  const readingLines = parseLrc(lrc([
    'ashitaehashiru',
    'hikariwosagasu',
    'kokorowokasaneru',
    'miraie todoke',
    'imakokodeutau',
  ]), { durationMs: 15_000 })
  const converted = await convertTimedLyrics({
    mainLines,
    readingLines,
    metadata: { language: 'JP', duration: 15 },
    readingSource: 'provider-test',
  })
  expect(converted.stats.songSpecificPronunciationLines).toBe(5)
})

test('Japanese inline ruby guides typing but is hidden from the lyric display', async () => {
  const mainLines = parseLrc(lrc([
    '夕焼(ゆうや)けの空(そら)',
    '明日(あした)へ行(い)こう',
    '心(こころ)は近(ちか)く',
    '未来(みらい)を見(み)よう',
    '一緒(いっしょ)に歌(うた)う',
  ]), { durationMs: 15_000 })
  const converted = await convertTimedLyrics({
    mainLines,
    metadata: { language: 'JP', duration: 15 },
  })
  expect(converted.stats.playableLines).toBe(5)
  expect(converted.stats.pronunciationOverrideLines).toBe(5)
  expect(converted.lyricsCsv).toContain('夕焼けの空')
  expect(converted.lyricsCsv).not.toContain('(ゆうや)')
})

test('mixed partial ruby overrides one word and dictionary completes the rest', async () => {
  const lines = parseLrc(lrc([
    '宇宙(そら)を見上げる',
    '明日へ走る',
    '光を探す',
    '心を重ねる',
    '未来へ届け',
  ]), { durationMs: 15_000 })
  const converted = await convertTimedLyrics({
    mainLines: lines,
    metadata: { language: 'JP', duration: 15 },
  })
  expect(converted.stats.pronunciationStatus).toBe('ruby-assisted')
  expect(converted.lyricsCsv).toContain('<<宇宙を見上げる>>')
  expect(converted.lyricsCsv).not.toContain('(そら)')
  expect(converted.lyricsCsv).toContain('[sorawomiageru]')
})
