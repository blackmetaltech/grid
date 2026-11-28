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

## Status
- Benchmarks: first AD score pending (see below).
