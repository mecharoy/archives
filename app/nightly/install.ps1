<#
  Registers the nightly brief with Windows Task Scheduler.

  Run it once, from PowerShell, in this folder:

      .\install.ps1                 # 22:30 every night
      .\install.ps1 -At 21:00       # some other hour
      .\install.ps1 -Remove         # take it off the schedule

  It needs no administrator rights: the task runs as you, which is the point —
  `claude -p` signs in with your Claude Code subscription, and that login is
  yours, not the machine's.

  If the computer is asleep at the hour, Windows runs the job at the next wake
  instead of skipping the night. If it is off, the night is skipped and the
  phone falls back to its own sums, which it says on screen.
#>

param(
  [string]$At = '22:30',
  [switch]$Remove
)

$ErrorActionPreference = 'Stop'
$TaskName = 'Site Khata nightly brief'
$Here     = Split-Path -Parent $MyInvocation.MyCommand.Path
$Runner   = Join-Path $Here 'run.mjs'
$Config   = Join-Path $env:USERPROFILE '.site-khata\nightly.json'

if ($Remove) {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    Write-Host "Removed '$TaskName'."
  } else {
    Write-Host "'$TaskName' was not scheduled."
  }
  return
}

# --- the three things that have to be true before this is worth scheduling ---

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { throw "node is not on PATH. Install Node, then run this again." }

$claude = (Get-Command claude -ErrorAction SilentlyContinue).Source
if (-not $claude) { throw "claude is not on PATH. Install Claude Code and sign in, then run this again." }

if (-not (Test-Path $Config)) {
  throw @"
No config at $Config

Create that file first:

  {
    "endpoint": "https://site-khata.<you>.workers.dev",
    "admin_token": "<the admin token>"
  }

It is deliberately outside the repository, because the repository is public.
"@
}

if (-not (Test-Path $Runner)) { throw "Cannot find $Runner" }

# --- register ---

$action = New-ScheduledTaskAction -Execute $node -Argument "`"$Runner`"" -WorkingDirectory $Here
$trigger = New-ScheduledTaskTrigger -Daily -At $At

# WakeToRun brings the machine out of sleep for it; StartWhenAvailable catches
# up on a night the machine was off at the hour but on soon after. Neither
# helps a machine that is fully shut down, and that is fine.
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -WakeToRun `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 20) `
  -MultipleInstances IgnoreNew

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Settings $settings -Description 'Writes tonight Site Khata brief and publishes it to his phone.' | Out-Null

Write-Host "Scheduled '$TaskName' for $At every night."
Write-Host "  node    : $node"
Write-Host "  claude  : $claude"
Write-Host "  script  : $Runner"
Write-Host "  log     : $(Join-Path $env:USERPROFILE '.site-khata\nightly.log')"
Write-Host ""
Write-Host "Try it now without publishing:  node `"$Runner`" --dry"
Write-Host "Run tonight's for real:         Start-ScheduledTask -TaskName '$TaskName'"
