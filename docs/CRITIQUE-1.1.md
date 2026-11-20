# CRITIQUE 1.1: GRID "Employable", before the tag

Written by the Opus iterator on 2026-11-20 at the end of the 1.1 wave (rc.1 → rc.3 → 1.1.0). It is harsh on purpose. Scores are 1-10 and are a judgement from the play-throughs below. The 1.0 review is [CRITIQUE-1.0.md](CRITIQUE-1.0.md); the plan this wave followed is [DESIGN-1.1.md](DESIGN-1.1.md).

## Who played what
| Who | Surface | What | Result |
|---|---|---|---|
| Sonnet builder U1 | desk slot h, 1920×1080 and 2424×1080 phone layout | L31-L36 through the new chapter 8 panels | all six won (L31 2 lamps, L32-L35 3, L36 with the "why" card right) |
| Sonnet builder U2 | desk slot h, 1920×1080 | two full ten-year careers through the Career UI | the first lost its licence in year 7 (score −675); the second ended as Chief Engineer, targets met 10 of 10 years (score 819) |
| Sonnet tester (first-year graduate persona) | desk slot h, 1920×1080 and the phone layout | L31-L36 cold, then a Career for 16 quarters | 6 of 6 won on the first attempt (L31 2 lamps, L32 1, L33 2, L34 3, L35 1, L36 3); Career at year 5 Q1 with 4 of 4 years met |
| Opus iterator | desk slot h | L12 one-lamp check, L34 and L36 work orders after the lamp fix, README shots | — |
| Career persona sweep | engine | idle, firefighter, gold-plater, planner on 50 seeds | planner beats firefighter on 48 seeds and the firefighter beats idle on all 50; the gold-plater is never Chief Engineer |
| vitest / Godot runner | engine / headless | see the Status section of the README | all pass |

Not done: a real phone, a gamepad, Windows or macOS, a human player, or one save played from the prologue to the finale.

## Scores
| Criterion | 1.0 | 1.1 | Why |
|---|---|---|---|
| Physics fidelity | 8 | **8.5** | Chapter 8 adds a backward-forward sweep radial load flow (cross-checked against Newton-Raphson), IEEE 1366 reliability by FMEA, IEEE C37.112 recloser and fuse curves, IEC 60076-7 transformer hot-spot and ageing, and PV hosting with volt-var and OLTC line-drop compensation. Each has an independent Python oracle. Career ageing is Weibull. |
| Teaching | 6.5 | **7** | L12 is no longer a one-click two-lamp win. Each chapter 8 level fails with the real mechanism and its report used the tester's own numbers (L36 matched the tester's hand calculation). The tester still lost lamps to conditions the work order did not name until this wave's last fix (losses on L31, the fuse margin on L33, life lost on L34). |
| Clarity for a newcomer | 5.5 | **6** | A first-year graduate won all six chapter 8 levels on the first attempt from the game's own text. But they could not tell that the Career's SAIDI bar is a cap, the L32 brief quoted 260 min against a 275 min rule (fixed), and L35's second lamp asks for "bought ≥ 1", which the tester never decoded. |
| UI and controls | 6 | **6.5** | Chapter 8 and the Career have proper panels, cards and paper sheets, and the Career board's "why this helps" line helped the tester decide. Chapter 8's phone stage is a canvas you pan: the coach card and panel cover the lower half of L31, L33 and L34 until you drag. |
| Layout robustness | 6 | **6** | Desktop is solid. The phone layout is still checked only on a desktop window. Career labels F5/F6/F7 crowd at phone size. |
| Charm | 6.5 | **6.5** | The thermometer face on L34 and the Career's paper reviews are good. Nothing new in sound. |
| Long-term play | 3 | **5.5** | A ten-year Career with ageing, growth, storms, connection requests, three reviewers and four endings, replayable from a code. It is thin after year 4 (see below). |
| Depth to "employable" | 4 | **6** | Rung R6 (junior planner) now exists at district scale: reliability indices, reinforcement, maintenance, ageing, compliance. Still missing: substation bus schemes, earth faults, a written planning report. |
| Engineering quality | 7.5 | **7.5** | Oracles for every new formula, naive/lesson/reference builds per level, a persona sweep, 23 Godot steps. Against it: two bridges between levelInfo and the lamp texts again let a level's real star condition go unstated, and chapter panels are still bespoke GDScript per level. |
| **Overall** | 6 | **6.5** | Chapter 8 is the best-taught chapter in the game. The Career is real but too easy to coast in after year 4. |

## What works
- **Chapter 8 teaches the job.** Voltage drop, outage arithmetic, fuse saving, firm capacity and hosting are what a junior distribution engineer does in year one. Each level has a study screen that moves as you change the design, and the report repeats the lesson in the player's numbers.
- **The Career is deterministic and honest about luck.** Expected SAIDI is shown beside the realised one, and over 30 seeds the planner's realised/expected ratio is 0.99 (SAIFI 1.05), so the shown expectation is not a lie.
- **The board explains itself.** Each card gives the change in expected SAIDI, loading or firm margin. From this wave, a transformer or switchboard card gives its chance of failing in the next year, old against new, because expected SAIDI cannot see plant failures.
- **Retry keeps the coach.** The coach carries on at the step the last attempt reached.

## What fails
- **Career targets go slack after year 4.** Targets start 10 % below the day-one expected SAIDI and tighten only 1.5 %/yr. A planner ends at about 150 min against a 411 min target, so the incentive is automatic, as the tester found ("about 200 min used against 500-550"). Two fixes were tried and backed out:
  - **(a) Reset at each 5-year period to 1.0, 1.2 or 1.3× the realised or expected value.** The planner lost its licence on 35-60 % of seeds.
  - **Cause:** annual SAIDI swings by about ±40 % with the storms, so any target near true performance becomes a lottery and severe-fine years pile up.
  - **Order of fixes:** reduce the variance first (an exceptional-event threshold closer to RIIO's, or more feeders), then reset targets from benchmarked expected performance.
- **Chief Engineer ignores overloads.** A planner can end as Chief Engineer with a feeder at 140-156 % of its rating. The annual review now prints a load index (feeders over rating, primaries short of firm). Tried together with a target reset, making it a condition of Chief Engineer (at 100 % or a 120 % cyclic rating) left the planner with 2-4 Chief endings out of 20, against 18 before, because the planner persona itself leaves overloads (it accepts connections onto heavy feeders and cannot split a feeder once the 14 bays are used). Fix the planner first, then gate the ending.
- **Lamp sentences come from two places.** The engine's star rules and the work order's `TH_` sentences are joined by threshold name. Chapter 8 shipped with none, so its lamps read "Spend ≤ $750,000" twice on L34, and an unrelated "N-1 secure" sentence on L35 and L36. Fixed at the end of the wave, but nothing tests that every star threshold has a sentence.
- **Unexplained money.** A transformer failure books an emergency replacement at 1.2× the planned price the next quarter (the tester saw capex of $5.4M and cash at $187k). The quarter report does not say why.
- **No way to decline a connection.** A request can only be accepted or left to lapse, and a lapse counts as a missed connection. That is the regulatory reality, but the card does not say so.

## Open after 1.1
| # | Sev | Finding | Source |
|---|---|---|---|
| 1 | major | Career targets slack after year 4; resets need lower SAIDI variance first (numbers above). | tester, iterator sweep |
| 2 | major | Chief Engineer possible with feeders at 140-156 %; needs a capacity-aware planner persona, then a load-index condition. | iterator sweep |
| 3 | major | Phone layout of chapter 8: the stage pans, and the coach card and panel cover the curve or profile; the L33 docket hides the lamps under "more". | tester, U1 |
| 4 | minor | No test asserts that each star threshold has a `TH_` lamp sentence. | iterator |
| 5 | minor | The quarter report does not explain an emergency replacement after a plant failure. | tester |
| 6 | minor | Request cards do not say that letting a request lapse counts as missed. | tester |
| 7 | minor | L16's report and control-room card show the worst loading at different moments without labels (CRITIQUE-1.0 #7, still open). | tester 1 (1.0) |
| 8 | minor | Tobi grades "poor" on a backlog of five or more worn assets even while average health rises fast; the sentence "patching, not fixing" reads wrong then. | tester |
| 9 | minor | Career quarter report and footer cash differed by a few thousand after an in-quarter action. | tester |
| 10 | minor | Resizing the window with the title up logs four `grab_focus` errors (pre-existing, not Career code). | U2 |
| 11 | gap | No phone, pad, Windows or macOS pass; no single save played start to finish; no human player. | — |
