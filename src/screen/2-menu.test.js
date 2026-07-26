import { test } from '@jest/globals'

import I18n from '../i18n.js'
import { POINTER_APPLY_CODE } from '../game/menu-navigation.js'
import MenuScreen from './2-menu.js'

function createMenuScreen () {
  const viewport = { el: document.createElement('div') }
  const i18n = new I18n({
    languages: ['en'],
    storage: null,
  })
  return new MenuScreen(viewport, i18n)
}

test('menu screen constructs provider and sort rows without runtime errors', () => {
  const screen = createMenuScreen()
  const actions = []
  const onKeyDown = event => actions.push({
    key: event.key,
    code: event.code,
  })
  window.addEventListener('keydown', onKeyDown)

  try {
    screen.sort_option_rows[1].el.click()
    expect(actions.at(-1)).toEqual({
      key: '2',
      code: POINTER_APPLY_CODE,
    })

    screen.importSourceRows[1].el.click()
    expect(actions.at(-1)).toEqual({
      key: '2',
      code: POINTER_APPLY_CODE,
    })
    expect(screen.importSourceRows).toHaveLength(4)
    expect(screen.resetScopeRows).toHaveLength(5)
    expect(screen.importSourceRows[1].el.style.cursor).toBe('pointer')
  } finally {
    window.removeEventListener('keydown', onKeyDown)
  }
})

test('main actions include shortcuts without separate hint fields', () => {
  const screen = createMenuScreen()

  expect(screen.import_music_button.el.style.width).toBe('175px')
  expect(screen.editLibraryButton.el.style.width).toBe('175px')
  expect(screen.reset_library_button.el.style.width).toBe('175px')
  expect(screen.metadata_refresh_button.el.style.width).toBe('175px')
  expect(screen.import_music_label.el.innerText).toBe('Add music (Q)')
  expect(screen.editLibraryLabel.el.innerText).toBe('Edit songs (E)')
  expect(screen.key_effects_label.el.innerText).toBe('Keyfall: On (K)')
  expect(screen.demo_mode_label.el.innerText).toBe('Demo: Off (M)')
  expect(screen.language_label.el.innerText).toBe('Language (L)')
  expect(screen.sort_label.el.innerText).toContain('(S)')
  expect(screen.editLibraryHint).toBeUndefined()
  expect(screen.sort_hint).toBeUndefined()
  expect(screen.parent_key.el.innerText).toBe('Esc / Backspace')
})

test('about dialog exposes the repository and linked component credits', () => {
  const screen = createMenuScreen()

  expect(screen.author_label).toBeUndefined()
  expect(screen.about_button.el.style.left).toBe('1200px')
  expect(screen.about_label.el.innerText).toBe('About (A)')
  expect(screen.about_github_label.el.innerText)
    .toContain('https://github.com/kyupi-git/typingmania')
  expect(screen.about_version.el.innerText).toBe('Version 20260726')
  expect(screen.about_summary.el.innerText)
    .toBe('A lyrics-typing rhythm game built on TypingMania NEO.')
  expect(screen.about_credits_container.el.textContent).toContain('TypingMania NEO')
  expect(screen.about_credits_container.el.textContent).toContain('pinyin-pro')
  expect(screen.about_credits_container.el.textContent).toContain('Bangumi API')
  expect(screen.about_credits_container.el.querySelectorAll('a').length)
    .toBeGreaterThanOrEqual(10)
  screen.showAbout()
  expect(screen.dialogOpen).toBe(true)
  expect(screen.about_dialog.el.style.display).not.toBe('none')
  screen.hideAbout()
  expect(screen.dialogOpen).toBe(false)
  expect(screen.about_dialog.el.style.display).toBe('none')
})

test('song rows use a neutral marker instead of a language badge', () => {
  const screen = createMenuScreen()
  screen.setSongList({
    children: [{
      title: 'Example',
      latin_title: 'Example',
      artist: 'Artist',
      language: 'JP',
      media_type: 'audio',
      cpm: 240,
    }],
  })

  const text = [
    screen.song_list_item[0].el,
    ...screen.song_list_item[0].el.querySelectorAll('div'),
  ].map(element => element.innerText || '').join(' ')
  expect(text).toContain('•')
  expect(text).not.toContain('JP')
})
