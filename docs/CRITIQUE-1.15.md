# CRITIQUE 1.15: "Into the Light" (2026-11-23)

**What this layer is:** LOOK2 phase B. The finale (chapter 9, L28) is now drawn in 3D and played end to end. The other chapters and the Career keep the classic 2D look and carry a "Classic" chip. The chapter choice is DECISIONS 15; the trade-offs and cuts are DECISIONS 14, 16 and 17.

**Machine:** the 3D shots used an RTX 4090 (PRIME offload); the low tier used the Ryzen iGPU (RADV). Load came from other sessions. We ran at most 4 vitest workers and one Godot at a time.

## Gate (LOOK2 phase B)
| Item | Result | Evidence |
|---|---|---|
| Round 3 on the slice | **Partly met.** Relief, the grain fix, glass UI, labels and overlaps are fixed. Towns from play height are better at night and still pale by day. | docs/look2/r3-*.jpg, DECISIONS 16 |
| One chapter in the new look, end to end | **Met.** Chapter 9 (L28) is reachable from "See the finale in the new look" in every mode. | DECISIONS 15, r3-g-jobs.jpg |
| Human-style hand play through the real input path | **Met, with a caveat.** The playtester won first try with 3 lamps at $53.68M. The desk display had no GPU, so the run was software-rendered at 1 to 3 fps. | playtester report (below) |
| Tests and flows | **Met.** vitest 72 files / 1551 tests; Godot 26/26 suites. | `pnpm test`, `node scripts/test-godot.mjs` |
| Low tier usable on the iGPU | **Met after a fix.** An iGPU under Forward+ was getting medium: 118 ms a frame. It now gets low: 15 ms at 1280x800. There is a test for this. | f62a40c, r3-i-auto.jpg |
| Grain (owner) | **Fixed.** Mipmaps and VRAM compression on every 3D texture, detail fades with distance, TAA, FSR 1 on low. A test fails if mipmaps are off. | grain-before-after-*.jpg, grain-before-after-moving.mp4 |
| Engine text ("lowest voltage 0.000 pu") | **Fixed** by Anjali, with a test. | 09dffe8 |
| Design (Dagny's round 2 points) | **Met for the shelf** (it names no answer; the budget is $60M). **New findings carried** (DECISIONS 17). | 6cb670b, 85e9bcb |
| CI perf budgets | Run locally only. The manager decided this and it can be reversed (DECISIONS 8). | 252e9fb |
| Core | Picked up 6f29f8a. No code changes here. | 88decfd |

## Critics (once this layer)
- **Sigrid (art), 6/10, up from 5.5.** Met: relief, splat ground, soft field edges. Partly met: towers at play zoom, and one UI language (the jobs clipboard is still paper). Not met: towns from play height, and labels at 1280x800. After her review: terracotta roofs with sky fill, stars after dusk, a softer moon path, and labels hidden under the card and the report. The report also hides the tray, the job card and the radio log. Far streets glow by town and a warm core fades in. Still open: landmark silhouettes, a house LOD, and a far town by day.
- **Dagny (fun), 6/10, up from 5.5.** Fun 6, clarity 6, tension 4.5, return-tomorrow 4. The shelf's only real choice is the battery size, and "buy the bigger one" wins. The retry hint names the answer, and there is no live call during the run. All of it is carried to the next layer (DECISIONS 17).
- **Manager review.** Done: the finale card folds to a strip while the day runs, hills are drawn steeper (and the screen says so), and town glow at night. Cut and written down: the parts shelf moving into the bottom tray (DECISIONS 16).
- **Playtester (tired junior engineer, desk harness).** Report overlaps, a cream pin with white text, and labels through the glass: all fixed (b5be989, 2e1705f). 15 "Cannot convert argument" log errors: fixed. A dead first click on the finished-job pin: not reproduced, because that run was software-rendered.

## Owner-concerns audit (bible/05)
| | Concern | 1.15 |
|---|---|---|
| A | Game, not SaaS | The finale card folds while the day runs; the land is the screen. The run itself has no live call yet (Dagny). |
| B | Its own soul | A province lit by its own load flow; no borrowed look. |
| C | Realism, proportion, texture | Grain fixed. The map is compressed and hills are steeper, and the note on screen says both. Towns are pale by day from far away. |
| D | Readability, contrast | The pin is readable in glass, and no labels show through panels. At 1280x800 the scale note is shortened. Some text in the card is 12 px at 1920 (floor rule: 16 px, raised by the text floor pass). |
| E | Every control works | The card's fold toggle and the "See the finale" button are tested by hand in shots. The dead first pin click is unverified. |
| F | Scroll and input stability | The card scrolls above the dock at 1280x800; no new scroll paths. |
| G | Device classes | The iGPU tier is fixed and measured. The phone keeps its own card fold. Phone layout of the longer shelf: not checked. |
| H | Impatient first-timer | "See the finale" is on the jobs list. A first-timer still meets 2D in L01 (DECISIONS 15). |
| I | Logic integrity, ledger | The demolish refund bug is fixed (spun fuel). A dark bus no longer counts as a voltage reading. |
| J | Depth, realism of choice | The budget bites, but the choice is one battery size (carried). |
| K | Fun, long-term play | Return-tomorrow is 4; the comparison panel is empty for new players (carried). |
| L | Performance, graphics settings | 4090 high about 13 ms; iGPU low 15 ms. Software render (llvmpipe) 1 to 3 fps, not a target. |
| M | Sound | Unchanged; no one listened this layer. |
| N | Saves and quitting | Unchanged. |
| O | Release hygiene | The release script smoke-tests the Linux build headless before upload. Privacy scan of the pushed text: no paths or emails. |
| P | Visible status, honesty | The scale note is on screen, Classic chips on the jobs list, and this table. |
| Q | Cost, machine, tidiness | One helper at a time; one Godot at a time. |
| R | Story and world | Unchanged. |
| S | Cute that teaches | Not touched in 3D. |
| U | README, screenshots, releases | README, site and wiki lead with the 3D town, towers at dusk, and the blackout and town-lights GIFs. |
| V | Where effort goes | Look (most), design (shelf), engine text (Anjali). |

## What is still weak
- A far town by day is a pale texture, with no landmarks.
- The finale has one real choice, and the run is watch-only.
- The jobs list is paper over the glass HUD.
- No one has played the new look on a real GPU by hand: the hand play was software-rendered.
