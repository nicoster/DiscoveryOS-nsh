#!/usr/bin/env bash
# Installs the latest DiscoveryOS (NSH build) for macOS into /Applications.
#
#   curl -fsSL https://raw.githubusercontent.com/nicoster/DiscoveryOS-nsh/main/scripts/install.sh | bash
#
# It downloads the newest full-app release zip from GitHub Releases (the app-v* tags), checks that it
# contains DiscoveryOS.app, and replaces the copy in $INSTALL_DIR (default: /Applications).
# Nothing needs to be built locally, so no Rust or nsh toolchain is required.
set -euo pipefail

REPO="nicoster/DiscoveryOS-nsh"
APP_NAME="DiscoveryOS.app"
INSTALL_DIR="${INSTALL_DIR:-/Applications}"

say() { printf '==> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

[ "$(uname -s)" = "Darwin" ] || die "this installer is for macOS only"
for tool in curl unzip ditto; do
  command -v "$tool" >/dev/null 2>&1 || die "'$tool' is required but not found"
done

tmp=$(mktemp -d "${TMPDIR:-/tmp}/discoveryos-install.XXXXXX")
trap 'rm -rf "$tmp"' EXIT

say "Looking up the latest DiscoveryOS release"
# Full-app releases attach a DiscoveryOS-<version>-build<N>-macos.zip asset. The release list order is not
# reliable for "latest", so pick the highest version by sorting the asset names.
url=$(curl -fsSL "https://api.github.com/repos/$REPO/releases?per_page=50" \
  | grep -o 'https://[^"]*-macos\.zip' | awk -F/ '{ print $NF "\t" $0 }' | sort -V | tail -n 1 | cut -f2 || true)
[ -n "$url" ] || die "no macOS app zip found in the releases of $REPO"
say "Downloading $(basename "$url")"
curl -fsSL -o "$tmp/app.zip" "$url"

say "Unpacking"
mkdir "$tmp/unpacked"
unzip -q "$tmp/app.zip" -d "$tmp/unpacked"
[ -d "$tmp/unpacked/$APP_NAME" ] || die "$APP_NAME not found in the downloaded zip"

say "Installing to $INSTALL_DIR/$APP_NAME"
[ -w "$INSTALL_DIR" ] || die "$INSTALL_DIR is not writable; rerun with INSTALL_DIR=\$HOME/Applications"
# Quit a running copy first so its files are not replaced underneath it.
osascript -e 'tell application id "com.nickr.DiscoveryOS" to quit' >/dev/null 2>&1 || true
rm -rf "$INSTALL_DIR/$APP_NAME"
ditto "$tmp/unpacked/$APP_NAME" "$INSTALL_DIR/$APP_NAME"
# Downloads made by curl carry no quarantine flag, but clear it in case the zip came from a browser.
xattr -dr com.apple.quarantine "$INSTALL_DIR/$APP_NAME" 2>/dev/null || true

version=$(/usr/libexec/PlistBuddy -c "Print :CFBundleShortVersionString" "$INSTALL_DIR/$APP_NAME/Contents/Info.plist" 2>/dev/null || echo "?")
say "Installed DiscoveryOS $version. Open it from $INSTALL_DIR or run: open -a DiscoveryOS"
