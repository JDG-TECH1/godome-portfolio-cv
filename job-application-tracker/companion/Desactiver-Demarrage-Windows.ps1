$ErrorActionPreference = "Stop"
$taskName = "EmploiIA-Compagnon"
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if (-not $task) {
  Write-Host "Aucune tâche de démarrage EmploiIA n'est installée."
  exit 0
}

$answer = Read-Host "Retirer le démarrage automatique du compagnon ? (oui/non)"
if ($answer -notin @("oui", "OUI", "Oui")) {
  Write-Host "Aucun changement effectué."
  exit 0
}

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
Write-Host "Démarrage automatique désactivé. Les données locales ne sont pas supprimées."
