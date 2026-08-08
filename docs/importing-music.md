# Importing music

Music-service import is available in the Windows x64 local edition. Open
**Add music**, choose a provider, and follow the provider-specific prompt. All
conversion executables and language-processing libraries ship with the game;
the importer never installs a package at play time.

| Provider | Local requirement | Selection | Audio path | Timed pronunciation |
| --- | --- | --- | --- | --- |
| QQ Music | Running, signed-in client; cache or download media | Player-selected 1–500-song target (10 by default) from recent distinct cache/download entries | In-memory QMC2 MFLAC/MGG conversion with container and duration validation, or validated ordinary audio | Explicit ruby or song-specific Roma QRC first; dictionary-assisted readings remain pending |
| NetEase Cloud Music | Running, signed-in client; complete downloads or cache media | Player-selected 1–500-song target (10 by default) from recent distinct candidates | Bundled ncmdump, ordinary audio, or verified `.uc` decoding | `romalrc`, explicit ruby, or a dictionary-assisted pending reading when no trusted online reading is available |
| Apple Music | Running and signed-in Windows app, browser session cookie, and a URL the account can play | Player-selected 1–500-song target (10 by default) from pasted song/album/playlist URLs | Bundled gamdl `aac-web` to AAC 256 M4A | Synced lyrics; cross-checked track-specific ruby/timed reading for Japanese Kanji, with complete dictionary-assisted reading as pending fallback |
| Local folder | A folder selected in the browser | Every supported audio file, up to the safety limit | Verified copy of MP3/FLAC/M4A/AAC/MP4/OGG/WAV | Cross-checked same-name LRC or strictly matched provider timeline; complete dictionary-assisted Japanese reading may remain pending |

The batch target is chosen in a game-native submenu rather than a browser
prompt. Every provider uses the same acceptance boundary: the audio must be
complete, the visible lyric timeline must contain substantial vocal lines,
every line must have a safe input sequence, and provider/track identity must
not duplicate an existing package. Instrumental/BGM titles, no-lyrics
placeholders, and tracks with too little distinct vocal text are rejected.
Verified cover art is preferred; a neutral bundled image is used when artwork
is the only missing optional field. A failed candidate does not consume a
batch slot.

Artist-name cleanup separates a written name from parenthetical pronunciation,
romanization, and translated aliases, refreshing old resolutions when needed.
One catalog's near-spelling cannot overwrite a correct local title: repairs
require strict equivalence, multi-source agreement, or an explicit matching ID
or alias. When exact online proof is unavailable, a trustworthy provider or
embedded label may remain as white `*` pending; biography, copyright, unknown,
and poisoned values remain blank. Character credits such as `(CV: ...)` and
western artist fields are read-only corroboration and never rewrite the
displayed credit.
Chinese, English, and Japanese lyric filtering removes credits, empty speaker
labels, and version headers while retaining real lyric text after a colon.
Direct-production enrichment covers animation and animation films, visual
novels, JRPGs and games, films, television, documentaries, commercials,
variety shows, and sports events. Structured provider data and specialist
catalogs are cross-checked fail-closed; generic OST labels do not choose a
medium or sequel, and independent or unprovable origins remain blank. Anime
catalog checks also preserve apostrophes in titles and verify multiple roles,
singer credits, and the original-language field for all-Han titles.

Press `Esc` or `Backspace` to request a safe stop. Packages already committed
remain playable, temporary work is removed, and the five most recent failures
are shown with their stage and reason. Song-information refresh aborts its
active network stage immediately instead of waiting for the route timeout;
atomic package writes finish safely, and completed updates remain saved.

## Optional music videos

MV playback is off by default. When enabled, a provider-supplied MV identifier
is tried first. Bilibili, YouTube, and Niconico are fallbacks ordered by network region
and observed reachability; an unreachable YouTube route in mainland China does
not delay normal play indefinitely.

The three bundled starter songs never trigger MV lookup. They always use their
local generated artwork and remain fully offline.

An exact candidate is cached only when its title, artist, version cues, and
duration are plausible and FFmpeg-decoded audio has strong correlation and
coverage with the imported recording under one constant time offset. If no
exact MV passes, the resolver may use an official opening, ending, or
promotional video only after AnimeThemes plus AniList/Bangumi evidence ties it
to the verified direct production. This visual-only fallback is muted and
loops independently; it never claims recording-level synchronization. The
local song audio remains the only game/scoring clock in both modes. If neither
mode is trustworthy, the verified production poster remains. Album artwork
stays visible. Every accepted download is transcoded to H.264/yuv420p MP4 and
frame-decoded before caching; legacy or audio-only cache entries are discarded.
The cache key follows stable provider/song identity rather than package
timestamps, so a verified MV is reused on later plays without downloading it
again after an unrelated metadata refresh. If a song has no valid cache and
lookup or browser loading fails, the MV preference turns itself off; the
player can explicitly re-enable it for a later attempt. Cached videos are
private data under `data/mv-cache/` and are excluded from public builds.

A valid same-name local LRC remains available as an offline fallback, but it
does not bypass online verification. At most the two best live/regional lyric
routes compare whole-song text while tolerating punctuation and provider line
wrapping. If a sidecar clearly belongs to another song, the timeline from the
strictly matched catalog recording replaces it automatically.

Many LRC files provide only line starts, making a following instrumental break
look like part of the previous lyric's input window. The converter calculates
normal milliseconds per playable key for that recording and caps only
statistically obvious long-window outliers. Dense long lyric lines are kept,
while the removed gap no longer lowers the displayed required-key rate.

Catalog and lyric routes start with profiles for mainland China, Hong
Kong/Macau, Taiwan, Japan, South Korea, Southeast Asia, the United States,
Europe, and global use, then learn from
successful responses, failures, cooldown, and latency during the process.
The in-game **Network & source status** screen shows that profile, route
priority, purpose, latency, and recent logs. Players can override a mistaken
region choice and switch between the Windows system proxy, a direct
connection, and a manually entered HTTP/HTTPS proxy.
The local service starts a non-blocking preflight for 37 concrete endpoints as
soon as it is ready. The resulting health and latency order is shared by later
imports, refreshes, artwork, and MV lookup. A reliably identified mainland
split system proxy sends mainland services such as QQ Music, NetEase, KuGou,
and Bilibili direct using device-region order, while overseas services use the
proxy and its coarse exit-region order. Remote or explicit global proxies use
the exit region globally; a manual proxy is always global. PAC and uncertain
system-proxy classification remain unknown, and PAC is not parsed. No public
IP is retained.

For a mainland profile, the official Bangumi API and three official site
aliases are attempted first; failures fall back to health-ranked
`bgmapi.anibt.net` and `api.bangumi.lol` public API routes, with matching image
routes for a verified subject poster. NetEase and LRCLIB also rank their
compatible service endpoints independently. Mirror requests contain public
production queries only. Sources without a trustworthy compatible mirror use
independent catalogs instead of an unknown forwarding proxy. A failed or
timed-out check has no displayed latency because its wait duration is not a
response time.
Exact track identity and duration remain the acceptance boundary while the
preferred lyric route may change between QQ Music, NetEase Cloud Music, KuGou
Music, and LRCLIB. iTunes Search and MusicBrainz provide independent
song/artist/release checks; uncertain title or artist repair requires
high-confidence agreement from two independent catalogs.

Lyric lookup checks multiple exact release records when the first provider row
has text but no reading. The selected playable layer must also agree with the
recording language: a translated Chinese timeline cannot stand in for a
Japanese original. Likewise, an all-Han artist label on a Japanese track needs
singer-detail or independent-catalog evidence before it may be displayed as the
original credit. Bilibili media results never supply either field.

AniSongDB and AnimeThemes can propose a direct anime production at song/theme
level. AniList and Bangumi cross-check the production ID, original-language
title, and poster. VNDB adds visual-novel evidence, and Steam can corroborate
game/JRPG titles and artwork leads. Bangumi remains a cross-medium source when
its catalog has a matching subject. TVmaze and optional TMDB
cover live-action television, film, documentaries, and variety programs;
Wikidata/Wikimedia Commons is a low-priority, fail-closed cross-check for
those types plus commercials and sports events. The direct production is
recorded, never a manga, novel, or other pre-adaptation work. If every
optional route is slow or unavailable, enrichment stops promptly and keeps
the playable local result, uses neutral art, or leaves uncertain fields blank.

Bilibili is ranked early on mainland networks for official production-video
and MV leads. It may corroborate a production that a specialist catalog has
already identified, but public media search never becomes the sole authority
for song title, artist credit, medium, or original work title.

TMDB access is disabled unless the local environment supplies
`TMDB_API_TOKEN`; no shared token or secret is included in source or release
artifacts. Bangumi and TVmaze remain no-key fallbacks.

Chinese readings are generated offline with `pinyin-pro`. English uses the
visible letters. Kana can be normalized locally. Japanese lyrics containing
Kanji prefer explicit ruby or a timed reading belonging to the same recording.
When no trusted online reading is available, the bundled morphological
dictionary can fill playable gaps; the track remains pending until
verified, and dictionary output is never presented as verified.
For Japanese numeric forms such as `1人` and `2人`, pending offline readings
keep the displayed lyric unchanged and use letters-only input.

Network requests use short timeouts and bounded fallback routes. Required
provider failures stop the current import with a localized message; optional
origin/poster enrichment is skipped after repeated failures and never prevents
normal play. Imported packages are self-contained and remain playable offline.

The **Refresh song info** action inside **Song info & editing** can recheck
imported packages later.
It combines a verifiable provider record with independent music catalogs,
re-detects language from the packed lyrics, and runs the matching animation,
film, television, documentary, commercial, variety, sports-event,
visual-novel, or game resolver. Existing data is never replaced by a
conflicting or unverified match. Repeated connectivity failures stop the
optional pass early.

Provider details:

- [QQ Music](local-qqmusic.md)
- [NetEase Cloud Music](local-netease.md)
- [Apple Music](local-apple-music.md)
- [Local folder](local-folder.md)

Music-service media and session data are private local inputs. See the
[interoperability notice](../MUSIC-SERVICE-INTEROPERABILITY-NOTICE.md) before
using an importer.
