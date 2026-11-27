# CRITIQUE 1.19: "Powerhouse" (2026-11-24)

**What this layer is:** LOOK2 phase D, first release (DECISIONS 27).
- The prologue (P0) runs in the 3D province. Coal and gas plants are drawn: hall, boiler, chimney with red lights, cooling towers, stacks.
- WO-04 and WO-06 are 3D places (Bench3D): a waterfall powerhouse with the alternator inside, and a 15 km town line between a generator hall and a town.
- The benches are played by pad. The numbers you must predict show "?" until you predict.
- CRITIQUE-1.18's top three: the Mainland (woods with natural edges, fields with headlands, greener pasture, a church and water tower); the mill yard (lit concrete with floodlights); L05/L29 hand play.

**Machine:** RTX 4090 (PRIME offload) for the 3D shots and hand play; the Ryzen iGPU (RADV) for the low tier. At most 4 vitest workers, one Godot window at a time (shared lock).

## Gate
| Item | Result | Evidence |
|---|---|---|
| 1. P0 in 3D | **Met.** Opens behind a lit coal plant looking along the line to the city; at the first trip the camera turns to the city (Dagny, GPU, CB_CAM unset). | KEY_p0_before_trip, KEY_p0_turned_to_city (scratch); bay_lights_truth |
| 2. L04, L06 as 3D places | **Met.** bench3d_truth 253 checks; ch2_flow 37; text_flow audits both 3D benches at 1920x1080 and 1280x800. | bench3d_truth; text_flow 5347 |
| 3. Benches by pad | **Met after two fixes.** Ravi could not reach the controls by pad (blocker): fixed (61acbe2). The fix cut the pad off from the radio's "why?": fixed with B (29495b3). ch2_pad_truth 48. Dagny won both by pad only. | ch2_pad_truth; padb/left1.png |
| 4. The prediction counts | PENDING | |
| 5. Top three from 1.18 | **Mainland, mill: met as art work; Sigrid's score below. L05/L29 hand play: partly.** Ravi played both by pad on the GPU from CB_LEVEL; he never finished a line by pad (the survey cursor steps about 60 px, A was silent at times, Y jumped to the wrong yard on L29). No one has played them with a mouse at full speed. | Ravi's frames; wiki NOT_CHECKED |
| 6. Tests | vitest 1614 of 1614 (after regenerating the wiki, see Process). Godot flows: PENDING. | |
| 7. Low tier on the iGPU | **Met.** CB_QUALITY=low, GPU=amd, 1920x1080: P0 60 fps (21 ms frame), L04 55-56, L06 52-57, L05 59-60. All readable. The P0 towers read as flat cones; the L04 hall is dark inside. | scratch low119/sheet.jpg |
| 8. Critics | Sigrid 7/10 flat (before her fixes); Dagny below. | |

## Decisions this layer
- **N×B×A·ω and the scope trace stay on screen on L04** (Kofi asked). They are the working; the prediction is the last multiplication. Dagny then showed the trace turning green on target gave the answer away: the colour is held neutral until you predict.
- **The drawer's "Place" for settings with no form** now says "Set this on the panel at the bottom." on every level (84 actions, L04-L36). On some levels there may be no such panel: to be checked level by level in 1.20.
- **text_flow minimum** went 5299 -> 5295 -> 5347 (DECISIONS 28).

## What is not done (written down, not hidden)
- **Nothing is at stake once you press run** (Dagny). L04 and L06 run their evening in about 6 s and nothing happens; P0's cascade is about 8 s. One event per evening that tests the design is a 1.20 design item.
- **L06 has nothing to come back for:** the cheapest pass is the obvious one (Dagny return-tomorrow 4).
- **P0 frequency** reads "lowest 14.65 Hz". Real units trip near 47.5 Hz. For the domain engineer.
- **L05/L29 survey by pad** cannot finish a line. Not fixed this layer.
- **L05 woods** still read as flat green masses from the default view (Dagny); the town's "dark" tag floats over a field.
- **P0 towers** look like plastic at both tiers; steam reads as specks.
- **The mill yard** has no stock or trucks; the Mainland town has no square.
- **Toolbar labels** truncate at 1920 ("Concr…").
- **Classic look** not shot on the GPU this layer (covered headless only).
- **Sound** unheard by any human. **Windows** and **macOS** builds unplayed by a person.
- **core/qa/padstop.sh kills by pattern** (pkill -f). Filed to core (factory board/core-requests.md); our helpers stop pad servers by PID.

## Process
- My version bump (2c92891) did not regenerate the wiki. wiki.test caught it in the full vitest run before any tag (4121242). Same slip as 1.18's first tag. Rule for me: `pnpm wiki` after every CHANGELOG or version edit.

## Critics
- **Sigrid (art), 7/10 flat** at her first pass: P0 5, L04 7.5, L06 6.5, Mainland 7, mill 6.5, towns 6.5, low tier 5.5. Her top three acted on (P0 opening behind a lit plant; field edges; the benches reworked). Re-score: PENDING.
- **Dagny (fun), pad only, GPU, 1920x1080:**

| | Fun | Clarity | Tension | Return | One thing that raises it |
|---|---|---|---|---|---|
| P0 | 7 | 6.5 | 6.5 | 6 | A cascade of 15 s or more, towns going dark one by one |
| L04 | 7 | 6.5 | 4 | 6 | A binding prediction, then one disturbance in the evening |
| L06 | 6 | 5.5 | 4.5 | 4 | A binding prediction and a coach line that names the failed check |

  Her best moment: on L04, a big coil with few turns at full field uses 66 kg of copper for $738 against 105 kg for $1,167. Her top three: the prediction did not count (re-predict after the reveal still earned the lamp); L06's coach named the wrong fix; nothing at stake during the run.
- **Ravi (playtester, 16, pad, GPU):** P0 finished. L04/L06 blocked by the pad (fixed). Answers shown before the prediction (fixed). L05/L29 survey by pad never finished a line (open).

## Owner-concerns audit (bible/05)
| | Concern | 1.19 |
|---|---|---|
| A | Game, not SaaS | The benches are places: a powerhouse by a waterfall, a line to a town. |
| B | Its own soul | The P0 city going dark, seen from the plant that caused it. |
| C | Realism, proportion, texture | Plants with towers and chimneys; woods with edges. Towers plastic, woods flat at distance (open). |
| D | Readability, contrast | Both 3D benches audited at 16 px at two sizes. Toolbar truncation (open). |
| E | Every control works | Benches by pad end to end, B back to the radio. L05/L29 survey by pad does not finish a line (open). |
| F | Scroll and input stability | Numpad OK no longer takes a stray A: PENDING. |
| G | Device classes | 4090 hand play; iGPU low 52-61 fps on four levels. Phone not checked. |
| H | Impatient first-timer | P0 opens on the plant and turns to the city at the trip. |
| I | Logic integrity, ledger | Prediction lamp: PENDING. |
| J | Depth, realism of choice | L04's copper trade-off is real (Dagny). L06's cheapest pass is obvious. |
| K | Fun, long-term play | Tension 4 to 4.5 on the benches: nothing happens during the run (1.20). |

Ingrid Solheim, Game Lead, GRID
