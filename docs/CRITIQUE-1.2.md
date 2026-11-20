# CRITIQUE 1.2: GRID "Fair Weather", before the tag

Written by the Opus iterator on 2026-11-20 at the end of the 1.2 wave. The wave was driven by [CRITIQUE-1.1.md](CRITIQUE-1.1.md)'s open items: Career variance and targets, overloads and Chief Engineer, L16's two worst-loading numbers, and chapter 8 on the phone layout. It is harsh on purpose. Scores are 1-10.

## Who played what
| Who | Surface | What | Result |
|---|---|---|---|
| Career persona sweeps | engine | about 25 variants of the regulator and the planner, 30-50 seeds each, before settling (numbers below) | planner beats firefighter on 41 of 50; firefighter beats idle on 50 of 50 |
| Sonnet tester (electrician retraining as a planning technician) | desk slot h, 1920×1080 and the phone layout | a full ten-year Career (seed 33), L16, L31 and L34 on the phone layout | Career Steady, 9 of 10 years met, score 923; L16 won (1 lamp); every chapter 8 card reachable on the phone layout; no SCRIPT ERROR |
| Opus iterator | desk slot h | L33 and L34 on the phone layout before and after the pan fix, the Career quarter report, the L34 and L36 dockets | fixed in this wave |
| vitest / Godot runner | engine / headless | see the README's Status | all pass |

Not done: a real phone, a gamepad, Windows or macOS, a human player, or a second fresh tester after the playtest fixes.

## What changed, and what it measured
- **Variance first.** One year's SAIDI in this district has a standard deviation of about 110 min on a mean of about 236 (ordinary faults, each darkening thousands of customers for four hours); storms add about 84. The regulator now judges the rolling mean of the period's last three years.
- **Then tighter targets.** Each five-year period ends with a reset to 1.3× the network's modelled expected SAIDI/SAIFI where that is tighter. The tester's year-6 target fell from 456 to 214 min, and a career's year-10 target lands near 200-280 min instead of about 411.
- **Revocation is for failure to invest, not for weather.** A severe-fine year counts only when the network's luck-free expected performance misses the targets, and three must come in a row.
- **What did not work, for the record:**
  - Resets from realised performance punish the seeds whose middle years were lucky.
  - A reset to 1.0-1.2× expected, or a rolling window across periods, lost the planner its licence on 25-40 % of seeds.
  - The rolling window alone made fine years cluster.
- **A clean load index for Chief Engineer.** No feeder may be over its 110 % winter cyclic rating and no primary may be short of firm capacity, read at the winter peak.
  - The old 14-bay cap made a clean index impossible once connections doubled the load. The cap is now 20.
  - The planner was rewritten for capacity.
  - Chief Engineer is now earned on about a quarter of planner seeds, not on almost all.

## Scores
| Criterion | 1.1 | 1.2 | Why |
|---|---|---|---|
| Physics fidelity | 8.5 | **8.5** | Unchanged models. The load index now reads the winter peak, which is how a planner reads it. |
| Teaching | 7 | **7** | The tester learned from the board cards and the failure-chance line, and paid for ignoring it (two forced $4.57M replacements). Overloads now matter to the ending, and the reviews say why. |
| Clarity for a newcomer | 6 | **6.5** | The rolling average, the reset (now announced a year ahead), the credit line, opex by cause and the incident buttons' effects are all on screen. The tester still found the year-6 drop harsh, and seasonal loading swings confused them until the caption said so. |
| UI and controls | 6.5 | **6.5** | Chapter 8 pans to every card on the phone layout, by drag or wheel. At full pan the title card and clock cover the stage's top numbers instead. |
| Layout robustness | 6 | **6** | The L16 report overflowed 1080 px and now scrolls. No new resolutions were checked. |
| Charm | 6.5 | **6.5** | — |
| Long-term play | 5.5 | **6.5** | The second half of a career now has stakes: tighter targets, a load index, plant that fails if run to failure. |
| Depth to "employable" | 6 | **6.5** | Rolling performance, price-control resets, cyclic ratings, firm capacity, emergency replacement costs, and connections with reinforcement consequences are how a planning engineer thinks. |
| Engineering quality | 7.5 | **7.5** | A lamp-sentence test closes 1.1's two-sources gap. Against it: the persona floor was lowered from 45 to 40 of 50 to match a harder game, not raised by a better planner. |
| **Overall** | 6.5 | **6.5-7** | The Career is fair and harder. It still ends Steady more often than it ends with a story. |

## What fails
- **The reference planner is not strong enough.** It beats the firefighter on 41 of 50 seeds, not the 45 the design asked for. It loses where the district starts far above target and it borrows into trouble. A planner that a good player cannot beat is not a reference.
- **Steady while insolvent.** The tester ended at −$4.2M as Steady. The credit line (−$10M) is now stated, but nothing between −$0 and −$10M changes the ending.
- **The year-6 drop is steep.** Halving the target in one review is what the rules say (1.3× expected), but it lands as a shock. The new warning helps; a glide path over the first years of the new period may be fairer.
- **The phone layout pans, but it is cramped.** At full pan the title card and the clock cover the top of the stage, and the price sticker clips the L31 regulator label.

## Open after 1.2
| # | Sev | Finding | Source |
|---|---|---|---|
| 1 | major | Planner persona beats the firefighter on 41 of 50 seeds (design: 45); loses on high-start districts and over-borrows. | sweep |
| 2 | major | Debt between 0 and the −$10M credit line has no consequence for the ending beyond Chief Engineer. | tester |
| 3 | minor | The year-6 target can halve in one review; consider a glide path to the reset value. | tester |
| 4 | minor | Phone layout: title card and clock cover the stage top at full pan; the price sticker clips a label on L31. | tester |
| 5 | minor | Reconductor cards show only 1-2 points of expected SAIDI, so they read as useless even when they cure an overload (their gain is capacity, which the card's why line puts second). | tester |
| 6 | minor | Revenue stays flat while connections are delivered (connection charges are one-off, revenue follows the asset base); the screens do not say so. | tester |
| 7 | gap | No phone, pad, Windows or macOS pass; no human player; no second fresh tester after this wave's fixes. | — |
