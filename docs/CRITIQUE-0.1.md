# CRITIQUE 0.1 — chapter 1 (The Island), 2026-11-10 evening

Inputs: the user's own play ("lost horribly, but it seems well put together"), the director's first-timer run (1920×1080,
screenshots `.qa/grid/a/shots/`), Sonnet tester **b** (novice 16-year-old, 1920×1080, mouse) and tester **c** (impatient gamer,
1280×800 handheld layout). Every finding below marked *verified* was reproduced by the director; the rest are tester reports.

## Verdict
Chapter 1 is charming and readable: title, work order, radio, bulb faces, live voltmeter and the incident report all land, and a
16-year-old finishes it in 6-8 minutes without help. It is **shallow**: each job has one obvious answer (nearest peg + a mid reel),
star targets A = B on L02/L03, retries cost a full rebuild, and the night run is dead air. The "why" is delivered as numbers more
than as a rule. Nothing to optimise after the first win; no reason to replay. The user's new direction (DEPTH.md) answers the
depth problem from chapter 2; chapter 1 gets the friction and teaching fixes below.

## Why the user lost "horribly" (most likely, verified by replay)
The coach nudges toward the naive build ("the thin reels are cheap") — intended attempt-first — but each failure then cost a
full rebuild (Retry wiped hut and cable and re-showed the work order: 6 clicks) and ~25 s of watching the night play out.
Three failures = 2 minutes of chores. An old autosave from that session shows L03 lost at 9.9 % line loss.

## Findings
| # | Sev | Where | Finding | Status |
|---|---|---|---|---|
| 1 | major | all jobs | Retry wipes the build and re-opens the work order (6 clicks per retry) — *verified* | **fixed**: Retry (report and breaker) keeps hut/reels/junction/converters, docket stays folded, Tobi says the build is still laid (paper_flow test) |
| 2 | major | all jobs | Night run is dead air: 5-hour night = 32 s at 2× — *verified* | **fixed**: tick 2.0/0.8/0.3 s per block (16 s at 2×, 6 s at 4×) |
| 3 | major | L03 | The radio hands over "place the converter pair to run at 380 V" before the player thinks; brief says "Copper alone will not do it" | **fixed**: coach asks "what could you change so the same power needs less current?", converters only in *why*; brief softened |
| 4 | major | L01 | Ada explains with raw numbers; no rule | **fixed**: "Thin, long copper pushes back on the current … costs V = I·R = …" |
| 5 | major | ch 1 | One obvious answer per job, A = B star targets (L02, L03), nothing to optimise | **open → DEPTH.md** (chapter 2 district play, terrain, supports); ch 1 keeps its tutorial role |
| 6 | major | Sandbox | Title → Sandbox opened an empty board and the old cyan BUILD drawer — dead end | **fixed**: hidden until it has its own tray and map |
| 7 | major | P0 | Prologue breaker has no visible glow; card mostly empty; night passes with nothing to do | open |
| 8 | minor | world | Lighthouse jumps when the hut moves — *verified* | **fixed**: anchored to towns |
| 9 | minor | Jobs | Starting a job from Jobs mid-game shows a generic cyan confirm | **fixed**: no confirm, autosave first |
| 10 | minor | L02 | Preview shows the whole design's worst voltage, not which hamlet is worst; ★★★ (radial 16 + 50 mm²) is hard to find | open |
| 11 | minor | report | "Bot population (offline estimate)" reads as jargon | **fixed**: "Every design the job allows (offline sample, not real players yet)" |
| 12 | minor | tray | Hover chip overlaps the budget tag; stale chip during the run; camera pan clips the hamlet at 1280 px | open |
| 13 | polish | report | Panel side alternates (left on L01, right on L02/L03) — by design (docks away from the island) | won't fix |
| 14 | polish | report | "more ▼" overlaps ADA's note at 1280×800 | open |
| 15 | minor | L01 | Repeated failure hints are identical; no adaptation | partly: retry line from Tobi |

## Not covered in this pass
Pixel phone run, pad-only run, monkey tester and a code review (planned for the v0.3 alpha critique, CRITIQUE-0.3.md).
