import Screen from '../graphics/screen.js'
import { Box, Group, ProgressBar, Txt } from '../graphics/elements.js'
import { Black, BtnBorder, Gray2, NumberFont, SongFont, UIColor, UIFont, White } from './0-common.js'
import { CENTER, RIGHT } from '../graphics/styles.js'
import KeyfallEffect from '../effects/keyfall.js'

export default class SongScreen extends Screen {
  constructor (viewport, i18n) {
    super(viewport, 0, 0, 1920, 1080)
    this.i18n = i18n
    this.current_mode = 'normal'
    this.create(100, [
      // Optional player-input feedback. It stays above the song background,
      // below status chrome, and clear of the lyric input area.
      this.keyfall_layer = Group(0, 0, 1920, 1080).layer(20),

      // Top Right Infobar
      Box(1670, 0, 250, 60).fill(UIColor).layer(121),
      this.abandon_key = Txt(1644, 18, 150, 24).layer(122).radius(5).fill(Black).stroke(BtnBorder).align(CENTER).font(UIFont.size(16)).color(White),
      this.abandon_label = Txt(1805, 15, 100, 30).layer(122).color(White).font(UIFont.size(20)).noOverflow(),

      // Top Score Bar
      this.score_label = Txt(340, 756, 160, 40).color(White).font(UIFont.size(30)),
      this.max_combo_label = Txt(880, 756, 200, 40).color(White).font(UIFont.size(30)),
      this.completed_label = Txt(1210, 756, 225, 40).color(White).font(UIFont.size(26)),
      this.skipped_label = Txt(1545, 756, 210, 40).color(White).font(UIFont.size(26)),

      this.ui_score = Txt(460, 753, 340, 40).color(White).font(NumberFont.size(40)).align(RIGHT),
      this.ui_max_combo = Txt(1080, 754, 100, 40).color(White).font(NumberFont.size(40)),
      this.ui_completed = Txt(1440, 754, 100, 40).color(White).font(NumberFont.size(40)),
      this.ui_skipped = Txt(1760, 754, 100, 40).color(White).font(NumberFont.size(40)),

      // Bottom Score Bar
      this.typing_speed_label = Txt(325, 1039, 175, 24).color(White).font(UIFont.size(24)).align(RIGHT),
      this.per_minute_label = Txt(640, 1039, 120, 24).color(White).font(UIFont.size(24)),
      this.correct_label = Txt(675, 1039, 175, 24).color(White).font(UIFont.size(24)).align(RIGHT),
      this.missed_label = Txt(975, 1039, 175, 24).color(White).font(UIFont.size(24)).align(RIGHT),
      this.accuracy_label = Txt(1275, 1039, 175, 24).color(White).font(UIFont.size(24)).align(RIGHT),
      this.class_label = Txt(1650, 1039, 100, 24).color(White).font(UIFont.size(24)).align(RIGHT),

      this.ui_typing_speed = Txt(540, 1025, 100, 40).color(White).font(NumberFont.size(40)),
      this.ui_correct = Txt(890, 1025, 100, 40).color(White).font(NumberFont.size(40)),
      this.ui_missed = Txt(1190, 1025, 100, 40).color(White).font(NumberFont.size(40)),
      this.ui_accuracy = Txt(1490, 1025, 100, 40).color(White).font(NumberFont.size(40)),
      this.ui_class = Txt(1790, 1025, 100, 40).color(White).font(NumberFont.size(40)),

      // Duration & Progress
      this.total_label = Txt(100, 678, 220, 30).color(White).font(UIFont.size(24)).align(RIGHT),
      this.line_label = Txt(100, 718, 220, 30).color(White).font(UIFont.size(24)).align(RIGHT),
      this.ui_progress_all = ProgressBar(340, 690, 1510, 10).fill(Gray2).completed(White),
      this.ui_progress_int = ProgressBar(340, 730, 1510, 10).fill(Gray2).completed(White),

      this.ui_time = Txt(1580, 630, 270, 45).color(White).font(NumberFont.size(45)).align(RIGHT),

      // Typing
      this.ui_typing_next = Txt(60, 880, 140, 110).color(White).font(SongFont.size(110)),
      this.ui_typing_line = Txt(200, 930, 1720, 60).color(White).font(SongFont.size(60)).noOverflow(),
      this.ui_ruby = Group(270, 820, 1650, 80),

      // Combo
      this.ui_combo_label = Txt(125, 767, 85, 20).color(White).font(UIFont.size(24)).align(RIGHT),
      this.ui_combo = Txt(30, 750, 95, 40).color(White).font(NumberFont.size(40)).align(RIGHT),

      // Game mode banner
      this.game_mode_banner = Txt(0, 0, 1920, 45).font(UIFont.size(30)).align(CENTER).color(White),

      // A short media-paused lead-in protects songs whose first lyric starts
      // immediately without changing any song timestamps.
      this.lead_in_group = Group(0, 0, 1920, 750, [
        this.lead_in_overlay = Box(0, 0, 1920, 750).fill(Black),
        this.lead_in_panel = Box(710, 360, 500, 270)
          .fill(UIColor)
          .stroke(BtnBorder)
          .radius(24),
        this.lead_in_label = Txt(760, 390, 400, 58)
          .font(UIFont.size(38))
          .align(CENTER)
          .color(White),
        this.lead_in_count = Txt(760, 450, 400, 145)
          .font(NumberFont.size(112))
          .align(CENTER)
          .color(White),
      ]).layer(125).hide(),
    ])

    this.keyfall = new KeyfallEffect(this.keyfall_layer.el)
    // The line is width-fitted before display. Keep vertical overflow visible
    // so Latin descenders are not cut off by the ruby group's 80 px box.
    this.ui_ruby.el.style.overflow = 'visible'
    this.lead_in_overlay.el.style.opacity = '0.32'
    this.lead_in_panel.el.style.background = 'rgba(8, 18, 34, .88)'
    this.lead_in_panel.el.style.boxShadow =
      '0 22px 70px rgba(0,0,0,.5), 0 0 36px rgba(105,222,255,.2)'
    this.lead_in_count.el.style.willChange = 'transform, opacity'

    this.setLocale()
  }

  setKeyEffectsEnabled (enabled) {
    this.keyfall.setEnabled(enabled)
  }

  setKeyEffectsReducedMotion (reducedMotion) {
    this.keyfall.setReducedMotion(reducedMotion)
  }

  beginKeyEffects (lines = []) {
    this.keyfall.begin(lines)
  }

  updateKeyEffects (currentTime) {
    this.keyfall.update(currentTime)
  }

  showKeyFeedback (key, correct, context) {
    return this.keyfall.feedback(key, correct, context)
  }

  finishKeyEffectLine (lineId, currentTime, missed) {
    this.keyfall.finishLine(lineId, currentTime, missed)
  }

  endKeyEffects () {
    this.keyfall.end()
  }

  playLeadIn (durationMs, { reducedMotion = false } = {}) {
    const duration = Math.max(0, Number(durationMs) || 0)
    if (!duration) return Promise.resolve()
    this.lead_in_group.show()
    this.lead_in_label.text(this.i18n.t('song.getReady'))
    const startedAt = performance.now()
    const stepDuration = duration / 3

    return new Promise(resolve => {
      const update = now => {
        const elapsed = Math.min(duration, now - startedAt)
        const remaining = Math.max(0, duration - elapsed)
        const count = Math.max(1, Math.ceil(remaining / stepDuration))
        const stepProgress = (elapsed % stepDuration) / stepDuration
        this.lead_in_count.text(String(count))
        this.lead_in_count.el.style.opacity =
          String(1 - stepProgress * 0.42)
        this.lead_in_count.el.style.transform = reducedMotion
          ? 'none'
          : `scale(${1 + stepProgress * 0.16})`
        if (elapsed < duration) {
          requestAnimationFrame(update)
          return
        }
        this.lead_in_group.hide()
        this.lead_in_count.text('')
        this.lead_in_count.el.style.opacity = '1'
        this.lead_in_count.el.style.transform = 'none'
        resolve()
      }
      requestAnimationFrame(update)
    })
  }

  setTypingText (text, blind_mode = false) {
    this.ui_typing_next.text(text.substr(0, 1))
    if (!blind_mode) {
      const remaining = text.substr(1)
      const fontSize = remaining.length > 62
        ? 40
        : remaining.length > 48
          ? 48
          : remaining.length > 36
            ? 54
            : 60
      this.ui_typing_line.font(SongFont.size(fontSize)).text(remaining)
    }
  }

  setTypingRuby (element) {
    // Clear existing ruby
    this.clearTypingRuby()

    // Append current ruby
    if (element) {
      element.style.transformOrigin = 'left bottom'
      element.style.maxWidth = 'none'
      this.ui_ruby.el.appendChild(element)
      const fit = () => {
        const contentWidth = Number(element.scrollWidth) || 0
        const availableWidth = this.ui_ruby.width
        const scale = contentWidth > availableWidth
          ? availableWidth / contentWidth
          : 1
        element.style.transform = scale < 1 ? `scale(${scale})` : 'none'
      }
      requestAnimationFrame(fit)
    }
  }

  clearTypingRuby () {
    while (this.ui_ruby.el.firstChild) {
      this.ui_ruby.el.removeChild(this.ui_ruby.el.lastChild)
    }
  }

  updateGameMode (mode) {
    this.current_mode = mode
    this.game_mode_banner.text(mode === 'normal' ? '' : this.i18n.t(`mode.banner.${mode}`))
  }

  setLocale () {
    const t = this.i18n.t.bind(this.i18n)
    this.abandon_key.text(`${t('key.escape')} / ${t('key.backspace')}`)
    this.abandon_label.text(t('song.abandon'))
    this.score_label.text(t('song.score'))
    this.max_combo_label.text(t('song.maxCombo'))
    this.completed_label.text(t('song.completed'))
    this.skipped_label.text(t('song.skipped'))
    this.typing_speed_label.text(t('song.typingSpeed'))
    this.per_minute_label.text(t('song.perMinute'))
    this.correct_label.text(t('song.correct'))
    this.missed_label.text(t('song.missed'))
    this.accuracy_label.text(t('song.accuracy'))
    this.class_label.text(t('song.class'))
    this.total_label.text(t('song.total'))
    this.line_label.text(t('song.line'))
    this.ui_combo_label.text(t('song.combo'))
    this.updateGameMode(this.current_mode)
  }

}
