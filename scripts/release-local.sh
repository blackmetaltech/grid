#!/usr/bin/env bash
# GRID local release (owner directive 2026-11-22: a PRIVATE GitHub release per layer, built on this machine).
# usage: scripts/release-local.sh <vX.Y.Z> [<source-dir>] [--no-upload]
#   source-dir: a checkout of that tag (default: this repo; it must be clean at the tag). Never makes the repo public.
# Steps: build the sidecar -> export Linux and Windows (Godot 4.7.2 templates) -> bundle the pinned Node runtime + sidecar
# (core/ci/package.sh) -> zip -> smoke-run the Linux build headless (CB_SMOKE=1, must print SMOKE OK, no SCRIPT ERROR)
# -> SHA256SUMS.txt -> gh release create (notes = that version's CHANGELOG section) on blackmetaltech/grid (public: upload happens only after the headless smoke passes).
set -euo pipefail
ver=$1; src=${2:-$(cd "$(dirname "$0")/.." && pwd)}; upload=1
[ "${3:-}" = "--no-upload" ] && upload=0
src=$(cd "$src" && pwd); core=$src/core
NODE_VERSION=22.23.4
cache=$HOME/.cache/cobanana/node; mkdir -p "$cache"
out=${CB_RELEASE_OUT:-${TMPDIR:-/tmp}/grid-release/$ver}; rm -rf "$out"; mkdir -p "$out/dist"
log() { echo "[release $ver] $*"; }

# pinned Node runtimes (nodejs.org official builds), cached
for n in linux-x64:tar.xz win-x64:zip; do
  plat=${n%%:*}; ext=${n##*:}; f=node-v$NODE_VERSION-$plat
  if [ ! -d "$cache/$f" ]; then
    log "fetching $f"; curl -fsSL -o "$cache/$f.$ext" "https://nodejs.org/dist/v$NODE_VERSION/$f.$ext"
    if [ "$ext" = zip ]; then (cd "$cache" && unzip -q "$f.zip"); else tar xf "$cache/$f.$ext" -C "$cache"; fi
  fi
done

cd "$src"
grep -q "\"version\": \"${ver#v}\"" package.json || { echo "package.json is not ${ver#v}" >&2; exit 1; }
# a released build must be scorable: its version must be in src/scores.ts gameVersions, and that rules bundle must be vendored
# in a sibling cobanana-scores checkout (when there is one) with the same bytes
grep -E "gameVersions: \[[^]]*'${ver#v}'" src/scores.ts >/dev/null || { echo "src/scores.ts gameVersions does not accept ${ver#v}: bump rulesVersion/gameVersions" >&2; exit 1; }
rv=$(grep -oE "rulesVersion: '[0-9.]+'" src/scores.ts | grep -oE "[0-9]+\.[0-9]+\.[0-9]+")
vend=$src/../cobanana-scores/src/verifiers/vendor/grid/$rv.mjs
if [ -d "$src/../cobanana-scores" ] && ! grep -qE "[\"']${ver#v}[\"']" "$vend" 2>/dev/null; then
  echo "rules $rv accepting ${ver#v} is not vendored in ../cobanana-scores (pnpm vendor:verifier ../grid/src/scores.ts)" >&2; exit 1
fi
log "sidecar"; ./node_modules/.bin/vite build -c vite.bridge.config.ts >/dev/null
log "import"; timeout 900 godot --headless --path godot --import >/dev/null 2>&1 || true
mkdir -p godot/build/linux godot/build/windows
for p in Linux Windows; do
  log "export $p"
  if ! timeout 900 godot --headless --path godot --export-release "$p" > "$out/export-$p.log" 2>&1; then
    if [ "$p" = Linux ]; then echo "Linux export failed (see $out/export-$p.log)" >&2; exit 1; fi
    log "Windows export failed: no Windows zip this time"; continue
  fi
done
CB_PROJECT=$src "$core/ci/package.sh" linux godot/build/linux "$cache/node-v$NODE_VERSION-linux-x64" "$out/pkg" "$ver" GRID grid >/dev/null
[ -f godot/build/windows/GRID.exe ] && CB_PROJECT=$src "$core/ci/package.sh" windows godot/build/windows "$cache/node-v$NODE_VERSION-win-x64" "$out/pkg" "$ver" GRID grid >/dev/null
# Linux as a zip (the owner asked for zips); keep the executable bits
(cd "$out" && mkdir -p lx && tar xzf "pkg/GRID-$ver-linux.tar.gz" -C lx && cd lx && zip -qry "$out/dist/GRID-$ver-linux-x86_64.zip" GRID)
[ -f "$out/pkg/GRID-$ver-windows.zip" ] && cp "$out/pkg/GRID-$ver-windows.zip" "$out/dist/GRID-$ver-windows-x64.zip"

log "smoke-run the Linux export headless"
smoke=$(mktemp -d); (cd "$smoke" && unzip -q "$out/dist/GRID-$ver-linux-x86_64.zip")
HOME=$smoke/home CB_SMOKE=1 timeout 300 "$smoke/GRID/GRID.x86_64" --headless > "$out/smoke.log" 2>&1 || true
grep -q "SMOKE OK" "$out/smoke.log" || { echo "smoke failed: no SMOKE OK (see $out/smoke.log)" >&2; exit 1; }
! grep -qE "SCRIPT ERROR|Parse Error" "$out/smoke.log" || { echo "smoke failed: script errors (see $out/smoke.log)" >&2; exit 1; }
rm -rf "$smoke"; log "smoke OK"

(cd "$out/dist" && sha256sum *.zip > SHA256SUMS.txt)
v=${ver#v}
awk -v v="$v" '/^## \[/{p=index($0,"["v"]")>0; next} p' CHANGELOG.md > "$out/notes.md"
[ -s "$out/notes.md" ] || { echo "no CHANGELOG entry for $v" >&2; exit 1; }
printf '\n---\nBuilt locally from tag %s. Extract and run; Node.js is bundled.\n- **Linux (x86_64)**: unzip, run `GRID/grid.sh` (needs a Vulkan driver).\n- **Windows**: unzip, run `GRID\\GRID.exe` (unsigned: SmartScreen, More info, Run anyway). Not yet played on Windows.\n' "$ver" >> "$out/notes.md"
ls -la "$out/dist"
if [ $upload = 1 ]; then
  title=$(grep -m1 "^## \[$v\]" CHANGELOG.md | sed -E 's/^## \[[^]]*\] - //; s/ \(tag.*//')
  gh release create "$ver" -R blackmetaltech/grid --title "GRID $v $title" --notes-file "$out/notes.md" "$out"/dist/*
  log "released"
fi
