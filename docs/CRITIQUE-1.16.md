# CRITIQUE 1.16: "Mill Town" (2026-11-23)

**What this layer is:** LOOK2 phase C.
- The finale now has real choices: a $53.5M budget, two calls during the run, and a report that does not name the answer.
- Chapter 3 (L07 to L09) is drawn in 3D.
- Towns have landmarks, and day has a palette.
- The work order and the jobs list are glass.
- The release workflow is green.

**Machine:** the 3D shots and the hand play used an RTX 4090 (PRIME offload), and the low tier used the Ryzen iGPU (RADV). We ran at most 4 vitest workers and one Godot at a time.

## Gate (LOOK2 phase C)
| Item | Result | Evidence |
|---|---|---|
| Site first: no classic shot above the fold | **Met.** "How it plays" uses new-look shots, reshot for 1.16. Classic shots sit under a labelled heading. Sigrid confirms nothing classic is above the fold. | site/index.html, 5fb44e1 |
| Finale real choices (Dagny, DECISIONS 17) | **Met.** The budget is $53.5M, so the safest set does not fit. There are two live calls (spin U4 at the radio's call; open the north feeder at the lightning). The hint gives the draw and the window. A domain fix holds an operator's shed. Goldens and the wiki moved in their own commits. | DECISIONS 20, aa0d464, 9498007, 43b3a7f |
| Towns by day and landmarks (DECISIONS 16) | **Partly met.** Windows no longer glow by day. Spires are dark and tall, and there is a 140 m chimney in towns of 14 homes or more. Day has fields. At the default 3.6 km view the landmarks are still thin (Sigrid). | r4-*.jpg, DECISIONS 22 |
| Jobs list and tray in glass | **Met** for the jobs list and the work order. The tray was already glass. | r4-a, r4-b |
| Next chapter in 3D, picked with Priya | **Met.** Chapter 3, because it is all grid levels whose towns light on the player's flow (DECISIONS 21). We argued against chapter 1 because its bench levels have no towns to light. That case is reopened for 1.17 (manager point 4). | DECISIONS 21, 22 |
| Release workflow green | **Met.** macOS was dropped, and a manual run was green (run 45077979452). | DECISIONS 19 |
| Hand play on a GPU window at real speed | **Met, three rounds.** A playtester played by virtual pad only at real speed. Round 1 found that the jobs list could not be walked and that live-call focus was lost. Round 2 passed L07 with 2 lamps. Round 3 bought the parts and spun U4, but the island went dark: the lightning call came unseen. All of these are fixed except the dropped-A item below. **No hand play has won the 1.16 finale yet.** | scripts/gpu-play.sh, DECISIONS 22 |
| Tests and flows | **Met.** vitest 72 files / 1556 tests; Godot 26/26 suites; cobanana-scores 1608 tests with rules 1.16.0 vendored. | 2264c36 |
| Low tier on the iGPU | **Met.** L28 low: GPU 12.6 ms at 1280x800. L07 low renders. | r4/i-*.png (local), FRAMETIME log |
| Sound | **First pass.** An outdoor bed (wind by day, crickets at night) is made in code. No human has listened to it. | docs/ASSETS.md, 496087a |
| Gamepad in the new look | **Improved.** Job rows, the finale card, live calls and the pick cursor work by pad. A dropped A is still open. | db82b65, 24c1e8a |

## Critics (once this layer)
- **Sigrid (art), 6/10, flat.**
  - Met: one UI language.
  - Partly met: towns from play height and labels at distance.
  - Her findings:
    - the landmarks did not show at play height;
    - a cream "more" fade remained in the jobs list (an old shot; fixed in db82b65);
    - chapter 3 is a plain with a generic disc of town and no mill;
    - the scale note broke the 16 px floor.
  - Taken: a darker, taller spire, a 140 m chimney, a closer opening camera, and the scale note moved to the floor size below the clock. The mill is led into 1.17.
- **Manager review of round 4.**
  - Points taken: daylight was a drab olive (now pasture, crop and plough on warped plots), and the site leads with dusk shots.
  - Led into the 1.17 gate:
    - the mill as a place;
    - irregular town outlines;
    - cloud shadows;
    - the first impression (a 3D title and first job, or chapter 1 next).
- **Dagny (fun):** not re-run this layer. Her three points from 1.15 were answered by Mateo's design (DECISIONS 20), which she has not judged.
- **Playtester (second-year EE student, pad only, GPU, real speed), three rounds:** see the gate row. The student called L07 in 3D "lovely" and the incident reports "great teaching".

## Owner-concerns audit (bible/05)
| | Concern | 1.16 |
|---|---|---|
| A | Game, not SaaS | The run now has two decisions, and the lightning pauses for the second. |
| B | Its own soul | A province lit by its own load flow. Chapter 3 lacks its own place: the mill (1.17). |
| C | Realism, proportion, texture | Day palette added. The map is compressed and the screen says so. Towns are perfect discs (1.17). |
| D | Readability, contrast | The scale note, the L08 card header and the L09 card key are fixed. The "more" cue fades into glass. |
| E | Every control works | The jobs list, finale card, live calls and pick cursor work by pad and were tested by hand. **Open:** an A within about 3 s of a screen or speed change is sometimes dropped on the virtual pad. It is not reproduced; the idle cap is the first suspect. |
| F | Scroll and input stability | The jobs list and finale card scroll to the focused row. |
| G | Device classes | iGPU low measured. Phone layout of the live calls is not checked. |
| H | Impatient first-timer | A first-timer still meets 2D in chapter 1. Decided for 1.17 with Priya. |
| I | Logic integrity, ledger | The shedHold domain fix has tests. Live spin is priced for the hours left. The determinism fix in niceUp. |
| J | Depth, realism of choice | The safe set does not fit. The 2-hour battery plus the north feeder is the cheap honest answer. The three-star window is narrow (Mateo's own argument against). |
| K | Fun, long-term play | Not re-scored. Return-tomorrow was 4 in 1.15. |
| L | Performance, graphics settings | 4090 high: 60 fps capped, 30 under the idle cap. iGPU low: 12.6 ms GPU. |
| M | Sound | Outdoor bed, made in code. No human has listened. |
| N | Saves and quitting | Unchanged. |
| O | Release hygiene | The workflow is green without macOS. Privacy scan of the pushed text: no paths or emails. |
| P | Visible status, honesty | Classic chips; this table; the hand play has not won the finale. |
| Q | Cost, machine, tidiness | One helper at a time; one Godot at a time; the GPU lock was honoured. |
| R | Story and world | The radio's two calls are new lines. |
| S | Cute that teaches | Not touched in 3D. |
| U | README, screenshots, releases | The README, site and wiki shots were reshot for 1.16: dusk, chapter 3 and the honest report. |
| V | Where effort goes | Hand-play fixes (most), design (Mateo), look (landmarks, palette, chapter 3). |

## What is still weak
- **The finale has not been won by hand in 1.16.** The fixes from round 3 have not been replayed.
- **Chapter 3 is a plain with a disc of town.** There is no mill.
- **Landmarks are thin at the default distance.**
- **A dropped A on the pad** is open and unexplained.
- **Sound** has had no human listener.
- **A first-timer starts in 2D.**

Ingrid Solheim, Game Lead, GRID
