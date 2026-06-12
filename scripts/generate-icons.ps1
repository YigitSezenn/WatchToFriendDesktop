# Yeni marka ikonunu tüm hedeflere üretir (ortadan kare kırp + 256/512 px).
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$defaultSrc = Join-Path $root 'build\brand-source.png'
$src = if ($args[0]) { $args[0] } else { $defaultSrc }

if (-not (Test-Path $src)) {
  Write-Error "Kaynak ikon bulunamadi: $src"
}

Add-Type -AssemblyName System.Drawing

function Save-SquareIcon([string]$path, [int]$size) {
  $dir = Split-Path $path -Parent
  if ($dir -and -not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }

  $bmp = [System.Drawing.Bitmap]::FromFile($src)
  try {
    $crop = [Math]::Min($bmp.Width, $bmp.Height)
    $x = [int](($bmp.Width - $crop) / 2)
    $y = [int](($bmp.Height - $crop) / 2)
    $rect = New-Object System.Drawing.Rectangle($x, $y, $crop, $crop)
    $square = $bmp.Clone($rect, $bmp.PixelFormat)

    $out = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($out)
    try {
      $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $g.Clear([System.Drawing.Color]::Transparent)
      $g.DrawImage($square, 0, 0, $size, $size)
    } finally { $g.Dispose() }

    $out.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    Write-Output "OK $path ($size px)"
  } finally {
    $bmp.Dispose()
  }
}

$targets512 = @(
  (Join-Path $root 'build\icon.png'),
  (Join-Path $root 'public\brand-logo.png'),
  (Join-Path $root 'src\renderer\public\brand-logo.png'),
  (Join-Path $root 'src\renderer\src\assets\brand-logo.png'),
  (Join-Path $root '..\WatchToFriend\app\src\main\res\drawable-nodpi\brand_logo.png')
)

foreach ($t in $targets512) { Save-SquareIcon $t 512 }

$faviconIco = Join-Path $root 'public\favicon.ico'
$buildIco = Join-Path $root 'build\icon.ico'
Write-Output 'Icon generation complete.'
