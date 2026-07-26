# Bundled media verifier

`ffmpeg.exe` is FFmpeg `N-92722-gf22fcd4483` for Windows x64, redistributed
from `@ffmpeg-installer/win32-x64@4.1.0`. TypingManiaNovel invokes it as a
separate process to decode audio for MV identity/timeline verification and to
merge a verified video's streams.

This build was configured with GPL and version-3 components and is licensed
under GPL-3.0-or-later. Its corresponding FFmpeg source revision is
[`f22fcd4483`](https://github.com/FFmpeg/FFmpeg/tree/f22fcd4483); build/package
metadata is preserved in `ffmpeg-package.json`. FFmpeg's license information
is included in `COPYING.GPLv3`, available in the corresponding source tree, and
at
<https://ffmpeg.org/legal.html>. This executable is a separate program and is
not linked into TypingManiaNovel.

MV files obtained for personal playback are stored under the Git-ignored
`data/mv-cache/` directory and are never source-release assets.
