# Готовит картинки персонажа и фона для приложения из файлов автора в docs\character.
# Запуск из папки проекта:  powershell -ExecutionPolicy Bypass -File scripts\prepare-character.ps1
# Что делает: обрезает пустые прозрачные поля, уменьшает до размеров для телефона,
# у фона убирает полупрозрачную жёлтую кайму по краю. Оригиналы не трогает.
Add-Type -AssemblyName System.Drawing

$src = Join-Path $PSScriptRoot '..\docs\character'
$dst = Join-Path $PSScriptRoot '..\src\assets\character'
New-Item -ItemType Directory -Force $dst | Out-Null

function Get-Bounds([System.Drawing.Bitmap]$b, [int]$minAlpha) {
  $l = $b.Width; $t = $b.Height; $r = 0; $btm = 0
  for ($y = 0; $y -lt $b.Height; $y += 2) {
    for ($x = 0; $x -lt $b.Width; $x += 2) {
      if ($b.GetPixel($x, $y).A -ge $minAlpha) {
        if ($x -lt $l) { $l = $x }; if ($x -gt $r) { $r = $x }
        if ($y -lt $t) { $t = $y }; if ($y -gt $btm) { $btm = $y }
      }
    }
  }
  return [System.Drawing.Rectangle]::FromLTRB($l, $t, [Math]::Min($b.Width, $r + 2), [Math]::Min($b.Height, $btm + 2))
}

function Save-Resized([System.Drawing.Bitmap]$b, [System.Drawing.Rectangle]$crop, [int]$maxSide, [string]$out, [int]$alphaCut) {
  $scale = [Math]::Min(1.0, $maxSide / [Math]::Max($crop.Width, $crop.Height))
  $w = [int]($crop.Width * $scale); $h = [int]($crop.Height * $scale)
  $o = New-Object System.Drawing.Bitmap $w, $h, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $g = [System.Drawing.Graphics]::FromImage($o)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($b, (New-Object System.Drawing.Rectangle 0, 0, $w, $h), $crop, [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()
  if ($alphaCut -gt 0) {
    # Жёсткий край: пиксели слабее порога становятся прозрачными, остальные — непрозрачными.
    for ($y = 0; $y -lt $h; $y++) {
      for ($x = 0; $x -lt $w; $x++) {
        $p = $o.GetPixel($x, $y)
        if ($p.A -lt $alphaCut) { $o.SetPixel($x, $y, [System.Drawing.Color]::Transparent) }
        elseif ($p.A -lt 255) { $o.SetPixel($x, $y, [System.Drawing.Color]::FromArgb(255, $p.R, $p.G, $p.B)) }
      }
    }
  }
  $o.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $o.Dispose()
  "{0}: {1}x{2}, {3} КБ" -f (Split-Path $out -Leaf), $w, $h, [int]((Get-Item $out).Length / 1KB)
}

foreach ($n in 'calm', 'happy', 'sad') {
  $b = [System.Drawing.Bitmap]::FromFile((Resolve-Path (Join-Path $src "$n.PNG")).Path)
  Save-Resized $b (Get-Bounds $b 60) 440 (Join-Path $dst "$n.png") 0
  $b.Dispose()
}

# Фон без прозрачности: JPEG намного легче. Скруглённые углы рисует CSS (радиус больше,
# чем у картинки), поэтому прозрачные уголки заливаем цветом стены — они всё равно будут срезаны.
$bg = [System.Drawing.Bitmap]::FromFile((Resolve-Path (Join-Path $src 'character background 1.PNG')).Path)
$crop = Get-Bounds $bg 200
$w = 1100; $h = [int]($crop.Height * $w / $crop.Width)
$o = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($o)
$g.Clear([System.Drawing.Color]::FromArgb(151, 167, 120))
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($bg, (New-Object System.Drawing.Rectangle 0, 0, $w, $h), $crop, [System.Drawing.GraphicsUnit]::Pixel)
$g.Dispose()
$jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters 1
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 84L
$out = Join-Path $dst 'background.jpg'
$o.Save($out, $jpeg, $params)
$o.Dispose(); $bg.Dispose()
"background.jpg: {0}x{1}, {2} КБ" -f $w, $h, [int]((Get-Item $out).Length / 1KB)
