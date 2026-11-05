$ErrorActionPreference = "Stop"
$taskName = "EmploiIA-Compagnon"
$node = (Get-Command node.exe -ErrorAction Stop).Source
$entryPoint = Join-Path $PSScriptRoot "server.mjs"
$projectDirectory = Split-Path -Parent $PSScriptRoot

Write-Host "Cette tâche démarrera le compagnon à l'ouverture de ta session Windows."
Write-Host "Elle n'utilise que ton compte Windows standard et ne s'exécute pas si tu n'es pas connecté."
$answer = Read-Host "Confirmer la création de la tâche planifiée ? (oui/non)"
if ($answer -notin @("oui", "OUI", "Oui")) {
  Write-Host "Aucun changement effectué."
  exit 0
}

$action = New-ScheduledTaskAction -Execute $node -Argument "`"$entryPoint`"" -WorkingDirectory $projectDirectory
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description "Démarre le compagnon local de recherche d'emploi EmploiIA." -Force | Out-Null
Write-Host "Démarrage à l'ouverture de session activé. Pour le retirer, lance Desactiver-Demarrage-Windows.ps1."
