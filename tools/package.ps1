# Build DeepCompose end to end and refresh the delivery artifacts.
#
# Purpose : one-shot release pipeline:
#             1) vite build            -> dist/
#             2) cargo build --release -> src-tauri\target\release\deepcompose.exe
#             3) copy                  -> release\DeepCompose.exe
#             4) refresh the desktop shortcut (DeepCompose.lnk)
# Usage   : .\tools\package.ps1 [-SkipBuild]
#           -SkipBuild re-copies and re-links from the existing build output.
#           The repo root is derived from this script's own location, so the
#           checkout may live anywhere (no hard-coded drive path).
# Pitfalls: - The linker cannot replace a running exe; leftover deepcompose
#             processes from earlier capture runs are killed first.
#           - Both pre-rename desktop shortcuts (writerD.lnk, KeepCompose.lnk)
#             are deleted so the desktop never shows several icons.
#           - Cargo emits deepcompose.exe (bin name from src-tauri\Cargo.toml);
#             the delivery copy is DeepCompose.exe - keep both spellings.
# ASCII-only on purpose: Windows PowerShell 5.1 misreads UTF-8 files without BOM.
param(
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
# Repo root = parent of tools\ (works no matter where the checkout lives).
$root = Split-Path -Parent $PSScriptRoot
$exe  = Join-Path $root "src-tauri\target\release\deepcompose.exe"
$rel  = Join-Path $root "release"
$dst  = Join-Path $rel "DeepCompose.exe"
$desktop = [Environment]::GetFolderPath("Desktop")
$lnk     = Join-Path $desktop "DeepCompose.lnk"
$oldLnks = @(
    (Join-Path $desktop "writerD.lnk"),
    (Join-Path $desktop "KeepCompose.lnk")
)

# The linker cannot replace a running exe; kill leftovers from earlier captures.
$running = Get-Process -Name deepcompose -ErrorAction SilentlyContinue
if ($running) {
    Write-Output ("[0/4] stopping {0} running deepcompose process(es)" -f $running.Count)
    $running | Stop-Process -Force
    Start-Sleep -Seconds 2
}

if (-not $SkipBuild) {
    Write-Output "[1/4] vite build"
    Push-Location $root
    & (Join-Path $root "node_modules\.bin\vite.cmd") build
    if ($LASTEXITCODE -ne 0) { throw "vite build failed" }

    Write-Output "[2/4] cargo build --release"
    Push-Location (Join-Path $root "src-tauri")
    $env:CARGO_BUILD_JOBS = "4"
    cargo build --release
    if ($LASTEXITCODE -ne 0) { throw "cargo build failed" }
    Pop-Location
    Pop-Location
}

if (-not (Test-Path $exe)) { throw "missing $exe" }

Write-Output "[3/4] copy -> $dst"
New-Item -ItemType Directory -Force -Path $rel | Out-Null
Copy-Item $exe $dst -Force

# Remove the pre-rename shortcuts so the desktop does not keep several icons.
foreach ($old in $oldLnks) {
    if (Test-Path $old) {
        Remove-Item $old -Force
        Write-Output "       removed stale shortcut $old"
    }
}

Write-Output "[4/4] shortcut -> $lnk"
$sh = New-Object -ComObject WScript.Shell
$s = $sh.CreateShortcut($lnk)
$s.TargetPath = $dst
$s.WorkingDirectory = $rel
$s.IconLocation = "$dst,0"
$s.Description = "DeepCompose - AI novel writing workbench"
$s.Save()

$chk = $sh.CreateShortcut($lnk)
Write-Output ("LNK  target={0}" -f $chk.TargetPath)
Write-Output ("LNK  icon  ={0}" -f $chk.IconLocation)
Write-Output ("EXE  size  ={0} bytes  mtime={1}" -f (Get-Item $dst).Length, (Get-Item $dst).LastWriteTime)
Write-Output "DONE"