# Click at WINDOW-RELATIVE coords in the running OpenWrite window, then capture it.
# Used to collect first-hand UI evidence of screens behind clicks. ASCII-only.
param(
    [int]$X = 197,
    [int]$Y = 855,
    [string]$Out = "S:\writerD\reference\shot-openwrite-settings.png",
    [int]$SettleMs = 1500
)

$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

Add-Type -AssemblyName System.Drawing

$sig = @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class OWClick {
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);
    public delegate bool EnumProc(IntPtr h, IntPtr p);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT lpRect);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, IntPtr e);
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }

    public static IntPtr Pick(uint pid) {
        IntPtr best = IntPtr.Zero; int bestArea = 0;
        EnumWindows((h, p) => {
            uint wpid; GetWindowThreadProcessId(h, out wpid);
            if (wpid != pid || !IsWindowVisible(h)) return true;
            RECT r; GetWindowRect(h, out r);
            int a = (r.Right - r.Left) * (r.Bottom - r.Top);
            if (a > bestArea) { bestArea = a; best = h; }
            return true;
        }, IntPtr.Zero);
        return best;
    }
}
'@
if (-not ("OWClick" -as [type])) { Add-Type -TypeDefinition $sig }

# find running OpenWrite process
$proc = Get-Process -Name "OpenWrite" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $proc) {
    Write-Output "FAIL OpenWrite not running"
    exit 1
}

$h = [OWClick]::Pick([uint32]$proc.Id)
if ($h -eq [IntPtr]::Zero) { Write-Output "FAIL no window"; exit 1 }

if ([OWClick]::IsIconic($h)) { [OWClick]::ShowWindow($h, 9) | Out-Null; Start-Sleep -Milliseconds 800 }
[OWClick]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 800

# window-relative -> absolute
$r0 = New-Object OWClick+RECT
[OWClick]::GetWindowRect($h, [ref]$r0) | Out-Null
$X += $r0.Left
$Y += $r0.Top

[OWClick]::SetCursorPos($X, $Y) | Out-Null
Start-Sleep -Milliseconds 150
[OWClick]::mouse_event(0x0002, 0, 0, 0, [IntPtr]::Zero)
Start-Sleep -Milliseconds 60
[OWClick]::mouse_event(0x0004, 0, 0, 0, [IntPtr]::Zero)
Start-Sleep -Milliseconds $SettleMs
[OWClick]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 500

$r = New-Object OWClick+RECT
[OWClick]::GetWindowRect($h, [ref]$r) | Out-Null
$w = [int]($r.Right - $r.Left)
$ht = [int]($r.Bottom - $r.Top)

$bmp = New-Object System.Drawing.Bitmap -ArgumentList $w, $ht
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
$ok = [OWClick]::PrintWindow($h, $hdc, 2)
$g.ReleaseHdc($hdc)
$g.Dispose()
if (-not $ok) {
    $g2 = [System.Drawing.Graphics]::FromImage($bmp)
    $g2.CopyFromScreen($r.Left, $r.Top, 0, 0, (New-Object System.Drawing.Size -ArgumentList $w, $ht))
    $g2.Dispose()
}
$dir = Split-Path -Parent $Out
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output "SAVED $Out (clicked $X,$Y)"
