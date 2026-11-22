# LOOK2: GRID's look, phase A (2026-11-22)

**Status:** direction and one vertical slice, on branch `look2`. The owner reviews it before anything else is rebuilt.
**Slice:** L30 "Bring the Island Home", rendered with Forward+ on the RTX 4090. The engine, the levels, the goldens and the tests are unchanged.

## The fantasy
You are the engineer who plans a province's power. You look down on it from a planner's height: real ground with hills, a river, a coast, forests, fields and towns, running out to a hazy horizon under a real sky. You can pan anywhere, orbit and zoom from the whole district down to one yard and one street. The payoff is light. You energise a line and a dark valley lights up, window by window, at dusk. A failure shows on the land too: the anchor cuts the cable and the island goes dark.

## Why L30, not a chapter 5-7 level
The brief asked for a mid-campaign level with towns, a river and several lines, and a line that trips so a district goes dark. I ran every grid level on the engine three ways (no action, the naive design, the lesson). In chapters 5-7 no level actually trips a line into a dark district: L16 "Loop Flow" is lost when a line *would* trip, and nothing goes dark. Drawing a trip the engine does not make would show the player something false. L30 is the end of chapter 2 (level 10 of 37). It has the engine's own terrain map (elevations, the river and its gorge, the ridge, the coast), three towns, eight branches, and a real event: at 21:00 an anchor cuts the sea cable, and without a big enough battery the island goes dark. **Correction after review (Mateo):** my test was too narrow. I looked for a line tripping, but people also go dark by load shedding. In the same probe, L17 (energy not served 37.5 MWh after the 15:00 trip), L19 (86 MWh: under-frequency shedding after the 20:00 unit trip), L20 and L21 shed real load. L28 (feeder shedding) and L34 (a transformer trip at 18:00) are the other real dark events. L17 to L21 are one- to three-bus systems with no engine geography, so drawing them needs the generated province. **Phase B should prove L19 (or L34) next**, with these rules: a town's size follows its MW, the shed share is a share of dark blocks, and each unit is a plant of its own kind.

## References (what we take from each)
- **Cities: Skylines II**: a free camera over a continuous region; at dusk the town lights come on block by block.
- **Microsoft Flight Simulator**: haze and aerial perspective; the land never ends; the low sun shows the relief.
- **Workers & Resources: Soviet Republic**: infrastructure at real scale; poles and lines have weight against the land.
- **Townscaper / Islanders**: restraint. A few strong materials and colours, nothing cartoonish, nothing noisy.
- **Control-room photography (grid operators' video walls)**: the HUD. Dark glass, thin type, one accent colour for live values.

## Light and palette
- One sun on the operator clock: east at 06:00, south at noon, west at 18:00. Golden hour 18:00-18:45, blue hour to 19:30, then moonlight.
- The sky, the sun disc, the clouds, the stars and the moon are drawn by a sky shader whose colours follow the clock (`world3d/shaders/sky.gdshader`).
- Ground in muted greens, straw and soil. Water is coloured by depth: dark sea, shallow turquoise along the coast, foam at the shore.
- Light colours are kept for meaning. Sodium amber (#FFC56B) is a lit home or a lamp. Cyan is an energised line, coloured by its loading band (the engine's band). Red (#E5484D) is a fault. A dark town is grey.
- Tier high: AgX tonemapping, glow on emissives, SSAO, SDFGI, SSR, light volumetric haze, 4-split shadows over 9 km, MSAA 4x + SMAA.

## Camera
- Left drag pans the ground. Right drag (or Shift + left) orbits. The wheel zooms toward the cursor, from about 9.5 km down to 60 m. Arrow keys pan, Q/E orbit, PgUp/PgDn tilt, +/- zoom, 0 resets. A pad pans with the left stick and orbits and zooms with the right. Touch: one finger pans, two pinch and turn.
- Limits: the target stays within 1.2 km of the map and the pitch between 8 and 84 degrees. The camera never goes below the ground. Past the map the land runs on for 26 km, then fog. No edge is ever in view.

## What the world shows (all from the engine, nothing invented)
- **Terrain:** the engine's elevation is bilinear between tile centres, with under a metre of detail noise. The vertical scale is 1, so a span's clearance on screen is the one the engine judged. Six CC0 materials are splat-mapped from the engine's tile kinds. They are sampled at two scales and rotations, with a macro colour drift and a field patchwork with hedgerows, so no tile repeats visibly. The sea bed deepens with distance from the shore. The river sits 2.6 m below its high-water level.
- **Beyond the map:** the coast carries on east and west, uplands rise to about 450 m in the west, wooded hills lie to the north and farmland to the east.
- **Towns:** a house on every quarter of each town tile, plus the island's cottages and school hall. Each building's windows are lit at its energy, `WorldMath.building_energy` (V/Vnom squared, 0 when shed or dark), the same number the 2D diorama uses. Street lamps and warm light pools burn only while the town has voltage.
- **Lines:** every support stands where the engine placed it, of its family (wood, concrete, tubular, lattice). The conductors hang with the engine's sag. At night an energised line glows in its loading-band colour, with pulses in the flow direction. The sea cable is drawn on the seabed and as a chart line on the surface. After the cut that line goes grey and a red ring pulses at the break.
- **Island:** the battery's state of charge is a lit bar on its container. The lighthouse turns only while the island bus is live. The trawler steams over the cable at the cut minute.

## UI language
An engineer's instruments, calm and authoritative. Dark glass panels (about 72 % opaque) with a hairline edge and 4 px corners. IBM Plex Sans for words, Plex Mono for numbers, one sodium accent for live values. Map labels are glass chips with a status tick and a leader line down to the place. The paper work orders, the stamps and the cream dial faces go. The slice converts the map labels and the HUD instruments, tray, pin, budget and lever. The work order and the incident report are still paper (phase B).

## Assets
All CC0, listed in `docs/ASSETS.md`: six Poly Haven texture sets at 1k (grass, forest floor, rock, sand, mud, ploughed field), 6.5 MB in all. Everything else is procedural: trees, houses, poles and towers, yard equipment, the trawler, the lighthouse, the sky, the water and the noise. The two HDRIs fetched for the sky were not used (the sky follows the clock) and were removed.

## Quality tiers (one game, not two)
| Tier | When | What |
|---|---|---|
| high | Forward+ on a discrete GPU (auto) | everything above; terrain step 12.5 m; about 67k trees |
| medium | Forward+ on an integrated GPU, or the Mobile renderer | no SDFGI, SSR or volumetric fog; step 20 m; 55 % of the trees; MSAA 2x |
| low | Compatibility (Steam Deck fallback, phones, CI under Xvfb) | no SSAO; step 30 m; 25 % of the trees; no tree shadows |
`CB_QUALITY=high|medium|low` overrides the choice. `CB_LOOK=1` forces the old 2D diorama. Headless runs and the smoke test never build the 3D scene, so every existing test runs as before.

## Mapping the levels onto scenes
| Levels | Today | LOOK2 scene |
|---|---|---|
| L04-L06, L29, L30 (chapter 2, the mainland map) | 2D tiles from the engine map | **this slice's scene as is**: add route-survey ghosting in 3D and salt fog (L29) |
| P0, L01-L03 (island bench) | 2D island | the same terrain code on a small island height field; close camera |
| L07-L13 (chapters 3-4 benches: mill, street, estate, hydro) | 2D close-ups and panels | close 3D sets (a mill yard, a street of houses, a pumped-hydro valley); the charts stay as glass overlays |
| L14-L27 (chapters 5-7 grid levels) | bus graphs on generated tiles | a generated province around the engine's bus layout (render-only, seeded), lattice towers at 132/220/400 kV, plants with steam |
| L28 finale | the province, 26 buses | the generated province at full size: three days, storms, the heatwave |
| L31-L36 (chapter 8 distribution) | feeder diagrams | a feeder town and countryside at street scale |
| Career (9 districts) | paper map at night | 3D districts from the same generator, seen at night |

## Risks
- **Night readability:** L30 runs from 18:00 to 23:00. Moonlight and ambient light are tuned so the land still reads, but critics may still find it too dark.
- **Thin geometry:** at district scale, 11 kV poles and wires are sub-pixel. The glow overlay carries the line at a distance, and MSAA 4x keeps the shimmer down on high. On low, the wires will shimmer.
- **Build time:** the terrain and trees build in GDScript in about 4 s on high. Fine for a level start, but it needs a loading cue or a threaded build.
- **Overlay projection:** labels and pegs are projected from 3D each frame. Peg and tag picking are verified only on the slice.
- **Integrated GPU and Deck:** measured on the AMD iGPU (see below). Not run on a Deck or a phone.
- **Scope:** most of the cost is the 3D sets for chapters 3-4 and 8, and converting every paper screen.

## Frame times (measured 2026-11-22, L30 at 19:15, default camera, RenderingServer viewport GPU time, `CB_FRAMETIME=1`)
| GPU | Tier | Resolution | GPU ms | Frame |
|---|---|---|---|---|
| RTX 4090 (PRIME offload; log names the card, `nvidia-smi` lists godot at 1.4 GB) | high | 1920x1080 | 6.1 | vsync 60 fps |
| RTX 4090 | high | 2560x1440 | 8.1 | vsync 60 fps |
| AMD Raphael iGPU (2 CU, Vulkan RADV) | high / medium / low | 1920x1080 | not usable: 1-2 fps | |
| AMD Raphael iGPU, Compatibility renderer | low | 1920x1080 | 162 | about 6-7 fps |
The integrated GPU result is a real gap. The low tier as built is not fit for a Deck-class device (a Deck has about four times this iGPU's shader power, still not enough at 6 fps). Phase B must profile it: likely the 67k-tree MultiMesh (25 % on low is still 17k), the far terrain and the per-pixel sky. The fallback until then: `CB_LOOK=1`, the 2D diorama.

## Cost to bring the whole game to this look (agent hours, at today's pace)
| Work | Hours |
|---|---|
| Chapter 2 levels on the same map (L04-L06, L29): route survey ghost in 3D, salt fog | 6 |
| Generated province for L14-L27 and the L28 finale: render-only terrain around the bus layout, lattice towers 132-400 kV, coal/gas/nuclear/hydro/wind/solar plants with steam | 20 |
| Close 3D sets for the benches (P0, L01-L03 island; L07-L13 mill, street, estate, hydro valley) | 18 |
| Chapter 8 feeder town and countryside (L31-L36) | 10 |
| Career: nine districts in 3D at night | 16 |
| Every paper screen to glass (work order, reports, tags, operate panel, stage panels, Career board) | 14 |
| Low tier made playable on an iGPU/Deck, threaded build with a loading cue, phone check | 10 |
| Towns with streets that follow roads, 3-5 house types, harbour and yard kit, sound of weight (wind, sea, hum) | 12 |
| Critique rounds and fixes, README and release per layer | 10 |
| **Total** | **about 116 hours, 10-12 sessions** under the 5-hour usage limit |
Asset gaps: none blocking. CC0 textures cover the ground. Lattice towers, plants, cooling towers, wind turbines and solar parks will be procedural. Audio for the landscape (wind, sea, transformer hum, crowd murmur in lit towns) is needed and not sourced.

## Round 2 (2026-11-22): the proof level is L28

**Why L28, not L19 or L34.** I ran all three on the engine. L19 is one bus; its under-frequency shed is 5 %. L34 is three buses with no map; it sheds 45 % at 18:15 and goes dark at 21:45, but it is a study, not a network. L28 "Keep the Lights On" is the 26-bus national grid the player reinforces (lines, transformers, capacitors, batteries, spinning reserve). With taps and capacitors but no spinning reserve, the coal unit trip at 18:30 on day 2 sheds 21 % of every town for one block, and the towns come back at 18:45. Without a second feeder or a battery, Saltmarsh Island goes dark at 23:30 on day 2 and the job is lost. Mateo named L28 as well. L30 still works as before.

**Generated province.** L28 has no engine terrain. `world3d/gen_field.gd` draws one round the engine's buses, seeded by the level id: hills in the north-west, a river, the coast and the island in the east. The scale is 300 m per tile, so the map is 30 x 13 km. The real tile size is 4 km; I chose the smaller scale so the towns can be read. Every number on screen still comes from the engine.

**Towns.** `world3d/town_gen.gd` gives each town a street grid set at its own angle, a main street, a square with a hall, shop blocks near the centre and houses further out, and lamps along the streets. Town size follows the house count WorldModel takes from peak MW. Energy indices run round the town by angle, so a 21 % shed darkens a 21 % wedge of streets. When a town's energies change, the lights switch building by building in a wave out from the centre that takes 3.2 s. Lamps follow the same wave.

**Infrastructure.** Lines of 66 kV and above stand on double-circuit lattice towers: 27, 36 and 46 m by voltage, about 330 m spans, six conductors and an earth wire, with the sag from the span. Yards have fence posts and rails, three breaker bays, busbars on posts and a red warning light. Tower tops carry red lights that blink at night.

**Light.** At blue hour the sky has a deep blue zenith and a peach horizon band instead of a red wash. The golden sun is less red. The moon is low and brighter (0.85), so the relief shows at night. Depth fog scales with the size of the province. Lit houses glow warm and dark ones stay dark.

**Incident report.** The report is now glass in the LOOK2 skin. It is docked left at a third of the width, with no dim, so the dark district stays in view (`PaperKit.glass`). Every other paper screen is unchanged.

**Low tier.** This is the Compatibility renderer. It trades away: shadows, SSAO, SDFGI, SSR, volumetric fog, glow, reflections, sky radiance (ambient is a fixed colour set by the clock), dynamic town lights (only windows and the amber disc remain), half the houses and 12 % of the trees. There is no lightmap bake. "Baked" here means static ambient only.

**Frame times, round 2 (L28 at 18:45, default camera, `CB_FRAMETIME=1`).** RTX 4090, high, 1920x1080: 12.8 ms GPU. AMD Raphael iGPU, Compatibility renderer, low, 1280x800: 80 ms GPU before the low-tier cuts and 16.7 ms after (3D at 60 % scale, a cheap terrain shader, the cuts listed above). On a 60 Hz desktop that is a steady 30 fps. The app's own frame cap holds both runs at 33 ms.

**Evidence.** `docs/look2/r2-*.jpg` and `docs/look2/capture-town-lights-up-10s.mp4`. The capture starts at 18:30 on day 2, with Capital's shed wedge dark. At 18:45 the engine restores the load and the wedge lights up street by street.

## Phase B (2026-11-23)

**Decision: presentation scale.** L28's province stays compressed: 300 m on screen for each 4 km engine tile. A note on screen says so (`WORLD_SCALE_NOTE`). At true scale (400 x 176 km) a town would be a few pixels at any zoom where two towns are in view, and the slice is about towns lighting up. Every number (line km, MW, pu) is the engine's. This can be reversed: one constant in `Province3D.set_model`.

**Grainy textures (owner, 11-22).** Cause: all 18 terrain textures were imported without mipmaps, because `.import` files were git-ignored and the defaults won. Fix:
- mipmaps on and VRAM compression for every texture under `world3d/`, with normal maps as RGTC;
- `.import` files under `world3d/` are now tracked, and `[importer_defaults]` sets the same for new textures;
- `src/look2-textures.test.ts` fails if a 3D texture has mipmaps off;
- terrain detail fades to an 8x tiling and then to the texture's mean colour with distance, normal strength falls with distance, roughness rises with distance, and the screen-space roughness limiter is on;
- TAA on high and medium;
- FSR 1 with sharpening on the low tier.

Trade: VRAM compression is now the default for any new texture in the project, including 2D. UI art that needs to stay crisp must say so in its own `.import`.

**Decision: CI perf budgets.** Wall-clock budgets run locally only (`pnpm perf`). The manager decided this (factory DECISIONS 8), and it can be reversed.
