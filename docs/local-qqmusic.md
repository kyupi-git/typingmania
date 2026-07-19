# Local QQ Music library

This feature is available on Windows and requires the local server. For the
bundled Windows x64 release, double-click `start-game.cmd`; neither Node.js nor
npm needs to be installed.

For development or another supported platform with Node.js 20 or newer:

```sh
npm install
npm run start-local -- --open
```

The Windows launcher checks
the local service first, starts it in the background only when necessary, waits
until the library scan is ready, and then opens the game in the default browser.
It is safe to double-click again while the service is already running.

## Startup library scan

Before serving the game, the local server recursively searches the project
directory for `.typingmania` files. It reads only the package table and
`song.json` during the scan, deduplicates songs by QQ Music song MID or by a
canonical artist/title plus a five-second duration tolerance, and rebuilds
`data/songs.json`. A high-confidence cross-language alias appended by QQ Music
is removed from the displayed title and does not create a duplicate. Real
parenthetical title text is retained when uncertain, while explicit version,
performance, mix, and numbering labels such as `Live`, `feat.`, `TV Version`,
`Part 2`, or `Another ver.` remain visible and distinct.

Before rebuilding the index, startup normalizes QQ Music package titles,
removes unverified cross-language aliases, and revalidates anime origins that
lack reliable provenance. Audio, lyrics, and cover bytes are preserved.
Removed aliases and raw dirty titles are not retained. Catalog results are
cached locally, preserve each song's own role and episode numbers, and are
skipped after repeated network failures.

The scan excludes `.git`, `node_modules`, `.agents`, `.codex`, and
`QQMusicCache`.

## Add songs from QQ Music

Choose **Add music**, then **QQ Music**, or press `Q` and select QQ Music.

The importer performs these checks in order:

1. Confirm that `QQMusic.exe` is running and contains a logged-in session.
2. Look for `QQMusicCache` in the project directory.
3. Look for `QQMusicCache` at the root of each local/removable drive.
4. Try cache paths found in QQ Music process memory, `QQMUSIC_CACHE_DIR`,
   common user folders, and QQ Music configuration files.
5. Sort cached `.mflac` files by modification time and continue scanning until
   20 new, different, usable songs have been added or the cache is exhausted.
6. Verify metadata and expected FLAC size with QQ Music's official service.
7. Separate a high-confidence cross-language title alias from the original
   title. Preserve real subtitles, versions, performances, mixes, and numbered
   parts; keep uncertain parentheticals unchanged.
8. Preserve evidently native performer names locally. For a suspicious
   localized Japanese name, query QQ Music's domestic singer detail in a batch
   and select its single native primary name instead of a translated or alias
   list. Leave the artist blank if the original cannot be verified.
9. Remove timed title, performer, lyricist, composer, arranger, and producer
   rows before pairing lyrics with pronunciation.
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
13. Parse anime openings, endings, insert songs, character songs, and image
    songs into a structured work title, medium, season, episode, role, and
    sequence. Prefer a verified Japanese soundtrack title from QQ Music;
    otherwise query the public Bangumi anime catalog by the localized work
    title. The mainland-accessible `bgm.tv` search page is tried before the
    slower API endpoint. Exact original/localized/alias matches and tightly
    bounded fuzzy matches are accepted, with season, TV/movie, song-title, and
    performer evidence used to rank ambiguities.
14. For anime openings, endings, insert songs, character songs, and image
    songs, search QQ Music by the exact title and performer and prefer an album
    matching the anime work or soundtrack. Otherwise use the track's exact
    official 500×500 album cover, with a validated local cover as fallback.
15. Fetch the per-song ekey, decrypt QMC2 audio in memory, validate the FLAC,
    and create a local `.typingmania` package.

Incomplete audio, missing pronunciation, incomplete text, metadata mismatches,
and invalid images are skipped instead of being added to the library. Already
validated songs are skipped by their stored media MID before any network work
when possible. Existing songs, duplicate candidates, rejected candidates, and
packages that require a quality refresh do not consume the batch's 20 new-song
slots. Clicking the menu action again therefore adds the next 20 validated
songs rather than stopping at the first 20 cached entries.

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

The resolver caches results in the Git-ignored
`data/qqmusic-origin-cache.json`. Packages without current origin metadata are
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

### Cover selection and network fallback

Anime-related cover matching requires an exact song title and performer match,
then ranks albums by the anime work name and soundtrack/theme-song wording.
Live, remix, karaoke, unrelated cover, and performance-video results are
penalized. The exact track album remains the fallback, followed by a validated
local `QQMusicPicture` image. The selected strategy and album MID are recorded
in `song.json`. When a verified Bangumi subject ID is available, the importer
also reads the current subject page and API record, verifies that the direct
production title or one of its explicitly labeled release titles matches the
stored origin, and only then downloads its current large poster. The poster is
used as the full background and the validated QQ Music album artwork remains
visible as a separate cover card: upper-left during song selection and
upper-right during gameplay. A missing, mismatched, or unreachable poster
never blocks the song.

Poster validation has its own version and timestamp. It is repeated after 30
days because entries for upcoming anime are often created with provisional
artwork and updated near broadcast. Packages are rewritten atomically when a
due check succeeds, preserving their album cover, audio, and lyrics. Startup
performs only due checks in the background; repeated catalog failures defer
the remaining optional work rather than delaying play.

To refresh artwork in local packages without rebuilding audio or lyrics, run:

```sh
npm run refresh-qqmusic-covers
npm run refresh-qqmusic-posters
```

QQ Music requests use domestic `qq.com` and `gtimg.cn` services with one
bounded retry for transient network or server errors. When an optional search,
cover, or artist request exhausts that budget, an in-process circuit breaker
skips the same enhancement for the rest of the batch and the importer
continues with local data. Repeated required metadata or ekey failures stop the
batch with a clear network message instead of hanging.

Original-work and subject-page lookup tries Bangumi's three official website
domains—`bgm.tv`, `bangumi.tv`, and `chii.in`—within one shared short budget,
then falls back to `api.bgm.tv`. Poster download can also fall back to the
official subject-image API route. Exhausting those routes disables optional
catalog enrichment for the rest of the batch. It hides the origin or poster
instead of delaying or rejecting a playable local song. Official online lyric
comparison is optional when the stricter local QRC/Roma reconciliation already
proves a complete match.

## Restoring the starter library

Choose **Restore starter library** in the main menu, or press `D`. A compact
dialog requires a second confirmation before anything is changed. The local
service then restores the baseline declared in
`scripts/local/library-baseline.js`: exactly three checksum-verified Chinese,
English, and Japanese starter packages.

The reset removes every other `.typingmania` package found under the game
directory, including invalid packages, plus generated `data/qqmusic`, the
private origin lookup cache, and generated trial data. Browser-side high scores
are cleared and `data/songs.json` is rebuilt. If any starter package is missing
or changed, all three are rebuilt and checked against their recorded SHA-256
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
`QQMUSIC-INTEROPERABILITY-NOTICE.md` before distributing the importer.
