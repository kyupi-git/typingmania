import { test } from '@jest/globals'

import {
  analyzeSongTitle,
  originalSongTitle,
} from './song-title.js'

test('a cross-language QQ Music alias is removed from a Japanese original title', () => {
  const result = analyzeSongTitle(
    '潮風のシンフォニー (海风交响曲)',
    { language: 'JP' },
  )

  expect(result.title).toBe('潮風のシンフォニー')
  expect(result.changed).toBe(true)
  expect(result.removedAliases).toEqual([{
    text: '海风交响曲',
    reason: 'cross-script-alias',
  }])
})

test('mixed-script translations are removed but a real version qualifier remains', () => {
  expect(originalSongTitle(
    '星のDREAM (星光梦想) (Special ver.)',
    'JP',
  )).toBe('星のDREAM (Special ver.)')
})

test('a translated Han suffix is removed when both titles share a Latin prefix', () => {
  expect(analyzeSongTitle('BAD遺伝子 (BAD基因)', {
    language: 'JP',
  })).toMatchObject({
    title: 'BAD遺伝子',
    removedAliases: [{
      text: 'BAD基因',
      reason: 'shared-prefix-translation',
    }],
  })
})

test('real title qualifiers and performance information are preserved', () => {
  const titles = [
    'サンプル曲 (朝 LIVE ver.)',
    'サンプル曲 (TV Size)',
    'Sample Song (feat. Guest)',
    'Sample Song (Part 2)',
    'Sample Song (2026)',
    'Sample Song (ABC)',
  ]

  for (const title of titles) {
    expect(originalSongTitle(title, 'JP')).toBe(title)
  }
})

test('same-script and embedded parentheticals are preserved when their purpose is uncertain', () => {
  expect(originalSongTitle('青空 (青春篇)', 'JP')).toBe('青空 (青春篇)')
  expect(originalSongTitle('序章 (Sample) Finale', 'EN'))
    .toBe('序章 (Sample) Finale')
})

test('aliases are recognized in Chinese and English titles too', () => {
  expect(originalSongTitle('示例歌曲 (Sample Song)', 'ZH')).toBe('示例歌曲')
  expect(originalSongTitle('Sample Song (示例歌曲)', 'EN')).toBe('Sample Song')
})

test('preserved full-width title punctuation is not normalized', () => {
  expect(originalSongTitle('サンプル曲（特別章）', 'JP'))
    .toBe('サンプル曲（特別章）')
})
