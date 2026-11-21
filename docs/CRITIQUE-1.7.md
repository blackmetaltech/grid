# CRITIQUE 1.7: "Sound and speed" (2026-11-22)

Rounds tested against the gate in [CRITIQUE-1.6.md](CRITIQUE-1.6.md):
- one Sonnet fun-critic tester (P0, L01, L20, eight Storm Coast quarters);
- the Opus iterator on the desk (the finale at 1× and 4×, the Career, L23, L27);
- the audio sampler and its analysis ([docs/audio/ANALYSIS.md](audio/ANALYSIS.md)).

Fix rounds: one, after the tester. The machine ran at load 10-19 all night from other jobs, so every timing here is a loaded-machine
number.

## The gate
| Gate item (from CRITIQUE-1.6) | Result |
|---|---|
| 1. Sound someone listened to: a cue per interaction, money cues, three or more long varied tracks; a listening note | **Mostly met, honestly.**<br>Delivered:<ul><li>four tracks, 156-195 s each;</li><li>six new cues (speed keys, trip, blackout, coin, spend, quarter);</li><li>the old silence on trips and blackouts is gone.</li></ul>Not delivered: **nobody has listened**. An agent cannot hear. The sampler is rendered and measured instead: loudness, true peak, clipping, spectrograms read by the iterator, bar-by-bar section maps, and a cross-track structure and harmony check. **A human listening pass is still owed.** |
| 2. The finale at 4× measured, idle machine; fix < 30 fps or > 20 s per in-game hour | **Partly met.**<ul><li>Measured at load 10-19, not idle (the coordinator waived the idle machine). An idle-machine number is still owed.</li><li>Speed is fine: 4× runs 2.5 s per in-game hour against 10.9 s at 1× (a ratio of 4.4).</li><li>Frame rate fails: 3-8 fps on the desk's software renderer.</li><li>The cause is in core, not GRID: each tick is a synchronous bridge round trip on the main thread (process time 280-450 ms a frame). It is filed in `status/core-requests.md`.</li><li>GRID's own share was fixed: island and home-light repaints were coalesced to 1 Hz (from about 25 to about 6 per 5 s).</li></ul> |
| 3. A fun-critic tester | **Met.** Verdict and scores below. Top finding (no visible alarm while a passive Career drifts to a strike) fixed with a HUD alarm. |
| 4. Storm Coast re-played with the nudge | **Met.**<ul><li>The tester quoted the nudge exactly.</li><li>They booked readiness and hardening after it, saw the running cost, and used the stand-down button.</li><li>They kept the licence at strike 2 of 3, "not knowingly". That finding drove the HUD alarm.</li></ul> |
| 5. L13: status-line overlap, slider keyboard and + step, third lamp's tolerance | **Met.**<ul><li>The checks are spaced by their text width.</li><li>− / + step 0.01 pu (right-click or Shift 0.001).</li><li>Arrows step while hovering the slider.</li><li>A ch4_flow test covers the steps.</li><li>The ±0.002 pu lamp is now reachable with the fine step.</li></ul> |
| 6. No-build exam cards; L27 live sum; finale ticker names | **Met.**<ul><li>L13's card drops cost, loss and the build-cost histogram.</li><li>L27's sum updates as you type.</li><li>The log reads "T4, the Capital 400 to Eastgate 400 line". This changed the 10-bus trip-day golden for log text only, so it was regenerated in its own commit.</li></ul> |

**Verdict:** the game now has a varied soundtrack and audible events, and the Career warns where the player is looking. The honest
gaps are that no person has listened to the audio, and that the finale runs at single-digit fps on the desk because of a core bridge
design.

## Owner-concerns audit (games-bible 05)
| Group | Pass/Fail | Evidence |
|---|---|---|
| A game, not SaaS | Mostly | Levels keep the world on screen. The Career's main screen is still the most dashboard-like screen (the tester: "a dense dashboard with ~20 panels"); it was rejected as a README shot for that reason. |
| B own soul | Pass | Sodium-on-night palette, paper reports, knife-switch breaker; the music is GRID's own (night-shift ambient, four modes). |
| C realism | Pass | Text truth test (1.6) still green; the log names real elements. |
| D readability | Mostly | L13's overlap fixed. The Career's first screen is dense. |
| E every control works | Pass | Dead "No tie" button replaced by a note. Stand-down button hides once used. Speed keys and L13 steps tested. |
| F scroll and input | Mostly | The tester saw a cable drag pan the camera in L01 (not fixed). |
| G devices | Fail (gap) | No real phone, Deck or gamepad pass this layer. The Windows zip is built but not played. |
| H learnable | Mostly | The hook works (8/10). L20's briefing is long and its commit-then-start order is unclear. The Career has no onboarding. |
| I logic integrity | Pass | The stand-down "charge" the tester reported was checked in the engine: none after stand-down (they misread a report row). |
| J depth | Pass | — |
| K fun | Mostly | Fun critic: hook 8, hour-2 reason 6, juice 5, Career fun 4, overall 6. |
| L performance | Fail | 3-8 fps in the finale on the desk at load 10-19. The core request is filed. An idle-machine and real-GPU number is still owed. |
| M sound | Mostly | Catalogue and cues delivered and measured. A human listening pass is still owed. |
| N saves | Not checked | — |
| O release hygiene | Pass | Private-then-public releases built locally (v1.6.0 and v1.7.0): the Linux build is smoke-run before upload, with SHA256SUMS. The README claims only what is in the build (no macOS; Windows unplayed; core not public). |
| P status and honesty | Pass | Loaded-machine numbers labelled; untested items named. |
| Q cost and machine | Mostly | One Sonnet tester; desk stopped after use. A `pgrep -f` pattern matched my own wrapper shells once (only my own processes were stopped); matching is now on the exact Godot command line. |
| R story | Pass | No change this layer. |
| S cute | Not checked | — |
| U README, screenshots, releases | Pass | A "What's new in 1.7" strip of four shots, each read and judged. One dashboard-like Career shot was rejected. Releases for v1.6.0 and v1.7.0. |
| V where effort goes | Planned | See the order of the next layers below. |

## Scores (per tester, 0-10)
| Criterion | Sonnet fun critic (strategy-sim player) |
|---|---|
| Hook (minute 1) | 8 |
| Reason for hour 2 | 6 |
| Juice | 5 (played muted on the desk) |
| Clarity | 6 |
| Career fun | 4 |
| Overall | 6 |

## Performance numbers (all at load 10-19; an idle-machine number is still owed)
| Run | Wall | Game time | s per in-game hour | CPU (Godot + sidecar) | fps (desk, software GL) |
|---|---|---|---|---|---|
| Finale 1×, day 1 | 95 s | 8 h 45 min | 10.9 | 209 s (2.2 cores) | 5-7 |
| Finale 4×, day 1 → day 2 12:15 | 90 s | 36 h 15 min | 2.5 | 182 s (2.0 cores) | 3-8 |
| Finale 4× after the 1 Hz repaint fix | 60 s | 23 h 45 min | 2.5 | 120 s | 3-6 |

Per-frame process time stays at 280-450 ms because each tick blocks the main thread on the bridge. The repaint fix cut static paints
from about 25 to about 6 per 5 s but does not move the fps. Perf budgets (`src/perf.test.ts`): one full-suite run missed the "full day"
budget at load 15; re-run alone at load 12.9 it passed, so the floor stands.

## What works
- **The soundtrack has shape.** The spectrograms show it:
  - Night Shift's lead enters near 30 s and drops out after 165 s.
  - Low Frequency sits on a drone under a flute line.
  - The section maps differ (structure distance 0.69-0.80 between pairs), no track is under 2 minutes, and the loudness spread is 2.0 LU.
- **The 4× speed is real**: 4.4 times the 1× pace in the finale.
- **The Storm Coast loop now closes.** Warning, action and cost are each visible, and the alarm now sits on the main screen.
- **The tester's hook:** "P0 gives you one job, click the glowing breaker... Ada's line is a strong beat." L20 "is a real puzzle".

## What still fails (harsh, ranked)
1. **The finale's frame rate** on the desk (3-8 fps), from the synchronous bridge. It needs the core change.
2. **The Career is a spreadsheet for a newcomer.** The fun critic gave it 4. It has a dense first screen, no onboarding, cosmetic incident choices and idle cash with little to spend on.
3. **Nobody has listened to the audio.**
4. **L20:** an 80-word goal, and the commit-then-start order is unclear (the tester got a flat 50 Hz run).
5. **L01:** a cable drag can pan the camera; Retry is a small button.

## Gate for 1.7 → 1.8, and the order of the next layers
The owner's three directions (groups U and V) are expansion, functionality and playability. My order and why:
1. **1.8 "Pad and progress" (functionality + playability).**
   - A pad-only pass at 1280x800 with the virtual pad (under the pad lock, alone).
   - Every screen operable with focus rings and A/B.
   - Fix the Career's first-screen onboarding: a guided first year that limits choices.
   - Fix L20's briefing and order.

   The pad work goes first because it is a hard functional gap on every screen; the Career onboarding goes with it because the fun critic's lowest score was the Career.
2. **1.9 "Storylines" (playability).**
   - A Career storyline with characters, decisions that have two honest answers, and endings that recap the run.
   - An Opus single-shot story review.
3. **1.10 "New districts" (expansion).**
   - New charters, season and storm scenarios.
   - A visual theme.
4. **Then "Presence".** The game-like site at grid.blackmetal.tech and the generated wiki.

Gate for 1.8:
| # | Item | Acceptance |
|---|---|---|
| 1 | Pad-only pass at 1280x800: title, every chapter's panel, the work order, the shift report, the Career board, sheets and drawers | Shots per screen with a visible focus ring; A acts, B backs out; no screen needs the mouse |
| 2 | Career onboarding | A fresh tester knows what to do in quarter 1 within 5 s; incident choices are real choices |
| 3 | L20 briefing and order | A fresh tester gets the duck-curve puzzle on the first run |
| 4 | Carried: a human listening pass; an idle-machine fps number; the core async-tick request | Stated as met or owed |
