Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' 获取当前脚本所在目录（仓库根目录）
scriptPath = WScript.ScriptFullName
repoDir = fso.GetParentFolderName(scriptPath)
WshShell.CurrentDirectory = repoDir

port = 4173
targetUrl = "http://127.0.0.1:" & port & "/post-composer.html"
statusUrl = "http://127.0.0.1:" & port & "/status"

' 检查发帖器服务是否已经在运行
Function IsServerRunning()
    On Error Resume Next
    Set http = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    http.setTimeouts 500, 500, 500, 500
    http.open "GET", statusUrl, False
    http.send
    If Err.Number = 0 And http.Status = 200 Then
        IsServerRunning = True
    Else
        IsServerRunning = False
    End If
    On Error GoTo 0
End Function

' 如果服务未启动，静默在后台拉起 Python 服务（无黑框，窗口样式 0）
If Not IsServerRunning() Then
    psCommand = "powershell -NoProfile -ExecutionPolicy Bypass -File """ & repoDir & "\tools\start-post-composer.ps1"" -NoOpen"
    WshShell.Run psCommand, 0, True
    
    ' 等待服务就绪（最多等 3 秒）
    For i = 1 To 15
        WScript.Sleep 200
        If IsServerRunning() Then Exit For
    Next
End If

' 寻找支持独立 App 窗口模式的浏览器（Edge 或 Chrome）
Function FindAppBrowser()
    Dim paths(6)
    paths(0) = WshShell.ExpandEnvironmentStrings("%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe")
    paths(1) = WshShell.ExpandEnvironmentStrings("%ProgramFiles%\Microsoft\Edge\Application\msedge.exe")
    paths(2) = WshShell.ExpandEnvironmentStrings("%LocalAppData%\Microsoft\Edge\Application\msedge.exe")
    paths(3) = WshShell.ExpandEnvironmentStrings("%ProgramFiles%\Google\Chrome\Application\chrome.exe")
    paths(4) = WshShell.ExpandEnvironmentStrings("%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe")
    paths(5) = WshShell.ExpandEnvironmentStrings("%LocalAppData%\Google\Chrome\Application\chrome.exe")

    For Each p In paths
        If fso.FileExists(p) Then
            FindAppBrowser = p
            Exit Function
        End If
    Next
    FindAppBrowser = ""
End Function

browserExe = FindAppBrowser()

If browserExe <> "" Then
    ' 以独立 App 窗口模式启动（无地址栏、无书签栏，独立任务栏窗口）
    appCmd = """" & browserExe & """ --app=""" & targetUrl & """ --window-size=1280,840"
    WshShell.Run appCmd, 1, False
Else
    ' 兜底：用系统默认浏览器打开
    WshShell.Run targetUrl, 1, False
End If
