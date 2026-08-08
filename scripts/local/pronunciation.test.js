import { test, expect } from '@jest/globals'

import {
  assertOriginalLyricLayer,
  compareOfficialPronunciation,
  expectedLyricLanguage,
  generateChinesePinyin,
  lyricLanguage,
  normalizePronunciation,
  pronunciationForLine,
  requiresSongSpecificReading,
} from './pronunciation.js'
import { japaneseTokenizerInitialized } from './japanese-pronunciation.js'

test('Japanese tokenizer is lazy and shared by concurrent reads', async () => {
  expect(japaneseTokenizerInitialized()).toBe(false)
  const [first, second] = await Promise.all([
    import('./japanese-pronunciation.js').then(({ japaneseReading }) => japaneseReading('明日へ走る')),
    import('./japanese-pronunciation.js').then(({ japaneseReading }) => japaneseReading('光を探す')),
  ])
  expect(first.reading).toBeTruthy()
  expect(second.reading).toBeTruthy()
  expect(japaneseTokenizerInitialized()).toBe(true)
})

test('a translated lyric layer cannot redefine a Japanese recording', () => {
  const translated = [
    { text: '不管你在什么地方都会尝试寻找你的身影' },
    { text: '即使能让我找到了你也无法和你说些什么' },
    { text: '即将过去的今天无法预见的明天' },
  ]
  expect(expectedLyricLanguage({
    title: '恋するココロ',
    language: 'U',
  }, translated.map(line => line.text).join('\n'))).toBe('ja')
  expect(() => assertOriginalLyricLayer({
    title: '恋するココロ',
    language: 'JP',
  }, translated)).toThrow(/translated Chinese lyric layer/iu)

  expect(() => assertOriginalLyricLayer({
    title: '恋するココロ',
    language: 'JP',
  }, [
    { text: 'どんな場所にいたって' },
    { text: '君の姿を探す' },
    { text: '過ぎ去る今日も まだ見ぬ明日も' },
  ])).not.toThrow()
})

test('detects the supported lyric language families', () => {
  expect(lyricLanguage('ZH', '你好')).toBe('zh')
  expect(lyricLanguage('JP', '明日')).toBe('ja')
  expect(lyricLanguage('JP', 'Follow the light')).toBe('en')
  expect(lyricLanguage('ZH', 'Tonight')).toBe('en')
  expect(lyricLanguage('ZH', '音乐 makes me smile')).toBe('zh')
  expect(lyricLanguage('', 'かな')).toBe('ja')
  expect(lyricLanguage('', 'hello')).toBe('en')
})

test('normalizes Chinese tone marks and tone numbers for physical typing', () => {
  expect(normalizePronunciation('nǐ hǎo，lǜ sè', 'ZH'))
    .toBe('nihaolvse')
  expect(normalizePronunciation('ni3 hao3 lv4 se4', 'ZH'))
    .toBe('nihaolvse')
})

test('generates compact contextual pinyin while retaining Latin text', async () => {
  expect(generateChinesePinyin('音乐让Tonight闪亮'))
    .toBe('yinyuerangtonightshanliang')
  expect(await pronunciationForLine({
    text: '晨光落在窗前',
    language: 'ZH',
  })).toMatchObject({
    family: 'zh',
    reading: 'chenguangluozaichuangqian',
    source: 'pinyin-pro',
  })
})

test('Japanese accepts dictionary pending readings while provider readings remain verified', async () => {
  expect((await pronunciationForLine({
    text: '朝の光',
    providedReading: 'a sa no hi ka ri',
    language: 'JP',
  })).reading).toBe('asanohikari')
  expect(await pronunciationForLine({
    text: '朝の光',
    language: 'JP',
  })).toMatchObject({
    reading: 'asanohikari',
    source: 'dictionary',
    status: 'pending',
  })
  expect(await pronunciationForLine({
    text: '宇宙',
    providedReading: 'so ra',
    language: 'JP',
  })).toMatchObject({
    reading: 'sora',
    source: 'qqmusic-qrc-roma',
  })
  expect(requiresSongSpecificReading('JP', '宇宙')).toBe(true)
  expect(requiresSongSpecificReading('JP', 'Follow the light')).toBe(false)
  expect(requiresSongSpecificReading('EN', 'space')).toBe(false)
  expect((await pronunciationForLine({
    text: 'Follow the light',
    language: 'EN',
  })).source).toBe('original-text')
})

test('partial ruby preserves visible text and assists pronunciation', async () => {
  expect(await pronunciationForLine({
    text: '宇宙(そら)を見上げる',
    language: 'JP',
  })).toMatchObject({
    reading: 'sorawomiageru',
    source: 'ruby',
    status: 'ruby-assisted',
    explicitRuby: 1,
  })
})

test('unknown Kanji remains rejected by the offline dictionary', async () => {
  expect(await pronunciationForLine({ text: '𠮷野家', language: 'JP' })).toMatchObject({
    reading: '',
    status: 'pending',
  })
})

test('official pronunciation confirms a lyricist-selected Japanese reading', () => {
  const local = [
    { start: 1000, reading: 'sora' },
    { start: 3000, reading: 'ashita' },
  ]
  expect(compareOfficialPronunciation(local, {
    readingChecked: true,
    readingLines: [
      { start: 1000, text: 'so ra' },
      { start: 3000, text: 'a shi ta' },
    ],
  }, 'JP')).toMatchObject({
    checked: true,
    passed: true,
    localCoverage: 1,
    officialCoverage: 1,
  })

  expect(compareOfficialPronunciation(local, {
    readingChecked: true,
    readingLines: [
      { start: 1000, text: 'u chuu' },
      { start: 3000, text: 'a shi ta' },
    ],
  }, 'JP')).toMatchObject({
    checked: true,
    passed: false,
  })
})

test('offline pronunciation remains available when the service has no Roma data', () => {
  expect(compareOfficialPronunciation([
    { start: 1000, reading: 'sora' },
  ], {
    readingChecked: false,
    readingReason: 'network timeout',
  }, 'JP')).toEqual({
    checked: false,
    passed: null,
    reason: 'network timeout',
  })
})
