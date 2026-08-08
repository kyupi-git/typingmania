import { Box, Group, Txt } from '../graphics/elements.js'
import { CENTER } from '../graphics/styles.js'
import {
  Black,
  BtnBorder,
  Gray,
  UIColor,
  UIFont,
  White,
} from './0-common.js'

export const PLAY_STYLES = Object.freeze(['normal', 'simple', 'demo'])
export const PLAY_STYLE_PREFIX = 'PlayStyle:'

function dispatchStyle (style) {
  window.dispatchEvent(new KeyboardEvent('keydown', {
    key: `${PLAY_STYLE_PREFIX}${style}`,
    code: 'PlayStyle',
  }))
}

export default class PlayStyleDialog {
  constructor (i18n) {
    this.i18n = i18n
    this.selected = 0
    this.backgrounds = []
    this.markers = []
    this.labels = []
    this.details = []
    this.rows = PLAY_STYLES.map((style, index) => {
      const row = Group(610, 360 + index * 125, 700, 96, [
        this.backgrounds[index] = Box(0, 0, 700, 96)
          .fill(UIColor).stroke(BtnBorder).radius(9),
        this.markers[index] = Txt(22, 0, 54, 96)
          .font(UIFont.size(34)).color(White).align(CENTER),
        this.labels[index] = Txt(88, 12, 570, 38)
          .font(UIFont.size(27)).color(White).noOverflow(),
        this.details[index] = Txt(88, 52, 570, 30)
          .font(UIFont.size(17)).color(Gray).noOverflow(),
      ])
      row.el.style.cursor = 'pointer'
      row.el.setAttribute('role', 'radio')
      row.el.addEventListener('click', () => dispatchStyle(style))
      return row
    })
    this.group = Group(0, 0, 1920, 1080, [
      this.overlay = Box(0, 0, 1920, 1080).fill(Black),
      Box(510, 205, 900, 665).fill(UIColor).stroke(BtnBorder).radius(14),
      this.title = Txt(580, 250, 760, 58)
        .font(UIFont.size(40)).color(White).align(CENTER),
      this.subtitle = Txt(590, 305, 740, 34)
        .font(UIFont.size(20)).color(Gray).align(CENTER),
      ...this.rows,
      this.hint = Txt(580, 780, 760, 34)
        .font(UIFont.size(19)).color(Gray).align(CENTER),
    ]).hide()
    this.overlay.el.style.opacity = '0.76'
    this.overlay.el.style.cursor = 'pointer'
    this.overlay.el.addEventListener('click', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    this.group.el.setAttribute('role', 'dialog')
    this.group.el.setAttribute('aria-modal', 'true')
    this.setLocale()
  }

  setLocale () {
    const t = this.i18n.t.bind(this.i18n)
    this.title.text(t('playStyle.title'))
    this.subtitle.text(t('playStyle.subtitle'))
    this.hint.text(t('playStyle.hint'))
    for (let index = 0; index < PLAY_STYLES.length; index++) {
      const style = PLAY_STYLES[index]
      this.labels[index].text(t(`playStyle.${style}`))
      this.details[index].text(t(`playStyle.${style}Detail`))
      this.rows[index].el.setAttribute(
        'aria-label',
        t('common.labelWithHint', {
          label: t(`playStyle.${style}`),
          hint: t(`playStyle.${style}Detail`),
        }),
      )
    }
    this.group.el.setAttribute('aria-label', t('playStyle.title'))
  }

  show (style = 'normal') {
    this.setSelection(Math.max(0, PLAY_STYLES.indexOf(style)))
    this.group.show()
  }

  hide () {
    this.group.hide()
  }

  setSelection (index) {
    this.selected = Math.max(0, Math.min(PLAY_STYLES.length - 1, index))
    for (let position = 0; position < PLAY_STYLES.length; position++) {
      const selected = position === this.selected
      this.backgrounds[position].el.style.backgroundColor = selected
        ? 'rgba(86, 111, 176, .88)'
        : 'rgba(43, 49, 61, .9)'
      this.markers[position].text(selected ? '✓' : '')
      this.rows[position].el.setAttribute('aria-checked', String(selected))
    }
  }
}
