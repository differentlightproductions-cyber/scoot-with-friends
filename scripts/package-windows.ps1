$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$stageRoot = Join-Path $projectRoot 'releases\windows-0.8'
$friendRoot = Join-Path $stageRoot 'Scoot-with-Friends-Windows'
$ownerRoot = Join-Path $stageRoot 'Scoot-with-Friends-Owner'
foreach ($destination in @($friendRoot, $ownerRoot)) {
    New-Item -ItemType Directory -Force -Path "$destination\game", "$destination\runtime" | Out-Null
    Copy-Item -Path "$projectRoot\dist\client\*" -Destination "$destination\game" -Recurse -Force
    Copy-Item -LiteralPath "$projectRoot\portable\server.cjs", "$projectRoot\portable\Play Scoot with Friends.cmd", "$projectRoot\portable\READ ME.txt" -Destination $destination -Force
    Copy-Item -LiteralPath 'C:\Users\NickO\AppData\Local\pi-node\current\node.exe' -Destination "$destination\runtime\node.exe" -Force
}
Copy-Item -LiteralPath "$projectRoot\owner-private.json", "$projectRoot\portable\Owner Editor.cmd", "$projectRoot\portable\OWNER READ ME.txt" -Destination $ownerRoot -Force
Compress-Archive -LiteralPath $friendRoot -DestinationPath "$projectRoot\releases\Scoot-with-Friends-Windows.zip" -Force
Compress-Archive -LiteralPath $ownerRoot -DestinationPath "$projectRoot\releases\Scoot-with-Friends-Owner-Windows.zip" -Force
Write-Output 'Player and owner packages created. Previous release remains backed up.'
