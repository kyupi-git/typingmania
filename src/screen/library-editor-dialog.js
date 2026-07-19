import { Box, Group, Txt } from '../graphics/elements.js'
import { CENTER } from '../graphics/styles.js'
import {
  Black,
  BtnBorder,
  Gray,
  SongFont,
  UIColor,
  UIFont,
  White,
} from './0-common.js'

export const LIBRARY_EDITOR_TOGGLE_CODE = 'LibraryEditorToggle'
export const LIBRARY_EDITOR_CONFIRM_CODE = 'LibraryEditorConfirm'

const VISIBLE_ROWS = 8
const ROW_HEIGHT = 66
const ROW_GAP = 8
const WHEEL_THRESHOLD = 32

function dispatchKey (key, code = '') {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, code }))
}

export default class LibraryEditorDialog {
  constructor (i18n) {
    this.i18n = i18n
    this.songs = []
    this.selectedIds = new Set()
    this.cursor = 0
    this.offset = 0
    this.wheelDelta = 0
    this.rows = []
    this.rowBackgrounds = []
    this.rowMarkers = []
    this.rowTitles = []
    this.rowArtists = []

    for (let position = 0; position < VISIBLE_ROWS; position++) {
      const row = Group(
        500,
        235 + position * (ROW_HEIGHT + ROW_GAP),
        920,
        ROW_HEIGHT,
        [
          this.rowBackgrounds[position] = Box(0, 0, 920, ROW_HEIGHT)
            .stroke(BtnBorder)
            .radius(8),
          this.rowMarkers[position] = Txt(18, 0, 54, ROW_HEIGHT)
            .font(UIFont.size(28))
            .color(White)
            .align(CENTER),
          this.rowTitles[position] = Txt(82, 6, 570, 31)
            .font(SongFont.size(25))
            .color(White)
            .noOverflow(),
          this.rowArtists[position] = Txt(82, 37, 710, 22)
            .font(SongFont.size(17))
            .color(Gray)
            .noOverflow(),
          Txt(815, 0, 85, ROW_HEIGHT)
            .text('Space')
            .font(UIFont.size(15))
            .color(Gray)
            .align(CENTER),
        ],
      )
      row.el.style.cursor = 'pointer'
      row.el.setAttribute('role', 'checkbox')
      row.el.addEventListener('click', () => {
        const index = this.offset + position
        if (index >= this.songs.length) return
        dispatchKey(String(index), LIBRARY_EDITOR_TOGGLE_CODE)
      })
      this.rows.push(row)
    }

    this.group = Group(0, 0, 1920, 1080, [
      this.overlay = Box(0, 0, 1920, 1080).fill(Black),
      Box(390, 75, 1140, 930).fill(UIColor).stroke(BtnBorder).radius(14),
      this.title = Txt(460, 105, 1000, 54)
        .font(UIFont.size(40))
        .color(White)
        .align(CENTER),
      this.summary = Txt(470, 168, 980, 36)
        .font(UIFont.size(21))
        .color(Gray)
        .align(CENTER),
      ...this.rows,
      this.empty = Txt(500, 470, 920, 70)
        .font(UIFont.size(30))
        .color(Gray)
        .align(CENTER),
      this.hint = Txt(460, 840, 1000, 34)
        .font(UIFont.size(19))
        .color(Gray)
        .align(CENTER),
      this.deleteButton = Group(610, 895, 330, 68, [
        this.deleteBackground = Box(0, 0, 330, 68)
          .fill(UIColor)
          .stroke(BtnBorder)
          .radius(8),
        this.deleteLabel = Txt(12, 0, 306, 68)
          .font(UIFont.size(24))
          .color(White)
          .align(CENTER),
      ]),
      this.closeButton = Group(980, 895, 330, 68, [
        Box(0, 0, 330, 68).fill(UIColor).stroke(BtnBorder).radius(8),
        this.closeLabel = Txt(12, 0, 306, 68)
          .font(UIFont.size(24))
          .color(White)
          .align(CENTER),
      ]),
      this.confirmGroup = Group(0, 0, 1920, 1080, [
        this.confirmOverlay = Box(0, 0, 1920, 1080).fill(Black),
        Box(500, 300, 920, 430).fill(UIColor).stroke(BtnBorder).radius(14),
        this.confirmTitle = Txt(560, 345, 800, 58)
          .font(UIFont.size(40))
          .color(White)
          .align(CENTER),
        this.confirmDetail = Txt(580, 425, 760, 100)
          .font(UIFont.size(25).line(38))
          .color(White)
          .align(CENTER)
          .wrap(),
        this.confirmHint = Txt(580, 540, 760, 34)
          .font(UIFont.size(20))
          .color(Gray)
          .align(CENTER),
        this.confirmButton = Group(610, 610, 310, 68, [
          Box(0, 0, 310, 68).fill(UIColor).stroke(BtnBorder).radius(8),
          this.confirmButtonLabel = Txt(10, 0, 290, 68)
            .font(UIFont.size(24))
            .color(White)
            .align(CENTER),
        ]),
        this.confirmCancelButton = Group(1000, 610, 310, 68, [
          Box(0, 0, 310, 68).fill(UIColor).stroke(BtnBorder).radius(8),
          this.confirmCancelLabel = Txt(10, 0, 290, 68)
            .font(UIFont.size(24))
            .color(White)
            .align(CENTER),
        ]),
      ]).hide(),
    ]).hide()

    this.group.el.setAttribute('role', 'dialog')
    this.group.el.setAttribute('aria-modal', 'true')
    this.overlay.el.style.opacity = '0.8'
    this.overlay.el.style.cursor = 'pointer'
    this.overlay.el.addEventListener('click', () => dispatchKey('Escape'))
    this.closeButton.el.style.cursor = 'pointer'
    this.closeButton.el.setAttribute('role', 'button')
    this.closeButton.el.addEventListener('click', () => dispatchKey('Escape'))
    this.deleteButton.el.style.cursor = 'pointer'
    this.deleteButton.el.setAttribute('role', 'button')
    this.deleteButton.el.addEventListener('click', () => dispatchKey('Delete'))
    this.confirmOverlay.el.style.opacity = '0.84'
    this.confirmCancelButton.el.style.cursor = 'pointer'
    this.confirmCancelButton.el.setAttribute('role', 'button')
    this.confirmCancelButton.el.addEventListener('click', () => (
      dispatchKey('Escape')
    ))
    this.confirmButton.el.style.cursor = 'pointer'
    this.confirmButton.el.setAttribute('role', 'button')
    this.confirmButton.el.addEventListener('click', () => (
      dispatchKey('Enter', LIBRARY_EDITOR_CONFIRM_CODE)
    ))
    this.group.el.addEventListener('wheel', event => {
      event.preventDefault()
      event.stopPropagation()
      this.wheelDelta += event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 800 : 1)
      if (Math.abs(this.wheelDelta) < WHEEL_THRESHOLD) return
      const key = this.wheelDelta > 0 ? 'ArrowDown' : 'ArrowUp'
      this.wheelDelta = 0
      dispatchKey(key)
    }, { passive: false })
    this.setLocale()
  }

  setLocale () {
    const t = this.i18n.t.bind(this.i18n)
    this.title.text(t('library.editor.title'))
    this.empty.text(t('library.editor.empty'))
    this.hint.text(t('library.editor.hint'))
    this.closeLabel.text(t('library.editor.close'))
    this.confirmTitle.text(t('library.editor.confirmTitle'))
    this.confirmHint.text(t('library.editor.confirmHint'))
    this.confirmButtonLabel.text(t('library.editor.confirmAction'))
    this.confirmCancelLabel.text(t('library.editor.cancelAction'))
    this.group.el.setAttribute('aria-label', t('library.editor.title'))
    this.closeButton.el.setAttribute('aria-label', t('library.editor.close'))
    this.confirmButton.el.setAttribute(
      'aria-label',
      t('library.editor.confirmAction'),
    )
    this.render()
  }

  show (songs) {
    this.songs = Array.isArray(songs) ? songs : []
    this.selectedIds.clear()
    this.cursor = 0
    this.offset = 0
    this.hideConfirmation()
    this.render()
    this.group.show()
  }

  hide () {
    this.group.hide()
    this.hideConfirmation()
  }

  setCursor (index) {
    this.cursor = Math.max(0, Math.min(this.songs.length - 1, index))
    if (this.cursor < this.offset) this.offset = this.cursor
    if (this.cursor >= this.offset + VISIBLE_ROWS) {
      this.offset = this.cursor - VISIBLE_ROWS + 1
    }
    this.render()
  }

  setSelectedIds (ids) {
    this.selectedIds = new Set(ids)
    this.render()
  }

  showConfirmation (count) {
    this.confirmDetail.text(this.i18n.t('library.editor.confirmDetail', {
      count,
    }))
    this.confirmGroup.show()
  }

  hideConfirmation () {
    this.confirmGroup.hide()
  }

  render () {
    const t = this.i18n.t.bind(this.i18n)
    this.summary.text(t('library.editor.summary', {
      selected: this.selectedIds.size,
      total: this.songs.length,
    }))
    this.deleteLabel.text(t('library.editor.deleteSelected', {
      count: this.selectedIds.size,
    }))
    this.deleteBackground.el.style.backgroundColor = this.selectedIds.size
      ? 'rgba(162, 56, 65, 0.9)'
      : 'rgba(70, 70, 70, 0.72)'
    this.deleteButton.el.setAttribute(
      'aria-disabled',
      String(this.selectedIds.size === 0),
    )
    this.empty.el.style.display = this.songs.length ? 'none' : 'block'
    for (let position = 0; position < VISIBLE_ROWS; position++) {
      const index = this.offset + position
      const song = this.songs[index]
      const row = this.rows[position]
      if (!song) {
        row.hide()
        continue
      }
      row.show()
      const selected = this.selectedIds.has(song.id)
      const focused = index === this.cursor
      this.rowMarkers[position].text(selected ? '✓' : '')
      this.rowTitles[position].text(song.title || t('common.untitled'))
      this.rowArtists[position].text([
        song.artist,
        String(song.language || '').toLocaleUpperCase(),
      ].filter(Boolean).join(' · '))
      this.rowBackgrounds[position].el.style.backgroundColor = selected
        ? 'rgba(156, 58, 72, 0.82)'
        : focused
          ? 'rgba(255, 255, 255, 0.24)'
          : 'rgba(43, 49, 61, 0.88)'
      row.el.setAttribute('aria-checked', String(selected))
      row.el.setAttribute(
        'aria-label',
        `${song.title || t('common.untitled')} · ${song.artist || ''}`,
      )
    }
  }
}
