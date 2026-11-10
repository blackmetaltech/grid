# Changelog

All notable changes to GRID. The release workflow publishes the section whose heading contains `[x.y.z]`.

## [0.2.0] - unreleased (chapter 1 critique pass, see docs/CRITIQUE-0.1.md)
### Fixed
- **Retry keeps your build.** After a failed night the hut, reels, junction and converters stay where you left them and the work order
  stays folded in its pin, so a retry is one swap and a breaker pull instead of six clicks and a rebuild. Tobi says so on the radio.
- **No dead air.** A five-hour night now runs in 16 seconds at 2× (6 s at 4×).
- **The lessons say the rule first.** L01's report reads "Thin, long copper pushes back on the current … V = I·R"; L03 no longer tells you
  to fit the 380 V converters before you have thought about it (Tobi asks how the same power could need less current).
- On a Steam Deck sized screen the island no longer shrinks into the left third after the layout changes; the shift report fits without
  its "more" cue covering Ada's note; the budget tag no longer sits on the 35 and 50 mm² reels; no stale what-if chip during the night.
- The lighthouse stays on its headland when you move the hut.
- Jobs start without a generic cyan confirmation box (your running job is autosaved first).
- The prologue's open line has a glowing breaker in the world: tap it to close Line 7 (it was only reachable from an old drawer).
### Changed
- Sandbox is off the title screen until it has its own tray and map (it opened an empty board).
- The comparison histogram is labelled "Every design the job allows (offline sample, not real players yet)".
### Known gaps
- Each chapter 1 job still has one obvious best answer; depth arrives with chapter 2 (design/grid/DEPTH.md).
- The prologue is still short on spectacle (no bullet time yet). Audio has not been heard by a human.

## [0.1.0] - chapter 1 first review build (tag v0.1.0, local)
### Added
- Chapter 1 "The Island": L01 First Light, L02 Two Hamlets, L03 The Price of Distance, prologue P0; GRID's own night-shift interface
  (instruments, radio, kit tray, breaker, paper work orders and reports), Cute mode, synthesised audio, Jobs, Settings.

## [0.0.1] - scaffold
### Added
- Project scaffolded from cobanana-core: engine, Godot front-end, CI, Android build.
