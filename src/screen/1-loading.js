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
      this.sub_text = Txt(0, 580, 1920, 60).color(White).font(UIFont.size(48)).align(CENTER),

      // Game mode banner
      this.game_mode_banner = Txt(0, 0, 1920, 45).font(UIFont.size(30)).align(CENTER).color(White)
    ])
  }

  setMainText (txt) {
    this.main_text.text(txt)
  }

  setSubText (txt) {
    this.sub_text.text(txt)
  }

  updateGameMode(mode) {
    this.current_mode = mode
    this.game_mode_banner.text(mode === 'normal' ? '' : this.i18n.t(`mode.banner.${mode}`))
  }

  setLocale () {
    this.updateGameMode(this.current_mode)
  }
}
