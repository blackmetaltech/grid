# CRITIQUE 1.6: GRID "Truth Pass", before the tag

Written by the Opus iterator on 2026-11-21 at the end of the 1.6 wave. The wave was driven by [CRITIQUE-1.5.md](CRITIQUE-1.5.md):
- a regression pass on the levels not re-played since 1.0;
- the text mismatches, and a test so they cannot come back;
- Storm Coast's passive player;
- the speed dial.

It is harsh on purpose. Scores are 1-10.

## The gate
| Gate item (from CRITIQUE-1.5) | Result |
|---|---|
| Regression coverage for L13, L27, L36 and the finale's days 2-3 by a fresh tester; fix findings | **Met.** All four passed for a first-time tester; 0 SCRIPT ERROR. Two majors fixed (L27 Retry lost predictions and design; the L27 breaker could not be derived). Minors listed under "What fails". |
| L07 card versus debrief power; L19 coach time versus brief; L23 text under the report | **Met.** All three fixed; L19's real cause was the place line (20:00 for a 16:00 start). |
| A test that every number a brief, coach line or debrief quotes comes from the engine | **Mostly met.** `src/level/text-truth.test.ts` checks every time and quantity in static text and debrief literals, over 37 levels × 2 packs, with a control case. It found 4 more mismatches. Placeholder numbers rely on each chapter's arithmetic tests instead. |
| Storm Coast passive player: an idle-cash nudge, readiness running cost, stand-down after a settled forecast | **Met in the engine and on screen** (a desk shot of the quarter report shows the nudge). **Not re-played** by a tester. |
| Speed dial a bigger target | **Met.** Three keys, each about 60 px square; the 4× key checked on the desk. |
| CHANGELOG, CRITIQUE-1.6, README, tag v1.6.0 | **Met** with this tag. |

**Verdict:** every 1.5 gate item is closed in code with tests. The honest gap is that no tester has played Storm Coast with the nudge yet, and no human has played this build.

## Owner-concerns audit (games-bible 05)
| Group | Pass/Fail | Evidence |
|---|---|---|
| A game, not SaaS | Pass (Career mostly) | Levels keep the grid world on screen, with panels as drawers. The Career's board is a drawer over the district map, but it is the most dashboard-like screen in the game. |
| B own soul | Pass | Night-grid sodium palette, knife-switch breaker and paper sheets; nothing shared with another game except core plumbing. |
| C realism | Pass | Every number comes from the engine, and the text truth test now holds static text to it. The map art is schematic, not photographic. |
| D readability | Mostly | L13's status line overlaps itself (tester shot 143614). |
| E every control works | Mostly | Retry now rebuilds chapter 7 designs and predictions; the speed keys are tested in hud_flow. L27's dispatch sum stays stale until blur. |
| F scroll and input | Not checked this layer | No scroll work this layer. |
| G devices | Fail (gap) | Phone layout checked on a desktop window only. No real phone, Deck, Windows or macOS pass. |
| H learnable | Pass | A first-time tester passed all four exams with the coach. The tester could not size L27's breaker; the givens now make it derivable. |
| I logic integrity | Pass | Text truth test; Retry design round-trip tests for chapters 5 and 7. |
| J depth | Pass | Storm plans, regulator, charters; L27 now uses sequence impedances. |
| K fun | Not measured | No fun-critic tester this layer. |
| L performance | Fail | The finale looked frozen at 4× for minutes under load (software GL); no idle fps measurement. |
| M sound | Fail | Functional, not finished; nobody listened this layer. |
| N saves | Not checked | Career codes replay (tests); no save/quit pass this layer. |
| O release hygiene | Pass | CHANGELOG [1.6.0]; vitest 1503/1503, Godot 23/23, build:verify, scores suite 1358/1358 before the tag. |
| P status and honesty | Pass | Untested items named here. |
| Q cost and machine | Pass | One Sonnet tester, one desk at a time, processes stopped by PID, desk slot stopped. |
| R story | Pass | ADA, TOBI and VANCE carry every level; the Career has endings and reviews. |
| S cute | Not checked | No cute-mode change this layer. |

## Scores (per tester, 0-10)
| Criterion | Sonnet regression tester (EE graduate) |
|---|---|
| Brief → goal | 8 |
| Win from in-game guidance | 8 (all four passed; L27 took 4 runs) |
| Teaching | 8 |
| Feedback truth | 6 before fixes (L27 Retry, unreconciled fault kA), fixed in 1.6 |
| Fun | not asked |
| Polish | 7 |
| Level scores | L13 8, L27 6, L36 8, L28 8 |

## Who played what
| Who | Surface | What | Result |
|---|---|---|---|
| Sonnet tester (EE graduate preparing for a grid-operator interview; first time in GRID) | desk slot h, 2424×1080 desktop, load average 30-90 from other jobs | L13, L27, L36, and the finale (L28) through day 3 | All four passed: L13 first try (2 lamps), L27 in 4 runs (3 lamps), L36 first try (3 lamps), L28 first try (2 lamps). 0 SCRIPT ERROR. Scores: L13 8, L27 6, L36 8, L28 8. |
| Opus iterator | desk slot h | L27's givens card and the new speed keys; a Storm Coast quarter report | The board's Z1/Z2/Z0 line reads in full; the 4× key picks 4×; the nudge names $3.3M free against SAIDI heading for 823 min against 592 |
| Text truth test | engine | every level in both packs, with the lesson build replayed | Found 4 real mismatches the testers had not (see below); a control case checks that invented numbers are caught |
| vitest / Godot runner / cobanana-scores | engine / headless / server | see the README's Status | all pass |

Not done:
- A real phone, a gamepad, Windows or macOS.
- A human player.
- A public scores host (the owner's decision). Bundles 1.4.0, 1.5.0 and 1.6.0 are committed locally in cobanana-scores and not pushed.
- A second Storm Coast playtest with the nudge in place.

## What changed, and what it measured
- **Text truth.** A new test reads every clock time and every quantity in every level's brief, place line, story, coach, "why?" and debrief templates, and checks it against the engine:
  - times against the level's start and end, its scripted events, every `*Block` field, and the blocks where the load steps;
  - quantities against state, levelInfo and the chapter data tables, to the printed precision.

  It found what three testers had not:
  - L19's coach said "run the shift to 22:30" for a shift that ends at 21:30.
  - The finale's debrief printed the 49.90-50.05 Hz band in the `global` pack, whose band is 49.95-50.05 Hz.
  - The finale's "about 760 MVAr" was a typed number; it is now computed (763 MVAr).
  - L19's place line said 20:00 for a shift starting at 16:00, which was the real cause of 1.5's "coach stamp 16:00 against a brief that says 20:00".

  A control case asserts that four invented numbers are all caught.
- **The three 1.5 mismatches are closed.**
  - L07 names both powers: the loads' P (the debrief's 1.70 MW) and the supply point's P that the card shows, with the losses between them.
  - L19's place and brief give both times.
  - L23's result no longer sits under the prediction box.
- **The regression pass found a real bug, again in Retry.** L27's Retry kept the prediction boxes' text but not the predictions, so the report said "0 of 0 predictions". It also silently reset the dispatch and the breaker. `controlDesign` now rebuilds every chapter 7 design and the player's predictions, with a test for L23, L26 and L27.
- **L27's breaker could not be sized from the givens.** The tester rated 25 kA, failed, and then saw 41.8 kA in the report with no way to have derived it. The givens now carry the grown board's Z1, Z2, Z0 and I_b, and a test checks that I_b / Z1 and 3 I_b / (Z1 + Z2 + Z0) give the board's 3-phase and SLG currents to within 1 % and 3 %.
- **Storm Coast's passive player.** With cash idle and SAIDI heading past target, the quarter report now says how much is free and what readiness level 1 (cost, -30 % storm minutes) or hardening (cost, -60 % storm faults) would buy. Readiness shows its running cost and its total so far, and after a settled forecast a button stands it down. Tests:
  - a passive Storm Coast career is nudged (seed 3, after quarter 1);
  - standard-charter careers are never nudged;
  - the stand-down offer appears exactly when the forecast is calm and readiness is booked.
- **Speed dial.** Three full-width keys, each about 60 px square, replace a knob with 16 px notches.

## Scores
| Criterion | 1.5 | 1.6 | Why |
|---|---|---|---|
| Physics fidelity | 8.5 | **8.5** | The finale's band and line charging now come from the pack and the line data. |
| Teaching | 8 | **8** | L27's breaker can now be worked out. L07 shows where 0.15 MW went. |
| Clarity for a newcomer | 7.5 | **8** | Every quoted time and quantity is checked against the engine. The finale's dips versus band violations are explained. |
| UI and controls | 7.5 | **7.5** | The speed keys are a real target and Retry keeps chapter 7. L13's status line and slider are still fiddly (below). |
| Layout robustness | 6 | **6** | — |
| Charm | 6.5 | **6.5** | — |
| Long-term play | 8 | **8** | Storm Coast now tells a passive player what to do. Not yet re-played. |
| Depth to "employable" | 8 | **8** | — |
| Engineering quality | 8 | **8.5** | A text truth test over all 37 levels × 2 packs, with a control case; Retry covers chapter 7. |
| **Overall** | 7.5 | **7.5-8** | All four long-untested exams pass for a first-time player, and the text now cannot drift from the engine unnoticed. |

## What fails
- **L13's controls.**
  - The status line overlaps itself ("press Run-the-night" over "night Q -0.2").
  - The excitation slider ignores arrow keys and the + button barely moves it.
  - The third lamp needs Q within ±0.002 pu, which the slider can barely hit.
- **Exam result cards on no-build levels** (L13) still show "Cost $0", "Line loss 0 %" and a build-cost histogram.
- **L27's dispatch sum** ("1090 of 1000 MW") stays stale until the box loses focus.
- **The finale's ticker** names day 2's tripped elements by ID (T27, U1, U5) rather than by name.
- **The finale on a loaded machine** still looks frozen at 4× for minutes (software GL under load average 30+). It has not been measured on an idle machine.
- **The text truth test covers static text and debrief literals.** Debrief numbers that arrive as placeholders are covered by each chapter's own arithmetic tests, not by this one.

## Open after 1.6
| # | Sev | Finding | Source |
|---|---|---|---|
| 1 | major | No public scores host: the weekly board is dormant in shipped builds (owner decision). | design |
| 2 | minor | L13: status line overlap; slider keyboard and + step; the third lamp's ±0.002 pu tolerance. | regression tester |
| 3 | minor | No-build exams show cost, loss and a build-cost histogram on the result card. | regression tester |
| 4 | minor | L27 dispatch sum live update; finale ticker element names. | regression tester |
| 5 | gap | Storm Coast with the nudge not yet re-played; no phone, pad, Windows or macOS; no human player. | — |

## Gate for 1.6 → 1.7: "Sound and speed"
The theme is the audit's failing groups (M sound, L performance, K fun) plus the minors carried over.
| # | Gate item | Acceptance |
|---|---|---|
| 1 | **Sound someone listened to.** A cue per interaction (breaker, speed keys, project start, quarter end, trip, blackout), money cues in the Career, and at least three long, varied ambient tracks. | A listening note in CRITIQUE-1.7 written by an agent that played the WAVs; a cue list with no missing interactions. |
| 2 | **The finale at 4× on an idle machine.** Measure fps and the sim's wall time per in-game hour. Fix anything under 30 fps or slower than about 20 s per in-game hour. | Numbers in CRITIQUE-1.7, measured with load average under 4. |
| 3 | **A fun-critic tester** plays chapter 1, one mid-campaign level and two Career years: is there a hook in minute 1 and a reason for hour 2? | Their verdict and scores in CRITIQUE-1.7; the top finding fixed. |
| 4 | **Storm Coast re-played** with the nudge by a fresh tester. | Licence kept or lost knowingly; the tester quotes the nudge. |
| 5 | L13's status-line overlap; excitation slider keyboard and + step; the third lamp's ±0.002 pu tolerance. | Shots before and after; the lamp reachable with the slider. |
| 6 | No-build exams drop cost, loss and the build-cost histogram from the result card; L27's live dispatch sum; the finale ticker names elements. | Shots. |

