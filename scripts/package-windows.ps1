$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
$stageRoot = Join-Path $projectRoot "releases\windows-$version"
$runtime = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $runtime) { $runtime = 'C:\Users\NickO\AppData\Local\pi-node\current\node.exe' }
if (-not (Test-Path -LiteralPath $runtime)) { throw 'Node 22 runtime not found. Install Node and retry.' }
if (-not (Test-Path -LiteralPath "$projectRoot\dist\client\index.html")) { throw 'Build the game before packaging.' }
$hasOwner = Test-Path -LiteralPath "$projectRoot\owner-private.json"
$packages = @('Scoot-with-Friends-Windows')
if ($hasOwner) { $packages += 'Scoot-with-Friends-Owner' }
foreach ($name in $packages) {
    $destination = Join-Path $stageRoot $name
    $gameTarget = [IO.Path]::GetFullPath((Join-Path $destination 'game'))
    $allowedStage = [IO.Path]::GetFullPath($stageRoot) + [IO.Path]::DirectorySeparatorChar
    if (-not $gameTarget.StartsWith($allowedStage, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected package path' }
    if (Test-Path -LiteralPath $gameTarget) { Remove-Item -LiteralPath $gameTarget -Recurse -Force }
    New-Item -ItemType Directory -Force -Path "$destination\game", "$destination\runtime" | Out-Null
    Copy-Item -Path "$projectRoot\dist\client\*" -Destination "$destination\game" -Recurse -Force
    Copy-Item -LiteralPath "$projectRoot\portable\server.cjs", "$projectRoot\portable\Play Scoot with Friends.cmd", "$projectRoot\portable\READ ME.txt" -Destination $destination -Force
    Copy-Item -LiteralPath $runtime -Destination "$destination\runtime\node.exe" -Force
    $zip = Join-Path $projectRoot "releases\$name.zip"
    if ($name -eq 'Scoot-with-Friends-Owner') {
        Copy-Item -LiteralPath "$projectRoot\owner-private.json", "$projectRoot\portable\Owner Editor.cmd", "$projectRoot\portable\OWNER READ ME.txt" -Destination $destination -Force
        $zip = Join-Path $projectRoot 'releases\Scoot-with-Friends-Owner-Windows.zip'
    }
    if (Test-Path -LiteralPath $zip) { Copy-Item -LiteralPath $zip -Destination ($zip + '.' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.previous') }
    Compress-Archive -LiteralPath $destination -DestinationPath $zip -Force
}
Write-Output 'Playable player package created; previous ZIP preserved. Owner package updated only when local owner credentials exist.'
