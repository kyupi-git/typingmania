# Local Apple Music library

This importer is available in the Windows x64 local edition and uses the
player's signed-in Apple Music account. It accepts song, album, and playlist
URLs that the account can play; artist-page URLs are intentionally rejected
because they do not identify a bounded set of recordings. A subscription is
not presented as a universal prerequisite, although an individually restricted
track still requires the corresponding account entitlement.

## Before importing

1. Start the Apple Music Windows app and sign in.
2. Sign in to `music.apple.com` in Edge, Chrome, or Firefox on the same
   account. TypingManiaNovel first tries to read only that browser's Apple-domain
   cookies into the current temporary import directory.
3. If browser extraction is unavailable, export that site's Netscape-format
   cookies to one of these private paths:
   - the path named by `APPLE_MUSIC_COOKIES`;
   - `data/apple-music/cookies.txt` inside the game directory; or
   - `%USERPROFILE%\.gamdl\cookies.txt`.
4. Open **Add music**, choose **Apple Music**, and paste a song, album, or
   playlist URL.

The cookie must contain `media-user-token`. Automatically extracted data is
filtered to Apple domains and deleted with the current staging directory. A
manually supplied file is passed to the bundled helper in place and is never
copied into a song package, log, source archive, or release. The local file
remains the user's responsibility and is excluded by the repository privacy
rules.

## Conversion and validation

The importer launches an embedded Python 3.13.14 runtime and gamdl 3.8.3 in a
unique temporary directory. It disables user configuration, pins the
`aac-web` route, requests synchronized LRC, saves 1200-pixel artwork, and uses
track IDs as filenames. Its local runner filters existing Apple track IDs
before media transfer and stops at the player's 1–500-song target across all
pasted links, so a large playlist is not downloaded in full. Running the
action again continues beyond the stored IDs.

Only AAC 256 M4A output is accepted. The game parses the audio metadata and
duration, requires a playable `mp4a` sample entry, rejects a remaining `enca`
entry, extracts a valid embedded album cover, and pairs the exact companion LRC
before creating a package. Multiple artist tags are preserved when supplied.

After core media validation, Apple Music uses the same catalog-enrichment path
as the other importers. iTunes Search, MusicBrainz, and reachable domestic
catalogs can cross-check title, complete artist credit, release, and duration.
A strict match may supply a direct-production role hint; AniSongDB/Bangumi
verify animation, visual-novel, JRPG, and game subjects, while TVmaze,
optional TMDB, and a fail-closed Wikidata route cover live-action film,
television, documentary, commercial, variety, and sports productions. An
unavailable route is skipped quickly and leaves the optional origin blank,
without blocking an otherwise playable track.

Apple packages also participate in **Refresh song info** inside **Song info &
editing**. Their embedded Apple
album cover is retained; iTunes Search is used only for metadata
cross-checking, not as an artwork redistribution path. Only independently
verified identity fields, a strictly matched direct-production title, and an
identity-verified poster may be added. Existing conflicting origin data or
artwork is never overwritten.

English letters and Chinese pinyin are handled locally. Apple synchronized LRC
does not consistently expose Japanese creative readings, so a track containing
Kanji is matched by title, artist, album, and duration against NetEase's public
track record and prefers its timed `romalrc` or explicit ruby. If no trusted
online reading can be proved, bundled dictionary output may fill playable gaps
and the song remains pending rather than presented as verified.

## Local components

The complete helper runtime is stored under `tools/importers/apple-music/`.
Players do not need Python, pip, Node.js, npm, a wrapper service, or a runtime
package download. The Windows release includes the validated helper runtime,
so normal play never downloads or installs these components.

The stable AAC-web route avoids the wrapper and API limitations that affect
current non-web codec paths such as ALAC and Dolby Atmos. Python 3.13 is pinned
because Python 3.14 has a reported compatibility problem upstream. Unique
staging avoids output-name and permission collisions, and all output is
validated before it reaches the library. Authentication expiry, rate limiting,
unavailable lyrics, and malformed media fail the current candidate promptly
and leave existing songs unchanged.

## Privacy

Cookies, temporary downloads, subscription identifiers, media, lyrics,
artwork, and generated packages are excluded from Git and public release
audits. Temporary files are removed after success or failure. The reset submenu
can remove only TypingManiaNovel's generated Apple Music packages or all
imported packages. It does not modify the Apple Music app or the browser's
cookie store.
