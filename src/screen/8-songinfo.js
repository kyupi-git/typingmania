import Screen from '../graphics/screen.js'
import { Group, Txt } from '../graphics/elements.js'
import {
  format_number_comma,
  format_number_fixed,
  format_time,
  NumberFont,
  SongFont,
  UIFont,
  White,
} from './0-common.js'
import SongCollection from '../song/songcollection.js'
import { CENTER } from '../graphics/styles.js'
import {
  displayCollectionDescription,
  displayCollectionName,
  displaySongSubtitle,
  displaySongTitle,
} from '../i18n.js'

export default class SongInfoScreen extends Screen {
  constructor (viewport, i18n) {
    super(viewport, 0, 0, 1920, 1080)
    this.i18n = i18n
    this.current_song = null
    this.current_mode = 'normal'
    this.create(20, [
      Group(0, 0, 1920, 1080, [
        this.song_path = Txt(70, 80, 1090, 30).font(SongFont.size(24)).color(White).noOverflow(),
        this.song_artist = Txt(35, 120, 1125, 48).font(SongFont.size(40)).color(White).noOverflow(),
        this.song_title = Txt(30, 180 - 18, 1130, 96).font(SongFont.size(72)).color(White).noOverflow(),
        // Two compact lines keep long work titles readable without crowding the
        // score block below. The full origin remains available as a tooltip.
        this.song_subtitle = Txt(35, 264, 1125, 76)
          .font(SongFont.size(30).line(35))
          .color(White)
          .clampLines(2),

        // A neutral marker avoids presenting unreliable language guesses.
        this.song_marker = Txt(30, 74, 30, 40)
          .text('•')
          .font(UIFont.size(24))
          .align(CENTER)
          .color(White),
      ]).layer(1),
      this.sub_info_group = Group(0, 0, 1920, 1080, [
        this.song_sub_group = Group(0, 0, 1920, 1080, [
          this.high_score_label = Txt(30, 600 - 260, 180, 36).font(UIFont.size(30)).color(White),
          this.length_label = Txt(30, 660 - 260, 180, 30).font(UIFont.size(24)).color(White),
          this.cpm_label = Txt(30, 700 - 260, 420, 30).font(UIFont.size(19)).color(White).noOverflow(),
          this.song_highscore = Txt(230, 600 - 260, 250, 36).font(NumberFont.size(36)).color(White),
          this.song_duration = Txt(230, 660 - 260, 100, 30).font(NumberFont.size(24)).color(White),
          this.song_cpm = Txt(465, 700 - 260, 180, 30).font(NumberFont.size(24)).color(White),
        ]),
        this.collection_sub_group = Group(0, 0, 1920, 1080, [
          this.collection_description = Txt(30, 600 - 260, 1030, 1080 - 620 - 60).font(SongFont.size(24).line(36)).color(White).wrap(),
        ]),
      ]).layer(1),
    ])

    this.layer.el.style.transform = 'translate(0, 320px)'
    this.layer.el.style.transition = 'transform 0.5s ease'
    this.setLocale()
  }

  setLocale () {
    this.high_score_label.text(this.i18n.t(
      this.current_mode === 'assist'
        ? 'songInfo.standardHighScore'
        : 'songInfo.highScore',
    ))
    this.length_label.text(this.i18n.t('songInfo.length'))
    this.cpm_label.text(this.i18n.t('songInfo.cpmMax'))
    const cpmHelp = this.i18n.t('songInfo.cpmHelp')
    this.cpm_label.el.title = cpmHelp
    this.song_cpm.el.title = cpmHelp
    if (this.current_song !== null) this.updateSong(this.current_song)
  }

  updateSongPath (collection) {
    let paths = []
    while (collection.parent !== null) {
      paths.unshift(displayCollectionName(collection, this.i18n.locale))
      collection = collection.parent
    }

    const path = paths.join(this.i18n.t('common.breadcrumbSeparator'))
    this.song_path.text(path)
  }

  updateSong (song) {
    this.current_song = song
    if (!song) {
      // Empty collection
      this.song_artist.text('')
      this.song_title.text(this.i18n.t('common.empty'))
      this.song_subtitle.text('')
      this.collection_description.text('')
      this.song_marker.hide()
      this.song_sub_group.hide()
      this.collection_sub_group.hide()
      this.song_path.hide()
    } else if (song instanceof SongCollection) {
      this.updateSongPath(song.parent)
      this.song_marker.hide()
      this.song_artist.text('')
      this.song_title.text(displayCollectionName(song, this.i18n.locale))
      this.song_subtitle.text(this.i18n.t('common.collection'))

      this.collection_description.text(displayCollectionDescription(song, this.i18n.locale))

      this.song_sub_group.hide()
      this.collection_sub_group.show()
      this.song_path.hide()
    } else {
      this.updateSongPath(song.collection)
      this.song_marker.show()
      this.song_artist.text(song.artist)
      const title = displaySongTitle(song, this.i18n.locale)
      const subtitle = displaySongSubtitle(song, this.i18n.locale)
      this.song_title.text(title)
      this.song_title.el.title = title
      this.song_subtitle.text(subtitle)
      this.song_subtitle.el.title = subtitle

      this.song_highscore.text(song.high_score > 0 ? `${format_number_comma(song.high_score)} [${song.high_score_class}]` : '---')
      this.song_duration.text(format_time(song.duration))
      const averageCpm = this.current_mode === 'assist'
        ? song.assist_cpm
        : song.cpm
      const peakCpm = this.current_mode === 'assist'
        ? song.assist_max_cpm
        : song.max_cpm
      this.song_cpm.text(`${format_number_fixed(averageCpm, 3)} / ${format_number_fixed(peakCpm, 3)}`)

      this.song_sub_group.show()
      this.collection_sub_group.hide()
      this.song_path.show()
    }
  }

  updateGameMode (mode) {
    this.current_mode = mode
    this.high_score_label.text(this.i18n.t(
      mode === 'assist'
        ? 'songInfo.standardHighScore'
        : 'songInfo.highScore',
    ))
    if (this.current_song) this.updateSong(this.current_song)
  }

  menuMode (yes) {
    if (yes) {
      this.layer.el.style.transform = 'translate(0, 320px)'
      this.sub_info_group.show()
    } else {
      this.layer.el.style.transform = 'translate(0, 0)'
      this.sub_info_group.hide()
    }
  }
}
