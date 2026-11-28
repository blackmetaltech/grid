# Play this (branch look6, not released)

## Start: play from the beginning
```
make run SAVE=fresh
```
A new, empty save of its own (in build/fresh-data). Your own save is not touched.
Each `SAVE=fresh` starts over. To go on later from where you stopped: `make run SAVE=continue`.

The game opens on the RTX 4090 in its own 1920x1080 window. `WIN=2560x1440` picks another size; fullscreen works too.
Keep the window at 1280x800 or larger.
Title: **Take the night shift** starts the campaign at WO-01.

`make run SAVE=tour` is another separate save with every job open, if you want to jump around.

Other ways to start:
- `make run LEVEL=L10` goes straight into one job.
- `make run LOW=1` is the low tier on the integrated GPU.
- `make run CLASSIC=1` is the classic 2D look.

## New today (11-28, after "this is still the old graphics")
- The province (prologue, chapters 3, 5 and 6, the finale) has a new ground: fields in strips with tramlines and hedges, not the old patchwork. Plants, towers, trees and towns have new materials.
- Nights are dark land with warm lights, lit from the side, not a flat blue.
- The pause menu and the chapter cards are glass over the scene (they were cream paper).
- The incident report fits its text and keeps the place visible.
- **V** (or "Hide charts" beside the job title) folds every chart away so the place fills the screen. Press again to bring them back.
- WO-25 now records the rotor swing, so its chart can draw it.

## New since 1.18.1
- Every job is now in the 3D look: the prologue and chapters 1 to 8.
- Chapter 4 is four places: a street, a works yard, a hydro valley and a generator hall.
- Chapters 5 and 6 play on the 3D map, with glass cards.
- Chapter 7 is five places: a substation, a feeder with four relays, a generator and its breaker, a dispatch room with its plants, and the exam substation.
- Chapter 8 is one country feeder with villages, poles, fuses, a recloser and a substation.
- The Career map is a night district in 3D: two substations, nine feeders, a street of homes per section. The map's lines lie over it.
- From 1.19 (also unreleased): the prologue and the chapter 2 benches in 3D, pad play on the benches, the prediction counts once.
- Streets by day were almost black. Fixed.

## Ten minutes
Open Jobs from the title. Left-drag moves the view, right-drag (or Shift-drag) turns it, the wheel zooms.
1. **WO-10 Balance the Phases** (2 min). Click houses to move them between phases. Watch the neutral glow fade. Run the night.
2. **WO-13 Generator Phasors** (1 min). Move the excitation slider. The field in the machine lights up.
3. **WO-16 Loop Flow** (1 min). The 3D map. Press Run and watch the line loading.
4. **WO-23 Fault Level** (2 min). Pick breakers, predict the fault current, run. Look for the fault flash and any breaker that smokes.
5. **WO-26 Merit Order** (1 min). The dispatch room in front, the plants behind. Run and watch which plants steam.
6. **WO-31 The Long Feeder** (2 min). Put a regulator at N3 and run. The far villages light up.
7. **WO-35 Sun on the Roofs** (1 min). Change the PV limit and count the panels.
8. **Career** from the title (1 min). New career. Drag the district, zoom in on a street, click a section.

## Known to be rough
- Charts still cover the top of the screen on several jobs (WO-12, WO-24, WO-26, chapter 8).
- WO-12's city is small on the horizon. WO-26's plants are plain boxes.
- WO-34: demand response dims only a few homes, hard to see.
- On a phone, chapters 4 to 8 keep the classic look.
- WO-25's swing chart shows only the verdict after the run: the engine does not record the swing trace.
- Opening the Career stalls about 2 seconds while the district is built.
- The Career's top strip and project drawer are still dense panels.
- Windows smaller than 1280x800 (for example 1080x608) overlap text on the 3D jobs.
- Low tier: lattice towers and thin lines shimmer on the closer province views.
- Sound: nobody has listened to it.

## Classic look
`make run CLASSIC=1` draws every job in the old 2D look.
