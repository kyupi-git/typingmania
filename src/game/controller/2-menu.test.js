import { jest, test } from '@jest/globals'

import { POINTER_APPLY_CODE } from '../menu-navigation.js'
import { NETWORK_PROXY_APPLY_CODE } from '../../screen/network-status-dialog.js'
import {
  LIBRARY_EDITOR_DEDUPE_CODE,
  LIBRARY_EDITOR_REFRESH_CODE,
  LIBRARY_EDITOR_SORT_PREFIX,
} from '../../screen/library-editor-dialog.js'
import MenuController, { sortEditableSongs } from './2-menu.js'

function makeGame (actions) {
  const menuScreen = new Proxy({}, {
    get (target, property) {
      if (!target[property]) target[property] = jest.fn()
      return target[property]
    },
  })
  const loadingScreen = new Proxy({}, {
    get (target, property) {
      if (!target[property]) target[property] = jest.fn()
      return target[property]
    },
  })
  const songInfoScreen = new Proxy({}, {
    get (target, property) {
      if (!target[property]) target[property] = jest.fn()
      return target[property]
    },
  })
  return {
    preferences: {
      songSortMode: 'added',
      songSortDirection: 'asc',
      setSongSort: jest.fn(),
    },
    menu_screen: menuScreen,
    input: {
      waitForAnyKey: jest.fn(async () => actions.shift()),
    },
    i18n: {
      locale: 'en',
      t: key => key === 'sort.libraryRoot' ? 'The whole library' : key,
    },
    sfx: { play: jest.fn() },
    config: { songs_url: '/data/songs.json' },
    loading_screen: loadingScreen,
    songinfo_screen: songInfoScreen,
    songs: {
      root: { parent: null, children: [] },
      current_song: null,
      load: jest.fn(),
    },
    background_screen: {
      hideSongBackground: jest.fn(),
      showSongBackground: jest.fn(),
    },
  }
}

test('clicking a sort mode applies it immediately', async () => {
  const game = makeGame([{
    key: '2',
    code: POINTER_APPLY_CODE,
  }])
  const controller = new MenuController(game)
  controller.current_collection = { parent: null, children: [] }
  controller.resortCurrentCollection = jest.fn()

  await controller.selectSort()

  expect(controller.sort_mode).toBe('cpm')
  expect(game.preferences.setSongSort).toHaveBeenCalledWith('cpm', 'asc')
  expect(controller.resortCurrentCollection).toHaveBeenCalled()
})

test('the sort direction remains an independent toggle', async () => {
  const game = makeGame([
    { key: 'r', code: 'KeyR' },
    { key: 'Enter', code: 'Enter' },
  ])
  const controller = new MenuController(game)
  controller.current_collection = { parent: null, children: [] }
  controller.resortCurrentCollection = jest.fn()

  await controller.selectSort()

  expect(game.menu_screen.setSortDirection).toHaveBeenCalledWith('desc')
  expect(game.preferences.setSongSort).toHaveBeenCalledWith('added', 'desc')
})

test('completeness sorting prioritizes core fields then directory and title', () => {
  const completeExcept = (missing, directory, title) => ({
    id: `${directory}/${title}`,
    directory,
    title,
    completeness: {
      score: 5,
      pronunciation: missing !== 'pronunciation',
      lyrics: missing !== 'lyrics',
      identity: missing !== 'identity',
      origin: missing !== 'origin',
      album: missing !== 'album',
      poster: missing !== 'poster',
    },
  })
  const songs = [
    completeExcept('pronunciation', 'A', 'Reading missing'),
    completeExcept('poster', 'B', 'Poster missing'),
    completeExcept('album', 'A', 'Cover missing'),
    completeExcept('poster', 'A', 'Zulu'),
    completeExcept('poster', 'A', 'Alpha'),
  ]

  expect(sortEditableSongs(songs, 'completeness', 'desc').map(song => song.title))
    .toEqual([
      'Alpha',
      'Zulu',
      'Poster missing',
      'Cover missing',
      'Reading missing',
    ])
})

test('song-editor sorting returns the viewport to the first row', async () => {
  const game = makeGame([
    { key: 'ArrowDown', code: 'ArrowDown' },
    { key: `${LIBRARY_EDITOR_SORT_PREFIX}source`, code: 'LibraryEditorSort' },
    { key: 'Escape', code: 'Escape' },
  ])
  const controller = new MenuController(game)
  await controller.editLibrary({
    providedSongs: [
      { id: 'b', title: 'B', source: 'netease' },
      { id: 'a', title: 'A', source: 'qqmusic' },
    ],
    providedSession: { local: { token: 'token' }, headers: {} },
  })
  expect(game.menu_screen.setLibraryEditorCursor.mock.calls.at(-1)[0])
    .toBe(0)
})

test('duplicate review opens from inside the song editor', async () => {
  const game = makeGame([{
    key: 'Duplicates',
    code: LIBRARY_EDITOR_DEDUPE_CODE,
  }])
  const controller = new MenuController(game)
  controller.deduplicateLibrary = jest.fn(async () => {})
  const session = { local: { token: 'token' }, headers: {} }
  await controller.editLibrary({ providedSongs: [], providedSession: session })
  expect(controller.deduplicateLibrary).toHaveBeenCalledWith({
    providedSession: session,
  })
})

test('metadata refresh opens from inside song information and editing', async () => {
  const game = makeGame([{
    key: 'Refresh',
    code: LIBRARY_EDITOR_REFRESH_CODE,
  }])
  const controller = new MenuController(game)
  controller.refreshLibraryMetadata = jest.fn(async () => {})
  await controller.editLibrary({
    providedSongs: [],
    providedSession: { local: { token: 'token' }, headers: {} },
  })
  expect(game.menu_screen.hideLibraryEditor).toHaveBeenCalled()
  expect(controller.refreshLibraryMetadata).toHaveBeenCalledTimes(1)
})

test('the song information refresh shortcut works inside the editor', async () => {
  const game = makeGame([{ key: 'u', code: 'KeyU' }])
  const controller = new MenuController(game)
  controller.refreshLibraryMetadata = jest.fn(async () => {})
  await controller.editLibrary({
    providedSongs: [],
    providedSession: { local: { token: 'token' }, headers: {} },
  })
  expect(controller.refreshLibraryMetadata).toHaveBeenCalledTimes(1)
})

test('the import source menu launches each implemented provider', async () => {
  const qqGame = makeGame([{
    key: '1',
    code: POINTER_APPLY_CODE,
  }])
  const qqController = new MenuController(qqGame)
  qqController.importFromMusicProvider = jest.fn()
  await qqController.selectImportSource()
  expect(qqController.importFromMusicProvider).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'qqmusic' }),
  )

  const neteaseGame = makeGame([{ key: '2', code: POINTER_APPLY_CODE }])
  const neteaseController = new MenuController(neteaseGame)
  neteaseController.importFromMusicProvider = jest.fn()
  await neteaseController.selectImportSource()
  expect(neteaseController.importFromMusicProvider).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'netease' }),
  )
  expect(neteaseGame.background_screen.showSongBackground)
    .toHaveBeenCalledWith(
      'assets/provider-art/netease.svg',
      '',
      { preferUpperPortrait: false },
    )
})

test('the import source background follows keyboard selection and restores', async () => {
  const game = makeGame([
    { key: 'ArrowDown', code: 'ArrowDown' },
    { key: 'Escape', code: 'Escape' },
  ])
  const selected = {
    preview_image_url: '/selected-poster.jpg',
    preview_image_is_poster: true,
  }
  const controller = new MenuController(game)
  controller.current_collection = { parent: null, children: [selected] }

  await controller.selectImportSource()

  expect(game.background_screen.showSongBackground)
    .toHaveBeenNthCalledWith(
      1,
      'assets/provider-art/qqmusic.svg',
      '',
      { preferUpperPortrait: false },
    )
  expect(game.background_screen.showSongBackground)
    .toHaveBeenNthCalledWith(
      2,
      'assets/provider-art/netease.svg',
      '',
      { preferUpperPortrait: false },
    )
  expect(game.background_screen.showSongBackground).toHaveBeenLastCalledWith(
    '/selected-poster.jpg',
    '',
    { preferUpperPortrait: true },
  )
})

test('song selection previews the work poster with an upper portrait focus', () => {
  const game = makeGame([])
  const controller = new MenuController(game)

  controller.updatePreviewArtwork({
    preview_image_url: '/api/local/song-artwork?kind=poster',
    preview_album_url: '/api/local/song-artwork?kind=image',
    preview_image_is_poster: true,
  })

  expect(game.background_screen.showSongBackground).toHaveBeenCalledWith(
    '/api/local/song-artwork?kind=poster',
    '/api/local/song-artwork?kind=image',
    { preferUpperPortrait: true },
  )
})

test('Escape and Backspace share the same parent-navigation behavior', () => {
  const game = makeGame([])
  const controller = new MenuController(game)
  const selectedCollection = { parent: null, children: [] }
  const parent = { parent: null, children: [selectedCollection] }
  selectedCollection.parent = parent
  controller.current_collection = selectedCollection
  controller.current_index = 0
  controller.sortCollection = jest.fn()
  controller.updateSong = jest.fn()

  expect(controller.moveToParentCollection()).toBe(true)
  expect(controller.current_collection).toBe(parent)
  expect(controller.current_index).toBe(0)
  expect(game.sfx.play).toHaveBeenCalledWith('exit')
})

test('about dialog closes with Backspace', async () => {
  const game = makeGame([{ key: 'Backspace', code: 'Backspace' }])
  const controller = new MenuController(game)

  await controller.showAbout()

  expect(game.menu_screen.showAbout).toHaveBeenCalled()
  expect(game.menu_screen.hideAbout).toHaveBeenCalled()
  expect(game.sfx.play).toHaveBeenCalledWith('exit')
})

test('network proxy changes are applied through the authenticated local API', async () => {
  const game = makeGame([
    { key: 'Enter', code: NETWORK_PROXY_APPLY_CODE },
    { key: 'Escape', code: 'Escape' },
  ])
  game.menu_screen.getNetworkProxySettings.mockReturnValue({
    mode: 'manual',
    manualProxy: 'http://127.0.0.1:7890',
  })
  const responses = [
    { ok: true, json: async () => ({ token: 'test-token' }) },
    {
      ok: true,
      json: async () => ({ proxyMode: 'system', sources: [] }),
    },
    {
      ok: true,
      json: async () => ({ proxyMode: 'manual', sources: [] }),
    },
  ]
  const originalFetch = globalThis.fetch
  globalThis.fetch = jest.fn(async () => responses.shift())
  try {
    const controller = new MenuController(game)
    await controller.showNetworkStatus()
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/network/proxy',
      expect.objectContaining({
        method: 'PUT',
        headers: expect.objectContaining({ 'X-TMN-Token': 'test-token' }),
        body: JSON.stringify({
          mode: 'manual',
          manualProxy: 'http://127.0.0.1:7890',
        }),
      }),
    )
    expect(game.menu_screen.setNetworkStatus)
      .toHaveBeenCalledWith(expect.objectContaining({ proxyMode: 'manual' }))
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Escape cancels metadata refresh even while the local session is opening', async () => {
  const game = makeGame([])
  let resolveSession
  const session = new Promise(resolve => {
    resolveSession = resolve
  })
  const controller = new MenuController(game)
  controller.localLibrarySession = jest.fn(() => session)
  const originalFetch = globalThis.fetch
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => [],
  }))
  try {
    const refresh = controller.refreshLibraryMetadata()
    await Promise.resolve()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    resolveSession({
      local: { token: 'test-token' },
      headers: {
        'Content-Type': 'application/json',
        'X-TMN-Token': 'test-token',
      },
    })
    await refresh

    expect(globalThis.fetch).not.toHaveBeenCalledWith(
      '/api/library/metadata-refresh',
      expect.anything(),
    )
    expect(game.input.waitForAnyKey).not.toHaveBeenCalled()
    expect(game.loading_screen.setMainText)
      .toHaveBeenCalledWith('metadata.refresh.cancelled')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('library editor deletes only the selected song and refreshes the index', async () => {
  const game = makeGame([
    { key: ' ', code: 'Space' },
    { key: 'Delete', code: 'Delete' },
    { key: 'Enter', code: 'Enter' },
    { key: 'Enter', code: 'Enter' },
  ])
  const selectedSong = {
    url: 'data/qqmusic/selected.typingmania',
    clearHighScore: jest.fn(),
  }
  const keptSong = {
    url: 'data/qqmusic/kept.typingmania',
    clearHighScore: jest.fn(),
  }
  game.songs.root.children = [selectedSong, keptSong]
  const responses = [
    { ok: true, json: async () => ({ token: 'test-token' }) },
    {
      ok: true,
      json: async () => ({
        songs: [
          {
            id: selectedSong.url,
            title: 'Selected',
            artist: 'Artist',
          },
          {
            id: keptSong.url,
            title: 'Kept',
            artist: 'Artist',
          },
        ],
      }),
    },
    {
      ok: true,
      status: 200,
      json: async () => ({ deleted: 1 }),
    },
    {
      ok: true,
      json: async () => [],
    },
  ]
  const originalFetch = globalThis.fetch
  globalThis.fetch = jest.fn(async () => responses.shift())
  try {
    const controller = new MenuController(game)
    await controller.editLibrary()
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/library/delete',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          confirm: 'DELETE_SELECTED_SONGS',
          songIds: [selectedSong.url],
        }),
      }),
    )
    expect(selectedSong.clearHighScore).toHaveBeenCalled()
    expect(keptSong.clearHighScore).not.toHaveBeenCalled()
    expect(game.songs.load).toHaveBeenCalledWith([])
  } finally {
    globalThis.fetch = originalFetch
  }
})
