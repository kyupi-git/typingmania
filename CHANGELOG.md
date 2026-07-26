# Changelog

Notable TypingManiaNovel changes are documented here. Versions use the planned
release date in `YYYYMMDD` form.

## [20260726] - 2026-07-26

### Added

- Added NetEase Cloud Music, Apple Music, and recursive local-folder import to
  the existing QQ Music workflow. Complete ordinary downloads and validated
  client-cache media use one provider-neutral audio, lyric, pronunciation,
  artwork, direct-work, packaging, and privacy pipeline.
- Added an in-game import-size selector: 10 songs by default, 1–500 per run.
  Imports and song-info refreshes can be stopped with `Esc` or `Backspace`;
  completed songs/updates remain saved and the latest five failures include
  their stage and reason.
- Added source-scoped reset, multi-song editing, and same-provider duplicate
  review. Duplicate suggestions use provider IDs plus conservative
  title/artist/duration similarity and never preselect the best remaining copy.
- Added optional MV playback, off by default. Provider MV records are tried
  before region-ordered Bilibili/YouTube/Niconico search. Exact MVs require title,
  artist, version, duration, decoded-audio correlation, coverage, and constant
  timeline-offset checks. If none passes, verified official footage from the
  direct production may run as a muted loop; otherwise the poster remains.
  Accepted media is normalized to browser-safe H.264 MP4, and legacy
  audio-only caches are rejected. The album cover is always retained.
- Added region-aware, self-tuning lookup routes for mainland China, Hong
  Kong/Macau, Taiwan, Japan, South Korea, Southeast Asia, the United States,
  Europe, and global use. Bounded
  timeouts, observed latency, failure cooldown, and safe blank-field fallback
  apply to lyrics, pronunciation, music catalogs, posters, and optional MVs.
- Added automatic direct-origin handling for TV animation, anime films,
  live-action television/film, documentaries, commercials, variety shows,
  sports events, visual novels, JRPGs, and games. Adaptation source material
  is not substituted for the production that actually used the song.
- Added separate Chinese pentatonic-pop, English pop-rock, and Japanese
  anime/J-pop arrangements for the three public starter songs.
- Added bundled, checksum-verified Windows runtimes for NetEase conversion,
  Apple Music interoperability, and MV audio/timeline verification.

### Changed

- Moved main-menu shortcut letters into their buttons, removed the separate
  hint strips, replaced unreliable song-language badges with neutral markers,
  and removed the translucent spectrum layer behind pending lyrics.
- Starter songs now bypass optional MV lookup. QQ Music import now scans both
  MFLAC and MGG QMC2 caches, recovers metadata through exact lyric-assisted
  media-ID matching when the direct endpoint cannot, validates the decrypted
  container and full duration, and continues past account-ineligible tracks.
- Tightened automatic instrumental-gap repair and library auditing. Stored
  reference average/peak CPM is rebuilt from the same perfect-demo event
  schedule used by results, after repaired lyric windows are applied.
- Preserved TypingMania NEO's score arithmetic and rank thresholds, including
  its current-frame line-start timing, so scores remain comparable with the
  fork baseline.
- Expanded predictive Keyfall with immediate low-cost green/red input pulses,
  tiered streak glow, milestone bursts, full-screen feedback, and a reduced
  motion profile.
- Unified imported-song repair across languages: multilingual credit/title
  filtering, instrumental/BGM rejection, long interlude-window repair,
  recording-specific Japanese readings, offline Chinese pinyin, and
  letter-only input while displayed spaces and punctuation remain intact.
- Expanded identity and artwork verification across QQ Music, NetEase,
  KuGou, LRCLIB, iTunes Search, MusicBrainz/Cover Art Archive, AniSongDB,
  AnimeThemes, AniList, Bangumi, TVmaze, optional TMDB, and fail-closed
  Wikidata/Wikimedia Commons routes. Existing
  trusted information is not overwritten by an ambiguous or translated result;
  an unverified localized artist alias in a legacy package is hidden until a
  trustworthy original name can be resolved.
- Improved high-CPM rendering recovery, first-lyric lead-in, Latin lyric
  bounds, menu scrolling/sorting, collection artwork, result pacing/charts,
  provider-specific import backdrops, launcher readiness reporting, and
  project-scoped fresh-start/termination behavior. The launcher replaces this
  copy's previous service and dedicated Edge window without touching unrelated
  browser or Node processes, and calibrates the Edge client/game area to
  `1920 × 1080` by default, outside its title bar and frame.
- Made accepted MV downloads a stable persistent song cache that survives
  unrelated package metadata changes. A cache miss or failed load now switches
  MV playback off to avoid repeated lookups on later songs. Song-info refresh
  also aborts the active network stage immediately on `Esc`/`Backspace` while
  retaining completed atomic updates.
- Updated the application version from `20260719` to `20260726`.

### Privacy and distribution

- The public tree and Windows archive contain only the three generated starter
  songs. Account cookies, ekeys, music-client caches, imported packages,
  selected local files, downloaded MVs, posters, covers, logs, staging data,
  and per-player library state are excluded and audited.
- The local service listens on `127.0.0.1`; mutating or expensive APIs require
  a random same-origin session token. Imported originals are never moved or
  modified.

## [20260719] - 2026-07-19

### Added

- Renamed the product to TypingManiaNovel and introduced Chinese, English, and
  Japanese interface localization.
- Added the one-click Windows x64 launcher and terminator, bundled Node.js
  runtime, automatic local-library scanning, and static-hosting support.
- Added QQ Music cache/download import with QMC2 conversion, QRC/Roma lyric
  matching, Chinese pinyin, original-title/artist cleanup, direct anime origin,
  poster/album artwork, deduplication, and private local packaging.
- Added predictive Keyfall, perfect Demo Play, unified required-key pace
  statistics, expanded results charts, sorting, mouse-wheel navigation,
  multi-song editing, clean reset, and three public starter songs.

### Changed

- Made letters the only required input while keeping spaces and punctuation in
  displayed lyrics.
- Preferred Hepburn Japanese romanization order while preserving accepted
  alternative spellings.

[20260726]: https://github.com/kyupi-git/typingmania/releases/tag/v20260726
[20260719]: https://github.com/kyupi-git/typingmania/releases/tag/v20260719
