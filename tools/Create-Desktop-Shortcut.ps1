# 创建桌面独立 App 快捷方式
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$vbsPath = Join-Path $repoRoot "Open Post Composer (App).vbs"
$desktopPath = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktopPath "博客发帖器.lnk"

$wshShell = New-Object -ComObject WScript.Shell
$shortcut = $wshShell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "wscript.exe"
$shortcut.Arguments = "`"$vbsPath`""
$shortcut.WorkingDirectory = $repoRoot
$shortcut.Description = "个人博客写作与发帖器 (独立 App 模式)"

# 尝试使用 Edge / 系统图标
$edgePath = "$env:ProgramFiles (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edgePath)) {
    $edgePath = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
}
if (Test-Path $edgePath) {
    $shortcut.IconLocation = "$edgePath,0"
} else {
    $shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,264"
}

$shortcut.Save()

Write-Host "==================================================" -ForegroundColor Green
Write-Host " [成功] 已在桌面生成快捷方式: 博客发帖器.lnk" -ForegroundColor Green
Write-Host " 路径: $shortcutPath" -ForegroundColor Gray
Write-Host " 双击即可像原生桌面 App 一样秒开独立发帖器！" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Green
