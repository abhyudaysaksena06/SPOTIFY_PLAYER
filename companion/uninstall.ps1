# Removes the Scratch Speaker companion.
$profileDir = Join-Path $env:LOCALAPPDATA 'ScratchSpeaker'

Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path ([Environment]::GetFolderPath('Startup')) 'Scratch Speaker.lnk')

# stop the watcher and its browser window
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*scratch-speaker.ps1*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like "*$profileDir*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Start-Sleep -Seconds 1
Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $profileDir
Write-Host 'Scratch Speaker removed.' -ForegroundColor Green
