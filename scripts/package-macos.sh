#!/usr/bin/env bash
# Packages DiscoveryOS for macOS with hot-update support.
#
# `nsh package` builds its own runner, which cannot load updates. This script builds `runner/` (the app's
# runner, see runner/main.rs) and puts it in the app bundle `nsh package` made, then signs the bundle.
set -euo pipefail

cd "$(dirname "$0")/.."

nsh package --target macos

app=".nsh/out/DiscoveryOS.app"
exe_name=$(/usr/libexec/PlistBuddy -c "Print :CFBundleExecutable" "$app/Contents/Info.plist")

cargo build --release --manifest-path runner/Cargo.toml
cp runner/target/release/DiscoveryOS "$app/Contents/MacOS/$exe_name"
codesign --force --sign - "$app"
echo "packaged $app with the hot-update runner"
