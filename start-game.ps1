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
$PreferredPort = $Port
$DataDirectory = Join-Path $ProjectRoot 'data'
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
  try {
    $status = Invoke-RestMethod -Uri $StatusUrl -Method Get -TimeoutSec 2
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

  # A legacy PID is trusted only while the port itself proves that it serves
  # this exact project. New JSON records also bind the absolute script and
  # executable paths, preventing PID reuse from targeting another program.
  $ownedEndpoint = Test-TypingManiaNovelServerAtPort $CandidatePort
  $record = Read-ManagedServiceRecord $CandidatePort
  $managedProcess = Get-ManagedProcess $record
  if (
    -not $ownedEndpoint -or
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
  $projectServers = @()
  foreach ($candidate in $PreferredPort..$lastCandidate) {
    if (
      (Test-TcpPortListening $candidate) -and
      (Test-TypingManiaNovelServerAtPort $candidate)
    ) {
      $projectServers += $candidate
    }
  }
  if ($projectServers.Count -gt 0) {
    $selected = if ($projectServers -contains $PreferredPort) {
      $PreferredPort
    } else {
      $projectServers | Sort-Object | Select-Object -First 1
    }
    foreach ($candidate in $projectServers) {
      if ($candidate -ne $selected) {
        [void] (Stop-ManagedProjectServer $candidate)
      }
    }
    Set-TypingManiaNovelEndpoint $selected
    return $true
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

try {
  [void] (New-Item -ItemType Directory -Path $DataDirectory -Force)
  Remove-StaleManagedPidFiles

  # Reuse only a service owned by this project directory. If another copy is
  # already using the preferred port, choose the next free local port.
  $serverReady = Select-TypingManiaNovelEndpoint
  if (-not $serverReady) {
    $serverScript = Join-Path $ProjectRoot 'scripts\local-server.js'
    if (-not (Test-Path -LiteralPath $serverScript -PathType Leaf)) {
      throw "Missing local server: $serverScript"
    }

    $node = Get-TypingManiaNovelNode

    $server = Start-Process `
      -FilePath $node `
      -ArgumentList @("`"$serverScript`"", "--port=$Port") `
      -WorkingDirectory $ProjectRoot `
      -WindowStyle Hidden `
      -RedirectStandardOutput $OutputLog `
      -RedirectStandardError $ErrorLog `
      -PassThru

    [PSCustomObject] @{
      version = 1
      processId = $server.Id
      port = $Port
      projectRoot = $ExpectedProjectRoot
      serverScript = [System.IO.Path]::GetFullPath($serverScript)
      executable = [System.IO.Path]::GetFullPath($node)
      startedAt = [DateTime]::UtcNow.ToString('o')
    } |
      ConvertTo-Json -Compress |
      Set-Content -LiteralPath $PidFile -Encoding UTF8

    $deadline = [DateTime]::UtcNow.AddSeconds(30)
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
        $details = "Port $Port may be occupied by another application."
      }
      throw "The local game service did not become ready.`n`n$details"
    }
  }

  # Opening happens independently of service creation, so double-click always works.
  if (-not $NoOpen) {
    Start-Process -FilePath $GameUrl
  }
} catch {
  Show-LaunchError ("Unable to start TypingManiaNovel.`n`n" + $_.Exception.Message)
  exit 1
}
