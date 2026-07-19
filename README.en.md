# TypingManiaNovel

[简体中文](README.md) | **English** | [日本語](README.ja.md)

**Version: 20260719**

TypingManiaNovel is a multilingual lyrics-typing rhythm game based on
[TypingMania NEO](https://github.com/innocenat/typingmania). It supports
Chinese, English, and Japanese songs, local or static-web play, predictive
Keyfall feedback, Demo Play, library management, and an optional QQ Music
cache importer for Windows.

> **Import from QQ Music:** with QQ Music running and signed in, the game can
> automatically decrypt cached audio, validate lyrics and pronunciation, find
> suitable artwork, and turn songs into playable tracks.

Download
[`TypingManiaNovel-20260719-Windows-x64.zip`](https://github.com/kyupi-git/typingmania/releases/download/v20260719/TypingManiaNovel-20260719-Windows-x64.zip)
from Releases, extract it, and double-click `start-game.cmd`. The archive
includes the runtime and three starter songs, so Node.js and npm are not
required.

The repository contains three original starter songs in Chinese, English, and
Japanese. It contains no QQ Music cache, imported media, account session,
listening history, or other personal library data.

## Quick start

### Windows 11 x64

1. Download or clone the complete repository.
2. Double-click `start-game.cmd`.
3. Play in Edge or another modern browser.

No Node.js or npm installation is required. The launcher verifies and extracts
the bundled Node.js runtime on first use, starts one localhost service for this
project directory, waits for the song scan, and opens the game. Starting it
again reuses that service.

Double-click `terminate.cmd` to stop the service for this project. It uses the
project's localhost session token and does not terminate unrelated
`node.exe` processes.

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
| Launch | Run from a web server or hosted site | One-click Windows launcher with bundled runtime, service reuse, and scoped termination; static hosting remains supported |
| Interface | Primarily English; keyboard-only menus | Browser-language detection, Chinese/English/Japanese UI, language picker, mouse selection, and wheel navigation |
| Song library | Static index, URL selection, and drag-and-drop `.typingmania` files | Startup scan, deduplication, nested collections, artwork previews, and sorting by added time, required keys/min, title, or artist in either direction |
| Import | User-prepared song packages | Optional QQ Music cache import in successive 20-song batches, with session detection, decryption, validation, and deduplication |
| Lyrics | Manual preparation, including Japanese Kanji readings | Language-specific metadata filtering for Chinese, English, and Japanese; automated Chinese pinyin and song-specific timed Japanese Roma during QQ import |
| Required input | Some spaces and converted punctuation can be typeable | Lyrics keep their displayed spaces and punctuation, but gameplay requires letter keys only |
| Japanese typing | Kana/romaji table with alternate sequences | Preserves the alternate-sequence model and extends it with normalized, separator-free imported readings |
| Artwork and origin | One package image | Direct-production poster background plus album cover when verified; original production title is shown only when provenance is reliable |
| Difficulty | 90th-percentile and maximum CPM | Required keys/min as whole-song average and fastest five seconds, using the same timing model as perfect Demo Play and result statistics |
| Automatic play | Hidden Auto mode can still be affected by player input | Explicit Demo Play performs a deterministic perfect run, keeps its score separate, and demonstrates the required typing pace |
| Feedback | Typing sound and standard game modes | Predictive Keyfall targets, correct/error/missed states, streak aura, pulse, and milestone sound with bounded effects |
| Results | Score, rank, combo, accuracy, and line totals | Expanded scorecard, typing-flow chart, rolling pace chart, reference pace, and delayed transition after the final lyric |
| Library maintenance | No indexed multi-song editor or clean reset | Multi-select deletion with rollback-safe file cleanup and one-click reset to the verified three-song starter library |
| Network behavior | YouTube support for compatible songs | Local-first normal play; bounded regional fallbacks and circuit breakers for optional QQ Music and Bangumi enrichment; YouTube loads only for YouTube-backed packages |
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
- Human-paced perfect Demo Play.
- Required keys/min values aligned across song selection, Demo Play, and
  result statistics.
- Result scorecard, typing-flow analysis, and time-based pace chart.
- Mouse, wheel, and keyboard navigation.
- Sortable nested song collections and multi-select song deletion.
- Three checksum-verified starter songs and one-click library reset.
- Local audio/video plus compatible YouTube-backed `.typingmania` packages.

## Controls

| Context | Action |
| --- | --- |
| Menus | Arrow keys or mouse wheel to move |
| Menus | `Space`, `Enter`, or click to choose |
| Menus | `Escape` or `Backspace` to go back |
| Play | Letter keys to type |
| Play | `Tab` to skip the current lyric |
| Play | `Escape` or `Backspace` to leave the song |
| Anywhere | `Page Up` / `Page Down` to change volume |

The main menu also provides buttons for language, sorting, Keyfall, Demo Play,
music import, song deletion, starter-library reset, and project information.

## Starter library

The three generated starter packages validate each supported lyric path and
are ordered by fixed added-time metadata:

1. Chinese — `指尖星光`
2. English — `Letters in the Light`
3. Japanese — `明日へのリズム`

They use original project audio, lyrics, and SVG artwork, make no network
requests, and contain no data from a music service.

The local server scans the project for `.typingmania` packages at each start,
excludes private cache and tool directories, deduplicates entries, and rebuilds
`data/songs.json`.

## Add music

Open **Add music** and choose a provider:

- **QQ Music** — imports the next 20 different usable cached songs.
- **Other methods [planned]** — a disabled extension point for future
  providers.

QQ Music import requires Windows, a running QQ Music desktop client, a signed-in
session with access to the cached songs, and complete cached audio and QRC
resources. If the client is not running, not signed in, or exposes an unusable
session, the game shows a distinct actionable message in the selected
interface language.

Each import batch:

1. Finds `QQMusicCache` in the project, drive roots, QQ Music process hints,
   common folders, or QQ Music configuration.
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
9. Decrypts QMC2 audio in memory and validates the resulting FLAC.
10. Resolves an original artist name and the exact production that directly
   uses the song.
11. Selects validated album art and, when reliably matched, the production
    poster.
12. Writes one self-contained private package atomically.

Unusable candidates are skipped and do not consume the batch's 20-song target.
Running the action again continues with the next different songs.

Detailed behavior, fallbacks, and privacy boundaries are documented in
[Local QQ Music library](docs/local-qqmusic.md) and
[QQ Music interoperability notice](QQMUSIC-INTEROPERABILITY-NOTICE.md).

## Lyrics, pronunciation, and artwork sources

- Japanese pronunciation comes from the exact song's timed QQ Music Roma QRC,
  so a lyricist-selected reading such as a written word sung with a different
  word is preserved and used directly after separator normalization. The
  `latin-table/` code inherited from
  [TypingMania NEO](https://github.com/innocenat/typingmania) handles kana in
  ordinary song packages; it never chooses or replaces an imported
  song-specific reading.
- Chinese pinyin is generated locally by
  [`pinyin-pro`](https://github.com/zh-lx/pinyin-pro).
- QQ Music supplies authorized track metadata, official timed lyrics, artist
  records, and album artwork during a user-started import.
- [Bangumi](https://bangumi.github.io/api/) is queried for the original title
  and poster of the direct production that uses an anime-related song. The
  resolver does not substitute the manga, novel, or another source work.
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

**Reset library** removes all added packages and generated metadata caches,
clears saved scores, and restores the checksum-verified starter library.
Neither operation modifies any directory named `QQMusicCache`.

## Network and deployment

Normal startup, menus, starter songs, imported local songs, pronunciation,
scoring, Demo Play, Keyfall, and results work locally. Internet access is used
only for a user-started import, optional metadata/artwork maintenance, or a
selected YouTube-backed song.

QQ Music uses domestic service endpoints. Optional production-title and poster
lookup shares a short request budget across Bangumi's official `bgm.tv`,
`bangumi.tv`, and `chii.in` routes and its API. Retries are bounded; repeated
optional failures open a batch circuit breaker, use verified local fallback
data where possible, or leave the optional field blank. Normal play is not
blocked by an unavailable enrichment service.

### Static hosting

```sh
npm run build-game
```

The static build is written to `dist/` and can be deployed to GitHub Pages or
another web host. It plays song packages included in that deployment.

QQ Music import, startup filesystem scanning, transactional deletion/reset, and
packed-artwork extraction require the localhost server and are unavailable in
a purely static deployment. Never include private `data/` content in a public
build.

## Privacy

The local server binds only to `127.0.0.1`. Mutating APIs require a random
same-origin token. QQ Music cookies, account identifiers, and ekeys remain in
memory for the active operation and are not logged or persisted.

Git excludes:

- every `QQMusicCache` directory;
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
endorsed by Tencent, Tencent Music Entertainment, QQ Music, Bangumi, Google,
YouTube, Node.js, or the other projects listed in the notices.
