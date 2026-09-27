# Launch OpenWrite.exe, restore its window, capture it to PNG.
# First-hand UI evidence for writerD replication. ASCII-only on purpose.
param(
    [string]$Exe = "S:\dsh\work\openwrite-201\exe\installed\OpenWrite.exe",
    [string]$Out = "S:\writerD\reference\shot-openwrite.png",
    [int]$WaitSec = 12
)

$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

Add-Type -AssemblyName System.Drawing

$sig = @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class WinCapOW {
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);
    public delegate bool EnumProc(IntPtr h, IntPtr p);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT lpRect);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr hWnd, IntPtr hdcBlt, uint nFlags);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
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
if (-not ("WinCapOW" -as [type])) { Add-Type -TypeDefinition $sig }

$proc = Start-Process $Exe -PassThru
Start-Sleep -Seconds $WaitSec
$proc.Refresh()

if ($proc.HasExited) {
    Write-Output "FAIL process exited: $($proc.ExitCode)"
    exit 1
}

$h = [WinCapOW]::Pick([uint32]$proc.Id)
if ($h -eq [IntPtr]::Zero) {
    Write-Output "FAIL no visible window for pid $($proc.Id)"
    Stop-Process -Id $proc.Id -Force
    exit 1
}

if ([WinCapOW]::IsIconic($h)) { [WinCapOW]::ShowWindow($h, 9) | Out-Null; Start-Sleep -Milliseconds 800 }
[WinCapOW]::ShowWindow($h, 5) | Out-Null
Start-Sleep -Milliseconds 400
[WinCapOW]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 1500

$r = New-Object WinCapOW+RECT
[WinCapOW]::GetWindowRect($h, [ref]$r) | Out-Null
$w = [int]($r.Right - $r.Left)
$ht = [int]($r.Bottom - $r.Top)
$title = New-Object System.Text.StringBuilder 512
[WinCapOW]::GetWindowText($h, $title, 512) | Out-Null
Write-Output "WINDOW $w x $ht  (L=$($r.Left) T=$($r.Top)) TITLE=$($title.ToString())"

$bmp = New-Object System.Drawing.Bitmap -ArgumentList $w, $ht
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
$ok = [WinCapOW]::PrintWindow($h, $hdc, 2)
$g.ReleaseHdc($hdc)
$g.Dispose()

if (-not $ok) {
    Write-Output "WARN PrintWindow returned false, falling back to screen copy"
    $g2 = [System.Drawing.Graphics]::FromImage($bmp)
    $g2.CopyFromScreen($r.Left, $r.Top, 0, 0, (New-Object System.Drawing.Size -ArgumentList $w, $ht))
    $g2.Dispose()
}

$dir = Split-Path -Parent $Out
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

Write-Output "SAVED $Out"
Write-Output "KEEP-RUNNING"
