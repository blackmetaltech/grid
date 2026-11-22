# CRITIQUE 1.9: "Storylines" (2026-11-22)

**Tested against** the gate in [CRITIQUE-1.8.md](CRITIQUE-1.8.md), plus the coordinator's review of the four 1.8 README shots. The Opus iterator ran these on the desk:
- `tests/text_flow.gd`: every screen at 1920x1080 and 1280x800, 5,048 checks.
- Desk shots of L20, L28, L36 and the Career before and after.
- A Career played on the desk through a storm call and a letter.
- A full ten-year career replayed to its ending sheet.
- An Opus story review of every beat. Its findings were applied before release.

**What was not run:** see the fun-critic row of the gate.

**Machine:** load 7-19 during the session (another session's jobs). One Godot at a time; no timing claims this layer.

## The coordinator's 1.8 shot review (fixed first)
| Defect | Fix | Evidence |
|---|---|---|
| pad-numpad: the pad strip overlaps itself ("Start menu" drawn over "P_max to score") | <ul><li>Legend shortened to "A select · B back · X run · Y tag · LB/RB parts · Start menu".</li><li>It breaks into two lines at the radio's width and sits on the bottom edge.</li><li>A layout check covers it.</li></ul> | `text_flow` checks on every level at both sizes that the strip is inside the window and overlaps no other text. |
| l20-order: a small island in an empty 1920x1080 screen; coach text about 10 px; tiny tray | <ul><li>The headroom for stacks and smoke is a share of the map, not a fixed 210 px.</li><li>The 16 px floor on all text.</li><li>Tray cells widened (86/96 px) and respaced.</li></ul> | `docs/readme/new19/l20-framed.png`: the town fills the screen. Coach, tray and control room are 16 px or more. |
| career-guide: a dark dashboard of 9-10 px panels | <ul><li>A clipboard of paper cards.</li><li>The quarter's job as a pinned work order in 26/20 px type.</li><li>The map drawn as the district at night (fields, river, roads and poles, lit houses, fenced substations).</li></ul> | Before: `docs/readme/new18/career-guide.png`. After: `docs/readme/new19/career-after.png`. |
| finale-4x: the event log and build checklist about 9 px | 16 px floor | Desk shot of L28 at 1920x1080: the checklist rows, the ticker and the tray are 16 px or more. |
| A test for text under 16 px on every screen at both sizes | `tests/text_flow.gd`, a test-godot step | It also fails on any hand-drawn string wider than its control. That caught seven more (ch3, ch4, ch7, ch8, the meters, two Career readouts). |

## The gate
| Gate item (from CRITIQUE-1.8) | Result |
|---|---|
| 1. A fun-critic tester on the Career's first year and L20 | **Not met.** Load was above 12 for most of the session, and the desk was in use by the Godot suite whenever it fell. Carried to 1.10. |
| 2. Career incidents become real choices with a storyline | **Met.** <ul><li>Seventeen beats from five people. Each has two answers with costs shown under the buttons ("costs $76,200", "the storm's customer-minutes 15 % more", "+1 crew for good", "900 kW more on F9").</li><li>Follow-ups come back: the hospital promise falls due in two years, kept or broken by what you built; the all-nighter leaves the crew short next storm; the rested crew offers to stay.</li><li>The Opus story review's fixes are in. Among them: hospital-first now lengthens the storm's total minutes, as Tobi warns; redundancy costs money; the weather argument is answered by whether it was true; trust has a mechanical edge (Tobi's crews ±5 % on storms).</li></ul> |
| 3. Endings that recap the run | **Met.** The ending sheet opens with where each person ended up, then "Ten years, in the answers you gave": one line per answer. Shot: `docs/readme/new19/ending-recap.png`. |
| 4. Carried: listening pass, idle and real-GPU fps, physical pad | **Owed**, all three. |

**Verdict:** the text and dashboard defects are fixed and guarded by a test. The Career now has people in it whose questions cost something. The fresh-tester check for 1.8's onboarding is still owed.

## Owner-concerns audit (games-bible 05)
| Group | Pass/Fail | Evidence |
|---|---|---|
| A game, not SaaS | Mostly | <ul><li>The Career drawer is paper cards, and the map is a place.</li><li>The top bar is still a dark strip of numbers (readable, not yet drawn).</li></ul> |
| B own soul | Pass | Night shift, sodium and paper throughout. Letters are cream paper with a brown edge. The cast has names and voices. |
| C realism | Pass | <ul><li>Story effects use the engine's own levers: tree cutting, hardening (storm faults ×0.4), crews, load on a feeder.</li><li>The hospital promise is judged by the feeder really having a tie or a remote switch.</li><li>The weather argument is judged against the year's exceptional minutes.</li></ul> |
| D readability | Pass | 16 px floor on every screen at both sizes, enforced by `text_flow`. The Career's guide card is the largest text on screen. |
| E every control works | Pass | <ul><li>Story buttons are ordinary paper buttons (pad focus ring, A acts).</li><li>The career flow answers a call and a letter through the UI.</li></ul> |
| F scroll and input | Mostly | A long incident sheet scrolls ("more"). Wheel and pad scroll were not re-checked. |
| G devices | Mostly | 1920x1080 and 1280x800 are audited by the test. **Still owed:** a phone, a Deck, a physical pad. |
| H learnable | Mostly | <ul><li>Each answer shows what it does before you press it.</li><li>An unanswered letter says what happens.</li><li>No fresh tester (owed).</li></ul> |
| I logic integrity | Pass | <ul><li>1,511 engine tests, including `story.test.ts`. Answers move outcomes in the stated direction; a lapse is trust-only; promises come due; codes replay exactly.</li><li>The scores samples were re-scored under rules 1.9.0 (epoch 3).</li></ul> |
| J depth | Pass | <ul><li>Trust now matters to storms.</li><li>The hospital promise ties a letter to the build plan two years later.</li><li>The wing and the charging hub put real load on the weakest feeders.</li></ul> |
| K fun | Not measured | No tester (load). |
| L performance | Not measured | No perf work this layer. |
| M sound | Mostly | Unchanged; the listening pass is owed. |
| N saves | Pass | Answers are in the career code, so Continue replays them. |
| O release hygiene | Pass | v1.9.0 via `release-local.sh`: Linux smoke-run before upload, SHA256SUMS, Windows zip. |
| P status and honesty | Pass | The tester, pad, GPU and listening gaps are stated as owed. |
| Q cost and machine | Pass | <ul><li>One Opus reviewer, run while load was under 12.</li><li>One Godot at a time.</li><li>Exact PIDs only.</li></ul> |
| R story | Pass | <ul><li>Five characters: three were already the review voices; Tobi is also the level coach.</li><li>Seventeen beats across ten years.</li><li>Epilogues by trust.</li><li>An Opus review was applied.</li></ul> |
| S cute | Not checked | — |
| U README, screenshots, releases | Pass | A "What's new in 1.9" strip of four shots, each read: the letter on the desk, the storm call, the ending recap and the L20 framing. Career before and after are linked. |
| V where effort goes | Planned | See the gate. |

## Scores
No tester this layer. The 1.7 fun-critic scores stand: hook 8, hour-2 reason 6, juice 5, clarity 6, Career fun 4, overall 6.

## What works
- **Nothing on screen is under 16 px, and a test keeps it that way** at both sizes on every level.
- **The Career looks like GRID.** Paper on a clipboard, a district at night, and a work order you can read from across the room.
- **Letters with weight.** "Put it in writing" for the hospital is the warm answer, and it becomes a broken promise two years later if the plan never reaches F1.

## What still fails (harsh, ranked)
1. **No fresh tester** for two layers now: the Career onboarding, L20, and now the story.
2. **The Career's top bar** is still dashboard chrome: a timeline of dots and a row of KPIs.
3. **No physical pad, Deck or phone.**
4. **No person has listened to the music.**
5. **Five story flags are set and not read yet:** evWait, reinvested, cutVeg, auditPlan and honestInes. They are candidates for 1.10 follow-ups.

## Gate for 1.9 → 1.10 "New districts"
| # | Item | Acceptance |
|---|---|---|
| 1 | A fun-critic tester on the Career's first year with the story, and on L20 | Knows what to do in quarter 1 within 5 s; answers a letter knowing its cost; builds before running L20 |
| 2 | New districts: at least one new map with its own terrain and its own people | Has its own story beats and passes `text_flow` |
| 3 | The Career's top bar drawn, not tabulated | Shot read at 1920x1080 and 1280x800 |
| 4 | Carried: listening pass, idle and real-GPU fps, physical pad | Stated as met or owed |
