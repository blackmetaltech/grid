# Changelog

All notable changes to GRID. The release workflow publishes the section whose heading contains `[x.y.z]`.

## [1.0.0-rc.2] - "Keep the Lights On", played through (tag v1.0.0-rc.2, local)
### Added
- `in` pack, WO-28: the state is tied to the All-India grid (a 1000 MW 400 kV tie at the Capital; large inertia, droop, no reactive help).
  Losing the 660 MW unit now dips the frequency to about 49.96 Hz instead of 49.26 Hz, so the third lamp can be reached. The voltage is still the player's job.
### Changed
- L10: each house shows its kVA. The star targets were re-frozen from designs a player reaches by hand (the third lamp needs 8 moves or fewer).
- L11: the cans step by 5 (right-click by 1). L13: the excitation ± buttons step 0.001 pu, and the predictions read "—" until Run.
- Chapter 3: a placed capacitor bank starts switched in, and its tag shows IN n/N or OUT. The mill bus is labelled ("banks go here").
  A second bank on a bus is refused. The L08 reactor steps through presets.
### Fixed
- The L07 incident report printed a current that did not follow from its own S and V (1.71 MVA at 0.946 pu is 95 A, not 119 A).
  The "what to try" text now says when the bank stood on the wrong bus or was switched out.
- The world labels at L28's capital (400/220/132 kV and the datacentre) printed on top of each other.
- Saltmarsh Island (L28) and the quarry (L09) sat under the budget tag.
- Tray captions are shrunk before they are elided ("ICT 400/220", "Twinmoose").
- Exam bridges with nothing to buy no longer list "Spend ≤ $0".
- A chapter 3 commit had silently reverted the chapter 4 fixes; they are restored.

## [1.0.0-rc.1] - "Keep the Lights On" (tag v1.0.0-rc.1, local; the finale; every chapter playable; critique pass in docs/CRITIQUE-1.0-rc.md)

Chapters 3-7 and the finale were built in parallel and land together in this tag; the 0.4.0-0.9.0 sections below describe them chapter by chapter.
### Added
- **WO-28 Keep the Lights On**: the whole state for three days (26 buses at 400/220/132 kV, nine plants, a 300 MW datacentre).
  Day 1 a heatwave peak, Day 2 a storm that trips a 400 kV line, the largest unit and a transformer, then lightning on the island's
  causeway at 23:30, Day 3 a holiday full of sun and little demand. Saltmarsh Island must not go dark on the night before Nia's exam.
  A day card with the threat, the island lamp and an event ticker; the game-end card.
- Ruleset 6 for both region packs (pins and goldens regenerated).
### Changed
- Every chapter card went through two or three playtest and fix waves (Haiku panels, before and after): one-line glosses for the jargon
  (pu, X_s, THD, RoCoF, pickup, TMS, CT, lambda, zones), targets shown before Run, and panels kept clear of the clock and the budget tag.
- Chapter 7 levels that teach a calculation (L23, L25, L26, L27) need a written prediction to pass, so there is no two-action win.
- The work order and shift report leave out spend lines on levels with nothing to buy, and on score levels.
### Fixed
- Towns read "dark" before the grid had ever been solved; they now show their name only.
- The L28 report printed the Day 2 storm sentence after a Day 1 failure.
- The finale ticker opened with the free-play banner ("the grid is empty").
- dmath everywhere in src/ (chapters 3, 5 and 7 and the finale used Math.hypot, pow, cos and **).
- The Godot test runner read `CH2-FLOW OK` as a failure (a tag with a digit).
- L13's predict panel was blank until the slider moved; L22's exam sheet ran off the right edge; L24's readout sat under the budget tag;
  L27's answer boxes covered the formula lines; L17's B3 sat under the tray.
### Changed
- WO-28 in the `in` pack now has the All-India interconnection: a 1000 MW 400 kV tie at the Capital (an external equivalent with 100 GVA of inertia, droop, no reactive power), so losing the 660 MW unit leaves a nadir near 49.96 Hz and the third lamp is reachable (reference: taps, switched capacitors and a second causeway line, 398 M INR; the spun unit is the lesson's extra).
### Known gaps
- Day 2's lightning opens the causeway by protection; it is not a sequence-network fault.

## [0.9.0] - in 1.0.0-rc.1: "Protection and Markets" (chapter 7)
### Added
- **WO-23 Fault Level**: the short-circuit current at each feeder against its breaker rating (30.2 kA at F1 once the generators join);
  split the bus, add a reactor or high-impedance transformers to bring it under the breakers.
- **WO-24 Coordination**: grade the relays so the nearest one trips first (time-current curves, 0.3 s grading margin).
- **WO-25 Clear It in Time**: the critical clearing time of a generator after a fault (163.6 ms, 53.5°) against relay plus breaker time.
- **WO-26 Merit Order**: commit plants and pick a dispatch rule; the water value of the hydro; a congested corridor splits the price.
- **WO-27 Exam Bridge**: protection calculations (symmetrical and earth-fault currents, CCT) on paper, attempt first.
### Known gaps
- The study networks of WO-23 and WO-27 are the scenario's; the map is decoration. No bullet-time replay of the fault yet.

## [0.8.0] - in 1.0.0-rc.1: "Frequency and Renewables" (chapter 6)
### Added
- **WO-19 Fifty Hertz**: the largest unit trips at 20:00; keep a spare unit spinning so the nadir stays above the first shedding stage.
- **WO-20 Sun Goes Down**: the evening ramp after 3 GW of solar; commit peakers in time, move the pumps to noon. A net-load curve shows the ramp.
- **WO-21 Inertia Matters**: RoCoF without spinning mass; ride-through for rooftop inverters and grid-forming batteries.
- **WO-22 Exam Bridge: Droop and RoCoF**: three predictions with a formula card you can open after trying.

## [0.7.0] - in 1.0.0-rc.1: "Load Flow and Voltage" (chapter 5)
### Added
- **WO-14 Per Unit**: tap changers on a 132/33/11 kV chain; staggered automatic delays beat equal ones (about 28 tap moves instead of 140).
- **WO-15 Long Line**: a 300 km line at light load lifts its far end (Ferranti, 1.089 pu); reactors, capacitors or an SVC at the receiving end.
- **WO-16 Loop Flow**: power splits by impedance around a ring; reconductor with HTLS, add a line, open a ring line or run the plant at B4,
  and survive the loss of any one line (N-1).
- **WO-17 Nose**: the P-V curve and the loadability margin; capacitor steps, STATCOM, SVC or a peaker against voltage collapse.
- **WO-18 Exam Bridge**: a PV bus set-point and Gauss-Seidel against Newton, three predictions.
### Fixed
- Shunt-reactor catalogue rows were read as capacitors.


## [0.6.0] - in 1.0.0-rc.1: "Three-Phase and Machines" (chapter 4)
### Added
- **WO-10 Balance the Phases**: move each house's drop between phases a, b and c; the neutral carries the unbalance (160 A on one phase).
- **WO-11 Star or Delta**: size a capacitor bank (a star bank needs three times the microfarads of a delta one) and pick the pump's starter.
- **WO-12 Over the Hill**: a generator 300 km away; raise its excitation, add series capacitors or a third circuit so it stays in step
  after a line trips (P-δ curve, rotor-angle swing).
- **WO-13 Exam Bridge**: synchronous machine phasors (E, δ, P_max) on paper.

## [0.5.0] - in 1.0.0-rc.1: "Phasors and Power Factor" (chapter 3)
### Added
- **WO-07 The Lagging Mill** with a shift-report lesson in your numbers (S = P + jQ, the wattless current at lunch).
- **WO-08 Resonance at the Fifth**: the plain bank resonates with the mill's drives and blows its fuse; a detuned bank or a filter
  (harmonic study at h × 50 Hz, THD against the 5 % limit).
- **WO-09 The Hundred-Percent Trap**: series compensation lifts the far end, but at 100 % the fault current beats the old breaker.
- Chapter-end cards for chapters 3 to 7; the Jobs list is grouped by chapter.

## [0.4.0] - in 1.0.0-rc.1: "Salt Wind" (insulation: the sea air on the insulators)
### Added
- **WO-29 Salt Wind.** Year two on the Mainland: your River Line still stands, and the harbour (fish market and ice plant) on the
  south coast wants power all night. Extend 11 kV from Brightwater around the town to the beach.
- **Insulators.** Pin (320 mm of creepage), a two-disc string (590 mm, hangs the wire 0.30 m lower) or one anti-fog disc
  (430 mm, 0.15 m). The salt needs Um × mm/kV: 12 kV × 31 mm/kV = 372 mm on the beach, 300 mm a little inland. Choose an
  insulator for the line and another for the coast stretch.
- **The salt is visible**: the coast is whitened by how much salt the wind lays there, sea fog rolls in from 02:00 and is thickest
  at 04:00, and an insulator short of its creepage crackles violet in the fog before it flashes over.
- The harbour gets its own houses, dark until you bring the power.
- **WO-04 Spin the Alternator**: poles, turns, field and coil area on a machine bench; the scope shows the sine, the village needs
  50 Hz and 230 V (f = poles × rpm ÷ 120, e₀ = N·B·A·ω).
- **WO-06 Exam Bridge: The Town Line** (textbook mode): 800 kW over a 15 km line loses 75 % at 4 kV and 0.75 % at 40 kV; pick the
  cheapest pair of transformers that keeps losses under 2 %.
- **WO-30 Bring the Island Home** (chapter 2 finale). Saltmarsh Island lies 4 km off the harbour. Lay a submarine XLPE cable
  (70 / 120 / 185 mm²; it charges like a capacitor: Q = V²ωCℓ, about 46 kvar), put a transformer on the island, and size the
  island battery. At 21:00 a trawler drags its anchor across the cable: the island must stay lit until 23:00 on the battery alone
  (inverter kW against the peak, kWh against two hours of evening load). The island, the seabed cable, the trawler and the cut are drawn;
  the lighthouse turns while the island is live and the battery hut shows its charge.
- Prices before you buy (the engine prices a build on a copy of the night); taking down something you bought this job refunds it.
### Fixed
- The shift report no longer contradicts the clearance gauge: it names your longest span and your tightest one (the gauge's number);
  after a flashover it names the span that flashed, and "What to try" tells you how to lift it (or, at 0.42 kV, to go to 11 kV).
- Switching the line voltage moves your line to the same towns' yards (one line, one bill); a new survey between the same towns
  replaces the old line instead of building a second one.
- On a Steam Deck and in small windows the Mainland map keeps both towns above the tray; the market's houses fill its streets.
- Pixel 9a: the Mainland runs at 30 fps (was 18-20).

## [0.3.0] - "The Mainland Line" (tag v0.3.0, local; chapter 2 opens; critique pass in docs/CRITIQUE-0.3.md)
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
- On the Pixel 9a the Mainland map ran at about 20 fps (30 fps from 0.4.0).
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
