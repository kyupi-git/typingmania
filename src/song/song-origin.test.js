import { test } from '@jest/globals'

import {
  formatSongOrigin,
  hasVerifiedOriginalWorkTitle,
  localizeSongOrigin,
  parseSongOrigin,
  SONG_ORIGIN_VERSION,
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

test('a generic animation character-song label still identifies anime media', () => {
  expect(parseSongOrigin('《草莓棉花糖》动画角色曲')).toMatchObject({
    workTitle: '草莓棉花糖',
    media: 'tv',
    role: 'character',
  })
})

test('localizes film themes and Japanese origins in either direction', () => {
  expect(localizeSongOrigin('《示例电影》剧场版主题曲', 'en'))
    .toBe('Theme song for the anime film “示例电影”')
  expect(localizeSongOrigin('《サンプル作品》TVアニメエンディングテーマ', 'zh'))
    .toBe('TV动画《サンプル作品》片尾曲')
  expect(localizeSongOrigin('劇場版アニメ『サンプル映画』主題歌', 'en'))
    .toBe('Theme song for the anime film “サンプル映画”')
})

test('recognizes Chinese and Japanese anime-film wording before generic animation', () => {
  expect(parseSongOrigin('《示例电影》动画电影主题曲')).toMatchObject({ media: 'film' })
  expect(parseSongOrigin('《示例电影》动漫电影片尾曲')).toMatchObject({ media: 'film' })
  expect(parseSongOrigin('『サンプル映画』アニメ映画主題歌')).toMatchObject({ media: 'film' })
})

test('distinguishes live-action television and film credits from animation', () => {
  expect(parseSongOrigin('电视剧《示例剧集》片头曲')).toMatchObject({
    workTitle: '示例剧集',
    media: 'television',
    role: 'opening',
  })
  expect(localizeSongOrigin('电视剧《示例剧集》片头曲', 'en'))
    .toBe('Opening theme for the TV series “示例剧集”')
  expect(localizeSongOrigin('电影《示例影片》主题曲', 'ja'))
    .toBe('映画『示例影片』主題歌')
})

test('localizes visual-novel, JRPG, and game credits as their direct media', () => {
  expect(localizeSongOrigin('视觉小说《サンプルノベル》主题曲', 'ja'))
    .toBe('ビジュアルノベル『サンプルノベル』主題歌')
  expect(localizeSongOrigin('JRPG《サンプルクエスト》主题曲', 'en'))
    .toBe('Theme song for the JRPG “サンプルクエスト”')
  expect(localizeSongOrigin('游戏《サンプルゲーム》片尾曲', 'zh'))
    .toBe('游戏《サンプルゲーム》片尾曲')
})

test('localizes documentary, commercial, variety, and sports productions', () => {
  expect(localizeSongOrigin(
    '纪录片《Planet Earth》片尾曲',
    'en',
  )).toBe('Ending theme for the documentary “Planet Earth”')
  expect(localizeSongOrigin(
    'CM『未来キャンペーン』テーマソング',
    'zh',
  )).toBe('广告片《未来キャンペーン》主题曲')
  expect(localizeSongOrigin(
    '综艺节目《青春舞台》主题曲',
    'ja',
  )).toBe('バラエティ番組『青春舞台』主題歌')
  expect(localizeSongOrigin(
    '体育赛事《World Cup 2026》主题曲',
    'en',
  )).toBe('Theme song for the sports event “World Cup 2026”')
})

test('keeps nested title punctuation paired while parsing and formatting', () => {
  const workTitle = '「きみを愛する気はない」と言った次期公爵様'
  expect(parseSongOrigin(`《${workTitle}》TV动画片尾曲`)).toMatchObject({
    workTitle,
    media: 'tv',
    role: 'ending',
  })

  const origin = {
    version: SONG_ORIGIN_VERSION,
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
    version: SONG_ORIGIN_VERSION,
    work_title: 'サンプル作品',
    original_language: 'ja',
    original_verified: true,
    title_source: 'catalog-primary',
  })).toBe(true)
  expect(hasVerifiedOriginalWorkTitle({
    version: SONG_ORIGIN_VERSION,
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
