import Screen from '../graphics/screen.js'
import { Txt } from '../graphics/elements.js'
import { UIFont, White } from './0-common.js'
import { CENTER } from '../graphics/styles.js'

export default class LoadingScreen extends Screen {
  constructor (viewport, i18n) {
    super(viewport, 0, 0, 1920, 1080)
    this.i18n = i18n
    this.current_mode = 'normal'
    this.create(100, [
      this.main_text = Txt(0, 420, 1920, 120).color(White).font(UIFont.size(96)).align(CENTER),
      this.sub_text = Txt(160, 565, 1600, 300)
        .color(White)
        .font(UIFont.size(42).line(52))
        .align(CENTER)
        .wrap(),

      // Game mode banner
      this.game_mode_banner = Txt(0, 0, 1920, 45).font(UIFont.size(30)).align(CENTER).color(White)
    ])
  }

  setMainText (txt) {
    this.main_text.text(txt)
  }

  setSubText (txt) {
    const value = String(txt || '')
    const lines = value.split('\n').length
    const fontSize = lines >= 6 || value.length > 360
      ? 24
      : lines >= 4 || value.length > 220
        ? 30
        : 42
    this.sub_text.font(UIFont.size(fontSize).line(Math.round(fontSize * 1.28)))
    this.sub_text.el.style.whiteSpace = 'pre-line'
    this.sub_text.text(value)
  }

  updateGameMode(mode) {
    this.current_mode = mode
    this.game_mode_banner.text(mode === 'normal' ? '' : this.i18n.t(`mode.banner.${mode}`))
  }

  setLocale () {
    this.updateGameMode(this.current_mode)
  }
}
