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

The pinned runtime graph also contains:

| Package | Version | License |
| --- | --- | --- |
| `@borewit/text-codec` | 0.2.2 | MIT |
| `@tokenizer/inflate` | 0.4.1 | MIT |
| `@tokenizer/token` | 0.3.0 | MIT |
| `content-type` | 2.0.0 | MIT |
| `debug` | 4.4.3 | MIT |
| `file-type` | 21.3.4 | MIT |
| `ieee754` | 1.2.1 | BSD-3-Clause |
| `media-typer` | 2.0.0 | MIT |
| `ms` | 2.1.3 | MIT |
| `strtok3` | 10.3.5 | MIT |
| `token-types` | 6.1.2 | MIT |
| `uint8array-extras` | 1.5.0 | MIT |
| `win-guid` | 0.2.1 | MIT |

The complete Node.js license and bundled notices are reproduced at
`tools/runtime/NODE-LICENSE.txt` and remain inside the official runtime
archive. Runtime package license files are kept under
`vendor/runtime/node_modules`, and the pinned graph and integrity hashes are
recorded in `vendor/runtime/package-lock.json`.

## Browser and development components

| Component | Version | Use | License | Project |
| --- | --- | --- | --- | --- |
| Preact | 10.29.7 | Bundled Song Studio UI | MIT | [GitHub](https://github.com/preactjs/preact) |
| HTM | 3.1.1 | Bundled Song Studio templates | Apache-2.0 | [GitHub](https://github.com/developit/htm) |
| esbuild | 0.28.1 | Development build | MIT | [GitHub](https://github.com/evanw/esbuild) |
| Jest | 30.4.2 | Automated tests | MIT | [GitHub](https://github.com/jestjs/jest) |

Preact and HTM license texts are stored beside their vendored modules in
`vendor/editor/`. Development dependencies are not part of the offline player
runtime.

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

QQ Music can provide authorized local cache content, track metadata, timed
lyrics, artist identity, and album artwork. Bangumi can provide the verified
original title and poster for the direct production that uses a song. The
YouTube IFrame API is used only by compatible YouTube-backed song packages.
These services and their data are not redistributed as open-source
components:

- [QQ Music](https://y.qq.com/)
- [Bangumi API](https://bangumi.github.io/api/)
- [YouTube IFrame API](https://developers.google.com/youtube/iframe_api_reference)

No QQ Music client, account, cookie, ekey, cache, imported audio, lyric, cover,
poster, or video is included. Locally resolved records stay in the user's
Git-ignored library. See
`QQMUSIC-INTEROPERABILITY-NOTICE.md` for the importer boundary.

TypingManiaNovel is not affiliated with, endorsed by, or sponsored by Tencent,
Tencent Music Entertainment, QQ Music, Bangumi, Google, YouTube, Node.js, or
the other projects named above.
