# CRITIQUE 1.17: "First Light" (2026-11-23)

**What this layer is:** LOOK2 phase C.
- The game opens on a 3D island bay, and chapter 1 (L01 to L03) is drawn in it.
- The mill in chapter 3 is a works.
- Towns follow their roads.
- Cloud shadows by day, and the sky in the water.
- The finale's third lamp rewards the cheap plan that understands the battery.
- The pad's "dropped A" is explained and fixed.

**Machine:** the 3D shots, frame times and hand play used an RTX 4090 (PRIME offload), and the low tier used the Ryzen iGPU (RADV). We ran at most 4 vitest workers and one Godot at a time.

## Gate (the coordinator's five items)
| Item | Result | Evidence |
|---|---|---|
| 1. First impression: a 3D title, chapter 1 in 3D, the bay as the charm (decided with Priya) | **Met.** The title is the bay at dusk: the lighthouse is lit and the hamlet is dark. Homes have doors, chimneys and windows. L01 to L03 are drawn in the same bay. Lamps go as (V/V0)², amber on a thin cable, beside a white porch bulb at the hut. A first-timer (Sam, pad only) went from the 3D title to a win in L01 in about 4 minutes. P0 stays 2D (DECISIONS 23). | DECISIONS 23; bay_lights_truth; docs/look2/r6-a-title.jpg, r6-d-l01-lit.jpg |
| 2. Art at play distance, re-scored by Sigrid | **Partly met. Sigrid 7/10 (up from 6).** The mill has slate saw-tooth roofs glazed on the north face, lit windows, smoke from two chimneys, a yard and a 900 m siding on sleepers. Town edges wander and run out along the main street. Clouds drift. The water shows the sky by fresnel. | docs/look2/r5-*, r6-c-mill.jpg; 955fd15, 04a2ead |
| 3. Dropped A; steady 60 fps on the 4090 | **Met.** See "Dropped A" and "Frame rate" below. | 9b26aad, GridLoading, 21c2717 |
| 4. Dagny on the new finale; fix what she finds | **Met for the fix; not re-scored.** She scored 1.16's finale fun 6.5, clarity 6, tension 5, return-tomorrow 4.5. Her main finding: money under $53.5M was worth nothing, so star A = star B. The third lamp now counts only unplanned shed, and the targets are regenerated (DECISIONS 24). She has not scored the result. | DECISIONS 24; star table below |
| 5. Label overlap: scale note vs Eastgate | **Met.** The note's rect is in the label placer, at the floor size. | fb19686 |
| Owner rule: no "real X" in player-facing text | **Met.** Swept the game strings, locales, site, README, wiki and this CHANGELOG entry. `src/no-real-x.test.ts` fails on it. | 3f8db77 |

### Finale star table (engine, vite-node)
| Plan | Result | Lamps | Cost |
|---|---|---|---|
| 2h battery, U4 at the radio's call, north feeder at the lightning | won | 3 | $29.895M |
| The same, U4 spun at the plan | won | 2 | $30.076M |
| 4h battery, U4 at the call | won | 1 | $53.495M |
| 4h battery, no reserve | won | 1 | $53.150M |

### Dropped A
- **Cause (1.16's open item):** starting the finale blocked the main thread with nothing new on screen. Presses queued during that block, then landed on "Take the job" in the work order. It was not the idle cap.
- **Fix:**
  - A "Loading the job…" card is drawn before the build. Pad input is held until two quick frames in a row, then for 0.4 s more.
  - A presses a focused button on the press.
  - PADLOG prints every A.
- **1.17 hand play** reported one more drop: on the jobs list, about 4 s after it opened. I reproduced it with PADLOG on (jobsA): UP, then A on SeeFinale at t=23487 ms, and the loading card started at t=23522 ms. The press fired. The tester's screenshot came before the card's first frame, and their second A fell inside the hold, as designed. No drop is open.

### Frame rate (4090, 1920x1080, capture off)
- 1x: 60 fps steady (frames 16.7 to 17.9 ms).
- 4x: 60 fps. The worst frame in each second is 40 to 45 ms while the model applies about 300 to 380 ms of work per second.
- Paused at a decision: after 20 s it fell to 30 fps, because the idle cap read "no input" as "away". Now (core 21c2717, 2b3956f) the 3D look waits 2 minutes. Re-measured: 22 of 24 one-second samples at 58 to 61 fps; the one at 33 fps is the load second.
- The tester's 9 to 20 fps samples came from screenshot capture (CB_SHOT_EVERY) on top of that cap. With capture off, L01 and the finale hold 60.
- iGPU low: the title and L01 at 4.6 ms GPU.

## What is not done (written down, not hidden)
- **The finale takes 14 to 22 s to start** (22 s in today's run, t=23.5 s to 45.5 s). The card hides it; it is not shorter. It is single-threaded province building.
- **Sigrid's open points:**
  - a pale halo disc still rings each town;
  - streets inside towns are a graph-paper grid;
  - orange street stubs at dusk read as glowing rods;
  - the L01 homes are small in the frame (the camera came in by a third; she wants more).
- **The water reflects only the sky**, not the land or the towns.
- **The island is a slab** with a soft edge, not a shaped coast.
- **The finale's three-lamp margin is thin:** the tester came in $3.9K under star B, and one wasted $9K bank would have cost the lamp. It is by design (DECISIONS 24, Mateo's own argument against).
- **The report comes 3.5 s after the end** in the 3D look, so the player can see the lights. Nothing on screen says it is coming; the tester pressed Y and the D-pad in that gap.
- **Process breach:** 90e3dc3 put the star-rule change and the regenerated frozen targets in one commit. Targets belong in their own commit. It is pushed and not rewritten; it is recorded here.
- **Dagny has not re-scored** the finale after DECISIONS 24.
- **Sound:** no new sound this layer. No human has listened to the 1.16 outdoor bed.

## Critics (once this layer)
- **Sigrid (art), 7/10, up one.**
  - Her three findings:
    1. the mill read as a solar farm;
    2. the L01 report sat on the parts shelf, and its axis numbers were dark 10 px text on glass;
    3. the title homes were blank boxes.
  - All three were fixed after her score (04a2ead, 6a64c87, cf473e8; r6 shots). She has not re-scored the fixes.
- **Sam (first-timer, pad only):** went from the title to a win in L01 in about 4 minutes. His points were fixed: tray order follows the screen, the peg tags are readable, and the chip is readable.
- **Second-year EE student (pad only, GPU, real speed): the finale, 3 of 3 lamps** at $30,026,904 (the limit is $30,030,814). They understood why: "the 29.1 MWh I left off by my own order does not count… the same build for less earns it." The live calls (spin U4, open the feeder) worked by pad with no drop.
- **Priya (product):** chose the bay over a province title (DECISIONS 23). She would have cut the mill, outlines and clouds to 1.18; they stayed in and nothing was cut.

## Owner-concerns audit (bible/05)
| | Concern | 1.17 |
|---|---|---|
| A | Game, not SaaS | The game opens on a place, not a menu over a map. |
| B | Its own soul | The first lamp in a dark bay. The mill gives chapter 3 its place. |
| C | Realism, proportion, texture | The mill and towns are shaped. Halo discs and grid streets remain. The map is compressed and the screen says so. |
| D | Readability, contrast | Histogram axis numbers are light on glass. The scale note is clear of labels. |
| E | Every control works | The dropped A is explained and fixed; a later report was proven to be a screenshot timing. The pad reaches every finale control. |
| F | Scroll and input stability | Input is held during loads, so no press lands unseen. |
| G | Device classes | 4090 at 60 fps at 1x and 4x, and in pauses. iGPU low measured on the title and L01. Phone not checked this layer. |
| H | Impatient first-timer | Meets 3D first. A first-timer won L01 in about 4 minutes. |
| I | Logic integrity, ledger | unplannedEnsMWh is a domain change with tests. Targets are regenerated, not hand-set. |
| J | Depth, realism of choice | Understanding the battery and the call now beats buying safety. |
| K | Fun, long-term play | Not re-scored this layer. Return-tomorrow was 4.5 in 1.16. |

Ingrid Solheim, Game Lead, GRID
