# Genera los íconos del panel: cuatro cuadros con el color y el dibujo de cada módulo
# (Tiempo, Dinero, Estudio, Entreno) sobre el fondo oscuro de la app.
# Uso: powershell -File assets\generar.ps1
Add-Type -AssemblyName System.Drawing
$dir = Split-Path -Parent $MyInvocation.MyCommand.Path
$col = { param($h) [System.Drawing.ColorTranslator]::FromHtml($h) }

function Ruta([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = 2 * $r
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  $p
}

function Icono([int]$tam, [string]$nombre, [bool]$mascara, [bool]$dibujos) {
  $bmp = New-Object System.Drawing.Bitmap $tam, $tam
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $s = $tam / 64.0
  $fondo = New-Object System.Drawing.SolidBrush (& $col '#0B0E13')
  if ($mascara) { $g.Clear((& $col '#0B0E13')) }
  else { $g.Clear([System.Drawing.Color]::Transparent); $g.FillPath($fondo, (Ruta 0 0 $tam $tam (14 * $s))) }

  # En la máscara el dibujo va más chico para que no lo recorte el círculo
  $k = if ($mascara) { 0.72 } else { 1.0 }
  $o = 32 - 32 * $k
  $P = { param($v) ($o + $v * $k) * $s }
  $L = { param($v) $v * $k * $s }

  $lado = 21; $a = 9.5; $b = 33.5
  $cuadros = @(
    @{ x = $a; y = $a; c = '#0EA5E9'; d = 'reloj' },
    @{ x = $b; y = $a; c = '#10B981'; d = 'plata' },
    @{ x = $a; y = $b; c = '#8B5CF6'; d = 'libro' },
    @{ x = $b; y = $b; c = '#F97316'; d = 'pesa' }
  )
  $lapiz = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), (& $L 2.3)
  $lapiz.StartCap = 'Round'; $lapiz.EndCap = 'Round'; $lapiz.LineJoin = 'Round'
  foreach ($q in $cuadros) {
    $g.FillPath((New-Object System.Drawing.SolidBrush (& $col $q.c)), (Ruta (& $P $q.x) (& $P $q.y) (& $L $lado) (& $L $lado) (& $L 6)))
    if (-not $dibujos) { continue }
    $cx = $q.x + $lado / 2; $cy = $q.y + $lado / 2
    $X = { param($v) & $P ($cx + $v) }
    $Y = { param($v) & $P ($cy + $v) }
    switch ($q.d) {
      'reloj' {
        $g.DrawEllipse($lapiz, (& $X -6), (& $Y -6), (& $L 12), (& $L 12))
        $g.DrawLine($lapiz, (& $X 0), (& $Y -3.2), (& $X 0), (& $Y 0))
        $g.DrawLine($lapiz, (& $X 0), (& $Y 0), (& $X 2.6), (& $Y 1.6))
      }
      'plata' {
        $f = New-Object System.Drawing.Font('Segoe UI', [float](& $L 15), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
        $fmt = New-Object System.Drawing.StringFormat
        $fmt.Alignment = 'Center'; $fmt.LineAlignment = 'Center'
        $g.DrawString('$', $f, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF((& $X -8), (& $Y -7.6), (& $L 16), (& $L 16))), $fmt)
      }
      'libro' {
        $g.DrawLine($lapiz, (& $X 0), (& $Y -3.5), (& $X 0), (& $Y 5))
        $g.DrawLines($lapiz, [System.Drawing.PointF[]]@(
          (New-Object System.Drawing.PointF((& $X 0), (& $Y -3.5))), (New-Object System.Drawing.PointF((& $X -6.5), (& $Y -5))),
          (New-Object System.Drawing.PointF((& $X -6.5), (& $Y 3.5))), (New-Object System.Drawing.PointF((& $X 0), (& $Y 5))),
          (New-Object System.Drawing.PointF((& $X 6.5), (& $Y 3.5))), (New-Object System.Drawing.PointF((& $X 6.5), (& $Y -5))),
          (New-Object System.Drawing.PointF((& $X 0), (& $Y -3.5)))))
      }
      'pesa' {
        $g.DrawLine($lapiz, (& $X -4), (& $Y 0), (& $X 4), (& $Y 0))
        $g.DrawLine($lapiz, (& $X -4), (& $Y -4.5), (& $X -4), (& $Y 4.5))
        $g.DrawLine($lapiz, (& $X 4), (& $Y -4.5), (& $X 4), (& $Y 4.5))
        $g.DrawLine($lapiz, (& $X -6.8), (& $Y -2.5), (& $X -6.8), (& $Y 2.5))
        $g.DrawLine($lapiz, (& $X 6.8), (& $Y -2.5), (& $X 6.8), (& $Y 2.5))
      }
    }
  }
  $bmp.Save((Join-Path $dir $nombre), [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

Icono 512 'icon-512.png' $false $true
Icono 192 'icon-192.png' $false $true
Icono 180 'apple-touch-icon.png' $true $true
Icono 512 'icon-maskable-512.png' $true $true
Icono 32 'favicon-32.png' $false $false
