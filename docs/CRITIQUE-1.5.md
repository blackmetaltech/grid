# CRITIQUE 1.5: GRID "Storm Plan", before the tag

Written by the Opus iterator on 2026-11-21 at the end of the 1.5 wave. The wave was driven by [CRITIQUE-1.4.md](CRITIQUE-1.4.md):
- the board misclicks;
- storm variance, answered with player levers rather than smoothing;
- Old Iron's lagging targets;
- a full-campaign regression playtest.

It is harsh on purpose. Scores are 1-10.

## Who played what
| Who | Surface | What | Result |
|---|---|---|---|
| Sonnet tester (returning third-year power-systems student, last played 1.0) | desk slot h, 2424×1080 desktop, under load average 31-38 from other jobs | L01, L04, L07, L10, L14, L19, L23, L31, the finale's first day, three Storm Coast Career years | 7 of 9 levels passed first time; L14 failed twice; the finale ran clean to day 1 23:00; licence revoked at the end of the Storm Coast career's year 3; 0 SCRIPT ERROR; their scores: campaign 8, Career 7, clarity 8, UI 7.5 |
| Opus iterator | desk slot h | the board after a Start (Old Iron); the Storm Coast readiness card | Started placeholders hold their place; the readiness card reads the forecast |
| Persona sweeps | engine | the planner with readiness and the target glide over 50 seeds; charters 12 seeds each | P>F 47 of 50, Chief Engineer on 18 (was 13); every charter 8-10 of 12 |
| vitest / Godot runner / cobanana-scores | engine / headless / server | see the README's Status; the scores suite has 1333 tests with the 1.5.0 bundle | all pass |

Not done:
- A real phone, a gamepad, Windows or macOS.
- A human player.
- A public scores host (the owner's decision; bundles 1.4.0 and 1.5.0 are committed locally in cobanana-scores and not pushed).
- The regression tester did not reach L13, L27 or L36, or the finale's days 2-3.

## What changed, and what it measured
- **Misclicks.** The board keeps its order after a Start and leaves a same-height "Started" placeholder. The returning tester confirmed it on both the worst-assets list and the project cards.
- **Storms became a decision.**
  - Each quarter has a forecast, readiness levels (standby crews, mutual aid) and per-feeder hardening.
  - On the same seed and the same storms, mutual aid booked all along cut three years of SAIDI from about 2353 to 1860 minutes (−21 %, nearly all of it in storm quarters). The tester saw a hardened feeder stay quiet.
  - The tester's verdict was "partly a decision". Storms still came about once a quarter on Storm Coast, and they under-invested with $7.3M sitting unspent.
- **Targets follow a fast-healing network.** The yearly tightening rises from 1.5 % up to 8 % while expected SAIDI × 1.3 is far under the target, and the review states the step. Chief Engineer is now earned on 18 of 50 planner seeds rather than 13, so the glide did not make it harder for a good planner, only for a coasting one.
- **The regression pass found one real regression-class bug.** L14's Retry silently dropped chapter 5's settings while the radio said the build stood. Chapter 5's retry had never carried taps and shunts. Now it does, with a test.

## Scores
| Criterion | 1.4 | 1.5 | Why |
|---|---|---|---|
| Physics fidelity | 8.5 | **8.5** | Storm readiness and hardening are factors on existing fault and restoration models (illustrative values). |
| Teaching | 8 | **8** | Storm plans (mutual aid, pre-switching, hardening) are real DNO practice. L19 now closes the loop on the prediction. |
| Clarity for a newcomer | 7.5 | **7.5** | The strike count, plant outage times and no-decision incidents are clear. The finale's numbers and L07's card versus the debrief still disagree in places (see below). |
| UI and controls | 7 | **7.5** | No more board misclicks. The speed dial is still a small target. |
| Layout robustness | 6 | **6** | — |
| Charm | 6.5 | **6.5** | — |
| Long-term play | 8 | **8** | Storm Coast and Forest Line now have a real plan to make. The weekly board is still dormant without a host. |
| Depth to "employable" | 7.5 | **8** | A storm plan with a forecast, mutual aid and hardening is the job in a storm-exposed licence area. |
| Engineering quality | 8 | **8** | A real Retry bug was found by the regression pass and fixed with a test. Rules bundles are versioned, with board epochs. |
| **Overall** | 7-7.5 | **7.5** | A returning player found the campaign intact and better (8/10), and the Career's storms are now something to plan for. |

## What fails
- **Storm Coast is still harsh for a passive player.** The tester lost the licence by year 3 while holding cash. That may be fair, since they ignored a $5M at-risk warning and booked little readiness. But a first-time player can lose a charter career quickly, and nothing suggests "spend your cash".
- **The finale is slow on a loaded machine.** A 24 h simulation ran for minutes at a load average of 30+. That is not a regression in the code, but it was not measured on an idle machine in this wave.
- **Small text mismatches remain.**
  - L07: the card says 1.85-1.90 MW and the debrief says 1.70 MW (different moments, unlabelled).
  - L19: the coach's time stamp reads 16:00 against a brief that says 20:00.
  - L23: "(1726 MVA)" is printed under the report sheet.
- **The speed dial** is a small target with the mouse.
- **Readiness is sticky.** A player who books mutual aid for a stormy quarter pays every quarter until they turn it off. The card says so, but it is easy to forget.

## Open after 1.5
| # | Sev | Finding | Source |
|---|---|---|---|
| 1 | major | No public scores host: the weekly board is dormant in shipped builds (owner decision). | design |
| 2 | minor | Charter careers: a nudge when cash sits idle while targets are missed. | regression tester |
| 3 | minor | L07 card versus debrief power, L19 coach time stamp, L23 text under the report. | regression tester |
| 4 | minor | Readiness auto-reset option, or a reminder in the quarter report while it is booked under a calm forecast. | design |
| 5 | minor | Speed dial hit area. | regression tester |
| 6 | gap | L13, L27, L36 and the finale's days 2-3 were not in this regression pass; no phone, pad, Windows or macOS; no human player. | — |
