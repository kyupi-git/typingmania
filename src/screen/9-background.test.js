import { test } from '@jest/globals'

import I18n from '../i18n.js'
import { Txt } from '../graphics/elements.js'
import BackgroundScreen from './9-background.js'
import { White } from './0-common.js'

function createBackgroundScreen () {
  const viewport = { el: document.createElement('div') }
  const i18n = new I18n({ languages: ['en'], storage: null })
  return new BackgroundScreen(viewport, i18n)
}

test('album artwork moves to a larger upper-left menu layout', () => {
  const screen = createBackgroundScreen()

  screen.showMenuUI(true)
  expect(screen.song_album_frame.el.style.left).toBe('35px')
  expect(screen.song_album_frame.el.style.top).toBe('65px')
  expect(screen.song_album_frame.el.style.width).toBe('304px')
  expect(screen.song_album_cover.el.style.width).toBe('286px')

  screen.showMenuUI(false)
  expect(screen.song_album_frame.el.style.left).toBe('1540px')
  expect(screen.song_album_frame.el.style.width).toBe('320px')
  expect(screen.song_album_cover.el.style.width).toBe('302px')
})

test('white interface text receives a dark readability edge', () => {
  const text = Txt(0, 0, 200, 40).color(White)

  expect(text.el.style.textShadow).toContain('rgba(18, 24, 32')
  expect(text.el.style.webkitTextStroke).toContain('rgba(52, 58, 66')
})
