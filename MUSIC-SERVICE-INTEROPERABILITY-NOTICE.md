# Music-service interoperability notice

TypingManiaNovel provides optional local interoperability with QQ Music,
NetEase Cloud Music, and Apple Music. These importers are intended for a user
to make playable packages from recordings that the user is authorized to
access through their own client, account, any entitlement required by the
selected track, and local device.

The project does not include a music-service client, account, credential,
session, cache, encrypted recording, decrypted recording, lyric, cover, poster,
or generated user song package. It does not provide access to another person's
account and does not remove a service's entitlement checks: a valid local QQ
Music session, complete NetEase download/cache media, or a signed-in Apple
Music session with playback access to the selected track is required by the
corresponding path.

The local-folder importer accepts media selected by the user and applies the
same metadata, timed-lyric, pronunciation, artwork, origin, and package
validation boundary. It does not upload selected files to a remote service;
the browser transfers them only to TypingManiaNovel's loopback server.

Imported packages are created locally and are excluded from source control and
release artifacts. They are for the user's personal use within the permissions
granted by the relevant service and applicable law. Subscription terms and
local law vary by place; users are responsible for deciding whether they may
create and retain a local interoperable copy. Do not redistribute imported
media or credentials.

The importers use open-source components for format interoperability and media
validation. Their inclusion does not imply affiliation with or endorsement by
Tencent, Tencent Music Entertainment, QQ Music, NetEase, NetEase Cloud Music,
Apple, Apple Music, or the component authors. Product and service names remain
the property of their respective owners.

Technical and privacy details are documented in:

- [`docs/local-qqmusic.md`](docs/local-qqmusic.md)
- [`docs/local-netease.md`](docs/local-netease.md)
- [`docs/local-apple-music.md`](docs/local-apple-music.md)
- [`docs/local-folder.md`](docs/local-folder.md)
- [`THIRD-PARTY-NOTICES.md`](THIRD-PARTY-NOTICES.md)
