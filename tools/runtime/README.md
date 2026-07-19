# Bundled Windows runtime

`node-v24.18.0-win-x64.zip` is the unmodified official Windows x64 archive
published by the Node.js project.

- Version: Node.js v24.18.0 LTS
- Source: https://nodejs.org/download/release/v24.18.0/
- Expected SHA-256:
  `0ae68406b42d7725661da979b1403ec9926da205c6770827f33aac9d8f26e821`
- License: Node.js MIT license plus the third-party licenses reproduced in
  the archive's `LICENSE` file

`start-game.ps1` verifies the archive hash and extracts only the required
`node.exe` under the Git-ignored `data/runtime` directory on first launch. The
original archive remains unchanged, and its complete license is reproduced in
`NODE-LICENSE.txt`. On non-x64 Windows systems, the launcher falls back to a
compatible system installation of Node.js 20 or newer.

The archive is runtime infrastructure only. It does not contain QQ Music,
browser translation models, music, lyrics, covers, account cookies, or ekeys.
