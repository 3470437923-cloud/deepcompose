# Build KeepCompose end to end and refresh the delivery artifacts.
#
# Purpose : one-shot release pipeline:
#             1) vite build            -> dist/
#             2) cargo build --release -> src-tauri\target\release\keepcompose.exe
#             3) copy                  -> release\KeepCompose.exe
#             4) refresh the desktop shortcut (KeepCompose.lnk)
# Usage   : .\tools\package.ps1 [-SkipBuild]
#           -SkipBuild re-copies and re-links from the existing build output.
#           The repo root is derived from this script's own location, so the
#           checkout may live anywhere (no hard-coded drive path).
# Pitfalls: - The linker cannot replace a running exe; leftover keepcompose
#             processes from earlier capture runs are killed first.
#           - The pre-rename desktop shortcut writerD.lnk is deleted so the
#             desktop never shows two icons.
#           - Cargo emits keepcompose.exe (bin name from src-tauri\Cargo.toml);
#             the delivery copy is KeepCompose.exe - keep both spellings.
# ASCII-only on purpose: Windows PowerShell 5.1 misreads UTF-8 files without BOM.
param(
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
# Repo root = parent of tools\ (works no matter where the checkout lives).
$root = Split-Path -Parent $PSScriptRoot
$exe  = Join-Path $root "src-tauri\target\release\keepcompose.exe"
$rel  = Join-Path $root "release"
$dst  = Join-Path $rel "KeepCompose.exe"
$desktop = [Environment]::GetFolderPath("Desktop")
$lnk     = Join-Path $desktop "KeepCompose.lnk"
$oldLnk  = Join-Path $desktop "writerD.lnk"

# The linker cannot replace a running exe; kill leftovers from earlier captures.
$running = Get-Process -Name keepcompose -ErrorAction SilentlyContinue
if ($running) {
    Write-Output ("[0/4] stopping {0} running keepcompose process(es)" -f $running.Count)
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

# Remove the pre-rename shortcut so the desktop does not keep two icons.
if (Test-Path $oldLnk) {
    Remove-Item $oldLnk -Force
    Write-Output "       removed stale shortcut $oldLnk"
}

Write-Output "[4/4] shortcut -> $lnk"
$sh = New-Object -ComObject WScript.Shell
$s = $sh.CreateShortcut($lnk)
$s.TargetPath = $dst
$s.WorkingDirectory = $rel
$s.IconLocation = "$dst,0"
$s.Description = "KeepCompose - AI novel writing workbench"
$s.Save()

$chk = $sh.CreateShortcut($lnk)
Write-Output ("LNK  target={0}" -f $chk.TargetPath)
Write-Output ("LNK  icon  ={0}" -f $chk.IconLocation)
Write-Output ("EXE  size  ={0} bytes  mtime={1}" -f (Get-Item $dst).Length, (Get-Item $dst).LastWriteTime)
Write-Output "DONE"
