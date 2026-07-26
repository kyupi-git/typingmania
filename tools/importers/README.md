# Bundled music import components

These Windows x64 components are part of the offline player distribution. They
are invoked only by the local import service and are not fetched or installed
while a player uses the game.

| Provider | Component | Version | Verification |
| --- | --- | --- | --- |
| NetEase Cloud Music | ncmdump C++ Windows x64 | 1.5.1 | executable SHA-256, `--version`, MIT license |
| Apple Music | CPython embedded Windows x64 | 3.13.14 | executable SHA-256, PSF license |
| Apple Music | gamdl and pinned Python graph | 3.8.3 | import/version check and installed license metadata |

`npm run verify-runtime` checks the distributed entry points and their pinned
hashes. Maintainers can reproduce this directory from official releases with
PowerShell 7:

```powershell
./scripts/vendor-import-tools.ps1
```

That script downloads into the ignored `tools/importers/.download/` staging
directory, verifies the official Python archive checksum, installs only pinned
Windows wheels, and performs an import test. It is not a player setup step.

The gamdl runtime includes its complete pure-Python package sources and the
license metadata supplied by each wheel. Core license texts are also copied to
`apple-music/`. See the repository-level
[`THIRD-PARTY-NOTICES.md`](../../THIRD-PARTY-NOTICES.md) for attribution and
distribution boundaries.
