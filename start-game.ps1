[CmdletBinding()]
param(
  [ValidateRange(1, 65535)]
  [int] $Port = 8765,
  [switch] $NoOpen
)

$ErrorActionPreference = 'Stop'
$ProjectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$ExpectedProjectRoot = [System.IO.Path]::GetFullPath($ProjectRoot).TrimEnd(
  [System.IO.Path]::DirectorySeparatorChar,
  [System.IO.Path]::AltDirectorySeparatorChar
)
# Pass the exact host executable to the Node child. This works in both
# PowerShell 7 and the Windows PowerShell 5.1 fallback without using the
# PowerShell 7-only Start-Process -Environment parameter.
$PowerShellExecutable = ''
try {
  $PowerShellExecutable = [System.Diagnostics.Process]::GetCurrentProcess().
    MainModule.FileName
} catch {
  $hostExecutableName = if ($PSVersionTable.PSEdition -eq 'Core') {
    'pwsh.exe'
  } else {
    'powershell.exe'
  }
  $PowerShellExecutable = Join-Path $PSHOME $hostExecutableName
}
if ([string]::IsNullOrWhiteSpace($PowerShellExecutable)) {
  throw 'Unable to identify the PowerShell executable hosting start-game.ps1.'
}
$env:TMN_POWERSHELL = [System.IO.Path]::GetFullPath($PowerShellExecutable)
$ExpectedServerProtocol = 3
$serverSourceFiles = @(
  Get-Item -LiteralPath (Join-Path $ProjectRoot 'scripts\local-server.js')
) + @(
  Get-ChildItem `
    -LiteralPath (Join-Path $ProjectRoot 'scripts\local') `
    -File `
    -Recurse `
    -Filter '*.js'
)
$ExpectedServerSourceVersion = [long] (($serverSourceFiles |
  ForEach-Object {
    ([DateTimeOffset] $_.LastWriteTimeUtc).ToUnixTimeMilliseconds()
  } |
  Measure-Object -Maximum).Maximum)
$PreferredPort = $Port
$DataDirectory = Join-Path $ProjectRoot 'data'
$BrowserRecordFile = Join-Path $DataDirectory 'local-browser.json'
$BrowserProfileDirectory = Join-Path $DataDirectory 'runtime\edge-profile'
$GameViewportWidth = 1920
$GameViewportHeight = 1080
# Edge interprets --window-size as the whole top-level window on Windows.
# Start slightly larger, then measure its real client area and correct it.
$GameWindowSize = "$($GameViewportWidth + 16),$($GameViewportHeight + 39)"
$BundledNodeVersion = 'v24.18.0'
$BundledNodeArchiveName = "node-$BundledNodeVersion-win-x64.zip"
$BundledNodeArchive = Join-Path $ProjectRoot "tools\runtime\$BundledNodeArchiveName"
$BundledNodeDirectory = Join-Path $DataDirectory "runtime\node-$BundledNodeVersion-win-x64"
$BundledNodeExecutable = Join-Path $BundledNodeDirectory 'node.exe'
$BundledNodeArchiveSha256 = '0ae68406b42d7725661da979b1403ec9926da205c6770827f33aac9d8f26e821'
$BundledNodeExecutableSha256 = '9a4eb5f1c29c6a2e93852ead46b999e284a6a5ca8bab4d4e241d587d025a52de'

function Set-TypingManiaNovelEndpoint {
  param([int] $CandidatePort)

  $script:Port = $CandidatePort
  $script:GameUrl = "http://127.0.0.1:$CandidatePort/"
  $script:StatusUrl = "${script:GameUrl}api/local/status"
  $logSuffix = if ($CandidatePort -eq 8765) { '' } else { ".$CandidatePort" }
  $script:OutputLog = Join-Path $DataDirectory "local-server$logSuffix.out.log"
  $script:ErrorLog = Join-Path $DataDirectory "local-server$logSuffix.err.log"
  $script:PidFile = Join-Path $DataDirectory "local-server$logSuffix.pid"
}

function Test-TcpPortListening {
  param([int] $CandidatePort)

  return [System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().
    GetActiveTcpListeners().Port -contains $CandidatePort
}

function Test-TypingManiaNovelServer {
  return Test-TypingManiaNovelServerCurrentAtPort $Port
}

function Test-TypingManiaNovelServerAtPort {
  param([int] $CandidatePort)

  try {
    $status = Invoke-RestMethod `
      -Uri "http://127.0.0.1:$CandidatePort/api/local/status" `
      -Method Get `
      -TimeoutSec 2
    if (
      $status.available -ne $true -or
      [int] $status.instance.protocol -lt 1 -or
      [string]::IsNullOrWhiteSpace([string] $status.instance.root)
    ) {
      return $false
    }
    $serverRoot = [System.IO.Path]::GetFullPath(
      [string] $status.instance.root
    ).TrimEnd(
      [System.IO.Path]::DirectorySeparatorChar,
      [System.IO.Path]::AltDirectorySeparatorChar
    )
    return [string]::Equals(
      $serverRoot,
      $ExpectedProjectRoot,
      [System.StringComparison]::OrdinalIgnoreCase
    )
  } catch {
    return $false
  }
}

function Test-TypingManiaNovelServerCurrentAtPort {
  param([int] $CandidatePort)

  try {
    $status = Invoke-RestMethod `
      -Uri "http://127.0.0.1:$CandidatePort/api/local/status" `
      -Method Get `
      -TimeoutSec 2
    if (
      $status.available -ne $true -or
      [int] $status.instance.protocol -lt $ExpectedServerProtocol -or
      [long] $status.instance.sourceVersion -ne $ExpectedServerSourceVersion
    ) {
      return $false
    }
    return Test-TypingManiaNovelServerAtPort $CandidatePort
  } catch {
    return $false
  }
}

function Get-ManagedPidFile {
  param([int] $CandidatePort)

  $suffix = if ($CandidatePort -eq 8765) { '' } else { ".$CandidatePort" }
  return Join-Path $DataDirectory "local-server$suffix.pid"
}

function Read-ManagedServiceRecord {
  param([int] $CandidatePort)

  $filename = Get-ManagedPidFile $CandidatePort
  if (-not (Test-Path -LiteralPath $filename -PathType Leaf)) {
    return $null
  }
  $raw = (Get-Content -LiteralPath $filename -Raw).Trim()
  if ([string]::IsNullOrWhiteSpace($raw)) {
    return $null
  }
  try {
    $stored = $raw | ConvertFrom-Json
    return [PSCustomObject] @{
      File = $filename
      ProcessId = [int] $stored.processId
      Port = [int] $stored.port
      ProjectRoot = [string] $stored.projectRoot
      ServerScript = [string] $stored.serverScript
      Executable = [string] $stored.executable
      StartedAt = [string] $stored.startedAt
      Version = [int] $stored.version
    }
  } catch {
    $legacyPid = 0
    if ([int]::TryParse($raw, [ref] $legacyPid)) {
      return [PSCustomObject] @{
        File = $filename
        ProcessId = $legacyPid
        Port = $CandidatePort
        ProjectRoot = ''
        ServerScript = ''
        Executable = ''
        StartedAt = ''
        Version = 0
      }
    }
    return $null
  }
}

function Get-ManagedProcess {
  param($Record)

  if ($null -eq $Record -or $Record.ProcessId -le 0) {
    return $null
  }
  try {
    $process = Get-Process -Id $Record.ProcessId -ErrorAction Stop
    if ($process.ProcessName -ne 'node') {
      return $null
    }
    $details = Get-CimInstance `
      -ClassName Win32_Process `
      -Filter "ProcessId = $($Record.ProcessId)" `
      -ErrorAction Stop
    $commandLine = [string] $details.CommandLine
    if (
      $commandLine -notmatch '(?i)[\\/]scripts[\\/]local-server\.js' -or
      $commandLine -notmatch "(?i)--port=$($Record.Port)(?:\s|`"|$)"
    ) {
      return $null
    }
    return [PSCustomObject] @{
      Process = $process
      Details = $details
      CommandLine = $commandLine
    }
  } catch {
    return $null
  }
}

function Test-RecordBelongsToProject {
  param($Record, $ManagedProcess, [switch] $AllowLegacy)

  if ($null -eq $Record -or $null -eq $ManagedProcess) {
    return $false
  }
  if ($Record.Version -lt 1) {
    return $AllowLegacy.IsPresent
  }
  if (
    -not [string]::Equals(
      [System.IO.Path]::GetFullPath($Record.ProjectRoot),
      $ExpectedProjectRoot,
      [System.StringComparison]::OrdinalIgnoreCase
    )
  ) {
    return $false
  }
  $expectedScript = [System.IO.Path]::GetFullPath(
    (Join-Path $ProjectRoot 'scripts\local-server.js')
  )
  if (
    -not [string]::Equals(
      [System.IO.Path]::GetFullPath($Record.ServerScript),
      $expectedScript,
      [System.StringComparison]::OrdinalIgnoreCase
    ) -or
    $ManagedProcess.CommandLine.IndexOf(
      $expectedScript,
      [System.StringComparison]::OrdinalIgnoreCase
    ) -lt 0
  ) {
    return $false
  }
  if (-not [string]::IsNullOrWhiteSpace($Record.Executable)) {
    $actualExecutable = [string] $ManagedProcess.Details.ExecutablePath
    if (
      [string]::IsNullOrWhiteSpace($actualExecutable) -or
      -not [string]::Equals(
        [System.IO.Path]::GetFullPath($Record.Executable),
        [System.IO.Path]::GetFullPath($actualExecutable),
        [System.StringComparison]::OrdinalIgnoreCase
      )
    ) {
      return $false
    }
  }
  return $true
}

function Stop-ManagedProjectServer {
  param([int] $CandidatePort)

  $ownedEndpoint = Test-TypingManiaNovelServerAtPort $CandidatePort
  if (-not $ownedEndpoint) {
    return $false
  }

  # Prefer a cooperative, token-authenticated shutdown. It identifies the
  # service through its live endpoint and does not require process inspection,
  # which can be restricted on otherwise normal Windows accounts.
  try {
    $status = Invoke-RestMethod `
      -Uri "http://127.0.0.1:$CandidatePort/api/local/status" `
      -Method Get `
      -TimeoutSec 2
    if (-not [string]::IsNullOrWhiteSpace([string] $status.token)) {
      [void] (Invoke-RestMethod `
        -Uri "http://127.0.0.1:$CandidatePort/api/local/shutdown" `
        -Method Post `
        -Headers @{ 'X-TMN-Token' = [string] $status.token } `
        -ContentType 'application/json' `
        -Body '{}' `
        -TimeoutSec 3)
      $deadline = [DateTime]::UtcNow.AddSeconds(4)
      while (
        [DateTime]::UtcNow -lt $deadline -and
        (Test-TcpPortListening $CandidatePort)
      ) {
        Start-Sleep -Milliseconds 100
      }
      if (-not (Test-TcpPortListening $CandidatePort)) {
        $record = Read-ManagedServiceRecord $CandidatePort
        if ($null -ne $record) {
          Remove-Item `
            -LiteralPath $record.File `
            -Force `
            -ErrorAction SilentlyContinue
        }
        return $true
      }
    }
  } catch {}

  # A legacy PID is trusted only while the port itself proves that it serves
  # this exact project. New JSON records also bind the absolute script and
  # executable paths, preventing PID reuse from targeting another program.
  $record = Read-ManagedServiceRecord $CandidatePort
  $managedProcess = Get-ManagedProcess $record
  if (
    -not (Test-RecordBelongsToProject `
      $record `
      $managedProcess `
      -AllowLegacy)
  ) {
    return $false
  }
  Stop-Process -Id $record.ProcessId -Force -ErrorAction Stop
  try {
    $managedProcess.Process.WaitForExit(3000)
  } catch {}
  Remove-Item -LiteralPath $record.File -Force -ErrorAction SilentlyContinue
  return $true
}

function Remove-StaleManagedPidFiles {
  if (-not (Test-Path -LiteralPath $DataDirectory -PathType Container)) {
    return
  }
  foreach ($file in Get-ChildItem `
    -LiteralPath $DataDirectory `
    -File `
    -Filter 'local-server*.pid') {
    $candidatePort = if ($file.Name -eq 'local-server.pid') {
      8765
    } elseif ($file.Name -match '^local-server\.(\d+)\.pid$') {
      [int] $Matches[1]
    } else {
      continue
    }
    $record = Read-ManagedServiceRecord $candidatePort
    if ($null -eq $record) {
      Remove-Item -LiteralPath $file.FullName -Force -ErrorAction SilentlyContinue
      continue
    }
    if ($null -eq (Get-ManagedProcess $record)) {
      Remove-Item -LiteralPath $file.FullName -Force -ErrorAction SilentlyContinue
    }
  }
}

function Select-TypingManiaNovelEndpoint {
  $lastCandidate = [Math]::Min(65535, $PreferredPort + 20)

  # A launcher invocation always creates a fresh service. Stop only endpoints
  # that prove they belong to this exact project root; unrelated listeners and
  # Node.js processes are never selected by name alone.
  foreach ($candidate in $PreferredPort..$lastCandidate) {
    if (
      (Test-TcpPortListening $candidate) -and
      (Test-TypingManiaNovelServerAtPort $candidate)
    ) {
      if (-not (Stop-ManagedProjectServer $candidate)) {
        throw (
          "TypingManiaNovel on port $candidate could not be stopped safely. " +
          'Use terminate.cmd and try again.'
        )
      }
    }
  }

  foreach ($candidate in $PreferredPort..$lastCandidate) {
    Set-TypingManiaNovelEndpoint $candidate
    if (Test-TcpPortListening $candidate) { continue }
    return $false
  }
  throw (
    "No free local port was found from $PreferredPort through $lastCandidate. " +
    'Close an old TypingManiaNovel service and try again.'
  )
}

function Get-TypingManiaNovelEdge {
  $candidates = @()
  foreach ($directory in @(
    ${env:ProgramFiles(x86)},
    $env:ProgramFiles
  )) {
    if (-not [string]::IsNullOrWhiteSpace($directory)) {
      $candidates += Join-Path `
        $directory `
        'Microsoft\Edge\Application\msedge.exe'
    }
  }
  foreach ($candidate in $candidates) {
    if (
      -not [string]::IsNullOrWhiteSpace($candidate) -and
      (Test-Path -LiteralPath $candidate -PathType Leaf)
    ) {
      return [System.IO.Path]::GetFullPath($candidate)
    }
  }
  return ''
}

function Stop-ManagedProjectBrowser {
  if (-not (Test-Path -LiteralPath $BrowserRecordFile -PathType Leaf)) {
    return
  }
  try {
    $record = Get-Content -LiteralPath $BrowserRecordFile -Raw |
      ConvertFrom-Json
    if (
      [int] $record.version -lt 1 -or
      [int] $record.processId -le 0 -or
      -not [string]::Equals(
        [System.IO.Path]::GetFullPath([string] $record.projectRoot),
        $ExpectedProjectRoot,
        [System.StringComparison]::OrdinalIgnoreCase
      ) -or
      -not [string]::Equals(
        [System.IO.Path]::GetFullPath([string] $record.profile),
        [System.IO.Path]::GetFullPath($BrowserProfileDirectory),
        [System.StringComparison]::OrdinalIgnoreCase
      )
    ) {
      return
    }
    $process = Get-Process -Id ([int] $record.processId) -ErrorAction Stop
    if ($process.ProcessName -ne 'msedge') {
      return
    }
    $details = Get-CimInstance `
      -ClassName Win32_Process `
      -Filter "ProcessId = $([int] $record.processId)" `
      -ErrorAction Stop
    $commandLine = [string] $details.CommandLine
    if (
      $commandLine.IndexOf(
        $BrowserProfileDirectory,
        [System.StringComparison]::OrdinalIgnoreCase
      ) -lt 0 -or
      $commandLine.IndexOf(
        '--app=http://127.0.0.1:',
        [System.StringComparison]::OrdinalIgnoreCase
      ) -lt 0
    ) {
      return
    }
    [void] (Start-Process `
      -FilePath 'taskkill.exe' `
      -ArgumentList @('/PID', [string] $record.processId, '/T', '/F') `
      -WindowStyle Hidden `
      -Wait `
      -PassThru)
  } catch {
    # A missing/stale process is already stopped. A record that cannot prove
    # project ownership is intentionally left untouched.
  } finally {
    Remove-Item `
      -LiteralPath $BrowserRecordFile `
      -Force `
      -ErrorAction SilentlyContinue
  }
}

function Set-TypingManiaNovelGameViewport {
  param(
    [string] $ProfileDirectory,
    [int] $Width,
    [int] $Height
  )

  try {
    if ($null -eq ('TypingManiaNovel.NativeWindow' -as [type])) {
      Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;

namespace TypingManiaNovel {
  public static class NativeWindow {
    public delegate bool EnumChildProc(IntPtr window, IntPtr parameter);

    [StructLayout(LayoutKind.Sequential)]
    public struct Rect {
      public int Left;
      public int Top;
      public int Right;
      public int Bottom;
    }

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool GetClientRect(IntPtr window, out Rect rectangle);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool EnumChildWindows(
      IntPtr parent,
      EnumChildProc callback,
      IntPtr parameter
    );

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    public static extern int GetClassName(
      IntPtr window,
      StringBuilder className,
      int maximum
    );

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool GetWindowRect(IntPtr window, out Rect rectangle);

    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetWindowPos(
      IntPtr window,
      IntPtr insertAfter,
      int x,
      int y,
      int width,
      int height,
      uint flags
    );

    public static bool GetLargestChildClientRect(
      IntPtr parent,
      string wantedClass,
      out Rect rectangle
    ) {
      Rect largest = new Rect();
      long largestArea = 0;
      EnumChildWindows(parent, delegate(IntPtr child, IntPtr parameter) {
        StringBuilder className = new StringBuilder(256);
        GetClassName(child, className, className.Capacity);
        if (!String.Equals(
          className.ToString(),
          wantedClass,
          StringComparison.Ordinal
        )) {
          return true;
        }
        Rect candidate;
        if (GetClientRect(child, out candidate)) {
          long width = Math.Max(0, candidate.Right - candidate.Left);
          long height = Math.Max(0, candidate.Bottom - candidate.Top);
          long area = width * height;
          if (area > largestArea) {
            largest = candidate;
            largestArea = area;
          }
        }
        return true;
      }, IntPtr.Zero);
      rectangle = largest;
      return largestArea > 0;
    }
  }
}
'@
    }

    $window = $null
    $deadline = [DateTime]::UtcNow.AddSeconds(5)
    do {
      $window = Get-CimInstance `
        -ClassName Win32_Process `
        -Filter "Name = 'msedge.exe'" `
        -ErrorAction SilentlyContinue |
        Where-Object {
          ([string] $_.CommandLine).IndexOf(
            $ProfileDirectory,
            [System.StringComparison]::OrdinalIgnoreCase
          ) -ge 0
        } |
        ForEach-Object {
          Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue
        } |
        Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero } |
        Sort-Object StartTime |
        Select-Object -First 1
      if ($null -eq $window) {
        Start-Sleep -Milliseconds 100
      }
    } while ($null -eq $window -and [DateTime]::UtcNow -lt $deadline)
    if ($null -eq $window) {
      return $null
    }

    $viewport = New-Object TypingManiaNovel.NativeWindow+Rect
    $frame = New-Object TypingManiaNovel.NativeWindow+Rect
    $viewportDeadline = [DateTime]::UtcNow.AddSeconds(5)
    while (
      -not [TypingManiaNovel.NativeWindow]::GetLargestChildClientRect(
        $window.MainWindowHandle,
        'Chrome_RenderWidgetHostHWND',
        [ref] $viewport
      )
    ) {
      if ([DateTime]::UtcNow -ge $viewportDeadline) {
        return $null
      }
      Start-Sleep -Milliseconds 100
    }
    for ($attempt = 0; $attempt -lt 3; $attempt++) {
      if (
        -not [TypingManiaNovel.NativeWindow]::GetLargestChildClientRect(
          $window.MainWindowHandle,
          'Chrome_RenderWidgetHostHWND',
          [ref] $viewport
        ) -or
        -not [TypingManiaNovel.NativeWindow]::GetWindowRect(
          $window.MainWindowHandle,
          [ref] $frame
        )
      ) {
        return $null
      }
      $viewportWidth = $viewport.Right - $viewport.Left
      $viewportHeight = $viewport.Bottom - $viewport.Top
      if ($viewportWidth -eq $Width -and $viewportHeight -eq $Height) {
        break
      }
      $frameWidth = $frame.Right - $frame.Left
      $frameHeight = $frame.Bottom - $frame.Top
      $targetWidth = $frameWidth + ($Width - $viewportWidth)
      $targetHeight = $frameHeight + ($Height - $viewportHeight)
      [void] [TypingManiaNovel.NativeWindow]::SetWindowPos(
        $window.MainWindowHandle,
        [IntPtr]::Zero,
        $frame.Left,
        $frame.Top,
        $targetWidth,
        $targetHeight,
        0x0014
      )
      Start-Sleep -Milliseconds 120
    }

    [void] [TypingManiaNovel.NativeWindow]::GetLargestChildClientRect(
      $window.MainWindowHandle,
      'Chrome_RenderWidgetHostHWND',
      [ref] $viewport
    )
    [void] [TypingManiaNovel.NativeWindow]::GetWindowRect(
      $window.MainWindowHandle,
      [ref] $frame
    )
    return [PSCustomObject] @{
      processId = $window.Id
      clientWidth = $viewport.Right - $viewport.Left
      clientHeight = $viewport.Bottom - $viewport.Top
      windowWidth = $frame.Right - $frame.Left
      windowHeight = $frame.Bottom - $frame.Top
    }
  } catch {
    # The initial oversized window remains usable if native sizing is
    # unavailable on an unusual Windows/Edge configuration.
    return $null
  }
}

function Open-TypingManiaNovelBrowser {
  $edge = Get-TypingManiaNovelEdge
  if ([string]::IsNullOrWhiteSpace($edge)) {
    # Windows 11 normally includes Edge. Retain a hosted-compatible fallback
    # for stripped-down systems, although terminate.cmd cannot own a tab opened
    # inside an arbitrary pre-existing default browser.
    Start-Process -FilePath $GameUrl
    return
  }

  [void] (New-Item `
    -ItemType Directory `
    -Path $BrowserProfileDirectory `
    -Force)
  $browser = Start-Process `
    -FilePath $edge `
    -ArgumentList @(
      "--app=$GameUrl",
      "--user-data-dir=`"$BrowserProfileDirectory`"",
      "--window-size=$GameWindowSize",
      '--no-first-run',
      '--no-default-browser-check'
    ) `
    -WorkingDirectory $ProjectRoot `
    -PassThru
  Start-Sleep -Milliseconds 350
  $profileProcesses = @(
    Get-CimInstance `
      -ClassName Win32_Process `
      -Filter "Name = 'msedge.exe'" `
      -ErrorAction SilentlyContinue |
      Where-Object {
        ([string] $_.CommandLine).IndexOf(
          $BrowserProfileDirectory,
          [System.StringComparison]::OrdinalIgnoreCase
        ) -ge 0
      }
  )
  $profileProcessIds = @($profileProcesses | ForEach-Object {
    [int] $_.ProcessId
  })
  $browserOwner = $profileProcesses |
    Where-Object {
      $profileProcessIds -notcontains [int] $_.ParentProcessId
    } |
    Sort-Object CreationDate |
    Select-Object -First 1
  $browserProcessId = if ($null -ne $browserOwner) {
    [int] $browserOwner.ProcessId
  } else {
    $browser.Id
  }
  $viewport = Set-TypingManiaNovelGameViewport `
    -ProfileDirectory $BrowserProfileDirectory `
    -Width $GameViewportWidth `
    -Height $GameViewportHeight
  [PSCustomObject] @{
    version = 1
    processId = $browserProcessId
    projectRoot = $ExpectedProjectRoot
    executable = $edge
    profile = [System.IO.Path]::GetFullPath($BrowserProfileDirectory)
    url = $GameUrl
    viewportWidth = if ($null -ne $viewport) {
      $viewport.clientWidth
    } else {
      $null
    }
    viewportHeight = if ($null -ne $viewport) {
      $viewport.clientHeight
    } else {
      $null
    }
    startedAt = [DateTime]::UtcNow.ToString('o')
  } |
    ConvertTo-Json -Compress |
    Set-Content -LiteralPath $BrowserRecordFile -Encoding UTF8
}

function Show-LaunchError {
  param([string] $Message)

  if ($NoOpen) {
    Write-Error $Message
    return
  }

  try {
    Add-Type -AssemblyName System.Windows.Forms
    [void] [System.Windows.Forms.MessageBox]::Show(
      $Message,
      'TypingManiaNovel could not start',
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Error
    )
  } catch {
    # This fallback is only expected on unusual Windows installations.
    Start-Process -FilePath 'msg.exe' -ArgumentList @('*', $Message) -WindowStyle Hidden
  }
}

function Get-TypingManiaNovelNode {
  $isWindowsX64 = [Environment]::Is64BitOperatingSystem -and (
    $env:PROCESSOR_ARCHITECTURE -eq 'AMD64' -or
    $env:PROCESSOR_ARCHITEW6432 -eq 'AMD64'
  )

  if ($isWindowsX64 -and (Test-Path -LiteralPath $BundledNodeArchive -PathType Leaf)) {
    $needsExtraction = -not (
      Test-Path -LiteralPath $BundledNodeExecutable -PathType Leaf
    )
    if (-not $needsExtraction) {
      $nodeHash = (Get-FileHash `
        -LiteralPath $BundledNodeExecutable `
        -Algorithm SHA256).Hash.ToLowerInvariant()
      $needsExtraction = $nodeHash -ne $BundledNodeExecutableSha256
    }

    if ($needsExtraction) {
      $archiveHash = (Get-FileHash `
        -LiteralPath $BundledNodeArchive `
        -Algorithm SHA256).Hash.ToLowerInvariant()
      if ($archiveHash -ne $BundledNodeArchiveSha256) {
        throw "Bundled Node.js archive failed its integrity check: $BundledNodeArchive"
      }

      [void] (New-Item -ItemType Directory -Path $BundledNodeDirectory -Force)
      Add-Type -AssemblyName System.IO.Compression.FileSystem
      $archive = [System.IO.Compression.ZipFile]::OpenRead($BundledNodeArchive)
      try {
        $nodeEntryPath = "node-$BundledNodeVersion-win-x64/node.exe"
        $nodeEntry = $archive.Entries |
          Where-Object { $_.FullName -eq $nodeEntryPath } |
          Select-Object -First 1
        if ($null -eq $nodeEntry) {
          throw "Bundled Node.js archive is missing $nodeEntryPath."
        }
        $inputStream = $nodeEntry.Open()
        try {
          $outputStream = [System.IO.File]::Open(
            $BundledNodeExecutable,
            [System.IO.FileMode]::Create,
            [System.IO.FileAccess]::Write,
            [System.IO.FileShare]::None
          )
          try {
            $inputStream.CopyTo($outputStream)
          } finally {
            $outputStream.Dispose()
          }
        } finally {
          $inputStream.Dispose()
        }
      } finally {
        $archive.Dispose()
      }

      if (-not (Test-Path -LiteralPath $BundledNodeExecutable -PathType Leaf)) {
        throw "Bundled Node.js executable did not extract correctly."
      }
      $nodeHash = (Get-FileHash `
        -LiteralPath $BundledNodeExecutable `
        -Algorithm SHA256).Hash.ToLowerInvariant()
      if ($nodeHash -ne $BundledNodeExecutableSha256) {
        throw "Bundled Node.js executable failed its integrity check."
      }
    }
    return $BundledNodeExecutable
  }

  $systemNode = Get-Command 'node.exe' -ErrorAction SilentlyContinue
  if ($null -eq $systemNode) {
    throw (
      'A compatible bundled Node.js runtime is unavailable for this Windows ' +
      'architecture, and Node.js was not found on the system. Install Node.js ' +
      '20 or newer, then double-click start-game.cmd again.'
    )
  }
  $majorVersion = [int] (
    (& $systemNode.Source -p "process.versions.node.split('.')[0]").Trim()
  )
  if ($majorVersion -lt 20) {
    throw "Node.js 20 or newer is required; found Node.js $majorVersion."
  }
  return $systemNode.Source
}

function Import-WindowsProxyEnvironment {
  # Node honours explicit proxy environment variables. When the player uses
  # the ordinary Windows per-user proxy setting, mirror only that setting into
  # this child service; credentials and PAC contents are never logged or saved.
  if (
    [string]::IsNullOrWhiteSpace($env:HTTP_PROXY) -and
    [string]::IsNullOrWhiteSpace($env:HTTPS_PROXY)
  ) {
    try {
      $settings = Get-ItemProperty `
        -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' `
        -ErrorAction Stop
      if ([int] $settings.ProxyEnable -eq 1) {
        $proxy = [string] $settings.ProxyServer
        $httpProxy = ''
        $httpsProxy = ''
        if ($proxy.Contains(';')) {
          foreach ($entry in $proxy.Split(';')) {
            $parts = $entry.Split('=', 2)
            if ($parts.Count -ne 2) { continue }
            if ($parts[0] -eq 'http') { $httpProxy = $parts[1] }
            if ($parts[0] -eq 'https') { $httpsProxy = $parts[1] }
          }
        } else {
          $httpProxy = $proxy
          $httpsProxy = $proxy
        }
        if (-not [string]::IsNullOrWhiteSpace($httpProxy)) {
          if ($httpProxy -notmatch '^https?://') { $httpProxy = "http://$httpProxy" }
          $env:HTTP_PROXY = $httpProxy
        }
        if (-not [string]::IsNullOrWhiteSpace($httpsProxy)) {
          if ($httpsProxy -notmatch '^https?://') { $httpsProxy = "http://$httpsProxy" }
          $env:HTTPS_PROXY = $httpsProxy
        }
      }
    } catch {}
  }
  $localBypass = '127.0.0.1,localhost,::1'
  $proxyOverride = ''
  $proxyAutoConfig = ''
  $proxyScope = 'unknown'
  try {
    $settings = Get-ItemProperty `
      -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings' `
      -ErrorAction Stop
    $proxyOverride = [string] $settings.ProxyOverride
    $proxyAutoConfig = [string] $settings.AutoConfigURL
  } catch {}
  if ([string]::IsNullOrWhiteSpace($env:NO_PROXY)) {
    $env:NO_PROXY = $localBypass
  } else {
    $env:NO_PROXY = "$localBypass,$($env:NO_PROXY)"
  }
  if (-not [string]::IsNullOrWhiteSpace($proxyOverride)) {
    $env:NO_PROXY = "$env:NO_PROXY,$proxyOverride"
  }
  $httpCandidate = [string] $env:HTTP_PROXY
  $httpsCandidate = [string] $env:HTTPS_PROXY
  if ([string]::IsNullOrWhiteSpace($httpCandidate) -and [string]::IsNullOrWhiteSpace($httpsCandidate)) {
    $proxyScope = if (-not [string]::IsNullOrWhiteSpace($proxyAutoConfig)) { 'unknown' } else { 'none' }
  } elseif ($httpCandidate -match '(?i)(?:127\.0\.0\.1|localhost|::1)(?::\d+)?' -or
    $httpsCandidate -match '(?i)(?:127\.0\.0\.1|localhost|::1)(?::\d+)?' -or
    $proxyOverride -match '(?i)(?:qq|tencent|163|126|netease|kugou|bilibili|gtimg)') {
    $proxyScope = 'split'
  } else {
    $proxyScope = 'global'
  }
  $env:TMN_SYSTEM_HTTP_PROXY = [string] $env:HTTP_PROXY
  $env:TMN_SYSTEM_HTTPS_PROXY = [string] $env:HTTPS_PROXY
  $env:TMN_SYSTEM_NO_PROXY = [string] $env:NO_PROXY
  $env:TMN_SYSTEM_PROXY_SCOPE = $proxyScope
}

try {
  [void] (New-Item -ItemType Directory -Path $DataDirectory -Force)
  Remove-StaleManagedPidFiles
  Stop-ManagedProjectBrowser

  # Stop an older service owned by this project, then choose a free endpoint.
  # Other applications and other TypingManiaNovel copies remain untouched.
  $serverReady = Select-TypingManiaNovelEndpoint
  if (-not $serverReady) {
    $serverScript = Join-Path $ProjectRoot 'scripts\local-server.js'
    if (-not (Test-Path -LiteralPath $serverScript -PathType Leaf)) {
      throw "Missing local server: $serverScript"
    }

    $node = Get-TypingManiaNovelNode
    Import-WindowsProxyEnvironment
    $nodeMajor = [int] ((& $node -p "process.versions.node.split('.')[0]").Trim())
    $nodeArguments = @("`"$serverScript`"", "--port=$Port")
    if ($nodeMajor -ge 24) {
      $nodeArguments = @('--use-env-proxy') + $nodeArguments
    }

    $server = Start-Process `
      -FilePath $node `
      -ArgumentList $nodeArguments `
      -WorkingDirectory $ProjectRoot `
      -WindowStyle Hidden `
      -RedirectStandardOutput $OutputLog `
      -RedirectStandardError $ErrorLog `
      -PassThru

    [PSCustomObject] @{
      version = 2
      processId = $server.Id
      port = $Port
      projectRoot = $ExpectedProjectRoot
      serverScript = [System.IO.Path]::GetFullPath($serverScript)
      executable = [System.IO.Path]::GetFullPath($node)
      startedAt = [DateTime]::UtcNow.ToString('o')
    } |
      ConvertTo-Json -Compress |
      Set-Content -LiteralPath $PidFile -Encoding UTF8

    # The service binds before it scans the local library. A successful status
    # response means the browser can open immediately; preparation progress is
    # shown by the game instead of being mistaken for a port conflict.
    $deadline = [DateTime]::UtcNow.AddSeconds(15)
    while ([DateTime]::UtcNow -lt $deadline -and -not (Test-TypingManiaNovelServer)) {
      if ($server.HasExited) {
        break
      }
      Start-Sleep -Milliseconds 250
    }

    if (-not (Test-TypingManiaNovelServer)) {
      $details = ''
      if (Test-Path -LiteralPath $ErrorLog -PathType Leaf) {
        $details = (Get-Content -LiteralPath $ErrorLog -Tail 12) -join [Environment]::NewLine
      }
      if ([string]::IsNullOrWhiteSpace($details)) {
        if (Test-TcpPortListening $Port) {
          $details = (
            "Port $Port is listening, but it is not this TypingManiaNovel " +
            'service. Another application may be using that port.'
          )
        } elseif ($server.HasExited) {
          $details = "The local service exited with code $($server.ExitCode)."
        } else {
          $details = (
            'The service process started but could not open its local endpoint. ' +
            'Security software may have blocked the bundled runtime.'
          )
        }
      }
      if (-not $server.HasExited) {
        Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
      }
      Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
      throw "The local game service did not become ready.`n`n$details"
    }
  }

  # Opening happens independently of service creation, so double-click always works.
  if (-not $NoOpen) {
    Open-TypingManiaNovelBrowser
  }
} catch {
  Show-LaunchError ("Unable to start TypingManiaNovel.`n`n" + $_.Exception.Message)
  exit 1
}
