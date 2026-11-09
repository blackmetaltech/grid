# GRID

A COBANANA learning game: real equations are the rules. Built on [cobanana-core](https://github.com/ixaxaar/cobanana-core)
(TypeScript engine as a Node sidecar under a Godot 4.7 front-end; Linux, Windows, macOS and Android; mouse, controller and touch).

## Run from source
```
git clone --recursive <this repo>        # or: git submodule update --init
pnpm install
pnpm bridge                              # builds the engine sidecar → godot/sidecar/bridge.mjs
godot --headless --path godot --import   # once, and after adding class_name scripts
godot --path godot                       # play
```
Needs Node.js 18+ and Godot 4.7.2.

## Develop
| task | command |
|---|---|
| typecheck | `pnpm typecheck` |
| unit + golden + persona + level tests | `pnpm test` |
| regenerate goldens (deliberate rule change only) | `GOLDEN_UPDATE=1 pnpm test` |
| UI smoke (every screen) | `pnpm smoke` (prints `SMOKE OK`) |
| screenshots / testers | `core/qa/README.md` (displays :200+) |
| Android debug APK | `core/qa/buildapk.sh` (see `core/android/README.md`) |

Where things go: `CORE.md` in `core/`. Game design: `docs/DESIGN.md`. Changes: `CHANGELOG.md`.
