# Installs the Scratch Speaker companion: starts with Windows (hidden) and runs now.
param(
  [string]$Site = 'https://spotifyplayer-one.vercel.app'
)

$dest = Join-Path $env:LOCALAPPDATA 'ScratchSpeaker\app'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item -Force (Join-Path $PSScriptRoot 'scratch-speaker.ps1') $dest
$script = Join-Path $dest 'scratch-speaker.ps1'

$psArgs = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`" -Site `"$Site`""

# shortcut in the user's Startup folder (no admin rights needed)
$startup = [Environment]::GetFolderPath('Startup')
$lnk = Join-Path $startup 'Scratch Speaker.lnk'
$shell = New-Object -ComObject WScript.Shell
$sc = $shell.CreateShortcut($lnk)
$sc.TargetPath = (Get-Command powershell.exe).Source
$sc.Arguments = $psArgs
$sc.WindowStyle = 7
$sc.Description = 'Plays phone scratches while Spotify is open'
$sc.Save()

Start-Process powershell.exe -ArgumentList $psArgs -WindowStyle Hidden

Write-Host ''
Write-Host 'Scratch Speaker installed.' -ForegroundColor Green
Write-Host "It now starts with Windows and opens automatically whenever Spotify is running."
Write-Host "First time only: when the Scratch Speaker window appears, log in with Spotify."
Write-Host ''
