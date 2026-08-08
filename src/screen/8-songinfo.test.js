import { test } from '@jest/globals'

import I18n from '../i18n.js'
import SongInfoScreen from './8-songinfo.js'

test('song information uses a neutral marker instead of a language code', () => {
  const viewport = { el: document.createElement('div') }
  const i18n = new I18n({ languages: ['en'], storage: null })
  const screen = new SongInfoScreen(viewport, i18n)
  screen.updateSong({
    title: 'Example',
    latin_title: 'Example',
    subtitle: '',
    latin_subtitle: '',
    artist: 'Artist',
    language: 'JP',
    collection: { parent: null },
    duration: 120,
    cpm: 240,
    max_cpm: 360,
    assist_cpm: 120,
    assist_max_cpm: 180,
    high_score: 0,
  })

  expect(screen.song_marker.el.innerText).toBe('•')
  expect(screen.layer.el.textContent).not.toContain('JP')
  expect(screen.song_cpm.el.innerText).toBe('240 / 360')

  screen.updateGameMode('assist')
  expect(screen.song_cpm.el.innerText).toBe('120 / 180')
  expect(screen.high_score_label.el.innerText).toBe('Standard high score')
})
