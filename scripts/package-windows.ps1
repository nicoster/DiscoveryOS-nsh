# Packages DiscoveryOS for Windows as DiscoveryOS-<version>-build<N>-windows.zip (the app folder inside).
#
# Run on a Windows host: `nsh package` embeds the icon into DiscoveryOS.exe only when it packages on
# Windows; a package made anywhere else keeps the default icon (and is not a Windows executable).
# Metadata comes from nsh.json. Output: .nsh/out/release (or $env:RELEASE_DIR).
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')

$manifest = Get-Content nsh.json -Raw | ConvertFrom-Json
$version = $manifest.version
$build = $manifest.build

nsh package --target windows --icon icon.png --app-version $version --build $build -o .nsh/out
if ($LASTEXITCODE -ne 0) { throw "nsh package failed with exit code $LASTEXITCODE" }

# `nsh package` builds its own runner, which cannot load updates. Build `runner-windows/` (the app's runner, see
# runner-windows/main.rs) and put it in the package in place of its DiscoveryOS.exe, then repack the zip.
cargo build --release --manifest-path runner-windows/Cargo.toml
if ($LASTEXITCODE -ne 0) { throw "cargo build failed with exit code $LASTEXITCODE" }
$work = Join-Path $env:TEMP ("dos-win-" + [guid]::NewGuid())
Expand-Archive -Path '.nsh/out/DiscoveryOS.zip' -DestinationPath $work
$exe = Get-ChildItem -Path $work -Recurse -Filter 'DiscoveryOS.exe' | Select-Object -First 1
if (-not $exe) { throw 'DiscoveryOS.exe not found in the package' }
Copy-Item -Force 'runner-windows\target\release\DiscoveryOS.exe' $exe.FullName
Compress-Archive -Path (Join-Path $work '*') -DestinationPath '.nsh/out/DiscoveryOS.zip' -Force
Remove-Item -Recurse -Force $work
Write-Host 'packaged .nsh/out/DiscoveryOS.zip with the hot-update runner'

$outDir = if ($env:RELEASE_DIR) { $env:RELEASE_DIR } else { '.nsh/out/release' }
New-Item -ItemType Directory -Force -Path $outDir | Out-Null
$zip = Join-Path $outDir "DiscoveryOS-$version-build$build-windows.zip"
Copy-Item -Force '.nsh/out/DiscoveryOS.zip' $zip
Write-Host "wrote $zip"
