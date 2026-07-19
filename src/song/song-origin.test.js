import { test } from '@jest/globals'

import {
  formatSongOrigin,
  hasVerifiedOriginalWorkTitle,
  localizeSongOrigin,
  parseSongOrigin,
} from './song-origin.js'

test('localizes a Chinese TV anime ending origin locally', () => {
  const source = '《示例作品》TV动画片尾曲2'
  expect(localizeSongOrigin(source, 'en'))
    .toBe('Ending theme 2 for the TV anime “示例作品”')
  expect(localizeSongOrigin(source, 'ja'))
    .toBe('TVアニメ『示例作品』第2エンディングテーマ')
  expect(localizeSongOrigin(source, 'zh'))
    .toBe('TV动画《示例作品》第2首片尾曲')
})

test('localizes episode qualifiers and insert songs', () => {
  expect(localizeSongOrigin('《某作品》第6、8话片尾曲', 'en'))
    .toBe('Ending theme for episodes 6 and 8 of “某作品”')
  expect(localizeSongOrigin('《某作品》TV动画第13话插曲', 'ja'))
    .toBe('TVアニメ『某作品』第13話挿入歌')
})

test('localizes film themes and Japanese origins in either direction', () => {
  expect(localizeSongOrigin('《示例电影》剧场版主题曲', 'en'))
    .toBe('Theme song for the anime film “示例电影”')
  expect(localizeSongOrigin('《サンプル作品》TVアニメエンディングテーマ', 'zh'))
    .toBe('TV动画《サンプル作品》片尾曲')
  expect(localizeSongOrigin('劇場版アニメ『サンプル映画』主題歌', 'en'))
    .toBe('Theme song for the anime film “サンプル映画”')
})

test('keeps nested title punctuation paired while parsing and formatting', () => {
  const workTitle = '「きみを愛する気はない」と言った次期公爵様'
  expect(parseSongOrigin(`《${workTitle}》TV动画片尾曲`)).toMatchObject({
    workTitle,
    media: 'tv',
    role: 'ending',
  })

  const origin = {
    version: 3,
    work_title: workTitle,
    original_verified: true,
    title_source: 'catalog-primary',
    medium: 'tv',
    role: 'ending',
  }
  expect(formatSongOrigin(origin, 'zh'))
    .toBe(`TV动画《${workTitle}》片尾曲`)
  expect(formatSongOrigin(origin, 'en'))
    .toBe(`Ending theme for the TV anime “${workTitle}”`)
  expect(formatSongOrigin(origin, 'ja'))
    .toBe(`TVアニメ『${workTitle}』エンディングテーマ`)
})

test('round-trips independently ordered English and Japanese origins', () => {
  const english = 'Ending theme 2 for the TV anime “サンプル作品”'
  expect(localizeSongOrigin(english, 'ja'))
    .toBe('TVアニメ『サンプル作品』第2エンディングテーマ')
  expect(localizeSongOrigin(english, 'zh'))
    .toBe('TV动画《サンプル作品》第2首片尾曲')

  const japanese = 'TVアニメ『別のサンプル作品』第13話挿入歌'
  expect(localizeSongOrigin(japanese, 'en'))
    .toBe('Insert song for episode 13 of the TV anime “別のサンプル作品”')
  expect(localizeSongOrigin(japanese, 'zh'))
    .toBe('TV动画《別のサンプル作品》第13话插曲')
})

test('preserves unrelated subtitles', () => {
  expect(localizeSongOrigin('Offline demo', 'ja')).toBe('Offline demo')
  expect(localizeSongOrigin('', 'en')).toBe('')
})

test('parses and formats a stored official work title independently', () => {
  expect(parseSongOrigin('《示例作品》TV动画第6、8话片尾曲2')).toMatchObject({
    workTitle: '示例作品',
    media: 'tv',
    episodes: ['6', '8'],
    role: 'ending',
    roleNumber: '2',
  })
  const origin = {
    work_title: 'サンプル作品',
    original_language: 'ja',
    medium: 'tv',
    role: 'ending',
    sequence: '2',
    episodes: [],
  }
  expect(formatSongOrigin(origin, 'zh')).toBe('TV动画《サンプル作品》第2首片尾曲')
  expect(formatSongOrigin(origin, 'en')).toBe('Ending theme 2 for the TV anime “サンプル作品”')
  expect(formatSongOrigin(origin, 'ja')).toBe('TVアニメ『サンプル作品』第2エンディングテーマ')
})

test('verified original work titles require current provenance metadata', () => {
  expect(hasVerifiedOriginalWorkTitle({
    version: 3,
    work_title: 'サンプル作品',
    original_language: 'ja',
    original_verified: true,
    title_source: 'catalog-primary',
  })).toBe(true)
  expect(hasVerifiedOriginalWorkTitle({
    version: 3,
    work_title: '示例中文译名',
    original_language: 'ja',
  })).toBe(false)
  expect(hasVerifiedOriginalWorkTitle({
    version: 3,
    work_title: '「括号不完整',
    original_verified: true,
    title_source: 'catalog-primary',
  })).toBe(false)
})
