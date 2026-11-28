# GRID audit 1128b: playtest sheet

Ravi, QA Engineer. Branch look6, run 11:08 to 12:50 on 2026-11-28. Desk harness (Xvfb, llvmpipe software GL, low tier, 1920x1080 unless noted).
Software GL is slow (5 to 15 fps), so I judged gameplay, logic, text and layout here. I did not judge the 3D look on the 4090 and I did not listen to any sound.
Early reports (before f8005c2) were seen on an older working tree; I replayed the fixes on HEAD at 12:30 to 12:45 (marked in BUGS.md).

## How each job was reached
- **Hand** = clicked and typed by me from a fresh save (slot c): title, "Take the night shift", WO-01, WO-02, WO-03, WO-04 (and WO-05 later), plus the fresh start on HEAD (title, P0, "Start on the island", WO-01 brief).
- **Setup hook** = `CB_LEVEL=Lxx` with the engine solver's moves applied through the `CB_CAM act=` hook (`CB_NOWORKORDER=1`), then I pressed Space (Run) and let the night play. The result screen, lamps and numbers are real. The setup moves were not clicked by me.
- **Idle** = `CB_LEVEL=Lxx` and Run with nothing built (fail on purpose).
- Speed 4x was set by clicking the 4x button on the long day jobs (WO-07, 08, 14, 15, 16, 20, 28).

## Counts
37 jobs listed (P0 and WO-01 to WO-36). Played to a result: 36. Won: 34. Failed on purpose: 8 (one per chapter) plus P0 (scripted "Dark") plus WO-05 (over budget, not won). Not played: WO-29 (needs a hand-built route, see below). T00 is a placeholder level, not played.

## Jobs
| Job | Reached | Done | Result | Min | Bugs | Notes (old 2D look / text overlap / dead buttons) |
|---|---|---|---|---|---|---|
| P0 Night the Lights Went Out | Hand (fresh title on HEAD) and setup hook | yes | "Dark" (scripted: closing T5 trips the grid, Watch again / Start on the island both work) | 3 | B20 B32 | no old look; caption over gauge; loading text over brief |
| WO-01 First Light | Hand, fresh campaign; fail by hand, replay, win | yes | failed (4 mm2: 39.0 V, limit 43.2 V), then won 3/3 ($1,170, 46.3 V, 3.5 %). Same inputs again via hook gave the same $1,170 and 46.3 V | 6 | B01 B02 (fixed, replayed ok) | numbers agree with Ada's text (R, I, V) |
| WO-02 Two Hamlets | Hand, then hook | yes | won 3/3 ($4,754, 45.4 V). Hook run identical | 4 | B01 B03 B17 | report was clipped before f8005c2, fits now |
| WO-03 Price of Distance | Hand, then hook | yes | won 3/3 ($16,350, 2.9 % loss, 369.2 V). Identical on rerun | 4 | B01 B03 | chapter 1 complete card shown after Next job |
| WO-04 Spin the Alternator | Hand (failed by hand, 98.2 V rms vs 225.4-234.6 V), then hook | yes | failed (my sliders), then won 3/3 ($715, 50 Hz, 231 V, prediction 327 vs 326.7) | 6 | B04 B05 | scope chart ghosts through report; sliders and +/- buttons work |
| WO-05 The River Line | Hand (slot c) | yes | failed: over budget ($283,027 vs $270,000). Three hand surveys, best $283K, no transformers placed yet. Not won by hand: I did not find the cheap design in a fair try (the engine's refusals were clear: river 155 m, wood span 70 m, concrete cannot stand on rock) | 12 | B28 B29 | budget text runs to box edge; tray names cut |
| WO-06 Exam Bridge: Town Line | Setup hook | yes | won 3/3 ($63,818, 1.53 % loss, 98.5 %, prediction 600 vs 600 kW) | 3 | B22 (fixed, replayed ok) | chart bar covers top of screen |
| WO-29 Salt Wind | not played | no | route needs a hand-built polyline (CB_CAM cannot carry it); I ran out of session before a hand attempt | - | - | - |
| WO-30 Bring the Island Home | Setup hook | yes | won 3/3 ($549,500, 3.8 % loss) | 3 | B13 class | report clock partly under panel edge |
| WO-07 The Lagging Mill | Setup hook; idle | yes | won (Level passed; I did not capture its report); idle: failed "Total blackout" (feeder 107 % of rating) | 6 | B24 (fixed) | report opens with empty space at bottom |
| WO-08 Resonance at the Fifth | Setup hook (4x) | yes | won 3/3 ($46,800, THD 2.7 %) | 4 | - | - |
| WO-09 Hundred-Percent Trap | Setup hook | yes | won 3/3 ($513,214, far end 0.975 pu, fault 21:00) | 3 | B16 | the hamlet is a speck on a huge plain |
| WO-10 Balance the Phases | Setup hook; idle | yes | won 3/3 ($595, 2.3 %, N 2.6 A); idle: failed (neutral burnt at 19:15) | 4 | B22 | charts cover the top and the street |
| WO-11 Star or Delta | Setup hook | yes | won 3/3 ($12,503, pf 0.96, dip 4.2 %) | 3 | B14 B23 (fixed) | toast over tray header |
| WO-12 Over the Hill | Setup hook | yes | won 3/3 ($240,000, first swing 63 deg) | 3 | B08 (fixed, replayed ok) B27 | lamps 2 and 3 have the same text |
| WO-13 Exam Bridge: Generator Phasors | Setup hook | yes | won 3/3 (predictions E 1.97, delta 29.17, Pmax 1.642) | 3 | B08 (fixed, replayed ok) | - |
| WO-14 Per Unit, Please | Setup hook (4x); idle | yes | won 3/3 ($161,990, 2.8 % loss, 28 tap moves); idle: failed (B4 0.948 pu) | 6 | B14 B16 | towns show as labels only |
| WO-15 The Long Line | Setup hook (4x) | yes | won 3/3 ($11,418,500, 1.04 pu to 1.026) | 4 | - | - |
| WO-16 Loop Flow | Setup hook (4x) | yes | won 3/3 ($109.6M, worst line after loss 95 %) | 5 | B13 class | "more" hint over report text |
| WO-17 Nose of the Curve | Setup hook | yes | won 3/3 ($23,788,600, margin 16.3 %) | 3 | - | - |
| WO-18 Exam Bridge: Gauss-Seidel | Setup hook | yes | won 3/3 ($593,650, predictions 3 of 3 within 0.5 %) | 3 | B11 (fixed, replayed ok) | - |
| WO-19 Fifty Hertz | Setup hook; idle | yes | won 3/3 ($29,603,942, low 49.61 Hz); idle: failed (48.96 Hz) | 4 | B09 (open on desk) | black cooling towers |
| WO-20 Sun Goes Down | Setup hook (4x) | yes | won 3/3 ($599,760,000, curtailed 0.5 %) | 5 | B09 | - |
| WO-21 Inertia Matters | Setup hook | yes | won 2 of 3 lamps ($298,295,926, low 49.57 Hz; third lamp needs 49.58 Hz). The solver script's third lamp missed on the desk; I did not change it | 3 | B09 B14 | - |
| WO-22 Exam Bridge: Droop & RoCoF | Setup hook | yes | won 3/3 (60.0 % share) | 3 | B10 (fixed) | "1 %%" in lamp text |
| WO-23 Fault Level | Setup hook; idle; 1280x800 | yes | won 3/3 ($440,000, 30.2 kA); idle: failed (breaker 25 kA < 30.2 kA, estate dark 3 h) | 4 | B25 | tray clipped at 1280x800 |
| WO-24 Coordination | Setup hook | yes | won 3/3 (score 1.62 s) | 3 | - | - |
| WO-25 Clear It in Time | Setup hook | yes | won 3/3 ($545,000, clears at 90 ms vs 164 ms) | 3 | - | - |
| WO-26 Merit Order | Setup hook; 2560x1440 | yes | won 3/3 (lambda 59.20 predicted and real) | 3 | - | - |
| WO-27 Exam: Faults & lambda | Setup hook | yes | won 3/3 ($880,000, 5 of 5 predictions within 2 %) | 3 | - | - |
| WO-28 Keep the Lights On (finale) | Setup hook (4x), two runs | yes | passed ("Level passed: Keep the Lights On" in the log; the three-day panel was up, I did not open the report) | 5 | B18 (open on desk) | glow strip at night |
| WO-31 The Long Feeder | Setup hook; idle; 1280x800 | yes | won 3/3 ($210,000, 4 % loss); idle: failed (N5 189.8 V) | 4 | B12 B26 | tray crowded at 1280x800 |
| WO-32 Count the Outages | Setup hook | yes | won 3/3 ($137,500, SAIFI 1.52, SAIDI 258.7) | 3 | B13 | - |
| WO-33 Fuse Saving | Setup hook; 2560x1440 | yes | won 3/3 (score 1.25 s) | 3 | - | - |
| WO-34 Firm Capacity | Setup hook | yes | won 3/3 ($750,000, 3.38 days of life) | 3 | B15 | legend overlap on the MVA chart |
| WO-35 Sun on the Roofs | Setup hook | yes | won 3/3 ($8,000, 3000 kW host) | 3 | - | big empty gap in report |
| WO-36 Exam Bridge: Feeder Numbers | Setup hook; 1280x800 | yes | won 3/3 (SAIFI 1.43, SAIDI 274.5) | 3 | B19 | - |

## Shell screens and flows
| Item | Reached | Done | Result | Bugs | Notes |
|---|---|---|---|---|---|
| Title | Hand | yes | Fresh title: Take the night shift, Jobs, Career, Settings, Quit, Cute mode. After a save it says "Continue the night shift". All buttons answer | B01 | sea plane edge visible behind the island |
| Jobs list | Hand (pause menu, Jobs) | yes | chapters grouped; locked jobs say which job to pass first; lamps show; scroll works | B07 (fixed) | "more" hint over chapter heading; world labels showed through (B05) |
| Pause (Esc) | Hand | yes | Esc on a report only closes the report; second Esc opens ON HOLD: Resume, Restart job, Work order, Settings, Jobs, Title, Cute mode. No Save and quit (Ctrl+Q does it) | B05 B30 | - |
| Settings | Hand | yes | five tabs all open and close: Display, Audio, Accessibility, Gameplay, Controls | B06 | shell-styled (different heading font); Online scores has no visible switch; Controls text mentions drawers |
| Save and resume | Hand | yes | Ctrl+Q mid-incident on WO-04, restart, Continue: same job, same incident report, same sliders, cash and clock (19:00). Log says "Loaded Autosave" | - | - |
| Replay a finished job | Hand | yes | WO-01 Retry after a fail and after a win; Jobs list shows lamps for finished jobs | - | the build stays laid on Retry (by design, the radio says so) |
| Look around / red pin | Hand | yes | after Look around the red pin "Incident - Retry" reopens the report | B02 | - |
| V (fold charts) | not tested by key | no | I saw the "Hide charts V" chip on chapters 4 to 8; I did not press V | - | - |
| Speeds 1x/2x/4x, pause mid-run | Hand | partly | 2x default on ch1 to 3 jobs, 1x on later; 4x click works; Space toggles the breaker (Run / Pause) | - | - |
| Career | Hand (title, Career, new) | yes | one full in-game year: started F4.3 project ($177,800), End quarter four times, quarter reports and the annual review ("Targets met", incentive $193,595) appeared, Year 2 Quarter 1 reached. Save and leave, Career, Continue: same cash and quarter | B31 | dense top strip; "Owners ~$2,022,695 at review" crowds the strip |
| Resolutions | CB_LEVEL | partly | 1280x800: WO-04, 10, 23, 31, 36 played; WO-23 and WO-31 trays clipped. 2560x1440: WO-06, 12, 26, 33 played; no overlap, HUD stays small. No live resize (the desk harness cannot resize) | B25 B26 B33 | - |

## What I did not check
- The 3D look on the 4090 (only Ingrid's replays), sound, pad, phone, touch.
- Live window resize, 1080x608 and smaller windows.
- WO-29 by hand, a hand win of WO-05, the T00 placeholder.
- Hand clicking inside every job: for 30 jobs the build was set by the solver through the hook; mouse building on the benches (ch1), sliders (WO-04) and the route tray (WO-05) was done by hand.
- The V key, the work-order "Engineer" mode, difficulty modes, 2x/4x on every job, "change inputs mid-run" on every job (I changed nothing mid-run except by hand on WO-01 to WO-05).
- Result screens of WO-07 and WO-28 (both logged "Level passed"; reports not captured). Their idle and replay results are covered above.

Ravi, QA Engineer
