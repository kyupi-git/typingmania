import Screen from '../graphics/screen.js'
import { Box, Group, Txt } from '../graphics/elements.js'
import {
  BadgeAudio,
  BadgeVideo,
  BadgeYouTube,
  Black,
  BtnBorder,
  Gray,
  NumberFont,
  SongFont,
  UIColor,
  UIFont,
  White,
} from './0-common.js'
import SongCollection from '../song/songcollection.js'
import { CENTER } from '../graphics/styles.js'
import {
  displayCollectionName,
  displaySongTitle,
  LOCALE_NAMES,
  SUPPORTED_LOCALES,
} from '../i18n.js'
import { SONG_SORT_MODES } from '../song/song-sort.js'
import {
  normalizedWheelDelta,
  POINTER_APPLY_CODE,
} from '../game/menu-navigation.js'
import LibraryEditorDialog from './library-editor-dialog.js'
import { APP_VERSION, PROJECT_URL } from '../app-meta.js'

const IMPORT_SOURCES = ['qqMusic', 'other']
const WHEEL_STEP_THRESHOLD = 32
const MENU_HINT_SHADOW =
  '0 2px 4px rgba(8, 12, 20, .98), 0 0 9px rgba(8, 12, 20, .92)'
const ABOUT_CREDIT_GROUPS = Object.freeze([
  {
    key: 'about.credit.foundation',
    links: [
      ['TypingMania NEO', 'https://github.com/innocenat/typingmania'],
    ],
  },
  {
    key: 'about.credit.runtime',
    links: [
      ['Node.js', 'https://nodejs.org/'],
    ],
  },
  {
    key: 'about.credit.qqTools',
    links: [
      [
        '@clamber_l/crypto',
        'https://www.npmjs.com/package/@clamber_l/crypto',
      ],
      [
        'music-metadata',
        'https://github.com/Borewit/music-metadata',
      ],
    ],
  },
  {
    key: 'about.credit.pinyin',
    links: [
      ['pinyin-pro', 'https://github.com/zh-lx/pinyin-pro'],
    ],
  },
  {
    key: 'about.credit.editor',
    links: [
      ['Preact', 'https://github.com/preactjs/preact'],
      ['HTM', 'https://github.com/developit/htm'],
    ],
  },
  {
    key: 'about.credit.tooling',
    links: [
      ['esbuild', 'https://github.com/evanw/esbuild'],
      ['Jest', 'https://github.com/jestjs/jest'],
    ],
  },
  {
    key: 'about.credit.assets',
    links: [
      ['Iosevka', 'https://github.com/be5invis/Iosevka'],
      ['Noto Sans CJK', 'https://github.com/notofonts/noto-cjk'],
      ['Open Sans', 'https://github.com/googlefonts/opensans'],
      [
        'Dustyroom SFX',
        'https://dustyroom.com/free-casual-game-sounds/',
      ],
    ],
  },
  {
    key: 'about.credit.services',
    links: [
      ['QQ Music', 'https://y.qq.com/'],
      ['Bangumi API', 'https://bangumi.github.io/api/'],
      [
        'YouTube IFrame API',
        'https://developers.google.com/youtube/iframe_api_reference',
      ],
    ],
  },
])

export default class MenuScreen extends Screen {
  constructor (viewport, i18n) {
    super(viewport, 0, 0, 1920, 1080)
    this.i18n = i18n
    this.current_mode = 'normal'
    this.key_effects_enabled = true
    this.demo_mode_enabled = false
    this.song_select_handler = null
    this.songScrollHandler = null
    this.dialogOpen = false
    this.wheelDelta = 0
    this.importHintKey = 'menu.importHint'
    this.importHintValues = {}
    this.sort_mode = 'added'
    this.sort_direction = 'asc'
    this.language_option_backgrounds = []
    this.language_option_markers = []
    this.language_option_rows = []
    this.sort_option_backgrounds = []
    this.sort_option_markers = []
    this.sort_option_labels = []
    this.sort_option_rows = []
    this.importSourceBackgrounds = []
    this.importSourceMarkers = []
    this.importSourceLabels = []
    this.importSourceDetails = []
    this.importSourceRows = []
    this.libraryEditorDialog = new LibraryEditorDialog(i18n)
    const languageOptions = SUPPORTED_LOCALES.map((locale, index) => {
      const row = Group(660, 390 + index * 105, 600, 78, [
        this.language_option_backgrounds[index] = Box(0, 0, 600, 78)
          .stroke(BtnBorder)
          .radius(8),
        this.language_option_markers[index] = Txt(24, 0, 54, 78)
          .font(UIFont.size(34))
          .color(White)
          .align(CENTER),
        Txt(88, 0, 480, 78)
          .text(LOCALE_NAMES[locale])
          .font(UIFont.size(34))
          .color(White),
      ])
      row.el.style.cursor = 'pointer'
      row.el.setAttribute('role', 'radio')
      row.el.setAttribute('aria-label', LOCALE_NAMES[locale])
      row.el.addEventListener('click', () => {
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: String(index + 1),
        }))
      })
      this.language_option_rows.push(row)
      return row
    })
    const sortOptions = SONG_SORT_MODES.map((mode, index) => {
      const row = Group(660, 320 + index * 92, 600, 70, [
        this.sort_option_backgrounds[index] = Box(0, 0, 600, 70)
          .stroke(BtnBorder)
          .radius(8),
        this.sort_option_markers[index] = Txt(24, 0, 54, 70)
          .font(UIFont.size(30))
          .color(White)
          .align(CENTER),
        this.sort_option_labels[index] = Txt(88, 0, 480, 70)
          .font(UIFont.size(30))
          .color(White),
      ])
      row.el.style.cursor = 'pointer'
      row.el.setAttribute('role', 'radio')
      row.el.addEventListener('click', () => {
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: String(index + 1),
          code: POINTER_APPLY_CODE,
        }))
      })
      this.sort_option_rows.push(row)
      return row
    })
    const importSourceOptions = IMPORT_SOURCES.map((source, index) => {
      const row = Group(610, 365 + index * 140, 700, 112, [
        this.importSourceBackgrounds[index] = Box(0, 0, 700, 112)
          .stroke(BtnBorder)
          .radius(10),
        this.importSourceMarkers[index] = Txt(24, 0, 54, 112)
          .font(UIFont.size(32))
          .color(White)
          .align(CENTER),
        this.importSourceLabels[index] = Txt(92, 14, 570, 42)
          .font(UIFont.size(30))
          .color(White),
        this.importSourceDetails[index] = Txt(92, 62, 570, 30)
          .font(UIFont.size(19))
          .color(Gray)
          .noOverflow(),
      ])
      row.el.setAttribute('role', 'radio')
      if (source === 'other') {
        row.el.style.cursor = 'not-allowed'
        row.el.setAttribute('aria-disabled', 'true')
      } else {
        row.el.style.cursor = 'pointer'
        row.el.addEventListener('click', () => {
          window.dispatchEvent(new KeyboardEvent('keydown', {
            key: String(index + 1),
            code: POINTER_APPLY_CODE,
          }))
        })
      }
      this.importSourceRows.push(row)
      return row
    })
    this.create(100, [
      // Top Right Infobar
      Box(1425, 0, 1920 - 1420, 60).fill(UIColor).layer(121),
      this.select_key = Txt(1440, 18, 68, 24).layer(122).radius(5).fill(Black).stroke(BtnBorder).align(CENTER).font(UIFont.size(18)).color(White),
      this.select_label = Txt(1520, 15, 78, 30).layer(122).color(White).font(UIFont.size(22)),
      this.parent_key = Txt(1608, 18, 170, 24).layer(122).radius(5).fill(Black).stroke(BtnBorder).align(CENTER).font(UIFont.size(16)).color(White),
      this.parent_label = Txt(1788, 15, 117, 30).layer(122).color(White).font(UIFont.size(20)).noOverflow(),

      // Empty view text
      this.empty_text = Txt(1250, 510, 620, 60).layer(200).color(White).font(UIFont.size(48)),

      // Song List Container
      this.songs_list_container = Box(1300, 0, 620, 1080).layer(110),

      // Sorting applies to whichever collection is currently open, including
      // nested QQ Music collections.
      this.sort_button = Group(1335, 75, 550, 58, [
        Box(0, 0, 550, 58).fill(UIColor).stroke(BtnBorder).radius(8),
        this.sort_label = Txt(12, 0, 526, 58)
          .font(UIFont.size(22))
          .color(White)
          .align(CENTER)
          .noOverflow(),
      ]).layer(130),
      this.sort_hint = Txt(1335, 140, 550, 26)
        .font(UIFont.size(16))
        .color(Gray)
        .align(CENTER)
        .noOverflow()
        .layer(130),

      // Music import source selection
      this.import_music_button = Group(30, 900, 220, 72, [
        Box(0, 0, 220, 72).fill(UIColor).stroke(BtnBorder).radius(8),
        this.import_music_label = Txt(10, 0, 200, 72).font(UIFont.size(18)).color(White).align(CENTER).noOverflow(),
      ]).layer(130),
      this.import_music_hint = Txt(30, 980, 220, 28)
        .font(UIFont.size(14))
        .color(Gray)
        .noOverflow()
        .layer(130),

      // Multi-select editor for locally managed song packages
      this.editLibraryButton = Group(270, 900, 220, 72, [
        Box(0, 0, 220, 72).fill(UIColor).stroke(BtnBorder).radius(8),
        this.editLibraryLabel = Txt(10, 0, 200, 72)
          .font(UIFont.size(18))
          .color(White)
          .align(CENTER)
          .noOverflow(),
      ]).layer(130),
      this.editLibraryHint = Txt(270, 980, 220, 28)
        .font(UIFont.size(14))
        .color(Gray)
        .noOverflow()
        .layer(130),

      // Restore the verified starter library and remove every added song
      this.reset_library_button = Group(510, 900, 220, 72, [
        Box(0, 0, 220, 72).fill(UIColor).stroke(BtnBorder).radius(8),
        this.reset_library_label = Txt(10, 0, 200, 72).font(UIFont.size(17)).color(White).align(CENTER).noOverflow(),
      ]).layer(130),
      this.reset_library_hint = Txt(510, 980, 220, 28)
        .font(UIFont.size(14))
        .color(Gray)
        .noOverflow()
        .layer(130),

      // Optional falling-key feedback
      this.key_effects_button = Group(750, 900, 150, 72, [
        this.key_effects_background = Box(0, 0, 150, 72)
          .fill(UIColor)
          .stroke(BtnBorder)
          .radius(8),
        this.key_effects_label = Txt(8, 0, 134, 72)
          .font(UIFont.size(16))
          .color(White)
          .align(CENTER)
          .noOverflow(),
      ]).layer(130),
      this.key_effects_hint = Txt(740, 980, 170, 28)
        .font(UIFont.size(13))
        .color(Gray)
        .align(CENTER)
        .noOverflow()
        .layer(130),

      // Human-paced perfect-play demonstration
      this.demo_mode_button = Group(920, 900, 150, 72, [
        this.demo_mode_background = Box(0, 0, 150, 72)
          .fill(UIColor)
          .stroke(BtnBorder)
          .radius(8),
        this.demo_mode_label = Txt(8, 0, 134, 72)
          .font(UIFont.size(16))
          .color(White)
          .align(CENTER)
          .noOverflow(),
      ]).layer(130),
      this.demo_mode_hint = Txt(910, 980, 170, 28)
        .font(UIFont.size(13))
        .color(Gray)
        .align(CENTER)
        .noOverflow()
        .layer(130),

      // Interface language action
      this.language_button = Group(1090, 900, 150, 72, [
        Box(0, 0, 150, 72).fill(UIColor).stroke(BtnBorder).radius(8),
        this.language_label = Txt(8, 0, 134, 72).font(UIFont.size(16)).color(White).align(CENTER).noOverflow(),
      ]).layer(130),
      this.language_hint = Txt(1080, 980, 170, 28)
        .font(UIFont.size(13))
        .color(Gray)
        .align(CENTER)
        .noOverflow()
        .layer(130),

      // Project credits, kept clear of the top-left volume controls.
      this.about_button = Group(1200, 10, 190, 40, [
        Box(0, 0, 190, 40).fill(UIColor).stroke(BtnBorder).radius(8),
        this.about_label = Txt(8, 0, 174, 40)
          .font(UIFont.size(16))
          .color(White)
          .align(CENTER)
          .noOverflow(),
      ]).layer(130),

      // Game mode banner
      this.game_mode_banner = Txt(400, 0, 780, 60)
        .font(UIFont.size(30))
        .color(White)
        .align(CENTER)
        .noOverflow(),

      // Language selection dialog
      this.language_dialog = Group(0, 0, 1920, 1080, [
        this.language_overlay = Box(0, 0, 1920, 1080).fill(Black),
        Box(560, 255, 800, 560).fill(UIColor).stroke(BtnBorder).radius(12),
        this.language_dialog_title = Txt(610, 295, 700, 58)
          .font(UIFont.size(42))
          .color(White)
          .align(CENTER),
        ...languageOptions,
        this.language_dialog_hint = Txt(610, 730, 700, 38)
          .font(UIFont.size(22))
          .color(Gray)
          .align(CENTER),
      ]).layer(300).hide(),

      // Import provider selection dialog. Only QQ Music is implemented in
      // this version; future providers can use the same controller contract.
      this.importSourceDialog = Group(0, 0, 1920, 1080, [
        this.importSourceOverlay = Box(0, 0, 1920, 1080).fill(Black),
        Box(510, 205, 900, 670).fill(UIColor).stroke(BtnBorder).radius(12),
        this.importSourceTitle = Txt(580, 250, 760, 58)
          .font(UIFont.size(40))
          .color(White)
          .align(CENTER),
        ...importSourceOptions,
        this.importSourceNotice = Txt(590, 670, 740, 58)
          .font(UIFont.size(21).line(28))
          .color(Gray)
          .align(CENTER)
          .wrap(),
        this.importSourceHint = Txt(590, 770, 740, 34)
          .font(UIFont.size(20))
          .color(Gray)
          .align(CENTER),
      ]).layer(303).hide(),

      // Collection sorting dialog
      this.sort_dialog = Group(0, 0, 1920, 1080, [
        this.sort_overlay = Box(0, 0, 1920, 1080).fill(Black),
        Box(510, 135, 900, 810).fill(UIColor).stroke(BtnBorder).radius(12),
        this.sort_dialog_title = Txt(580, 175, 760, 52)
          .font(UIFont.size(40))
          .color(White)
          .align(CENTER),
        this.sort_dialog_scope = Txt(590, 240, 740, 40)
          .font(UIFont.size(23))
          .color(Gray)
          .align(CENTER)
          .noOverflow(),
        ...sortOptions,
        this.sort_direction_button = Group(660, 705, 600, 68, [
          this.sort_direction_background = Box(0, 0, 600, 68)
            .fill(UIColor)
            .stroke(BtnBorder)
            .radius(8),
          this.sort_direction_label = Txt(20, 0, 560, 68)
            .font(UIFont.size(28))
            .color(White)
            .align(CENTER),
        ]),
        this.sort_dialog_hint = Txt(560, 820, 800, 70)
          .font(UIFont.size(21).line(30))
          .color(Gray)
          .align(CENTER)
          .wrap(),
      ]).layer(305).hide(),

      // Project details, source link, acknowledgements, and a short disclaimer.
      this.about_dialog = Group(0, 0, 1920, 1080, [
        this.about_overlay = Box(0, 0, 1920, 1080).fill(Black),
        Box(420, 110, 1080, 860).fill(UIColor).stroke(BtnBorder).radius(12),
        this.about_title = Txt(485, 145, 950, 58)
          .font(UIFont.size(40))
          .color(White)
          .align(CENTER),
        this.about_version = Txt(510, 201, 900, 28)
          .font(UIFont.size(18))
          .color(Gray)
          .align(CENTER),
        this.about_summary = Txt(510, 235, 900, 45)
          .font(UIFont.size(21).line(29))
          .color(Gray)
          .align(CENTER)
          .wrap(),
        this.about_github_button = Group(570, 290, 780, 58, [
          Box(0, 0, 780, 58).fill(Black).stroke(BtnBorder).radius(8),
          this.about_github_label = Txt(18, 0, 744, 58)
            .font(UIFont.size(19))
            .color(White)
            .align(CENTER)
            .noOverflow(),
        ]),
        this.about_disclaimer_title = Txt(510, 375, 900, 34)
          .font(UIFont.size(23))
          .color(White),
        this.about_disclaimer = Txt(510, 415, 900, 70)
          .font(UIFont.size(18).line(27))
          .color(Gray)
          .wrap(),
        this.about_credits_title = Txt(510, 505, 900, 34)
          .font(UIFont.size(23))
          .color(White),
        this.about_credits_container = Group(510, 548, 900, 325),
        this.about_hint = Txt(510, 905, 900, 34)
          .font(UIFont.size(19))
          .color(Gray)
          .align(CENTER),
      ]).layer(308).hide(),

      // Compact second-confirmation dialog for restoring the starter library
      this.reset_dialog = Group(0, 0, 1920, 1080, [
        this.reset_overlay = Box(0, 0, 1920, 1080).fill(Black),
        Box(470, 270, 980, 500).fill(UIColor).stroke(BtnBorder).radius(12),
        this.reset_dialog_title = Txt(540, 310, 840, 60)
          .font(UIFont.size(44))
          .color(White)
          .align(CENTER),
        this.reset_dialog_detail = Txt(560, 395, 800, 100)
          .font(UIFont.size(28))
          .color(White)
          .align(CENTER)
          .wrap(),
        this.reset_dialog_hint = Txt(560, 520, 800, 40)
          .font(UIFont.size(24))
          .color(Gray)
          .align(CENTER),
        this.reset_confirm_button = Group(620, 605, 300, 70, [
          Box(0, 0, 300, 70).fill(UIColor).stroke(BtnBorder).radius(8),
          this.reset_confirm_label = Txt(12, 0, 276, 70)
            .font(UIFont.size(28))
            .color(White)
            .align(CENTER),
        ]),
        this.reset_cancel_button = Group(1000, 605, 300, 70, [
          Box(0, 0, 300, 70).fill(UIColor).stroke(BtnBorder).radius(8),
          this.reset_cancel_label = Txt(12, 0, 276, 70)
            .font(UIFont.size(28))
            .color(White)
            .align(CENTER),
        ]),
      ]).layer(310).hide(),
      this.libraryEditorDialog.group.layer(315),
    ])

    this.empty = true

    // List move animation
    this.songs_list_container.el.style.transition = 'transform 0.2s ease'
    this.song_list_item = []
    this.current_position = 0

    this.import_music_button.el.style.cursor = 'pointer'
    this.import_music_button.el.setAttribute('role', 'button')
    this.import_music_button.el.addEventListener('click', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }))
    })
    this.editLibraryButton.el.style.cursor = 'pointer'
    this.editLibraryButton.el.setAttribute('role', 'button')
    this.editLibraryButton.el.addEventListener('click', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }))
    })
    this.reset_library_button.el.style.cursor = 'pointer'
    this.reset_library_button.el.setAttribute('role', 'button')
    this.reset_library_button.el.addEventListener('click', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }))
    })
    this.key_effects_button.el.style.cursor = 'pointer'
    this.key_effects_button.el.setAttribute('role', 'button')
    this.key_effects_button.el.addEventListener('click', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }))
    })
    this.demo_mode_button.el.style.cursor = 'pointer'
    this.demo_mode_button.el.setAttribute('role', 'button')
    this.demo_mode_button.el.addEventListener('click', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }))
    })
    this.language_button.el.style.cursor = 'pointer'
    this.language_button.el.setAttribute('role', 'button')
    this.language_button.el.addEventListener('click', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l' }))
    })
    this.about_button.el.style.cursor = 'pointer'
    this.about_button.el.setAttribute('role', 'button')
    this.about_button.el.addEventListener('click', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    })
    this.sort_button.el.style.cursor = 'pointer'
    this.sort_button.el.setAttribute('role', 'button')
    this.sort_button.el.addEventListener('click', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }))
    })
    this.language_overlay.el.style.opacity = '0.72'
    this.language_overlay.el.style.cursor = 'pointer'
    this.language_overlay.el.addEventListener('click', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    this.language_dialog.el.setAttribute('role', 'dialog')
    this.language_dialog.el.setAttribute('aria-modal', 'true')
    this.importSourceOverlay.el.style.opacity = '0.72'
    this.importSourceOverlay.el.style.cursor = 'pointer'
    this.importSourceOverlay.el.addEventListener('click', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    this.importSourceDialog.el.setAttribute('role', 'dialog')
    this.importSourceDialog.el.setAttribute('aria-modal', 'true')
    this.sort_overlay.el.style.opacity = '0.72'
    this.sort_overlay.el.style.cursor = 'pointer'
    this.sort_overlay.el.addEventListener('click', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    this.sort_dialog.el.setAttribute('role', 'dialog')
    this.sort_dialog.el.setAttribute('aria-modal', 'true')
    this.sort_dialog_hint.el.style.whiteSpace = 'pre-line'
    this.sort_direction_button.el.style.cursor = 'pointer'
    this.sort_direction_button.el.setAttribute('role', 'button')
    this.sort_direction_button.el.addEventListener('click', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }))
    })
    this.about_overlay.el.style.opacity = '0.72'
    this.about_overlay.el.style.cursor = 'pointer'
    this.about_overlay.el.addEventListener('click', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    this.about_dialog.el.setAttribute('role', 'dialog')
    this.about_dialog.el.setAttribute('aria-modal', 'true')
    this.about_github_button.el.style.cursor = 'pointer'
    this.about_github_button.el.setAttribute('role', 'link')
    this.about_github_button.el.addEventListener('click', () => {
      window.open(PROJECT_URL, '_blank', 'noopener,noreferrer')
    })
    this.about_credits_container.el.style.overflowY = 'auto'
    this.about_credits_container.el.style.paddingRight = '8px'
    this.about_credits_container.el.setAttribute('tabindex', '0')
    for (const hint of [
      this.import_music_hint,
      this.editLibraryHint,
      this.reset_library_hint,
      this.key_effects_hint,
      this.demo_mode_hint,
      this.language_hint,
    ]) {
      hint.el.style.textShadow = MENU_HINT_SHADOW
      hint.el.style.webkitTextStroke = '.35px rgba(8, 12, 20, .9)'
    }
    this.reset_overlay.el.style.opacity = '0.72'
    this.reset_overlay.el.style.cursor = 'pointer'
    this.reset_overlay.el.addEventListener('click', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    this.reset_dialog_detail.el.style.lineHeight = '42px'
    this.reset_dialog_detail.el.style.whiteSpace = 'pre-line'
    this.reset_dialog.el.setAttribute('role', 'dialog')
    this.reset_dialog.el.setAttribute('aria-modal', 'true')
    this.reset_confirm_button.el.style.cursor = 'pointer'
    this.reset_confirm_button.el.setAttribute('role', 'button')
    this.reset_confirm_button.el.addEventListener('click', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }))
    })
    this.reset_cancel_button.el.style.cursor = 'pointer'
    this.reset_cancel_button.el.setAttribute('role', 'button')
    this.reset_cancel_button.el.addEventListener('click', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    this.layer.el.addEventListener('wheel', event => {
      if (!this.songScrollHandler || this.dialogOpen) return
      event.preventDefault()
      this.wheelDelta += normalizedWheelDelta(event)
      if (Math.abs(this.wheelDelta) < WHEEL_STEP_THRESHOLD) return
      const direction = Math.sign(this.wheelDelta)
      this.wheelDelta = 0
      this.songScrollHandler(direction)
    }, { passive: false })
    this.setLocale()
  }

  renderAboutCredits () {
    const container = this.about_credits_container.el
    container.replaceChildren()
    for (const group of ABOUT_CREDIT_GROUPS) {
      const row = document.createElement('section')
      row.style.marginBottom = '13px'

      const description = document.createElement('div')
      description.textContent = this.i18n.t(group.key)
      description.style.color = '#b8bdc7'
      description.style.fontFamily = 'Open Sans, sans-serif'
      description.style.fontSize = '16px'
      description.style.lineHeight = '23px'
      row.appendChild(description)

      const links = document.createElement('div')
      links.style.display = 'flex'
      links.style.flexWrap = 'wrap'
      links.style.gap = '4px 13px'
      for (const [label, url] of group.links) {
        const link = document.createElement('a')
        link.textContent = label
        link.href = url
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
        link.style.color = '#8fc8ff'
        link.style.fontFamily = 'Open Sans, sans-serif'
        link.style.fontSize = '16px'
        link.style.lineHeight = '23px'
        links.appendChild(link)
      }
      row.appendChild(links)
      container.appendChild(row)
    }
  }

  setLocale () {
    const t = this.i18n.t.bind(this.i18n)
    this.select_key.text(t('key.space'))
    this.select_label.text(t('common.select'))
    this.parent_key.text(`${t('key.escape')} / ${t('key.backspace')}`)
    this.parent_label.text(t('common.goParent'))
    this.empty_text.text(t('common.empty'))
    this.import_music_label.text(t('menu.importMusic'))
    this.import_music_button.el.setAttribute('aria-label', t('menu.importMusic'))
    this.editLibraryLabel.text(t('menu.editLibrary'))
    this.editLibraryHint.text(t('menu.editLibraryHint'))
    this.editLibraryButton.el.setAttribute(
      'aria-label',
      t('common.labelWithHint', {
        label: t('menu.editLibrary'),
        hint: t('menu.editLibraryHint'),
      }),
    )
    this.reset_library_label.text(t('menu.resetLibrary'))
    this.reset_library_hint.text(t('menu.resetLibraryHint'))
    this.reset_library_button.el.setAttribute(
      'aria-label',
      t('common.labelWithHint', {
        label: t('menu.resetLibrary'),
        hint: t('menu.resetLibraryHint'),
      }),
    )
    const keyEffectsLabel = t('menu.keyEffects', {
      state: t(
        this.key_effects_enabled ? 'common.enabled' : 'common.disabled',
      ),
    })
    this.key_effects_label.text(keyEffectsLabel)
    this.key_effects_hint.text(t('menu.keyEffectsHint'))
    this.key_effects_button.el.setAttribute(
      'aria-label',
      t('common.labelWithHint', {
        label: keyEffectsLabel,
        hint: t('menu.keyEffectsHint'),
      }),
    )
    this.key_effects_button.el.setAttribute(
      'aria-pressed',
      String(this.key_effects_enabled),
    )
    const demoModeLabel = t('menu.demoMode', {
      state: t(
        this.demo_mode_enabled ? 'common.enabled' : 'common.disabled',
      ),
    })
    this.demo_mode_label.text(demoModeLabel)
    this.demo_mode_hint.text(t('menu.demoModeHint'))
    this.demo_mode_button.el.setAttribute(
      'aria-label',
      t('common.labelWithHint', {
        label: demoModeLabel,
        hint: t('menu.demoModeHint'),
      }),
    )
    this.demo_mode_button.el.setAttribute(
      'aria-pressed',
      String(this.demo_mode_enabled),
    )
    const languageLabel = t('menu.language', {
      language: this.i18n.languageName(),
    })
    this.language_label.text(languageLabel)
    this.language_hint.text(t('menu.languageHint'))
    this.language_button.el.setAttribute(
      'aria-label',
      t('common.labelWithHint', {
        label: languageLabel,
        hint: t('menu.languageHint'),
      }),
    )
    this.about_label.text(t('menu.about'))
    this.about_button.el.setAttribute('aria-label', t('menu.about'))
    this.about_title.text(t('about.title'))
    this.about_version.text(t('about.version', { version: APP_VERSION }))
    this.about_summary.text(t('about.summary'))
    const githubLabel = t('about.github', { url: PROJECT_URL })
    this.about_github_label.text(githubLabel)
    this.about_github_button.el.setAttribute('aria-label', githubLabel)
    this.about_disclaimer_title.text(t('about.disclaimerTitle'))
    this.about_disclaimer.text(t('about.disclaimer'))
    this.about_credits_title.text(t('about.creditsTitle'))
    this.renderAboutCredits()
    this.about_hint.text(t('about.closeHint'))
    this.about_dialog.el.setAttribute('aria-label', t('about.title'))
    this.language_dialog_title.text(t('language.selectTitle'))
    this.language_dialog_hint.text(t('language.selectHint'))
    this.language_dialog.el.setAttribute('aria-label', t('language.selectTitle'))
    this.importSourceTitle.text(t('import.selectTitle'))
    this.importSourceHint.text(t('import.selectHint'))
    this.importSourceDialog.el.setAttribute(
      'aria-label',
      t('import.selectTitle'),
    )
    for (let index = 0; index < IMPORT_SOURCES.length; index++) {
      const source = IMPORT_SOURCES[index]
      const label = t(`import.${source}`)
      const detail = t(`import.${source}Detail`)
      this.importSourceLabels[index].text(label)
      this.importSourceDetails[index].text(detail)
      this.importSourceRows[index].el.setAttribute(
        'aria-label',
        t('common.labelWithHint', { label, hint: detail }),
      )
    }
    for (let index = 0; index < SONG_SORT_MODES.length; index++) {
      const label = t(`sort.mode.${SONG_SORT_MODES[index]}`)
      this.sort_option_labels[index].text(label)
      this.sort_option_rows[index].el.setAttribute('aria-label', label)
    }
    this.sort_dialog_title.text(t('sort.selectTitle'))
    this.sort_dialog_hint.text(t('sort.selectHint'))
    this.sort_hint.text(t('menu.sortHint'))
    this.sort_dialog.el.setAttribute('aria-label', t('sort.selectTitle'))
    this.setSortState(this.sort_mode, this.sort_direction)
    this.setSortDirection(this.sort_direction)
    this.reset_dialog_title.text(t('library.reset.confirmTitle'))
    this.reset_dialog_detail.text(t('library.reset.confirmDetail'))
    this.reset_dialog_hint.text(t('library.reset.confirmHint'))
    this.reset_confirm_label.text(t('library.reset.confirmAction'))
    this.reset_cancel_label.text(t('library.reset.cancelAction'))
    this.reset_dialog.el.setAttribute('aria-label', t('library.reset.confirmTitle'))
    this.reset_confirm_button.el.setAttribute(
      'aria-label',
      t('library.reset.confirmAction'),
    )
    this.reset_cancel_button.el.setAttribute(
      'aria-label',
      t('library.reset.cancelAction'),
    )
    this.import_music_hint.text(t(this.importHintKey, this.importHintValues))
    this.libraryEditorDialog.setLocale()
    this.updateGameMode(this.current_mode)
  }

  setKeyEffectsEnabled (enabled) {
    this.key_effects_enabled = Boolean(enabled)
    this.key_effects_background.el.style.backgroundColor =
      this.key_effects_enabled
        ? 'rgba(31, 139, 92, 0.78)'
        : 'rgba(70, 70, 70, 0.78)'
    this.setLocale()
  }

  setSongSelectHandler (handler) {
    this.song_select_handler = typeof handler === 'function'
      ? handler
      : null
  }

  setSongScrollHandler (handler) {
    this.songScrollHandler = typeof handler === 'function'
      ? handler
      : null
  }

  showLanguageMenu (selectedLocale) {
    this.dialogOpen = true
    this.setLanguageSelection(SUPPORTED_LOCALES.indexOf(selectedLocale))
    this.language_dialog.show()
  }

  hideLanguageMenu () {
    this.dialogOpen = false
    this.language_dialog.hide()
  }

  showImportSourceMenu (selectedIndex = 0) {
    this.dialogOpen = true
    this.setImportSourceSelection(selectedIndex)
    this.setImportSourceNotice()
    this.importSourceDialog.show()
  }

  hideImportSourceMenu () {
    this.dialogOpen = false
    this.importSourceDialog.hide()
  }

  showLibraryEditor (songs) {
    this.dialogOpen = true
    this.libraryEditorDialog.show(songs)
  }

  hideLibraryEditor () {
    this.dialogOpen = false
    this.libraryEditorDialog.hide()
  }

  setLibraryEditorCursor (index) {
    this.libraryEditorDialog.setCursor(index)
  }

  setLibraryEditorSelection (ids) {
    this.libraryEditorDialog.setSelectedIds(ids)
  }

  showLibraryDeleteConfirmation (count) {
    this.libraryEditorDialog.showConfirmation(count)
  }

  hideLibraryDeleteConfirmation () {
    this.libraryEditorDialog.hideConfirmation()
  }

  setImportSourceSelection (index) {
    const safeIndex = Math.max(0, Math.min(
      this.importSourceRows.length - 1,
      index,
    ))
    for (let position = 0; position < this.importSourceRows.length; position++) {
      const selected = position === safeIndex
      this.importSourceBackgrounds[position].el.style.backgroundColor =
        selected ? 'rgba(255,255,255,0.24)' : 'rgba(70,70,70,0.88)'
      this.importSourceMarkers[position].text(selected ? '✓' : '')
      this.importSourceRows[position].el.setAttribute(
        'aria-checked',
        String(selected),
      )
    }
  }

  setImportSourceNotice (key = '') {
    this.importSourceNotice.text(key ? this.i18n.t(key) : '')
  }

  showSortMenu (selectedIndex, direction, collectionName) {
    this.dialogOpen = true
    this.sort_dialog_scope.text(this.i18n.t('sort.scope', {
      collection: collectionName,
    }))
    this.setSortSelection(selectedIndex)
    this.setSortDirection(direction)
    this.sort_dialog.show()
  }

  hideSortMenu () {
    this.dialogOpen = false
    this.sort_dialog.hide()
  }

  showAbout () {
    this.dialogOpen = true
    this.about_dialog.show()
  }

  hideAbout () {
    this.dialogOpen = false
    this.about_dialog.hide()
  }

  showResetMenu () {
    this.dialogOpen = true
    this.reset_dialog.show()
  }

  hideResetMenu () {
    this.dialogOpen = false
    this.reset_dialog.hide()
  }

  setLanguageSelection (index) {
    const safeIndex = Math.max(0, Math.min(
      this.language_option_rows.length - 1,
      index,
    ))
    this.language_selection = safeIndex
    for (let position = 0; position < this.language_option_rows.length; position++) {
      const selected = position === safeIndex
      this.language_option_backgrounds[position].el.style.backgroundColor =
        selected ? 'rgba(255,255,255,0.24)' : 'rgba(70,70,70,0.88)'
      this.language_option_markers[position].text(selected ? '✓' : '')
      this.language_option_rows[position].el.setAttribute(
        'aria-checked',
        String(selected),
      )
    }
  }

  setSortSelection (index) {
    const safeIndex = Math.max(0, Math.min(
      this.sort_option_rows.length - 1,
      index,
    ))
    for (let position = 0; position < this.sort_option_rows.length; position++) {
      const selected = position === safeIndex
      this.sort_option_backgrounds[position].el.style.backgroundColor =
        selected ? 'rgba(255,255,255,0.24)' : 'rgba(70,70,70,0.88)'
      this.sort_option_markers[position].text(selected ? '✓' : '')
      this.sort_option_rows[position].el.setAttribute(
        'aria-checked',
        String(selected),
      )
    }
  }

  setSortDirection (direction) {
    this.sort_direction = direction === 'desc' ? 'desc' : 'asc'
    const label = this.i18n.t('sort.directionLabel', {
      direction: this.i18n.t(`sort.direction.${this.sort_direction}`),
      arrow: this.sort_direction === 'asc' ? '↑' : '↓',
    })
    this.sort_direction_label.text(label)
    this.sort_direction_button.el.setAttribute('aria-label', label)
    this.sort_direction_background.el.style.backgroundColor =
      this.sort_direction === 'asc'
        ? 'rgba(38, 121, 154, 0.78)'
        : 'rgba(132, 76, 154, 0.78)'
  }

  setSortState (mode, direction) {
    this.sort_mode = SONG_SORT_MODES.includes(mode) ? mode : 'added'
    this.sort_direction = direction === 'desc' ? 'desc' : 'asc'
    const label = this.i18n.t('menu.sort', {
      field: this.i18n.t(`sort.mode.${this.sort_mode}`),
      arrow: this.sort_direction === 'asc' ? '↑' : '↓',
    })
    this.sort_label.text(label)
    this.sort_button.el.setAttribute(
      'aria-label',
      this.i18n.t('common.labelWithHint', {
        label,
        hint: this.i18n.t('menu.sortHint'),
      }),
    )
  }

  setImportHint (key, values = {}) {
    this.importHintKey = key
    this.importHintValues = values
    this.import_music_hint.text(this.i18n.t(key, values))
  }

  setSongList (collection) {
    // Clear all child
    while (this.songs_list_container.el.firstChild) {
      this.songs_list_container.el.removeChild(this.songs_list_container.el.lastChild)
    }
    this.song_list_item = []

    // If the collection is empty
    if (collection.children.length === 0) {
      this.empty_text.show()
      this.empty = true
      return
    }

    this.empty_text.hide()
    this.empty = false

    let position = 0
    for (const c of collection.children) {
      let group
      if (c instanceof SongCollection) {
        group = Group(0, position * 100, 620, 100, [
          Txt(0, 24, 720, 36).text(displayCollectionName(c, this.i18n.locale)).font(SongFont.size(36)).color(White).noOverflow(),
          Txt(0, 0, 720, 18).text(this.i18n.t('common.collection')).font(SongFont.size(22)).color(White),
          Txt(-40, 28, 30, 30).fill(Gray).radius(5),
        ])
      } else {
        const color = c.media_type === 'youtube' ? BadgeYouTube : c.media_type === 'video' ? BadgeVideo : BadgeAudio
        group = Group(0, position * 100, 620, 100, [
          Txt(0, 24, 440, 36).text(displaySongTitle(c, this.i18n.locale)).font(SongFont.size(36)).color(White).noOverflow(),
          Txt(0, 0, 440, 18).text(c.artist).font(SongFont.size(22)).color(White).noOverflow(),
          Txt(450, 25, 155, 34)
            .text(`${Number(c.cpm) || 0} CPM`)
            .font(NumberFont.size(22))
            .color(Gray)
            .align(CENTER)
            .noOverflow(),
          Txt(-40, 28, 30, 30).text(c.language.toUpperCase()).font(UIFont.size(18)).align(CENTER).color(White).fill(color).radius(5),
        ])
      }

      group.el.style.transition = 'transform 0.2s ease'
      group.el.style.cursor = 'pointer'
      group.el.setAttribute('role', 'button')
      group.el.setAttribute('aria-label', c instanceof SongCollection
        ? displayCollectionName(c, this.i18n.locale)
        : displaySongTitle(c, this.i18n.locale))
      const itemPosition = position
      group.el.addEventListener('click', () => {
        this.song_select_handler?.(itemPosition)
      })
      this.songs_list_container.el.appendChild(group.el)
      this.song_list_item.push(group)

      position++
    }

    this.current_position = 0
  }

  setSongListPosition (position) {
    if (this.empty) {
      return
    }

    this.songs_list_container.el.style.transform = `translate(0, ${-position * 100 + 500}px)`

    this.song_list_item[this.current_position].el.style.transform = ''
    this.song_list_item[position].el.style.transform = 'translate(-50px, 0)'

    this.current_position = position
  }

  updateGameMode(mode) {
    this.current_mode = mode
    this.demo_mode_enabled = mode === 'auto'
    this.demo_mode_background.el.style.backgroundColor =
      this.demo_mode_enabled
        ? 'rgba(118, 76, 180, 0.84)'
        : 'rgba(70, 70, 70, 0.78)'
    this.game_mode_banner.text(mode === 'normal' ? '' : this.i18n.t(`menu.mode.${mode}`))
    const demoModeLabel = this.i18n.t('menu.demoMode', {
      state: this.i18n.t(
        this.demo_mode_enabled ? 'common.enabled' : 'common.disabled',
      ),
    })
    this.demo_mode_label.text(demoModeLabel)
    this.demo_mode_button.el.setAttribute(
      'aria-pressed',
      String(this.demo_mode_enabled),
    )
    this.demo_mode_button.el.setAttribute(
      'aria-label',
      this.i18n.t('common.labelWithHint', {
        label: demoModeLabel,
        hint: this.i18n.t('menu.demoModeHint'),
      }),
    )
  }
}
