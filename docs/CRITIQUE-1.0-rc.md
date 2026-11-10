# CRITIQUE 1.0-rc: the whole campaign (chapters 2-7 and the finale)

The pass before tagging v1.0.0-rc.1, run overnight on 2026-11-10/11. Every chapter was built in parallel by Sonnet builders, then went through two playtest and fix waves (Haiku scorer panels, with Opus verifying). Scores are 1-10 means over three personas: a novice aged 15, a first-year EE student and a junior grid engineer. Each persona scored clarity, physics, charm and would-play-next from screenshots.

## Who looked
| Tester | Surface | Resolution | What | Status |
|---|---|---|---|---|
| Haiku panel A | screenshots | 1600×900 | ch3-4 and ch6-7 opening screens | done, before fix wave 1 |
| Haiku panel B | screenshots | 1600×900 | L30 Island Home | done (5.5), fix wave c16f2cc |
| Haiku panel C | screenshots | 1600×900 | ch5 (L14-L18) and the finale (L28, its report) | done, before fix wave 2 |
| Haiku panel D | screenshots | 1600×900 | ch3, ch4, ch6, ch7 opening screens | done, after fix wave 1 |
| Haiku panel E | screenshots | 1600×900 | L08, L10-L28 opening screens | done, after fix wave 2 |
| builders | desk harness / shot1 | 1366×768, 1600×900 | each chapter played through its own flow test | done |
| Opus | vitest full suite, Godot suite, shots | — | integration, HEAD verification | done |
| Pixel 9a / pad | device | — | — | **not run**: no device attached overnight |

## Scores
| Chapter | Before fix wave 1 | After fix wave 1 | After fix wave 2 | Notes |
|---|---|---|---|---|
| ch3 Phasors and power factor (L07-L09) | 4.8 (ch3+4) | **6.4** | 7.25 (L08 only) | L08 lowest (5.9): THD and the "plain" reactor not explained before Run |
| ch4 Three-phase and machines (L10-L13) | 4.8 (ch3+4) | **6.0** | 6.56 | L13 5.3 (blank phasor panel until the slider moved), fixed in wave 2 (6b5f894) |
| ch5 Load flow and voltage (L14-L18) | — | **6.4** | 6.75 | L17 5.8, L18 6.1; wave 2 c909119, ae76071 |
| ch6 Frequency and renewables (L19-L22) | 4.2 (ch6+7) | **6.4** (L19, L20 only) | 6.94 (all four) | wave 2 76cb011 |
| ch7 Protection and markets (L23-L27) | 4.2 (ch6+7) | **5.8** | 6.20 | L27 5.3 (the formula card was empty until clicked); wave 2 2632f69 |
| Finale L28 | — | **7.1** | 7.0 | highest-scoring screen of the night |
| L30 Island Home | — | 5.5 | — | fix wave c16f2cc |

Overall mean: 4.2-4.8 → 6.1-6.6 → **6.65** (panel E, 20 levels). Fix wave 3 (layout: L12, L13, L22, L26, L27, 1c64975 6ce7220 18716fc) landed after panel E and has not been re-scored.
Lowest after wave 2: L27 5.25, L13 5.75, L18 6.0, L22 6.0, L23 6.0, the exam bridges and the fault-level level.

## Findings and status
| # | Sev | Source | Finding | Status |
|---|---|---|---|---|
| 1 | blocker | Opus | Partial staging by parallel builders left HEAD broken several times: hunks landed in the wrong functions, an import was dropped, and the shared index swept stale files into a commit. | **Fixed**: integration commit f446428. Every builder now commits through a private `GIT_INDEX_FILE` on top of HEAD. |
| 2 | blocker | full vitest | 11 failures at HEAD after the chapter merge: dmath violations in ch3/5/7 and the finale, the pipeline and palette contracts, verify.ts' import graph (JSON data, prose in comments), L23/L25/L26/L27 two-action wins, the L19 coach, the L24 and L27 star targets. | **Fixed**: b2f4656, 49db0cd, 3397daa, 76cb011, 2632f69. |
| 3 | major | Godot suite | ch2-ch6 flow tests were reported FAIL although they print `CHn-FLOW OK`: the runner's tag regex had no digits, which is why chapter 7's tag was spelled CHSEVEN. | **Fixed** 5d19416; 20/20 Godot tests pass. |
| 4 | major | panel C | Before the first solve every town read "B3 dark". | **Fixed** bf41aab: the world query carries `solved`, and an unsolved town shows its name only. |
| 5 | major | panel C | A Day 1 failure on L28 printed the Day 2 storm sentence ("cost 0.0 MWh, dipped 0 times"). | **Fixed** de07772. |
| 6 | major | panel C | The L28 hint says "raise the tap setpoint", but there is no visible control. | **Fixed** 3397daa: the hint names the transformer tag's Hold stepper. |
| 7 | major | Opus | L28 in the `in` pack cannot earn the third lamp. The IEGC's first UFLS stage is 49.4 Hz, and losing the 660 MW unit from a 2.3 GW islanded state leaves the nadir near 49.33 Hz with every unit spun. | **Open (design call)**: model the All-India interconnection, or make the `in` Day-2 trip a smaller unit. Named in CHANGELOG and as a test known-gap (584d8fc). |
| 8 | major | panels A, D | Jargon with no gloss: RoCoF, THD, pu, X_s, pickup, TMS, CT, lambda, zone 1/2. | **Fixed** across waves 1-2: one-line glosses on every chapter card. |
| 9 | minor | panels C, D | Shared chrome covers level content: the budget tag over the L17 B3 label and the L24 readout, and the clock over L10's panel title. | **Fixed** per level: the L17 layout flipped, the L24 readout moved, the L10 panel moved. The chrome itself is unchanged. |
| 10 | minor | ch7 builder | The shift report showed "Cost $0" and "Line loss" on score levels (L24, L26, L27). | **Fixed**: a score level with nothing spent shows neither row. |
| 11 | minor | panel C | L28 labels pile up around the capital (400/220/132 kV buses). | Open. |
| 12 | minor | ch7 builder | The third lamp on L23 and L27 does not show the prediction condition. | Open. |
| 13 | minor | builders | L15, L16 and L21/L22 were not played to a win in the UI; their flow tests pass headless. | Open. |
| 14 | polish | panel D | The L08 spectrum "no bank" bar does not state the goal. | Open. |

## What was not checked
- No phone or pad pass on chapters 3-7 and the finale (no device attached).
- Fix wave 3 screens have not been re-scored by a panel.
- One `Invalid polygon data, triangulation failed` error is logged on L28 load (non-fatal; probably a zero-area world polygon).
- Exam bridges with nothing to buy (L13, L22) show two identical "Done well" lamps: the second and third lamps have no distinct condition.
- No human-paced end-to-end playthrough of the campaign in one save.
