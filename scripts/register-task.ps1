# Creates (or replaces) the daily 04:00 task that runs the nightly update.
# Run once from the project folder: powershell -ExecutionPolicy Bypass -File scripts\register-task.ps1
$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
New-Item -ItemType Directory -Force (Join-Path $project 'logs') | Out-Null

$action = New-ScheduledTaskAction -Execute 'cmd.exe' `
  -Argument "/c cd /d `"$project`" && npm run nightly >> logs\scheduler.log 2>&1"
$trigger = New-ScheduledTaskTrigger -Daily -At 4:00am
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun `
  -ExecutionTimeLimit (New-TimeSpan -Hours 8) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
# Runs as you, only while you're signed in, so Claude Code's login and your env vars are available.
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName 'ContentRadarNightly' -Action $action -Trigger $trigger `
  -Settings $settings -Principal $principal -Description 'Content Radar: daily update of content.swiftwf.com' -Force | Out-Null
Write-Host "Registered ContentRadarNightly: daily at 04:00 (catches up after a missed start)."
