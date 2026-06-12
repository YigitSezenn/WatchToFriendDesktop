$nodeDir = "${env:ProgramFiles}\nodejs"
if (-not (Test-Path "$nodeDir\npm.cmd")) {
    Write-Error "Node.js bulunamadi. https://nodejs.org adresinden kurun."
    exit 1
}
$env:PATH = "$nodeDir;$env:PATH"
Set-Location $PSScriptRoot
npm run build @args
