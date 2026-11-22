# CRITIQUE 1.13: "Fresh eyes" (2026-11-22)

**Tested against** the gate in [CRITIQUE-1.12.md](CRITIQUE-1.12.md). The Opus iterator ran these:
- A full first year in Harbour City (seed 7) at 1920×1080 on the desk harness: guided quarters, a request, the review and the quarter reports.
- The scripted players on Storm Coast, and the planner across nine districts × four seeds.
- `tension.test.ts`, the full engine suite, `text_flow`, `career_flow`, and the strings lint.

**Machine:** load 15-25, from other sessions. One Godot at a time. The perf budgets failed under load and passed when re-run alone (9/9). No independent tester was started: the load rule allows helpers only below 12.

## The gate
| Gate item (from CRITIQUE-1.12) | Result |
|---|---|
| 1. A fun-critic tester on 1.12's money (a full Harbour City year with a review) | **Half met.** The iterator played that year itself and fixed its top five findings (below). That is not fresh eyes: an independent tester is still owed, and runs when the load drops below 12. |
| 2. The planner on Storm Coast beats the late firefighter on all four seeds | **Met.** Planner 943 / 1207 / 1133 / 1180 against 797 / 147 / −145 / 734, Chief on all four. Asserted per seed in `tension.test.ts`. |
| 3. Carried: listening, real-GPU fps, physical pad | **Owed**, all three (no audio device, no GPU and no pad on this machine) |

## The Harbour City year: findings, worst first
| # | Finding | Fix |
|---|---|---|
| 1 | The owners took $5.4 m at the first review with no warning. The only mention came afterwards, and the Q4 report's cash line did not add up. | The top bar shows "Owners ~$X at review" for the two quarters before a review. The review quarter's report names the dividend and any clawback. |
| 2 | "Off target, strike 1 of 3" showed in quarter 1, with 0.0 minutes lost so far | The alarm now gives the network's fair-weather SAIDI against the target, which is what the strike test measures |
| 3 | Q3's guide pointed to a tree-cutting card, which Harbour City hides | A cable version of the step: dig-ins, failed joints, and what ties and remote switches do |
| 4 | Request cards clipped the map button, and the drawer's hint text was dark on brown | The deadline has its own line. Text sitting directly on the drawer is in light ink. |
| 5 | Transformer rows gave the failure cost but not the replacement price | Both prices on the row |

**Seen but not fixed (carried):**
- Q2's guide is about storm readiness in a district with a quarter of the usual storm exposure.
- The Q4 report's two-year rule line looks ahead to next year's average, which reads oddly in a report about the year that just ended.
- Both Harbour City primaries start short of firm capacity. The fix (a third transformer) unlocks only in Q4. That is fair, but nothing says so earlier.

## Owner-concerns audit
- **Physics and money honest:** the dividend preview uses the regulator's own rule, at today's cash. The "replace now" price comes from the same quote as the Start button.
- **Scores:** no outcome changed. Rules bundle 1.13.0 accepts game 1.13.0 and keeps epoch 5. It is vendored locally, and the release check passes.
- **Public repo:** pre-push scan clean. The README claims only what is in this build.

## Gate for 1.13 → 1.14
| # | Item | Acceptance |
|---|---|---|
| 1 | An independent fun-critic tester (when load < 12) on a Harbour City or Storm Coast year | Scores recorded; top 3 fixed or carried |
| 2 | The three carried findings above | Fixed or argued |
| 3 | The planner on Home Counties seed 11 and High Moor seed 1 (not Chief; moor seed 1 ends in debt) | Explained or fixed |
| 4 | Carried: listening, real-GPU fps, physical pad | Stated as met or owed |
