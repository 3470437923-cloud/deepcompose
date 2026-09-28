# End-to-end chat check: drive the real exe with a mock provider.
#   1) point prefs at the local mock provider
#   2) launch writerd.exe, click the composer, type a prompt, press Enter
#   3) wait, capture the window, then report what is on screen
# ASCII-only source (Windows PowerShell 5.1 misreads UTF-8 without BOM).
param(
    [string]$Exe = "S:\writerD\src-tauri\target\release\writerd.exe",
    [string]$Out = "S:\writerD\shots\shot-chat.png",
    [string]$Prompt = "List chapters",
    [int]$WaitSec = 8,
    [int]$AfterSendSec = 25
)

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$sig = @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public class E2E {
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
        mouse_event(0x0002, 0, 0, 0, IntPtr.Zero); // left down
        System.Threading.Thread.Sleep(60);
        mouse_event(0x0004, 0, 0, 0, IntPtr.Zero); // left up
    }
}
'@
if (-not ("E2E" -as [type])) { Add-Type -TypeDefinition $sig }

# 1) point prefs at the mock provider
$prefsDir = Join-Path $env:APPDATA "com.writerd\writerD"
New-Item -ItemType Directory -Force -Path $prefsDir | Out-Null
$prefsFile = Join-Path $prefsDir "shared_preferences.json"
$prefs = @{
    "flutter.llm_base_url"          = "http://127.0.0.1:8899"
    "flutter.api_key"               = "mock-key"
    "flutter.model"                 = "mock-model"
    "flutter.temperature"           = 0.8
    "flutter.use_anthropic_format"  = $false
    "flutter.context_limit"         = 1000000
    "flutter.reserved_output_tokens"= 16000
    "flutter.auto_clear_context"    = $true
    "flutter.is_dark_mode"          = $true
    "flutter.custom_accent_color"   = 4286343935
    "flutter.novel_projects"        = ""
    "flutter.current_novel_project" = ""
}
($prefs | ConvertTo-Json -Compress) | Set-Content -LiteralPath $prefsFile -Encoding UTF8
# PowerShell 5.1 的 Set-Content -Encoding UTF8 会写 BOM；应用侧已容错，
# 但测试工具本身也要写干净的文件，避免把 BOM 问题与产品问题混在一起。
$bytes = [System.IO.File]::ReadAllBytes($prefsFile)
if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    [System.IO.File]::WriteAllBytes($prefsFile, $bytes[3..($bytes.Length - 1)])
    Write-Output "PREFS BOM stripped"
}
Write-Output "PREFS -> $prefsFile"

# 2) launch
Get-Process -Name writerd -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500
$proc = Start-Process $Exe -PassThru
Start-Sleep -Seconds $WaitSec
$proc.Refresh()
if ($proc.HasExited) { Write-Output "FAIL exited: $($proc.ExitCode)"; exit 1 }

$h = [E2E]::Pick([uint32]$proc.Id)
if ($h -eq [IntPtr]::Zero) { Write-Output "FAIL no window"; Stop-Process -Id $proc.Id -Force; exit 1 }
if ([E2E]::IsIconic($h)) { [E2E]::ShowWindow($h, 9) | Out-Null; Start-Sleep -Milliseconds 700 }
[E2E]::ShowWindow($h, 5) | Out-Null
[E2E]::SetForegroundWindow($h) | Out-Null
Start-Sleep -Milliseconds 900

$r = New-Object E2E+RECT
[E2E]::GetWindowRect($h, [ref]$r) | Out-Null
$w = $r.Right - $r.Left; $ht = $r.Bottom - $r.Top
Write-Output "WINDOW $w x $ht at ($($r.Left),$($r.Top))"

# 3) click the composer textarea, type, Enter
# composer box sits above the statusbar (~44px) and is ~147px tall;
# aim for its vertical centre so the click lands inside the textarea.
$cx = $r.Left + [int]($w * 0.85)
$cy = $r.Top + $ht - 120
Write-Output "CLICK ($cx,$cy)"
[E2E]::Click($cx, $cy)
Start-Sleep -Milliseconds 600
$ws = New-Object -ComObject WScript.Shell
# Type via clipboard paste: raw SendKeys keystrokes get swallowed by the
# Chinese IME (they land as an uncommitted composition string, so React state
# stays empty and send is a no-op). Paste bypasses the IME entirely.
$Prompt.Trim() | clip.exe
Start-Sleep -Milliseconds 300
$ws.SendKeys("^v")
Start-Sleep -Milliseconds 500
# Enter via SendKeys is unreliable in WebView2; click the round send button
# (bottom-right of the composer) instead.
[E2E]::Click($r.Left + $w - 63, $r.Top + $ht - 94)
Write-Output "SENT"
Start-Sleep -Seconds $AfterSendSec

# 4) capture
$bmp = New-Object System.Drawing.Bitmap -ArgumentList $w, $ht
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
[E2E]::PrintWindow($h, $hdc, 2) | Out-Null
$g.ReleaseHdc($hdc)
$g.Dispose()
$dir = Split-Path -Parent $Out
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()
Write-Output "SAVED $Out"

Get-Process -Name writerd -ErrorAction SilentlyContinue | Stop-Process -Force
Write-Output "CLOSED"
