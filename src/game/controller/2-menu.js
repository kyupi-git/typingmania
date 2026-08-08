import SongCollection from '../../song/songcollection.js'
import Song from '../../song/song.js'
import {
  displayCollectionName,
  SUPPORTED_LOCALES,
} from '../../i18n.js'
import {
  captureAddedOrder,
  SONG_SORT_MODES,
  sortCollectionChildren,
} from '../../song/song-sort.js'
import {
  isPointerApply,
  moveSelection,
} from '../menu-navigation.js'
import {
  LIBRARY_EDITOR_CONFIRM_CODE,
  LIBRARY_EDITOR_DEDUPE_CODE,
  LIBRARY_EDITOR_INCOMPLETE_CODE,
  LIBRARY_EDITOR_REFRESH_CODE,
  LIBRARY_EDITOR_SORT_PREFIX,
  LIBRARY_EDITOR_TOGGLE_CODE,
} from '../../screen/library-editor-dialog.js'
import {
  NETWORK_CHECK_CODE,
  NETWORK_LOGS_CODE,
  NETWORK_PROXY_APPLY_CODE,
  NETWORK_REGION_PREFIX,
} from '../../screen/network-status-dialog.js'
import {
  PLAY_STYLES,
  PLAY_STYLE_PREFIX,
} from '../../screen/play-style-dialog.js'
import { isStarterSong } from '../../song/starter-song.js'

const IMPORT_PROVIDERS = Object.freeze([
  {
    id: 'qqmusic',
    labelKey: 'import.qqMusic',
    artwork: 'assets/provider-art/qqmusic.svg',
  },
  {
    id: 'netease',
    labelKey: 'import.netease',
    artwork: 'assets/provider-art/netease.svg',
  },
  {
    id: 'apple-music',
    labelKey: 'import.appleMusic',
    artwork: 'assets/provider-art/apple-music.svg',
    asksForUrls: true,
  },
  {
    id: 'local-files',
    labelKey: 'import.localFolder',
    artwork: 'assets/provider-art/local-files.svg',
    selectsFolder: true,
  },
])

const RESET_SCOPES = Object.freeze([
  { id: 'all', labelKey: 'library.reset.scope.all' },
  { id: 'qqmusic', labelKey: 'library.reset.scope.qqMusic' },
  { id: 'netease', labelKey: 'library.reset.scope.netease' },
  { id: 'apple-music', labelKey: 'library.reset.scope.appleMusic' },
  { id: 'local-files', labelKey: 'library.reset.scope.localFolder' },
])

const LOCAL_IMPORT_EXTENSIONS = new Set([
  '.aac', '.flac', '.jpeg', '.jpg', '.lrc', '.m4a', '.mp3', '.mp4',
  '.ogg', '.png', '.txt', '.wav', '.webp',
])

const LOCAL_AUDIO_EXTENSIONS = new Set([
  '.aac', '.flac', '.m4a', '.mp3', '.mp4', '.ogg', '.wav',
])

function fileExtension (value) {
  const match = String(value || '').toLocaleLowerCase().match(/\.[^.\\/]+$/u)
  return match?.[0] || ''
}

export function sortEditableSongs (songs, mode = 'title', direction = 'asc') {
  const factor = direction === 'desc' ? -1 : 1
  const text = value => String(value || '').normalize('NFKC')
  const completenessFields = [
    'pronunciation', 'lyrics', 'identity', 'origin', 'album', 'poster',
  ]
  const completenessScore = song => completenessFields.reduce(
    (score, field) => score + Number(Boolean(song.completeness?.[field])),
    0,
  )
  const values = [...(songs || [])]
  values.sort((left, right) => {
    let compared = 0
    if (mode === 'source') {
      compared = text(left.source).localeCompare(text(right.source)) ||
        text(left.directory).localeCompare(text(right.directory))
    } else if (mode === 'completeness') {
      compared = completenessScore(left) - completenessScore(right)
      for (const field of completenessFields) {
        if (compared) break
        compared = Number(Boolean(left.completeness?.[field])) -
          Number(Boolean(right.completeness?.[field]))
      }
      if (compared) return compared * factor
      return text(left.directory).localeCompare(text(right.directory)) ||
        text(left.title).localeCompare(text(right.title)) ||
        text(left.id).localeCompare(text(right.id))
    } else {
      compared = text(left.title).localeCompare(text(right.title))
    }
    return compared * factor ||
      text(left.title).localeCompare(text(right.title)) ||
      text(left.id).localeCompare(text(right.id))
  })
  return values
}

export default class MenuController {
  constructor (game) {
    this.game = game

    this.current_collection = null
    this.current_index = 0
    this.local_collection = null
    this.loaded_from_url = false
    this.sort_mode = game.preferences.songSortMode
    this.sort_direction = game.preferences.songSortDirection
    this.added_order = new WeakMap()

    // Listen for drop event
    window.addEventListener('drop', this.processDroppedFile.bind(this))
    window.addEventListener('dragover', this.processDragOver.bind(this))
    this.game.menu_screen.setSongSelectHandler(
      index => this.selectSongAt(index),
    )
    this.game.menu_screen.setSongScrollHandler(
      step => this.moveCurrentSelection(step),
    )
    this.playStyleInitialized = false
  }

  updateSong (update_all = false) {
    // Update menu screen
    if (update_all) {
      this.game.menu_screen.setSongList(this.current_collection)
    }
    this.game.menu_screen.setSongListPosition(this.current_index)

    // Also update song info
    const selected = this.current_collection.children[this.current_index]
    this.game.songinfo_screen.updateSong(selected)
    this.updatePreviewArtwork(selected)
  }

  updatePreviewArtwork (selection) {
    if (!selection) {
      this.game.background_screen.hideSongBackground()
      return
    }

    const backgroundUrl = selection.poster_url ||
      selection.preview_image_url ||
      selection.image_url
    const usesPoster = Boolean(
      selection.poster_url ||
      selection.preview_image_is_poster,
    )
    const albumUrl = usesPoster && !(selection instanceof SongCollection)
      ? (selection.image_url || selection.preview_album_url || '')
      : ''
    if (!backgroundUrl) {
      this.game.background_screen.hideSongBackground()
      return
    }
    this.game.background_screen.showSongBackground(
      backgroundUrl,
      albumUrl,
      { preferUpperPortrait: usesPoster },
    )
  }

  updateImportProviderArtwork (index) {
    const provider = IMPORT_PROVIDERS[Math.max(
      0,
      Math.min(IMPORT_PROVIDERS.length - 1, Number(index) || 0),
    )]
    this.game.background_screen.showSongBackground(
      provider.artwork,
      '',
      { preferUpperPortrait: false },
    )
  }

  restoreSelectedArtwork () {
    if (!this.current_collection?.children?.length) {
      this.game.background_screen.hideSongBackground()
      return
    }
    this.updatePreviewArtwork(
      this.current_collection.children[this.current_index],
    )
  }

  captureLibraryOrder () {
    this.added_order = captureAddedOrder(
      this.game.songs.root,
      new WeakMap(),
    )
  }

  sortCollection (collection) {
    captureAddedOrder(collection, this.added_order)
    sortCollectionChildren(collection, {
      mode: this.sort_mode,
      direction: this.sort_direction,
      locale: this.game.i18n.locale,
      addedOrder: this.added_order,
    })
  }

  resortCurrentCollection ({ preserveSelection = true } = {}) {
    if (!this.current_collection) return
    const selected = preserveSelection
      ? this.current_collection.children[this.current_index]
      : null
    this.sortCollection(this.current_collection)
    if (selected) {
      const nextIndex = this.current_collection.children.indexOf(selected)
      this.current_index = nextIndex < 0 ? 0 : nextIndex
    } else {
      this.current_index = 0
    }
    this.game.menu_screen.setSortState(
      this.sort_mode,
      this.sort_direction,
    )
    this.updateSong(true)
  }

  currentCollectionName () {
    return this.current_collection?.parent === null
      ? this.game.i18n.t('sort.libraryRoot')
      : displayCollectionName(
          this.current_collection,
          this.game.i18n.locale,
        )
  }

  selectSongAt (index) {
    if (!this.signal_drop || !this.current_collection?.children?.length) return
    this.current_index = Math.max(
      0,
      Math.min(this.current_collection.children.length - 1, Number(index) || 0),
    )
    this.updateSong(false)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
  }

  moveCurrentSelection (step) {
    if (!this.signal_drop || !this.current_collection?.children?.length) return
    const result = moveSelection(
      this.current_index,
      this.current_collection.children.length,
      step,
    )
    this.current_index = result.index
    if (result.moved) {
      this.updateSong(false)
      this.game.sfx.play('select')
    } else {
      this.game.sfx.play('error')
    }
  }

  moveToParentCollection () {
    if (this.current_collection?.parent === null) {
      this.game.sfx.play('error')
      return false
    }
    if (!this.current_collection?.parent) return false

    const present = this.current_collection
    this.current_collection = this.current_collection.parent
    this.sortCollection(this.current_collection)
    const parentIndex = this.current_collection.children.indexOf(present)
    this.current_index = parentIndex < 0 ? 0 : parentIndex
    this.updateSong(true)
    this.game.sfx.play('exit')
    return true
  }

  setGameMode (mode) {
    this.game.game_mode = mode
    this.game.menu_screen.updateGameMode(mode)
    this.game.loading_screen.updateGameMode(mode)
    this.game.song_screen.updateGameMode(mode)
    this.game.result_screen.updateGameMode(mode)
    this.game.songinfo_screen.updateGameMode(mode)
  }

  setPlayStyle (style, { playSound = true } = {}) {
    const selected = PLAY_STYLES.includes(style) ? style : 'normal'
    this.game.preferences.setPlayStyle?.(selected)
    this.setGameMode(selected === 'demo'
      ? 'auto'
      : selected === 'simple'
        ? 'assist'
        : 'normal')
    if (playSound) this.game.sfx.play('select2')
  }

  async selectPlayStyle () {
    let selected = Math.max(
      0,
      PLAY_STYLES.indexOf(this.game.preferences.playStyle),
    )
    this.game.menu_screen.showPlayStyleMenu(PLAY_STYLES[selected])
    while (true) {
      const action = await this.game.input.waitForAnyKey()
      if (action.key === 'Escape' || action.key === 'Backspace') break
      if (action.key === 'ArrowUp' || action.key === 'ArrowDown') {
        selected = moveSelection(
          selected,
          PLAY_STYLES.length,
          action.key === 'ArrowUp' ? -1 : 1,
        ).index
        this.game.menu_screen.setPlayStyleSelection(selected)
        this.game.sfx.play('select')
        continue
      }
      let style = ''
      if (String(action.key).startsWith(PLAY_STYLE_PREFIX)) {
        style = action.key.slice(PLAY_STYLE_PREFIX.length)
      } else if (action.key === 'Enter' || action.key === ' ') {
        style = PLAY_STYLES[selected]
      }
      if (PLAY_STYLES.includes(style)) {
        this.setPlayStyle(style)
        break
      }
    }
    this.game.menu_screen.hidePlayStyleMenu()
  }

  cycleGameMode () {
    const modes = ['normal', 'easy', 'tempo', 'blind', 'blank']
    const current = modes.indexOf(this.game.game_mode)
    const next = modes[(current + 1) % modes.length]
    this.game.preferences.setPlayStyle('normal')
    this.setGameMode(next)
  }

  processDragOver (e) {
    e.preventDefault()
  }

  processDroppedFile (e) {
    // Prevent default behavior (Prevent file from being opened)
    e.preventDefault()
    let files = []

    if (!this.signal_drop) {
      // Not accepting drop right now
      return
    }

    if (e.dataTransfer.items) {
      // Use DataTransferItemList interface to access the file(s)
      for (const item of e.dataTransfer.items) {
        if (item.kind === 'file') {
          files.push(item.getAsFile())
        }
      }
    } else {
      // Use DataTransfer interface to access the file(s)
      files = e.dataTransfer.files
    }

    let results = []
    for (const file of files) {
      if (file.name.match(/\.typingmania$/)) {
        results.push([file.name, URL.createObjectURL(file)])
      } else {
        console.error('Cannot load', file.name, ', invalid file.')
      }
    }

    if (results.length > 0)
      this.signal_drop(results)
  }

  async importSong (filename, url) {
    // Create local collection if not
    if (!this.local_collection) {
      this.local_collection = new SongCollection({
        name: 'Imported songs',
        description: 'Songs imported from local files.',
        translations: {
          zh: {
            name: '导入的歌曲',
            description: '从本地文件导入的歌曲。',
          },
          en: {
            name: 'Imported songs',
            description: 'Songs imported from local files.',
          },
          ja: {
            name: 'インポートした曲',
            description: 'ローカルファイルから取り込んだ曲です。',
          },
        },
        contents: [],
      }, this.game.songs.root)
      this.game.songs.root.children.unshift(this.local_collection)
      captureAddedOrder(this.game.songs.root, this.added_order)
    }

    const song = await Song.fromURL(url, this.local_collection)

    // Since the high score is keyed via URL, change the URL so that it keyed correctly
    // if the source URL is blob url (i.e. drag-drop file)
    if (filename) {
      song.url = 'import://file/' + filename
      song.loadHighScore() // reload high score
    }

    this.local_collection.children.push(song)
    captureAddedOrder(this.local_collection, this.added_order)
    return song
  }

  localizedImportProgress (job, providerLabel = '') {
    const values = {
      number: job.inspected || 1,
      title: job.songTitle || '',
    }
    const keys = {
      session: 'music.progress.session',
      cache: 'music.progress.cache',
      download: 'music.progress.download',
      metadata: 'music.progress.metadata',
      duplicate: 'music.progress.existing',
      origin: 'music.progress.origin',
      lyrics: 'music.progress.lyrics',
      cover: 'music.progress.cover',
      audio: 'music.progress.audio',
      pack: 'music.progress.pack',
      skipping: 'music.progress.skipping',
      index: 'music.progress.index',
    }
    const key = keys[job.phase] || 'music.progress.default'
    const supportsSongTitle = new Set([
      'duplicate',
      'origin',
      'lyrics',
      'cover',
      'audio',
      'pack',
      'skipping',
    ])
    return this.game.i18n.t(
      job.songTitle && supportsSongTitle.has(job.phase)
        ? `${key}.song`
        : key,
      { ...values, provider: providerLabel },
    )
  }

  localizedImportError (error) {
    const keys = error?.code
      ? [`music.error.${error.code}`, `qq.error.${error.code}`]
      : []
    for (const key of keys) {
      const translated = this.game.i18n.t(key)
      if (translated && translated !== key) return translated
    }
    return error?.message || this.game.i18n.t('music.importError')
  }

  async applyLanguage (locale) {
    if (!this.game.i18n.setLocale(locale)) return
    this.game.sfx.play('select2')
  }

  toggleKeyEffects () {
    const enabled = this.game.preferences.toggleKeyEffects()
    this.game.menu_screen.setKeyEffectsEnabled(enabled)
    this.game.song_screen.setKeyEffectsEnabled(enabled)
    this.game.sfx.play('select2')
    return enabled
  }

  toggleMusicVideo () {
    const enabled = this.game.preferences.toggleMusicVideo()
    this.game.menu_screen.setMusicVideoEnabled(enabled)
    this.game.sfx.play('select2')
    return enabled
  }

  async selectLanguage () {
    let selection = Math.max(
      0,
      SUPPORTED_LOCALES.indexOf(this.game.i18n.locale),
    )
    this.game.menu_screen.showLanguageMenu(this.game.i18n.locale)

    while (true) {
      const action = await this.game.input.waitForAnyKey()
      if (action.key === 'ArrowUp') {
        selection = Math.max(0, selection - 1)
        this.game.menu_screen.setLanguageSelection(selection)
        this.game.sfx.play('select')
      } else if (action.key === 'ArrowDown') {
        selection = Math.min(SUPPORTED_LOCALES.length - 1, selection + 1)
        this.game.menu_screen.setLanguageSelection(selection)
        this.game.sfx.play('select')
      } else if (/^[1-3]$/.test(action.key)) {
        selection = Number(action.key) - 1
        this.game.menu_screen.setLanguageSelection(selection)
        break
      } else if (action.key === 'Enter' || action.key === ' ' || action.key === 'Space') {
        break
      } else if (
        action.key === 'Escape' ||
        action.key === 'Backspace' ||
        action.key.toLocaleLowerCase() === 'l'
      ) {
        this.game.menu_screen.hideLanguageMenu()
        this.game.sfx.play('exit')
        return
      }
    }

    this.game.menu_screen.hideLanguageMenu()
    await this.applyLanguage(SUPPORTED_LOCALES[selection])
  }

  async selectSort () {
    let modeIndex = Math.max(0, SONG_SORT_MODES.indexOf(this.sort_mode))
    let direction = this.sort_direction
    this.game.menu_screen.showSortMenu(
      modeIndex,
      direction,
      this.currentCollectionName(),
    )

    while (true) {
      const action = await this.game.input.waitForAnyKey()
      const key = action.key
      if (key === 'ArrowUp') {
        modeIndex = Math.max(0, modeIndex - 1)
        this.game.menu_screen.setSortSelection(modeIndex)
        this.game.sfx.play('select')
      } else if (key === 'ArrowDown') {
        modeIndex = Math.min(SONG_SORT_MODES.length - 1, modeIndex + 1)
        this.game.menu_screen.setSortSelection(modeIndex)
        this.game.sfx.play('select')
      } else if (/^[1-4]$/.test(key)) {
        modeIndex = Number(key) - 1
        this.game.menu_screen.setSortSelection(modeIndex)
        if (isPointerApply(action)) break
      } else if (key.toLocaleLowerCase() === 'r') {
        direction = direction === 'asc' ? 'desc' : 'asc'
        this.game.menu_screen.setSortDirection(direction)
        this.game.sfx.play('select')
      } else if (key === 'Enter' || key === ' ' || key === 'Space') {
        break
      } else if (
        key === 'Escape' ||
        key === 'Backspace' ||
        key.toLocaleLowerCase() === 's'
      ) {
        this.game.menu_screen.hideSortMenu()
        this.game.sfx.play('exit')
        return
      }
    }

    this.game.menu_screen.hideSortMenu()
    this.sort_mode = SONG_SORT_MODES[modeIndex]
    this.sort_direction = direction
    this.game.preferences.setSongSort(this.sort_mode, this.sort_direction)
    this.resortCurrentCollection()
    this.game.sfx.play('select2')
  }

  async selectImportSource () {
    let selection = 0
    this.game.menu_screen.showImportSourceMenu(selection)
    this.updateImportProviderArtwork(selection)

    while (true) {
      const action = await this.game.input.waitForAnyKey()
      const key = action.key
      if (key === 'ArrowUp') {
        selection = (selection - 1 + IMPORT_PROVIDERS.length) %
          IMPORT_PROVIDERS.length
        this.game.menu_screen.setImportSourceSelection(selection)
        this.game.menu_screen.setImportSourceNotice()
        this.updateImportProviderArtwork(selection)
        this.game.sfx.play('select')
      } else if (key === 'ArrowDown') {
        selection = (selection + 1) % IMPORT_PROVIDERS.length
        this.game.menu_screen.setImportSourceSelection(selection)
        this.game.menu_screen.setImportSourceNotice()
        this.updateImportProviderArtwork(selection)
        this.game.sfx.play('select')
      } else if (/^[1-4]$/.test(key)) {
        selection = Number(key) - 1
        this.game.menu_screen.setImportSourceSelection(selection)
        this.updateImportProviderArtwork(selection)
        if (!isPointerApply(action)) continue
      } else if (
        key === 'Escape' ||
        key === 'Backspace' ||
        key.toLocaleLowerCase() === 'q'
      ) {
        this.game.menu_screen.hideImportSourceMenu()
        this.restoreSelectedArtwork()
        this.game.sfx.play('exit')
        return
      } else if (
        key !== 'Enter' &&
        key !== ' ' &&
        key !== 'Space'
      ) {
        continue
      }

      const provider = IMPORT_PROVIDERS[selection]
      this.game.menu_screen.hideImportSourceMenu()
      await this.importFromMusicProvider(provider)
      this.restoreSelectedArtwork()
      return
    }
  }

  async showAbout () {
    this.game.menu_screen.showAbout()
    while (true) {
      const action = await this.game.input.waitForAnyKey()
      const key = action.key
      if (
        key === 'Escape' ||
        key === 'Backspace' ||
        key === 'Enter' ||
        key === ' ' ||
        key === 'Space' ||
        key.toLocaleLowerCase() === 'a'
      ) {
        this.game.menu_screen.hideAbout()
        this.game.sfx.play('exit')
        return
      }
    }
  }

  async selectImportBatchSize (providerLabel) {
    // Every import begins from the documented safe default. A player's
    // one-off large batch must not silently become the next import's default.
    let value = 10
    this.game.menu_screen.showImportBatchMenu(value, providerLabel)
    while (true) {
      const action = await this.game.input.waitForAnyKey()
      const key = action.key
      if (key === 'ArrowUp' || key === 'ArrowRight') {
        value = Math.min(500, value + 1)
      } else if (key === 'ArrowDown' || key === 'ArrowLeft') {
        value = Math.max(1, value - 1)
      } else if (key === 'PageUp') {
        value = Math.min(500, value + 10)
      } else if (key === 'PageDown') {
        value = Math.max(1, value - 10)
      } else if (key === 'Home') {
        value = 1
      } else if (key === 'End') {
        value = 500
      } else if (key === 'Enter' || key === ' ' || key === 'Space') {
        this.game.menu_screen.hideImportBatchMenu()
        this.game.sfx.play('decide')
        return value
      } else if (key === 'Escape' || key === 'Backspace') {
        this.game.menu_screen.hideImportBatchMenu()
        this.game.sfx.play('exit')
        return null
      } else {
        continue
      }
      this.game.menu_screen.setImportBatchValue(value)
      this.game.sfx.play('select')
    }
  }

  async importFromMusicProvider (provider) {
    const t = this.game.i18n.t.bind(this.game.i18n)
    const providerLabel = t(provider.labelKey)
    const batchSize = await this.selectImportBatchSize(providerLabel)
    if (batchSize === null) return
    let urls = []
    let localFiles = []
    if (provider.asksForUrls) {
      const value = window.prompt(t('apple.urlPrompt'), '')
      if (value === null) return
      urls = value.split(/[\r\n\s]+/u).filter(Boolean)
    }
    if (provider.selectsFolder) {
      localFiles = await this.selectLocalFolderFiles()
      if (!localFiles.length) return
    }
    this.game.sfx.play('decide')
    this.game.menu_screen.hide()
    this.game.songinfo_screen.hide()
    this.game.loading_screen.show()
    this.game.loading_screen.setMainText(providerLabel)
    this.game.loading_screen.setSubText(t('music.connecting', {
      provider: providerLabel,
    }))

    let finalMessage = t('music.importFailed')
    let finalDetail = t('music.return')
    let uploadSessionId = ''
    let uploadToken = ''
    let importAccepted = false
    let stopRequested = false
    let stopRequestSent = false
    const transferAbort = new AbortController()
    const requestStop = event => {
      if (!['Escape', 'Backspace'].includes(event.key)) return
      stopRequested = true
      transferAbort.abort()
      this.game.loading_screen.setSubText(t('music.progress.stopping'))
      if (!importAccepted || !uploadToken || stopRequestSent) return
      stopRequestSent = true
      fetch('/api/music-import/cancel', {
        method: 'POST',
        headers: { 'X-TMN-Token': uploadToken },
      }).catch(() => {})
    }
    window.addEventListener('keydown', requestStop, true)
    try {
      const localResponse = await fetch('/api/local/status', { cache: 'no-store' })
      if (!localResponse.ok) {
        throw new Error(t('music.startLauncher'))
      }
      const local = await localResponse.json()
      uploadToken = local.token
      const headers = {
        'Content-Type': 'application/json',
        'X-TMN-Token': local.token,
      }
      if (provider.selectsFolder) {
        const sessionResponse = await fetch('/api/local-folder/session', {
          method: 'POST',
          headers,
          body: '{}',
        })
        const session = await sessionResponse.json().catch(() => ({}))
        if (!sessionResponse.ok || !session.id) {
          throw new Error(session.error || t('music.localFolderSessionError'))
        }
        uploadSessionId = session.id
        for (let index = 0; index < localFiles.length; index++) {
          const item = localFiles[index]
          this.game.loading_screen.setSubText(t('music.progress.upload', {
            current: index + 1,
            total: localFiles.length,
          }))
          const uploadResponse = await fetch(
            `/api/local-folder/file?session=${encodeURIComponent(uploadSessionId)}` +
            `&path=${encodeURIComponent(item.relativePath)}`,
            {
              method: 'PUT',
              headers: { 'X-TMN-Token': local.token },
              body: item.file,
              signal: transferAbort.signal,
            },
          )
          if (!uploadResponse.ok) {
            const uploadError = await uploadResponse.json().catch(() => ({}))
            throw new Error(uploadError.error || t('music.localFolderUploadError'))
          }
        }
      }
      if (stopRequested) {
        const cancelled = new Error('Import cancelled')
        cancelled.name = 'AbortError'
        throw cancelled
      }
      const audioCount = localFiles.filter(item => (
        LOCAL_AUDIO_EXTENSIONS.has(fileExtension(item.relativePath))
      )).length
      const startResponse = await fetch(`/api/music-import/${provider.id}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          limit: provider.selectsFolder
            ? Math.max(1, Math.min(audioCount, batchSize))
            : batchSize,
          urls,
          sessionId: uploadSessionId,
        }),
      })
      if (startResponse.status === 409) {
        throw new Error(t('music.busy'))
      }
      if (!startResponse.ok) {
        const error = await startResponse.json().catch(() => ({}))
        const failure = new Error(error.error || t('music.startError'))
        failure.code = error.code
        throw failure
      }
      importAccepted = true
      if (stopRequested && !stopRequestSent) {
        stopRequestSent = true
        await fetch('/api/music-import/cancel', {
          method: 'POST',
          headers: { 'X-TMN-Token': local.token },
        }).catch(() => {})
      }

      let job = await startResponse.json()
      while (job.state === 'running') {
        this.game.loading_screen.setSubText(
          this.localizedImportProgress(job, providerLabel),
        )
        await new Promise(resolve => setTimeout(resolve, 600))
        const statusResponse = await fetch('/api/music-import/status', {
          headers: { 'X-TMN-Token': local.token },
          cache: 'no-store',
        })
        if (!statusResponse.ok) throw new Error(t('music.connectionLost'))
        job = await statusResponse.json()
      }

      if (job.state === 'error') {
        const failure = new Error(job.error?.message || job.message || t('music.importError'))
        failure.code = job.error?.code
        failure.result = job.result
        throw failure
      }

      const songResponse = await fetch(this.game.config.songs_url, { cache: 'no-store' })
      if (!songResponse.ok) throw new Error(t('music.libraryRefreshError'))
      this.game.songs.load(await songResponse.json())
      this.current_collection = this.game.songs.root
      this.current_index = 0
      this.captureLibraryOrder()
      this.sortCollection(this.current_collection)

      const result = job.result || {}
      const imported = result.imported || 0
      const refreshed = result.refreshed || 0
      const requested = result.requested || 20
      finalMessage = result.cancelled
        ? t('music.result.cancelled', { count: imported })
        : result.networkInterrupted
        ? t('music.result.interrupted', { count: imported, provider: providerLabel })
        : result.batchComplete
          ? t('music.result.complete', { count: imported, provider: providerLabel })
          : imported > 0
            ? t('music.result.exhausted', { count: imported, requested, provider: providerLabel })
            : t('music.result.none', { provider: providerLabel })
      finalDetail = t('music.result.detail', {
        imported,
        refreshed,
        existing: result.skipped || 0,
        duplicates: result.duplicates || 0,
        failed: result.failed || 0,
      }) +
        this.localizedFailureSummary(result) +
        this.localizedRecentFailures(result)
    } catch (error) {
      if (stopRequested || error?.name === 'AbortError') {
        finalMessage = t('music.result.cancelled', { count: 0 })
        finalDetail = t('music.result.cancelledDetail')
      } else {
        finalMessage = t('music.unavailable', { provider: providerLabel })
        finalDetail = t('music.error.detail', {
          error: this.localizedImportError(error),
        }) +
          this.localizedFailureSummary(error.result) +
          this.localizedRecentFailures(error.result)
        this.game.sfx.play('error')
      }
    } finally {
      window.removeEventListener('keydown', requestStop, true)
      if (uploadSessionId && !importAccepted && uploadToken) {
        await fetch(
          `/api/local-folder/session?session=${encodeURIComponent(uploadSessionId)}`,
          {
            method: 'DELETE',
            headers: { 'X-TMN-Token': uploadToken },
          },
        ).catch(() => {})
      }
    }

    this.game.loading_screen.setMainText(finalMessage)
    this.game.loading_screen.setSubText(finalDetail)
    await this.game.input.waitForAnyKey()
    this.game.loading_screen.hide()
    this.game.menu_screen.show()
    this.game.songinfo_screen.show()
    this.updateSong(true)
  }

  localizedFailureSummary (result) {
    const entries = Object.entries(result?.failureReasons || {})
      .filter(([, count]) => Number(count) > 0)
    if (!entries.length) return ''
    const reasons = entries
      .map(([reason, count]) => this.game.i18n.t(
        `music.failure.${reason}`,
        { count },
      ))
      .join(' · ')
    return `\n${this.game.i18n.t('music.result.failureReasons', { reasons })}`
  }

  localizedRecentFailures (result) {
    const failures = Array.isArray(result?.failures)
      ? result.failures.slice(-5)
      : []
    if (!failures.length) return ''
    const lines = failures.map(failure => this.game.i18n.t(
      'music.result.failureItem',
      {
        title: failure.title || this.game.i18n.t('common.unknown'),
        reason: failure.reason || this.game.i18n.t('music.failure.other', {
          count: 1,
        }),
      },
    ))
    return `\n${this.game.i18n.t('music.result.recentFailures')}\n${lines.join('\n')}`
  }

  async selectLocalFolderFiles () {
    const collected = []
    if (typeof window.showDirectoryPicker === 'function') {
      try {
        const root = await window.showDirectoryPicker({ mode: 'read' })
        const visit = async (handle, prefix = '') => {
          for await (const [name, child] of handle.entries()) {
            const relativePath = prefix ? `${prefix}/${name}` : name
            if (child.kind === 'directory') {
              await visit(child, relativePath)
            } else if (LOCAL_IMPORT_EXTENSIONS.has(fileExtension(name))) {
              collected.push({ file: await child.getFile(), relativePath })
            }
          }
        }
        await visit(root)
        return collected
      } catch (error) {
        if (error?.name === 'AbortError') return []
      }
    }

    return new Promise(resolve => {
      const input = document.createElement('input')
      input.type = 'file'
      input.multiple = true
      input.setAttribute('webkitdirectory', '')
      input.style.display = 'none'
      input.addEventListener('change', () => {
        const files = [...(input.files || [])]
          .filter(file => LOCAL_IMPORT_EXTENSIONS.has(fileExtension(file.name)))
          .map(file => ({
            file,
            relativePath: file.webkitRelativePath || file.name,
          }))
        input.remove()
        resolve(files)
      }, { once: true })
      input.addEventListener('cancel', () => {
        input.remove()
        resolve([])
      }, { once: true })
      document.body.appendChild(input)
      input.click()
    })
  }

  playableSongs (collection, output = []) {
    for (const child of collection?.children || []) {
      if (Array.isArray(child.children)) {
        this.playableSongs(child, output)
      } else {
        output.push(child)
      }
    }
    return output
  }

  clearSongClientState (songs, { clearAllScores = false } = {}) {
    try {
      for (const song of songs) {
        for (const value of [
          song.media_url,
          song.image_url,
          song.poster_url,
        ]) {
          if (String(value || '').startsWith('blob:')) URL.revokeObjectURL(value)
        }
        song.clearHighScore?.()
      }
      if (!clearAllScores) return
      const storage = window.localStorage
      const keys = []
      for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index)
        if (key) keys.push(key)
      }
      for (const key of keys) {
        if (key.startsWith('typingmania:high_score:')) {
          storage.removeItem(key)
        }
      }
    } catch {}
  }

  clearSongScoresByUrl (songUrls) {
    try {
      const wanted = new Set([...songUrls].map(String))
      const storage = window.localStorage
      const prefix = `typingmania:high_score:${window.location.href}:`
      const keys = []
      for (let index = 0; index < storage.length; index++) {
        const key = storage.key(index)
        if (key?.startsWith(prefix)) keys.push(key)
      }
      for (const key of keys) {
        const value = key.endsWith(':class')
          ? key.slice(prefix.length, -':class'.length)
          : key.slice(prefix.length)
        if (wanted.has(value)) storage.removeItem(key)
      }
    } catch {}
  }

  async localLibrarySession (
    startMessageKey = 'library.editor.startLauncher',
  ) {
    const response = await fetch('/api/local/status', { cache: 'no-store' })
    if (!response.ok) {
      throw new Error(this.game.i18n.t(startMessageKey))
    }
    const local = await response.json()
    return {
      local,
      headers: {
        'Content-Type': 'application/json',
        'X-TMN-Token': local.token,
      },
    }
  }

  async showNetworkStatus () {
    const t = this.game.i18n.t.bind(this.game.i18n)
    let session
    try {
      session = await this.localLibrarySession('network.startLauncher')
      const response = await fetch('/api/network/status', {
        headers: { 'X-TMN-Token': session.local.token },
        cache: 'no-store',
      })
      if (!response.ok) throw new Error(t('network.error'))
      this.game.menu_screen.showNetworkStatus(await response.json())
    } catch (error) {
      this.game.sfx.play('error')
      this.game.loading_screen.show()
      this.game.loading_screen.setMainText(t('network.error'))
      this.game.loading_screen.setSubText(error.message)
      await this.game.input.waitForAnyKey()
      this.game.loading_screen.hide()
      return
    }

    while (true) {
      const action = await this.game.input.waitForAnyKey()
      if (action.key === 'Escape' || action.key === 'Backspace') break
      if (action.code === NETWORK_LOGS_CODE || action.key === 'Tab') {
        this.game.menu_screen.toggleNetworkLogs()
        this.game.sfx.play('select')
        continue
      }
      if (action.code === NETWORK_CHECK_CODE || action.key.toLowerCase() === 'r') {
        this.game.menu_screen.setNetworkCheckBusy(true)
        try {
          const response = await fetch('/api/network/check', {
            method: 'POST',
            headers: session.headers,
          })
          if (!response.ok) throw new Error(t('network.error'))
          this.game.menu_screen.setNetworkStatus(await response.json())
          this.game.sfx.play('select2')
        } catch {
          this.game.sfx.play('error')
        } finally {
          this.game.menu_screen.setNetworkCheckBusy(false)
        }
        continue
      }
      if (String(action.key).startsWith(NETWORK_REGION_PREFIX)) {
        const region = action.key.slice(NETWORK_REGION_PREFIX.length)
        this.game.menu_screen.setNetworkCheckBusy(true)
        try {
          const response = await fetch('/api/network/region', {
            method: 'PUT',
            headers: session.headers,
            body: JSON.stringify({ region }),
          })
          if (!response.ok) throw new Error(t('network.regionError'))
          this.game.menu_screen.setNetworkStatus(await response.json())
          this.game.sfx.play('select2')
        } catch {
          this.game.sfx.play('error')
        } finally {
          this.game.menu_screen.setNetworkCheckBusy(false)
        }
        continue
      }
      if (action.code === NETWORK_PROXY_APPLY_CODE) {
        this.game.menu_screen.setNetworkCheckBusy(true)
        try {
          const response = await fetch('/api/network/proxy', {
            method: 'PUT',
            headers: session.headers,
            body: JSON.stringify(
              this.game.menu_screen.getNetworkProxySettings(),
            ),
          })
          const updated = await response.json().catch(() => null)
          if (!response.ok) {
            throw new Error(updated?.error || t('network.proxyError'))
          }
          this.game.menu_screen.setNetworkStatus(updated)
          this.game.sfx.play('select2')
        } catch (error) {
          this.game.sfx.play('error')
          this.game.loading_screen.show()
          this.game.loading_screen.setMainText(t('network.proxyError'))
          this.game.loading_screen.setSubText(error.message)
          await this.game.input.waitForAnyKey()
          this.game.loading_screen.hide()
        } finally {
          this.game.menu_screen.setNetworkCheckBusy(false)
        }
      }
    }
    this.game.menu_screen.hideNetworkStatus()
    this.game.sfx.play('exit')
  }

  toggleLibraryEditorSelection (songs, selectedIds, index) {
    const song = songs[index]
    if (!song) return
    if (selectedIds.has(song.id)) selectedIds.delete(song.id)
    else selectedIds.add(song.id)
    this.game.menu_screen.setLibraryEditorSelection(selectedIds)
  }

  async confirmSelectedSongDeletion (count) {
    this.game.menu_screen.showLibraryDeleteConfirmation(count)
    while (true) {
      const action = await this.game.input.waitForAnyKey()
      if (
        action.code === LIBRARY_EDITOR_CONFIRM_CODE ||
        action.key === 'Delete' ||
        action.key === 'Enter'
      ) {
        this.game.menu_screen.hideLibraryDeleteConfirmation()
        return true
      }
      if (action.key === 'Escape' || action.key === 'Backspace') {
        this.game.menu_screen.hideLibraryDeleteConfirmation()
        return false
      }
    }
  }

  async editLibrary ({
    providedSongs = null,
    mode = 'editor',
    providedSession = null,
  } = {}) {
    const t = this.game.i18n.t.bind(this.game.i18n)
    let session = providedSession
    let songs = providedSongs
    try {
      if (!session) session = await this.localLibrarySession()
      if (!songs) {
        const response = await fetch('/api/library/editable', {
          headers: { 'X-TMN-Token': session.local.token },
          cache: 'no-store',
        })
        if (!response.ok) throw new Error(t('library.editor.error'))
        songs = (await response.json()).songs || []
      }
    } catch (error) {
      this.game.sfx.play('error')
      this.game.loading_screen.show()
      this.game.loading_screen.setMainText(t('library.editor.error'))
      this.game.loading_screen.setSubText(error.message)
      await this.game.input.waitForAnyKey()
      this.game.loading_screen.hide()
      return
    }

    let cursor = 0
    let editorSortMode = 'title'
    let editorSortDirection = 'asc'
    const selectedIds = new Set()
    this.game.menu_screen.showLibraryEditor(songs, { mode })
    this.game.menu_screen.setLibraryEditorSort(
      editorSortMode,
      editorSortDirection,
    )
    this.game.menu_screen.setLibraryEditorCursor(cursor)
    while (true) {
      const action = await this.game.input.waitForAnyKey()
      if (action.key === 'ArrowUp') {
        cursor = Math.max(0, cursor - 1)
        this.game.menu_screen.setLibraryEditorCursor(cursor)
        this.game.sfx.play('select')
      } else if (action.key === 'ArrowDown') {
        cursor = Math.min(songs.length - 1, cursor + 1)
        this.game.menu_screen.setLibraryEditorCursor(cursor)
        this.game.sfx.play('select')
      } else if (action.code === LIBRARY_EDITOR_TOGGLE_CODE) {
        cursor = Math.max(0, Math.min(songs.length - 1, Number(action.key)))
        this.game.menu_screen.setLibraryEditorCursor(cursor)
        this.toggleLibraryEditorSelection(songs, selectedIds, cursor)
        this.game.sfx.play('select2')
      } else if (
        mode === 'editor' &&
        String(action.key).startsWith(LIBRARY_EDITOR_SORT_PREFIX)
      ) {
        const requested = action.key.slice(LIBRARY_EDITOR_SORT_PREFIX.length)
        if (requested === editorSortMode) {
          editorSortDirection = editorSortDirection === 'asc' ? 'desc' : 'asc'
        } else {
          editorSortMode = requested
          editorSortDirection = requested === 'completeness' ? 'desc' : 'asc'
        }
        songs = sortEditableSongs(
          songs,
          editorSortMode,
          editorSortDirection,
        )
        cursor = 0
        this.game.menu_screen.setLibraryEditorSongs(songs)
        this.game.menu_screen.setLibraryEditorSort(
          editorSortMode,
          editorSortDirection,
        )
        this.game.menu_screen.setLibraryEditorCursor(cursor)
        this.game.menu_screen.setLibraryEditorSelection(selectedIds)
        this.game.sfx.play('select2')
      } else if (
        mode === 'editor' &&
        (
          action.code === LIBRARY_EDITOR_REFRESH_CODE ||
          action.key.toLocaleLowerCase() === 'u'
        )
      ) {
        this.game.menu_screen.hideLibraryEditor()
        await this.refreshLibraryMetadata()
        return
      } else if (
        mode === 'editor' &&
        action.code === LIBRARY_EDITOR_DEDUPE_CODE
      ) {
        this.game.menu_screen.hideLibraryEditor()
        this.game.sfx.play('select2')
        await this.deduplicateLibrary({ providedSession: session })
        return
      } else if (
        mode === 'editor' &&
        action.code === LIBRARY_EDITOR_INCOMPLETE_CODE
      ) {
        selectedIds.clear()
        for (const song of songs) {
          if (!song.completeness?.complete) selectedIds.add(song.id)
        }
        this.game.menu_screen.setLibraryEditorSelection(selectedIds)
        if (!selectedIds.size) {
          this.game.sfx.play('error')
          continue
        }
        this.game.sfx.play('select2')
        if (await this.confirmSelectedSongDeletion(selectedIds.size)) break
      } else if (
        action.key === ' ' ||
        action.key === 'Space' ||
        action.key === 'Enter'
      ) {
        this.toggleLibraryEditorSelection(songs, selectedIds, cursor)
        this.game.sfx.play('select2')
      } else if (action.key.toLocaleLowerCase() === 'a') {
        if (selectedIds.size === songs.length) selectedIds.clear()
        else for (const song of songs) selectedIds.add(song.id)
        this.game.menu_screen.setLibraryEditorSelection(selectedIds)
        this.game.sfx.play('select2')
      } else if (action.key === 'Delete' || action.key.toLocaleLowerCase() === 'x') {
        if (!selectedIds.size) {
          this.game.sfx.play('error')
          continue
        }
        if (await this.confirmSelectedSongDeletion(selectedIds.size)) break
      } else if (
        action.key === 'Escape' ||
        action.key === 'Backspace' ||
        action.key.toLocaleLowerCase() === (mode === 'duplicates' ? 'g' : 'e')
      ) {
        this.game.menu_screen.hideLibraryEditor()
        this.game.sfx.play('exit')
        return
      }
    }

    this.game.menu_screen.hideLibraryEditor()
    this.game.menu_screen.hide()
    this.game.songinfo_screen.hide()
    this.game.loading_screen.show()
    this.game.loading_screen.setMainText(t('library.editor.deleting'))
    this.game.loading_screen.setSubText(t('loading.pleaseWait'))
    try {
      const deletedSongs = this.playableSongs(this.game.songs.root)
        .filter(song => selectedIds.has(song.url))
      const response = await fetch('/api/library/delete', {
        method: 'POST',
        headers: session.headers,
        body: JSON.stringify({
          confirm: 'DELETE_SELECTED_SONGS',
          songIds: [...selectedIds],
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (response.status === 409) {
        throw new Error(t('library.editor.busy'))
      }
      if (!response.ok) {
        throw new Error(result.error || t('library.editor.error'))
      }

      this.clearSongClientState(deletedSongs)
      this.clearSongScoresByUrl(selectedIds)
      const songResponse = await fetch(this.game.config.songs_url, {
        cache: 'no-store',
      })
      if (!songResponse.ok) throw new Error(t('qq.libraryRefreshError'))
      this.game.songs.load(await songResponse.json())
      this.game.songs.current_song = null
      this.local_collection = null
      this.current_collection = this.game.songs.root
      this.current_index = 0
      this.captureLibraryOrder()
      this.sortCollection(this.current_collection)
      this.game.loading_screen.setMainText(t('library.editor.deleted'))
      this.game.loading_screen.setSubText(t('library.editor.deletedDetail', {
        count: result.deleted || selectedIds.size,
      }))
      this.game.sfx.play('decide')
    } catch (error) {
      this.game.sfx.play('error')
      this.game.loading_screen.setMainText(t('library.editor.error'))
      this.game.loading_screen.setSubText(error.message)
    }
    await this.game.input.waitForAnyKey()
    this.game.loading_screen.hide()
    this.game.menu_screen.show()
    this.game.songinfo_screen.show()
    this.updateSong(true)
  }

  async deduplicateLibrary ({ providedSession = null } = {}) {
    const t = this.game.i18n.t.bind(this.game.i18n)
    try {
      const session = providedSession || await this.localLibrarySession()
      const response = await fetch('/api/library/duplicates', {
        headers: { 'X-TMN-Token': session.local.token },
        cache: 'no-store',
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(result.error || t('library.dedupe.error'))
      }
      if (!result.songs?.length) {
        this.game.loading_screen.show()
        this.game.loading_screen.setMainText(t('library.dedupe.none'))
        this.game.loading_screen.setSubText(t('library.dedupe.noneDetail'))
        await this.game.input.waitForAnyKey()
        this.game.loading_screen.hide()
        return
      }
      await this.editLibrary({
        providedSongs: result.songs,
        mode: 'duplicates',
        providedSession: session,
      })
    } catch (error) {
      this.game.sfx.play('error')
      this.game.loading_screen.show()
      this.game.loading_screen.setMainText(t('library.dedupe.error'))
      this.game.loading_screen.setSubText(error.message)
      await this.game.input.waitForAnyKey()
      this.game.loading_screen.hide()
    }
  }

  async refreshLibraryMetadata () {
    const t = this.game.i18n.t.bind(this.game.i18n)
    this.game.sfx.play('decide')
    this.game.menu_screen.hide()
    this.game.songinfo_screen.hide()
    this.game.loading_screen.show()
    this.game.loading_screen.setMainText(t('metadata.refresh.starting'))
    this.game.loading_screen.setSubText(t('loading.pleaseWait'))
    let session = null
    let stopRequested = false
    let stopRequestSent = false
    let jobStarted = false
    let cancelled = false
    const sendStopRequest = async () => {
      if (!session || !jobStarted || stopRequestSent) return false
      stopRequestSent = true
      try {
        await fetch('/api/library/metadata-refresh/cancel', {
          method: 'POST',
          headers: { 'X-TMN-Token': session.local.token },
        })
        return true
      } catch {
        stopRequestSent = false
        return false
      }
    }
    const requestStop = event => {
      if (!['Escape', 'Backspace'].includes(event.key)) return
      stopRequested = true
      this.game.loading_screen.setSubText(t('metadata.refresh.stopping'))
      void sendStopRequest()
    }
    window.addEventListener('keydown', requestStop, true)
    try {
      session = await this.localLibrarySession(
        'metadata.refresh.startLauncher',
      )
      let job
      if (stopRequested) {
        job = {
          state: 'complete',
          result: { cancelled: true },
        }
      } else {
        const response = await fetch('/api/library/metadata-refresh', {
          method: 'POST',
          headers: session.headers,
          body: '{}',
        })
        job = await response.json().catch(() => ({}))
        if (response.status === 409) {
          throw new Error(t('metadata.refresh.busy'))
        }
        if (!response.ok) {
          throw new Error(job.error?.message || t('metadata.refresh.error'))
        }
        jobStarted = true
        if (stopRequested) await sendStopRequest()
      }
      while (job.state === 'running') {
        if (stopRequested) await sendStopRequest()
        this.game.loading_screen.setSubText(t('metadata.refresh.progress', {
          current: job.inspected || 0,
          total: job.total || '…',
          title: job.songTitle || '',
        }))
        await new Promise(resolve => setTimeout(resolve, 120))
        const status = await fetch('/api/library/metadata-refresh/status', {
          headers: { 'X-TMN-Token': session.local.token },
          cache: 'no-store',
        })
        if (!status.ok) throw new Error(t('metadata.refresh.error'))
        job = await status.json()
      }
      if (job.state === 'error') {
        throw new Error(job.error?.message || t('metadata.refresh.error'))
      }
      const result = job.result || {}
      cancelled = Boolean(result.cancelled || stopRequested)
      const songResponse = await fetch(this.game.config.songs_url, {
        cache: 'no-store',
      })
      if (!songResponse.ok) throw new Error(t('qq.libraryRefreshError'))
      this.game.songs.load(await songResponse.json())
      this.game.songs.current_song = null
      this.local_collection = null
      this.current_collection = this.game.songs.root
      this.current_index = 0
      this.captureLibraryOrder()
      this.sortCollection(this.current_collection)
      this.game.loading_screen.setMainText(t(
        cancelled
          ? 'metadata.refresh.cancelled'
          : result.networkDegraded
          ? 'metadata.refresh.degraded'
          : 'metadata.refresh.complete',
      ))
      this.game.loading_screen.setSubText(t(
        cancelled
          ? 'metadata.refresh.cancelledDetail'
          : result.networkDegraded
          ? 'metadata.refresh.degradedDetail'
          : 'metadata.refresh.completeDetail',
        {
          updated: result.updated || 0,
          metadata: result.metadata || 0,
          origins: result.origins || 0,
          posters: result.posters || 0,
          covers: result.covers || 0,
        },
      ) + this.localizedRecentFailures(result))
    } catch (error) {
      this.game.sfx.play('error')
      this.game.loading_screen.setMainText(t('metadata.refresh.error'))
      this.game.loading_screen.setSubText(
        error.message || t('metadata.refresh.startLauncher'),
      )
    } finally {
      cancelled = cancelled || stopRequested
      window.removeEventListener('keydown', requestStop, true)
    }
    if (!cancelled) await this.game.input.waitForAnyKey()
    this.game.loading_screen.hide()
    this.game.menu_screen.show()
    this.game.songinfo_screen.show()
    this.updateSong(true)
  }

  async selectLibraryResetScope () {
    let selection = 0
    this.game.menu_screen.showResetScopeMenu(selection)
    while (true) {
      const action = await this.game.input.waitForAnyKey()
      const key = action.key
      if (key === 'ArrowUp') {
        selection = (selection - 1 + RESET_SCOPES.length) % RESET_SCOPES.length
      } else if (key === 'ArrowDown') {
        selection = (selection + 1) % RESET_SCOPES.length
      } else if (/^[1-5]$/.test(key)) {
        selection = Number(key) - 1
        this.game.menu_screen.setResetScopeSelection(selection)
        if (!isPointerApply(action)) continue
      } else if (key === 'Escape' || key === 'Backspace') {
        this.game.menu_screen.hideResetScopeMenu()
        return null
      } else if (!['Enter', ' ', 'Space'].includes(key)) {
        continue
      }
      this.game.menu_screen.setResetScopeSelection(selection)
      if (['ArrowUp', 'ArrowDown'].includes(key)) {
        this.game.sfx.play('select')
        continue
      }
      this.game.menu_screen.hideResetScopeMenu()
      return RESET_SCOPES[selection]
    }
  }

  async confirmLibraryReset (scope) {
    this.game.menu_screen.showResetMenu(scope)
    while (true) {
      const confirmation = await this.game.input.waitForAnyKey()
      if (confirmation.key.toLocaleLowerCase() === 'd') {
        this.game.menu_screen.hideResetMenu()
        return true
      }
      if (
        confirmation.key === 'Escape' ||
        confirmation.key === 'Backspace'
      ) {
        this.game.menu_screen.hideResetMenu()
        return false
      }
    }
  }

  async resetLibrary () {
    const t = this.game.i18n.t.bind(this.game.i18n)
    this.game.sfx.play('decide')
    const scope = await this.selectLibraryResetScope()
    if (!scope || !await this.confirmLibraryReset(scope)) {
      this.game.sfx.play('exit')
      return
    }

    this.game.menu_screen.hide()
    this.game.songinfo_screen.hide()
    this.game.loading_screen.show()
    this.game.loading_screen.setMainText(t('library.reset.restoring'))
    this.game.loading_screen.setSubText(t('loading.pleaseWait'))

    try {
      const localResponse = await fetch('/api/local/status', { cache: 'no-store' })
      if (!localResponse.ok) throw new Error(t('library.reset.startLauncher'))
      const local = await localResponse.json()
      const headers = {
        'Content-Type': 'application/json',
        'X-TMN-Token': local.token,
      }
      const addedSongs = this.playableSongs(this.game.songs.root)
        .filter(song => (
          !isStarterSong(song) &&
          (scope.id === 'all' || song.source?.service === scope.id)
        ))
      const resetResponse = await fetch('/api/library/reset', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          confirm: 'RESET_LIBRARY_SCOPE',
          scope: scope.id,
        }),
      })
      const result = await resetResponse.json().catch(() => ({}))
      if (resetResponse.status === 409) {
        throw new Error(t('library.reset.busy'))
      }
      if (!resetResponse.ok) {
        throw new Error(result.error || t('library.reset.error'))
      }

      this.clearSongClientState(addedSongs, {
        clearAllScores: scope.id === 'all',
      })
      const songResponse = await fetch(this.game.config.songs_url, {
        cache: 'no-store',
      })
      if (!songResponse.ok) throw new Error(t('qq.libraryRefreshError'))
      this.game.songs.load(await songResponse.json())
      this.game.songs.current_song = null
      this.local_collection = null
      this.current_collection = this.game.songs.root
      this.current_index = 0
      this.captureLibraryOrder()
      this.sortCollection(this.current_collection)
      const removedCount = Math.max(
        Number(result.deleted || 0),
        addedSongs.length,
      )
      this.game.loading_screen.setMainText(
        result.restored
          ? t('library.reset.complete')
          : t('library.reset.partial', { failed: result.failed || 0 }),
      )
      this.game.loading_screen.setSubText(
        t('library.reset.completeDetail', { count: removedCount }),
      )
      await this.game.input.waitForAnyKey()
    } catch (error) {
      this.game.sfx.play('error')
      this.game.loading_screen.setMainText(t('library.reset.error'))
      this.game.loading_screen.setSubText(t('qq.error.detail', {
        error: error.message || t('qq.connectionLost'),
      }))
      await this.game.input.waitForAnyKey()
    }

    this.game.loading_screen.hide()
    this.game.menu_screen.show()
    this.game.songinfo_screen.show()
    this.updateSong(true)
  }

  async run () {
    if (!this.playStyleInitialized) {
      this.playStyleInitialized = true
      this.setPlayStyle(this.game.preferences.playStyle, { playSound: false })
    }
    // Show all scene
    this.game.menu_screen.show()
    this.game.songinfo_screen.show()
    this.game.songinfo_screen.menuMode(true)
    this.game.background_screen.showMenuUI(true)
    this.game.background_screen.hideSongBackground()
    this.game.background_screen.volume_bar.show()

    if (this.current_collection === null) {
      // First time loading menu screen, initialize with default
      this.current_collection = this.game.songs.root
      this.captureLibraryOrder()
      this.sortCollection(this.current_collection)
      this.game.menu_screen.setSortState(
        this.sort_mode,
        this.sort_direction,
      )
      this.updateSong(true)
    } else {
      // Need to update to show new high score
      this.updateSong(false)
    }

    // To signal that a file is dropped
    this.dropped_signal = new Promise((resolve) => {
      this.signal_drop = resolve
    })

    while (true) {
      // Flag to break the loop and transition to song-load controller
      let is_song_chosen = false

      // Check if we process the load via URL yet
      if (!this.loaded_from_url) {
        this.loaded_from_url = true

        if (this.game.specified_song) {
          const importedSong = await this.importSong(
            this.game.specified_song_path,
            this.game.specified_song,
          )
          this.current_collection = this.local_collection
          this.sortCollection(this.current_collection)
          this.current_index = this.local_collection.children.indexOf(importedSong)
          this.updateSong(true)
          is_song_chosen = true
          break
        }
      }

      // Wait for input key
      const action = await Promise.any([this.game.input.waitForAnyKey(), this.dropped_signal])
      if (action instanceof KeyboardEvent) {
        const key = action.key
        switch (key) {
          case 'ArrowUp':
            this.moveCurrentSelection(-1)
            break

          case 'ArrowDown':
            this.moveCurrentSelection(1)
            break

          case 'Escape':
          case 'Backspace':
            this.moveToParentCollection()
            break

          case 'Space':
          case ' ':
          case 'Enter':
            // Move IN
            if (this.current_collection.children[this.current_index] instanceof SongCollection) {
              // A collection, so enter
              this.current_collection = this.current_collection.children[this.current_index]
              this.current_index = 0

              this.sortCollection(this.current_collection)
              this.updateSong(true)
              this.game.sfx.play('select2')
            } else if (this.current_collection.children[this.current_index]) {
              // If a song, so transition to Song screen
              is_song_chosen = true
            } else {
              // Empty
              this.game.sfx.play('error')
            }
            break

          case 'F9':
            this.cycleGameMode()
            break

          case 'q':
          case 'Q':
            await this.selectImportSource()
            break

          case 'l':
          case 'L':
            await this.selectLanguage()
            break

          case 's':
          case 'S':
            await this.selectSort()
            break

          case 'k':
          case 'K':
            this.toggleKeyEffects()
            break

          case 'm':
          case 'M':
            await this.selectPlayStyle()
            break

          case 'n':
          case 'N':
            await this.showNetworkStatus()
            break

          case 'v':
          case 'V':
            this.toggleMusicVideo()
            break

          case 'd':
          case 'D':
            await this.resetLibrary()
            break

          case 'e':
          case 'E':
            await this.editLibrary()
            break

          case 'a':
          case 'A':
            await this.showAbout()
            break
        }
      } else {
        // Process dropped song
        const importedSongs = []
        for (const file of action) {
          importedSongs.push(await this.importSong(file[0], file[1]))
        }

        // Set menu to the top of imported song
        this.current_collection = this.local_collection
        this.sortCollection(this.current_collection)
        this.current_index = this.local_collection.children.indexOf(
          importedSongs[0],
        )

        // Update song screen
        this.updateSong(true)

        // Reset signal
        this.dropped_signal = new Promise((resolve) => {
          this.signal_drop = resolve
        })
      }

      if (is_song_chosen) {
        break
      }
    }

    this.signal_drop = undefined

    // Standard song chosen
    this.game.songs.setSong(this.current_collection.children[this.current_index])
    this.game.menu_screen.hide()
    this.game.background_screen.showMenuUI(false)
    this.game.songinfo_screen.menuMode(false)
    return this.game.song_load_controller
  }
}
