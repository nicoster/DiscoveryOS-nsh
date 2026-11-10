#!/usr/bin/env bash
# Packages DiscoveryOS for macOS with hot-update support.
#
# `nsh package` builds its own runner, which cannot load updates. This script builds `runner/` (the app's
# runner, see runner/main.rs) and puts it in the app bundle `nsh package` made, then signs the bundle.
set -euo pipefail

cd "$(dirname "$0")/.."

nsh package --target macos --icon icon.png

app=".nsh/out/DiscoveryOS.app"
exe_name=$(/usr/libexec/PlistBuddy -c "Print :CFBundleExecutable" "$app/Contents/Info.plist")

cargo build --release --manifest-path runner/Cargo.toml
cp runner/target/release/DiscoveryOS "$app/Contents/MacOS/$exe_name"
# Sign with a stable identity when one is given (see README): macOS keeps Keychain approvals
# for the signing certificate, so they survive rebuilds. Ad-hoc signing ("-") changes the
# app's identity on every build, and macOS asks for the Keychain again each time.
identity="${SIGN_IDENTITY:--}"
if [ "$identity" = "-" ]; then
  echo "warning: signing ad-hoc; set SIGN_IDENTITY to a stable certificate to stop Keychain prompts" >&2
fi
codesign --force --sign "$identity" "$app"
echo "packaged $app with the hot-update runner (signed: $identity)"
