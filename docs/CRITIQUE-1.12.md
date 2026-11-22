# CRITIQUE 1.12: "Tension" (2026-11-22)

**Tested against** the gate in [CRITIQUE-1.11.md](CRITIQUE-1.11.md) and the coordinator's review of the three district shots. The Opus iterator ran these:
- `src/career/tension.test.ts`: the scripted players on Home Counties, Harbour City, Storm Coast, Lean Years and High Moor, with four seeds each.
- The persona sweep (50 seeds), `ground.test.ts`, regenerated weekly samples, `scores-release.test.ts`.
- Desk shots of the three districts at 1920×1080, and L20 with a part in hand.
- `text_flow` and `career_flow` (including the phone fit).

**Machine:** load 16-37, from other sessions. One Godot at a time. The perf budgets failed under load and passed when re-run alone (31/31 at load 19).

## The coordinator's 1.11 review (fixed first)
| Note | Fix | Evidence |
|---|---|---|
| 4. Shipped 1.11.0 is unscorable | <ul><li>Rules bundle 1.11.0 accepts game 1.11.0 (same outcomes as 1.10, epoch 4) and is vendored locally.</li><li>`release-local.sh` stops when `gameVersions` lacks the tag's version, or when that bundle is not vendored in the sibling cobanana-scores checkout.</li><li>`scores-release.test.ts` checks the same in CI.</li></ul> | Commit b8479e3; scores repo commit f121fdf (local) |
| 1. Same skeleton in all three districts | <ul><li>**Harbour City** is a street grid down to the waterfront. Its cable routes run down, across on their own street, down and jog toward their ring partner, all on the street lines. Dockside cranes, a tram on the high street, and the spare ducts if you laid them.</li><li>**High Moor** has the market-town primary by the villages and one far up the moor. Its feeders run long trunks down their own valleys. The engine agrees: the far primary's first sections are 2.5× long.</li><li>**Home Counties** is unchanged.</li></ul> | `docs/readme/new112/city.png`, `moor.png` |
| 2. "Rabbit wire" in Harbour City | <ul><li>Real 11 kV cable: 70, 95, 185 and 300 mm² Al XLPE, with IEC 60502-2 typical R, X and ampacity. Reconductoring upsizes within the cable family.</li><li>The strip reads "underground cable".</li><li>Recloser, hardening, tree clearance and tree budget are refused on cable, each with the reason, and the tree card is hidden. A cable feeder carries no vegetation, so storms no longer scale with trees that are not there.</li><li>The reconductor blurb is neutral.</li></ul> | Section card in the shot; `CABLES_11KV` in `sim/distrib/data.ts` |
| 3. Feeder lines are schematic strokes | Overhead sections are drawn as poles along the road with sagging spans; cable sections as a dark trench strip with the route dashed in its colour, and joint bays. Village and place labels are drawn over the lines. | The same shots |
| 5. Cash tension proven by the scripted players | See below | `tension.test.ts` |

## Cash tension
| Player | Result over 5 districts × 4 seeds |
|---|---|
| Planner (careful) | Never fails. Peak cash under 10, end cash under 5. Chief Engineer in 9 of 36 runs across nine districts × four seeds (11 in 1.11): the tighter money costs the planner two Chiefs. |
| Reactive only (faults and failures, every connection, no reinforcement) | Loses the licence in every case except High Moor seed 23, where the light load lets it last ten years at under half the planner's score |
| Late firefighter (also reconductors a feeder once it sheds hours a year) | Never Chief. Total score under 0.75× the planner in every district. Steady or revoked. |
| Gold-plater | Fails everywhere |

The mechanisms:
- **Owners:** 60 % of the cash above 3 + a year of committed instalments, at each review.
- **NARM-style close:** unspent replacement funding is returned with a 2.5 % penalty, when health fell over the period.
- **Rota load shedding:** applies past the 125 % emergency rating. It is what makes a never-reinforce strategy fail: the 1.11 firefighter had run feeders at 250 % with no consequence.

## The gate
| Gate item (from CRITIQUE-1.11) | Result |
|---|---|
| 1. Cash bites in every district | **Met**, shown by the scripted players above rather than by a constant |
| 2. L20 placement and the Run lever | **Met.** The part in hand follows the pointer, labelled. A miss keeps it and names the pegs. The lever has its own green panel. Full-day runs say "Run the day". |
| 3. Report and HUD truth | **Met.** The red-bar-but-on-track line is explained. Tree level and standby show on the top bar (in the cash tooltip on a phone). Requests can be declined. |
| 4. Harbour City landmarks | **Met.** Tram, cranes and the ducts under the high street. |
| 5. Carried: listening, real-GPU fps, physical pad | **Owed**, all three |

## Owner-concerns audit (games-bible 05)
| Group | Pass/Fail | Evidence |
|---|---|---|
| A game, not SaaS | Pass | The map is now three different places, and lines are poles or trenches |
| B own soul | Pass | Night, sodium light, paper; the city's cranes and tram |
| C realism | Pass | Cable data from IEC 60502-2; auto-reclose off on cable; rota disconnection; a NARM-style clawback; dividends |
| D readability | Pass | `text_flow` green in all three looks. Labels drawn over the lines. |
| E every control works | Pass | Decline, the cable refusals and the tree card are covered by `career_flow` |
| F scroll and input | Pass | The phone fit was re-checked after the standing-charges line (it moved to the cash tooltip) |
| G devices | Mostly | Phone fit on desktop. **Still owed:** a phone, a Deck, a physical pad. |
| H learnable | Mostly | The miss message names where a part goes. No fresh tester on 1.12. |
| I logic integrity | Pass | Engine tests green; samples regenerated under rules 1.12.0 |
| J depth | Pass | Spend or save is now a real choice |
| K fun | Not measured | No tester this layer (load 16-37) |
| L performance | Pass (alone) | Perf budgets re-run alone |
| M sound | Mostly | Listening pass owed |
| N saves | Pass | New action token `n:` (decline); old codes still replay |
| O release hygiene | Pass | The scorable-build check is added |
| P status and honesty | Pass | The High Moor exception is stated in the test and here |
| Q cost and machine | Pass | No helpers (load over 12) |
| U README | Pass | "What's new in 1.12": two district shots and L20, each read |

## What still fails (harsh, ranked)
1. **No fresh tester on 1.12.** The money change alters the Career's feel the most, and no new player has felt it.
2. **Storm Coast seed 1:** the late firefighter outscores the planner. The planner's storm play is weak there.
3. **Harbour City's network** has the same feeder count and ties as the others; only its layout, lengths and cable differ.
4. Still owed: listening, real-GPU fps, a physical pad, a phone and a Deck.

## Gate for 1.12 → 1.13 "Fresh eyes"
| # | Item | Acceptance |
|---|---|---|
| 1 | A fun-critic tester on 1.12's money (a full Harbour City year with a review) | Scores recorded; top 3 fixed or carried |
| 2 | The planner on Storm Coast | Beats the late firefighter on all four test seeds |
| 3 | Carried: listening, real-GPU fps, physical pad | Stated as met or owed |
