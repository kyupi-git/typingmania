# Local NetEase Cloud Music library

This importer is available in the Windows x64 local edition. It covers all
complete media forms produced by current and older desktop clients:

- `.ncm` subscription downloads;
- ordinary MP3, FLAC, M4A, AAC, MP4, OGG, and WAV downloads;
- `.uc` and `.uc!` cache files that can be proved complete.

## Before importing

1. Start the NetEase Cloud Music Windows client and sign in.
2. Download a song or let it finish caching completely.
3. Open **Add music** and choose **NetEase Cloud Music**.

The importer checks `NETEASE_CLOUD_MUSIC_DIR`, `NETEASE_MUSIC_DIR`, and
`NETEASE_MUSIC_CACHE_DIR`, then project-local folders, conventional user music
locations, app-data locations, and common CloudMusic installation/download
folders (including `Tools`, `Apps`, and both Program Files roots) on each
mounted drive. These environment variables are optional overrides for custom
client storage.

## Discovery, conversion, and completeness

Candidates are ordered by modification time and deduplicated by path. NCM
metadata is read before the bundled C++ ncmdump 1.5.1 runs in an isolated
temporary directory. Exactly one FLAC or MP3 output is accepted.

Ordinary downloads are parsed directly. They must contain a usable title and
artist, match one provider record by normalized title, artist, and a
five-second duration window, and then match the detailed provider duration.

NetEase cache bytes use the historical XOR-`0xA3` representation. Both `.uc`
and `.uc!` occur across client generations, so the suffix alone is never used
as a completeness claim. The importer extracts a numeric track ID, decodes the
bytes in memory, requires a real MP3 or FLAC header, parses a playable duration,
compares it with NetEase track metadata, and requires an exact match with one
of the provider's published complete-quality byte lengths. A missing size,
fragment, malformed stream, duration mismatch, or size mismatch is rejected;
the original cache is never changed.

Every path then uses the same checks: substantial vocal timed lyrics,
language-specific metadata filtering, full pronunciation coverage, duplicate
detection, optional artwork/direct-production enrichment, and atomic package
writing. Direct-production checks cover animation, film, television,
documentary, commercial, variety, sports, visual-novel, JRPG, and game use.
Instrumentals, BGM, no-lyrics placeholders, and credit-only timelines are
rejected. Start-only LRC timelines are checked against this recording's
normal milliseconds per playable key so a following interlude is not assigned
to the previous line. Lyrics can be reconciled against exact QQ Music,
NetEase, KuGou KRC, or LRCLIB timelines; regional priority, success, failure
cooldown, and latency adapt route order. Japanese lines containing Kanji
prefer explicit ruby or a verified track-specific timed reading. When no
trusted online reading is available, bundled dictionary output may fill
playable gaps but remains pending. Missing optional art uses a neutral bundled
image rather than discarding an otherwise playable song.

The lyric resolver checks several safely matched release records from QQ Music,
NetEase, and KuGou when the first record has main lyrics but no pronunciation.
It also verifies that the playable text is the original-language lyric layer.
A Chinese translation attached to a Japanese recording is rejected even when
it has a complete timeline and pinyin; the source audio remains untouched and
can be tried again after another verified pronunciation source becomes
available.

Artist labels are treated independently from lyric language. Japanese artists
shown as an all-Han localized alias are checked through singer details and an
independent exact-track catalog before they can replace the provider's native
credit. If proof is temporarily unavailable, a trustworthy provider or
embedded label may remain with a white `*` pending marker; biography,
copyright, unknown, and poisoned values remain blank.

The same strict metadata path is available later through **Refresh song info**
inside **Song info & editing**.
NetEase track details and album artwork require the stored numeric track ID to
still match the title, artist, and duration. Work-title and poster enrichment
uses a strict cross-catalog recording match and keeps any conflicting existing
origin or attachment unchanged.
When exact provider artwork is reachable, it is preferred to the image embedded
in the downloaded audio because the provider track ID and release can be
verified. Embedded artwork remains the offline fallback. Bangumi production
and poster requests can use health-ranked official site aliases and public
API/image mirrors after the official route fails. The two compatible NetEase
API endpoints are also ranked separately by the non-blocking startup preflight.
No NetEase session material is sent to Bangumi mirrors.

The player selects 1–500 songs (10 by default) in an in-game submenu. The batch stops after that
many newly added tracks or when candidates are exhausted. A smaller available
set is a normal partial result, not an error. Running the action again skips
stored track IDs and equivalent artist/title/duration records and continues
with newer remaining candidates. Client installation resources are excluded
before counting; rejected candidates are reported by stage and reason rather
than collapsed into one ambiguous skip total.

## Local components and privacy

`tools/importers/netease/ncmdump.exe` is the pinned upstream C++ build. The
runtime verifier checks its SHA-256 hash, version, and license. No executable
or package is downloaded at import time. The C++ implementation was selected
because an upstream report describes tail corruption in a Go port; every
conversion is still media- and duration-validated.

Original downloads, cache files, local client directories, conversion staging,
lyrics, artwork, and generated packages are excluded from Git and public
release audits. Reset can remove only TypingManiaNovel's NetEase packages or
all imported packages; it never deletes a CloudMusic download/cache directory.
