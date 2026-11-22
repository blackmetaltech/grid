# CRITIQUE 1.14: "Legible" (2026-11-22)

**Tested against** the gate in [CRITIQUE-1.13.md](CRITIQUE-1.13.md) and the coordinator's six notes on the 1.12/1.13 shots. The Opus iterator ran these:
- Desk shots of Harbour City, High Moor and Home Counties at 1920×1080, and of the board with a card picked from the map.
- The new `career_map_truth` (5483 checks), `text_flow`, `career_flow`, the strings lint and the targeted engine tests.

**Machine:** load 13-28, from other sessions. At most 4 vitest workers and one Godot at a time.

This layer was closed early on the owner's instruction: the repositories move to the blackmetaltech organisation, and work stops at the next clean point. Anything not finished cleanly went into the 1.15 gate.

## The coordinator's notes
| Note | Result | Evidence |
|---|---|---|
| 1. Harbour City too dark; loading labels collide with poles, ties and each other | **Fixed.** One collision pass for every map label, each on a paper chip. Lighter streets, lit block edges, a quay edge and ripples on the harbour. | README shot; `career_map_truth` |
| 2. High Moor names over lines and houses; a test across all nine districts | **Fixed.** Village names go only where they cover nothing. `career_map_truth` fails on overlapping, off-map or missing labels, and on a village name over a house or a line, in all nine districts at two sizes and both colour modes. | `godot/tests/career_map_truth.gd` |
| 3. The board is a list of identical rows | **Fixed.** Asset cards: a picture of the thing, a ten-cell health gauge, the gain or the risk in plain words, the price and Start. Card to map and map to card both highlight. | README shot |
| 4. "Trees 1: $91,440/q" alone under Cash | **Fixed.** "Set costs a quarter: trees lv 1 $91,440 · standby lv 1 $76,200". The owners' preview has its own line. | Top bar |
| 5. CI perf re-run | The failed 1.13.0 run was re-run and passed. One GitHub-runner failure in about a dozen runs: `frequency.test.ts` measured 70 ms against a 60 ms budget. The limit was not loosened. **Owner decision:** keep the wall-clock budgets in CI and accept an occasional red run, or run them locally only. | Run 44999000332 |
| 6. Merged worktrees and stale branches | **Done.** Two stale worktrees pruned. Only `master` exists, locally and on GitHub. | `git worktree list`, `git ls-remote --heads` |

## The gate
| Gate item (from CRITIQUE-1.13) | Result |
|---|---|
| 1. An independent fun-critic tester | **Not met.** A single Sonnet tester was started on a Harbour City year and stopped at the API usage limit before it reported. Moved to 1.15. |
| 2. The three carried findings (storm guide in the city, the Q4 report's look-ahead line, early warning of short firm capacity) | **Not done.** Moved to 1.15. |
| 3. Planner on Home Counties seed 11 and High Moor seed 1 | **Not done.** Moved to 1.15. |
| 4. Carried: listening, real-GPU fps, physical pad | **Owed** |

## What is still weak (seen in this layer's shots)
- Picking a card rebuilds the drawer, and it scrolls back to the top. The outlined card can end up below the fold.
- The picked section's highlight on the map is faint over Harbour City's trenches.
- On a crowded map, a few village names are now left out (Harbour City shows 6 of 9 at desktop size; 1280 px shows fewer). That is better than printing them over the houses, but a hover name would bring them back.

## Owner-concerns audit
- **Honest numbers:** the card's words come from the same engine values as before (expected SAIDI change; failure probability and emergency cost).
- **Scores:** no outcome changed. Rules bundle 1.14.0 accepts game 1.14.0 and is vendored locally.
- **Public repo:** pre-push scan clean. The README claims only what is in this build.

## Gate for 1.14 → 1.15
| # | Item | Acceptance |
|---|---|---|
| 1 | An independent fun-critic tester on a Harbour City or Storm Coast year | Scores recorded; top 3 fixed or carried |
| 2 | Keep the drawer's scroll when a card is picked; a stronger map highlight for the picked section | Shot |
| 3 | The three findings carried from 1.13 | Fixed or argued |
| 4 | The planner on Home Counties seed 11 and High Moor seed 1 | Explained or fixed |
| 5 | Owner decision on CI wall-clock budgets | Recorded |
| 6 | Carried: listening, real-GPU fps, physical pad | Stated as met or owed |
