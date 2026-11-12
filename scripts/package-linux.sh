#!/usr/bin/env bash
# Packages DiscoveryOS for Linux as DiscoveryOS-<version>-build<N>-linux.tar.gz (the app folder inside).
#
# Run on a Linux host: the GTK runner is built for the host it packages on. Metadata comes from nsh.json.
# `nsh package` builds its own runner, which cannot load updates. This script builds `runner-linux/` (the app's
# runner, see runner-linux/main.rs) and puts it in the app folder `nsh package` made, then repacks the tarball.
# Output: .nsh/out/release (or $RELEASE_DIR).
set -euo pipefail

cd "$(dirname "$0")/.."

version=$(python3 -I -c 'import json; print(json.load(open("nsh.json"))["version"])')
build=$(python3 -I -c 'import json; print(json.load(open("nsh.json"))["build"])')

nsh package --target linux --icon icon.png --app-version "$version" --build "$build" -o .nsh/out

app=".nsh/out/DiscoveryOS"
test -f "$app/DiscoveryOS" || { echo "error: $app/DiscoveryOS not found" >&2; exit 1; }
cargo build --release --manifest-path runner-linux/Cargo.toml
cp runner-linux/target/release/DiscoveryOS "$app/DiscoveryOS"
chmod +x "$app/DiscoveryOS"
tar -C .nsh/out -czf .nsh/out/DiscoveryOS.tar.gz DiscoveryOS
echo "packaged $app with the hot-update runner"

out_dir="${RELEASE_DIR:-.nsh/out/release}"
mkdir -p "$out_dir"
asset="$out_dir/DiscoveryOS-$version-build$build-linux.tar.gz"
cp .nsh/out/DiscoveryOS.tar.gz "$asset"
echo "wrote $asset"
