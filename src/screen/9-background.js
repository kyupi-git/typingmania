import Screen from '../graphics/screen.js'
import { Box, Group, Img, Txt } from '../graphics/elements.js'
import { Black, BtnBorder, Gray, UIColor, UIFont, White } from './0-common.js'
import { CENTER } from '../graphics/styles.js'
import {
  artworkObjectPosition,
  DEFAULT_ARTWORK_POSITION,
} from '../graphics/artwork-layout.js'
import { APP_NAME } from '../app-meta.js'

export default class BackgroundScreen extends Screen {
  constructor (viewport, i18n) {
    super(viewport, 0, 0, 1920, 1080)
    this.i18n = i18n
    this.create(1, [
      this.game_background = Img(0, 0, 1920, 1080).layer(1).hide(),
      this.song_bg_container = Group(0, 0, 1920, 1080).layer(2),
      this.song_background = Img(0, 0, 1920, 1080).layer(3).fit('cover').hide(),
      this.song_album_frame = Group(1540, 75, 320, 320, [
        this.song_album_cover = Img(9, 9, 302, 302).fit('cover'),
      ]).layer(4).hide(),
      this.menu_ui = Img(0, 0, 1920, 1080).layer(4).hide(),
      this.song_ui = Img(0, 0, 1920, 1080).layer(5).hide(),
      this.result_ui = Img(0, 0, 1920, 1080).layer(6).hide(),
      Txt(30, 1044, 420, 24)
        .text(APP_NAME)
        .color(Gray)
        .font(UIFont.size(18))
        .layer(9),

      // Volume bar
      this.volume_bar = Group(0, 0, 1920, 1080, [
        Box(0, 0, 330, 60).layer(1).fill(UIColor),
        this.volume_down_key = Txt(113, 18, 78, 24).layer(2).radius(5).fill(Black).stroke(BtnBorder).align(CENTER).font(UIFont.size(18)).color(White),
        this.volume_up_key = Txt(262, 18, 53, 24).layer(2).radius(5).fill(Black).stroke(BtnBorder).align(CENTER).font(UIFont.size(18)).color(White),
        this.volume_title = Txt(15, 15, 83, 30).layer(2).font(UIFont.size(24)).color(White).layer(2),
        this.volume_label = Txt(199, 15, 56, 30).font(UIFont.size(24)).align('center').color(White).layer(2),
      ]).layer(10).hide(),
    ])
    this.backgroundRequest = 0
    this.currentAlbumUrl = ''
    this.song_album_frame.el.style.padding = '0'
    this.song_album_frame.el.style.border = '2px solid rgba(255,255,255,.72)'
    this.song_album_frame.el.style.borderRadius = '18px'
    this.song_album_frame.el.style.background = 'rgba(7,17,31,.72)'
    this.song_album_frame.el.style.boxShadow =
      '0 18px 54px rgba(0,0,0,.56), 0 0 24px rgba(105,222,255,.22)'
    this.song_album_frame.el.style.overflow = 'hidden'
    this.song_album_cover.el.style.borderRadius = '10px'
    this.setAlbumLayout(false)
    this.setLocale()
  }

  setAlbumLayout (menuMode) {
    const frame = menuMode
      ? { x: 35, y: 65, size: 304, inset: 9 }
      : { x: 1540, y: 75, size: 320, inset: 9 }
    const coverSize = frame.size - (frame.inset * 2)
    Object.assign(this.song_album_frame.el.style, {
      left: `${frame.x}px`,
      top: `${frame.y}px`,
      width: `${frame.size}px`,
      height: `${frame.size}px`,
    })
    Object.assign(this.song_album_cover.el.style, {
      left: `${frame.inset}px`,
      top: `${frame.inset}px`,
      width: `${coverSize}px`,
      height: `${coverSize}px`,
    })
  }

  setLocale () {
    this.volume_down_key.text(this.i18n.t('key.pageDown'))
    this.volume_up_key.text(this.i18n.t('key.pageUp'))
    this.volume_title.text(this.i18n.t('common.volume'))
  }

  loadAssets (packed_file) {
    this.game_background.url(packed_file.getFileAsURL('ui/background.png'))
    this.menu_ui.url(packed_file.getFileAsURL('ui/menu-ui.svg'))
    this.song_ui.url(packed_file.getFileAsURL('ui/song-ui.svg'))
    this.result_ui.url(packed_file.getFileAsURL('ui/result-ui.svg'))

    this.game_background.show()
  }

  showSongBackground (
    url = false,
    albumUrl = undefined,
    { preferUpperPortrait = false } = {},
  ) {
    if (url) {
      const request = ++this.backgroundRequest
      const updatePosition = () => {
        if (request !== this.backgroundRequest) return
        this.song_background.objectPosition(artworkObjectPosition(
          this.song_background.el.naturalWidth,
          this.song_background.el.naturalHeight,
          { preferUpperPortrait },
        ))
      }
      this.song_background.objectPosition(DEFAULT_ARTWORK_POSITION)
      this.song_background.el.addEventListener('load', updatePosition, {
        once: true,
      })
      this.song_background.url(url)
      if (this.song_background.el.complete) updatePosition()
    }
    if (albumUrl !== undefined) {
      this.currentAlbumUrl = albumUrl || ''
      if (this.currentAlbumUrl) {
        this.song_album_cover.url(this.currentAlbumUrl)
      }
    }
    this.song_background.fade('0.5s')
    this.song_background.show()
    if (this.currentAlbumUrl) {
      this.song_album_frame.show()
    } else {
      this.song_album_frame.hide()
    }
  }

  hideSongBackground () {
    this.backgroundRequest++
    this.song_background.fade('0.5s')
    this.song_background.hide()
    this.song_album_frame.hide()
  }

  showMenuUI (show) {
    this.setAlbumLayout(show)
    if (show) {
      this.menu_ui.show()
    } else {
      this.menu_ui.hide()
    }
  }

  showSongUI (show) {
    if (show) {
      this.song_ui.show()
    } else {
      this.song_ui.hide()
    }
  }

  showResultUI (show) {
    if (show) {
      this.result_ui.show()
    } else {
      this.result_ui.hide()
    }
  }

  getSongBackgroundContainer () {
    return this.song_bg_container.el
  }
}
