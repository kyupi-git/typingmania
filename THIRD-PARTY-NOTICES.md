# Third-party notices

TypingManiaNovel is based on
[TypingMania NEO](https://github.com/innocenat/typingmania), licensed under
Apache-2.0. The Japanese kana/romaji and character-normalization tables in
`latin-table/` are maintained repository code inherited from that project;
they do not call an external romanization service.

## Bundled runtime components

The Windows x64 distribution includes these components so players do not need
to install Node.js or npm:

| Component | Version | License | Project |
| --- | --- | --- | --- |
| Node.js Windows x64 runtime | 24.18.0 LTS | MIT and bundled third-party licenses | [nodejs.org](https://nodejs.org/) |
| `@clamber_l/crypto` | 0.1.12 | MIT and Apache-2.0 | [npm](https://www.npmjs.com/package/@clamber_l/crypto) |
| `music-metadata` | 11.14.0 | MIT | [GitHub](https://github.com/Borewit/music-metadata) |
| `pinyin-pro` | 3.28.1 | MIT | [GitHub](https://github.com/zh-lx/pinyin-pro) |
| `kuromoji` | 0.1.2 | Apache-2.0 | [GitHub](https://github.com/takuyaa/kuromoji.js) |
| `undici` | 6.28.0 | MIT | [GitHub](https://github.com/nodejs/undici) |

The pinned runtime graph also contains:

| Package | Version | License |
| --- | --- | --- |
| `@borewit/text-codec` | 0.2.2 | MIT |
| `async` | 2.6.4 | MIT |
| `@tokenizer/inflate` | 0.4.1 | MIT |
| `@tokenizer/token` | 0.3.0 | MIT |
| `content-type` | 2.0.0 | MIT |
| `debug` | 4.4.3 | MIT |
| `doublearray` | 0.0.2 | MIT |
| `file-type` | 21.3.4 | MIT |
| `ieee754` | 1.2.1 | BSD-3-Clause |
| `lodash` | 4.18.1 | MIT |
| `media-typer` | 2.0.0 | MIT |
| `ms` | 2.1.3 | MIT |
| `strtok3` | 10.3.5 | MIT |
| `token-types` | 6.1.2 | MIT |
| `uint8array-extras` | 1.5.0 | MIT |
| `win-guid` | 0.2.1 | MIT |
| `zlibjs` | 0.3.1 | MIT |

The complete Node.js license and bundled notices are reproduced at
`tools/runtime/NODE-LICENSE.txt` and remain inside the official runtime
archive. Runtime package license files are kept under
`vendor/runtime/node_modules`, and the pinned graph and integrity hashes are
recorded in `vendor/runtime/package-lock.json`.

## Bundled music import components

| Component | Version | Use | License | Project |
| --- | --- | --- | --- | --- |
| ncmdump (C++ Windows x64) | 1.5.1 | Read a user's complete NetEase Cloud Music `.ncm` download | MIT | [GitHub](https://github.com/taurusxin/ncmdump) |
| CPython embedded Windows x64 | 3.13.14 | Isolated Apple Music helper runtime | Python Software Foundation License | [python.org](https://www.python.org/) |
| gamdl | 3.8.3 | Authorized Apple Music AAC and synchronized-lyric retrieval | MIT | [GitHub](https://github.com/glomatico/gamdl) |
| pywidevine | 1.9.0 | License-protocol implementation used inside the gamdl helper | GPL-3.0-only | [PyPI](https://pypi.org/project/pywidevine/) |
| yt-dlp | 2026.7.4 | HTTP media segment download inside the gamdl helper | Unlicense | [GitHub](https://github.com/yt-dlp/yt-dlp) |
| Mutagen | 1.48.1 | Apple Music audio metadata and artwork | GPL-2.0-or-later | [GitHub](https://github.com/quodlibet/mutagen) |
| FFmpeg | N-92722-gf22fcd4483 | MV identity/timeline verification, H.264 compatibility transcoding, and frame checks | GPL-3.0-or-later | [FFmpeg](https://ffmpeg.org/) |

The Apple Music helper also carries gamdl's pinned Python dependency graph.
The installed pure-Python sources and each wheel's supplied `dist-info`
metadata/license files remain under
`tools/importers/apple-music/runtime/Lib/site-packages`. Core license texts are
copied to `tools/importers/apple-music/`, and the CPython standard-library
license remains inside the embedded distribution. See
`tools/importers/README.md` for reproduction and verification details.

These tools run as separate local helper processes. Their files and license
terms remain distinct from TypingManiaNovel's Apache-2.0 application code.

## Browser and development components

| Component | Version | Use | License | Project |
| --- | --- | --- | --- | --- |
| Preact | 10.29.7 | Bundled Song Studio UI | MIT | [GitHub](https://github.com/preactjs/preact) |
| HTM | 3.1.1 | Bundled Song Studio templates | Apache-2.0 | [GitHub](https://github.com/developit/htm) |
| Simple Icons | retrieved 2026-07-22 | NetEase Cloud Music and Apple Music provider glyphs | CC0-1.0 | [GitHub](https://github.com/simple-icons/simple-icons) |
| esbuild | 0.28.1 | Development build | MIT | [GitHub](https://github.com/evanw/esbuild) |
| Jest | 30.4.2 | Automated tests | MIT | [GitHub](https://github.com/jestjs/jest) |
| ws | 8.21.1 | Browser smoke-test protocol client | MIT | [GitHub](https://github.com/websockets/ws) |

Preact and HTM license texts are stored beside their vendored modules in
`vendor/editor/`. Development dependencies are not part of the offline player
runtime. Provider and product marks are used only to identify compatible
import sources; their trademarks remain the property of their owners.

## Fonts and sound effects

The interface assets inherited from TypingMania NEO include:

- [Iosevka Etoile](https://github.com/be5invis/Iosevka), under the SIL Open
  Font License;
- [Noto Sans CJK JP](https://github.com/notofonts/noto-cjk), distributed by
  the upstream project under Apache-2.0;
- [Open Sans](https://github.com/googlefonts/opensans), distributed by the
  upstream project under Apache-2.0;
- [Dustyroom Casual Game Sound — One Shot SFX Pack](https://dustyroom.com/free-casual-game-sounds/),
  under the usage terms published with that pack.

## External data and services

QQ Music and NetEase Cloud Music can provide authorized local content, track
metadata, timed lyrics, artist identity, and album artwork. Apple Music can
provide media and synchronized lyrics for selected URLs playable by the
signed-in account. KuGou Music and LRCLIB can provide a strictly matched
timed-lyric fallback. iTunes Search and MusicBrainz provide independent
track/release identity checks; Cover Art Archive can provide artwork for an
exact MusicBrainz release.

AniSongDB and AnimeThemes can propose the anime production that directly uses
a song. AniList and Bangumi cross-check the production identity, its
original-language title, and poster. VNDB provides visual-novel records, while
Steam can corroborate game and JRPG identities and artwork leads. Bangumi's
cross-medium catalog, TVmaze, and optionally TMDB can verify film, television,
documentary, and variety productions. Wikidata and Wikimedia Commons provide a fail-closed
fallback for verified original titles and posters, including commercials and
sports events. Bilibili, YouTube, and Niconico may provide optional MV or
official production-video leads; downloaded media is accepted only by the
application's identity and media checks, and a media search result never acts
as the sole authority for canonical song, artist, or production identity. The
YouTube IFrame API is used only by compatible YouTube-backed song packages.
When a system or manual proxy is active, Cloudflare trace, IP.SB, or ipapi may
be used to determine only its coarse exit country/region for route ordering.
TypingManiaNovel does not retain the public IP returned by such a service.
These services and their data are not redistributed as open-source
components:

- [QQ Music](https://y.qq.com/)
- [NetEase Cloud Music](https://music.163.com/)
- [Apple Music](https://music.apple.com/)
- [KuGou Music](https://www.kugou.com/)
- [LRCLIB](https://www.lrclib.net/)
- [Apple iTunes Search API](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/)
- [MusicBrainz](https://musicbrainz.org/doc/MusicBrainz_API)
- [Cover Art Archive](https://musicbrainz.org/doc/Cover_Art_Archive/API)
- [AniSongDB](https://anisongdb.com/)
- [AnimeThemes](https://animethemes.moe/)
- [AniList](https://anilist.co/)
- [Bangumi API](https://bangumi.github.io/api/)
- [Bangumi API mirror at anibt.net](https://bgmapi.anibt.net/)
- [Bangumi API mirror at bangumi.lol](https://api.bangumi.lol/)
- [Cloudflare diagnostic endpoint](https://developers.cloudflare.com/fundamentals/reference/cdn-cgi-endpoint/)
- [IP.SB API](https://ip.sb/api/)
- [ipapi](https://ipapi.co/api/)
- [VNDB API](https://api.vndb.org/kana)
- [Steam Store](https://store.steampowered.com/)
- [TVmaze API](https://www.tvmaze.com/api)
- [TMDB API](https://developer.themoviedb.org/reference/search-movie)
- [Wikidata API](https://www.wikidata.org/w/api.php)
- [Wikimedia Commons](https://commons.wikimedia.org/)
- [Bilibili](https://www.bilibili.com/)
- [Niconico](https://www.nicovideo.jp/)
- [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference)

No music-service client, account, cookie, ekey, cache, imported audio, lyric,
cover, poster, or video is included. Players may also select their own local
media folder; its files are processed locally and are never part of a source
release. Locally resolved records stay in the user's Git-ignored library. See
`MUSIC-SERVICE-INTEROPERABILITY-NOTICE.md` for the shared importer boundary and
`QQMUSIC-INTEROPERABILITY-NOTICE.md` for additional QQ Music details.

TypingManiaNovel is not affiliated with, endorsed by, or sponsored by Tencent,
Tencent Music Entertainment, QQ Music, NetEase, NetEase Cloud Music, Apple,
Apple Music, KuGou Music, LRCLIB, AniSongDB, AnimeThemes, AniList, Bangumi,
Wikidata, Wikimedia Commons, Bilibili, Niconico, Cloudflare, IP.SB, ipapi,
Google, YouTube, Node.js,
MusicBrainz, Cover Art Archive, TVmaze, TMDB, or the other projects named
above.
