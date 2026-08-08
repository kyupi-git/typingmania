import Screen from '../graphics/screen.js'
import { Box, Group, Txt } from '../graphics/elements.js'
import {
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
import { CENTER, Fill } from '../graphics/styles.js'
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
import NetworkStatusDialog from './network-status-dialog.js'
import PlayStyleDialog from './play-style-dialog.js'
import { APP_VERSION, PROJECT_URL } from '../app-meta.js'

const IMPORT_SOURCES = ['qqMusic', 'netease', 'appleMusic', 'localFolder']
const RESET_SOURCES = ['all', 'qqMusic', 'netease', 'appleMusic', 'localFolder']
const WHEEL_STEP_THRESHOLD = 32
const ABOUT_CREDIT_GROUPS = Object.freeze([
  {
    key: 'about.credit.foundation',
    links: [
      ['TypingMania NEO', 'https://github.com/innocenat/typingmania'],
      ['Preact', 'https://github.com/preactjs/preact'],
      ['HTM', 'https://github.com/developit/htm'],
    ],
  },
  {
    key: 'about.credit.runtime',
    links: [
      ['Node.js', 'https://nodejs.org/'],
      ['Python', 'https://www.python.org/'],
      ['FFmpeg', 'https://ffmpeg.org/'],
      ['music-metadata', 'https://github.com/Borewit/music-metadata'],
      ['Undici', 'https://github.com/nodejs/undici'],
    ],
  },
  {
    key: 'about.credit.qqInterop',
    links: [
      [
        '@clamber_l/crypto',
        'https://www.npmjs.com/package/@clamber_l/crypto',
      ],
    ],
  },
  {
    key: 'about.credit.neteaseInterop',
    links: [
      ['ncmdump', 'https://github.com/taurusxin/ncmdump'],
    ],
  },
  {
    key: 'about.credit.appleInterop',
    links: [
      ['gamdl', 'https://github.com/glomatico/gamdl'],
      ['pywidevine', 'https://pypi.org/project/pywidevine/'],
    ],
  },
  {
    key: 'about.credit.language',
    links: [
      ['pinyin-pro', 'https://github.com/zh-lx/pinyin-pro'],
      ['LRCLIB', 'https://www.lrclib.net/'],
    ],
  },
  {
    key: 'about.credit.musicCatalogs',
    links: [
      ['QQ Music', 'https://y.qq.com/'],
      ['NetEase Cloud Music', 'https://music.163.com/'],
      ['Apple Music', 'https://music.apple.com/'],
      [
        'iTunes Search API',
        'https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/',
      ],
      ['KuGou Music', 'https://www.kugou.com/'],
      ['MusicBrainz', 'https://musicbrainz.org/'],
      ['Cover Art Archive', 'https://coverartarchive.org/'],
    ],
  },
  {
    key: 'about.credit.screenCatalogs',
    links: [
      ['AniSongDB', 'https://anisongdb.com/'],
      ['AnimeThemes', 'https://animethemes.moe/'],
      ['AniList', 'https://anilist.co/'],
      ['Bangumi API', 'https://bangumi.github.io/api/'],
      ['VNDB', 'https://vndb.org/d11'],
      ['Steam Store', 'https://store.steampowered.com/'],
      ['TVmaze', 'https://www.tvmaze.com/api'],
      ['TMDB', 'https://www.themoviedb.org/'],
      ['Wikidata', 'https://www.wikidata.org/'],
    ],
  },
  {
    key: 'about.credit.onlinePlayback',
    links: [
      ['yt-dlp', 'https://github.com/yt-dlp/yt-dlp'],
      ['AnimeThemes', 'https://animethemes.moe/'],
      ['Bilibili', 'https://www.bilibili.com/'],
      [
        'YouTube IFrame API',
        'https://developers.google.com/youtube/iframe_api_reference',
      ],
      ['Niconico', 'https://www.nicovideo.jp/'],
    ],
  },
  {
    key: 'about.credit.networkRoutes',
    links: [
      ['Bangumi anibt.net mirror', 'https://bgmapi.anibt.net/'],
      ['Bangumi bangumi.lol mirror', 'https://api.bangumi.lol/'],
      ['Cloudflare trace', 'https://www.cloudflare.com/cdn-cgi/trace'],
      ['IP.SB', 'https://ip.sb/api/'],
      ['ipapi', 'https://ipapi.co/api/'],
    ],
  },
  {
    key: 'about.credit.tooling',
    links: [
      ['esbuild', 'https://github.com/evanw/esbuild'],
      ['Jest', 'https://github.com/jestjs/jest'],
      ['ws', 'https://github.com/websockets/ws'],
    ],
  },
  {
    key: 'about.credit.assets',
    links: [
      ['Simple Icons', 'https://github.com/simple-icons/simple-icons'],
      ['Iosevka', 'https://github.com/be5invis/Iosevka'],
      ['Noto Sans CJK', 'https://github.com/notofonts/noto-cjk'],
      ['Open Sans', 'https://github.com/googlefonts/opensans'],
      [
        'Dustyroom SFX',
        'https://dustyroom.com/free-casual-game-sounds/',
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
    this.music_video_enabled = false
    this.play_style = 'normal'
    this.song_select_handler = null
    this.songScrollHandler = null
    this.dialogOpen = false
    this.wheelDelta = 0
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
    this.import_batch_value = 10
    this.resetScopeBackgrounds = []
    this.resetScopeMarkers = []
    this.resetScopeLabels = []
    this.resetScopeDetails = []
    this.resetScopeRows = []
    this.libraryEditorDialog = new LibraryEditorDialog(i18n)
    this.networkStatusDialog = new NetworkStatusDialog(i18n)
    this.playStyleDialog = new PlayStyleDialog(i18n)
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
      const row = Group(610, 275 + index * 105, 700, 88, [
        this.importSourceBackgrounds[index] = Box(0, 0, 700, 88)
          .stroke(BtnBorder)
          .radius(10),
        this.importSourceMarkers[index] = Txt(24, 0, 54, 88)
          .font(UIFont.size(32))
          .color(White)
          .align(CENTER),
        this.importSourceLabels[index] = Txt(92, 6, 590, 36)
          .font(UIFont.size(28))
          .color(White),
        this.importSourceDetails[index] = Txt(92, 47, 590, 27)
          .font(UIFont.size(18))
          .color(Gray)
          .noOverflow(),
      ])
      row.el.setAttribute('role', 'radio')
      row.el.style.cursor = 'pointer'
      row.el.addEventListener('click', () => {
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: String(index + 1),
          code: POINTER_APPLY_CODE,
        }))
      })
      this.importSourceRows.push(row)
      return row
    })
    const resetScopeOptions = RESET_SOURCES.map((source, index) => {
      const row = Group(610, 275 + index * 92, 700, 76, [
        this.resetScopeBackgrounds[index] = Box(0, 0, 700, 76)
          .stroke(BtnBorder)
          .radius(9),
        this.resetScopeMarkers[index] = Txt(24, 0, 54, 76)
          .font(UIFont.size(28))
          .color(White)
          .align(CENTER),
        this.resetScopeLabels[index] = Txt(92, 4, 590, 32)
          .font(UIFont.size(25))
          .color(White),
        this.resetScopeDetails[index] = Txt(92, 40, 590, 25)
          .font(UIFont.size(16))
          .color(Gray)
          .noOverflow(),
      ])
      row.el.setAttribute('role', 'radio')
      row.el.style.cursor = 'pointer'
      row.el.addEventListener('click', () => {
        window.dispatchEvent(new KeyboardEvent('keydown', {
          key: String(index + 1),
          code: POINTER_APPLY_CODE,
        }))
      })
      this.resetScopeRows.push(row)
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
      // nested music-service collections.
      this.sort_button = Group(1335, 75, 550, 58, [
        Box(0, 0, 550, 58).fill(UIColor).stroke(BtnBorder).radius(8),
        this.sort_label = Txt(12, 0, 526, 58)
          .font(UIFont.size(22))
          .color(White)
          .align(CENTER)
          .noOverflow(),
      ]).layer(130),

      // Music import source selection
      this.import_music_button = Group(30, 930, 145, 80, [
        Box(0, 0, 145, 80).fill(UIColor).stroke(BtnBorder).radius(8),
        this.import_music_label = Txt(7, 0, 131, 80).font(UIFont.size(15)).color(White).align(CENTER).noOverflow(),
      ]).layer(130),

      // Song information, completeness, refresh, deduplication, and deletion.
      this.editLibraryButton = Group(183, 930, 185, 80, [
        Box(0, 0, 185, 80).fill(UIColor).stroke(BtnBorder).radius(8),
        this.editLibraryLabel = Txt(8, 0, 169, 80)
          .font(UIFont.size(15))
          .color(White)
          .align(CENTER)
          .noOverflow(),
      ]).layer(130),

      // Restore the verified starter library and remove every added song
      this.reset_library_button = Group(376, 930, 155, 80, [
        Box(0, 0, 155, 80).fill(UIColor).stroke(BtnBorder).radius(8),
        this.reset_library_label = Txt(7, 0, 141, 80).font(UIFont.size(15)).color(White).align(CENTER).noOverflow(),
      ]).layer(130),

      // Optional falling-key feedback
      this.key_effects_button = Group(539, 930, 110, 80, [
        this.key_effects_background = Box(0, 0, 110, 80)
          .fill(UIColor)
          .stroke(BtnBorder)
          .radius(8),
        this.key_effects_label = Txt(2, 0, 106, 80)
          .font(UIFont.size(12))
          .color(White)
          .align(CENTER)
          .noOverflow(),
      ]).layer(130),

      // Human-paced perfect-play demonstration
      this.play_style_button = Group(657, 930, 270, 80, [
        this.play_style_background = Box(0, 0, 270, 80)
          .fill(UIColor)
          .stroke(BtnBorder)
          .radius(8),
        this.play_style_label = Txt(8, 0, 254, 80)
          .font(UIFont.size(14))
          .color(White)
          .align(CENTER)
          .noOverflow(),
      ]).layer(130),

      // Optional, strictly verified cached music video
      this.music_video_button = Group(935, 930, 110, 80, [
        this.music_video_background = Box(0, 0, 110, 80)
          .fill(UIColor)
          .stroke(BtnBorder)
          .radius(8),
        this.music_video_label = Txt(5, 0, 100, 80)
          .font(UIFont.size(12))
          .color(White)
          .align(CENTER)
          .noOverflow(),
      ]).layer(130),

      // Interface language action
      this.language_button = Group(1053, 930, 110, 80, [
        Box(0, 0, 110, 80).fill(UIColor).stroke(BtnBorder).radius(8),
        this.language_label = Txt(5, 0, 100, 80).font(UIFont.size(12)).color(White).align(CENTER).noOverflow(),
      ]).layer(130),

      // Region selection, live source health, latency, and recent diagnostics.
      this.network_button = Group(1171, 930, 110, 80, [
        Box(0, 0, 110, 80).fill(UIColor).stroke(BtnBorder).radius(8),
        this.network_label = Txt(5, 0, 100, 80)
          .font(UIFont.size(12)).color(White).align(CENTER).noOverflow(),
      ]).layer(130),

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

      // Import provider selection dialog. Every row uses the same provider
      // controller contract and reports progress through one shared panel.
      this.importSourceDialog = Group(0, 0, 1920, 1080, [
        this.importSourceOverlay = Box(0, 0, 1920, 1080).fill(Black),
        Box(510, 155, 900, 790).fill(UIColor).stroke(BtnBorder).radius(12),
        this.importSourceTitle = Txt(580, 205, 760, 58)
          .font(UIFont.size(40))
          .color(White)
          .align(CENTER),
        ...importSourceOptions,
        this.importSourceNotice = Txt(590, 715, 740, 58)
          .font(UIFont.size(21).line(28))
          .color(Gray)
          .align(CENTER)
          .wrap(),
        this.importSourceHint = Txt(590, 830, 740, 34)
          .font(UIFont.size(20))
          .color(Gray)
          .align(CENTER),
      ]).layer(303).hide(),

      // Native import-size stepper. This keeps the complete import flow in
      // the game UI instead of switching to a browser prompt.
      this.importBatchDialog = Group(0, 0, 1920, 1080, [
        this.importBatchOverlay = Box(0, 0, 1920, 1080).fill(Black),
        Box(610, 225, 700, 625).fill(UIColor).stroke(BtnBorder).radius(16),
        this.importBatchTitle = Txt(670, 275, 580, 58)
          .font(UIFont.size(40))
          .color(White)
          .align(CENTER),
        this.importBatchProvider = Txt(680, 345, 560, 38)
          .font(UIFont.size(22))
          .color(Gray)
          .align(CENTER)
          .noOverflow(),
        this.importBatchValue = Txt(710, 405, 500, 125)
          .font(NumberFont.size(104))
          .color(White)
          .align(CENTER),
        this.importBatchMinusTen = Group(680, 555, 125, 64, [
          Box(0, 0, 125, 64).fill(Black).stroke(BtnBorder).radius(8),
          Txt(8, 0, 109, 64).text('−10')
            .font(UIFont.size(27)).color(White).align(CENTER),
        ]),
        this.importBatchMinusOne = Group(825, 555, 125, 64, [
          Box(0, 0, 125, 64).fill(Black).stroke(BtnBorder).radius(8),
          Txt(8, 0, 109, 64).text('−1')
            .font(UIFont.size(27)).color(White).align(CENTER),
        ]),
        this.importBatchPlusOne = Group(970, 555, 125, 64, [
          Box(0, 0, 125, 64).fill(Black).stroke(BtnBorder).radius(8),
          Txt(8, 0, 109, 64).text('+1')
            .font(UIFont.size(27)).color(White).align(CENTER),
        ]),
        this.importBatchPlusTen = Group(1115, 555, 125, 64, [
          Box(0, 0, 125, 64).fill(Black).stroke(BtnBorder).radius(8),
          Txt(8, 0, 109, 64).text('+10')
            .font(UIFont.size(27)).color(White).align(CENTER),
        ]),
        this.importBatchConfirm = Group(690, 660, 245, 70, [
          Box(0, 0, 245, 70).fill(UIColor).stroke(BtnBorder).radius(10),
          this.importBatchConfirmLabel = Txt(12, 0, 221, 70)
            .font(UIFont.size(26)).color(White).align(CENTER),
        ]),
        this.importBatchCancel = Group(985, 660, 245, 70, [
          Box(0, 0, 245, 70).fill(Black).stroke(BtnBorder).radius(10),
          this.importBatchCancelLabel = Txt(12, 0, 221, 70)
            .font(UIFont.size(26)).color(White).align(CENTER),
        ]),
        this.importBatchHint = Txt(665, 770, 590, 36)
          .font(UIFont.size(18))
          .color(Gray)
          .align(CENTER)
          .noOverflow(),
      ]).layer(304).hide(),

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

      // Choose between a full reset and one import source.
      this.resetScopeDialog = Group(0, 0, 1920, 1080, [
        this.resetScopeOverlay = Box(0, 0, 1920, 1080).fill(Black),
        Box(510, 155, 900, 790).fill(UIColor).stroke(BtnBorder).radius(12),
        this.resetScopeTitle = Txt(580, 205, 760, 58)
          .font(UIFont.size(40))
          .color(White)
          .align(CENTER),
        ...resetScopeOptions,
        this.resetScopeHint = Txt(590, 810, 740, 42)
          .font(UIFont.size(20))
          .color(Gray)
          .align(CENTER),
      ]).layer(309).hide(),

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
      this.playStyleDialog.group.layer(318),
      this.networkStatusDialog.group.layer(320),
    ])

    this.empty = true

    // List move animation
    this.songs_list_container.el.style.transition = 'transform 0.2s ease'
    this.song_list_item = []
    this.current_position = 0

    for (const label of [
      this.import_music_label,
      this.editLibraryLabel,
      this.reset_library_label,
      this.key_effects_label,
      this.play_style_label,
      this.music_video_label,
      this.language_label,
      this.network_label,
      this.about_label,
      this.sort_label,
    ]) {
      label.el.style.textShadow =
        '0 2px 4px rgba(0,0,0,0.95), 0 0 8px rgba(0,0,0,0.72)'
    }
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
    this.play_style_button.el.style.cursor = 'pointer'
    this.play_style_button.el.setAttribute('role', 'button')
    this.play_style_button.el.setAttribute('aria-haspopup', 'dialog')
    this.play_style_button.el.addEventListener('click', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }))
    })
    this.music_video_button.el.style.cursor = 'pointer'
    this.music_video_button.el.setAttribute('role', 'button')
    this.music_video_button.el.addEventListener('click', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v' }))
    })
    this.language_button.el.style.cursor = 'pointer'
    this.language_button.el.setAttribute('role', 'button')
    this.language_button.el.addEventListener('click', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'l' }))
    })
    this.network_button.el.style.cursor = 'pointer'
    this.network_button.el.setAttribute('role', 'button')
    this.network_button.el.addEventListener('click', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n' }))
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
    this.importBatchOverlay.el.style.opacity = '0.72'
    this.importBatchOverlay.el.style.cursor = 'pointer'
    this.importBatchOverlay.el.addEventListener('click', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    this.importBatchDialog.el.setAttribute('role', 'dialog')
    this.importBatchDialog.el.setAttribute('aria-modal', 'true')
    const batchActions = [
      [this.importBatchMinusTen, 'PageDown'],
      [this.importBatchMinusOne, 'ArrowDown'],
      [this.importBatchPlusOne, 'ArrowUp'],
      [this.importBatchPlusTen, 'PageUp'],
      [this.importBatchConfirm, 'Enter'],
      [this.importBatchCancel, 'Escape'],
    ]
    for (const [element, key] of batchActions) {
      element.el.style.cursor = 'pointer'
      element.el.setAttribute('role', 'button')
      element.el.addEventListener('click', () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key }))
      })
    }
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
    this.about_credits_container.el.style.padding = '10px 12px'
    this.about_credits_container.el.style.boxSizing = 'border-box'
    this.about_credits_container.el.style.background = 'rgba(7, 12, 20, .38)'
    this.about_credits_container.el.style.borderRadius = '8px'
    this.about_credits_container.el.style.isolation = 'isolate'
    this.about_credits_container.el.style.zIndex = '2'
    this.about_credits_container.el.style.transform = 'translateZ(0)'
    this.about_credits_container.el.setAttribute('tabindex', '0')
    this.resetScopeOverlay.el.style.opacity = '0.72'
    this.resetScopeOverlay.el.style.cursor = 'pointer'
    this.resetScopeOverlay.el.addEventListener('click', () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    this.resetScopeDialog.el.setAttribute('role', 'dialog')
    this.resetScopeDialog.el.setAttribute('aria-modal', 'true')
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
      row.style.position = 'relative'
      row.style.zIndex = '1'

      const description = document.createElement('div')
      description.textContent = this.i18n.t(group.key)
      description.style.color = '#b8bdc7'
      description.style.fontFamily = 'Open Sans, sans-serif'
      description.style.fontSize = '16px'
      description.style.lineHeight = '23px'
      description.style.whiteSpace = 'normal'
      row.appendChild(description)

      const links = document.createElement('div')
      links.style.display = 'flex'
      links.style.flexWrap = 'wrap'
      links.style.gap = '4px 13px'
      links.style.position = 'relative'
      links.style.zIndex = '1'
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
    const withKey = (label, key) => t('common.labelWithKey', {
      label,
      key,
    })
    this.select_key.text(t('key.space'))
    this.select_label.text(t('common.select'))
    this.parent_key.text(`${t('key.escape')} / ${t('key.backspace')}`)
    this.parent_label.text(t('common.goParent'))
    this.empty_text.text(t('common.empty'))
    const importLabel = withKey(t('menu.importMusic'), 'Q')
    this.import_music_label.text(importLabel)
    this.import_music_button.el.setAttribute('aria-label', importLabel)
    const editLabel = withKey(t('menu.editLibrary'), 'E')
    this.editLibraryLabel.text(editLabel)
    this.editLibraryButton.el.setAttribute('aria-label', editLabel)
    const resetLabel = withKey(t('menu.resetLibrary'), 'D')
    this.reset_library_label.text(resetLabel)
    this.reset_library_button.el.setAttribute('aria-label', resetLabel)
    const keyEffectsLabel = t('menu.keyEffects', {
      state: t(
        this.key_effects_enabled ? 'common.enabled' : 'common.disabled',
      ),
    })
    const keyEffectsButtonLabel = withKey(keyEffectsLabel, 'K')
    this.key_effects_label.text(keyEffectsButtonLabel)
    this.key_effects_button.el.setAttribute('aria-label', keyEffectsButtonLabel)
    this.key_effects_button.el.setAttribute(
      'aria-pressed',
      String(this.key_effects_enabled),
    )
    const playStyleButtonLabel = t('menu.playStyleWithKey', {
      mode: t(`playStyle.${this.play_style}`),
      key: 'M',
    })
    this.play_style_label.text(playStyleButtonLabel)
    this.play_style_button.el.setAttribute('aria-label', playStyleButtonLabel)
    const musicVideoLabel = t('menu.musicVideo', {
      state: t(
        this.music_video_enabled ? 'common.enabled' : 'common.disabled',
      ),
    })
    const musicVideoButtonLabel = withKey(musicVideoLabel, 'V')
    this.music_video_label.text(musicVideoButtonLabel)
    this.music_video_button.el.setAttribute(
      'aria-label',
      musicVideoButtonLabel,
    )
    this.music_video_button.el.setAttribute(
      'aria-pressed',
      String(this.music_video_enabled),
    )
    const languageLabel = t('menu.language', {
      language: this.i18n.languageName(),
    })
    const languageButtonLabel = withKey(languageLabel, 'L')
    this.language_label.text(languageButtonLabel)
    this.language_button.el.setAttribute('aria-label', languageButtonLabel)
    const networkLabel = withKey(t('menu.network'), 'N')
    this.network_label.text(networkLabel)
    this.network_button.el.setAttribute('aria-label', networkLabel)
    const aboutLabel = withKey(t('menu.about'), 'A')
    this.about_label.text(aboutLabel)
    this.about_button.el.setAttribute('aria-label', aboutLabel)
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
    this.importBatchTitle.text(t('import.batchTitle'))
    this.importBatchConfirmLabel.text(t('import.batchConfirm'))
    this.importBatchCancelLabel.text(t('import.batchCancel'))
    this.importBatchHint.text(t('import.batchHint', { maximum: 500 }))
    this.importBatchDialog.el.setAttribute(
      'aria-label',
      t('import.batchTitle'),
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
    this.resetScopeTitle.text(t('library.reset.selectTitle'))
    this.resetScopeHint.text(t('library.reset.selectHint'))
    this.resetScopeDialog.el.setAttribute(
      'aria-label',
      t('library.reset.selectTitle'),
    )
    for (let index = 0; index < RESET_SOURCES.length; index++) {
      const source = RESET_SOURCES[index]
      const label = t(`library.reset.scope.${source}`)
      const detail = t(`library.reset.scope.${source}Detail`)
      this.resetScopeLabels[index].text(label)
      this.resetScopeDetails[index].text(detail)
      this.resetScopeRows[index].el.setAttribute(
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
    this.libraryEditorDialog.setLocale()
    this.networkStatusDialog.setLocale()
    this.playStyleDialog.setLocale()
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

  setMusicVideoEnabled (enabled) {
    this.music_video_enabled = Boolean(enabled)
    this.music_video_background.el.style.backgroundColor =
      this.music_video_enabled
        ? 'rgba(31, 112, 166, 0.82)'
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

  setImportBatchValue (value) {
    this.import_batch_value = Math.max(
      1,
      Math.min(500, Math.round(Number(value) || 1)),
    )
    this.importBatchValue.text(String(this.import_batch_value))
    this.importBatchValue.el.setAttribute(
      'aria-label',
      this.i18n.t('import.batchCount', {
        count: this.import_batch_value,
      }),
    )
  }

  showImportBatchMenu (value, providerLabel) {
    this.dialogOpen = true
    this.importBatchProvider.text(providerLabel)
    this.setImportBatchValue(value)
    this.importBatchDialog.show()
  }

  hideImportBatchMenu () {
    this.dialogOpen = false
    this.importBatchDialog.hide()
  }

  showResetScopeMenu (selectedIndex = 0) {
    this.dialogOpen = true
    this.setResetScopeSelection(selectedIndex)
    this.resetScopeDialog.show()
  }

  hideResetScopeMenu () {
    this.dialogOpen = false
    this.resetScopeDialog.hide()
  }

  showLibraryEditor (songs, options = {}) {
    this.dialogOpen = true
    this.libraryEditorDialog.show(songs, options)
  }

  hideLibraryEditor () {
    this.dialogOpen = false
    this.libraryEditorDialog.hide()
  }

  showNetworkStatus (status) {
    this.dialogOpen = true
    this.networkStatusDialog.show(status)
  }

  hideNetworkStatus () {
    this.dialogOpen = false
    this.networkStatusDialog.hide()
  }

  setNetworkStatus (status) {
    this.networkStatusDialog.setStatus(status)
  }

  setNetworkCheckBusy (busy) {
    this.networkStatusDialog.setBusy(busy)
  }

  getNetworkProxySettings () {
    return this.networkStatusDialog.proxySettings()
  }

  toggleNetworkLogs () {
    this.networkStatusDialog.toggleLogs()
  }

  showPlayStyleMenu (style) {
    this.dialogOpen = true
    this.playStyleDialog.show(style)
  }

  hidePlayStyleMenu () {
    this.dialogOpen = false
    this.playStyleDialog.hide()
  }

  setPlayStyleSelection (index) {
    this.playStyleDialog.setSelection(index)
  }

  setLibraryEditorCursor (index) {
    this.libraryEditorDialog.setCursor(index)
  }

  setLibraryEditorSelection (ids) {
    this.libraryEditorDialog.setSelectedIds(ids)
  }

  setLibraryEditorSongs (songs) {
    this.libraryEditorDialog.updateSongs(songs)
  }

  setLibraryEditorSort (mode, direction) {
    this.libraryEditorDialog.setSortState(mode, direction)
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

  setResetScopeSelection (index) {
    const safeIndex = Math.max(0, Math.min(
      this.resetScopeRows.length - 1,
      index,
    ))
    for (let position = 0; position < this.resetScopeRows.length; position++) {
      const selected = position === safeIndex
      this.resetScopeBackgrounds[position].el.style.backgroundColor =
        selected ? 'rgba(255,255,255,0.24)' : 'rgba(70,70,70,0.88)'
      this.resetScopeMarkers[position].text(selected ? '✓' : '')
      this.resetScopeRows[position].el.setAttribute(
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

  showResetMenu (scope) {
    this.dialogOpen = true
    const label = this.i18n.t(scope?.labelKey || 'library.reset.scope.all')
    this.reset_dialog_title.text(this.i18n.t('library.reset.confirmTitle', {
      source: label,
    }))
    this.reset_dialog_detail.text(this.i18n.t(
      scope?.id === 'all'
        ? 'library.reset.confirmDetailAll'
        : 'library.reset.confirmDetailSource',
      { source: label },
    ))
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
    const buttonLabel = this.i18n.t('common.labelWithKey', {
      label,
      key: 'S',
    })
    this.sort_label.text(buttonLabel)
    this.sort_button.el.setAttribute('aria-label', buttonLabel)
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
        const pronunciationPending = c.source?.quality?.pronunciation_status === 'pending'
        const artistPending = c.source?.artist_resolution?.status === 'pending' ||
          c.completeness?.artistStatus === 'pending'
        const pending = pronunciationPending || artistPending
        group = Group(0, position * 100, 620, 100, [
          Txt(0, 24, 440, 36).text(displaySongTitle(c, this.i18n.locale)).font(SongFont.size(36)).color(White).noOverflow(),
          Txt(0, 0, 440, 18).text(c.artist).font(SongFont.size(22)).color(White).noOverflow(),
          Txt(450, 25, 155, 34)
            .text(`${Number(c.cpm) || 0} CPM`)
            .font(NumberFont.size(22))
            .color(Gray)
            .align(CENTER)
            .noOverflow(),
          Txt(-40, 22, 30, 40)
            .text(pending ? '*' : '•')
            .font(UIFont.size(24))
            .align(CENTER)
            .color(White),
        ])
      }

      group.el.style.transition = 'transform 0.2s ease'
      group.el.style.cursor = 'pointer'
      group.el.setAttribute('role', 'button')
      const pendingLabels = []
      if (!(c instanceof SongCollection)) {
        if (c.source?.quality?.pronunciation_status === 'pending') {
          pendingLabels.push(this.i18n.t('menu.song.pendingPronunciation'))
        }
        if (c.source?.artist_resolution?.status === 'pending' ||
          c.completeness?.artistStatus === 'pending') {
          pendingLabels.push(this.i18n.t('menu.song.pendingArtist'))
        }
      }
      group.el.setAttribute('aria-label', [c instanceof SongCollection
        ? displayCollectionName(c, this.i18n.locale)
        : displaySongTitle(c, this.i18n.locale), ...pendingLabels]
        .filter(Boolean).join(' · '))
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
    this.play_style = mode === 'auto'
      ? 'demo'
      : mode === 'assist'
        ? 'simple'
        : 'normal'
    this.play_style_background.el.style.backgroundColor =
      mode === 'auto'
        ? 'rgba(118, 76, 180, 0.84)'
        : mode === 'assist'
          ? 'rgba(38, 121, 154, 0.82)'
        : 'rgba(70, 70, 70, 0.78)'
    this.game_mode_banner.text(mode === 'normal' ? '' : this.i18n.t(`menu.mode.${mode}`))
    const buttonLabel = this.i18n.t('menu.playStyleWithKey', {
      mode: this.i18n.t(`playStyle.${this.play_style}`),
      key: 'M',
    })
    this.play_style_label.text(buttonLabel)
    this.play_style_button.el.setAttribute(
      'aria-label',
      buttonLabel,
    )
  }
}
