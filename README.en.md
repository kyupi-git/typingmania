# TypingManiaNovel

[简体中文](README.md) | **English** | [日本語](README.ja.md)

**Version: 20260726**

[Changelog](CHANGELOG.md) · [20260726 release notes](docs/releases/20260726.md)

TypingManiaNovel is a multilingual lyrics-typing rhythm game based on
[TypingMania NEO](https://github.com/innocenat/typingmania). It supports
Chinese, English, and Japanese songs, local or static-web play, predictive
Keyfall feedback, Demo Play, library management, and importers for QQ Music,
NetEase Cloud Music, Apple Music, and a user-selected local folder.

> **Import and build playable tracks automatically:** QQ Music cache and
> downloads, complete NetEase downloads and cache media, Apple Music links
> available to a signed-in account, and a selected local folder can be
> converted into validated, self-contained offline tracks. Individual
> restricted tracks still require playback access on that account.

## Preview

![Song selection, sorting, and an imported library](./screenshot1.gif)

| Japanese gameplay | English gameplay |
| :---: | :---: |
| ![Japanese-song gameplay](./screenshot2.gif) | ![English-song gameplay](./screenshot3.gif) |

Download
[`TypingManiaNovel-20260726-Windows-x64.zip`](https://github.com/kyupi-git/typingmania/releases/download/v20260726/TypingManiaNovel-20260726-Windows-x64.zip)
from Releases, extract it, and double-click `start-game.cmd`. The archive
includes the runtime, so Node.js and npm are not required. For copyright
reasons, the default library contains only one Chinese, one English, and one
Japanese starter song.

## Quick start

### Windows x64

1. Download or clone the complete repository.
2. Double-click `start-game.cmd`.
3. Play in Edge or another modern browser.

The installation-free launcher currently supports Windows x64 only. Other
platforms can still run the project with Node.js as described below.

No Node.js or npm installation is required. The launcher verifies and extracts
the bundled Node.js runtime on first use, starts one localhost service for this
project directory, binds its port immediately, and opens a dedicated Edge game
window with a `1920 × 1080` game viewport by default. The title bar and frame
sit outside that viewport, so the actual window is slightly larger. Recovery
and the initial song scan finish on the in-game loading screen, so a slow first
scan is not misreported as a port conflict. Starting it again replaces only
this copy's previous service and dedicated Edge game window.

Double-click `terminate.cmd` to stop this project's service and close the
dedicated Edge game window it launched. It verifies the localhost session,
project path, and browser record, and does not terminate unrelated `node.exe`
or normal browser processes.

Do not open `index.html` directly. Browser security rules block some required
local-file operations; use the launcher, a web server, or a static deployment.

### Development and other platforms

Node.js 20 or newer is required when the bundled Windows x64 runtime is not
used:

```sh
npm ci
npm run start-local -- --open
```

## TypingManiaNovel and the TypingMania NEO fork

This product comparison uses the code published in the
[`kyupi-git/typingmania` fork at `82c75d7`](https://github.com/kyupi-git/typingmania/tree/82c75d77396025e1a73c1e710c32e8716f83c734)
as the TypingMania NEO baseline.

| Area | TypingMania NEO fork baseline | TypingManiaNovel |
| --- | --- | --- |
| Identity | TypingMania NEO 1.1.1 | TypingManiaNovel |
| Launch | Start a web server manually or deploy the game to a site | Bundled Windows runtime and one-click `start-game.cmd`, with no deployment required; each launch safely replaces this copy's previous service and dedicated Edge window, while static hosting remains supported |
| Interface | Primarily English; keyboard-only menus | Browser-language detection, Chinese/English/Japanese UI, language picker, mouse selection, and wheel navigation |
| Song library | Static index, URL selection, and drag-and-drop `.typingmania` files | Startup scan, deduplication, nested collections, artwork previews, and sorting by added time, required keys/min, title, or artist in either direction |
| Import | User-prepared song packages | QQ Music, NetEase Cloud Music, Apple Music, and recursive local-folder import with an in-game batch picker, session/media validation, and cross-directory/provider deduplication |
| Lyrics | Manual preparation, including Japanese Kanji readings | Language-specific non-lyric filtering; instrumental/BGM rejection; per-recording correction of instrumental gaps attached to a lyric; local Chinese pinyin; track-specific timed readings for Japanese Kanji |
| Required input | Some spaces and converted punctuation can be typeable | Spaces between English words and punctuation in every language remain visible but are no longer meaningless input targets; gameplay requires letter keys only |
| Japanese typing | Kunrei-style forms lead the kana/romaji order, with alternate sequences accepted | Hepburn-style spellings such as `shi`, `chi`, and `tsu` are preferred to match this fork's typing style; the extra letters can raise the difficulty, while accepted alternatives and song-specific imported readings remain supported |
| Artwork and origin | One package image | Verified direct animation, film, TV, documentary, commercial, variety, sports-event, visual-novel, JRPG, or game-production poster plus album cover; a source work is never substituted for its adaptation, and uncertain fields stay blank |
| Difficulty | 90th-percentile and maximum CPM | Required keys/min as whole-song average and fastest five seconds, using the same timing model as perfect Demo Play and result statistics |
| Automatic play | Hidden Auto mode can still be affected by player input | Explicit Demo Play types the lyrics automatically at a human-like pace; any song can achieve a one-click perfect full combo, and demo scores are kept separate |
| Feedback | Typing sound and standard game modes | Predictive Keyfall targets, immediate green/red input pulse, correct/error/missed states, tiered streak glow, full-screen milestones, and bounded effects |
| Results | Score, rank, combo, accuracy, and line totals | Expanded scorecard, typing-flow chart, rolling pace chart, reference pace, and delayed transition after the final lyric |
| Library maintenance | No indexed multi-song editor or clean reset | Rollback-safe deletion, same-provider duplicate review, source-scoped reset, and safe refresh of origins, original work titles, posters, and album covers |
| Network behavior | YouTube support for compatible songs | Local-first play; initial route profiles for mainland China, Hong Kong/Macau, Taiwan, Japan, South Korea, Southeast Asia, the US, Europe, and global use, then live success/latency reordering across lyric, music-catalog, and screen-catalog sources with bounded fallback |
| Song Studio | Visual editor marked as in development | Local Preact/HTM Song Studio without a public-CDN dependency |
| Verification | Original Jest and build scripts | Unit, library-quality, runtime-integrity, public-tree, static-build, and browser smoke checks |

TypingManiaNovel keeps best-effort compatibility with the original
`.typingmania` package format, including local audio/video and YouTube-backed
songs.

## Main features

- Chinese, English, and Japanese interfaces with automatic initial selection.
- English letter input, tone-free Chinese pinyin, and flexible Japanese
  romaji.
- Letter-only gameplay: spaces and punctuation stay visible but never require
  input.
- Predictive Keyfall targets and lightweight streak celebration effects,
  switchable from the main menu.
- Optional MV playback, off by default. Provider records, Bilibili, YouTube,
  and Niconico are ordered by import source, region, and live route health. A
  recording- and timeline-verified same-version MV is preferred; verified official opening, ending, or
  promotional footage from the direct production may loop as a visual-only
  fallback. Accepted video is cached persistently and reused without another
  download. If the current song has no usable cache and lookup or loading
  fails, MV playback switches itself off to prevent repeated lookups on later
  songs. Album art remains visible.
- Human-paced perfect Demo Play.
- Required keys/min values aligned across song selection, Demo Play, and
  result statistics.
- Result scorecard, typing-flow analysis, and time-based pace chart.
- Mouse, wheel, and keyboard navigation.
- Sortable nested song collections and multi-select song deletion.
- Three checksum-verified starter songs and one-click library reset.
- Bundled QQ Music, NetEase Cloud Music, Apple Music, and local-folder import paths.
- Automatic rejection of instrumentals, BGM, placeholder lyrics, and credit
  rows, plus correction of lyric windows that obviously absorb an interlude.
- Local audio/video plus compatible YouTube-backed `.typingmania` packages.

## Controls

| Context | Action |
| --- | --- |
| Menus | Arrow keys or mouse wheel to move |
| Menus | `Space`, `Enter`, or click to choose |
| Menus | `Escape` or `Backspace` to go back |
| Play | Letter keys to type |
| Play | `Tab` to skip the current lyric (unfinished letters count as misses) |
| Play | `Escape` or `Backspace` to leave the song |
| Anywhere | `Page Up` / `Page Down` to change volume |

The main menu also provides buttons for language, sorting, Keyfall, verified MV playback, Demo Play,
music import, song deletion, starter-library reset, and project information.

## Starter library

The three generated starter packages validate each supported lyric path and
are ordered by fixed added-time metadata:

1. Chinese — `指尖星光`
2. English — `Letters in the Light`
3. Japanese — `明日へのリズム`

Their bundled audio, lyrics, and SVG artwork make no network requests and
contain no data from a music service.

The local server scans the project for `.typingmania` packages at each start,
excludes private cache and tool directories, deduplicates entries, and rebuilds
`data/songs.json`.

## Add music

Open **Add music** and choose a provider:

- **QQ Music** — imports a player-selected batch of different usable cached songs.
- **NetEase Cloud Music** — imports a player-selected batch of complete, distinct NCM,
  ordinary downloads, or verified cache items.
- **Apple Music** — imports a player-selected batch of new tracks from pasted song, album, or
  playlist URLs and an active personal subscription.
- **Local folder** — recursively validates every supported audio, timed lyric,
  and artwork companion in a folder selected by the user.

All converter and language-processing components are bundled; importing never
installs or downloads a tool. See the [music import overview](docs/importing-music.md)
for the shared acceptance boundary.

### QQ Music

QQ Music import requires Windows and a running, signed-in QQ Music desktop
client. It checks both `QQMusicCache` and conventional download directories.
Cached MFLAC, MGG, and QRC receive track-specific validation; ordinary MP3, FLAC, M4A,
AAC, MP4, OGG, and WAV downloads are accepted only after strict tag, duration,
lyric, and QQ Music catalog matching.

Each import batch:

1. Finds cache and download roots in the project, drive roots, QQ Music
   process hints, common folders, or QQ Music configuration.
2. Reads the active session only for the import operation.
3. Selects recent, different cache candidates and deduplicates existing songs.
4. Matches local QRC by title, artist or soundtrack album, duration, text, and
   Roma timing.
5. Removes title, performer, lyricist, composer, arranger, producer, and other
   non-lyric rows using language-specific rules.
6. Reconciles complete timed lyrics against the official response when
   available.
7. Generates tone-free Chinese pinyin locally; Japanese requires a complete
   song-specific `_qmRoma.qrc` reading for every playable line.
8. Cross-checks QQ Music's online Roma response when available. When it is
   unreachable, exact local identity plus complete karaoke timing provides the
   offline proof; an uncertain Japanese reading is rejected rather than
   guessed.
9. Decrypts QMC2 audio in memory, identifies the actual FLAC/OGG container,
   and validates full duration. Subscription-only tracks unavailable to the
   signed-in account are skipped individually while eligible free tracks continue.
10. Resolves an original artist name and the exact production that directly
   uses the song.
11. Selects validated album art and, when reliably matched, the production
    poster.
12. Writes one self-contained private package atomically.

Before each import, the player chooses 1–500 songs (10 by default). `Esc` or
`Backspace` stops at a safe checkpoint, keeps completed songs, and reports the
latest five failures with their stage and reason. Unusable candidates do not
consume the target.
Running the action again continues with the next different songs.

Detailed behavior, fallbacks, and privacy boundaries are documented in
[Local QQ Music library](docs/local-qqmusic.md) and
[QQ Music interoperability notice](QQMUSIC-INTEROPERABILITY-NOTICE.md).

### NetEase Cloud Music

Start and sign in to the Windows client. TypingManiaNovel discovers complete
`.ncm` containers, ordinary MP3/FLAC/M4A/AAC/MP4/OGG/WAV downloads, and `.uc`/`.uc!`
cache formats used by different client versions. NCM uses bundled ncmdump;
ordinary files require strict tags/catalog/duration matching; cache bytes are
decoded and accepted only when the media header, track ID, playable duration,
published complete-file byte count, lyrics, pronunciation,
and artwork all verify. A folder containing fewer candidates than requested returns a
normal partial batch. Japanese Kanji requires the
exact track's timed `romalrc`; an unverified reading is skipped. See the
[local NetEase guide](docs/local-netease.md).

### Apple Music

Start and sign in to the Windows app, then sign in to `music.apple.com` in
Edge, Chrome, or Firefox. The importer first extracts
only Apple-domain session data into temporary storage and falls back to a
private cookie file when browser extraction is unavailable. Paste a song,
album, or playlist URL; the bundled runner skips stored Apple track IDs and
stops at the chosen 1–500-song target before transfer, then produces AAC 256
M4A and synchronized LRC for tracks that account can play. Repeating the
action continues with later tracks.
Every result is then checked for encryption state, media structure, duration,
lyrics, pronunciation, artwork, and duplicates. Japanese Kanji is accepted
only when a recording-specific Roma timeline can be cross-checked. See the
[local Apple Music guide](docs/local-apple-music.md).

### Local folder

Choose a folder and the browser recursively copies supported audio, same-name
LRC, and artwork files to a private localhost staging area. Embedded tags and
artwork are preferred. Region-ranked lyric sources cross-check a same-name LRC;
if its text clearly belongs to another song, the strictly matched provider
timeline is used instead, while an unavailable network can still fall back to a
locally validated sidecar. Chinese pinyin is generated locally, and Japanese
Kanji still requires a recording-specific timed reading. Source files are never
moved or changed, and staging copies are deleted immediately after validation.

All four paths follow the shared
[music-service interoperability notice](MUSIC-SERVICE-INTEROPERABILITY-NOTICE.md).

## Lyrics, pronunciation, and artwork sources

- Japanese pronunciation comes from the exact song's timed QQ Music Roma QRC,
  NetEase `romalrc`, or the romanization layer of a verified KuGou KRC,
  so a lyricist-selected reading such as a written word sung with a different
  word is preserved and used directly after separator normalization. The
  `latin-table/` code inherited from
  [TypingMania NEO](https://github.com/innocenat/typingmania) handles kana in
  ordinary song packages; it never chooses or replaces an imported
  song-specific reading.
- Chinese pinyin is generated locally by
  [`pinyin-pro`](https://github.com/zh-lx/pinyin-pro).
- During a user-started import, the selected music service supplies media the
  user may access, metadata, official timed lyrics, and album artwork. Exact
  catalog and lyric matches from QQ Music, NetEase, KuGou, and
  [LRCLIB](https://www.lrclib.net/) are reordered during the process according
  to the regional starting profile, live success, failure cooldown, and
  latency.
- Track title, complete artist credit, release, and album identity can be
  cross-checked through [Apple iTunes Search](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/),
  [MusicBrainz](https://musicbrainz.org/doc/MusicBrainz_API), and
  [Cover Art Archive](https://musicbrainz.org/doc/Cover_Art_Archive/API).
  Stored identity is corrected only by an exact match or high-confidence
  agreement between two independent catalogs.
- [AniSongDB](https://anisongdb.com/) and
  [AnimeThemes](https://animethemes.moe/) can propose an exact song-to-anime
  production; [AniList](https://anilist.co/) and
  [Bangumi](https://bangumi.github.io/api/) cross-check production IDs,
  original-language titles, and posters. Film and television sources can also be checked
  through Bangumi, [TVmaze](https://www.tvmaze.com/api), and optional
  [TMDB](https://developer.themoviedb.org/reference/search-movie) access. The
  resolver never substitutes a manga, novel, or other pre-adaptation work.
- The [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference)
  is used only by compatible YouTube-backed song packages.

Song-title translation is not a product feature. Stored original song titles
are displayed without an appended cross-language alias. Work titles are shown
only when the direct production's original title can be verified; otherwise
the origin line is left blank.

The in-game **About** dialog links the major components and data sources. A
complete component and license inventory is in
[Third-party notices](THIRD-PARTY-NOTICES.md).

## Artwork presentation

When an imported song has both verified images, its direct-production poster
fills the background and its album art appears as a separate cover card. Song
selection places the card at the upper left; gameplay uses a larger upper-right
card. Portrait posters favor the upper portion of the image so faces are less
likely to be cropped. A missing or unverified poster falls back to album
artwork and never blocks a playable song.

## Timing and results

The song-selection pace values mean:

- **Average** — letter keys required per minute over the complete playable
  typing timeline.
- **Fastest 5 seconds** — the highest rolling five-second letter-key rate.

Demo Play and the result screen use the same letter count, lyric timing, and
window model. A short 3–2–1 lead-in is inserted when the first playable lyric
starts before 1.5 seconds, without shifting the media clock. Natural completion
keeps the playfield visible for 1.4 seconds before showing results.

## Library editing and reset

**Edit songs** supports keyboard and mouse multi-selection. Confirmed deletion
stages the selected packages, rebuilds the index, removes only their saved
scores, prunes unreferenced private metadata, and rolls back interrupted
pre-commit work at the next start. Protected starter packages cannot be
deleted individually.

**Reset library** first asks for a scope. It can remove every imported package
and restore the starter library, or remove only QQ Music, NetEase Cloud Music,
Apple Music, or local-folder songs. It clears only the corresponding scores
and unreferenced metadata. Neither operation changes a music-client cache,
download directory, selected source folder, app, or browser cookie store.

**Refresh info** rechecks every imported song. It reads verifiable records
from the originating provider, then uses independent catalogs to cross-check
title spelling, complete artist credit, release data, and lyric language.
Corrections require either a strict match or high-confidence two-source
consensus. Direct animation, film, TV, documentary, commercial, variety,
sports-event, visual-novel, JRPG, and game origins,
original titles, and posters use the matching production catalog. Conflicting evidence is preserved rather
than overwritten; uncertain new fields stay blank. `Escape` or `Backspace`
immediately aborts the active network stage instead of waiting for its timeout;
already committed atomic updates remain saved.

## Network and deployment

Normal startup, menus, starter songs, imported local songs, pronunciation,
scoring, Demo Play, Keyfall, and results work locally. Internet access is used
only for a user-started import, optional metadata/artwork maintenance, the
first play of an uncached song while MV playback is enabled, or a selected
YouTube-backed song.

No IP geolocation is performed. System locale, time zone, or the optional
`TMN_NETWORK_REGION` value (`cn`, `hk`, `tw`, `jp`, `kr`, `sea`, `us`, `eu`,
or `global`) selects
the initial route profile; actual success, failure, and latency then reorder
it. Mainland China begins with QQ Music, NetEase, KuGou, and Bangumi, while
Hong Kong/Macau, Taiwan, Japan, South Korea, Southeast Asia, the US, Europe,
and global profiles raise reachable LRCLIB, iTunes Search, MusicBrainz,
TVmaze, TMDB, and Wikidata routes as appropriate. Production evidence is
ordered from provider/official records to specialist catalogs, encyclopedic
cross-checks, and official media; media-platform results remain leads until
verified. Each route has a short timeout, bounded retries, failure cooldown,
and batch circuit breaker.
Uncertain optional fields remain blank or use neutral bundled art; only a
track without playable lyrics or a provable required reading is rejected.

### Static hosting

```sh
npm run build-game
```

The static build is written to `dist/` and can be deployed to GitHub Pages or
another web host. It plays song packages included in that deployment.

Music-service import, startup filesystem scanning, transactional
deletion/reset, and packed-artwork extraction require the localhost server and
are unavailable in a purely static deployment. Never include private `data/`
content in a public build.

## Privacy

The local server binds only to `127.0.0.1`. Mutating APIs require a random
same-origin token. QQ Music sessions, NetEase source files, and Apple Music
cookies are used only for a user-started local import and are never written to
public packages, logs, or release files.

Git excludes:

- every `QQMusicCache` directory;
- NetEase `.ncm`/`.uc` content, Apple Music cookies, temporary folder copies,
  and client caches;
- generated content under `data/`;
- imported media, lyrics, covers, posters, sessions, logs, and PID files;
- local reference images and environment files.

Before publishing, run:

```sh
npm run audit-public
```

The audit examines tracked and publishable untracked files for private media,
non-starter packages, user-profile paths, runtime state, and common credential
patterns.

## Song Studio

Start the local server and open:

```text
http://127.0.0.1:8765/preview.html
```

`packer.html` is a compatibility alias. Preact and HTM are stored under
`vendor/editor`, so the editor does not depend on a public CDN. YouTube preview
still requires YouTube; local audio and video preview do not.

## Project layout

```text
assets/              packed and source fonts, interface art, and sound effects
docs/                focused user and interoperability documentation
latin-table/         character normalization and Japanese romaji tables
scripts/             build, audit, server, launcher support, and import logic
scripts/local/       local-library modules and their tests
songs/               three public starter song packages
src/                 browser game, UI, media, typing, effects, and editor code
tools/importers/     pinned offline NetEase and Apple Music import components
tools/runtime/       verified Windows Node.js runtime archive and license
vendor/editor/       local Song Studio browser dependencies and licenses
vendor/runtime/      pinned offline importer dependencies and licenses
```

Generated builds, installed development dependencies, browser automation state,
runtime extraction, and private library data are ignored.

## Verification

```sh
npm test
npm run build-game
npm run audit-library
npm run verify-runtime
npm run audit-public
```

`audit-library` checks only the three starter songs in the public package. Use `npm run audit-local-library` to inspect the complete private library on this computer; doing so never adds private tracks to a release.

Run every check with:

```sh
npm run check
```

Jest runs in one process so the test suite does not leave a worker pool of
`node.exe` processes on Windows.

## License

TypingManiaNovel is licensed under Apache-2.0; see [LICENSE](LICENSE).
Third-party code and assets retain their respective licenses and notices.

TypingManiaNovel is an independent project and is not affiliated with or
endorsed by Tencent, Tencent Music Entertainment, QQ Music, NetEase, NetEase
Cloud Music, Apple, Apple Music, Bangumi, Google, YouTube, Node.js, or the
other projects listed in the notices.
