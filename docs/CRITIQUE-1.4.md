# CRITIQUE 1.4: GRID "Old Iron", before the tag

Written by the Opus iterator on 2026-11-20 at the end of the 1.4 wave. The wave was driven by [CRITIQUE-1.3.md](CRITIQUE-1.3.md):
- charters tuned by people, not only personas;
- a shared board for the weekly district;
- the open phone items;
- the tree-cutting card.

It is harsh on purpose. Scores are 1-10.

## Who played what
| Who | Surface | What | Result |
|---|---|---|---|
| Sonnet tester (asset-management graduate, methodical) | desk slot h, 2424×1080 desktop | a full ten-year Old Iron career (seed 21) | **Chief Engineer**, score 598, 8 of 10 years met, health 3.0 → 8.9, cash $13.0M; their score 7/10 |
| Sonnet tester (finance analyst, sceptical) | desk slot h, 2424×1080 desktop | a full ten-year Lean Years career (seed 34) | **Steady**, score 19, 7 of 10 years met (missed Y2-Y4), health 3.8 → 7.5, cash $12.05M; their score 6/10 |
| Opus iterator | desk slot h + a local cobanana-scores dev server (127.0.0.1) | the weekly board end to end; L33 and L34 on the phone; the Old Iron board after the fixes | a finished weekly career was replayed by the server, ranked 1 of 1; a stale claim (truncated score) was refused with `metrics_mismatch`, as it should be |
| Persona sweeps | engine | Lean Years at three tunings, 20 seeds each | planner beats firefighter on 11 of 20 (8 of the 12 tested) at the shipped tuning |
| vitest / Godot runner / cobanana-scores suite | engine / headless / server | see the README's Status; scores 1308 tests | all pass |

Not done:
- A real phone, a gamepad, Windows or macOS.
- A human player.
- A public scores host. Deploying one is the owner's call.

## What changed, and what it measured
- **The weekly board is real, and it is cheat-resistant by construction.** The server does not trust a score. It replays the career code on the same pure engine and checks three things:
  - the seed and charter are that week's district;
  - every action is legal;
  - the career has ended.

  The local round trip caught a real bug before release. The client truncated a 620.83 score that the server rounded to 621, and the server refused the score. The board metric is now whole points everywhere (`boardScore`).
- **Testers found what the personas never could.**
  - Old Iron's worst-assets list hid the substation plant, which is what fails in an old network, because expected SAIDI does not count plant failures. Plant at risk is now listed first, with its failure chance and the emergency cost, and the quarter report warns about it.
  - Lean Years was not lean: the tester ended with $12M. The charter now also cuts 4 % of all revenue.
  - Both testers wanted to know where their score came from. The 25-point penalty per missed connection had sunk the Lean score from about 300 to 19, and it was invisible. The ending sheet now breaks the score down.
  - The three-year rolling average fined a good year (256 against 498) for the two bad years before it, and the tester learned why only at the review. The quarter report now projects the average.
- **Phone.**
  - Chapter 8 opens at the bottom of its pan, where the charts clear the coach card and the panel, and says there is more above.
  - The ☰ sits on a dark disc.
  - L34's lamp text and MVA chart, which the 1.3 tester found covered, are clear on arrival.

## Scores
| Criterion | 1.3 | 1.4 | Why |
|---|---|---|---|
| Physics fidelity | 8.5 | **8.5** | No model changes. Plant failure risk is now shown from the same Weibull model that draws it. |
| Teaching | 7.5 | **8** | Old Iron taught asset management to an asset manager: replace by failure risk, not only by SAIDI gain. The score breakdown teaches the connection obligation. |
| Clarity for a newcomer | 7 | **7.5** | Score parts, the rolling projection, plant risk, missed years and the tree-cutting levels' effects are all on screen. Still opaque: why a storm year swings 200-300 minutes. |
| UI and controls | 7 | **7** | The phone layout is fixed where the testers looked. The board's Start buttons shift cards under the pointer after a click, which led to misclicks. |
| Layout robustness | 6 | **6** | No new resolutions. |
| Charm | 6.5 | **6.5** | — |
| Long-term play | 7.5 | **8** | The weekly district now has a shared board, server-verified, once a host exists. Both charters played by people were rated playable and different (7 and 6). |
| Depth to "employable" | 7 | **7.5** | Plant risk with emergency costs, the efficiency challenge, rolling regulatory averages and the connection obligation are the job. |
| Engineering quality | 8 | **8** | The verifier shares the game's engine and formula, with golden samples and a server-safety test. One process note: the iterator once used `pkill -f` against the machine rules (it hit only its own dev server and shell). |
| **Overall** | 7 | **7-7.5** | Two charters have now been played to the end by people, and the weekly board works end to end locally. |

## What fails
- **No public board.** The board works only with `CB_SCORES_URL`. Until the owner decides on a host, "the same district for everyone" still means comparing by hand.
- **Weather variance is still the main unfairness.** Storm quarters swing SAIDI by 200-300 minutes. The rolling projection explains a fine before it comes but does not soften it. A careful planner can still lose a year or two to weather.
- **Lean Years is lean only if you spend.** A cash-hoarding human still ends with money. The cut now bites the planner persona, but its real effect on people is untested.
- **Old Iron eases after year 2.** The 25 % cap on resets means a network that heals fast (health 3 → 9) outruns its targets. The tester met eight years with SAIDI far under target.
- **Board misclicks.** Starting a project re-lays the card list under the pointer.
- **The plant warning misses low-probability failures.** A health-5.2 transformer failed while the list named others. That is fair as luck, but it reads as a broken warning.

## Open after 1.4
| # | Sev | Finding | Source |
|---|---|---|---|
| 1 | major | No public scores host: the weekly board is dormant in shipped builds (owner decision). | design |
| 2 | major | Storm-year SAIDI swings decide years; consider exceptional-event relief closer to the regulator's, or a storm-hardening project. | Lean tester |
| 3 | minor | Old Iron: targets lag a fast-healing network (reset cap); consider allowing a larger cut when the network beats the target by a wide margin. | Old Iron tester |
| 4 | minor | Board cards shift after Start; keep the clicked card in place. | both testers |
| 5 | minor | Request cards do not remind that a lapse costs 25 points, and there is no "decline with reason". | Lean tester |
| 6 | minor | The weekly board window ends at 2027-W13; the next release must vendor a bundle that extends it. | design |
| 7 | gap | No phone, pad, Windows or macOS pass; no human player. | — |
