# Launch writerd.exe, restore its window, capture it to PNG.
# Used to verify UI rendering without a human looking at the screen.
# ASCII-only on purpose: Windows PowerShell 5.1 misreads UTF-8 files without BOM.
param(
    [string]$Exe = "S:\writerD\src-tauri\target\release\writerd.exe",
    [string]$Out = "S:\writerD\shots\shot-writerd.png",
    [int]$WaitSec = 10
)

$OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

Add-Type -AssemblyName System.Drawing

$sig = @'
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class WinCap {
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

    // Pick the largest visible top-level window owned by pid (the app window,
    // not WebView2 helper windows). Prefer one whose title matches.
    public static IntPtr Pick(uint pid, string titleLike) {
        IntPtr best = IntPtr.Zero; int bestArea = 0;
        EnumWindows((h, p) => {
            uint wpid; GetWindowThreadProcessId(h, out wpid);
            if (wpid != pid || !IsWindowVisible(h)) return true;
            var t = new StringBuilder(512); GetWindowText(h, t, 512);
            if (!String.IsNullOrEmpty(titleLike) && t.ToString().IndexOf(titleLike) < 0) return true;
            RECT r; GetWindowRect(h, out r);
            int a = (r.Right - r.Left) * (r.Bottom - r.Top);
            if (a > bestArea) { bestArea = a; best = h; }
            return true;
        }, IntPtr.Zero);
        return best;
    }
}
'@
if (-not ("WinCap" -as [type])) { Add-Type -TypeDefinition $sig }

$proc = Start-Process $Exe -PassThru
Start-Sleep -Seconds $WaitSec
$proc.Refresh()

if ($proc.HasExited) {
    Write-Output "FAIL process exited: $($proc.ExitCode)"
    exit 1
}

$h = [WinCap]::Pick([uint32]$proc.Id, $null)
if ($h -eq [IntPtr]::Zero) {
    Write-Output "FAIL no visible window for pid $($proc.Id)"
    Stop-Process -Id $proc.Id -Force
    exit 1
}

# A freshly started window can be born minimized; restore it, else the capture
# is a 160x28 off-screen frame at (-32000,-32000).
if ([WinCap]::IsIconic($h)) { [WinCap]::ShowWindow($h, 9) | Out-Null; Start-Sleep -Milliseconds 800 }
[WinCap]::ShowWindow($h, 5) | Out-Null
Start-Sleep -Milliseconds 400
[WinCap]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 900

# Deterministic view: Escape always returns the app to the main screen
# (App.tsx: keydown Escape -> setView("main")). Without this, whatever the
# pointer happened to click before the capture decides which screen we get.
try {
    $ws = New-Object -ComObject WScript.Shell
    $ws.SendKeys("{ESC}")
    Start-Sleep -Milliseconds 600
} catch {
    Write-Output "WARN SendKeys failed: $_"
}
[WinCap]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 500

$r = New-Object WinCap+RECT
[WinCap]::GetWindowRect($h, [ref]$r) | Out-Null
$w = [int]($r.Right - $r.Left)
$ht = [int]($r.Bottom - $r.Top)
Write-Output "WINDOW $w x $ht  (L=$($r.Left) T=$($r.Top))"

$bmp = New-Object System.Drawing.Bitmap -ArgumentList $w, $ht
if ($null -eq $bmp) {
    Write-Output "FAIL bitmap is null"
    Stop-Process -Id $proc.Id -Force
    exit 1
}

$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
$ok = [WinCap]::PrintWindow($h, $hdc, 2)
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

Stop-Process -Id $proc.Id -Force
Write-Output "CLOSED"
