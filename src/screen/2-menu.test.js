import { test } from '@jest/globals'

import I18n from '../i18n.js'
import { POINTER_APPLY_CODE } from '../game/menu-navigation.js'
import { NETWORK_PROXY_APPLY_CODE } from './network-status-dialog.js'
import {
  LIBRARY_EDITOR_DEDUPE_CODE,
  LIBRARY_EDITOR_REFRESH_CODE,
} from './library-editor-dialog.js'
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

  expect(screen.import_music_button.el.style.width).toBe('145px')
  expect(screen.editLibraryButton.el.style.width).toBe('185px')
  expect(screen.reset_library_button.el.style.width).toBe('155px')
  expect(screen.metadata_refresh_button).toBeUndefined()
  expect(screen.play_style_button.el.style.width).toBe('270px')
  expect(screen.import_music_label.el.innerText).toBe('Add music (Q)')
  expect(screen.editLibraryLabel.el.innerText).toBe('Song info & edit (E)')
  expect(screen.key_effects_label.el.innerText).toBe('Keyfall: On (K)')
  expect(screen.play_style_label.el.innerText).toBe('Game mode (M): Standard')
  expect(screen.language_label.el.innerText).toBe('Language (L)')
  expect(screen.sort_label.el.innerText).toContain('(S)')
  expect(screen.editLibraryHint).toBeUndefined()
  expect(screen.sort_hint).toBeUndefined()
  expect(screen.parent_key.el.innerText).toBe('Esc / Backspace')
  expect(screen.dedupe_button).toBeUndefined()
})

test('duplicate review is available inside the song editor', () => {
  const screen = createMenuScreen()
  let action = null
  const onKeyDown = event => { action = { key: event.key, code: event.code } }
  window.addEventListener('keydown', onKeyDown)
  try {
    screen.showLibraryEditor([])
    screen.libraryEditorDialog.dedupeButton.el.click()
    expect(action).toEqual({
      key: 'Duplicates',
      code: LIBRARY_EDITOR_DEDUPE_CODE,
    })
  } finally {
    window.removeEventListener('keydown', onKeyDown)
  }
})

test('metadata refresh is available inside song information and editing', () => {
  const screen = createMenuScreen()
  let action = null
  const onKeyDown = event => { action = { key: event.key, code: event.code } }
  window.addEventListener('keydown', onKeyDown)
  try {
    screen.showLibraryEditor([])
    screen.libraryEditorDialog.refreshButton.el.click()
    expect(action).toEqual({
      key: 'Refresh',
      code: LIBRARY_EDITOR_REFRESH_CODE,
    })
  } finally {
    window.removeEventListener('keydown', onKeyDown)
  }
})

test('about dialog exposes the repository and linked component credits', () => {
  const screen = createMenuScreen()

  expect(screen.author_label).toBeUndefined()
  expect(screen.about_button.el.style.left).toBe('1200px')
  expect(screen.about_label.el.innerText).toBe('About (A)')
  expect(screen.about_github_label.el.innerText)
    .toContain('https://github.com/kyupi-git/typingmania')
  expect(screen.about_version.el.innerText).toBe('Version 20260808')
  expect(screen.about_summary.el.innerText)
    .toBe('A lyrics-typing rhythm game built on TypingMania NEO.')
  expect(screen.about_credits_container.el.textContent).toContain('TypingMania NEO')
  expect(screen.about_credits_container.el.textContent).toContain('pinyin-pro')
  expect(screen.about_credits_container.el.textContent).toContain('Bangumi API')
  expect(screen.about_credits_container.el.textContent).toContain('Undici')
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

test('pending pronunciation uses a pending asterisk and an accessible explanation', () => {
  const screen = createMenuScreen()
  screen.setSongList({
    children: [{
      title: 'Pending',
      artist: 'Artist',
      source: { quality: { pronunciation_status: 'pending' } },
      media_type: 'audio',
    }],
  })

  const text = [
    screen.song_list_item[0].el,
    ...screen.song_list_item[0].el.querySelectorAll('div'),
  ].map(element => element.innerText || '').join(' ')
  expect(text).toContain('*')
  expect(text).not.toContain('\u2605')
  expect(text).not.toContain('JP')
  expect(screen.song_list_item[0].el.getAttribute('aria-label'))
    .toContain('Pronunciation pending verification')
  const pendingMarker = [...screen.song_list_item[0].el.querySelectorAll('div')]
    .find(element => element.innerText === '*')
  expect(pendingMarker.style.color).toBe('white')
})

test('pending artist identity shares the marker and names every pending status', () => {
  const screen = createMenuScreen()
  screen.setSongList({
    children: [{
      title: 'Pending artist',
      artist: 'Artist',
      source: {
        quality: { pronunciation_status: 'pending' },
        artist_resolution: { status: 'pending' },
      },
      media_type: 'audio',
    }],
  })

  const row = screen.song_list_item[0].el
  expect([...row.querySelectorAll('div')].some(element => element.innerText === '*'))
    .toBe(true)
  expect(row.getAttribute('aria-label'))
    .toContain('Pronunciation pending verification')
  expect(row.getAttribute('aria-label'))
    .toContain('Artist identity pending')
})

test('network diagnostics exposes system, direct, and manual proxy controls', () => {
  const screen = createMenuScreen()
  const dialog = screen.networkStatusDialog
  const actions = []
  const listener = event => actions.push({ key: event.key, code: event.code })
  window.addEventListener('keydown', listener)
  try {
    dialog.show({
      mode: 'auto',
      selectedRegion: 'auto',
      effectiveRegion: 'cn',
      regions: ['auto', 'cn'],
      proxyMode: 'system',
      manualProxy: '',
      sources: [],
      logs: [],
    })
    expect([...dialog.proxyModeSelect.options].map(option => option.value))
      .toEqual(['system', 'direct', 'manual'])
    expect(dialog.proxyModeSelect.value).toBe('system')
    expect(dialog.proxyAddressInput.disabled).toBe(true)

    dialog.proxyModeSelect.value = 'manual'
    dialog.proxyModeSelect.dispatchEvent(new Event('change'))
    dialog.proxyAddressInput.value = 'http://127.0.0.1:7890'
    expect(dialog.proxyAddressInput.disabled).toBe(false)
    expect(dialog.proxySettings()).toEqual({
      mode: 'manual',
      manualProxy: 'http://127.0.0.1:7890',
    })
    dialog.proxyApplyButton.el.click()
    expect(actions.at(-1)).toEqual({
      key: 'Enter',
      code: NETWORK_PROXY_APPLY_CODE,
    })
  } finally {
    window.removeEventListener('keydown', listener)
  }
})

test('song editor shows completeness fields in gameplay-critical order', () => {
  const screen = createMenuScreen()
  const editor = screen.libraryEditorDialog
  expect(editor.title.el.innerText).toBe('Song info & editing')
  expect(editor.refreshLabel.el.innerText).toBe('Refresh song info (U)')
  expect(editor.incompleteLabel.el.innerText)
    .toBe('Delete every incomplete song (use caution)')
  expect(editor.headerLabels.slice(3).map(label => label.el.innerText))
    .toEqual(['Reading', 'Lyrics', 'Info', 'Work', 'Cover', 'Poster'])
  expect(editor.legend.el.innerText)
    .toBe('* Pronunciation not verified · * Artist identity pending')
  expect(editor.confirmHint).toBeUndefined()
})

test('song editor marks pending artist identity as incomplete', () => {
  const screen = createMenuScreen()
  const editor = screen.libraryEditorDialog
  editor.show([{
    id: 'pending-artist',
    title: 'Pending artist song',
    artist: 'Artist',
    source: { artist_resolution: { status: 'pending' } },
    completeness: {
      artistStatus: 'pending',
      identity: true,
      pronunciation: true,
      lyrics: true,
      origin: true,
      album: true,
      poster: true,
      score: 6,
      total: 6,
      complete: true,
    },
  }])

  expect(editor.rowStatuses[0][2].el.innerText).toBe('*')
  expect(editor.rowStatuses[0][2].el.style.color).toBe('white')
  expect(editor.rows[0].el.getAttribute('aria-label'))
    .toContain('Info: Pending')
})

test('song editor uses the asterisk glyph while retaining pending accessibility text', () => {
  const screen = createMenuScreen()
  const editor = screen.libraryEditorDialog
  editor.show([{
    id: 'pending',
    title: 'Pending song',
    artist: 'Artist',
    source: 'local-files',
    completeness: {
      pronunciationStatus: 'pending',
      pronunciation: false,
      score: 0,
      total: 6,
      complete: false,
    },
  }])

  expect(editor.rowStatuses[0][0].el.innerText).toBe('*')
  expect(editor.rowStatuses[0][0].el.style.color).toBe('white')
  expect(editor.rows[0].el.getAttribute('aria-label'))
    .toContain('Reading: Pending')
  expect(editor.legend.el.innerText)
    .toBe('* Pronunciation not verified · * Artist identity pending')
  expect(editor.legend.el.style.top).toBe('850px')
})
