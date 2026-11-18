param(
  [int]$SitePort = 5173,
  [int]$ComposerPort = 4173,
  [switch]$NoOpen
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

try {
  $toolsDir = $PSScriptRoot
  $repoRoot = Split-Path -Path $toolsDir -Parent
  $tmpDir = Join-Path $repoRoot "tmp"
  $siteRecordName = if ($SitePort -eq 5173) { "local-preview-jekyll.json" } else { "local-preview-jekyll-$SitePort.json" }
  $composerRecordName = if ($ComposerPort -eq 4173) { "local-preview-composer.json" } else { "local-preview-composer-$ComposerPort.json" }
  $siteRecordFile = Join-Path $tmpDir $siteRecordName
  $composerRecordFile = Join-Path $tmpDir $composerRecordName
  $legacySitePidFile = Join-Path $tmpDir "local-preview-jekyll.pid"
  $legacyComposerPidFile = Join-Path $tmpDir "local-preview-composer.pid"
  $siteLogFile = Join-Path $tmpDir "local-preview-jekyll.log"
  $siteErrFile = Join-Path $tmpDir "local-preview-jekyll.err.log"
  $siteDestination = Join-Path $tmpDir "_site-local-preview"
  $siteUrl = "http://127.0.0.1:$SitePort/"
  $composerStarter = Join-Path $toolsDir "start-post-composer.ps1"

  function Test-LocalPort {
    param([int]$Port)

    try {
      $client = New-Object System.Net.Sockets.TcpClient
      $client.Connect("127.0.0.1", $Port)
      $client.Close()
      return $true
    } catch {
      return $false
    }
  }

  function Get-ComposerStatus {
    param([int]$Port)

    try {
      $response = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/status" -Method Get -TimeoutSec 2
      if ($response.ok -eq $true -and $response.service -eq "post-composer" -and $response.requestToken) {
        return $response
      }
    } catch {
      return $null
    }
    return $null
  }

  function Test-SitePreview {
    param([int]$Port)

    try {
      $response = Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/" -TimeoutSec 2
      return $response.StatusCode -eq 200 -and ($response.Content.Contains('id="nav-composer-link"') -or $response.Content.Contains('data-site-closed="true"'))
    } catch {
      return $false
    }
  }

  function Remove-StaleRecord {
    param([string]$Path)

    if (-not (Test-Path -LiteralPath $Path)) {
      return
    }

    try {
      $record = Get-Content -LiteralPath $Path -Raw -ErrorAction Stop | ConvertFrom-Json
      $process = Get-Process -Id $record.pid -ErrorAction SilentlyContinue
      if (-not $process -or $process.StartTime.ToUniversalTime().ToString("o") -ne $record.startedAtUtc) {
        Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
      }
    } catch {
      Remove-Item -LiteralPath $Path -Force -ErrorAction SilentlyContinue
    }
  }

  if (-not (Test-Path -LiteralPath $tmpDir)) {
    New-Item -ItemType Directory -Path $tmpDir | Out-Null
  }

  Remove-Item -LiteralPath $legacySitePidFile, $legacyComposerPidFile -Force -ErrorAction SilentlyContinue
  Remove-StaleRecord -Path $siteRecordFile
  Remove-StaleRecord -Path $composerRecordFile

  $siteReady = Test-SitePreview -Port $SitePort
  if (-not $siteReady -and (Test-LocalPort -Port $SitePort)) {
    Write-Host "检测到端口 $SitePort 已被占用但服务未正常响应，正在自动清理残留进程..." -ForegroundColor Yellow
    try {
      Get-NetTCPConnection -LocalPort $SitePort -ErrorAction SilentlyContinue | ForEach-Object {
        if ($_.OwningProcess -gt 0) {
          Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
        }
      }
    } catch {}
    Start-Sleep -Seconds 1
  }

  $composerStatus = Get-ComposerStatus -Port $ComposerPort
  if (-not $composerStatus) {
    if (Test-LocalPort -Port $ComposerPort) {
      Write-Host "检测到端口 $ComposerPort 已被占用但服务未正常响应，正在自动清理残留进程..." -ForegroundColor Yellow
      try {
        Get-NetTCPConnection -LocalPort $ComposerPort -ErrorAction SilentlyContinue | ForEach-Object {
          if ($_.OwningProcess -gt 0) {
            Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
          }
        }
      } catch {}
      Start-Sleep -Seconds 1
    }
    & $composerStarter -Port $ComposerPort -NoOpen -RecordFile $composerRecordFile -EntryPoint "local-preview"
    $composerStatus = Get-ComposerStatus -Port $ComposerPort
  }
  if (-not $composerStatus) {
    throw "Post Composer failed to start on port $ComposerPort."
  }

  if (-not $siteReady) {
    $rubyExe = (Get-Command ruby).Source
    $siteProcess = Start-Process `
      -FilePath $rubyExe `
      -ArgumentList "-S", "bundle", "exec", "jekyll", "serve", "--host", "127.0.0.1", "--port", $SitePort, "--destination", $siteDestination, "--livereload" `
      -WorkingDirectory $repoRoot `
      -RedirectStandardOutput $siteLogFile `
      -RedirectStandardError $siteErrFile `
      -WindowStyle Hidden `
      -PassThru

    $siteDeadline = (Get-Date).AddSeconds(12)
    while ((Get-Date) -lt $siteDeadline) {
      if (Test-SitePreview -Port $SitePort) {
        $siteReady = $true
        break
      }
      if ($siteProcess.HasExited) {
        throw "Jekyll preview failed to start. Check $siteErrFile."
      }
      Start-Sleep -Milliseconds 250
    }

    if (-not $siteReady) {
      throw "Jekyll preview failed to become ready on port $SitePort. Check $siteErrFile."
    }

    if ($siteProcess.HasExited) {
      throw "Jekyll preview started, but its owned process could not be recorded."
    }

    [PSCustomObject]@{
      service = "jekyll-preview"
      pid = $siteProcess.Id
      port = $SitePort
      entryPoint = "local-preview"
      startedAtUtc = $siteProcess.StartTime.ToUniversalTime().ToString("o")
      marker = "todo-composer-link"
    } | ConvertTo-Json | Set-Content -LiteralPath $siteRecordFile -Encoding UTF8
  }

  if (-not $NoOpen) {
    Start-Process $siteUrl
  }

  Write-Host ""
  Write-Host "Local preview is running at $siteUrl"
  Write-Host "Use the LOCAL ONLY section on the home page to open Post Composer."
  Write-Host ""
  Write-Host "To stop services launched by this shortcut, run:"
  Write-Host "powershell -ExecutionPolicy Bypass -File .\tools\stop-local-preview.ps1"
  Write-Host ""

  try {
    while ($true) {
      Start-Sleep -Seconds 1
    }
  } finally {
    & (Join-Path $toolsDir "stop-local-preview.ps1") -SitePort $SitePort -ComposerPort $ComposerPort
  }
} catch {
  Write-Host ""
  Write-Host "==================================================" -ForegroundColor Red
  Write-Host " 启动本地服务时发生致命错误：" -ForegroundColor Red
  Write-Host " $_" -ForegroundColor Yellow
  Write-Host "==================================================" -ForegroundColor Red
  Write-Host ""
  $toolsDir = $PSScriptRoot
  & (Join-Path $toolsDir "stop-local-preview.ps1") -SitePort $SitePort -ComposerPort $ComposerPort -ErrorAction SilentlyContinue
  exit 1
}
