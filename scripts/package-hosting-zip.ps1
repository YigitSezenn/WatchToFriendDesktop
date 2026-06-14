param(
  [string]$Version = (Get-Content "$PSScriptRoot\..\package.json" -Raw | ConvertFrom-Json).version
)

$root = Resolve-Path "$PSScriptRoot\.."
$setupExe = Join-Path $root "release\WatchToFriend Setup $Version.exe"
$outDir = Join-Path $root "public\downloads"
$outZip = Join-Path $outDir "WatchToFriend-$Version.zip"

if (-not (Test-Path $setupExe)) {
  Write-Error "Kurulum dosyasi bulunamadi: $setupExe"
  exit 1
}

New-Item -ItemType Directory -Force -Path $outDir | Out-Null
if (Test-Path $outZip) { Remove-Item -Force $outZip }

Compress-Archive -Path $setupExe -DestinationPath $outZip -Force
Write-Host "Hosting zip hazir: $outZip"
Get-Item $outZip | Select-Object Name, @{ N = 'MB'; E = { [math]::Round($_.Length / 1MB, 1) } }
