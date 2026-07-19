import { test } from '@jest/globals'

import I18n from '../i18n.js'
import SongScreen from './4-song.js'

function createSongScreen () {
  const viewport = { el: document.createElement('div') }
  const i18n = new I18n({ languages: ['zh'], storage: null })
  return new SongScreen(viewport, i18n)
}

test('progress labels reserve enough room for localized text', () => {
  const screen = createSongScreen()

  expect(screen.total_label.el.innerText).toBe('整首进度')
  expect(screen.total_label.el.style.left).toBe('100px')
  expect(screen.total_label.el.style.width).toBe('220px')
  expect(screen.ui_progress_all.el.style.left).toBe('340px')
})

test('original and pending lyrics are laid out from the left edge', () => {
  const screen = createSongScreen()

  expect(screen.ui_typing_next.el.style.textAlign).not.toBe('center')
  expect(screen.ui_typing_line.el.style.textAlign).not.toBe('center')
  expect(screen.ui_typing_next.el.style.left).toBe('60px')
  expect(screen.ui_typing_line.el.style.left).toBe('200px')
  expect(screen.ui_ruby.el.style.left).toBe('270px')
  expect(screen.ui_ruby.el.style.width).toBe('1650px')
  expect(screen.ui_ruby.el.style.overflow).toBe('hidden')

  screen.setTypingText('ABCDEFGHIJKLMNOPQRSTUVWXYZ'.repeat(3))
  expect(screen.ui_typing_line.el.style.fontSize).toBe('40px')
})

test('songs without an early lyric skip the lead-in immediately', async () => {
  const screen = createSongScreen()

  await expect(screen.playLeadIn(0)).resolves.toBeUndefined()
  expect(screen.lead_in_group.el.style.display).toBe('none')
})

test('the early-song countdown sits below the song title block', () => {
  const screen = createSongScreen()

  expect(screen.lead_in_panel.el.style.top).toBe('360px')
  expect(screen.lead_in_label.el.style.top).toBe('390px')
  expect(screen.lead_in_count.el.style.top).toBe('450px')
})

test('both familiar back keys are shown for leaving a song', () => {
  const screen = createSongScreen()
  expect(screen.abandon_key.el.innerText).toBe('Esc / 退格')
})
