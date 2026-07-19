import { test } from '@jest/globals'

import I18n, {
  detectLocale,
  displayCollectionName,
  displaySongSubtitle,
  displaySongTitle,
  LOCALE_STORAGE_KEY,
  MESSAGES,
} from './i18n.js'

test('all supported locales contain the same interface message keys', () => {
  const expected = Object.keys(MESSAGES.en).sort()
  expect(Object.keys(MESSAGES.zh).sort()).toEqual(expected)
  expect(Object.keys(MESSAGES.ja).sort()).toEqual(expected)
})

test('saved language wins, otherwise browser language is detected', () => {
  const storage = {
    value: 'ja',
    getItem: key => key === LOCALE_STORAGE_KEY ? storage.value : null,
    setItem: (_, value) => { storage.value = value },
  }
  const i18n = new I18n({ languages: ['zh-CN'], storage })
  expect(i18n.locale).toBe('ja')

  storage.value = null
  expect(new I18n({ languages: ['fr-FR', 'zh-Hans'], storage }).locale).toBe('zh')
  expect(detectLocale(['fr-FR'])).toBe('en')
})

test('language switching persists and interpolates interface text', () => {
  const storage = {
    value: null,
    getItem: () => storage.value,
    setItem: (_, value) => { storage.value = value },
  }
  const i18n = new I18n({ languages: ['en-US'], storage })
  expect(i18n.t('menu.language', { language: i18n.languageName() })).toBe('Language: English')
  i18n.setLocale('zh-CN')
  expect(storage.value).toBe('zh')
  expect(i18n.t('menu.language', { language: i18n.languageName() })).toBe('界面：中文')
})

test('interface instructions use locale-specific grammar and punctuation', () => {
  const en = new I18n({ languages: ['en-US'], storage: null })
  const zh = new I18n({ languages: ['zh-CN'], storage: null })
  const ja = new I18n({ languages: ['ja-JP'], storage: null })

  expect(en.t('language.selectHint'))
    .toBe('↑/↓ to move · Enter to choose · Esc to close')
  expect(zh.t('language.selectHint'))
    .toBe('↑/↓ 移动 · Enter 确认 · Esc 返回')
  expect(ja.t('language.selectHint'))
    .toBe('↑/↓で移動 · Enterで決定 · Escで戻る')

  expect(en.t('common.labelWithHint', { label: 'Import', hint: 'Press Q' }))
    .toBe('Import. Press Q')
  expect(zh.t('common.labelWithHint', { label: '导入', hint: '按 Q' }))
    .toBe('导入。按 Q')
  expect(ja.t('common.labelWithHint', { label: '取り込む', hint: 'Qを押す' }))
    .toBe('取り込む。Qを押す')

  expect(en.t('menu.keyEffects', { state: en.t('common.enabled') }))
    .toBe('Keyfall FX: On')
  expect(zh.t('menu.keyEffects', { state: zh.t('common.disabled') }))
    .toBe('按键雨：关')
  expect(ja.t('menu.keyEffects', { state: ja.t('common.enabled') }))
    .toBe('キー演出：オン')

  expect(en.t('menu.demoMode', { state: en.t('common.enabled') }))
    .toBe('Autoplay: On')
  expect(zh.t('menu.demoMode', { state: zh.t('common.disabled') }))
    .toBe('自动演示：关')
  expect(ja.t('menu.demoMode', { state: ja.t('common.enabled') }))
    .toBe('オートプレイ：オン')
  expect(en.t('songInfo.cpmMax'))
    .toBe('Required keys/min (avg / fastest 5 sec)')
  expect(zh.t('songInfo.cpmMax'))
    .toBe('所需按键数/分（平均 / 最快5秒）')
  expect(ja.t('songInfo.cpmMax'))
    .toBe('必要キー数/分（平均 / 最速5秒）')
  expect(en.t('menu.sort', {
    field: en.t('sort.mode.cpm'),
    arrow: '↓',
  })).toBe('Sort · Required keys/min ↓')
  expect(zh.t('sort.direction.desc')).toBe('逆序')
  expect(ja.t('sort.mode.artist')).toBe('アーティスト')
  expect(zh.t('import.other')).toBe('其它方式[功能待开发]')
  expect(en.t('import.other')).toBe('Other methods  [Coming later]')
  expect(ja.t('import.other')).toContain('その他の方法')
  expect(en.t('import.qqMusicDetail')).toContain('next 20')
  expect(ja.t('import.selectTitle')).toBe('曲の追加元を選ぶ')
})

test('library reset confirmation stays compact in every language', () => {
  for (const locale of ['en', 'zh', 'ja']) {
    const i18n = new I18n({ languages: [locale], storage: null })
    const lines = i18n.t('library.reset.confirmDetail').split('\n')
    expect(lines).toHaveLength(2)
    expect(lines.every(line => line.length <= 45)).toBe(true)
    expect(i18n.t('library.reset.confirmHint').length).toBeLessThanOrEqual(40)
  }
})

test('result analysis uses consistent typing-flow and pace language', () => {
  const en = new I18n({ languages: ['en-US'], storage: null })
  const zh = new I18n({ languages: ['zh-CN'], storage: null })
  const ja = new I18n({ languages: ['ja-JP'], storage: null })

  expect(en.t('result.tensionChart')).toBe('Typing flow')
  expect(zh.t('result.tensionChart')).toBe('键入流畅度')
  expect(ja.t('result.tensionChart')).toBe('タイピング安定度')
  expect(en.t('result.tensionHelp')).toContain('0–100')
  expect(zh.t('result.tensionHelp')).toContain('0–100')
  expect(ja.t('result.tensionHelp')).toContain('0〜100')
  expect(ja.t('result.paceHelp')).toContain('5秒ごとのCPM')
  expect(zh.t('result.averagePeakValue', { average: 220, peak: 260 }))
    .toBe('平均 220 · 最快5秒 260')

  const chineseInterface = Object.values(MESSAGES.zh).join('\n')
  expect(chineseInterface).not.toMatch(/张力|实战均|5秒峰/u)
})

test('about text identifies the public project and major components', () => {
  for (const locale of ['en', 'zh', 'ja']) {
    const i18n = new I18n({ languages: [locale], storage: null })
    expect(i18n.t('about.github', {
      url: 'https://github.com/kyupi-git/typingmania',
    })).toContain('https://github.com/kyupi-git/typingmania')
    expect(i18n.t('about.summary')).toMatch(/TypingMania (?:Neo|NEO)/u)
    expect(i18n.t('about.creditsTitle')).not.toBe('about.creditsTitle')
    expect(i18n.t('about.credit.foundation')).not.toBe(
      'about.credit.foundation',
    )
    expect(i18n.t('about.credit.services')).not.toBe('about.credit.services')
  }
})

test('QQ Music startup and sign-in failures are actionable in every locale', () => {
  const codes = [
    'QQMUSIC_NOT_RUNNING',
    'QQMUSIC_NOT_LOGGED_IN',
    'QQMUSIC_SESSION_INVALID',
  ]
  for (const locale of ['en', 'zh', 'ja']) {
    const i18n = new I18n({ languages: [locale], storage: null })
    for (const code of codes) {
      const key = `qq.error.${code}`
      expect(i18n.t(key)).not.toBe(key)
      expect(i18n.t(key).length).toBeGreaterThan(10)
    }
  }
})

test('song references use locale-specific quotation marks', () => {
  const en = new I18n({ languages: ['en-US'], storage: null })
  const zh = new I18n({ languages: ['zh-CN'], storage: null })
  const ja = new I18n({ languages: ['ja-JP'], storage: null })

  expect(en.t('qq.progress.lyrics.song', { title: 'サンプル曲' }))
    .toBe('Checking the lyrics for “サンプル曲”…')
  expect(zh.t('qq.progress.lyrics.song', { title: 'サンプル曲' }))
    .toBe('正在校对《サンプル曲》的歌词……')
  expect(ja.t('qq.progress.lyrics.song', { title: 'サンプル曲' }))
    .toBe('「サンプル曲」の歌詞を照合中…')
})

test('song titles always use the stored original text', () => {
  const song = {
    title: 'サンプル曲',
    subtitle: 'original source',
  }
  expect(displaySongTitle(song, 'en')).toBe('サンプル曲')
  expect(displaySongTitle(song, 'ja')).toBe('サンプル曲')
  expect(displaySongSubtitle(song, 'en')).toBe('original source')
})

test('song origin descriptors follow the interface locale', () => {
  const song = {
    title: 'example',
    subtitle: '《出处作品名称》TV动画片尾曲',
  }
  expect(displaySongSubtitle(song, 'en'))
    .toBe('Ending theme for the TV anime “出处作品名称”')
  expect(displaySongSubtitle(song, 'ja'))
    .toBe('TVアニメ『出处作品名称』エンディングテーマ')
})

test('a verified original work title is preserved in every interface language', () => {
  const song = {
    subtitle: '《示例作品》TV动画片尾曲2',
    origin: {
      work_title: 'サンプル作品',
      medium: 'tv',
      role: 'ending',
      sequence: '2',
      episodes: [],
    },
  }
  expect(displaySongSubtitle(song, 'zh')).toBe('TV动画《サンプル作品》第2首片尾曲')
  expect(displaySongSubtitle(song, 'en'))
    .toBe('Ending theme 2 for the TV anime “サンプル作品”')
})

test('QQ Music hides an anime origin when only a translated work title is known', () => {
  const song = {
    subtitle: '《示例中文译名》TV动画片头曲',
    source: { service: 'qqmusic' },
  }
  expect(displaySongSubtitle(song, 'zh')).toBe('')
  expect(displaySongSubtitle(song, 'en')).toBe('')
  expect(displaySongSubtitle(song, 'ja')).toBe('')
})

test('QQ Music rejects a legacy unverified structured origin in the interface', () => {
  const song = {
    subtitle: '《示例中文译名》TV动画片头曲',
    origin: {
      version: 2,
      work_title: '示例中文译名',
      original_language: 'ja',
      medium: 'tv',
      role: 'opening',
    },
    source: { service: 'qqmusic' },
  }
  expect(displaySongSubtitle(song, 'zh')).toBe('')
})

test('QQ Music displays a strictly verified original work title', () => {
  const song = {
    subtitle: '《示例中文译名》TV动画片头曲',
    origin: {
      version: 3,
      work_title: 'サンプル原題',
      original_language: 'ja',
      original_verified: true,
      title_source: 'catalog-primary',
      medium: 'tv',
      role: 'opening',
    },
    source: { service: 'qqmusic' },
  }
  expect(displaySongSubtitle(song, 'zh'))
    .toBe('TV动画《サンプル原題》片头曲')
})

test('translated title aliases are hidden while collection names are localized', () => {
  const song = {
    title: 'サンプル曲 (Sample Song)',
    language: 'JP',
  }
  const collection = {
    name: 'QQ Music',
    translations: { zh: { name: 'QQ音乐' } },
  }
  expect(displaySongTitle(song, 'en')).toBe('サンプル曲')
  expect(displayCollectionName(collection, 'zh')).toBe('QQ音乐')
})

test('real parenthesized title qualifiers stay visible', () => {
  const song = {
    title: 'サンプル曲 (Special ver.)',
    language: 'JP',
  }
  expect(displaySongTitle(song, 'en')).toBe('サンプル曲 (Special ver.)')
})
