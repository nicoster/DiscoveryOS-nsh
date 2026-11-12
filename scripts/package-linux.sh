#!/usr/bin/env bash
# Packages DiscoveryOS for Linux as DiscoveryOS-<version>-build<N>-linux.tar.gz (the app folder inside).
#
# Run on a Linux host: the GTK runner is built for the host it packages on. Metadata comes from nsh.json.
# Output: .nsh/out/release (or $RELEASE_DIR).
set -euo pipefail

cd "$(dirname "$0")/.."

version=$(python3 -I -c 'import json; print(json.load(open("nsh.json"))["version"])')
build=$(python3 -I -c 'import json; print(json.load(open("nsh.json"))["build"])')

nsh package --target linux --icon icon.png --app-version "$version" --build "$build" -o .nsh/out

out_dir="${RELEASE_DIR:-.nsh/out/release}"
mkdir -p "$out_dir"
asset="$out_dir/DiscoveryOS-$version-build$build-linux.tar.gz"
cp .nsh/out/DiscoveryOS.tar.gz "$asset"
echo "wrote $asset"
