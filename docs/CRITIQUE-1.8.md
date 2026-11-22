# CRITIQUE 1.8: "Pad and progress" (2026-11-22)

**Tested against** the gate in [CRITIQUE-1.7.md](CRITIQUE-1.7.md), by the Opus iterator on the desk:
- the finale profiled on the desk (draw calls, bridge time, repaint and refresh counters);
- `tests/ticker_flow.gd`;
- nine scripted pad tours at 1280x800, run in the game window with `CB_PADSEQ`: title, jobs, work order, P0 to the shift report, the finale's build kit and tray, L13, L20, L25, L33, the pause menu, the Career entry and board.

**What was not run:**
- No fun-critic tester ran this layer. The coordinator held helpers back while load was above 12, and it stayed between 12 and 39 all session because of another session's jobs.
- So "a fresh tester knows what to do" is **not yet tested by a fresh tester** (see the gate).

**Timings:** every timing here is from a loaded machine. The load is stated beside each one.

**Layer order (why pad and progress first):**
- The 1.7 audit had two hard functional failures: G (no gamepad pass) and L (finale fps).
- The fun critic's lowest score was the Career.

All three are functionality and playability, so they come before story (1.9) and expansion (1.10).

## The gate
| Gate item (from CRITIQUE-1.7) | Result |
|---|---|
| 1. Pad-only pass at 1280x800: every screen, a visible focus ring, A acts, B backs out, no screen needs the mouse | **Met, with the scripted pad. No physical pad.** Every screen and action was reached with pad events alone; the logs show focus after each press (`QA_PAD A focus=...`), and the shots are in `.qa/grid/pad18/` on the QA machine. Found and fixed:<ul><li>The exam number boxes could not be filled with a pad. An on-screen number pad now opens on A.</li><li>The Career map needed a pointer. LB/RB now walk it.</li><li>The hint strip said "LB/RB drawers". It now names GRID's buttons.</li><li>The tray said "Click".</li><li>The paper focus ring was nearly invisible.</li><li>The Career lost focus after every action.</li></ul>Still rough:<ul><li>On the shift report, UP from Retry does not return to Next (LEFT/RIGHT does).</li><li>After Start on a worst-asset row the focus goes to End quarter, because the row becomes a placeholder.</li></ul> |
| 2. Career onboarding: a fresh tester knows what to do in quarter 1 within 5 s; incident choices are real choices | **Built, not yet tested by a fresh tester.**<ul><li>Quarter 1 shows one numbered job: the weakest asset picked on the map, its Start row, then End quarter. The other tools open over the year.</li><li>Incident choices were not reworked this layer: still owed.</li><li>The guide's asset is the third row of its card (the substation plant rows come first). A tester may look at the wrong row.</li></ul> |
| 3. L20 briefing and order | **Built, not yet tested by a fresh tester.**<ul><li>The brief is 45 words with the order.</li><li>The coach's first step is the build ("First build, then run. 1: ... 2: order each peaker on ... 3: run").</li><li>The card's "tap it, press Start" is gone.</li></ul> |
| 4. Carried: the listening pass, an idle-machine fps number, the core async-tick request | <ul><li>**Listening pass:** still owed.</li><li>**Idle-machine fps:** still owed (load never fell below 12).</li><li>**Async tick:** **done in GRID**, with one core change (a bridge mutex, core 54ef457). It was smoked against equilibrium, lenscraft and loadpath (SMOKE OK). The node-circuits headless smoke times out with and without the change, so the hang predates it.</li></ul> |

## The finale, measured (desk, software GL, 2424x1080; load beside each number)
| State | 1.7 | 1.8 |
|---|---|---|
| Draw calls a frame (L28) | 22,398 | 2,111 |
| Paused frame | 156 ms, 7 fps (load 19) | 56 ms, 21 fps (load 19.6) |
| Running at 4×, fps | 3-8 (load 10-19) | 13-20 (load 17-22, 02:26-02:29); 6-9 (load 31-39, 03:00; another session's burst) |
| Frames that waited on a tick | every tick | none (ticker_flow counts main-thread tick requests: 0) |
| Map rebuilds per 5 s at 4× | ~13 (one per tick, from the house count) | 0 |
| Static repaints per 5 s at 4× | 6-9 | 0-4 (at dusk) |
| Ticks per 5 s at 4× | — | 14-16 (the full 4× rate) |

What remains:
- **UI refresh after each tick** takes 0.3-0.7 s of every 5 s (the world model and chrome rebuild in GDScript).
- **The software renderer** costs the rest.
- **On a real GPU** the 2,111 draw calls are cheap, but nobody has measured one.

**Verdict:** the defect that made the finale a slideshow (each tick blocking a frame, plus a full map rebuild per tick) is fixed and
tested by count, not by clock. What is left is ordinary GDScript cost that a loaded software-GL desk exaggerates.

## Owner-concerns audit (games-bible 05)
| Group | Pass/Fail | Evidence |
|---|---|---|
| A game, not SaaS | Mostly | The Career's first quarter is now one job, not ~20 panels. The full board from quarter 4 is still dense. |
| B own soul | Pass | No change; the number pad uses the night-ink and sodium palette. |
| C realism | Pass | Text truth test green. The L20 brief's numbers are unchanged (still pinned by tests). |
| D readability | Mostly | L20's brief is shorter. The Career guide's step 2 points at a row that is third in its card. |
| E every control works | Pass (pad) | Every control was reached by pad, and the number boxes now work by pad. Two focus rough spots are listed in gate 1. |
| F scroll and input | Mostly | The L01 cable-drag-pans-camera report from 1.7 was not re-checked. |
| G devices | Mostly | A pad pass at 1280x800 with scripted events. **Still owed:** a physical pad, a Deck, a real phone, Windows play. |
| H learnable | Mostly | The Career's first quarter and L20 are guided. Neither has been tested by a fresh tester (owed). |
| I logic integrity | Pass | Engine untouched apart from L20's coach order; all 1505 engine tests pass. |
| J depth | Pass | No change. |
| K fun | Not measured | No fun-critic this layer (load). Carried. |
| L performance | Mostly | Finale numbers in the table above. Real-GPU and idle-machine numbers are owed. |
| M sound | Mostly | Unchanged. A human listening pass is still owed. |
| N saves | Not checked | — |
| O release hygiene | Pass | v1.8.0 built locally, Linux smoke-run headless before upload, SHA256SUMS. CI no longer publishes over a local release. |
| P status and honesty | Pass | Loaded numbers labelled; the scripted pad is called scripted. |
| Q cost and machine | Pass | No helpers (load). One Godot at a time. Processes stopped by exact PID. |
| R story | Pass | No change this layer (1.9 is the story layer). |
| S cute | Not checked | — |
| U README, screenshots, releases | Pass | "What's new in 1.8" strip of four shots, each read: the Career guide, the number pad at 1280x800, L20's build-first coach, the finale at 4× on Day 2. |
| V where effort goes | Planned | See below. |

## Scores
No tester this layer. The 1.7 fun-critic scores stand (hook 8, hour-2 reason 6, juice 5, clarity 6, Career fun 4, overall 6) until a
tester replays the Career's first year and L20.

## What works
- **The finale moves.** At 4× it keeps the full tick rate (14-16 ticks per 5 s), and no frame waits on the engine.
- **A pad reaches everything.** That includes the exam predictions, which a pad could not answer before.
- **The Career's quarter 1 is one sentence long:** "Your weakest asset is F6.4: it is picked on the map. Press Start on its row below. Press End quarter."

## What still fails (harsh, ranked)
1. **No fresh tester** for the Career onboarding or L20. Both are built blind.
2. **Incident choices in the Career** are still mostly cosmetic (1.7 finding, not reworked).
3. **No physical pad, Deck or phone.**
4. **The finale's UI refresh per tick** (0.3-0.7 s of every 5 s on the desk) is the next performance target.
5. **No person has listened to the music.**

## Gate for 1.8 → 1.9 "Storylines"
| # | Item | Acceptance |
|---|---|---|
| 1 | A fun-critic tester on the Career's first year and L20 (when load allows) | Knows what to do in quarter 1 within 5 s; builds before running L20 on the first try |
| 2 | Career incidents become real choices with a storyline: characters, two honest answers, consequences that come back | An Opus story review reads the arc; each choice has a cost the player can see |
| 3 | Endings that recap the run | A ten-year recap names the player's own decisions |
| 4 | Carried: listening pass, idle and real-GPU fps, physical pad | Stated as met or owed |

After 1.9: 1.10 "New districts" (expansion), then "Presence" (the site and the wiki).
