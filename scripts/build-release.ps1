[CmdletBinding()]
param(
  [string] $Version = ''
)

$ErrorActionPreference = 'Stop'
$root = [System.IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
if ([string]::IsNullOrWhiteSpace($Version)) {
  $package = Get-Content -LiteralPath (Join-Path $root 'package.json') -Raw |
    ConvertFrom-Json
  $Version = ([string] $package.version).Split('.')[0]
}
if ($Version -notmatch '^\d{8}$') {
  throw 'Release version must use YYYYMMDD form.'
}

$dist = [System.IO.Path]::GetFullPath((Join-Path $root 'dist'))
$name = "TypingManiaNovel-$Version-Windows-x64"
$stage = [System.IO.Path]::GetFullPath((Join-Path $dist $name))
$archive = [System.IO.Path]::GetFullPath((Join-Path $dist "$name.zip"))
if (-not $stage.StartsWith($dist, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Release staging path escaped the dist directory.'
}

& node (Join-Path $root 'scripts\audit-public-tree.js')
if ($LASTEXITCODE -ne 0) { throw 'Public-tree audit failed.' }
& node (Join-Path $root 'scripts\verify-offline-runtime.js')
if ($LASTEXITCODE -ne 0) { throw 'Bundled runtime verification failed.' }

[void] (New-Item -ItemType Directory -Path $dist -Force)
if (Test-Path -LiteralPath $stage) {
  Remove-Item -LiteralPath $stage -Recurse -Force
}
if (Test-Path -LiteralPath $archive) {
  Remove-Item -LiteralPath $archive -Force
}
[void] (New-Item -ItemType Directory -Path $stage -Force)

$files = & git -C $root ls-files --cached --others --exclude-standard
if ($LASTEXITCODE -ne 0 -or -not $files.Count) {
  throw 'Unable to enumerate public release files.'
}
foreach ($relative in $files) {
  $source = Join-Path $root $relative
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { continue }
  $destination = Join-Path $stage $relative
  [void] (New-Item -ItemType Directory -Path (Split-Path $destination) -Force)
  Copy-Item -LiteralPath $source -Destination $destination
}

Compress-Archive `
  -LiteralPath $stage `
  -DestinationPath $archive `
  -CompressionLevel Optimal
Remove-Item -LiteralPath $stage -Recurse -Force

$item = Get-Item -LiteralPath $archive
$hash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
[PSCustomObject]@{
  File = $item.FullName
  Bytes = $item.Length
  Sha256 = $hash
} | Format-List
