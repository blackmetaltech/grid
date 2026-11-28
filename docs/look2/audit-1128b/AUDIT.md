# GRID look audit 1128b

Branch look6, 2026-11-28. Lead: Ingrid Solheim. Scores: Sigrid Halvorsen (art director), from 1920x1080 Forward+ shots on the RTX 4090, each window on a fresh, empty save.
Contact sheets: `before/` and `after/` (one row per job: opening, mid-play, report over the scene). Shot tools: `scripts/audit-shots.sh`, `scripts/audit-sheet.sh`.

## The old-look path the owner hit
`scripts/shots.sh` ran its GPU windows in the owner's real data dir (it rewrote `settings.cfg` at 08:13). The windows on the owner's screen at 08:11 to 08:13 were WO-18 to WO-22, the chapter 6 province. That province still had the old patchwork ground and plastic towers. Every shot tool now uses a throwaway data dir (703685c).
Other old-look screens reached in normal play: the cream-paper pause menu and chapter card, the cyan Settings dialog, and the full-height report slab. All four are now glass over the scene.

## Verdict
Daylight scenes now read new. Night scenes still read old. No job reaches the 7/10 bar.

| | NEW | READS OLD | OLD 2D | Mean (of 10) | At or above 7 |
|---|---|---|---|---|---|
| Before (37 jobs) | 2 | 28 | 7 | 3.35 | 0 |
| After (37 jobs) | 11 | 26 | 0 | 4.30 | 0 |

## Per job
| Job | Before | After | After verdict | What holds it below 7 (Sigrid) |
|---|---|---|---|---|
| P0 | 4 | 4 | RO | The whole plant is framed now, but it is a small grey shape on murky night ground |
| WO-01 | 6 | 6 | NEW | The benchmark. The houses are small and the mid and report frames go flat blue-grey |
| WO-02 | 6 | 6 | NEW | Both hamlets are framed now; they are still small on a big dusk island |
| WO-03 | 5 | 5 | RO | No focal point: the school sits in a corner |
| WO-04 | 5 | 4 | RO | The report frame has a black area under the hill |
| WO-05 | 3 | 5 | NEW | Flat noon light, and the town is a smudge |
| WO-06 | 5 | 5 | RO | The chart bars and overlay labels make it a diagram |
| WO-07 | 3 | 6 | NEW | The town at night is identical boxes |
| WO-08 | 3 | 6 | NEW | Same scene as WO-07 |
| WO-09 | 2 | 5 | NEW | Washed-out noon, small town |
| WO-10 | 5 | 5 | RO | Charts cover the top third; flat olive ground |
| WO-11 | 4 | 5 | RO | Black pines; charts over the sky |
| WO-12 | 5 | 4 | RO | The report frame is black pine foreground; the plant drops out |
| WO-13 | 4 | 5 | RO | Two big chart panels |
| WO-14 | 2 | 3 | RO | Night ground is olive mud; dark towns |
| WO-15 | 3 | 4 | RO | The night town does not glow |
| WO-16 | 2 | 4 | RO | Nothing to look at but white lines |
| WO-17 | 3 | 6 | NEW | Best province frame; toolbar labels overlap |
| WO-18 | 2 | 4 | RO | Night with no lights; the exam sheet dominates |
| WO-19 | 3 | 5 | NEW | Smooth grey towers |
| WO-20 | 3 | 5 | NEW | Same |
| WO-21 | 3 | 5 | NEW | Same |
| WO-22 | 2 | 3 | RO | Black plant pad with houses inside the yard |
| WO-23 | 3 | 3 | RO | Mustard ground, black pines, the fault ball reads as a moon |
| WO-24 | 3 | 3 | RO | Pine foreground; relays are specks |
| WO-25 | 3 | 3 | RO | Fault marker reads as a moon |
| WO-26 | 3 | 3 | RO | Empty olive hillside in the report frame |
| WO-27 | 2 | 3 | RO | Same night as WO-23; a text wall |
| WO-28 | 3 | 5 | NEW | Good coast map by day; dark night opening |
| WO-29 | 3 | 4 | RO | No town light |
| WO-30 | 3 | 4 | RO | The island is a dark blob |
| WO-31 | 3 | 4 | RO | Charts take the top half |
| WO-32 | 3 | 3 | RO | Thin feeder line on dark ground |
| WO-33 | 4 | 4 | RO | Same |
| WO-34 | 3 | 3 | RO | Muddy yard |
| WO-35 | 3 | 4 | RO | Yellow noon, black pines, charts |
| WO-36 | 2 | 3 | RO | Exam text wall |
| Title | 6 | 6 | NEW | Unchanged |
| Jobs list | 3 | 3 | RO | Unchanged list panel |
| Pause | 3 | 5 | NEW | Glass; a plain stack of buttons |
| Settings | 2 | 4 | RO | Fits the palette; still a web form |
| Chapter card | 3 | 5 | NEW | Glass; the title breaks into three lines |
| Career | 3 | 3 | RO | Untouched: the old ground and a dense top strip |
| Codex | - | 2 | - | Empty and under the clock; players cannot reach it |

The shots behind these scores were taken before three later fixes: lighter pines on the benches (5fa459a), the duller night sea (c7a0e45) and the 1280x800 trays (ed50934). Sigrid has not re-scored those.

## What was rebuilt
- **Province (P0, WO-05, WO-07 to WO-09, WO-14 to WO-22, WO-28 to WO-30):**
  - strip fields with tramlines, headlands and hedges, replacing the patchwork
  - clad halls, concrete towers and chimneys, toned trees, and brick, stone and render town walls
  - a side-lit silver moon with neutral night ambient
  - lower cameras; chapter 3 opens on the mill town; P0 frames the whole plant
- **Benches and stages (WO-04, WO-06, WO-10 to WO-13, WO-23 to WO-27, WO-31 to WO-36):**
  - side moon with shadows
  - cladding on the halls
  - lighter pines
  - softer noon sun
- **Island (WO-01 to WO-03):**
  - side moon
  - fog into the sky
  - WO-02 frames both hamlets
  - zoom-out limited before the sea edge shows
- **Every screen:**
  - glass pause menu and chapter card
  - the report sized to its text, over the scene
  - charts, tags and world labels hidden under the report and dialogs
  - V or "Hide charts" folds every chart

## Still below the bar (in Sigrid's order)
1. **Night:** most of the game. Ground is one olive value, pines are near black, and towns do not light up.
2. **Report framing:** the report keeps the play camera. On WO-04, WO-12 and WO-24 to WO-26 that frame shows pines or an empty hillside instead of the failed part.
3. **Charts open by default on chapters 4, 7 and 8.** I kept this on purpose: the numbers are the lesson, and V folds them. Sigrid disagrees.
4. **Materials:** smooth towers, the WO-22 plant pad, box towns, and the fault marker.
5. **Career:** not touched in this audit.

## Not checked
- Motion while orbiting at length.
- 3840x2160 windowed (only fullscreen on the 4K screen).
- A live resize to 1280x800: the window manager ignored the resize request. 1280x800 was checked by starting at that size.
- The low tier beyond WO-01 and WO-19.
- Pad-only play on the GPU.
