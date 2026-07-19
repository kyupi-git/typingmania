import { test, expect } from '@jest/globals'

import {
  compareOfficialPronunciation,
  generateChinesePinyin,
  lyricLanguage,
  normalizePronunciation,
  pronunciationForLine,
  requiresSongSpecificReading,
} from './pronunciation.js'

test('detects the supported lyric language families', () => {
  expect(lyricLanguage('ZH', '你好')).toBe('zh')
  expect(lyricLanguage('JP', '明日')).toBe('ja')
  expect(lyricLanguage('', 'かな')).toBe('ja')
  expect(lyricLanguage('', 'hello')).toBe('en')
})

test('normalizes Chinese tone marks and tone numbers for physical typing', () => {
  expect(normalizePronunciation('nǐ hǎo，lǜ sè', 'ZH'))
    .toBe('nihaolvse')
  expect(normalizePronunciation('ni3 hao3 lv4 se4', 'ZH'))
    .toBe('nihaolvse')
})

test('generates compact contextual pinyin while retaining Latin text', () => {
  expect(generateChinesePinyin('音乐让Tonight闪亮'))
    .toBe('yinyuerangtonightshanliang')
  expect(pronunciationForLine({
    text: '晨光落在窗前',
    language: 'ZH',
  })).toMatchObject({
    family: 'zh',
    reading: 'chenguangluozaichuangqian',
    source: 'pinyin-pro',
  })
})

test('Japanese requires its supplied reading while English uses original text', () => {
  expect(pronunciationForLine({
    text: '朝の光',
    providedReading: 'a sa no hi ka ri',
    language: 'JP',
  }).reading).toBe('asanohikari')
  expect(pronunciationForLine({
    text: '朝の光',
    language: 'JP',
  })).toMatchObject({
    reading: '',
    source: 'missing',
  })
  expect(pronunciationForLine({
    text: '宇宙',
    providedReading: 'so ra',
    language: 'JP',
  })).toMatchObject({
    reading: 'sora',
    source: 'qqmusic-qrc-roma',
  })
  expect(requiresSongSpecificReading('JP', '宇宙')).toBe(true)
  expect(requiresSongSpecificReading('EN', 'space')).toBe(false)
  expect(pronunciationForLine({
    text: 'Follow the light',
    language: 'EN',
  }).source).toBe('original-text')
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
