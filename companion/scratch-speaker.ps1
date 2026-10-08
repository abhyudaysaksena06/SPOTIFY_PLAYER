# Scratch Speaker companion for Windows.
# Runs in the background, waits for Spotify to start, then opens the site's speaker page in a small
# Chrome app window (sound allowed without clicking). Closes that window when Spotify closes.
param(
  [string]$Site = 'https://spotifyplayer-one.vercel.app'
)

$profileDir = Join-Path $env:LOCALAPPDATA 'ScratchSpeaker'
$url = $Site.TrimEnd('/') + '/?speaker=1'

function Find-Browser {
  # Chrome first; Edge only as a fallback if Chrome isn't installed
  $candidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
  )
  foreach ($c in $candidates) { if ($c -and (Test-Path $c)) { return $c } }
  return $null
}

# browser processes started for our private profile (identified by the profile folder on the command line)
function Get-SpeakerProcesses {
  Get-CimInstance Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*$profileDir*" }
}

function Start-Speaker {
  if (Get-SpeakerProcesses) { return }
  $browser = Find-Browser
  if (-not $browser) { return }
  $bArgs = @(
    "--app=$url",
    "--user-data-dir=`"$profileDir`"",
    '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--disable-backgrounding-occluded-windows',
    '--no-first-run',
    '--window-size=380,460'
  )
  Start-Process -FilePath $browser -ArgumentList $bArgs -WindowStyle Minimized | Out-Null
}

function Stop-Speaker {
  Get-SpeakerProcesses | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

# only one copy of this watcher at a time
$mutex = New-Object System.Threading.Mutex($false, 'Global\ScratchSpeakerWatcher')
if (-not $mutex.WaitOne(0)) { exit }

$wasRunning = $false
while ($true) {
  $running = [bool](Get-Process -Name 'Spotify' -ErrorAction SilentlyContinue)
  if ($running -and -not $wasRunning) { Start-Sleep -Seconds 3; Start-Speaker }
  elseif ($running) { Start-Speaker }          # reopen it if the window was closed by hand
  elseif ($wasRunning) { Stop-Speaker }
  $wasRunning = $running
  Start-Sleep -Seconds 4
}
