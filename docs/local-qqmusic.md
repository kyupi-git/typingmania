# Local QQ Music library

This feature is available on Windows and requires the local server. For the
bundled Windows x64 release, double-click `start-game.cmd`; neither Node.js nor
npm needs to be installed.

For development or another supported platform with Node.js 20 or newer:

```sh
npm install
npm run start-local -- --open
```

The Windows launcher stops only a service previously started for this exact
project directory, starts a fresh background service, and opens a dedicated
Edge game window. The service binds immediately, and recovery/initial scanning
finish on the game loading screen. Double-clicking again replaces that
project-owned service and window without touching unrelated processes.

## Startup library scan

At startup, the local server recursively searches the project
directory for `.typingmania` files. It reads only the package table and
`song.json` during the scan, deduplicates songs by QQ Music song MID or by a
canonical artist/title plus a five-second duration tolerance, and rebuilds
`data/songs.json`. A high-confidence cross-language alias appended by QQ Music
is removed from the displayed title and does not create a duplicate. Real
parenthetical title text is retained when uncertain, while explicit version,
performance, mix, and numbering labels such as `Live`, `feat.`, `TV Version`,
`Part 2`, or `Another ver.` remain visible and distinct.

Background maintenance normalizes QQ Music package titles, removes unverified
cross-language aliases, corrects outdated lyric timing/quality metadata, and
revalidates direct animation, film, television, documentary, commercial,
variety, sports-event, visual-novel, JRPG, and game origins that lack reliable
provenance. Audio and existing verified attachments are preserved.
Removed aliases and raw dirty titles are not retained. Catalog results are
cached locally, preserve each song's own role and episode numbers, and are
skipped after repeated network failures.

The scan excludes `.git`, `node_modules`, `.agents`, `.codex`, and
`QQMusicCache`.

## Add songs from QQ Music

Choose **Add music**, then **QQ Music**, or press `Q` and select QQ Music from
the provider list.

The importer performs these checks in order:

1. Confirm that `QQMusic.exe` is running and contains a logged-in session.
2. Look for `QQMusicCache` and `QQMusicDownloads` in the project directory.
3. Look for cache and download roots on each local/removable drive.
4. Try paths found in QQ Music process memory, `QQMUSIC_CACHE_DIR`,
   `QQMUSIC_DOWNLOAD_DIR`, common user folders, and QQ Music configuration.
5. Show an in-game 1–500-song target menu (10 by default), sort cached/downloaded `.mflac` and `.mgg` files by
   modification time, and continue until that many new, different, usable
   songs have been added or the cache is exhausted.
   Ordinary MP3, FLAC, M4A, AAC, MP4, OGG, and WAV downloads use the same
   strict local-media workflow plus QQ Music's metadata, lyric, pronunciation,
   cover, and origin checks. Provider identity must agree before a package is
   written.
6. Resolve a cache media MID through official metadata or an exact
   QRC-title/artist search fallback, then verify identity and expected media
   properties with QQ Music's official service.
7. Separate a high-confidence cross-language title alias from the original
   title. Preserve real subtitles, versions, performances, mixes, and numbered
   parts; keep uncertain parentheticals unchanged.
8. Preserve evidently native performer names locally. For a suspicious
   localized Japanese name, query QQ Music's domestic singer detail in a batch
   and select its single native primary name instead of a translated or alias
   list. Leave the artist blank if the original cannot be verified.
9. Remove timed title, performer, lyricist, composer, arranger, and producer
   rows before pairing lyrics with pronunciation. Reject instrumental/BGM,
   no-lyrics placeholders, and timelines without substantial distinct vocals.
10. Match every remaining lyric line one-to-one with the exact song's QRC Roma
    timeline. Word separators, sokuon apostrophes, and display-only symbols
    are removed from typing, while creative readings supplied by the karaoke
    timeline are preserved even when they differ from the written word.
11. Require every lyric line to have a valid ASCII input string and complete
   per-syllable timing. A song with even one unpaired or display-only lyric
   line is rejected.
12. Compare the complete normalized lyric sequence and, when supplied, the
    official online Roma sequence. A checked text or pronunciation mismatch is
    rejected.
13. Parse animation, film, television, documentary, commercial, variety,
    sports-event, visual-novel, JRPG, game, and other soundtrack credits into
    a structured direct work title, medium, season, episode, role, and
    sequence. Official/provider evidence is checked first, then specialist
    catalogs, encyclopedic cross-checks, and verified official media.
    AniSongDB/Bangumi verify anime; Bangumi, TVmaze, optional TMDB, and a
    fail-closed Wikidata route cover other productions. A manga, novel, or
    other pre-adaptation work is never substituted for the direct production.
14. For screen-related songs, search QQ Music by the exact title and performer
    and prefer an album matching the direct work or soundtrack. Otherwise use
    the track's exact official 500×500 album cover, then a validated local
    cover. If no optional artwork can be proved, use the neutral bundled image.
15. Fetch the per-song ekey, decrypt QMC2 audio in memory, detect the resulting
    FLAC, OGG, MP3, or MP4 container, validate full duration, and create a
    local `.typingmania` package. A cache entry that the signed-in account
    cannot access is reported and skipped without stopping eligible free tracks.

Incomplete audio, missing pronunciation, incomplete or insubstantial vocal
text, and metadata mismatches are skipped instead of being added to the
library. Missing optional images alone do not reject a playable song. Already
validated songs are skipped by their stored media MID before any network work
when possible. Existing songs, duplicate candidates, rejected candidates, and
packages that require a quality refresh do not consume the selected new-song
target. Clicking the menu action again therefore continues with the next
validated songs rather than stopping at the first cached entries.

### Automatic lyric reconciliation

Reconciliation is deterministic and requires no user choices:

1. Rank up to eight local QRC candidates using title, explicit version label,
   performer, album, duration, and Roma availability.
2. Fetch the official timed lyric once for the exact QQ Music song MID.
3. Remove metadata rows from both sources and establish one-to-one timeline
   anchors within 500 milliseconds.
4. Replace a local display line only when its timestamp and normalized text are
   sufficiently similar to the official line.
5. Recover a missing QRC display line only when both an unused official line
   and an unused local Roma line share the same timestamp. Pronunciation is
   never invented from a dictionary or guessed from Kanji.
6. Validate both directions of the complete text sequence at 99.5% coverage,
   validate every Roma syllable timeline, and choose the highest-scoring
   candidate.
7. Measure normal milliseconds per playable key for this recording and cap
   only statistically obvious long line windows, preventing a following
   instrumental break from becoming typing time for the previous lyric.

If confidence is insufficient, the candidate is discarded and the importer
continues looking for another cached song. If the online service is temporarily
unavailable, Japanese pronunciation is accepted offline only when the main QRC
and `_qmRoma.qrc` share the same cache identity, the title matches exactly, the
duration is within two seconds, the artist or soundtrack album agrees, and
every playable line has complete Roma timing. Otherwise the song is skipped;
the importer never substitutes a `latin-table` or dictionary guess. Validated
packages record separate text and pronunciation fingerprints, evidence
versions, coverage, and repair counts in `song.json`.

For a QQ Music import, the confirmed Roma is used directly after removing
spaces, underscores, apostrophes, and display-only symbols. `latin-table`
continues to provide kana input variants for ordinary song packages, but it
does not decide how an imported Kanji or lyric phrase should be pronounced.

### Direct production titles

The QQ Music subtitle is retained as source evidence, but newly imported
anime-related packages also store a structured `origin` object. The
`work_title` belongs to the exact production that uses the song and never
changes with the interface language. For example, an anime theme names the
anime's official release, not the manga or novel it adapted. The same rule
applies to TV dramas, films, animated films, games, and other direct sources.
Only descriptors such as TV anime, movie, season, episode, opening, ending, or
insert song are localized by the game.

An origin is displayable only when its provenance comes from the direct
audiovisual catalog record or from an explicitly matching soundtrack album.
Named release-edition titles may be selected from that record; relationship
fields such as `原作` are never title candidates. The song language can select
an explicitly labeled release edition, but cannot by itself invent or
translate a title. A localized catalog label, an old unverified origin, or the
raw Chinese QQ Music subtitle is not displayed.

The shared resolver caches results in the Git-ignored
`data/song-origin-cache.json`. Packages without current origin metadata are
revalidated when the importer encounters them; audio, lyrics, and cover bytes
are preserved. If the catalog cannot be reached twice in one import, remaining
catalog lookups are skipped for that batch. A strong QQ Music soundtrack-title
match remains available as an offline fallback. An ambiguous or missing result
leaves the origin line blank and never blocks an otherwise playable import. A
negative result is retried after seven days.

Catalog requests contain only the work title parsed from QQ Music metadata.
They do not contain the QQ Music cookie, account identifier, ekey, audio, or
lyrics.

### Original artist names

QQ Music's track metadata can localize a performer, for example
`七音阿卡莉 (NANAOAKARI)`, even when the artist's own name is
`ナナヲアカリ`. The importer retains each singer MID and the unmodified track
label for matching local QRC files, but never uses that label blindly for
display.

Names that are already unambiguously native—such as kana, established Latin
stage names, and explicit role credits—are accepted without a request.
Suspicious bilingual labels and simplified-character substitutions in
Japanese names are resolved through QQ Music's domestic
`u.y.qq.com` singer-detail service. Requests are batched, use a short timeout,
and stop for the current import after two consecutive network failures. A
successful result is cached for one year in the Git-ignored
`data/qqmusic-artist-cache.json`; an authoritative response with no usable
original is retried after seven days.

The display value is one native primary name, not QQ Music's translated label,
romanized alias, pronunciation in parentheses, or a comma-separated alias
list. If the original remains uncertain during a network outage, the displayed
artist is blank. The raw label is retained for lyric and album matching and as
provenance inside the private generated package/cache; it is never used as the
displayed fallback. This makes loss of enrichment visible without silently
presenting a translation as the original.

### Artwork selection and network fallback

Screen-related cover matching requires an exact song title and performer
match, then ranks albums by the direct work name and soundtrack/theme-song wording.
Live, remix, karaoke, unrelated cover, and performance-video results are
penalized. The exact track album remains the fallback, followed by a validated
local `QQMusicPicture` image. The selected strategy and album MID are recorded
in `song.json`. When a verified Bangumi, TVmaze, TMDB, or Wikidata production record is
available, the importer verifies that the direct production title or one of
its explicitly labeled release titles matches the stored origin, and only then
downloads its current large poster. The poster is
used as the full background and the validated QQ Music album artwork remains
visible as a separate cover card: upper-left during song selection and
upper-right during gameplay. A missing, mismatched, or unreachable poster
never blocks the song.

Poster validation has its own version and timestamp. It is repeated after 30
days because upcoming production entries often start with provisional
artwork. Packages are rewritten atomically when a
due check succeeds, preserving their album cover, audio, and lyrics. Startup
performs only due checks in the background; repeated catalog failures defer
the remaining optional work rather than delaying play.

To refresh artwork in local packages without rebuilding audio or lyrics, run:

```sh
npm run refresh-qqmusic-covers
npm run refresh-media-posters
```

QQ Music requests use domestic `qq.com` and `gtimg.cn` services with one
bounded retry for transient network or server errors. When an optional search,
cover, or artist request exhausts that budget, an in-process circuit breaker
skips the same enhancement for the rest of the batch and the importer
continues with local data. Repeated required metadata or ekey failures stop the
batch with a clear network message instead of hanging.

Network lookup starts from a regional profile inferred from system locale/time
zone or `TMN_NETWORK_REGION`, then reorders sources by live success, failure
cooldown, and latency. Mainland profiles start with QQ Music, NetEase, KuGou,
and Bangumi; other profiles can prefer LRCLIB, iTunes Search, MusicBrainz,
TVmaze, TMDB, and Wikidata. Mainland China, Hong Kong/Macau, Taiwan, Japan,
South Korea, Southeast Asia, the United States, Europe, and global profiles
have separate safe starting orders. Bangumi's `bgm.tv`, `bangumi.tv`,
`chii.in`, and API routes share one short budget. Exhausting optional routes hides an uncertain origin
or poster instead of delaying or rejecting a playable local song. Official
online lyric comparison is optional when stricter local QRC/Roma
reconciliation already proves a complete match.

## Restoring the starter library

Choose **Reset library** in the main menu, select all imported sources or one
provider, and confirm in the compact dialog. A full reset restores the baseline declared in
`scripts/local/library-baseline.js`: exactly three checksum-verified Chinese,
English, and Japanese starter packages.

The reset removes every other `.typingmania` package found under the game
directory, including invalid packages, plus generated provider directories,
private lookup caches, and generated trial data. Browser-side high scores are
cleared and `data/songs.json` is rebuilt. If any starter package is missing or
changed, all three are rebuilt and checked against their recorded SHA-256
values before the reset proceeds.

The scanner skips symbolic links and excludes every directory named
`QQMusicCache`, case-insensitively. The source cache is never modified.

## Privacy

- The server binds to `127.0.0.1` only.
- Import APIs require a random same-origin session token.
- QQ Music cookies and ekeys are not printed or persisted by the importer.
- Generated packages are written to `data/qqmusic`, which is ignored by Git.
- Resolved work titles are stored only in generated packages and the ignored
  local origin cache.
- Resolved artist names are stored only in generated packages and the ignored
  local artist cache; singer-detail cache entries contain public names and
  singer MIDs, never cookies or account data.
- `QQMusicCache` is ignored by Git.
- No generated audio, lyrics, cover, cookie, or ekey is intended to be pushed
  to the source repository.

## Offline runtime and redistribution

The Windows x64 project package carries an unmodified official Node.js
v24.18.0 LTS archive. `start-game.cmd` verifies its SHA-256 checksum and
extracts only its required `node.exe` under `data/runtime` on first launch. The
production-only npm dependency tree is pinned and stored under
`vendor/runtime`, including the QMC/WebAssembly conversion library, the
JavaScript audio validator, and `pinyin-pro` for offline Chinese pronunciation.
A new player therefore does not need npm or an external conversion executable.

The following components must still be supplied by the user:

- the official QQ Music client and an account entitled to access each song;
- a supported browser;
- the user's private cache and generated song library.

The source package includes three generated starter songs, so the game remains
playable and its Chinese, English, and Japanese typing paths remain testable
when QQ Music is not installed or no personal cache is available. The songs
contain no third-party music or account data.

Redistributing open-source runtime code requires keeping its license and
copyright text, not merely naming it in the README. The complete inventory and
license locations are in `THIRD-PARTY-NOTICES.md`. The conversion library's
open-source license does not grant rights to QQ Music software or content; see
`QQMUSIC-INTEROPERABILITY-NOTICE.md` and
`MUSIC-SERVICE-INTEROPERABILITY-NOTICE.md` before distributing an importer.
