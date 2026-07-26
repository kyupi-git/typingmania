[CmdletBinding()]
param(
  [string]$PythonCommand = 'python'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$toolsRoot = Join-Path $root 'tools\importers'
$downloadRoot = Join-Path $toolsRoot '.download'
$neteaseRoot = Join-Path $toolsRoot 'netease'
$appleRoot = Join-Path $toolsRoot 'apple-music'
$pythonRoot = Join-Path $appleRoot 'runtime'

foreach ($directory in @($downloadRoot, $neteaseRoot, $appleRoot, $pythonRoot)) {
  New-Item -ItemType Directory -Force -Path $directory | Out-Null
}

function Get-VerifiedDownload {
  param(
    [Parameter(Mandatory)] [string]$Uri,
    [Parameter(Mandatory)] [string]$Destination,
    [string]$Sha256 = ''
  )

  Invoke-WebRequest -UseBasicParsing -Uri $Uri -OutFile $Destination
  if ($Sha256) {
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $Destination).Hash
    if ($actual -ne $Sha256.ToUpperInvariant()) {
      throw "Checksum mismatch for $Uri (expected $Sha256, received $actual)"
    }
  }
}

$ncmdumpArchive = Join-Path $downloadRoot 'ncmdump-1.5.1-windows-amd64.zip'
Get-VerifiedDownload `
  -Uri 'https://github.com/taurusxin/ncmdump/releases/download/1.5.1/ncmdump-1.5.1-windows-amd64.zip' `
  -Destination $ncmdumpArchive
Expand-Archive -LiteralPath $ncmdumpArchive -DestinationPath $neteaseRoot -Force
Get-VerifiedDownload `
  -Uri 'https://raw.githubusercontent.com/taurusxin/ncmdump/main/LICENSE.txt' `
  -Destination (Join-Path $neteaseRoot 'LICENSE.txt') `
  -Sha256 'a406579cd136771c705c521db86ca7d60a6f3de7c9b5460e6193a2df27861bde'
$ncmdumpHash = (Get-FileHash -Algorithm SHA256 `
  -LiteralPath (Join-Path $neteaseRoot 'ncmdump.exe')).Hash
if ($ncmdumpHash -ne 'A1F6F6CE87500B7B1F2A89DBF85B13E81D327EEA4641DAF8AFE0AB840F2C518C') {
  throw "ncmdump executable checksum mismatch: $ncmdumpHash"
}

$pythonArchive = Join-Path $downloadRoot 'python-3.13.14-embed-amd64.zip'
Get-VerifiedDownload `
  -Uri 'https://www.python.org/ftp/python/3.13.14/python-3.13.14-embed-amd64.zip' `
  -Destination $pythonArchive `
  -Sha256 '90b4e5b9898b72d744650524bff92377c367f44bd5fbd09e3148656c080ad907'
Expand-Archive -LiteralPath $pythonArchive -DestinationPath $pythonRoot -Force

$sitePackages = Join-Path $pythonRoot 'Lib\site-packages'
New-Item -ItemType Directory -Force -Path $sitePackages | Out-Null
$applePackages = @(
  'gamdl==3.8.3'
  'async-lru==2.3.0'
  'click==8.4.2'
  'colorama==0.4.6'
  'dataclass-click==1.0.4'
  'httpx==0.28.1'
  'httpx-retries==0.6.0'
  'inquirerpy==0.3.4'
  'm3u8==6.0.0'
  'mutagen==1.48.1'
  'pillow==12.3.0'
  'pywidevine==1.9.0'
  'structlog==26.1.0'
  'yt-dlp==2026.7.4'
  'anyio==4.14.2'
  'certifi==2026.7.22'
  'charset-normalizer==3.4.4'
  # pymp4 still declares the Python-3.10-era 2.8.8 release. The compatible
  # 2.8.10 wheel avoids an sdist build and runs on the embedded Python 3.13.
  'construct==2.8.10'
  'h11==0.16.0'
  'httpcore==1.0.9'
  'idna==3.18'
  'pfzy==0.3.4'
  'prompt-toolkit==3.0.52'
  'protobuf==6.33.6'
  'pycryptodome==3.23.0'
  'pymp4==1.4.0'
  'pyyaml==6.0.3'
  'requests==2.34.2'
  'sniffio==1.3.1'
  'typing-extensions==4.15.0'
  'unidecode==1.4.0'
  'urllib3==2.6.3'
  'wcwidth==0.2.14'
)
& $PythonCommand -m pip install `
  --disable-pip-version-check `
  --no-compile `
  --no-deps `
  --only-binary=:all: `
  --platform win_amd64 `
  --implementation cp `
  --python-version 3.13 `
  --abi cp313 `
  --abi abi3 `
  --abi none `
  --target $sitePackages `
  $applePackages
if ($LASTEXITCODE -ne 0) {
  throw 'Unable to vendor gamdl and its pinned dependencies.'
}

$pth = Join-Path $pythonRoot 'python313._pth'
@(
  'python313.zip'
  '.'
  'Lib\site-packages'
  'import site'
) | Set-Content -LiteralPath $pth -Encoding Ascii

Copy-Item -LiteralPath (Join-Path $pythonRoot 'LICENSE.txt') `
  -Destination (Join-Path $appleRoot 'PYTHON-LICENSE.txt') -Force
Get-VerifiedDownload `
  -Uri 'https://raw.githubusercontent.com/glomatico/gamdl/main/LICENSE' `
  -Destination (Join-Path $appleRoot 'GAMDL-LICENSE.txt') `
  -Sha256 'a3c781ab502051704ad5c84017aa29786094fa2d1687741eec1633a7bb675d1a'

& (Join-Path $pythonRoot 'python.exe') -B -c `
  'import gamdl, sys; print(sys.version); print(gamdl.__file__)'
if ($LASTEXITCODE -ne 0) {
  throw 'The vendored Apple Music runtime did not pass its import check.'
}

Write-Host 'Offline import components are ready:'
Write-Host "  $neteaseRoot"
Write-Host "  $appleRoot"
