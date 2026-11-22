# CRITIQUE 1.11: "Presence" (2026-11-22)

**Tested against** the gate in [CRITIQUE-1.10.md](CRITIQUE-1.10.md). The Opus iterator ran these:
- The site served locally and live, screenshotted in headless Chromium at 390, 1440, 2560 and 3840 px wide; each shot read.
- `src/wiki.test.ts`: the wiki is fresh, holds no unrendered key or placeholder, and every image it references exists.
- Facts on the site and wiki checked against the engine: customers per district (39,618 / 51,503 / 15,847 on seed 5), the sustained-interruption threshold (5 min, IEEE 1366, from `sim/distrib/reliability.ts`), release asset names.
- One Sonnet fun-critic tester (Harbour City year 1, two High Moor quarters, L20). Scores below.

**Machine:** load 10-28 (other sessions' jobs). One Godot at a time: the tester had the desk, and the suite ran after.

## The gate
| Gate item (from CRITIQUE-1.10) | Result |
|---|---|
| 1. The site at grid.blackmetal.tech and the player wiki | **Met.** <ul><li>Deployed by the pages workflow with a CNAME; HTTPS serves.</li><li>The hero is content-height with a real finale shot; at 2560 and 3840 the page scales up instead of leaving a narrow column; on a phone the copy and buttons come first.</li><li>Download buttons resolve the latest release's Linux and Windows zips (v1.10.0 at the time) and mark the visitor's OS.</li><li>Only real shots, plus one GIF recorded in the game.</li><li>The wiki is generated from the game's own text by `scripts/wiki.ts`. GRID has no Codex screen, so it uses the work orders, radio lines, coach steps and Career text.</li></ul> |
| 2. A fun-critic tester (Career year 1 in one district plus L20) | **Met.** A Sonnet fun critic (strategy-sim player) played Harbour City for six quarters with the year-1 review, two High Moor quarters, and L20 to three lamps from the guidance alone. Its top findings are carried, ranked, to 1.12 (below). |
| 3. Carried: listening pass, idle and real-GPU fps, physical pad | **Owed**, all three. |

## Owner-concerns audit (games-bible 05)
| Group | Pass/Fail | Evidence |
|---|---|---|
| A game, not SaaS | Pass (site) | Paper cards, sodium lamps, a taped screenshot; steps are real shots, not feature panels. |
| B own soul | Pass | The game's palette and fonts. |
| C realism | Pass | Site and wiki claims checked against the engine; two wrong claims (a 3-minute SAIFI rule, 40,000 customers in every district) caught and fixed before push. |
| D readability | Pass | Read at four widths. |
| G devices | Mostly | Site at phone width checked; the game itself still owes a phone, a Deck, a physical pad. |
| K fun | See scores | |
| O release hygiene | Pass | `release-local.sh` with the Linux smoke-run, SHA256SUMS. |
| P status and honesty | Pass | The README alpha callout says what has and has not been played. No Codex and no Discussions are stated as gaps. |
| Q cost and machine | Pass | One tester, run when load allowed; one Godot at a time. |
| U README, screenshots, releases | Pass | Link row with site and wiki; "What's new in 1.11" with the site at 2560 and a wiki page; a GIF. |

## Scores
| Criterion | 1.7 fun critic | 1.11 fun critic |
|---|---|---|
| Hook (minute 1) | 8 | 7 |
| Reason for hour 2 | 6 | 6 |
| Juice (muted) | 5 | 5 |
| Clarity | 6 | 7 |
| Career fun | 4 | 6.5 |
| Overall | 6 | 6.5 |

Career fun moved from 4 to 6.5 since 1.7: the story, the guide and the pinned note work. The tester said that "a quarter is a clear beat" and that the guidance is "the strongest part".

## What still fails (harsh, ranked)
1. **Cash never bites.** On Harbour City cash climbed from $6.4M to $9-11M with no spend-or-save trade-off (major).
2. **L20: a tray tool gives no feedback when selected.** The target bus is a small "B1" label and clicks on tiles do nothing silently (major).
3. **L20: the Run lever sits beside the speed buttons**, and the first click hit 2×. It says "Run the night" on a day job (major).
4. **The quarter report's red bars and its "On track" line disagree** mid-year. It needs the one line saying the yearly average counts (minor).
5. **Standby and tree levels are charged every quarter with no HUD chip**, so a storm can ambush the player (minor).
6. **Requests have no Decline.** The feeder locator looks like one (minor).
7. **Harbour City still reads as a diagram with a river.** It needs landmarks (tram, crane, the high-street dig) (polish, but it is owner note 1).
8. **The panel scroll jumps after a click**, and the pinned note scrolls away (minor).
9. Still owed: a listening pass, real-GPU fps, a physical pad, a phone and a Deck.

Fixed in this layer from the 1.10 list: Harbour City sections now read "underground cable" and are drawn with joint bays and a trench line, not poles. They still carry overhead conductor names (Weasel, Dog), which is wrong for a cable; carried to 1.12.

## Gate for 1.11 → 1.12 "Tension"
| # | Item | Acceptance |
|---|---|---|
| 1 | Cash bites in every district | A planner that buys everything it is offered runs short by year 3 in at least 3 of 4 seeds; tested |
| 2 | L20 placement and the Run lever | A selected tool shows a ghost and pulses its legal buses; Run is visually distinct; the label matches the job |
| 3 | Report and HUD truth | The report's colour and verdict agree; standing standby and tree costs show on the HUD; Requests can be declined |
| 4 | Harbour City landmarks | A tram line, a harbour crane and the story's dig drawn where they sit |
| 5 | Carried: listening, real-GPU fps, physical pad | Stated as met or owed |
