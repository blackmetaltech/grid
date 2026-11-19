# CRITIQUE 1.0: GRID, the whole campaign, before the tag

Written by the Opus iterator on 2026-11-19 at the end of the rc.4 → rc.5 → 1.0 waves. It is harsh on purpose. Scores are 1-10. They are a judgement from the play-throughs below, not a panel average. The rc panel scores are in [CRITIQUE-1.0-rc.md](CRITIQUE-1.0-rc.md).

## Who played what
| Who | Surface | What | Result |
|---|---|---|---|
| Opus iterator | desk slot h, 1920×1080 | L17, L21 and L28 replayed to a win through the UI; L08, L16 and L20 retested after fixes | L17 3 lamps, L21 2, L28 3, L20 3 (after the rc.5 fixes) |
| Opus iterator | desk slot h, 2424×1080 phone layout | chapters 5-7 and L28 checked for clipping; L28 played to a 3-lamp win ($53.7M) and the game-end card | fixed: L28 card off-screen, ch7 panel overflow |
| Sonnet tester 1 (first-year persona) | desk slot h, 1920×1080 | L02, L05, L08, L12, L16, L20, L24 | 6 of 7 won (2 lamps each); L20 blocked by the tray (fixed in rc.5) |
| Sonnet tester 2 (std-9 student) | desk slot h, 1920×1080 | L03, L06, L09, L11, L15, L20, L23, L28 | 7 of 8 won (L03, L06, L15, L28 with 3 lamps); L20 not won: peakers bought at 20 MW and never ordered on, and Remove took a coal unit. Fixed, then re-smoked by a fresh std-9 tester: L20 won (1 lamp, attempt 3) and L11 won (2 lamps); no blocker |
| vitest | engine | 53 files | 1204 / 1204 |
| Godot runner | headless | 21 flow and truth tests and the UI smoke + paper flow | 22 / 22 |

Not done: a real phone, a gamepad, Windows or macOS, a human player, or one save played from the prologue to the finale.

## Scores
| Criterion | Score | Why |
|---|---|---|
| Physics fidelity | **8** | AC load flow (NR, GS, continuation), MNA bench, swing-equation frequency window with governors and UFLS, IEC relay curves, sag and clearance, harmonics. Oracle-checked. It loses points for the 15-minute quasi-static day and the 100 Mvar module abstraction of SVC/STATCOM. |
| Teaching: does the level teach its idea? | **6.5** | The best levels (L01-L03, L08, L16, L20, L28) make you fail with the real mechanism and name it with your own numbers. Several levels can still be won with one click and no understanding: tester 1 won L12 with the AVR at 1.05 pu for $0. Third lamps rarely say what to change. |
| Clarity for a std-9 player | **5.5** | A std-9 tester won 7 of 8 levels from the game's own text, which is better than expected. But they lost attempts to things the game never says: where a bus is on the isometric map (clicking the bus name does nothing, only the peg below it), that a second click on a tray cell cancels it, that a series capacitor goes on a small spot under the line, that capacitors are on all day unless you switch them, and why the work order speaks kV while the report speaks pu. L20 needed six peakers and three attempts. |
| UI and controls | **6** | Trays, tags, the lever and the reports are consistent across chapters. But the controls needed fixes this wave that a first-time player hits at once: a gas unit could not be placed from the tray, the remove rows had no labels, parts were hidden behind a bare ›, knobs looked dead at their ends, and the shift report covered the controls. Each chapter has its own bespoke panel (ch2-ch7, chf), so behaviour is uneven between them. |
| Layout robustness | **6** | Desktop 1920×1080 is solid. The phone layout was only checked on a desktop window, and it fits only through per-chapter scaling hacks (ch4 and ch7 draw a 660 px panel scaled down). 1280×720 and 1366×768 were not re-checked this wave. |
| Charm | **6.5** | The lit-window diorama, paper work orders and the radio cast carry it. Cute mode is decorative. Sound is functional, not composed. |
| Long-term play | **3** | Thirty one-shot jobs. The island network persists within chapter 2 (L29, L30), but nowhere else. There is no district that ages, no demand growth across jobs, no maintenance and no career. Replay value is the third lamp and the cost histogram. |
| Depth to "employable" | **4** | See below. |
| Engineering quality | **7.5** | Deterministic engine, goldens, oracles, naive/reference builds per level, string lint, 22 Godot steps. Still: two bridges between UI and engine argument orders (the placeUnit bug lived since chapter 6 shipped, because no UI test placed a unit from the tray), and the GDScript chapter panels are large files with duplicated layout logic. |
| **Overall** | **6** | A real, honest power-systems game that can be finished. It is not yet a game people return to, and it stops short of the job. |

## What works
- The physics is the rule set. A brownout, a resonance, a loop overload, a nose-curve collapse, a dusk frequency dip and a mis-graded relay all fail with the real mechanism, in the world, and the report names it with the player's numbers.
- Every level has a naive build that must fail and a reference that must pass, in the test suite. A rule change that makes a level trivial or impossible fails CI.
- The finale ties the course together: three days, taps, capacitors, reserve and an island N-1, and it can be won by clicks on desktop and on the phone layout.
- Retry keeps the build in every chapter, so a failure costs one click, not a rebuild.

## What fails
- **Discoverability.** Three blockers this wave were plain UI faults that a test with a real click would have caught on day one (tray argument order, unlabeled remove rows, hidden parts). The Godot suite tests panels through their functions more than through clicks.
- **One-click levels.** L12 (AVR at 1.05 pu for $0), L23 and L27 (the prediction lamp is invisible) and the exam bridges with nothing to buy have second and third lamps that do not ask for more understanding.
- **Third lamps without a pointer.** A player who passes rarely learns what the third lamp wants (L02 voltages, L05 cost, L12 angle, L16 N-1).
- **Numbers that disagree on screen.** Tester 1 saw the L16 report give the worst loading as 73 % while the control room showed 64 % (a different moment of the day, not labelled).
- **The phone.** Never played on a phone for this release.
- **Speed knob.** It wraps 1× → 2× → 4× → 1×, so a repeated click can land on 1×.

## Gaps to "employable" (docs/design/DEPTH.md, rungs R3-R6)
| Rung | What a junior engineer needs | In 1.0 | Missing |
|---|---|---|---|
| R3 line design | conductor by ampacity and mechanics, sag and clearance, supports by span and angle, insulation by creepage, earthing, cables | route survey, pole families, spans, sag/clearance, salt and insulators, a sea cable | line angle classes, earthing and shield wire, cable charging current as a design choice, foundations on bad ground |
| R4 B.Tech | compensation, per unit, taps/OLTC, three-phase, load flow, coordination, fault levels, **substation bus schemes** | all but bus schemes | substations (bus schemes, bays, breaker-and-a-half), distance protection beyond zones, earth faults |
| R5 GATE | frequency control, inertia, droop, UFLS, stability, economic dispatch, N-1 | all, at one-machine or one-island scale | multi-machine transient stability, security-constrained dispatch, a week of unit commitment |
| R6 junior planner | run a district for years: forecast, reinforcement plan, maintenance, reliability indices, compliance | none | district play across jobs, SAIDI/SAIFI, demand growth, ageing and maintenance outages, a planning report |

Until R6 exists, GRID teaches the ideas a junior engineer uses but not the job itself.

## Open after 1.0
| # | Sev | Finding | Source |
|---|---|---|---|
| 1 | major | Clicking a bus's name label does not pick the bus; only the peg below it does (L20, L09). | std-9 testers |
| 2 | major | A second click on a tray cell cancels it with no clear cue; placements after that go nowhere. | both std-9 testers |
| 3 | major | L09: the series capacitor lands only on a small area under the line; clicking the visible wires does nothing. | std-9 tester |
| 4 | major | L15: a capacitor bank is on all day and the game does not say to switch it (the Automatic row on its tag). | std-9 tester |
| 5 | major | After an incident the tools stay locked until you pause and use the pin; a second briefing and a reset step counter confuse the retry. | std-9 tester |
| 6 | major | One-click wins: L12 (AVR 1.05 pu, $0); third lamps on L23, L27 and the exam bridges ask for nothing new. | tester 1, rc critique |
| 7 | minor | L16 report's worst loading (73 %) and the control room's (64 %) are different moments, not labelled. | tester 1 |
| 8 | minor | The speed dial wraps 1× → 2× → 4× → 1×; one tester saw it read 2× with 4× lit. | both testers |
| 9 | minor | L20: the step counter jumped from step 1 to step 4 mid-run; the Size tile reads 20 MW until a gas unit is armed. | std-9 re-smoke |
| 10 | minor | L11: cans step by 5 (right-click for 1 is not shown); a chip needed a second click once. | std-9 re-smoke |
| 11 | gap | No phone, pad, Windows or macOS pass; no single save played start to finish. | — |
