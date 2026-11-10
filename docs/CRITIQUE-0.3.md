# CRITIQUE 0.3: "The Mainland Line" (chapter 2, L05)

The pass before v0.3.0 is alpha-worthy, run 2026-11-10 from 17:40. Each finding gives its source, its severity, what was wrong, and its status.

## Who looked
| Tester | Surface | Resolution | Persona | Status |
|---|---|---|---|---|
| e | mouse + keyboard | 1366×768 | novice, 16, Std 9 | done (before the fixes) |
| f | mouse + keyboard | 2560×1440 | physics teacher / ex-diploma EE | done (before the fixes) |
| code review | read-only | n/a | Sonnet reviewer, diff v0.1.0..HEAD | done |
| Pixel 9a | touch | 2424×1080 | Opus, on the device (phone lock) | done |
| g | pad only (handheld layout) | 1280×800 | Steam Deck player | see below |
| h | monkey (random input) | 1280×720, 1920×1080, 800×600 | Haiku | see below |
| re-test | mouse + keyboard | 1366×768 | novice, after the fixes | see below |

## Scores before the fixes (0-10)
| Area | e (novice) | f (teacher) |
|---|---|---|
| First 60 s | 6 | 7 |
| Survey and refusals | 5 | 4 |
| Physics landing | 3 | 3 |
| Feedback truth | 3 | 5 |
| Depth / fun | 5 | 5 |
| Polish | 4 | 4 |
| Input | 4 | 6 |

Neither tester reached a passing 11 kV line. That was the headline failure.

## Findings and status
| # | Sev | Source | Finding | Status |
|---|---|---|---|---|
| 1 | blocker | e, f | Each site has two yards (0.42 kV and 11 kV) drawn on top of each other, so clicks landed on the wrong one and an 11 kV line could not be surveyed. | **Fixed**: the tray gained a *line voltage* cell (0.42 kV / 11 kV). A click on a site means its yard at that voltage, the pegs show one yard per site, and Tobi asks for the two transformers. |
| 2 | blocker | f, review | Re-stringing (Span, conductor or family change) charged a second full line price, and the budget never recovered. | **Fixed**: a demolished surveyed line is refunded, so re-stringing costs only the difference (engine test). |
| 3 | major | f | An over-budget run that lit the market was stamped "NOT LIT". | **Fixed**: the stamp now reads "OVER BUDGET". |
| 4 | major | f | The headline said "Spent 452353 but the budget is 260000" with no currency formatting. | **Fixed**: formatted as $452,353 (engine test). |
| 5 | major | f | With steel-tube banks chosen, the river refusal still said "use a crossing structure". | **Fixed**: the refusal now names the gap, what the chosen banks can span, and the structure that would do it (engine test). |
| 6 | major | e, f | The report's lesson used the least-margin span (a short road span) and never said why 11 kV wins. | **Fixed**: the lesson now covers the longest span (the river) with units and numbers that recompute, plus the current ratio (305 A at 0.42 kV vs 12 A at 11 kV, 1/26 of the current, about 1/690 of the heat), or the voltage drop when 0.42 kV browns out. |
| 7 | major | e | The mouse wheel over the tray changed values and silently re-strung a built line. | **Fixed**: the wheel only scrolls the tray. |
| 8 | major | e | The tray's ‹ › scroll marks ignored clicks. | **Fixed**: they page the tray. |
| 9 | major | Pixel | L05 ran at 18-20 fps (dyn_ms 15 ms). | **Improved**: building windows are cached as meshes. On the Pixel 9a, L05 now runs at **29-30 fps** (dyn_ms 3.6-4.2, frame_ms 35-38). That is still below 60 and is likely fill-rate bound; open. |
| 10 | minor | review | Retry or Start over of the same job resumed the old survey. | **Fixed**: the tray resets at job start. |
| 11 | minor | review | Retry said "design kept" even when a step was refused. | **Fixed**: Tobi says how many steps did not rebuild. |
| 12 | minor | review | Bend points 1.5 m apart planted two angle towers. | **Fixed**: points closer than 5 m merge (engine test). |
| 13 | minor | review | The world query re-sends the 4,400-tile terrain on every refresh. | Open (perf, low impact on desktop). |
| 14 | polish | e, f, Pixel | Tray names collided ("Concrete" ran into "Steel tube"). | **Fixed**: wider minimum cells, the tray scrolls instead, and shorter captions. |
| 15 | polish | e, f | Yard labels overlapped at each site. | **Fixed** by #1 (one peg per site while surveying). |
| 16 | polish | Pixel | The coach said "click" on a touch screen. | **Fixed** in the tray hints; the engine coach line still says "click" (open). |
| 17 | polish | own | The village showed crowded labels: yard pu, loading %, and the town name. | **Fixed**: yard pu labels are hidden at overview, and the loading % moves below the town name. |
| 18 | minor | own | The work order did not state the clearance rule. | **Fixed**: the pass list now says "Every span clears the ground, roads and high water at 75 °C". |
| 19 | minor | e | A bend click right after the yard click is dropped (it lands on the start yard). | Open. |
| 20 | minor | e, f | There is no cost breakdown (poles / wire / foundations / transformers) on the preview or the report. | Open. |
| 21 | minor | f | The ghost names only the first violation along the line. | Open. |

## Device and pad
| Pad finding | Sev | Status |
|---|---|---|
| L01's work order could not be passed by pad: focus stuck on the Learner chip (A on the selected chip does nothing). | blocker | **Fixed**: the pad lands on "Take the job", and the footer has explicit neighbours. Verified with the pad. |
| The survey cursor moved 8-17 px per press, with no repeat and no way to reach a yard. | major | **Fixed**: the step scales with zoom (up to 4 tiles), a held D-pad repeats, and Y jumps to the far yard. Verified with the pad. |
| Nothing said which pad input does what while surveying. | minor | **Fixed**: the legend strip switches to "D-pad move · A yard / bend · Y jump to the far yard · B undo · LS pan". |
| Stale or doubled focus rings (tray cell plus HUD). | minor | Open. |
| B does not close info cards. | minor | Open (core). |

| Monkey finding (Haiku, 3 sessions × 60 random actions) | Sev | Status |
|---|---|---|
| No SCRIPT ERROR, crash or freeze in any session. | — | — |
| At 800×600 the radio text column collapsed to one word per line. | major | **Fixed**: narrow panels stack the time and speaker above the line. |
| At 800×600 the work order's "more" cue sits over the third lamp. | minor | Open. |
| At 1920 the tray's › mark touches the inline budget tag. | polish | Open. |

Pixel 9a (touch, 2424×1080), measured by Opus under the phone lock with the debug-APK QA jump (`files/qa_level.txt`):
- The title runs at 36-43 fps.
- L05 ran at 18-25 fps before the fix and **29-30 fps after** it.
- The phone dropped offline once mid-session, and `adb reconnect` under the lock fixed it.

