# Build writerD end to end and refresh the delivery artifacts.
#   1) vite build  -> dist/
#   2) cargo build --release -> writerd.exe
#   3) copy to release\writerD.exe
#   4) refresh the desktop shortcut
# ASCII-only on purpose: Windows PowerShell 5.1 misreads UTF-8 files without BOM.
param(
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$root = "S:\writerD"
$exe  = Join-Path $root "src-tauri\target\release\writerd.exe"
$rel  = Join-Path $root "release"
$dst  = Join-Path $rel "writerD.exe"
$lnk  = Join-Path ([Environment]::GetFolderPath("Desktop")) "writerD.lnk"

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

Write-Output "[4/4] shortcut -> $lnk"
$sh = New-Object -ComObject WScript.Shell
$s = $sh.CreateShortcut($lnk)
$s.TargetPath = $dst
$s.WorkingDirectory = $rel
$s.IconLocation = "$dst,0"
$s.Description = "writerD - AI novel writing workbench"
$s.Save()

$chk = $sh.CreateShortcut($lnk)
Write-Output ("LNK  target={0}" -f $chk.TargetPath)
Write-Output ("LNK  icon  ={0}" -f $chk.IconLocation)
Write-Output ("EXE  size  ={0} bytes  mtime={1}" -f (Get-Item $dst).Length, (Get-Item $dst).LastWriteTime)
Write-Output "DONE"
