# Changelog

All notable changes to GRID. The release workflow publishes the section whose heading contains `[x.y.z]`.

## [0.3.0] - unreleased: "The Mainland Line" (chapter 2 opens; critique pass in docs/CRITIQUE-0.3.md)
### Added
- **Chapter 2, WO-05 The River Line.** Bring a waterfall's power 4 km across a river, a mangrove swamp and a ridge to Brightwater
  market. You survey the line yourself: click a yard, click the ground to bend it, finish at the other yard.
- **What holds the copper up.** Three pole families (wood 9 m up to 70 m spans, concrete 11 m up to 100 m, steel tube 13 m up to 130 m),
  bank structures for the river (H-frame or steel tube), span spacing, three conductors (Weasel, Rabbit, Dog). Bends need stronger
  angle poles, swamp poles need piles, rock needs anchors, forest has to be cut.
- **Sag you can see and check.** Every span sags by D = wL²/8H at 75 °C; the clearance gauge shows your worst span against the rule
  (ground, road and high water) while you survey, and a span that comes too low is refused with the reason and the tile marked.
  At the 19:30 peak a span that is still too low flashes over.
- **The voltage choice.** A line-voltage cell in the tray: 0.42 kV straight from the powerhouse (it browns out), or 11 kV with a
  transformer at each end. The shift report explains why with your numbers (305 A at 0.42 kV against 12 A at 11 kV: 1/26 of the
  current, about 1/690 of the heat).
- The survey chip shows where the money goes (poles, footings, wire, forest cut); the shift report's lesson names your longest span
  with its sag worked out in your numbers.
- Brightwater's bulb mascot shows the market's live voltage; crocodiles sulk on the swamp piles; a lineman climbs the poles you plant.
### Fixed (from the 0.3 critique: two novice and teacher testers, a code review, the Pixel, a pad and a monkey tester)
- Each site had two yards drawn on top of each other: you could not tell which was 11 kV. Now one yard per site, picked by the
  line-voltage cell.
- Changing span, pole or wire on a built line charged a second line; now it costs the difference.
- An over-budget line that lit the market was stamped NOT LIT; it now says OVER BUDGET, and money in the verdict is formatted.
- The river refusal no longer tells you to use bank structures you already chose; it says how far yours reach and which would do.
- The mouse wheel no longer changes parts by accident; the tray's scroll marks work; tray names no longer run into each other.
- A pad could not get past the first work order (focus was stuck on the Learner chip). The pad survey now steps further when
  zoomed out, repeats when held, and Y jumps to the far yard; the legend strip shows the survey buttons.
- The radio log stays readable in small windows; Retry says when part of an old design would not rebuild.
### Known gaps
- On the Pixel 9a the Mainland map runs at about 20 fps (being measured after the window-mesh fix).
- One cost-optimal design is still easy to find by trying every option; the harbour job (insulation, salt fog) adds the next layer.

## [0.2.0] - chapter 1 critique pass (tag v0.2.0, local; see docs/CRITIQUE-0.1.md)
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
