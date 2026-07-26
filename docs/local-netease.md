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
require a verified track-specific timed reading; the importer never
substitutes a dictionary guess. Missing optional art uses a neutral bundled
image rather than discarding an otherwise playable song.

The same strict metadata path is available later through **Refresh info**.
NetEase track details and album artwork require the stored numeric track ID to
still match the title, artist, and duration. Work-title and poster enrichment
uses a strict cross-catalog recording match and keeps any conflicting existing
origin or attachment unchanged.

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
