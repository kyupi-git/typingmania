import { jest, test } from '@jest/globals'

import SongLoadController from './3-song-load.js'

test('an unavailable MV turns the persisted option and menu state off', () => {
  const game = {
    preferences: {
      setMusicVideoEnabled: jest.fn(),
    },
    menu_screen: {
      setMusicVideoEnabled: jest.fn(),
    },
  }
  const controller = new SongLoadController(game)

  controller.disableMusicVideoPreference()

  expect(game.preferences.setMusicVideoEnabled).toHaveBeenCalledWith(false)
  expect(game.menu_screen.setMusicVideoEnabled).toHaveBeenCalledWith(false)
})
