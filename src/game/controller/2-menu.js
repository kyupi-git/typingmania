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
  LIBRARY_EDITOR_TOGGLE_CODE,
} from '../../screen/library-editor-dialog.js'

export default class MenuController {
  constructor (game) {
    this.game = game

    this.current_collection = null
    this.current_index = 0
    this.local_collection = null
    this.loaded_from_url = false
    this.mode_before_demo = 'normal'
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
    if (!selection || selection instanceof SongCollection) {
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
    const albumUrl = usesPoster
      ? (selection.image_url || selection.preview_album_url)
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
  }

  toggleDemoMode () {
    if (this.game.game_mode === 'auto') {
      this.setGameMode(this.mode_before_demo)
    } else {
      this.mode_before_demo = this.game.game_mode
      this.setGameMode('auto')
    }
    this.game.sfx.play('select2')
  }

  cycleGameMode () {
    const modes = ['normal', 'easy', 'tempo', 'auto', 'blind', 'blank']
    const current = modes.indexOf(this.game.game_mode)
    const next = modes[(current + 1) % modes.length]
    if (next === 'auto') this.mode_before_demo = this.game.game_mode
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

  localizedImportProgress (job) {
    const values = {
      number: job.inspected || 1,
      title: job.songTitle || '',
    }
    const keys = {
      session: 'qq.progress.session',
      cache: 'qq.progress.cache',
      metadata: 'qq.progress.metadata',
      duplicate: 'qq.progress.existing',
      origin: 'qq.progress.origin',
      lyrics: 'qq.progress.lyrics',
      cover: 'qq.progress.cover',
      audio: 'qq.progress.audio',
      pack: 'qq.progress.pack',
      skipping: 'qq.progress.skipping',
      index: 'qq.progress.index',
    }
    const key = keys[job.phase] || 'qq.progress.default'
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
      values,
    )
  }

  localizedImportError (error) {
    const key = error?.code ? `qq.error.${error.code}` : ''
    const translated = key ? this.game.i18n.t(key) : ''
    return translated && translated !== key
      ? translated
      : (error?.message || this.game.i18n.t('qq.importError'))
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

    while (true) {
      const action = await this.game.input.waitForAnyKey()
      const key = action.key
      if (key === 'ArrowUp') {
        selection = 0
        this.game.menu_screen.setImportSourceSelection(selection)
        this.game.menu_screen.setImportSourceNotice()
        this.game.sfx.play('select')
      } else if (key === 'ArrowDown') {
        selection = 0
        this.game.menu_screen.setImportSourceSelection(selection)
        this.game.menu_screen.setImportSourceNotice()
        this.game.sfx.play('select')
      } else if (/^[1-2]$/.test(key)) {
        if (key === '2') {
          this.game.menu_screen.setImportSourceNotice(
            'import.comingSoonDetail',
          )
          this.game.sfx.play('error')
          continue
        }
        selection = Number(key) - 1
        this.game.menu_screen.setImportSourceSelection(selection)
        if (!isPointerApply(action)) continue
      } else if (
        key === 'Escape' ||
        key === 'Backspace' ||
        key.toLocaleLowerCase() === 'q'
      ) {
        this.game.menu_screen.hideImportSourceMenu()
        this.game.sfx.play('exit')
        return
      } else if (
        key !== 'Enter' &&
        key !== ' ' &&
        key !== 'Space'
      ) {
        continue
      }

      if (selection === 0) {
        this.game.menu_screen.hideImportSourceMenu()
        await this.importFromQQMusic()
        return
      }
      this.game.menu_screen.setImportSourceNotice('import.comingSoonDetail')
      this.game.sfx.play('error')
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

  async importFromQQMusic () {
    const t = this.game.i18n.t.bind(this.game.i18n)
    this.game.sfx.play('decide')
    this.game.menu_screen.hide()
    this.game.songinfo_screen.hide()
    this.game.loading_screen.show()
    this.game.loading_screen.setMainText(t('import.qqMusic'))
    this.game.loading_screen.setSubText(t('qq.connecting'))

    let finalMessage = t('qq.importFailed')
    let finalDetail = t('qq.return')
    try {
      const localResponse = await fetch('/api/local/status', { cache: 'no-store' })
      if (!localResponse.ok) {
        throw new Error(t('qq.startLauncher'))
      }
      const local = await localResponse.json()
      const headers = {
        'Content-Type': 'application/json',
        'X-TMN-Token': local.token,
      }
      const startResponse = await fetch('/api/qqmusic/import', {
        method: 'POST',
        headers,
        body: JSON.stringify({ limit: 20 }),
      })
      if (!startResponse.ok && startResponse.status !== 409) {
        const error = await startResponse.json().catch(() => ({}))
        const failure = new Error(error.error || t('qq.startError'))
        failure.code = error.code
        throw failure
      }

      let job = await startResponse.json()
      while (job.state === 'running') {
        this.game.loading_screen.setSubText(this.localizedImportProgress(job))
        await new Promise(resolve => setTimeout(resolve, 600))
        const statusResponse = await fetch('/api/qqmusic/import/status', {
          headers: { 'X-TMN-Token': local.token },
          cache: 'no-store',
        })
        if (!statusResponse.ok) throw new Error(t('qq.connectionLost'))
        job = await statusResponse.json()
      }

      if (job.state === 'error') {
        const failure = new Error(job.error?.message || job.message || t('qq.importError'))
        failure.code = job.error?.code
        throw failure
      }

      const songResponse = await fetch(this.game.config.songs_url, { cache: 'no-store' })
      if (!songResponse.ok) throw new Error(t('qq.libraryRefreshError'))
      this.game.songs.load(await songResponse.json())
      this.current_collection = this.game.songs.root
      this.current_index = 0
      this.captureLibraryOrder()
      this.sortCollection(this.current_collection)

      const result = job.result || {}
      const imported = result.imported || 0
      const refreshed = result.refreshed || 0
      const requested = result.requested || 20
      finalMessage = result.networkInterrupted
        ? t('qq.result.interrupted', { count: imported })
        : result.batchComplete
          ? t('qq.result.complete', { count: imported })
          : imported > 0
            ? t('qq.result.exhausted', { count: imported, requested })
            : t('qq.result.none')
      finalDetail = t('qq.result.detail', {
        imported,
        refreshed,
        existing: result.skipped || 0,
        duplicates: result.duplicates || 0,
        failed: result.failed || 0,
      })
      this.game.menu_screen.setImportHint(
        result.batchComplete
          ? 'qq.hint.next'
          : 'qq.hint.moreCache',
        { count: imported },
      )
    } catch (error) {
      finalMessage = t('qq.unavailable')
      finalDetail = t('qq.error.detail', {
        error: this.localizedImportError(error),
      })
      this.game.sfx.play('error')
    }

    this.game.loading_screen.setMainText(finalMessage)
    this.game.loading_screen.setSubText(finalDetail)
    await this.game.input.waitForAnyKey()
    this.game.loading_screen.hide()
    this.game.menu_screen.show()
    this.game.songinfo_screen.show()
    this.updateSong(true)
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

  isStarterSong (song) {
    return song?.source?.service === 'typingmania-demo' &&
      song?.source?.baseline === true
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

  async localLibrarySession () {
    const response = await fetch('/api/local/status', { cache: 'no-store' })
    if (!response.ok) {
      throw new Error(this.game.i18n.t('library.editor.startLauncher'))
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

  async editLibrary () {
    const t = this.game.i18n.t.bind(this.game.i18n)
    let session
    let songs
    try {
      session = await this.localLibrarySession()
      const response = await fetch('/api/library/editable', {
        headers: { 'X-TMN-Token': session.local.token },
        cache: 'no-store',
      })
      if (!response.ok) throw new Error(t('library.editor.error'))
      songs = (await response.json()).songs || []
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
    const selectedIds = new Set()
    this.game.menu_screen.showLibraryEditor(songs)
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
        action.key.toLocaleLowerCase() === 'e'
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

  async confirmLibraryReset () {
    this.game.menu_screen.showResetMenu()
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
    if (!await this.confirmLibraryReset()) {
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
        .filter(song => !this.isStarterSong(song))
      const resetResponse = await fetch('/api/library/reset', {
        method: 'POST',
        headers,
        body: JSON.stringify({ confirm: 'RESTORE_STARTER_LIBRARY' }),
      })
      const result = await resetResponse.json().catch(() => ({}))
      if (resetResponse.status === 409) {
        throw new Error(t('library.reset.busy'))
      }
      if (!resetResponse.ok) {
        throw new Error(result.error || t('library.reset.error'))
      }

      this.clearSongClientState(addedSongs, { clearAllScores: true })
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
      this.game.menu_screen.setImportHint('menu.importHint')
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
            this.toggleDemoMode()
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
