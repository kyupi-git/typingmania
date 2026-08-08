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
export const LIBRARY_EDITOR_INCOMPLETE_CODE = 'LibraryEditorIncomplete'
export const LIBRARY_EDITOR_DEDUPE_CODE = 'LibraryEditorDedupe'
export const LIBRARY_EDITOR_REFRESH_CODE = 'LibraryEditorRefresh'
export const LIBRARY_EDITOR_SORT_PREFIX = 'LibraryEditorSort:'

const VISIBLE_ROWS = 8
const ROW_HEIGHT = 62
const ROW_GAP = 5
const WHEEL_THRESHOLD = 32
const COMPLETENESS_FIELDS = [
  'pronunciation', 'lyrics', 'identity', 'origin', 'album', 'poster',
]
const SORT_MODES = ['title', 'source', 'completeness']

function dispatchKey (key, code = '') {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, code }))
}

function sourceLabel (i18n, source) {
  const key = `library.source.${source || 'unknown'}`
  const value = i18n.t(key)
  return value === key ? source || i18n.t('common.unknown') : value
}

function artistResolutionPending (song) {
  return song?.source?.artist_resolution?.status === 'pending' ||
    song?.completeness?.artistStatus === 'pending'
}

export default class LibraryEditorDialog {
  constructor (i18n) {
    this.i18n = i18n
    this.mode = 'editor'
    this.songs = []
    this.selectedIds = new Set()
    this.cursor = 0
    this.offset = 0
    this.wheelDelta = 0
    this.sortMode = 'title'
    this.sortDirection = 'asc'
    this.rows = []
    this.rowBackgrounds = []
    this.rowMarkers = []
    this.rowTitles = []
    this.rowArtists = []
    this.rowSources = []
    this.rowDirectories = []
    this.rowStatuses = []
    this.headerLabels = []
    this.sortButtons = []
    this.sortLabels = []

    for (let position = 0; position < VISIBLE_ROWS; position++) {
      const statuses = []
      const row = Group(
        250,
        315 + position * (ROW_HEIGHT + ROW_GAP),
        1420,
        ROW_HEIGHT,
        [
          this.rowBackgrounds[position] = Box(0, 0, 1420, ROW_HEIGHT)
            .stroke(BtnBorder).radius(7),
          this.rowMarkers[position] = Txt(8, 0, 44, ROW_HEIGHT)
            .font(UIFont.size(25)).color(White).align(CENTER),
          this.rowTitles[position] = Txt(58, 5, 320, 29)
            .font(SongFont.size(22)).color(White).noOverflow(),
          this.rowArtists[position] = Txt(58, 34, 320, 23)
            .font(SongFont.size(15)).color(Gray).noOverflow(),
          this.rowSources[position] = Txt(390, 0, 125, ROW_HEIGHT)
            .font(UIFont.size(16)).color(White).align(CENTER).noOverflow(),
          this.rowDirectories[position] = Txt(525, 0, 220, ROW_HEIGHT)
            .font(UIFont.size(14)).color(Gray).align(CENTER).noOverflow(),
          ...COMPLETENESS_FIELDS.map((field, fieldIndex) => (
            statuses[fieldIndex] = Txt(
              760 + fieldIndex * 100,
              0,
              90,
              ROW_HEIGHT,
            ).font(UIFont.size(23)).color(White).align(CENTER)
          )),
        ],
      )
      this.rowStatuses[position] = statuses
      row.el.style.cursor = 'pointer'
      row.el.setAttribute('role', 'checkbox')
      row.el.addEventListener('click', () => {
        const index = this.offset + position
        if (index >= this.songs.length) return
        dispatchKey(String(index), LIBRARY_EDITOR_TOGGLE_CODE)
      })
      this.rows.push(row)
    }

    const header = Group(250, 270, 1420, 38, [
      Txt(8, 0, 44, 38).text('✓').font(UIFont.size(16)).color(Gray).align(CENTER),
      this.headerLabels[0] = Txt(58, 0, 320, 38).font(UIFont.size(15)).color(Gray),
      this.headerLabels[1] = Txt(390, 0, 125, 38).font(UIFont.size(15)).color(Gray).align(CENTER),
      this.headerLabels[2] = Txt(525, 0, 220, 38).font(UIFont.size(15)).color(Gray).align(CENTER),
      ...COMPLETENESS_FIELDS.map((field, fieldIndex) => (
        this.headerLabels[fieldIndex + 3] = Txt(
          760 + fieldIndex * 100,
          0,
          90,
          38,
        ).font(UIFont.size(14)).color(Gray).align(CENTER).noOverflow()
      )),
    ])

    for (let index = 0; index < SORT_MODES.length; index++) {
      const width = 180
      const button = Group(250 + index * 188, 195, width, 54, [
        Box(0, 0, width, 54).fill(UIColor).stroke(BtnBorder).radius(8),
        this.sortLabels[index] = Txt(8, 0, width - 16, 54)
          .font(UIFont.size(14)).color(White).align(CENTER).noOverflow(),
      ])
      button.el.style.cursor = 'pointer'
      button.el.setAttribute('role', 'button')
      button.el.addEventListener('click', () => dispatchKey(
        `${LIBRARY_EDITOR_SORT_PREFIX}${SORT_MODES[index]}`,
        'LibraryEditorSort',
      ))
      this.sortButtons.push(button)
    }

    this.group = Group(0, 0, 1920, 1080, [
      this.overlay = Box(0, 0, 1920, 1080).fill(Black),
      Box(180, 65, 1560, 950).fill(UIColor).stroke(BtnBorder).radius(14),
      this.title = Txt(250, 95, 1420, 52)
        .font(UIFont.size(38)).color(White).align(CENTER),
      this.summary = Txt(260, 147, 1400, 36)
        .font(UIFont.size(19)).color(Gray).align(CENTER),
      ...this.sortButtons,
      this.refreshButton = Group(814, 195, 220, 54, [
        Box(0, 0, 220, 54).fill(UIColor).stroke(BtnBorder).radius(8),
        this.refreshLabel = Txt(8, 0, 204, 54)
          .font(UIFont.size(15)).color(White).align(CENTER).noOverflow(),
      ]),
      this.dedupeButton = Group(1042, 195, 230, 54, [
        Box(0, 0, 230, 54).fill(UIColor).stroke(BtnBorder).radius(8),
        this.dedupeLabel = Txt(9, 0, 212, 54)
          .font(UIFont.size(15)).color(White).align(CENTER).noOverflow(),
      ]),
      this.incompleteButton = Group(1280, 195, 390, 54, [
        Box(0, 0, 390, 54).fill(UIColor).stroke(BtnBorder).radius(8),
        this.incompleteLabel = Txt(10, 0, 370, 54)
          .font(UIFont.size(15)).color(White).align(CENTER).noOverflow(),
      ]),
      header,
      ...this.rows,
      this.empty = Txt(250, 490, 1420, 70)
        .font(UIFont.size(30)).color(Gray).align(CENTER),
      this.legend = Txt(250, 850, 1420, 24)
        .font(UIFont.size(15)).color(Gray).align(CENTER).noOverflow(),
      this.hint = Txt(250, 878, 1420, 30)
        .font(UIFont.size(17)).color(Gray).align(CENTER).noOverflow(),
      this.deleteButton = Group(505, 915, 420, 68, [
        this.deleteBackground = Box(0, 0, 420, 68)
          .fill(UIColor).stroke(BtnBorder).radius(8),
        this.deleteLabel = Txt(12, 0, 396, 68)
          .font(UIFont.size(23)).color(White).align(CENTER),
      ]),
      this.closeButton = Group(995, 915, 420, 68, [
        Box(0, 0, 420, 68).fill(UIColor).stroke(BtnBorder).radius(8),
        this.closeLabel = Txt(12, 0, 396, 68)
          .font(UIFont.size(23)).color(White).align(CENTER),
      ]),
      this.confirmGroup = Group(0, 0, 1920, 1080, [
        this.confirmOverlay = Box(0, 0, 1920, 1080).fill(Black),
        Box(500, 300, 920, 430).fill(UIColor).stroke(BtnBorder).radius(14),
        this.confirmTitle = Txt(560, 345, 800, 58)
          .font(UIFont.size(40)).color(White).align(CENTER),
        this.confirmDetail = Txt(580, 425, 760, 140)
          .font(UIFont.size(25).line(38)).color(White).align(CENTER).wrap(),
        this.confirmButton = Group(610, 590, 310, 68, [
          Box(0, 0, 310, 68).fill(UIColor).stroke(BtnBorder).radius(8),
          this.confirmButtonLabel = Txt(10, 0, 290, 68)
            .font(UIFont.size(24)).color(White).align(CENTER),
        ]),
        this.confirmCancelButton = Group(1000, 590, 310, 68, [
          Box(0, 0, 310, 68).fill(UIColor).stroke(BtnBorder).radius(8),
          this.confirmCancelLabel = Txt(10, 0, 290, 68)
            .font(UIFont.size(24)).color(White).align(CENTER),
        ]),
      ]).hide(),
    ]).hide()

    this.group.el.setAttribute('role', 'dialog')
    this.group.el.setAttribute('aria-modal', 'true')
    this.overlay.el.style.opacity = '0.84'
    this.overlay.el.style.cursor = 'pointer'
    this.overlay.el.addEventListener('click', () => dispatchKey('Escape'))
    this.closeButton.el.style.cursor = 'pointer'
    this.closeButton.el.setAttribute('role', 'button')
    this.closeButton.el.addEventListener('click', () => dispatchKey('Escape'))
    this.deleteButton.el.style.cursor = 'pointer'
    this.deleteButton.el.setAttribute('role', 'button')
    this.deleteButton.el.addEventListener('click', () => dispatchKey('Delete'))
    this.incompleteButton.el.style.cursor = 'pointer'
    this.incompleteButton.el.setAttribute('role', 'button')
    this.incompleteButton.el.addEventListener('click', () => dispatchKey(
      'Incomplete',
      LIBRARY_EDITOR_INCOMPLETE_CODE,
    ))
    this.refreshButton.el.style.cursor = 'pointer'
    this.refreshButton.el.setAttribute('role', 'button')
    this.refreshButton.el.addEventListener('click', () => dispatchKey(
      'Refresh',
      LIBRARY_EDITOR_REFRESH_CODE,
    ))
    this.dedupeButton.el.style.cursor = 'pointer'
    this.dedupeButton.el.setAttribute('role', 'button')
    this.dedupeButton.el.addEventListener('click', () => dispatchKey(
      'Duplicates',
      LIBRARY_EDITOR_DEDUPE_CODE,
    ))
    this.confirmOverlay.el.style.opacity = '0.86'
    this.confirmCancelButton.el.style.cursor = 'pointer'
    this.confirmCancelButton.el.setAttribute('role', 'button')
    this.confirmCancelButton.el.addEventListener('click', () => dispatchKey('Escape'))
    this.confirmButton.el.style.cursor = 'pointer'
    this.confirmButton.el.setAttribute('role', 'button')
    this.confirmButton.el.addEventListener('click', () => dispatchKey(
      'Enter',
      LIBRARY_EDITOR_CONFIRM_CODE,
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
    const prefix = this.mode === 'duplicates' ? 'library.dedupe' : 'library.editor'
    this.title.text(t(`${prefix}.title`))
    this.empty.text(t(`${prefix}.empty`))
    this.hint.text(t(`${prefix}.hint`))
    this.legend.text([
      t('library.editor.pronunciationLegend'),
      t('library.editor.artistPendingLegend'),
    ].join(' · '))
    this.closeLabel.text(t('library.editor.close'))
    this.incompleteLabel.text(t('library.editor.deleteIncomplete'))
    this.dedupeLabel.text(t('library.editor.dedupe'))
    this.refreshLabel.text(t('library.editor.refresh'))
    this.confirmTitle.text(t('library.editor.confirmTitle'))
    this.confirmButtonLabel.text(t('library.editor.confirmAction'))
    this.confirmCancelLabel.text(t('library.editor.cancelAction'))
    const headerKeys = [
      'title', 'source', 'directory',
      ...COMPLETENESS_FIELDS,
    ]
    for (let index = 0; index < headerKeys.length; index++) {
      this.headerLabels[index].text(t(`library.editor.column.${headerKeys[index]}`))
    }
    for (let index = 0; index < SORT_MODES.length; index++) {
      this.sortLabels[index].text(t('library.editor.sort', {
        field: t(`library.editor.sort.${SORT_MODES[index]}`),
        arrow: this.sortMode === SORT_MODES[index]
          ? this.sortDirection === 'asc' ? '↑' : '↓'
          : '',
      }))
    }
    this.incompleteButton.el.style.display = this.mode === 'duplicates'
      ? 'none'
      : 'block'
    this.dedupeButton.el.style.display = this.mode === 'duplicates'
      ? 'none'
      : 'block'
    this.refreshButton.el.style.display = this.mode === 'duplicates'
      ? 'none'
      : 'block'
    for (const button of this.sortButtons) {
      button.el.style.display = this.mode === 'duplicates' ? 'none' : 'block'
    }
    this.group.el.setAttribute('aria-label', t(`${prefix}.title`))
    this.render()
  }

  show (songs, { mode = 'editor' } = {}) {
    this.mode = mode === 'duplicates' ? 'duplicates' : 'editor'
    this.songs = Array.isArray(songs) ? songs : []
    this.selectedIds.clear()
    this.cursor = 0
    this.offset = 0
    this.hideConfirmation()
    this.setLocale()
    this.group.show()
  }

  hide () {
    this.group.hide()
    this.hideConfirmation()
  }

  updateSongs (songs) {
    this.songs = Array.isArray(songs) ? songs : []
    this.setCursor(Math.min(this.cursor, this.songs.length - 1))
  }

  setSortState (mode, direction) {
    this.sortMode = SORT_MODES.includes(mode) ? mode : 'title'
    this.sortDirection = direction === 'desc' ? 'desc' : 'asc'
    this.setLocale()
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
    this.confirmDetail.text(this.i18n.t('library.editor.confirmDetail', { count }))
    this.confirmGroup.show()
  }

  hideConfirmation () {
    this.confirmGroup.hide()
  }

  render () {
    const t = this.i18n.t.bind(this.i18n)
    const prefix = this.mode === 'duplicates' ? 'library.dedupe' : 'library.editor'
    const incomplete = this.songs.filter(song => !song.completeness?.complete ||
      artistResolutionPending(song)).length
    this.summary.text(t(`${prefix}.summary`, {
      selected: this.selectedIds.size,
      total: this.songs.length,
      incomplete,
    }))
    this.deleteLabel.text(t('library.editor.deleteSelected', {
      count: this.selectedIds.size,
    }))
    this.deleteBackground.el.style.backgroundColor = this.selectedIds.size
      ? 'rgba(162, 56, 65, 0.9)'
      : 'rgba(70, 70, 70, 0.72)'
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
        song.duplicateOf
          ? t('library.dedupe.matches', { title: song.duplicateOf })
          : '',
      ].filter(Boolean).join(' · '))
      this.rowSources[position].text(sourceLabel(this.i18n, song.source))
      this.rowDirectories[position].text(song.directory || '—')
      for (let fieldIndex = 0; fieldIndex < COMPLETENESS_FIELDS.length; fieldIndex++) {
        const field = COMPLETENESS_FIELDS[fieldIndex]
        const artistPending = artistResolutionPending(song)
        const complete = song.completeness?.[field] === true &&
          !(field === 'identity' && artistPending)
        const status = this.rowStatuses[position][fieldIndex]
        const pendingPronunciation = field === 'pronunciation' &&
          song.completeness?.pronunciationStatus === 'pending'
        const pendingArtist = field === 'identity' && artistPending
        status.text(pendingPronunciation || pendingArtist
          ? '*'
          : complete ? '✓' : '·')
        status.el.style.color = pendingPronunciation || pendingArtist
          ? 'white'
          : complete ? '#78e5a6' : '#98a0ae'
      }
      this.rowBackgrounds[position].el.style.backgroundColor = selected
        ? 'rgba(156, 58, 72, 0.82)'
        : focused
          ? 'rgba(255, 255, 255, 0.24)'
          : 'rgba(43, 49, 61, 0.88)'
      row.el.setAttribute('aria-checked', String(selected))
      const pronunciationLabel = song.completeness?.pronunciationStatus === 'pending'
        ? `${t('library.editor.column.pronunciation')}: ${t('library.editor.pronunciationPending')}`
        : ''
      const artistPending = artistResolutionPending(song)
      const artistLabel = artistPending
        ? `${t('library.editor.column.identity')}: ${t('library.editor.artistPending')}`
        : ''
      row.el.setAttribute('aria-label', [
        song.title || t('common.untitled'),
        sourceLabel(this.i18n, song.source),
        pronunciationLabel,
        artistLabel,
        `${song.completeness?.score || 0}/${song.completeness?.total || 6}`,
      ].filter(Boolean).join(' · '))
    }
  }
}
