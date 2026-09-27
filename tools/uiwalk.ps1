# UI walkthrough driver: launch writerd.exe, run a click/keys/capture step list.
# Each step: action=click|x,y  | keys|text  | cap|out.png  | wait|ms
# ASCII-only source (Windows PowerShell 5.1 misreads UTF-8 without BOM).
param(
    [string]$Exe = "S:\writerD\src-tauri\target\release\writerd.exe",
    [string]$Steps = ""
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$sig = @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class UW {
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);
    public delegate bool EnumProc(IntPtr h, IntPtr p);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
    [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int cmd);
    [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint dx, uint dy, uint d, IntPtr e);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }

    public static IntPtr Pick(uint pid) {
        IntPtr best = IntPtr.Zero; int area = 0;
        EnumWindows((h, p) => {
            uint wpid; GetWindowThreadProcessId(h, out wpid);
            if (wpid != pid || !IsWindowVisible(h)) return true;
            RECT r; GetWindowRect(h, out r);
            int a = (r.Right - r.Left) * (r.Bottom - r.Top);
            if (a > area) { area = a; best = h; }
            return true;
        }, IntPtr.Zero);
        return best;
    }
    public static void Click(int x, int y) {
        SetCursorPos(x, y);
        System.Threading.Thread.Sleep(150);
        mouse_event(0x0002, 0, 0, 0, IntPtr.Zero);
        System.Threading.Thread.Sleep(60);
        mouse_event(0x0004, 0, 0, 0, IntPtr.Zero);
    }
}
'@
if (-not ("UW" -as [type])) { Add-Type -TypeDefinition $sig }

Get-Process -Name writerd -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500
$proc = Start-Process $Exe -PassThru
Start-Sleep -Seconds 9
$proc.Refresh()
if ($proc.HasExited) { Write-Output "FAIL exited: $($proc.ExitCode)"; exit 1 }

$h = [UW]::Pick([uint32]$proc.Id)
if ($h -eq [IntPtr]::Zero) { Write-Output "FAIL no window"; exit 1 }
if ([UW]::IsIconic($h)) { [UW]::ShowWindow($h, 9) | Out-Null; Start-Sleep -Milliseconds 700 }
[UW]::ShowWindow($h, 5) | Out-Null
[UW]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 900

$r = New-Object UW+RECT
[UW]::GetWindowRect($h, [ref]$r) | Out-Null
Write-Output "WINDOW $($r.Right - $r.Left) x $($r.Bottom - $r.Top) at ($($r.Left),$($r.Top))"
$ox = $r.Left; $oy = $r.Top

$ws = New-Object -ComObject WScript.Shell

function Save-Shot([string]$out) {
    $w = $r.Right - $r.Left; $ht = $r.Bottom - $r.Top
    [UW]::SetForegroundWindow($h) | Out-Null
    Start-Sleep -Milliseconds 700
    $bmp = New-Object System.Drawing.Bitmap -ArgumentList $w, $ht
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $hdc = $g.GetHdc()
    [UW]::PrintWindow($h, $hdc, 2) | Out-Null
    $g.ReleaseHdc($hdc)
    $g.Dispose()
    $dir = Split-Path -Parent $out
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Output "CAP $out"
}

# steps: semicolon-separated. Each: action|arg1|arg2
$items = $Steps -split ";"
foreach ($it in $items) {
    $t = $it.Trim()
    if ($t -eq "") { continue }
    $p = $t -split "\|"
    switch ($p[0].Trim()) {
        "click" {
            $xy = $p[1] -split ","
            $x = [int]$xy[0] + $ox
            $y = [int]$xy[1] + $oy
            [UW]::Click($x, $y)
            Write-Output "CLICK $x,$y"
            Start-Sleep -Milliseconds 900
        }
        "keys" {
            $ws.SendKeys($p[1]) | Out-Null
            Write-Output "KEYS $($p[1])"
            Start-Sleep -Milliseconds 500
        }
        "cap" {
            Save-Shot $p[1]
        }
        "wait" {
            Start-Sleep -Milliseconds ([int]$p[1])
        }
    }
}

Get-Process -Name writerd -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Output "DONE"
