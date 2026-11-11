#!/usr/bin/env bash
# Builds the signed TSX hot-update package (.nshpkg) and its manifest (latest.json) on this machine,
# the same way .github/workflows/hot-update-package.yml does, and verifies it against trust/root.pub.
# It does not upload anything: publish the two files as the v<version>-b<build> release afterwards.
#
#   scripts/build-hot-update.sh [--bump] [OUT_DIR]     # OUT_DIR default: out/
#
#   --bump  take the next build number: raises "build" in nsh.json by one and sets APP_BUILD, PACKAGE and
#           RELEASE_URL in the workflow to match. Use it for each new release: a build is never reused.
#           Without it, the build in nsh.json is used, and the workflow must already match it.
#
# Environment:
#   NSH_RELEASE_KEY   the release key's secret (default: ~/local/.config/discoveryos-signing/release.secret)
#   NSH_RELEASE_CERT  its certificate (default: ~/local/.config/discoveryos-signing/release.cert)
#
# A Rust change needs a new version and a full app release instead; this script covers TSX and assets only.
set -euo pipefail

cd "$(dirname "$0")/.."

bump=0
out_dir="out"
for arg in "$@"; do
  case "$arg" in
    --bump) bump=1 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    -*) echo "error: unknown option $arg" >&2; exit 2 ;;
    *) out_dir="$arg" ;;
  esac
done

key="${NSH_RELEASE_KEY:-$HOME/local/.config/discoveryos-signing/release.secret}"
cert="${NSH_RELEASE_CERT:-$HOME/local/.config/discoveryos-signing/release.cert}"
root="trust/root.pub"
manifest="nsh.json"
workflow=".github/workflows/hot-update-package.yml"
repo_url="https://github.com/nicoster/DiscoveryOS-nsh"

command -v nsh >/dev/null || { echo "error: the nsh CLI is not on PATH" >&2; exit 1; }
for f in "$key" "$cert" "$root" "$manifest" "$workflow"; do
  [ -f "$f" ] || { echo "error: missing $f" >&2; exit 1; }
done

if [ "$bump" = 1 ]; then
  python3 -I - "$manifest" "$workflow" <<'PY'
import json, re, sys
manifest, workflow = sys.argv[1], sys.argv[2]

with open(manifest) as f:
    m = json.load(f)
build = int(m["build"]) + 1
m["build"] = build
with open(manifest, "w") as f:
    json.dump(m, f, indent=2, ensure_ascii=False)
    f.write("\n")

version = m["version"]
text = open(workflow).read()
text, n1 = re.subn(r'(APP_BUILD: ")\d+(")', rf'\g<1>{build}\g<2>', text)
text, n2 = re.subn(r'(PACKAGE: "DiscoveryOS-[\d.]+-build)\d+(\.nshpkg")', rf'\g<1>{build}\g<2>', text)
text, n3 = re.subn(r'(releases/download/v[\d.]+-b)\d+(")', rf'\g<1>{build}\g<2>', text)
if (n1, n2, n3) != (1, 1, 1):
    sys.exit(f"error: expected one each of APP_BUILD, PACKAGE and RELEASE_URL in {workflow}, found {n1}, {n2}, {n3}")
open(workflow, "w").write(text)
print(f"bumped to build {build} in {manifest} and {workflow}")
PY
fi

# id, version and build from nsh.json.
read -r app_id app_version app_build < <(python3 -I -c '
import json
m = json.load(open("nsh.json"))
print(m["id"], m["version"], m["build"])
')

wf_build=$(sed -n 's/^ *APP_BUILD: "\(.*\)"/\1/p' "$workflow")
if [ "$wf_build" != "$app_build" ]; then
  echo "error: nsh.json build is $app_build but $workflow has APP_BUILD $wf_build; run with --bump or fix by hand" >&2
  exit 1
fi

package="DiscoveryOS-${app_version}-build${app_build}.nshpkg"
mkdir -p "$out_dir"
package_path="$out_dir/$package"

echo "publishing $app_id $app_version (build $app_build) -> $package_path"
nsh publish \
  --key "$key" \
  --cert "$cert" \
  --build "$app_build" \
  --app-version "$app_version" \
  -o "$package_path"

nsh verify --root "$root" "$package_path"

sha=$(shasum -a 256 "$package_path" | cut -d' ' -f1)
url="$repo_url/releases/download/v${app_version}-b${app_build}/$package"
python3 -I -c '
import json, sys
print(json.dumps({"id": sys.argv[1], "build": int(sys.argv[2]), "version": sys.argv[3],
                  "url": sys.argv[4], "sha256": sys.argv[5]}))
' "$app_id" "$app_build" "$app_version" "$url" "$sha" > "$out_dir/latest.json"

echo
echo "built and verified:"
echo "  $package_path"
echo "  $out_dir/latest.json"
echo "  sha256 $sha"
echo
echo "to publish (after review), from this repo:"
cat <<EOF
gh release create v${app_version}-b${app_build} "$package_path" "$out_dir/latest.json" \\
  --target $(git branch --show-current) --latest \\
  --title "DiscoveryOS ${app_version} (build ${app_build}) - hot update"
EOF
