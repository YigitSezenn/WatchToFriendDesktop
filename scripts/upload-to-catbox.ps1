# Kurulum paketini buluta yükler ve downloads.json günceller.
# Kullanım: .\scripts\upload-to-catbox.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$pkg = Get-Content (Join-Path $root 'package.json') | ConvertFrom-Json
$ver = $pkg.version
$exe = Join-Path $root "release\WatchToFriend Setup $ver.exe"
$zip = Join-Path $root "public\WatchToFriend-Kurulum-$ver.zip"

if (-not (Test-Path $exe)) {
  Write-Error "Önce npm run dist çalıştır. Bulunamadı: $exe"
}

if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path $exe -DestinationPath $zip -Force

Write-Host "Yükleniyor: $zip"
$result = curl.exe -s -F "reqtype=fileupload" -F "fileToUpload=@$zip" https://catbox.moe/user/api.php
if ($result -notmatch '^https://') {
  Write-Error "Yükleme başarısız: $result"
}

Write-Host "Bulut URL: $result"
$downloads = @{
  windows = @{
    version = $ver
    url = $result.Trim()
    filename = "WatchToFriend-Kurulum-$ver.zip"
    setupExe = "WatchToFriend Setup $ver.exe"
    host = 'catbox.moe'
    updated = (Get-Date -Format 'yyyy-MM-dd')
  }
} | ConvertTo-Json -Depth 3
$downloads | Set-Content (Join-Path $root 'public\downloads.json') -Encoding UTF8
Write-Host "downloads.json güncellendi. index.html linklerini bu URL ile güncelle ve firebase deploy --only hosting"
