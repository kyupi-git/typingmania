import Screen from '../graphics/screen.js'
import { Box, Group, Txt } from '../graphics/elements.js'
import {
  Black,
  BtnBorder,
  format_number_comma,
  NumberFont,
  SongFont,
  UIColor,
  UIFont,
  White,
} from './0-common.js'
import { CENTER, Fill, RIGHT, Stroke } from '../graphics/styles.js'
import {
  displaySongSubtitle,
  displaySongTitle,
} from '../i18n.js'
import ResultChart from './result-chart.js'

const PanelFill = Fill('rgba(7, 12, 27, 0.82)')
const CardFill = Fill('rgba(255, 255, 255, 0.055)')
const PanelStroke = Stroke(1, 'rgba(255, 255, 255, 0.14)')
const Muted = Fill('rgba(220, 231, 255, 0.66)')

function panel (x, y, width, height) {
  const element = Box(x, y, width, height)
    .fill(PanelFill)
    .stroke(PanelStroke)
    .radius(24)
  element.el.style.boxShadow = '0 24px 70px rgba(0, 0, 0, 0.28)'
  element.el.style.backdropFilter = 'blur(12px)'
  return element
}

function rankColor (rank) {
  if (rank === 'SSS') return '#ffe178'
  if (rank === 'SS') return '#7cecff'
  if (String(rank).startsWith('S')) return '#91ffc5'
  if (String(rank).startsWith('A')) return '#c3b1ff'
  if (String(rank).startsWith('B')) return '#8fc5ff'
  return '#f0f4ff'
}

function percent (value) {
  return `${(Number(value) || 0).toFixed(1)}%`
}

export default class ResultScreen extends Screen {
  constructor (viewport, i18n) {
    super(viewport, 0, 0, 1920, 1080)
    this.i18n = i18n
    this.current_mode = 'normal'
    this.current_song = null
    this.current_data = null
    this.current_options = {}
    this.metric_labels = {}
    this.metric_values = {}

    const metricDefinitions = [
      ['maxCombo', 'result.maxCombo'],
      ['keyProgress', 'result.keyProgress'],
      ['correctMiss', 'result.correctMiss'],
      ['completedPerfect', 'result.completedPerfect'],
      ['skipped', 'result.skippedSummary'],
      ['pace', 'result.paceSummary'],
      ['accuracy', 'result.accuracy'],
      ['overallAccuracy', 'result.typingAccuracy'],
      ['flow', 'result.flowAverage'],
      ['penalty', 'result.penalty'],
    ]
    const metricCards = metricDefinitions.map(([id, key], index) => {
      const column = index % 2
      const row = Math.floor(index / 2)
      const x = 610 + column * 270
      const y = 330 + row * 125
      return Group(x, y, 250, 105, [
        Box(0, 0, 250, 105).fill(CardFill).stroke(PanelStroke).radius(14),
        this.metric_labels[id] = Txt(18, 10, 214, 36)
          .font(UIFont.size(15))
          .color(Muted)
          .clampLines(2),
        this.metric_values[id] = Txt(18, 51, 214, 40)
          .font(NumberFont.size(30))
          .color(White)
          .noOverflow(),
      ])
    })
    this.metricDefinitions = metricDefinitions

    this.create(100, [
      // Result title block, following the centered hierarchy of the original.
      this.song_artist = Txt(300, 70, 1320, 34)
        .align(CENTER)
        .font(SongFont.size(25))
        .color(Muted)
        .noOverflow(),
      this.song_title = Txt(250, 105, 1420, 72)
        .align(CENTER)
        .font(SongFont.size(56))
        .color(White)
        .noOverflow(),
      this.song_origin = Txt(330, 177, 1260, 36)
        .align(CENTER)
        .font(SongFont.size(22))
        .color(Muted)
        .noOverflow(),

      // Top-right return action.
      Box(1629, 0, 291, 60).fill(UIColor).layer(121),
      this.back_key = Txt(1644, 18, 83, 24)
        .layer(122)
        .radius(5)
        .fill(Black)
        .stroke(BtnBorder)
        .align(CENTER)
        .font(UIFont.size(18))
        .color(White),
      this.back_label = Txt(1742, 15, 163, 30)
        .layer(122)
        .color(White)
        .font(UIFont.size(24)),

      // Rank / score hero panel.
      panel(70, 240, 480, 760),
      this.performance_title = Txt(105, 270, 410, 38)
        .font(UIFont.size(23))
        .color(Muted),
      this.class_label = Txt(105, 318, 125, 40)
        .color(Muted)
        .font(UIFont.size(20)),
      this.score_class = Txt(100, 340, 420, 170)
        .color(White)
        .align(CENTER)
        .font(NumberFont.size(142))
        .noOverflow(),
      this.score_label = Txt(105, 520, 170, 34)
        .color(Muted)
        .font(UIFont.size(20)),
      this.score_value = Txt(100, 555, 420, 76)
        .color(White)
        .align(CENTER)
        .font(NumberFont.size(58))
        .noOverflow(),
      this.accuracy_ring = Box(215, 674, 190, 190)
        .fill(CardFill)
        .radius(95),
      Box(235, 694, 150, 150).fill(PanelFill).radius(75),
      this.accuracy_ring_value = Txt(235, 725, 150, 54)
        .align(CENTER)
        .font(NumberFont.size(36))
        .color(White),
      this.accuracy_ring_label = Txt(235, 775, 150, 34)
        .align(CENTER)
        .font(UIFont.size(17))
        .color(Muted),
      this.status_badge = Txt(145, 908, 330, 54)
        .align(CENTER)
        .font(UIFont.size(23).weight('700').spacing('0.08em'))
        .color(White)
        .stroke(PanelStroke)
        .radius(27),

      // Dense two-column statistics, inspired by the reference score tables.
      panel(575, 240, 590, 760),
      this.statistics_title = Txt(610, 270, 520, 38)
        .font(UIFont.size(23))
        .color(Muted),
      ...metricCards,

      // Recent input momentum chart.
      panel(1190, 240, 660, 355),
      this.tension_title = Txt(1225, 265, 390, 36)
        .font(UIFont.size(23))
        .color(White),
      this.tension_summary = Txt(1610, 265, 205, 36)
        .align(RIGHT)
        .font(NumberFont.size(18))
        .color(Fill('#ffc84d')),
      this.tension_help = Txt(1225, 300, 590, 38)
        .font(UIFont.size(15))
        .color(Muted)
        .clampLines(2),
      this.tension_chart_container = Group(1215, 342, 610, 235),

      // Rolling pace chart with song-speed reference lines.
      panel(1190, 620, 660, 380),
      this.pace_title = Txt(1225, 645, 390, 36)
        .font(UIFont.size(23))
        .color(White),
      this.pace_summary = Txt(1535, 645, 280, 36)
        .align(RIGHT)
        .font(NumberFont.size(18))
        .color(Fill('#76e5ff')),
      this.pace_help = Txt(1225, 680, 590, 38)
        .font(UIFont.size(15))
        .color(Muted)
        .clampLines(2),
      this.pace_chart_container = Group(1215, 724, 610, 245),

      // Game mode banner.
      this.game_mode_banner = Txt(0, 0, 1920, 45)
        .font(UIFont.size(30))
        .align(CENTER)
        .color(White),
    ])

    for (const label of Object.values(this.metric_labels)) {
      label.el.style.lineHeight = '18px'
    }
    this.tension_help.el.style.lineHeight = '19px'
    this.pace_help.el.style.lineHeight = '19px'

    this.tension_chart = new ResultChart(
      this.tension_chart_container.el,
      610,
      235,
    )
    this.pace_chart = new ResultChart(
      this.pace_chart_container.el,
      610,
      245,
    )
    this.setLocale()
  }

  setSong (song) {
    this.current_song = song
    if (!song) return
    const title = displaySongTitle(song, this.i18n.locale)
    const origin = displaySongSubtitle(song, this.i18n.locale)
    this.song_artist.text(song.artist || '')
    this.song_title.text(title)
    this.song_origin.text(origin)
    this.song_title.el.title = title
    this.song_origin.el.title = origin
  }

  setLocale () {
    const t = this.i18n.t.bind(this.i18n)
    this.back_key.text(t('key.any'))
    this.back_label.text(t('result.backMenu'))
    this.performance_title.text(t('result.performance'))
    this.class_label.text(t('result.class'))
    this.score_label.text(t('result.score'))
    this.accuracy_ring_label.text(t('result.typingAccuracy'))
    this.statistics_title.text(t('result.statistics'))
    this.tension_title.text(t('result.tensionChart'))
    this.tension_help.text(t('result.tensionHelp'))
    this.pace_title.text(t('result.paceChart'))
    this.pace_help.text(t('result.paceHelp'))
    for (const [id, key] of this.metricDefinitions) {
      this.metric_labels[id].text(t(key))
    }
    this.setSong(this.current_song)
    this.updateGameMode(this.current_mode)
    if (this.current_data) {
      this.updateResult(this.current_data, this.current_options)
    }
  }

  updateResult (data, options = {}) {
    this.current_data = data
    this.current_options = options
    const t = this.i18n.t.bind(this.i18n)
    const accent = rankColor(data.className)
    const safeAccuracy = Math.max(0, Math.min(100, data.overallAccuracy || 0))
    const perfect = data.totalLines > 0 &&
      data.missed === 0 &&
      data.skippedChar === 0 &&
      data.completedLine >= data.totalLines

    this.score_class.text(data.className)
    this.score_class.el.style.color = accent
    this.score_class.el.style.textShadow = `0 0 34px ${accent}55`
    this.score_value.text(format_number_comma(data.score))
    this.accuracy_ring_value.text(percent(data.overallAccuracy))
    this.accuracy_ring.el.style.background = `conic-gradient(
      ${accent} ${safeAccuracy * 3.6}deg,
      rgba(255, 255, 255, 0.09) 0deg
    )`
    this.status_badge.text(t(
      perfect
        ? 'result.fullCombo'
        : data.completedLine > 0
          ? 'result.cleared'
          : 'result.incomplete',
    ))
    this.status_badge.el.style.background = `${accent}20`
    this.status_badge.el.style.borderColor = `${accent}88`

    const values = {
      maxCombo: format_number_comma(data.maxCombo),
      keyProgress: `${format_number_comma(data.correct)} / ${format_number_comma(data.scoringChar)}`,
      correctMiss: `${format_number_comma(data.correct)} / ${format_number_comma(data.missed)}`,
      completedPerfect: `${format_number_comma(data.completedLine)} / ${format_number_comma(data.perfectLine)}`,
      skipped: `${format_number_comma(data.skippedChar)} / ${format_number_comma(data.skippedLine)}`,
      pace: `${format_number_comma(options.referenceAverageCpm || 0)} / ${format_number_comma(options.referencePeakCpm || 0)}`,
      accuracy: percent(data.accuracy),
      overallAccuracy: percent(data.overallAccuracy),
      flow: percent(data.averageTension),
      penalty: data.penalty > 0 ? `−${format_number_comma(data.penalty)}` : '0',
    }
    for (const [id, value] of Object.entries(values)) {
      this.metric_values[id].text(value)
    }

    this.tension_summary.text(t('result.averageValue', {
      value: Math.round(data.averageTension),
    }))
    this.pace_summary.text(t('result.averagePeakValue', {
      average: data.averageCpm,
      peak: data.rollingPeakCpm,
    }))
    this.tension_chart.setLabel(t('result.tensionAria', {
      value: Math.round(data.averageTension),
    }))
    this.pace_chart.setLabel(t('result.paceAria', {
      average: data.averageCpm,
      peak: data.rollingPeakCpm,
      referenceAverage: Math.round(options.referenceAverageCpm || 0),
      referencePeak: Math.round(options.referencePeakCpm || 0),
    }))
    this.tension_chart.renderTension(data.performance)
    this.pace_chart.renderPace(data.performance, options)
  }

  updateGameMode (mode) {
    this.current_mode = mode
    this.game_mode_banner.text(
      mode === 'normal' ? '' : this.i18n.t(`mode.banner.${mode}`),
    )
  }
}
