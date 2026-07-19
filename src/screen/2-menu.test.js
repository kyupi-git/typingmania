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

    const actionCount = actions.length
    screen.importSourceRows[1].el.click()
    expect(actions).toHaveLength(actionCount)
    expect(screen.importSourceRows[1].el.getAttribute('aria-disabled'))
      .toBe('true')
    expect(screen.importSourceRows[1].el.style.cursor).toBe('not-allowed')
  } finally {
    window.removeEventListener('keydown', onKeyDown)
  }
})

test('main actions share consistent sizing and readable localized hints', () => {
  const screen = createMenuScreen()

  expect(screen.import_music_button.el.style.width).toBe('220px')
  expect(screen.editLibraryButton.el.style.width).toBe('220px')
  expect(screen.key_effects_hint.el.style.textShadow).toContain('rgba(8, 12, 20')
  expect(screen.demo_mode_hint.el.style.textShadow).toContain('rgba(8, 12, 20')
  expect(screen.language_hint.el.style.textShadow).toContain('rgba(8, 12, 20')
  expect(screen.parent_key.el.innerText).toBe('Esc / Backspace')
})

test('about dialog exposes the repository and linked component credits', () => {
  const screen = createMenuScreen()

  expect(screen.author_label).toBeUndefined()
  expect(screen.about_button.el.style.left).toBe('1200px')
  expect(screen.about_github_label.el.innerText)
    .toContain('https://github.com/kyupi-git/typingmania')
  expect(screen.about_version.el.innerText).toBe('Version 20260719')
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
