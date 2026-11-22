# CRITIQUE 1.10: "New districts" (2026-11-22)

**Tested against** the gate in [CRITIQUE-1.9.md](CRITIQUE-1.9.md) and the coordinator's review of the 1.9 shots. The Opus iterator ran these:
- `tests/text_flow.gd`, now covering the Career in all three looks at both sizes.
- `src/career/ground.test.ts`: the districts' lessons as tests.
- Planner, idle and firefighter careers on four seeds per district.
- Desk shots of each district at 1920x1080, and High Moor at 1280x800.

**Machine:** load 9-14 (another session's jobs). One Godot at a time.

## The coordinator's 1.9 shot review (fixed first)
| Note | Fix | Evidence |
|---|---|---|
| 1. The Career map is still a schematic | <ul><li>Ground by district: patchwork fields; city blocks and a harbour; moor contours, stone walls and winter snow.</li><li>A named village per feeder, with clustered houses, lit windows and street glow. Windows go dark while a section or feeder is out.</li><li>The story's places (the hospital, the villages, the charging hub, the turbine) are drawn on their feeders with paper labels.</li></ul> | `docs/readme/new110/*.png`: St Brigid's stands on F1, the feeder the hospital's letter names. |
| 2. Top bar: a dark strip, small numbers, 50-dot timeline | <ul><li>A paper wall planner: ten year columns of four boxes, spent quarters crossed, the current one circled in red, reviews ticked or crossed.</li><li>Cash in 30 px.</li><li>"Minutes off per customer (SAIDI)" and "Power cuts per customer (SAIFI)" gauges, which wrap on narrow screens.</li></ul> | Same shots; the 1280x800 shot fits with End quarter on screen. |
| 3. The red warning line | A pinned note with one instruction ("Off target, strike 1 of 3 at the review. Start a fix on the worst feeder this quarter (4 left this year)."). The full sentence is its tooltip. | Same shots. |
| 4. Use the five unread story flags | <ul><li>`cutVegEcho`: the trees you stopped cutting come down.</li><li>`evReturn`: the hub comes back.</li><li>`ownersReturn`: the owners ask for the incentive.</li><li>`auditResult`: Okafor audits the plan.</li><li>`inesHonest`: the hospital remembers.</li></ul> | `story.ts`. Each fires only from its flag. |
| 5. Districts differ in what they teach and how they look; an opening shot each | Harbour City (cable) and High Moor (long overhead lines, winter), below | Three opening shots in the README. |

## What the districts teach (tested in `ground.test.ts`)
| | Home Counties | Harbour City | High Moor |
|---|---|---|---|
| Ground | Overhead, fields | Underground cable, streets, harbour | Long overhead spans, hills |
| Expected SAIFI (seed 5) | 3.26 | 0.48 | 8.8 |
| Minutes per interruption | ~195 | ~730 (16 h jointing) | ~195 |
| What a recloser saves | the fuse-blown transients (30 %) | nothing (a cable fault is permanent) | most faults (transient share 0.9) |
| Storms | ordinary | rare (×0.25) | winter-heavy (×2.2 in Q1) |
| Own letters | — | spare ducts under the high street; soil sensors before a dry summer | snowcat in the drifts; a farm turbine on the villages feeder |
| Planner outcome (seeds 1, 5, 11, 23) | 2 Chief, 2 steady | 1 Chief, 3 steady | 3 Chief, 1 steady |

## The gate
| Gate item (from CRITIQUE-1.9) | Result |
|---|---|
| 1. A fun-critic tester on the Career's first year with the story, and L20 | **Not met.** Load hovered at 9-14 and the desk was needed for the suite and the shots. Carried, with priority, to the next layer. |
| 2. At least one new map with its own terrain and its own people; own beats; passes `text_flow` | **Met.** <ul><li>Two districts, each with its own ground, names, primaries and letters.</li><li>`text_flow` covers both at both sizes.</li></ul> |
| 3. The Career's top bar drawn, not tabulated | **Met.** A wall planner and a ledger, read at 1920x1080 and 1280x800. |
| 4. Carried: listening pass, idle and real-GPU fps, physical pad | **Owed**, all three. |

**Verdict:** the Career now looks like a place with a calendar on the wall, and three districts that need different answers. A fresh tester has not yet played any of it.

## Owner-concerns audit (games-bible 05)
| Group | Pass/Fail | Evidence |
|---|---|---|
| A game, not SaaS | Mostly | The map is a place and the top is a wall planner. The board is still a list of cards from quarter 4 on. |
| B own soul | Pass | Paper, ink, red pen, sodium light, lit windows; each district has its own palette and names. |
| C realism | Pass | <ul><li>Cable faults are rarer and longer.</li><li>A recloser cannot clear a cable fault.</li><li>Upland lines see mostly transient faults and winter storms.</li><li>Dry soil derates a cable.</li><li>Values carry their `source` strings, marked `recall: true`.</li></ul> |
| D readability | Pass | `text_flow` green in all three looks at both sizes. Village names that would touch their neighbour are left out. |
| E every control works | Pass | No new controls; the story cards are the 1.9 paper buttons. |
| F scroll and input | Not re-checked | — |
| G devices | Mostly | 1920x1080 and 1280x800 audited. **Still owed:** a phone, a Deck, a physical pad. |
| H learnable | Mostly | <ul><li>Each district's chooser text says what it teaches.</li><li>The pinned note says what to do.</li><li>No fresh tester (owed).</li></ul> |
| I logic integrity | Pass | Engine tests green, including `ground.test.ts` and `story.test.ts`. The weekly rotation is pinned. |
| J depth | Pass | Three districts that reward different builds; 27 beats with follow-ups. |
| K fun | Not measured | No tester. |
| L performance | Not measured | The map draws more polygons; no perf regression checked on the desk this layer. |
| M sound | Mostly | Unchanged; listening pass owed. |
| N saves | Pass | District and answers are in the career code (C2/seed/city/...). |
| O release hygiene | Pass | `release-local.sh` with the Linux smoke-run before upload, SHA256SUMS, Windows zip. |
| P status and honesty | Pass | Owed items stated; "wire" in Harbour City noted. |
| Q cost and machine | Pass | No helpers. One Godot at a time. |
| R story | Pass | The story follows into the districts, with local names and echoes of earlier answers. |
| S cute | Not checked | — |
| U README, screenshots, releases | Pass | A "What's new in 1.10" strip with an opening shot per district, each read. |
| V where effort goes | Planned | Presence next, then the tester. |

## Scores
No tester. The 1.7 fun-critic scores stand.

## What works
- **The hospital's letter points at a building on the map.**
- **Harbour City turns the usual habits upside down.** Trees and reclosers are worthless; ties are everything.
- **The wall planner** shows ten years at a glance, and the pinned note says what to do this quarter.

## What still fails (harsh, ranked)
1. **No fresh tester for three layers.** This is now the biggest risk.
2. **The quarter-4 board** is still a long list of cards.
3. **No physical pad, Deck or phone. No listening pass.**
4. **Harbour City's cables are drawn and described as overhead "wire".**

## Gate for 1.10 → Presence
| # | Item | Acceptance |
|---|---|---|
| 1 | The site at grid.blackmetal.tech and the player wiki generated from the Codex | Hero checked at 2560, 4K and phone widths; download buttons resolve the latest release; real shots only |
| 2 | A fun-critic tester (Career year 1 in one district plus L20) | Scores recorded; the top 3 findings fixed or carried |
| 3 | Carried: listening pass, idle and real-GPU fps, physical pad | Stated as met or owed |
