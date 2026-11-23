# CRITIQUE 1.18: "Bay and Mainland" (2026-11-23)

**What this layer is:** LOOK2 phase C, second pass.
- The island has a shape: dunes, hills, a headland, rocks, surf, a jetty with boats, paths.
- Water reflects the land, homes and lamps (screen-space ray march).
- Towns grow streets along roads and rivers. No halo, no glowing stubs.
- Chapter 2's two map levels (L05, L29) are in 3D (DECISIONS 25).
- The finale starts in about 4 s (was 14 to 22 s). A banner says the report is coming.
- Four key sounds, made in code, not heard by any human.
- The Career is in the glass UI, same layout.

**Machine:** RTX 4090 (PRIME offload) for the 3D shots, load timing and hand play; the Ryzen iGPU (RADV) for the low tier. At most 4 vitest workers, one Godot at a time.

## Gate
| Item | Result | Evidence |
|---|---|---|
| 1a. Island relief, beach, surf, jetty, boats, paths, hamlet framed larger | **Met.** bay_relief_truth checks every route point, home, hut and box stands dry (>= 0.3 m) on L01 (three hut sites), L02 (radial, trunk) and L03; the land rises at least 8 m; the north shore wanders (sd >= 6 m); the lighthouse stands on a headland; L01 has a jetty. The first job opens behind the hamlet looking out to the beach. | bay_relief_truth; docs/look2/r7-a-title.jpg, r7-b-l01.jpg |
| 1b. Water with reflections and shore foam | **Partly met.** Land, the lighthouse and the sun path reflect; surf bands run in over the shallows. Sigrid: the lit homes do not show in the water in the lit night view (r7-c). The ray march is screen-space: what is off screen cannot reflect. | water.gdshader `ssr()`; r7-a, r7-c |
| 1c. Mill-town streets irregular, along rivers and roads; no halo; no glowing stubs | **Met after Sigrid's review.** Main street bends with the road, side streets at uneven gaps, back lanes, a river-bank street. Halo: two causes, each proven by switching one effect off: SDFGI lighting the haze (1.18 early), and the sun and moon lighting the haze only inside their shadow range (after Sigrid, `CB_FX_OFF=sunfog`). Street stubs glow only far away. The mill's roof glazing was a lit rod per tooth; it is panes now, and dimmer. | town_gen.gd; 89404c0; r7-d before the fix |
| 1d. Cloud shadows | **Met** (terrain.gdshader `cloud_scale`, bay and province). | r7-b, r7-f |
| 1e. Sigrid re-score, target 8 | **Not met. 7/10, the same as 1.17.** Title and bay 8, chapter 1 at play 8, low tier 8, towns 6.5, Mainland 6, Career UI 5. Her overlap and halo findings were fixed after her score; the Career and Mainland findings are open. She has not re-scored the fixes. | Critics, below |
| 2. Chapter 2 in 3D, scope with Priya, recorded | **Met for scope; partly for the art bar.** DECISIONS 25: L05 and L29 in 3D, benches stay Classic, no lattice at 11 kV. Streets by TownGen for big towns; river and woods no longer stepped by tile at their edges. Sigrid: the woods still read as blocks at distance (they are the engine's forest tiles) and the town has no landmark. | DECISIONS 25; r7-f, r7-g |
| 3a. Finale load under 5 s | **Met. 4.0 s from the card to play** (LOADING start t=6934 ms, quick t=10941 ms, `CB_LOAD_TIME=L28 CB_PROFILE=1`). Heights cached on a 50 m grid, row-parallel builds, the woods grow on worker threads 20 frames after the job is playable. | c2ccfad, 4376010; par_rows_truth |
| 3b. The report opened 3.5 s late with nothing on screen | **Met.** A glass banner ("Shift over. Report in a moment.") with a progress bar; the report opens at 2.5 s, or at once on A or a click. | main.gd `_report_soon()` |
| 3c. Dagny re-scores the finale; fix what she finds | **Met. Fun 7 (6.5), clarity 6 (6), tension 6.5 (5), return-tomorrow 5.5 (4.5).** Star A now differs from star B in planning (her cheap build fit under $30.03M; spinning U4 from the start would not). All three findings fixed: the pad's Back cycles the speed (0ec8eca); the dial holds a trip's dip in red (d913f08); the opening camera frames Eastgate, Harbour and Saltmarsh Island, and the loss text says "in all" (e964db5, dfa4258). She has not re-scored the fixes. | Dagny's frames in the scratch folder; dial_truth; smoke |
| 4. Sound: critical review; breaker, town lights up, trip, blackout | **Met as code; unverified by ear.** Measured spectrum and loudness of every cue (docs/audio/ANALYSIS.md): quiet cues raised, the hum lowered 6 dB, thumps moved above 60 Hz so laptops play them, the wind no longer a rumble. The four key sounds exist and are asserted (peak, DC, clicks, one chord per town). **No human has listened to any of it.** | docs/audio/ANALYSIS.md; render_samples.gd |
| 5. Career in the glass UI, same layout | **Met as briefed.** Sigrid scores the Career 5: she wants a different layout (the world behind it, a drawer for the board, no Y1-Y10 bar). The brief said same layout; I hold to it this layer and write her redesign down as open. | ad755d3; r7-h |
| 6a. GPU hand play at real speed, mouse and pad | **Partly met.** Ravi (16, pad, impatient), GPU at real speed: title to WO-01 by pad, won L01 (2 of 3 lamps); Back cycles 2x, 4x, 1x; no SCRIPT ERROR. He was stuck in WO-02 because pad A laid the armed reel, not the one under the ring: **fixed** (kit_tray `_focus_not_armed`, tray_flow fails without it). L05 and L29 were locked on his fresh save (progression is by design) and **were not hand-played**; DECISIONS 25 asked for one hand play of each. Mouse pass (software render, not real speed): hut, cable, run and report on L01 all worked. Two earlier GPU attempts were blocked 11 and 5 minutes by other games' windows holding the shared lock (core-requests). | scratchpad ravi3/ frames; .qa/grid/a/shots s1-s6 |
| 6b. Tests and flows green; low tier on the iGPU | **Met.** vitest 1585 passed, 1 skipped. Godot 28 of 28 (truths and flows, smoke+paper+career). iGPU low at 1920x1080: L01 and L05 at 10.6 ms GPU, 60 fps. | test logs; r7-low-L01.jpg |

## What is not done (written down, not hidden)
- **Sigrid is at 7, not 8.** The target is missed.
- **Career layout:** Sigrid wants the terrain behind it, the board as a drawer, the Y1-Y10 bar as a small dial and normal case labels. Not done: the brief said same layout.
- **Mainland woods** read as blocks at distance: they follow the engine's forest tiles. Edges are ragged now, the masses are not. **The L05 town has no landmark** and is small in the default frame.
- **The capital** (finale) is a tangle of blue lines with nothing for the eye to land on (Sigrid).
- **River meets sea** on L05 along a faint straight line.
- **Night sea edge:** in a steep night view of the bay the sea ends on a straight line against the sky. I tried the far plane, a larger sea, the below-horizon sky colour and the fog colour; none changed it, and all were reverted. Only the brighter night sky shipped.
- **Lit homes do not reflect** in the night bay view (screen-space reflection limits).
- **Sound is unheard.** Every number is a measurement; nobody has listened.
- **Dagny's open points:** Day 1 has no events (3.7 min at 1x); a bus label does not turn amber below 0.96 pu before a loss. She never reached a finished report or saw a lamp awarded: her run hit the 30-minute limit on Day 3. The load card timing was not confirmed by her (frames start after load); the 4.0 s is my own profiler run.
- **The finale card while planning** still shows the full parts shelf (about a quarter of the screen). The manager asked for the folded strip by default. It is folded while the day runs; while planning, the shelf is where the finale's choices are, so it stays. The ticker and notes are folded. I disagree with the manager on this one point and write it down here.
- **Report banner on a loss:** Dagny's two losses went straight to the incident report with no banner. The banner is for the end of a shift; a loss report comes at once.
- **Hand play of L05 and L29** at real speed was not done (locked on a fresh save). Their only checks are GPU shots and the route tests.
- **The pause menu over the shift report** and a dead "next job" button after B, reported once by Ravi, not reproduced.
- **Blackout GIF** not re-captured: the README keeps the 1.15 one. The town-lights GIF is new.
- **Mouse drag in L01** can swing the camera away from the cable.
- **Process:** two commits (8f3e11b, 89404c0) have their trailers inside the subject paragraph (no blank line). Pushed, not rewritten.

## Critics (once this layer)
- **Sigrid (art), 7/10, flat.** Title/bay 8, chapter 1 at play 8, towns 6.5, Mainland 6, Career 5, low tier 8. 1.17 points: grid streets fixed; flat slab fixed; halo, rods, small homes and sky-only water partly. Her top three: (1) the Career is a dashboard; (2) overlapping text in the meter caption, the route tray and the 1280 reel prices; (3) the Mainland looks stamped out (a water sheet at the river mouth, block woods, a small town). Fixed after her score: (2) in full (8f3e11b); the water sheet; the haze disc and the mill rods (89404c0); the night sky above the bay. Open: (1), the woods, the town.
- **Dagny (fun), finale: fun 7, clarity 6, tension 6.5, return-tomorrow 5.5** (1.16: 6.5, 6, 5, 4.5). "First moment I cared: 23:30 on Day 2", when the camera cuts to the island's battery. Her top three: the pad cannot change speed; the 660 MW trip is invisible on the dial; the first sag came with no warning, and the opening camera missed Eastgate. All fixed after her score.
- **Manager review of r7:** L05 washed out and empty; L01 night too dark; homes small boxes; the mill a dark slab; the finale card unfolded. Done: less haze and more colour by day, farms and a bridge on the Mainland; moonlight and ambient lifted; porches, fences, washing lines and door light on the homes; saw-tooth slate, lit skylights, bales and coal at the mill. The card: see above.
- **Ravi (playtester, 16, pad then mouse):** L01 won by pad on the GPU, and won with the mouse. His problems: the pad's reel ring and the armed dot disagreed in WO-02 (fixed); WO-02's coach said "check the trunk" on a radial build (text fixed); the pause menu drew over the shift report, and after B closed the report its "next job" button did nothing for him (**not fixed, not reproduced**); a mouse drag swung the camera off the cable in L01 (open). With frame capture on, a 4x night ran at 2 to 8 fps; 1.17 measured 60 fps at 4x with capture off.

## Owner-concerns audit (bible/05)
| | Concern | 1.18 |
|---|---|---|
| A | Game, not SaaS | The island is a place with a beach, boats and paths. The Career is still a dashboard (Sigrid 5). |
| B | Its own soul | The first lamp in a shaped bay, with its light in the water. |
| C | Realism, proportion, texture | No lattice at 11 kV (DECISIONS 25). Towns grow along roads and rivers. Mainland woods still follow square tiles at distance. |
| D | Readability, contrast | Meter numbers, tray lines and reel prices no longer overlap (fixed at the 16 px floor). |
| E | Every control works | Pad: Back changes speed; A on another reel now picks it (a hand-play bug, fixed with a test). Open: pause menu over the report (reported once). |
| F | Scroll and input stability | Input is held through the loading card as in 1.17; the report banner takes A or a click. |
| G | Device classes | 4090 hand play; iGPU low measured on L01 and L05. Phone not checked this layer. |
| H | Impatient first-timer | The finale starts in 4 s. The first job opens beside the hamlet. |
| I | Logic integrity, ledger | No engine or scoring change this layer; scores rules not bumped. par_rows_truth: threaded builds equal serial builds. |
| J | Depth, realism of choice | Unchanged from 1.17. |
| K | Fun, long-term play | Dagny: return-tomorrow 5.5 (was 4.5), tension 6.5 (was 5). Day 1 of the finale is still dead air. |

Ingrid Solheim, Game Lead, GRID
