param(
  [int]$SitePort = 5173,
  [int]$ComposerPort = 4173
)

$ErrorActionPreference = "Stop"

$toolsDir = $PSScriptRoot
$repoRoot = Split-Path -Path $toolsDir -Parent
$tmpDir = Join-Path $repoRoot "tmp"
$siteRecordName = if ($SitePort -eq 5173) { "local-preview-jekyll.json" } else { "local-preview-jekyll-$SitePort.json" }
$composerRecordName = if ($ComposerPort -eq 4173) { "local-preview-composer.json" } else { "local-preview-composer-$ComposerPort.json" }
$siteRecordFile = Join-Path $tmpDir $siteRecordName
$composerRecordFile = Join-Path $tmpDir $composerRecordName
$legacySitePidFile = Join-Path $tmpDir "local-preview-jekyll.pid"
$legacyComposerPidFile = Join-Path $tmpDir "local-preview-composer.pid"
$composerStopper = Join-Path $toolsDir "stop-post-composer.ps1"

function Test-SitePreview {
  param([int]$Port)

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/" -TimeoutSec 2
    return $response.StatusCode -eq 200 -and ($response.Content.Contains('id="nav-composer-link"') -or $response.Content.Contains('data-site-closed="true"'))
  } catch {
    return $false
  }
}

function Test-JekyllRecord {
  param([object]$Record)

  if (-not $Record -or $Record.service -ne "jekyll-preview" -or -not $Record.pid -or -not $Record.port -or -not $Record.startedAtUtc) {
    return $false
  }

  $process = Get-Process -Id $Record.pid -ErrorAction SilentlyContinue
  if (-not $process -or $process.StartTime.ToUniversalTime().ToString("o") -ne $Record.startedAtUtc) {
    return $false
  }

  if (-not (Test-SitePreview -Port $Record.port)) {
    return $false
  }

  return $true
}

Remove-Item -LiteralPath $legacySitePidFile, $legacyComposerPidFile -Force -ErrorAction SilentlyContinue

if (Test-Path -LiteralPath $siteRecordFile) {
  try {
    $siteRecord = Get-Content -LiteralPath $siteRecordFile -Raw -ErrorAction Stop | ConvertFrom-Json
    if (Test-JekyllRecord -Record $siteRecord) {
      Stop-Process -Id $siteRecord.pid -Force
      Write-Host "Stopped Jekyll preview (PID $($siteRecord.pid))."
    } else {
      Write-Host "Jekyll preview ownership could not be verified; no process was stopped."
    }
  } catch {
    Write-Host "Removed an invalid Jekyll preview process record without stopping a process."
  }
  Remove-Item -LiteralPath $siteRecordFile -Force -ErrorAction SilentlyContinue
} else {
  Write-Host "No owned Jekyll preview process record was found."
}

& $composerStopper -RecordFile $composerRecordFile
