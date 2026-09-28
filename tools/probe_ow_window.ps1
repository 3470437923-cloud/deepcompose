# Probe whether the original OpenWrite remembers its window geometry.
#
# Method (evidence, not assumption):
#   1. back up the real config, note its key set
#   2. launch OpenWrite, record the main window rect            -> R1 (fresh default)
#   3. MoveWindow to a deliberately different size/position     -> R2
#   4. close it gracefully (WM_CLOSE) so it can persist state
#   5. relaunch, record the rect again                          -> R3
#   6. R3 ~ R2 => geometry is remembered;  R3 ~ R1 => fixed default each launch
#   7. diff the config key set to reveal any new window_* keys it wrote
#
# ASCII-only on purpose: Windows PowerShell 5.1 misreads UTF-8 files without BOM.
param(
    [string]$Exe = "S:\dsh\work\openwrite-201\exe\installed\OpenWrite.exe",
    [string]$Prefs = "$env:APPDATA\com.openwrite\OpenWrite\shared_preferences.json",
    [int]$TargetW = 1200,
    [int]$TargetH = 760,
    [int]$TargetX = 120,
    [int]$TargetY = 80,
    [int]$WaitSec = 9
)

$ErrorActionPreference = "Stop"

$sig = @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class WinProbe {
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);
    public delegate bool EnumProc(IntPtr h, IntPtr p);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h, int x, int y, int w, int ht, bool repaint);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern IntPtr SendMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
    [DllImport("user32.dll")] public static extern int GetSystemMetrics(int i);
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
    public static string Title(IntPtr h) {
        var t = new StringBuilder(512); GetWindowText(h, t, 512); return t.ToString();
    }
}
'@
if (-not ("WinProbe" -as [type])) { Add-Type -TypeDefinition $sig }

function Rect-Of([IntPtr]$h) {
    $r = New-Object WinProbe+RECT
    [WinProbe]::GetWindowRect($h, [ref]$r) | Out-Null
    return @{ x = $r.Left; y = $r.Top; w = $r.Right - $r.Left; h = $r.Bottom - $r.Top }
}

function Fmt($r) { return ("{0}x{1} at ({2},{3})" -f $r.w, $r.h, $r.x, $r.y) }

function Launch-And-Measure([string]$tag) {
    $proc = Start-Process $Exe -PassThru
    Start-Sleep -Seconds $WaitSec
    $proc.Refresh()
    if ($proc.HasExited) { Write-Output "  [$tag] process exited early: $($proc.ExitCode)"; return $null }
    $h = [WinProbe]::Pick([uint32]$proc.Id)
    if ($h -eq [IntPtr]::Zero) {
        Write-Output "  [$tag] no visible window"
        Stop-Process -Id $proc.Id -Force
        return $null
    }
    if ([WinProbe]::IsIconic($h)) { [WinProbe]::ShowWindow($h, 9) | Out-Null; Start-Sleep -Milliseconds 900 }
    Start-Sleep -Milliseconds 700
    $r = Rect-Of $h
    Write-Output ("  [{0}] title='{1}' zoomed={2} {3}" -f $tag, [WinProbe]::Title($h), [WinProbe]::IsZoomed($h), (Fmt $r))
    return @{ proc = $proc; hwnd = $h; rect = $r }
}

function Close-Gracefully($session) {
    # WM_CLOSE = 0x0010, so the app runs its own shutdown/persist path.
    [WinProbe]::SendMessage($session.hwnd, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Milliseconds 500
        $session.proc.Refresh()
        if ($session.proc.HasExited) { Write-Output "  closed after $($i * 0.5 + 0.5)s"; return $true }
    }
    Write-Output "  WARN did not exit within 15s; killing"
    Stop-Process -Id $session.proc.Id -Force
    return $false
}

Write-Output "screen  = $([WinProbe]::GetSystemMetrics(0))x$([WinProbe]::GetSystemMetrics(1)) (primary, physical pixels)"

# --- 1) back up the config and record its key set -------------------------
# NOTE: never parse this file with PowerShell here. PS 5.1 mis-decodes UTF-8 as
# ANSI, ConvertFrom-Json then throws AND echoes the whole file (including
# flutter.api_key) to stderr. Ask python for the key NAMES only.
$backup = "$env:TEMP\openwrite_prefs_before_probe.json"
Copy-Item $Prefs $backup -Force

function Get-KeyNames([string]$path) {
    $py = @'
import json, sys
d = json.load(open(sys.argv[1], encoding="utf-8"))
print("\n".join(sorted(d.keys())))
'@
    $py | python - $path
}
$beforeKeys = @(Get-KeyNames $backup)
Write-Output "config  = $($beforeKeys.Count) keys, backed up to $backup"

# make sure nothing is already running
Get-Process -Name OpenWrite -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.Id -Force; }
Start-Sleep -Seconds 1

Write-Output ""
Write-Output "--- 1) fresh launch (default geometry) ---"
$s1 = Launch-And-Measure "R1"
if ($null -eq $s1) { exit 1 }
Close-Gracefully $s1 | Out-Null
Start-Sleep -Seconds 2

Write-Output ""
Write-Output "--- 2) launch, resize to ${TargetW}x${TargetH} at ($TargetX,$TargetY), close ---"
$s2 = Launch-And-Measure "R2a"
if ($null -eq $s2) { exit 1 }
[WinProbe]::ShowWindow($s2.hwnd, 9) | Out-Null      # restore if maximized
Start-Sleep -Milliseconds 800
[WinProbe]::MoveWindow($s2.hwnd, $TargetX, $TargetY, $TargetW, $TargetH, $true) | Out-Null
Start-Sleep -Seconds 2
$moved = Rect-Of $s2.hwnd
Write-Output ("  [R2b] after MoveWindow -> {0}" -f (Fmt $moved))
Close-Gracefully $s2 | Out-Null
Start-Sleep -Seconds 2

Write-Output ""
Write-Output "--- 3) relaunch (does it come back at the resized geometry?) ---"
$s3 = Launch-And-Measure "R3"
if ($null -eq $s3) { exit 1 }
$r3 = $s3.rect

# --- verdict -------------------------------------------------------------
$dResized = [math]::Abs($r3.w - $moved.w) + [math]::Abs($r3.h - $moved.h)
$dDefault = [math]::Abs($r3.w - $s1.rect.w) + [math]::Abs($r3.h - $s1.rect.h)
Write-Output ""
Write-Output "R1 default : $(Fmt $s1.rect)"
Write-Output "R2 resized : $(Fmt $moved)"
Write-Output "R3 relaunch: $(Fmt $r3)"
Write-Output "delta vs resized = $dResized px, delta vs default = $dDefault px"
if ($dResized -le 40) {
    Write-Output "VERDICT: REMEMBERS geometry (relaunch matches the resized rect)"
} elseif ($dDefault -le 40) {
    Write-Output "VERDICT: FIXED default each launch (relaunch matches the fresh default)"
} else {
    Write-Output "VERDICT: INCONCLUSIVE (matches neither)"
}

# --- 4) did it write any new config keys? --------------------------------
$afterKeys = @(Get-KeyNames $Prefs)
$new = $afterKeys | Where-Object { $beforeKeys -notcontains $_ }
$gone = $beforeKeys | Where-Object { $afterKeys -notcontains $_ }
Write-Output ""
Write-Output "config keys after = $($afterKeys.Count)"
if ($new) { Write-Output "NEW KEYS:"; $new | ForEach-Object { Write-Output "  + $_" } } else { Write-Output "NEW KEYS: (none)" }
if ($gone) { Write-Output "REMOVED KEYS:"; $gone | ForEach-Object { Write-Output "  - $_" } }

Stop-Process -Id $s3.proc.Id -Force
Write-Output ""
Write-Output "DONE"