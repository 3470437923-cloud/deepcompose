# Build DeepCompose end to end and refresh the delivery artifacts.
#
# Purpose : one-shot release pipeline:
#             1) tsc --noEmit (type gate, B-2)
#             2) vite build            -> dist/
#             3) cargo build --release -> src-tauri\target\release\deepcompose.exe
#             4) copy                  -> release\DeepCompose.exe
#             5) refresh the desktop shortcut (DeepCompose.lnk)
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
# N-16: only stop processes running THIS repo's build output -- killing by name
# would also close instances the user has open from another checkout / install.
$running = @()
if (Test-Path $exe) {
    $targetPath = (Get-Item $exe).FullName
    $running = @(Get-Process -Name deepcompose -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -and $_.Path -eq $targetPath })
}
if ($running.Count -gt 0) {
    Write-Output ("[0/5] stopping {0} running deepcompose process(es) from this build" -f $running.Count)
    $running | Stop-Process -Force
    Start-Sleep -Seconds 2
}

if (-not $SkipBuild) {
    # B-2: the packaging path must pass the type gate first -- calling vite
    # directly skips tsc, so type errors only surface on a manual npm run build.
    Write-Output "[1/5] tsc --noEmit (type gate)"
    Push-Location $root
    & (Join-Path $root "node_modules\.bin\tsc.cmd") --noEmit
    if ($LASTEXITCODE -ne 0) { Pop-Location; throw "tsc --noEmit failed" }

    Write-Output "[2/5] vite build"
    & (Join-Path $root "node_modules\.bin\vite.cmd") build
    if ($LASTEXITCODE -ne 0) { Pop-Location; throw "vite build failed" }

    Write-Output "[3/5] cargo build --release"
    Push-Location (Join-Path $root "src-tauri")
    $env:CARGO_BUILD_JOBS = "4"
    cargo build --release
    if ($LASTEXITCODE -ne 0) { Pop-Location; Pop-Location; throw "cargo build failed" }
    Pop-Location
    Pop-Location
}

if (-not (Test-Path $exe)) { throw "missing $exe" }

Write-Output "[4/5] copy -> $dst"
New-Item -ItemType Directory -Force -Path $rel | Out-Null
Copy-Item $exe $dst -Force

# Remove the pre-rename shortcuts so the desktop does not keep several icons.
foreach ($old in $oldLnks) {
    if (Test-Path $old) {
        Remove-Item $old -Force
        Write-Output "       removed stale shortcut $old"
    }
}

Write-Output "[5/5] shortcut -> $lnk"
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