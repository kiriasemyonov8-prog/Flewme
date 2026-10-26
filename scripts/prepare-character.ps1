# Готовит картинки персонажа и фона для приложения из файлов автора в docs\character.
# Запуск из папки проекта:  powershell -ExecutionPolicy Bypass -File scripts\prepare-character.ps1
# Что делает: обрезает пустые прозрачные поля, уменьшает до размеров для телефона,
# у фонов комнат (по одному на тему) достраивает прозрачные уголки. Оригиналы не трогает.
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

# Комната под каждую тему (3.33). Без прозрачности: JPEG намного легче.
# Берём полосу комнаты (строки, где картинка непрозрачна), прозрачные скруглённые уголки
# достраиваем ближайшим цветом той же строки — скругление рисует CSS.
$rooms = [ordered]@{ 'СВЕТЛАЯ.PNG' = 'bg-light.jpg'; 'ГРАФИТ.PNG' = 'bg-dark.jpg'; 'АВРОРА.PNG' = 'bg-aurora.jpg' }
$jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$params = New-Object System.Drawing.Imaging.EncoderParameters 1
$params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), 84L
foreach ($name in $rooms.Keys) {
  $bg = [System.Drawing.Bitmap]::FromFile((Resolve-Path (Join-Path $src $name)).Path)
  # полоса комнаты — строки, где непрозрачна середина картинки (в каждой есть цвет для уголков)
  $mid = [int]($bg.Width / 2); $top = 0; $bottom = $bg.Height - 1
  while ($bg.GetPixel($mid, $top).A -lt 250) { $top++ }
  while ($bg.GetPixel($mid, $bottom).A -lt 250) { $bottom-- }
  $room = $bg.Clone((New-Object System.Drawing.Rectangle 0, $top, $bg.Width, ($bottom - $top + 1)), [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $bg.Dispose()
  $rw = $room.Width
  for ($y = 0; $y -lt $room.Height; $y++) {
    if ($room.GetPixel(0, $y).A -lt 250) {
      $x = 0; while ($x -lt $rw -and $room.GetPixel($x, $y).A -lt 250) { $x++ }
      if ($x -lt $rw) { $c = $room.GetPixel($x, $y); for ($i = 0; $i -lt $x; $i++) { $room.SetPixel($i, $y, $c) } }
    }
    if ($room.GetPixel($rw - 1, $y).A -lt 250) {
      $x = $rw - 1; while ($x -ge 0 -and $room.GetPixel($x, $y).A -lt 250) { $x-- }
      if ($x -ge 0) { $c = $room.GetPixel($x, $y); for ($i = $x + 1; $i -lt $rw; $i++) { $room.SetPixel($i, $y, $c) } }
    }
  }
  $w = 1600; $h = [int]($room.Height * $w / $rw)
  $o = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($o)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($room, 0, 0, $w, $h)
  $g.Dispose(); $room.Dispose()
  $out = Join-Path $dst $rooms[$name]
  $o.Save($out, $jpeg, $params)
  $o.Dispose()
  "{0}: {1}x{2}, {3} КБ" -f $rooms[$name], $w, $h, [int]((Get-Item $out).Length / 1KB)
}
