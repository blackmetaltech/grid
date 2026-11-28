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

## Status
- e90cda2 pushed (kit, grade, trees, report dock). make test and make flows passed before it.
- Sigrid round 1: WO-23 open 5.5 / result 4.0; WO-16 4.5 / 4.5 / 4.5. Her list: report hides the consequence (fixed),
  blackout lit by moon (estate darker, lamps off), substation boxes (transformer kit, hall dressing), flat ground,
  tags/givens wall (not done), line loading invisible by day (fixed), towns frost (far house grow), fields flat/wedges,
  edge of world sea (not done).
- Round 2 pending on bench3/.

## Not done yet / next
- Roll-out: Kit3D lights + transformer + hall dressing into ch4 (stage3d l10-l13), ch7 l24-l26, ch8 (stage3d_ch8),
  district3d, bench3d (ch2), bay3d (island: street lamps by the hamlets), province yards (floods, aviation lamps).
- Charts folded by default on ch4/7/8 (GridTheme.charts_folded), exam compact sheets (WO-18/27/36), jobs list, Career.
- Low tier check (LOW=1) and 4K.
- Lesson: every command needs `timeout`; GPU lock `flock -w 120`. A bash call once hung 70 minutes.
