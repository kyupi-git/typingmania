import FileLoader from '../../lib/fileloader.js'
import PackedFile from '../../lib/packedfile.js'
import FontLoader from '../../lib/fontloader.js'

export default class LoadingController {
  constructor (game) {
    this.game = game
  }

  // noinspection JSUnusedAssignment
  async run () {
    const t = this.game.i18n.t.bind(this.game.i18n)
    // Show all scene
    this.game.background_screen.show()
    this.game.loading_screen.show()

    // Load assets file
    this.game.loading_screen.setMainText(t('loading.loading'))
    this.game.loading_screen.setSubText(t('loading.assets', { percent: 0 }))

    let assets, packed_file
    let is_error = false

    try {
      // Load with progress report
      assets = await FileLoader.load(this.game.config.assets_url, (progress) => {
        if (!is_error) {
          const p = Math.floor(progress * 100)
          this.game.loading_screen.setSubText(t('loading.assets', { percent: p }))
        }
      })
    } catch (error) {
      // Handle Assets error
      this.game.loading_screen.setMainText(t('loading.error'))
      is_error = true
      switch (error) {
        case 'NETWORK_ERROR':
          this.game.loading_screen.setSubText(t('loading.assetsNetwork'))
          return false
        case 'NOT_FOUND':
          this.game.loading_screen.setSubText(t('loading.assetsMissing'))
          return false
        case 'HTTP_ERROR':
        default:
          this.game.loading_screen.setSubText(t('loading.assetsError'))
          return false
      }
    }

    // Unpack assets
    this.game.loading_screen.setSubText(t('loading.unpacking'))

    try {
      packed_file = new PackedFile()
      packed_file.unpackFromBuffer(assets)
    } catch (error) {
      console.error(error)
      this.game.loading_screen.setMainText(t('loading.error'))
      this.game.loading_screen.setSubText(t('loading.assetsInvalid'))
      return false
    }

    // Set up UI Image
    this.game.loading_screen.setSubText(t('loading.ui'))
    this.game.background_screen.loadAssets(packed_file)

    // Set up Font
    this.game.loading_screen.setSubText(t('loading.fonts'))
    await FontLoader.load(packed_file.getFileAsURL('fonts/iosevka-etoile-500.woff2'), 'Iosevka Etoile', '500', 'normal')
    await FontLoader.load(packed_file.getFileAsURL('fonts/notojp-500.woff2'), 'Noto Sans CJK JP', '500', 'normal')
    await FontLoader.load(packed_file.getFileAsURL('fonts/opensans-700.woff2'), 'Open Sans', '700', 'normal')

    // Set up SFX
    this.game.loading_screen.setSubText(t('loading.sfx'))
    for (const name of ['decide', 'error', 'exit', 'intro', 'key', 'ready', 'select', 'select2', 'skip']) {
      await this.game.sfx.registerSfx(name, packed_file.getFileAsBuffer(`sfx/${name}.wav`))
    }

    // Load Song List
    this.game.loading_screen.setSubText(t('loading.songList', { percent: 0 }))
    let songJson
    try {
      // Load with progress report
      const songList = await FileLoader.load(this.game.config.songs_url, (progress) => {
        if (!is_error) {
          const p = Math.floor(progress * 100)
            this.game.loading_screen.setSubText(t('loading.songList', { percent: p }))
        }
      })
      songJson = JSON.parse(FileLoader.decode(songList))
    } catch (error) {
      is_error = true
      this.game.loading_screen.setMainText(t('loading.error'))
      switch (error) {
        case 'NETWORK_ERROR':
          this.game.loading_screen.setSubText(t('loading.songListNetwork'))
          return false
        case 'NOT_FOUND':
          this.game.loading_screen.setSubText(t('loading.songListMissing'))
          return false
        case 'HTTP_ERROR':
        default:
          this.game.loading_screen.setSubText(t('loading.songListError'))
          return false
      }
    }

    // Process song list
    this.game.loading_screen.setSubText(t('loading.songListProcessing'))
    this.game.songs.load(songJson)

    // Check if we are direct-loading any song
    const query_string = new URLSearchParams(window.location.search)
    const song_url = query_string.get('song')
    if (song_url !== null) {
      this.game.loading_screen.setSubText(t('loading.specifiedSong', { percent: 0 }))
      try {
        // Load with progress report
        const song_file = await FileLoader.load(song_url, (progress) => {
          if (!is_error) {
            const p = Math.floor(progress * 100)
            this.game.loading_screen.setSubText(t('loading.specifiedSong', { percent: p }))
          }
        })
        const song_blob = new Blob([song_file])
        const song_blob_url = URL.createObjectURL(song_blob)

        this.game.specified_song = song_blob_url
        this.game.specified_song_path = song_url
      } catch (error) {
        is_error = true
        this.game.loading_screen.setMainText(t('loading.error'))
        switch (error) {
          case 'NETWORK_ERROR':
            this.game.loading_screen.setSubText(t('loading.specifiedSongNetwork'))
            return false
          case 'NOT_FOUND':
            this.game.loading_screen.setSubText(t('loading.specifiedSongMissing'))
            return false
          case 'HTTP_ERROR':
          default:
            this.game.loading_screen.setSubText(t('loading.specifiedSongError'))
            return false
        }
      }
    }

    // Start sound from a direct key event to satisfy browser autoplay policy,
    // then allow transient sound failures to retry independently.
    let sound_ready = false
    let first_attempt = true
    while (!sound_ready) {
      this.game.loading_screen.setMainText(first_attempt ? t('loading.ready') : t('loading.soundNotReady'))
      this.game.loading_screen.setSubText(first_attempt ? t('loading.pressAnyKey') : t('loading.pressRetry'))

      let sound_system_promise
      await this.game.input.waitForAnyKey(() => {
        sound_system_promise = this.game.sound.initializeSound()
      })

      this.game.loading_screen.setMainText(t('loading.pleaseWait'))
      this.game.loading_screen.setSubText(t('loading.startingSound'))
      try {
        await sound_system_promise
        sound_ready = true
      } catch (error) {
        console.error('Unable to start the sound system.', error)
        first_attempt = false
      }
    }

    // Destroy assets buffer
    // Sfx are already decoded into AudioBuffer
    // Other media have been made into Blob URL
    packed_file.destroy()

    // Move to menu screen/controller
    this.game.loading_screen.hide()
    this.game.sfx.play('decide')
    return this.game.menu_controller
  }
}
