# Audit 1128c: working notes (Ingrid Solheim, game lead)

Brief: the look only. Fix it at the root in shared 3D code, pass two benchmarks (WO-23 night, WO-16 day) at 7.5 with the art
director, then roll out, re-shoot every job, iterate to every job >= 7 and mean >= 7.5. No tag, release or publish.

## Shared kit added (root fixes)
- `godot/world3d/look.gd` (Look3D.grade): one light grade called at the end of `_update_sky` in Bay3D, Bench3D (all stages)
  and Province3D. Night: cold blue moon key (0.42), deep blue ambient, saturation 0.72, glow additive at threshold 0.9,
  exposure 1.25. Noon: exposure 0.86 (pastel wash). Also drives tree and Kit3D night lights.
- `godot/world3d/kit.gd` (Kit3D): floodlight masts (SpotLight, energy 45), street lamps (Omni 16, group switchable for
  blackouts: `Kit3D.set_group("estate", on)`), aviation lamps, chain-link fence (shaders/fence.gdshader), vans.
  Godot falls off as 1/d^attenuation: energies under ~10 give no visible pool at 15-50 m.
- Trees: `Props3D.conifer()` (six drooping ragged tiers, normals out and up, dark undersides) and `broadleaf()` (seven
  clumps, crown-blended normals); `shaders/tree.gdshader` (leaf noise, AO by height, hue per tree). Bench and bay trees
  now use it (they had a plain StandardMaterial). Bench woods: clumps and clearings, age spread, a birch variant.
- `shaders/arc.gdshader`: fault marker is an arc flash (white core, blue rim, flicker) with a blue OmniLight, not a yellow ball.
- Terrain: aerial-photo farm palette with in-field streaks; `yard_gravel` uniform (stages L23/L25/L27) gives a gravel yard.
- Province: conductors dark grey (were polished white tubes), noon sun 1.75 (was 2.2), job framing 2.75x spread, pitch 29.
- Streets and roofs: specular cut at distance (grazing sky reflection drew far towns as pale scribbles). Walls in a muted palette.

## Shot tools
- `scripts/audit-shots.sh <dir> L23 ...` (throwaway data dir per window). Quick one-shot: scratch `shot.sh`.

- Report (shift_report.gd): glass sheet 560-600 px docked right; `_frame_for_report` calls the 3D place's `report_focus()`
  (Stage3D.REPORT_FOCUS anchors per stage) then shifts the camera goal right by the ground width half the sheet covers.

## Status (latest first)
- 6676498: manager notes (night fill 0.95, moon 0.7; WO-24/25 framing and clear foreground; lever hidden under the
  report; plant pads clear of houses; coal pile). Sweep 3 into scratch, sheets to docs/look2/audit-1128c/after/.
- e3fbd61 roll-out 1 (shared transformer mesh, plant yard shader + floods, cooling-tower concrete, ch7 site lights,
  ch8 street lamps, stage lamp falloff). 8207172 benchmark rounds 2-3. e90cda2 the kit.
- Sigrid: round 1 WO-23 5.5/4.0, WO-16 4.5; round 2 WO-23 6.0/5.0/5.0, WO-16 5.0/5.0/6.5. Not at 7.5.
- Decision (Ingrid): the root fixes (grade, trees, report, line loading, charts fold) apply to every job by
  construction, so I rolled out before the benchmarks reached 7.5. What is left is per-scene subject detail, which
  the benchmark cannot buy for the other 35 jobs anyway. The benchmark gap is written down, not hidden.
- make test and make flows passed on e90cda2, flows on e3fbd61 and after the pad change.

## Not done / next (in order)
- Career map and the Jobs list: untouched in 1128c (old look).
- Exam text walls (WO-18/27/36) compact sheet: not done.
- Towns from afar are still sparse ribbon villages (TownGen); far houses grow, but there is no dense core.
- WO-26 plants are small plain boxes; WO-24 relays still small.
- Low tier and 4K not re-measured in 1128c.
- Every command needs `timeout`; the GPU lock `flock -w 120`. A bash call once hung 70 minutes.
- Do not edit game scripts while a sweep runs: each window loads them fresh (one window caught a parse error).
