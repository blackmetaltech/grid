class_name Province3D
extends Node3D
## LOOK2 (docs/LOOK2.md): the province as a real 3D landscape under a real sky, for the levels that have been rebuilt (the vertical slice: L30).
## It reads the same WorldModel dictionary the 2D diorama reads (WorldView.model) and draws it: terrain from the engine's map, forests, towns
## whose windows are lit by each building's energy (WorldMath.building_energy, from the engine's bus voltage), yards, the hydro set, the
## overhead routes with the engine's supports and sags, the sea cable, the island's battery and lighthouse, the trawler at the anchor-cut
## minute, the sun and moon at the operator clock. It computes no physics. WorldView keeps picking, labels and pegs and asks this node to
## project points and to turn the camera.

const VEX := 1.0                 # vertical scale inside the map: 1 (the clearances on screen are the engine's)
const PXM := RouteDraw.PX_PER_M  # WorldView's z px per metre

var quality := "high"            # high (Forward+ discrete GPU) | medium | low (Compatibility / Mobile / CI)
var field: TerrainField
var tm := 50.0
var map_size := Vector2.ZERO     # metres
var model: Dictionary = {}
var cam: Camera3D
var sun: DirectionalLight3D
var moon: DirectionalLight3D
var env: Environment
var sky_mat: ShaderMaterial
var _terrain_id := ""
var _layout_sig := ""
var _routes_sig := ""
var _root_static: Node3D
var _root_infra: Node3D
var _root_dyn: Node3D
var _houses: Array = []          # [{mm: MultiMesh, town_ids: PackedStringArray per instance, idx: PackedInt32Array}]
var _house_mm: Array[MultiMesh] = []
var _house_map: Array = []       # per multimesh: Array of [town_id, energy index]
var _town_lamps: Dictionary = {} # town id -> Array[Node3D] (lamps, light pools)
var _yard_lights: Dictionary = {}# sub id -> Array[Node3D]
var _wire_glow: Dictionary = {}  # line id -> MeshInstance3D (glow overlay of the conductors)
var _cable: Dictionary = {}      # sea cable visuals
var _battery: Dictionary = {}
var _lighthouse: Dictionary = {}
var _trawler: Node3D
var _cable_ok := false
var _unit_lights: Array = []
var _water_mats: Array[ShaderMaterial] = []
var _t := 0.0
var _hmat: ShaderMaterial
var _town_inst := {}             # town id -> [[multimesh index, instance, energy index, distance from centre 0..1]]
var _town_lampmm := {}           # town id -> [MultiMesh, PackedFloat32Array distances, Array[Transform3D]]
var _wave := {}                  # town id -> {t0, sig}: when the town's energies last changed (the wave runs out from the centre)
var _warn: Array = []            # red warning lights on the yard gantries: blink at night
var _warn_l: Array = []          # red warning lights on the tower tops
var dist_max := DIST_MAX
const WAVE_S := 3.2              # seconds for a wave to cross a town

# camera rig (smoothed toward the goal values)
var target := Vector3.ZERO
var yaw := 0.0                   # radians, 0 = looking north (-Z)
var pitch := deg_to_rad(38.0)
var dist := 3000.0
var _g_target := Vector3.ZERO
var _g_yaw := 0.0
var _g_pitch := deg_to_rad(38.0)
var _g_dist := 3000.0
const PITCH_MIN := deg_to_rad(8.0)
const PITCH_MAX := deg_to_rad(84.0)
const DIST_MIN := 60.0
const DIST_MAX := 9500.0
var perf := {"frames": 0, "ms": 0.0, "worst": 0.0}
var _measuring := false
var _ft_gpu := 0.0
var _ft_cpu := 0.0
var _ft_n := 0
var _ft_at := 0.0

static func pick_quality() -> String:
	var q := OS.get_environment("CB_QUALITY")
	if q != "": return q
	var rm := str(ProjectSettings.get_setting("rendering/renderer/rendering_method", "forward_plus"))
	var drv := RenderingServer.get_current_rendering_method()
	if drv == "gl_compatibility" or DisplayServer.get_name() == "headless": return "low"
	if drv == "mobile": return "medium"
	var name := RenderingServer.get_video_adapter_name().to_lower()
	if name.contains("nvidia") or name.contains("radeon rx") or name.contains("arc"): return "high"
	return "medium"
	@warning_ignore("unreachable_code")
	return rm

func _ready() -> void:
	quality = pick_quality()
	_root_static = Node3D.new(); _root_static.name = "Static"; add_child(_root_static)
	_root_infra = Node3D.new(); _root_infra.name = "Infra"; add_child(_root_infra)
	_root_dyn = Node3D.new(); _root_dyn.name = "Dynamic"; add_child(_root_dyn)
	cam = Camera3D.new(); cam.name = "Camera"; cam.near = 1.0; cam.far = 90000.0; cam.fov = 42.0; add_child(cam)
	_make_env()
	print("LOOK2 province3d quality=%s renderer=%s adapter=%s" % [quality, RenderingServer.get_current_rendering_method(), RenderingServer.get_video_adapter_name()])

func active() -> bool: return visible and field != null

# --------------------------------------------------------------------------------------------------------------------
# Environment: sky, sun and moon, fog, tonemapping, GI by tier
# --------------------------------------------------------------------------------------------------------------------
func _make_env() -> void:
	env = Environment.new()
	env.background_mode = Environment.BG_SKY
	var sky := Sky.new(); sky_mat = ShaderMaterial.new(); sky_mat.shader = load("res://world3d/shaders/sky.gdshader")
	var nt := NoiseTexture2D.new(); nt.seamless = true; nt.width = 512; nt.height = 512
	var fn := FastNoiseLite.new(); fn.frequency = 0.012; fn.fractal_octaves = 5; nt.noise = fn
	sky_mat.set_shader_parameter("noise", nt)
	sky.sky_material = sky_mat; sky.radiance_size = Sky.RADIANCE_SIZE_256
	sky.process_mode = Sky.PROCESS_MODE_REALTIME if quality == "high" else Sky.PROCESS_MODE_INCREMENTAL
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	env.tonemap_mode = Environment.TONE_MAPPER_AGX
	env.tonemap_exposure = 1.0
	env.glow_enabled = quality != "low"
	if quality == "low":   # integrated GPUs: ambient from a fixed colour set by the clock (no sky radiance updates), no reflections
		env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR; env.reflected_light_source = Environment.REFLECTION_SOURCE_DISABLED
		env.sky.process_mode = Sky.PROCESS_MODE_QUALITY; env.sky.radiance_size = Sky.RADIANCE_SIZE_32
	env.glow_intensity = 0.7; env.glow_bloom = 0.04; env.glow_hdr_threshold = 1.1
	env.glow_blend_mode = Environment.GLOW_BLEND_MODE_SOFTLIGHT
	env.fog_enabled = true
	env.fog_mode = Environment.FOG_MODE_DEPTH
	env.fog_depth_begin = 5000.0; env.fog_depth_end = 42000.0; env.fog_depth_curve = 1.8
	env.fog_aerial_perspective = 0.35
	env.fog_sky_affect = 0.25
	env.fog_density = 1.0
	env.adjustment_enabled = true; env.adjustment_contrast = 1.06; env.adjustment_saturation = 1.04
	if quality != "low":
		env.ssao_enabled = true; env.ssao_radius = 2.0; env.ssao_intensity = 1.6
	if quality == "high":
		env.sdfgi_enabled = true; env.sdfgi_use_occlusion = true; env.sdfgi_cascades = 6; env.sdfgi_min_cell_size = 1.0
		env.ssr_enabled = true; env.ssr_max_steps = 48
		env.volumetric_fog_enabled = true; env.volumetric_fog_density = 0.00012; env.volumetric_fog_length = 2200.0
		env.volumetric_fog_anisotropy = 0.6; env.volumetric_fog_ambient_inject = 0.35
	var we := WorldEnvironment.new(); we.environment = env; add_child(we)
	sun = DirectionalLight3D.new(); sun.name = "Sun"; sun.shadow_enabled = quality != "low"
	sun.directional_shadow_max_distance = 9000.0 if quality == "high" else 5000.0
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS
	sun.light_angular_distance = 0.6
	add_child(sun)
	moon = DirectionalLight3D.new(); moon.name = "Moon"; moon.shadow_enabled = quality == "high"
	moon.directional_shadow_max_distance = 6000.0; moon.light_color = Color(0.62, 0.72, 1.0)
	add_child(moon)
	if quality == "high":
		RenderingServer.directional_shadow_atlas_set_size(8192, true)
		get_viewport().msaa_3d = Viewport.MSAA_4X   # geometry edges
		get_viewport().use_taa = true                # thousands of small instances and thin lattice members: temporal AA stops the shimmer
		get_viewport().screen_space_aa = Viewport.SCREEN_SPACE_AA_DISABLED
	elif quality == "medium":
		get_viewport().msaa_3d = Viewport.MSAA_2X
		get_viewport().use_taa = true
	else:   # low: the 3D view renders at 60 % and is scaled up; the UI stays at full resolution
		get_viewport().scaling_3d_scale = 0.6
		get_viewport().scaling_3d_mode = Viewport.SCALING_3D_MODE_FSR; get_viewport().fsr_sharpness = 0.35   # FSR 1 upscale with sharpening, not a bilinear blur

## Palette by minute of the day (docs/LOOK2.md "Light"): day, golden hour, blue hour, night.
func _sky_at(mn: float) -> Dictionary:
	var n := WorldMath.night(mn); var d := WorldMath.dusk(mn)
	var zen := Color(0.20, 0.40, 0.74).lerp(Color(0.02, 0.035, 0.09), n).lerp(Color(0.09, 0.17, 0.42), d * 0.7)   # blue hour: a deep blue zenith
	var hor := Color(0.70, 0.80, 0.90).lerp(Color(0.06, 0.09, 0.18), n).lerp(Color(0.95, 0.72, 0.52), d * 0.55)   # a peach band, not a red wash
	return {"n": n, "d": d, "zen": zen, "hor": hor}

func _update_sky(mn: float) -> void:
	var s := _sky_at(mn)
	var n: float = s.n; var d: float = s.d
	sky_mat.set_shader_parameter("zenith", s.zen); sky_mat.set_shader_parameter("horizon", s.hor)
	sky_mat.set_shader_parameter("ground", (s.hor as Color) * 0.35)
	sky_mat.set_shader_parameter("night", n); sky_mat.set_shader_parameter("dusk", d)
	sky_mat.set_shader_parameter("sun_glow", Color(1.0, 0.62, 0.32).lerp(Color(1.0, 0.9, 0.75), 1.0 - d))
	sky_mat.set_shader_parameter("cloud_lit", Color(1.0, 0.93, 0.85).lerp(Color(1.0, 0.55, 0.35), d).lerp(Color(0.10, 0.12, 0.2), n))
	sky_mat.set_shader_parameter("cloud_dark", Color(0.55, 0.58, 0.66).lerp(Color(0.35, 0.25, 0.35), d).lerp(Color(0.03, 0.04, 0.07), n))
	# the sun: east at 06:00, south at noon, west at 18:00 (the map's +X is east, +Z south); 50 degrees high at noon
	var a := (mn - 360.0) / 720.0 * PI
	var elev := sin(a) * deg_to_rad(50.0) + deg_to_rad(6.0)   # sunset near 18:30, where WorldMath.dusk peaks: raking light at the job's start
	var az := a   # 0 = east, PI/2 = south, PI = west
	var to_sun := Vector3(cos(az) * cos(elev), sin(elev), sin(az) * cos(elev) * 0.6 + 0.35 * cos(elev)).normalized()
	sun.visible = elev > deg_to_rad(-6.0)
	if sun.visible: sun.look_at_from_position(Vector3.ZERO, -to_sun, Vector3.UP if absf(to_sun.y) < 0.99 else Vector3.FORWARD)
	var lowk := clampf(elev / deg_to_rad(12.0), 0.0, 1.0)
	sun.light_color = Color(1.0, 0.66, 0.40).lerp(Color(1.0, 0.95, 0.88), lowk)   # golden, not red
	sun.light_energy = clampf((elev + deg_to_rad(4.0)) / deg_to_rad(10.0), 0.0, 1.0) * lerpf(0.9, 2.2, lowk)
	var mdir := Vector3(-0.45, 0.40, -0.80).normalized()   # a low moon: long moon shadows show the relief at night   # a high moon in the north-east sky, constant through the job's evening
	moon.look_at_from_position(Vector3.ZERO, -mdir, Vector3.UP)
	moon.light_energy = 0.85 * smoothstep(0.35, 0.85, n)
	moon.visible = moon.light_energy > 0.01
	if moon.visible and sun.visible: moon.shadow_enabled = false
	elif quality == "high": moon.shadow_enabled = true
	sky_mat.set_shader_parameter("moon_dir", mdir)
	env.ambient_light_sky_contribution = lerpf(1.0, 0.45, n) * (1.0 - 0.55 * d)   # golden hour: cool shadows against the warm sun, not a maroon wash
	env.ambient_light_color = Color(0.13, 0.17, 0.30).lerp(Color(0.30, 0.38, 0.55), d * (1.0 - n))
	env.ambient_light_energy = lerpf(1.0, 1.1, n)
	env.fog_light_color = (s.hor as Color).lerp(Color(0.46, 0.55, 0.72), 0.75 * d * (1.0 - n)).lerp(Color(0.05, 0.08, 0.15), n * 0.6)   # haze stays cool at golden hour
	env.fog_light_energy = lerpf(1.0, 0.5, n)
	env.tonemap_exposure = lerpf(1.0, 1.55, n)
	if env.volumetric_fog_enabled:
		env.volumetric_fog_albedo = Color(0.9, 0.85, 0.8).lerp(Color(0.5, 0.55, 0.7), n)
	for wm in _water_mats: wm.set_shader_parameter("night", n)
	if _terrain_mat != null: _terrain_mat.set_shader_parameter("night", n)

# --------------------------------------------------------------------------------------------------------------------
# Model in
# --------------------------------------------------------------------------------------------------------------------
var _terrain_mat: ShaderMaterial

func set_model(m: Dictionary) -> void:
	model = m
	var has_t: bool = m.get("terrain") is Dictionary and not (m.terrain as Dictionary).is_empty()
	var tid: String = str(m.terrain.id) if has_t else "gen:" + str(m.level)
	if tid != _terrain_id or field == null:
		_terrain_id = tid
		if has_t: field = TerrainField.new(m.terrain, m.map, m.get("island_c", Vector2(-999, -999)))
		else:   # no engine terrain (chapters 5-9): a generated province round the engine's buses, drawn at GEN_TILE_M per tile
			var gf := GenField.new(m, clampf(30000.0 / maxf(1.0, float(m.map.x)), 200.0, 600.0))
			gf.cache_heights(Rect2(-1500, -1500, gf.size_m.x + 3000, gf.size_m.y + 3000), 40.0 if quality == "high" else 80.0)
			field = gf
		tm = field.tm; map_size = field.size_m
		dist_max = maxf(DIST_MAX, maxf(map_size.x, map_size.y) * 0.8)
		env.fog_depth_begin = maxf(5000.0, map_size.x * 0.3); env.fog_depth_end = maxf(42000.0, map_size.x * 2.6)   # haze in layers: depth fog by the province's size
		_build_static()
		reset_camera()
	var lsig := JSON.stringify([m.level, m.towns.map(func(t): return [t.id, t.pos]), m.subs.map(func(s): return [s.id, s.pos]), m.units.map(func(u): return [u.id, u.pos]), m.get("batteries", []).map(func(b): return b.id)])
	if lsig != _layout_sig:
		_layout_sig = lsig; _build_layout()
	var rsig := JSON.stringify([m.routes.map(func(r): return [r.id, r.supports.size(), r.spans.map(func(s): return s.sag_m)]), m.lines.map(func(l): return [l.id, l.kind, l.pts])])
	if rsig != _routes_sig:
		_routes_sig = rsig; _build_lines()
	_update_dynamic()

func tile_to_world(p: Vector2, z_m := 0.0) -> Vector3:
	var x := p.x * tm; var z := p.y * tm
	return Vector3(x, ground(x, z) + z_m, z)

func ground(x: float, z: float) -> float:
	if field == null: return 0.0
	return field.height(x, z) * VEX

# --------------------------------------------------------------------------------------------------------------------
# Static world: terrain (near and far), water, forests, rocks
# --------------------------------------------------------------------------------------------------------------------
func _tex(n: String) -> Texture2D:
	var p := "res://world3d/tex/%s.jpg" % n
	if ResourceLoader.exists(p): return load(p)
	var img := Image.load_from_file(ProjectSettings.globalize_path(p))   # not imported yet (fresh checkout without an editor import)
	return ImageTexture.create_from_image(img) if img != null else null

func _build_static() -> void:
	for c in _root_static.get_children(): c.queue_free()
	var t0 := Time.get_ticks_msec()
	_terrain_mat = ShaderMaterial.new(); _terrain_mat.shader = load("res://world3d/shaders/terrain.gdshader")
	for n in ["grass", "forest", "rock", "sand"]:
		_terrain_mat.set_shader_parameter(n + "_a", _tex(n + "_albedo")); _terrain_mat.set_shader_parameter(n + "_n", _tex(n + "_normal"))
	_terrain_mat.set_shader_parameter("mud_a", _tex("mud_albedo")); _terrain_mat.set_shader_parameter("field_a", _tex("field_albedo"))
	var mn := NoiseTexture2D.new(); mn.seamless = true; mn.width = 512; mn.height = 512
	var fn := FastNoiseLite.new(); fn.frequency = 0.008; fn.fractal_octaves = 4; mn.noise = fn
	_terrain_mat.set_shader_parameter("macro_noise", mn)
	if field is GenField: _terrain_mat.set_shader_parameter("grass_tint", Vector3(0.78, 1.0, 0.66))
	if quality == "low": _terrain_mat.set_shader_parameter("cheap", true)
	var step := 12.5 if quality == "high" else (20.0 if quality == "medium" else 30.0)
	var margin := 900.0
	if field is GenField: step = maxf(step * 2.0, map_size.x / 1400.0) if quality == "high" else maxf(step * 2.5, map_size.x / 700.0)
	var near := Rect2(-margin, -margin, map_size.x + 2.0 * margin, map_size.y + 2.0 * margin)
	var mi := MeshInstance3D.new(); mi.name = "TerrainNear"; mi.mesh = field.grid_mesh(near, step); mi.material_override = _terrain_mat
	_root_static.add_child(mi)
	var far_half := maxf(26000.0, maxf(map_size.x, map_size.y) * 1.1)
	var c := map_size * 0.5
	var far := Rect2(c.x - far_half, c.y - far_half, far_half * 2.0, far_half * 2.0)
	var fstep := (220.0 if quality != "low" else 400.0) * (2.0 if field is GenField else 1.0)
	var hole := near.grow(-fstep * 1.5)
	var fm := MeshInstance3D.new(); fm.name = "TerrainFar"; fm.mesh = field.grid_mesh(far, fstep, hole, false); fm.material_override = _terrain_mat
	fm.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF if quality != "high" else GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	_root_static.add_child(fm)
	_build_water()
	_build_forests(near)
	_build_rocks()
	print("LOOK2 terrain built in %d ms (step %.1f m)" % [Time.get_ticks_msec() - t0, step])

func _water_mat(river: bool) -> ShaderMaterial:
	var wm := ShaderMaterial.new(); wm.shader = load("res://world3d/shaders/water.gdshader")
	for k in ["wave_a", "wave_b"]:
		var nt := NoiseTexture2D.new(); nt.seamless = true; nt.as_normal_map = true; nt.bump_strength = 6.0; nt.width = 512; nt.height = 512
		var fn := FastNoiseLite.new(); fn.frequency = 0.02 if k == "wave_a" else 0.035; fn.fractal_octaves = 3; fn.seed = 7 if k == "wave_a" else 11
		nt.noise = fn; wm.set_shader_parameter(k, nt)
	if river:
		wm.set_shader_parameter("shallow", Color(0.22, 0.36, 0.30)); wm.set_shader_parameter("deep", Color(0.06, 0.12, 0.12))
		wm.set_shader_parameter("flow_z", 0.02); wm.set_shader_parameter("scale", 0.35)
	_water_mats.append(wm)
	return wm

func _build_water() -> void:
	_water_mats.clear()
	var sea := MeshInstance3D.new(); sea.name = "Sea"
	var pm := PlaneMesh.new(); pm.size = Vector2(120000, 120000); pm.subdivide_width = 0; pm.subdivide_depth = 0
	sea.mesh = pm; sea.position = Vector3(map_size.x * 0.5, 0.0, map_size.y * 0.5); sea.material_override = _water_mat(false)
	sea.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_root_static.add_child(sea)
	# the river: one quad per river tile at the river's water level (the bed is carved 2.6 m below it)
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var any := false
	for j in field.H:
		for i in field.W:
			if field.kind_at_tile(i, j) != TerrainField.K_RIVER: continue
			any = true
			var y := TerrainField.RIVER_LEVEL * VEX
			var x0 := i * tm - 6.0; var x1 := (i + 1) * tm + 6.0; var z0 := j * tm - 6.0; var z1 := (j + 1) * tm + 6.0
			st.set_normal(Vector3.UP)
			for p in [Vector3(x0, y, z0), Vector3(x1, y, z0), Vector3(x1, y, z1), Vector3(x0, y, z0), Vector3(x1, y, z1), Vector3(x0, y, z1)]: st.add_vertex(p)
	if field is GenField:
		var rg := MeshInstance3D.new(); rg.name = "River"; rg.mesh = (field as GenField).river_mesh(); rg.material_override = _water_mat(true)
		rg.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; _root_static.add_child(rg)
	if any:
		var rv := MeshInstance3D.new(); rv.name = "River"; rv.mesh = st.commit(); rv.material_override = _water_mat(true)
		rv.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		_root_static.add_child(rv)

func _mm_chunked(mesh: Mesh, xforms: Array, cols: Array, mat: Material, chunk_m: float, vis_end: float, name: String, shadows := true) -> void:
	var buckets := {}
	for k in xforms.size():
		var o: Vector3 = (xforms[k] as Transform3D).origin
		var key := Vector2i(floori(o.x / chunk_m), floori(o.z / chunk_m))
		if not buckets.has(key): buckets[key] = []
		buckets[key].append(k)
	for key in buckets:
		var ids: Array = buckets[key]
		var mm := MultiMesh.new(); mm.transform_format = MultiMesh.TRANSFORM_3D; mm.use_colors = true; mm.mesh = mesh
		mm.instance_count = ids.size()
		for q in ids.size():
			mm.set_instance_transform(q, xforms[ids[q]]); mm.set_instance_color(q, cols[ids[q]])
		var mi := MultiMeshInstance3D.new(); mi.name = "%s_%d_%d" % [name, key.x, key.y]; mi.multimesh = mm; mi.material_override = mat
		mi.visibility_range_end = vis_end; mi.visibility_range_end_margin = vis_end * 0.1
		mi.visibility_range_fade_mode = GeometryInstance3D.VISIBILITY_RANGE_FADE_SELF
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadows else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		_root_static.add_child(mi)

func _h(a: int, b: int, s: int) -> float: return WorldMath.hash2(a, b, s)

## Clearings: the routes' right of way over forest and the infrastructure sites stay free of trees.
func _clear_of_infra(x: float, z: float) -> bool:
	if field is GenField:
		var gf: GenField = field
		for t in gf.towns: if (t.c as Vector2).distance_to(Vector2(x, z)) < float(t.r) * 1.05: return false
		for f in gf.flats: if (f.c as Vector2).distance_to(Vector2(x, z)) < float(f.r) * 1.3: return false
		return true
	for t in model.towns:
		if (t.pos as Vector2 + Vector2(0.5, 0.5)).distance_to(Vector2(x, z) / tm) < 3.0: return false
	for s in model.subs:
		if (s.pos as Vector2 + Vector2(0.5, 0.5)).distance_to(Vector2(x, z) / tm) < 1.2: return false
	for r in model.routes:
		for sp in r.spans:
			var a: Vector2 = r.supports[sp.a].m; var b: Vector2 = r.supports[sp.b].m
			var p := Vector2(x, z); var ab := b - a; var l2 := ab.length_squared()
			var t := 0.0 if l2 < 1e-6 else clampf((p - a).dot(ab) / l2, 0.0, 1.0)
			if p.distance_to(a + ab * t) < 18.0: return false
	return true

func _build_forests(near: Rect2) -> void:
	var tmat := ShaderMaterial.new(); tmat.shader = load("res://world3d/shaders/tree.gdshader")
	var con := Props3D.conifer(); var brd := Props3D.broadleaf()
	var xc: Array = []; var cc: Array = []; var xb: Array = []; var cb: Array = []
	var dens := 1.0 if quality == "high" else (0.55 if quality == "medium" else 0.12)
	var cell := (9.0 if not field is GenField else 24.0) / sqrt(dens)
	var nx := int(near.size.x / cell); var nz := int(near.size.y / cell)
	for j in nz:
		for i in nx:
			var x := near.position.x + (i + _h(i, j, 301)) * cell; var z := near.position.y + (j + _h(i, j, 302)) * cell
			var inside := field.inside(x, z)
			var h := field.height(x, z)
			if h < 2.5: continue
			var forest := field.is_forest(x, z, h)
			var lone := not forest and inside and field.kind_at_tile(int(x / tm), int(z / tm)) == TerrainField.K_GRASS and _h(i, j, 303) > 0.993   # a lone field tree
			var hedge := false
			if not forest and not lone and inside and field.kind_at_tile(int(x / tm), int(z / tm)) == TerrainField.K_GRASS:
				var fp := Vector2(x * 0.966 - z * 0.259, x * 0.259 + z * 0.966)
				var fr := Vector2(fposmod(fp.x, 150.0), fposmod(fp.y, 95.0))
				hedge = (minf(fr.x, 150.0 - fr.x) < 4.0 or minf(fr.y, 95.0 - fr.y) < 4.0) and _h(i, j, 309) > 0.82   # trees along the hedgerows
			if not (forest or lone or hedge): continue
			if inside and not _clear_of_infra(x, z): continue
			var sc := (13.0 + 11.0 * _h(i, j, 304)) * (1.0 if not field is GenField else 1.35)
			if hedge: sc *= 0.7
			var conif := _h(i, j, 305) < (0.75 if z < map_size.y * 0.4 else 0.35)
			var xf := Transform3D(Basis(Vector3.UP, TAU * _h(i, j, 306)).scaled(Vector3(sc * (0.9 + 0.2 * _h(i, j, 307)), sc, sc)), Vector3(x, ground(x, z) - 0.3, z))
			var tint := Color(0.85 + 0.3 * _h(i, j, 308), 0.9 + 0.2 * _h(i, j, 310), 0.8 + 0.3 * _h(i, j, 311))
			if conif: xc.append(xf); cc.append(tint)
			else: xb.append(xf); cb.append(tint)
	var ve := (7000.0 if quality == "high" else 4500.0) * (1.6 if field is GenField else 1.0)
	_mm_chunked(con, xc, cc, tmat, 600.0, ve, "Conifers", quality != "low")
	_mm_chunked(brd, xb, cb, tmat, 600.0, ve, "Broadleaf", quality != "low")
	print("LOOK2 trees: %d conifers, %d broadleaf" % [xc.size(), xb.size()])

func _build_rocks() -> void:
	var xs: Array = []; var cs: Array = []
	var mat := StandardMaterial3D.new(); mat.vertex_color_use_as_albedo = true; mat.roughness = 0.95
	for j in field.H:
		for i in field.W:
			if field.kind_at_tile(i, j) != TerrainField.K_ROCK: continue
			for k in 4:
				var x := (i + _h(i, j, 400 + k)) * tm; var z := (j + _h(i, j, 410 + k)) * tm
				var s := 2.0 + 5.0 * _h(i, j, 420 + k)
				xs.append(Transform3D(Basis(Vector3.UP, TAU * _h(i, j, 430 + k)).scaled(Vector3(s, s * 0.7, s * 1.2)), Vector3(x, ground(x, z) - 0.5, z)))
				cs.append(Color(0.55, 0.53, 0.5) * (0.8 + 0.3 * _h(i, j, 440 + k)))
	_mm_chunked(Props3D.boulder(), xs, cs, mat, 800.0, 5000.0, "Rocks")

# --------------------------------------------------------------------------------------------------------------------
# Layout: towns, yards, the hydro set, batteries, the lighthouse (rebuilt when the buses change)
# --------------------------------------------------------------------------------------------------------------------
func _town_areas() -> Array:
	var areas: Array = []
	var seen := {}
	for j in field.H:
		for i in field.W:
			if field.kind_at_tile(i, j) != TerrainField.K_TOWN or seen.has(Vector2i(i, j)): continue
			# only real town tiles (roads share the paved code): flood fill over 't' tiles of the engine map
			if str((model.terrain.kinds as PackedStringArray)[j * field.W + i]) != "town": continue
			var q: Array = [Vector2i(i, j)]; seen[Vector2i(i, j)] = true; var tiles: Array = []
			while not q.is_empty():
				var c: Vector2i = q.pop_back(); tiles.append(c)
				for d in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
					var n: Vector2i = c + d
					if n.x < 0 or n.y < 0 or n.x >= field.W or n.y >= field.H or seen.has(n): continue
					if str((model.terrain.kinds as PackedStringArray)[n.y * field.W + n.x]) == "town": seen[n] = true; q.append(n)
			areas.append(tiles)
	return areas

func _nearest_town(p_tiles: Vector2) -> Dictionary:
	var best := {}; var bd := 1e9
	for t in model.towns:
		var d := (t.pos as Vector2 + Vector2(0.5, 0.5)).distance_to(p_tiles)
		if d < bd: bd = d; best = t
	return best

func _build_layout() -> void:
	for c in _root_infra.get_children(): c.queue_free()
	_house_mm.clear(); _house_map.clear(); _town_lamps.clear(); _yard_lights.clear(); _battery = {}; _lighthouse = {}; _unit_lights.clear()
	_town_inst.clear(); _town_lampmm.clear(); _wave.clear(); _warn.clear()
	var hmat := ShaderMaterial.new(); hmat.shader = load("res://world3d/shaders/house.gdshader"); _hmat = hmat
	var house := Props3D.house(); var block := Props3D.block()
	var walls := [Color(0.86, 0.82, 0.74), Color(0.78, 0.72, 0.62), Color(0.9, 0.88, 0.84), Color(0.72, 0.62, 0.52), Color(0.82, 0.8, 0.76), Color(0.66, 0.6, 0.55)]
	if field is GenField: walls = [Color(0.78, 0.72, 0.62), Color(0.62, 0.36, 0.26), Color(0.84, 0.8, 0.72), Color(0.55, 0.32, 0.24), Color(0.7, 0.66, 0.6), Color(0.74, 0.6, 0.46), Color(0.5, 0.48, 0.46)]   # stone, brick, render
	var places: Array = []   # [x, z, w, d, h, rot, town_id, idx, block?]
	var gen := field is GenField
	var tg: Dictionary = TownGen.build(field, model, quality, ground) if gen else {}
	var areas := _town_areas() if not gen else []
	var garden: Array = []   # plots left as gardens (trees)
	if gen:
		places = tg.places
		var sm := MeshInstance3D.new(); sm.name = "Streets"; sm.mesh = TownGen.street_mesh(tg.streets, ground)
		var am := StandardMaterial3D.new(); am.albedo_color = Color(0.17, 0.17, 0.18); am.roughness = 0.92; sm.material_override = am
		sm.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; _root_infra.add_child(sm)
		for k in places.size(): if _h(k, 1, 615) > 0.8: garden.append(Vector3(places[k][0], 0, places[k][1]) + Vector3(6, 0, 6).rotated(Vector3.UP, places[k][5]))
		for cc in tg.centres: _build_hall(cc[0], cc[2])
	for ai in areas.size():
		var tiles: Array = areas[ai]
		var c := Vector2.ZERO
		for t in tiles: c += Vector2(t) + Vector2(0.5, 0.5)
		c /= float(tiles.size())
		var tw := _nearest_town(c)
		if tw.is_empty(): continue
		var count := int(tw.count)
		var k := 0
		for tt in tiles:   # four plots per 50 m tile along two streets, set back a little; jittered sizes and angles
			var t: Vector2i = tt
			for q in 4:
				var lx := 0.27 + 0.46 * float(q % 2); var lz := 0.27 + 0.46 * float(q / 2)
				var x := (t.x + lx) * tm + (_h(t.x, t.y, 500 + q) - 0.5) * 5.0
				var z := (t.y + lz) * tm + (_h(t.x, t.y, 510 + q) - 0.5) * 5.0
				var nb := 0   # town tiles around this one: the edge of town thins out, the centre stays dense
				for dd in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]: if tiles.has(t + dd): nb += 1
				var keep := 0.78 if nb == 4 else 0.45
				if _h(t.x, t.y, 600 + q) > keep:   # a garden, an orchard or a yard: a tree or two instead of a house
					garden.append(Vector3(x, 0, z)); continue
				var big := _h(t.x, t.y, 520 + q) > 0.9
				var w := 9.0 + 5.0 * _h(t.x, t.y, 530 + q); var d := 7.0 + 3.0 * _h(t.x, t.y, 540 + q)
				var h := 5.5 + 3.5 * _h(t.x, t.y, 550 + q)
				if big: w *= 1.8; d *= 1.5; h = 9.0
				places.append([x, z, w, d, h, (_h(t.x, t.y, 560 + q) - 0.5) * 0.25 + (PI * 0.5 if _h(t.x, t.y, 570) > 0.5 else 0.0), str(tw.id), k % count, big, clampf(Vector2(x, z).distance_to((tw.pos as Vector2 + Vector2(0.5, 0.5)) * tm) / (4.0 * tm), 0.0, 1.0)])
				k += 1
	# the island (L30): cottages round the green and the school hall, outside the engine's terrain rows
	if model.has("island_c"):
		var ic: Vector2 = model.island_c
		var tw := _nearest_town(ic)
		if not tw.is_empty():
			var count := int(tw.count)
			for k in 16:
				var a := TAU * (float(k) / 16.0) + 0.3 * _h(k, 3, 580)
				var r := (0.75 + 0.55 * _h(k, 4, 581)) * tm
				var x := ic.x * tm + cos(a) * r; var z := ic.y * tm + sin(a) * r * 0.8
				places.append([x, z, 8.0 + 3.0 * _h(k, 5, 582), 6.5, 5.5 + 1.5 * _h(k, 6, 583), a + PI * 0.5, str(tw.id), k % count, false, float(k) / 16.0])
			places.append([ic.x * tm + 8.0, ic.y * tm - 6.0, 22.0, 12.0, 7.0, 0.1, str(tw.id), 0, true, 0.0])   # the school hall
	for kind in [false, true]:
		var sel: Array = places.filter(func(p): return p[8] == kind)
		if sel.is_empty(): continue
		var mm := MultiMesh.new(); mm.transform_format = MultiMesh.TRANSFORM_3D; mm.use_colors = true; mm.use_custom_data = true
		mm.mesh = block if kind else house; mm.instance_count = sel.size()
		var mp: Array = []
		for q in sel.size():
			var p: Array = sel[q]
			var x: float = p[0]; var z: float = p[1]
			var g := minf(minf(ground(x - p[2] * 0.5, z), ground(x + p[2] * 0.5, z)), minf(ground(x, z - p[3] * 0.5), ground(x, z + p[3] * 0.5)))
			mm.set_instance_transform(q, Transform3D(Basis(Vector3.UP, p[5]).scaled(Vector3(p[2], p[4], p[3])), Vector3(x, g - 0.4, z)))
			mm.set_instance_color(q, walls[q % walls.size()] if not kind else Color(0.8, 0.8, 0.78))
			mm.set_instance_custom_data(q, Color(0, _h(q, 7, 590 if kind else 591), 0, 0))
			mp.append([p[6], p[7]])
			if not _town_inst.has(p[6]): _town_inst[p[6]] = []
			_town_inst[p[6]].append([_house_mm.size(), q, int(p[7]), float(p[9]) + 0.06 * _h(q, 9, 592)])
		var mi := MultiMeshInstance3D.new(); mi.multimesh = mm; mi.material_override = hmat; mi.name = "Blocks" if kind else "Houses"
		_root_infra.add_child(mi)
		_house_mm.append(mm); _house_map.append(mp)
	for ai in areas.size():   # a centre for each town: a hall with a tower at the middle of its tiles
		var tl: Array = areas[ai]
		if tl.size() < 6: continue
		var cc := Vector2.ZERO
		for t2 in tl: cc += Vector2(t2) + Vector2(0.5, 0.5)
		cc = cc / float(tl.size()) * tm
		var tw2 := _nearest_town(cc / tm)
		var hall := MeshInstance3D.new(); hall.mesh = Props3D.lighthouse(); hall.scale = Vector3(1.4, 1.6, 1.4)
		var hm := StandardMaterial3D.new(); hm.albedo_color = Color(0.78, 0.74, 0.66); hm.roughness = 0.9; hall.material_override = hm
		hall.position = Vector3(cc.x, ground(cc.x, cc.y) - 0.3, cc.y); _root_infra.add_child(hall)
		var nave := MeshInstance3D.new(); var nb2 := BoxMesh.new(); nb2.size = Vector3(26, 11, 12); nave.mesh = nb2; nave.material_override = hm
		nave.position = hall.position + Vector3(16, 5.5, 0); _root_infra.add_child(nave)
		var nr := MeshInstance3D.new(); var pr := PrismMesh.new(); pr.size = Vector3(12.5, 5, 27); nr.mesh = pr; nr.rotation.y = PI * 0.5
		var rm2 := StandardMaterial3D.new(); rm2.albedo_color = Color(0.32, 0.3, 0.3); nr.material_override = rm2; nr.position = hall.position + Vector3(16, 13.5, 0); _root_infra.add_child(nr)
	# the harbour: a quay along the shore below the harbour town, with moored boats
	for ai in areas.size():
		var tl2: Array = areas[ai]
		var south := -1.0; var x0 := 1e9; var x1 := -1e9
		for t3 in tl2: south = maxf(south, float(t3.y)); x0 = minf(x0, float(t3.x)); x1 = maxf(x1, float(t3.x))
		if south < field.H - 8: continue   # only a town by the sea
		var zq := 0.0
		for j2 in range(int(south), field.H2):   # first sea row below the town
			if field.kind_at_tile(int((x0 + x1) * 0.5), j2) == TerrainField.K_SEA: zq = j2 * tm; break
		if zq <= 0.0: continue
		var qm := StandardMaterial3D.new(); qm.albedo_color = Color(0.55, 0.53, 0.5); qm.roughness = 0.95
		var quay := MeshInstance3D.new(); var qb := BoxMesh.new(); qb.size = Vector3((x1 - x0 + 0.6) * tm, 4.0, 12.0); quay.mesh = qb; quay.material_override = qm
		quay.position = Vector3((x0 + x1 + 1.0) * 0.5 * tm, 0.6, zq - 2.0); _root_infra.add_child(quay)
		for k2 in 2:
			var pier := MeshInstance3D.new(); var pb := BoxMesh.new(); pb.size = Vector3(8, 3.0, 70); pier.mesh = pb; pier.material_override = qm
			pier.position = Vector3((x0 + (x1 - x0) * (0.3 + 0.4 * k2)) * tm, 0.4, zq + 40.0); _root_infra.add_child(pier)
			for b2 in 3:
				var boat := MeshInstance3D.new(); boat.mesh = Props3D.trawler(); boat.scale = Vector3.ONE * (0.45 + 0.15 * _h(k2, b2, 620))
				var bm2 := StandardMaterial3D.new(); bm2.vertex_color_use_as_albedo = true; boat.material_override = bm2
				boat.position = pier.position + Vector3(9.0 * (1 if b2 % 2 == 0 else -1), -0.3, -20.0 + 18.0 * b2); boat.rotation.y = PI * 0.5 + 0.1 * _h(k2, b2, 621)
				_root_infra.add_child(boat)
	if not garden.is_empty():   # garden trees between the houses
		var gm := MultiMesh.new(); gm.transform_format = MultiMesh.TRANSFORM_3D; gm.use_colors = true; gm.mesh = Props3D.broadleaf()
		gm.instance_count = garden.size() * 2
		for k in garden.size():
			for q in 2:
				var gp: Vector3 = garden[k] + Vector3((_h(k, q, 610) - 0.5) * 14.0, 0, (_h(k, q, 611) - 0.5) * 14.0)
				var sc := 7.0 + 6.0 * _h(k, q, 612)
				gm.set_instance_transform(k * 2 + q, Transform3D(Basis(Vector3.UP, TAU * _h(k, q, 613)).scaled(Vector3(sc, sc, sc)), Vector3(gp.x, ground(gp.x, gp.z) - 0.3, gp.z)))
				gm.set_instance_color(k * 2 + q, Color(0.9 + 0.2 * _h(k, q, 614), 1.0, 0.85))
		var gmi := MultiMeshInstance3D.new(); gmi.multimesh = gm; var tm3 := ShaderMaterial.new(); tm3.shader = load("res://world3d/shaders/tree.gdshader"); gmi.material_override = tm3
		_root_infra.add_child(gmi)
	if gen: _build_town_lamps(tg.lamps)
	else:
		var ll: Array = []
		for k in places.size():
			if k % 2 == 1: continue
			var lp: Vector2 = Vector2(places[k][0], places[k][1]) + Vector2(9.0, 9.0)
			ll.append([Vector3(lp.x, ground(lp.x, lp.y) + 7.0, lp.y), places[k][6], places[k][9]])
		_build_town_lamps(ll)
	for s in model.subs: _build_yard(s)
	for u in model.units: _build_unit(u)
	for b in model.get("batteries", []): _build_battery(b)
	if model.has("island_c"): _build_lighthouse(model.island_c)
	_build_trawler()

func _glow_mat(col: Color, power := 2.0, pulse := 0.0) -> ShaderMaterial:
	var m := ShaderMaterial.new(); m.shader = load("res://world3d/shaders/glow.gdshader")
	m.set_shader_parameter("tint", col); m.set_shader_parameter("power", power); m.set_shader_parameter("pulse", pulse)
	return m

## Street lamps along the town streets (on the town tiles' plot lines) and a few warm light pools; lit only while the town has voltage.
func _build_town_lamps(lamp_list: Array) -> void:
	var by_town := {}
	for l in lamp_list:
		var id: String = l[1]
		if not by_town.has(id): by_town[id] = []
		by_town[id].append(l)
	var sph := SphereMesh.new(); sph.radius = 0.55; sph.height = 1.1; sph.radial_segments = 6; sph.rings = 3
	var pole_m := CylinderMesh.new(); pole_m.top_radius = 0.08; pole_m.bottom_radius = 0.12; pole_m.height = 7.0; pole_m.radial_segments = 5
	var pole_mat := StandardMaterial3D.new(); pole_mat.albedo_color = Color(0.25, 0.26, 0.28); pole_mat.metallic = 0.5
	for id in by_town:
		var ls: Array = by_town[id]
		var nodes: Array = []
		var mm := MultiMesh.new(); mm.transform_format = MultiMesh.TRANSFORM_3D; mm.mesh = sph; mm.instance_count = ls.size()
		var pm2 := MultiMesh.new(); pm2.transform_format = MultiMesh.TRANSFORM_3D; pm2.mesh = pole_m; pm2.instance_count = ls.size()
		var dns := PackedFloat32Array(); var xfs: Array = []
		var c := Vector3.ZERO
		for k in ls.size():
			var lp: Vector3 = ls[k][0]
			var xf := Transform3D(Basis(), lp); xfs.append(xf); dns.append(float(ls[k][2]))
			mm.set_instance_transform(k, xf); pm2.set_instance_transform(k, Transform3D(Basis(), lp - Vector3(0, 3.6, 0)))
			c += lp
		c /= maxf(1.0, float(ls.size()))
		var pmi := MultiMeshInstance3D.new(); pmi.multimesh = pm2; pmi.material_override = pole_mat; pmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; _root_infra.add_child(pmi)
		var mi := MultiMeshInstance3D.new(); mi.multimesh = mm; mi.material_override = _glow_mat(Color(1.0, 0.66, 0.34), 2.6)
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; _root_infra.add_child(mi)
		_town_lampmm[id] = [mm, dns, xfs, mi]
		var n_pool := clampi(ls.size() / 14, 1, 6 if quality != "low" else 2)
		if quality == "low": n_pool = 0   # no dynamic lights on the low tier: the amber disc and the windows carry the town
		for k in n_pool:   # warm pools of light on the streets (they also light the volumetric haze over the town)
			var l: Vector3 = ls[(k * ls.size()) / n_pool][0]
			var o := OmniLight3D.new(); o.position = l + Vector3(0, 14, 0); o.omni_range = 160.0; o.light_color = Color(1.0, 0.7, 0.42)
			o.light_energy = 2.0; o.omni_attenuation = 1.4; o.shadow_enabled = false; o.light_volumetric_fog_energy = 2.5
			_root_infra.add_child(o); nodes.append(o)
		var spread := 0.0
		for l in ls: spread = maxf(spread, (l[0] as Vector3).distance_to(c))
		var pool := MeshInstance3D.new(); var pd := CylinderMesh.new(); var rad := clampf(spread * 1.15, 60.0, 1400.0)
		pd.top_radius = rad; pd.bottom_radius = rad; pd.height = 0.2; pd.radial_segments = 40; pool.mesh = pd
		var pg := _glow_mat(Color(1.0, 0.6, 0.25, 0.07 if field is GenField else 0.2), 1.0); pg.set_shader_parameter("radial", rad); pool.material_override = pg
		pool.position = c - Vector3(0, 6.0, 0); pool.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		_root_infra.add_child(pool); nodes.append(pool)   # an amber haze over a lit town, readable from the whole province
		_town_lamps[id] = nodes

## A town centre: a hall with a tower on the square, the nave along the main street.
func _build_hall(c: Vector2, rot: float) -> void:
	var n := Node3D.new(); n.position = Vector3(c.x, ground(c.x, c.y) - 0.3, c.y); n.rotation.y = -rot; _root_infra.add_child(n)
	var hm := StandardMaterial3D.new(); hm.albedo_color = Color(0.8, 0.75, 0.66); hm.roughness = 0.9
	var tower := MeshInstance3D.new(); tower.mesh = Props3D.lighthouse(); tower.scale = Vector3(1.4, 1.7, 1.4); tower.material_override = hm; tower.position = Vector3(-14, 0, 0); n.add_child(tower)
	var nave := MeshInstance3D.new(); var nb := BoxMesh.new(); nb.size = Vector3(28, 11, 13); nave.mesh = nb; nave.material_override = hm; nave.position = Vector3(4, 5.5, 0); n.add_child(nave)
	var roof := MeshInstance3D.new(); var pr := PrismMesh.new(); pr.size = Vector3(13.5, 5.5, 29); roof.mesh = pr; roof.rotation.y = PI * 0.5
	var rm := StandardMaterial3D.new(); rm.albedo_color = Color(0.3, 0.29, 0.3); roof.material_override = rm; roof.position = Vector3(4, 13.75, 0); n.add_child(roof)
	var sq := MeshInstance3D.new(); var sb := BoxMesh.new(); sb.size = Vector3(60, 0.3, 60); sq.mesh = sb
	var sqm := StandardMaterial3D.new(); sqm.albedo_color = Color(0.55, 0.52, 0.47); sqm.roughness = 0.95; sq.material_override = sqm; sq.position = Vector3(0, 0.35, 0); n.add_child(sq)

func _build_yard(s: Dictionary) -> void:
	var p := tile_to_world(s.pos as Vector2 + Vector2(0.5, 0.5))
	var y := Node3D.new(); y.name = "Yard_%s" % s.id; y.position = p; _root_infra.add_child(y)
	var pad := MeshInstance3D.new(); var bm := BoxMesh.new(); bm.size = Vector3(26, 0.6, 18); pad.mesh = bm
	var pm := StandardMaterial3D.new(); pm.albedo_color = Color(0.5, 0.49, 0.46); pm.roughness = 1.0; pad.material_override = pm
	pad.position = Vector3(0, 0.1, 0); y.add_child(pad)
	var fence := StandardMaterial3D.new(); fence.albedo_color = Color(0.6, 0.62, 0.64, 0.28); fence.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; fence.metallic = 0.6; fence.roughness = 0.4; fence.cull_mode = BaseMaterial3D.CULL_DISABLED
	for e in [[Vector3(0, 1.2, -9), Vector3(26, 2.2, 0.08)], [Vector3(0, 1.2, 9), Vector3(26, 2.2, 0.08)], [Vector3(-13, 1.2, 0), Vector3(0.08, 2.2, 18)], [Vector3(13, 1.2, 0), Vector3(0.08, 2.2, 18)]]:
		var f := MeshInstance3D.new(); var fb := BoxMesh.new(); fb.size = e[1]; f.mesh = fb; f.material_override = fence; f.position = e[0]; y.add_child(f)
	for k in 2:   # the yard kit: two transformers, the gantry, a control hut
		var t2 := MeshInstance3D.new(); t2.mesh = Props3D.transformer(); t2.position = Vector3(-8 + 6 * k, 0.4, 3); var tm4 := StandardMaterial3D.new(); tm4.vertex_color_use_as_albedo = true; tm4.roughness = 0.5; tm4.metallic = 0.3; t2.material_override = tm4; y.add_child(t2)
	var hut := MeshInstance3D.new(); var hb := BoxMesh.new(); hb.size = Vector3(6, 3.2, 4); hut.mesh = hb; var hm3 := StandardMaterial3D.new(); hm3.albedo_color = Color(0.7, 0.68, 0.62); hut.material_override = hm3; hut.position = Vector3(8, 2.0, 5); y.add_child(hut)
	var tr := MeshInstance3D.new(); tr.mesh = Props3D.transformer(); tr.position = Vector3(-5, 0.4, 2); tr.visible = false
	var tmat := StandardMaterial3D.new(); tmat.vertex_color_use_as_albedo = true; tmat.roughness = 0.5; tmat.metallic = 0.3
	tr.material_override = tmat; y.add_child(tr)
	var g := MeshInstance3D.new(); g.mesh = Props3D.gantry(); g.material_override = tmat; g.position = Vector3(5, 0.4, -2); y.add_child(g)
	_yard_kit(y, tmat)
	var lamp := MeshInstance3D.new(); var sm := SphereMesh.new(); sm.radius = 0.5; sm.height = 1.0; lamp.mesh = sm
	lamp.material_override = _glow_mat(Color(0.75, 0.85, 1.0), 4.0); lamp.position = Vector3(0, 8, -8); y.add_child(lamp)
	var o := OmniLight3D.new(); o.position = Vector3(0, 10, 0); o.omni_range = 45.0; o.light_color = Color(0.8, 0.88, 1.0); o.light_energy = 1.5; y.add_child(o)
	_yard_lights[str(s.id)] = [lamp, o]
	if quality == "low": o.free(); _yard_lights[str(s.id)] = [lamp]

## The switchgear of a yard: fence posts and top rail, three breaker bays, the busbars on posts and a red warning light on the gantry.
func _yard_kit(y: Node3D, steel: Material) -> void:
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var g := Color(0.55, 0.57, 0.6)
	for k in 14:   # fence posts round the 26 x 18 m pad, and the top rail
		var t := float(k) / 14.0 * 88.0
		var p := Vector3(-13 + minf(t, 26.0), 0, -9) if t < 26.0 else (Vector3(13, 0, -9 + (t - 26.0)) if t < 44.0 else (Vector3(13 - (t - 44.0), 0, 9) if t < 70.0 else Vector3(-13, 0, 9 - (t - 70.0))))
		Props3D._cyl(st, p, p + Vector3(0, 2.4, 0), 0.05, 0.05, 4, g)
	for e in [[Vector3(-13, 2.4, -9), Vector3(13, 2.4, -9)], [Vector3(13, 2.4, -9), Vector3(13, 2.4, 9)], [Vector3(13, 2.4, 9), Vector3(-13, 2.4, 9)], [Vector3(-13, 2.4, 9), Vector3(-13, 2.4, -9)]]:
		Props3D._cyl(st, e[0], e[1], 0.03, 0.03, 3, g)
	for x in [-9.0, 0.0, 9.0]:   # busbar posts and the three phase bars at 6 m
		for z in [-6.5, -4.5]: Props3D._cyl(st, Vector3(x, 0.4, z), Vector3(x, 6.0, z), 0.12, 0.1, 5, Color(0.75, 0.76, 0.78))
	for ph in 3:
		var z := -6.8 + ph * 0.9
		Props3D._cyl(st, Vector3(-10, 6.0 + ph * 0.0, z), Vector3(10, 6.0, z), 0.09, 0.09, 6, Color(0.78, 0.6, 0.4))
	st.generate_normals()
	var mi := MeshInstance3D.new(); mi.mesh = st.commit(); var mm := StandardMaterial3D.new(); mm.vertex_color_use_as_albedo = true; mm.metallic = 0.6; mm.roughness = 0.4
	mi.material_override = mm; y.add_child(mi)
	var br := Props3D.breaker()
	for k in 3:
		var b := MeshInstance3D.new(); b.mesh = br; b.material_override = mm; b.position = Vector3(-7 + 7 * k, 0.4, -1.5); y.add_child(b)
	var warn := MeshInstance3D.new(); var ws := SphereMesh.new(); ws.radius = 0.35; ws.height = 0.7; warn.mesh = ws
	warn.material_override = _glow_mat(Color(1.0, 0.12, 0.08), 6.0); warn.position = Vector3(5, 8.6, -2); y.add_child(warn); _warn.append(warn)

func _build_unit(u: Dictionary) -> void:
	if str(u.kind) != "hydro" and not str(u.kind).contains("hydro"): return
	var p := tile_to_world(u.pos as Vector2 + Vector2(0.5, 0.5))
	var n := Node3D.new(); n.name = "Hydro_%s" % u.id; n.position = p; _root_infra.add_child(n)
	var hmat := StandardMaterial3D.new(); hmat.albedo_color = Color(0.72, 0.68, 0.6); hmat.roughness = 0.9
	var b := MeshInstance3D.new(); var bm := BoxMesh.new(); bm.size = Vector3(16, 9, 11); b.mesh = bm; b.material_override = hmat; b.position = Vector3(0, 4.0, 0); n.add_child(b)
	var r := MeshInstance3D.new(); var rm := PrismMesh.new(); rm.size = Vector3(17, 3.5, 12); r.mesh = rm
	var rmat := StandardMaterial3D.new(); rmat.albedo_color = Color(0.3, 0.32, 0.34); r.material_override = rmat; r.position = Vector3(0, 10.2, 0); n.add_child(r)
	# the penstock: a steel pipe down the hillside from the west
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var prev := Vector3(-8, 3, 0)
	for k in range(1, 13):
		var x := -8.0 - k * 28.0
		var q := Vector3(x, ground(p.x + x, p.z + sin(k * 0.4) * 6.0) - p.y + 1.4, sin(k * 0.4) * 6.0)
		Props3D._cyl(st, prev, q, 1.1, 1.1, 8, Color(0.36, 0.33, 0.3))
		prev = q
	st.generate_normals()
	var pipe := MeshInstance3D.new(); pipe.mesh = st.commit(); var pmat := StandardMaterial3D.new(); pmat.vertex_color_use_as_albedo = true; pmat.metallic = 0.5; pmat.roughness = 0.45
	pipe.material_override = pmat; n.add_child(pipe)
	var win := MeshInstance3D.new(); var wm := BoxMesh.new(); wm.size = Vector3(14, 2.0, 0.2); win.mesh = wm; win.material_override = _glow_mat(Color(1.0, 0.78, 0.5), 2.5)
	win.position = Vector3(0, 5.0, 5.6); n.add_child(win)
	_unit_lights.append([str(u.id), win])

func _build_battery(b: Dictionary) -> void:
	var p := tile_to_world(b.pos as Vector2 + Vector2(1.3, 1.1))
	var n := Node3D.new(); n.name = "Battery_%s" % b.id; n.position = p; _root_infra.add_child(n)
	var box := MeshInstance3D.new(); var bm := BoxMesh.new(); bm.size = Vector3(12.2, 2.6, 2.45); box.mesh = bm
	var m := StandardMaterial3D.new(); m.albedo_color = Color(0.86, 0.86, 0.82); m.roughness = 0.6; box.material_override = m; box.position = Vector3(0, 1.5, 0); n.add_child(box)
	var bar := MeshInstance3D.new(); var bb := BoxMesh.new(); bb.size = Vector3(1, 0.5, 0.1); bar.mesh = bb; bar.position = Vector3(0, 2.0, 1.28); n.add_child(bar)
	_battery = {"node": n, "bar": bar, "id": str(b.id)}

func _build_lighthouse(ic: Vector2) -> void:
	var lp := (ic + Vector2(-1.7, 0.9)) * tm
	var n := Node3D.new(); n.name = "Lighthouse"; n.position = Vector3(lp.x, ground(lp.x, lp.y) - 0.3, lp.y); _root_infra.add_child(n)
	var mi := MeshInstance3D.new(); mi.mesh = Props3D.lighthouse()
	var m := StandardMaterial3D.new(); m.vertex_color_use_as_albedo = true; m.roughness = 0.7; mi.material_override = m; n.add_child(mi)
	var lamp := MeshInstance3D.new(); var sm := SphereMesh.new(); sm.radius = 0.8; sm.height = 1.6; lamp.mesh = sm
	lamp.material_override = _glow_mat(Color(1.0, 0.92, 0.7), 8.0); lamp.position = Vector3(0, 16.4, 0); n.add_child(lamp)
	var beam := Node3D.new(); beam.position = Vector3(0, 16.4, 0); n.add_child(beam)
	for sgn in []:   # (beams removed after the art review: they read as a rendering error) two beams: long thin cones, additive, fading outward
		var c := MeshInstance3D.new(); var cm := CylinderMesh.new(); cm.top_radius = 0.6; cm.bottom_radius = 14.0; cm.height = 600.0; cm.radial_segments = 10; cm.cap_top = false; cm.cap_bottom = false
		c.mesh = cm; var gm := _glow_mat(Color(1.0, 0.93, 0.7, 0.025), 1.0); gm.set_shader_parameter("fade_v", 3.0); c.material_override = gm
		c.rotation = Vector3(0, 0, -PI * 0.5 * sgn); c.position = Vector3(300.0 * sgn, 0, 0); c.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		beam.add_child(c)
	var o := OmniLight3D.new(); o.omni_range = 60.0; o.light_color = Color(1, 0.9, 0.7); o.light_energy = 3.0; o.position = Vector3(0, 16.4, 0); n.add_child(o)
	_lighthouse = {"node": n, "lamp": lamp, "beam": beam, "light": o}

func _build_trawler() -> void:
	_trawler = Node3D.new(); _trawler.name = "Trawler"; _trawler.visible = false; _root_infra.add_child(_trawler)
	var mi := MeshInstance3D.new(); mi.mesh = Props3D.trawler()
	var m := StandardMaterial3D.new(); m.vertex_color_use_as_albedo = true; m.roughness = 0.6; mi.material_override = m; _trawler.add_child(mi)
	var lamp := MeshInstance3D.new(); var sm := SphereMesh.new(); sm.radius = 0.5; sm.height = 1.0; lamp.mesh = sm
	lamp.material_override = _glow_mat(Color(1.0, 0.95, 0.75), 6.0); lamp.position = Vector3(1, 11.2, 0); _trawler.add_child(lamp)
	var deck := OmniLight3D.new(); deck.position = Vector3(-2, 6, 0); deck.omni_range = 30.0; deck.light_energy = 1.5; deck.light_color = Color(1, 0.9, 0.7); _trawler.add_child(deck)

# --------------------------------------------------------------------------------------------------------------------
# Lines: overhead routes (engine supports and sags), plain pole lines, the sea cable
# --------------------------------------------------------------------------------------------------------------------
func _line_by_id(id: String) -> Dictionary:
	for l in model.lines: if str(l.id) == id: return l
	return {}

func _build_lines() -> void:
	for c in _root_dyn.get_children(): c.queue_free()
	_wire_glow.clear(); _cable = {}; _warn_l.clear()
	var wire_mat := StandardMaterial3D.new(); wire_mat.albedo_color = Color(0.52, 0.54, 0.56); wire_mat.metallic = 0.8; wire_mat.roughness = 0.35
	var pole_mat := StandardMaterial3D.new(); pole_mat.vertex_color_use_as_albedo = true; pole_mat.roughness = 0.75
	var meshes := {}
	var routed := {}
	for r in model.routes:
		routed[str(r.id)] = true
		var sts := SurfaceTool.new(); sts.begin(Mesh.PRIMITIVE_TRIANGLES)
		var sup_att: Array = []   # per support: world attachment points of the three phases
		for s in r.supports:
			var fam := str(s.family)
			var key := "%s|%.1f|%.1f" % [fam, float(s.pole_m), float(s.attach_m)]
			if not meshes.has(key): meshes[key] = Props3D.support(fam, float(s.pole_m), float(s.attach_m))
			var mm: Array = meshes[key]
			var m: Vector2 = s.m
			var base := Vector3(m.x, ground(m.x, m.y), m.y)
			var d: Vector2 = s.dir
			var basis := Basis(Vector3.UP, -atan2(d.y, d.x))   # local +X along the line
			var mi := MeshInstance3D.new(); mi.mesh = mm[0]; mi.material_override = pole_mat; mi.transform = Transform3D(basis, base); _root_dyn.add_child(mi)
			var att: Array = []
			for a in mm[1]: att.append(base + basis * (a as Vector3))
			sup_att.append(att)
		var acc := 0.0
		for sp in r.spans:
			var A: Array = sup_att[int(sp.a)]; var B: Array = sup_att[int(sp.b)]
			for ph in mini(A.size(), B.size()):
				Props3D.add_wire(sts, A[ph], B[ph], float(sp.sag_m), 0.05, acc)
			acc += (A[0] as Vector3).distance_to(B[0])
		var wmesh := sts.commit()
		var wi := MeshInstance3D.new(); wi.mesh = wmesh; wi.material_override = wire_mat; wi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; _root_dyn.add_child(wi)
		# the glow overlay: the same conductors, slightly fatter, emissive in the loading band colour with pulses in the flow direction
		var stg := SurfaceTool.new(); stg.begin(Mesh.PRIMITIVE_TRIANGLES)
		acc = 0.0
		for sp in r.spans:
			var A: Array = sup_att[int(sp.a)]; var B: Array = sup_att[int(sp.b)]
			Props3D.add_wire(stg, A[min(1, A.size() - 1)], B[min(1, B.size() - 1)], float(sp.sag_m), 0.14, acc)
			acc += (A[0] as Vector3).distance_to(B[0])
		var gi := MeshInstance3D.new(); gi.mesh = stg.commit(); gi.material_override = _glow_mat(Color(0.4, 0.85, 1.0, 1.0), 1.0, 0.6)
		gi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; _root_dyn.add_child(gi)
		_wire_glow[str(r.id)] = gi
	for l in model.lines:
		var kind := str(l.kind)
		if routed.has(str(l.id)) or kind == "xfmr": continue
		if kind == "cable": _build_sea_cable(l); continue
		_build_pole_line(l, wire_mat, pole_mat, meshes)

func _build_pole_line(l: Dictionary, wire_mat: Material, pole_mat: Material, meshes: Dictionary) -> void:
	if field is GenField and float(l.get("kv", 11.0)) >= 66.0: _build_tower_line(l, wire_mat, meshes); return
	var pts: Array = l.pts
	var key := "pcc-11|11.0|9.0"
	if not meshes.has(key): meshes[key] = Props3D.support("pcc-11", 11.0, 9.0)
	var mm: Array = meshes[key]
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var prev: Array = []
	var acc := 0.0
	for k in range(pts.size() - 1):
		var a: Vector2 = (pts[k] as Vector2 + Vector2(0.5, 0.5)) * tm; var b: Vector2 = (pts[k + 1] as Vector2 + Vector2(0.5, 0.5)) * tm
		var n := maxi(1, int(round(a.distance_to(b) / 80.0)))
		for q in range(0 if k == 0 else 1, n + 1):
			var m := a.lerp(b, float(q) / n)
			var d := (b - a).normalized()
			var basis := Basis(Vector3.UP, -atan2(d.y, d.x))
			var base := Vector3(m.x, ground(m.x, m.y), m.y)
			var mi := MeshInstance3D.new(); mi.mesh = mm[0]; mi.material_override = pole_mat; mi.transform = Transform3D(basis, base); _root_dyn.add_child(mi)
			var att: Array = []
			for at in mm[1]: att.append(base + basis * (at as Vector3))
			if not prev.is_empty():
				for ph in 3: Props3D.add_wire(st, prev[ph], att[ph], 1.6, 0.05, acc)
				acc += (prev[0] as Vector3).distance_to(att[0])
			prev = att
	var wi := MeshInstance3D.new(); wi.mesh = st.commit(); wi.material_override = wire_mat; _root_dyn.add_child(wi)

## A transmission line on lattice towers: height and arm by voltage, about 330 m spans, six conductors (two circuits) and an earth wire,
## a glow overlay in the loading band colour, a red light on each tower top at night.
func _build_tower_line(l: Dictionary, wire_mat: Material, meshes: Dictionary) -> void:
	var kv := float(l.kv)
	var h := 46.0 if kv >= 300.0 else (36.0 if kv >= 200.0 else 27.0)
	var arm := 9.0 if kv >= 300.0 else (7.0 if kv >= 200.0 else 5.0)
	var key := "tower|%d" % int(h)
	if not meshes.has(key): meshes[key] = Props3D.tower(h, arm)
	var tw: Array = meshes[key]
	var tmat := ShaderMaterial.new(); tmat.shader = load("res://world3d/shaders/tower.gdshader")
	var pts: Array = l.pts
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var sg := SurfaceTool.new(); sg.begin(Mesh.PRIMITIVE_TRIANGLES)
	var xfs: Array = []; var tops: Array = []
	var prev: Array = []; var acc := 0.0
	var ring := 140.0   # towers stand outside the yards at both ends
	for k in range(pts.size() - 1):
		var a: Vector2 = (pts[k] as Vector2 + Vector2(0.5, 0.5)) * tm; var b: Vector2 = (pts[k + 1] as Vector2 + Vector2(0.5, 0.5)) * tm
		var dv := (b - a).normalized()
		if k == 0: a += dv * ring
		if k == pts.size() - 2: b -= dv * ring
		var n := maxi(1, int(round(a.distance_to(b) / 330.0)))
		for q in range(0 if k == 0 else 1, n + 1):
			var m := a.lerp(b, float(q) / n)
			var basis := Basis(Vector3.UP, -atan2(dv.y, dv.x))
			var base := Vector3(m.x, ground(m.x, m.y) - 0.3, m.y)
			xfs.append(Transform3D(basis, base))
			var att: Array = []
			for at in tw[1]: att.append(base + basis * (at as Vector3))
			tops.append(att[att.size() - 1])
			if not prev.is_empty():
				var span := (prev[0] as Vector3).distance_to(att[0])
				var sag := span * span / 8.0 / 1900.0   # a catenary parameter of about 1900 m at a warm evening
				for ph in 7: Props3D.add_wire(st, prev[ph], att[ph], sag * (0.75 if ph == 6 else 1.0), 0.11 if ph < 6 else 0.06, acc)
				Props3D.add_wire(sg, prev[1], att[1], sag, 0.3, acc); Props3D.add_wire(sg, prev[4], att[4], sag, 0.3, acc)
				acc += span
			prev = att
	var mm := MultiMesh.new(); mm.transform_format = MultiMesh.TRANSFORM_3D; mm.mesh = tw[0]; mm.instance_count = xfs.size()
	for k in xfs.size(): mm.set_instance_transform(k, xfs[k])
	var mi := MultiMeshInstance3D.new(); mi.multimesh = mm; mi.material_override = tmat; _root_dyn.add_child(mi)
	var cmat := ShaderMaterial.new(); cmat.shader = load("res://world3d/shaders/tower.gdshader"); cmat.set_shader_parameter("inflate", 0.00035); cmat.set_shader_parameter("metal", 0.8); cmat.set_shader_parameter("rough", 0.3)
	var wi := MeshInstance3D.new(); wi.mesh = st.commit(); wi.material_override = cmat; wi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; _root_dyn.add_child(wi)
	var gm := _glow_mat(Color(0.4, 0.85, 1.0, 1.0), 1.0, 0.6); gm.set_shader_parameter("inflate", 0.00045)
	var gi := MeshInstance3D.new(); gi.mesh = sg.commit(); gi.material_override = gm
	gi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; _root_dyn.add_child(gi)
	_wire_glow[str(l.id)] = gi
	var rm := MultiMesh.new(); rm.transform_format = MultiMesh.TRANSFORM_3D; var rs := SphereMesh.new(); rs.radius = 0.5; rs.height = 1.0; rs.radial_segments = 6; rs.rings = 3
	rm.mesh = rs; rm.instance_count = tops.size()
	for k in tops.size(): rm.set_instance_transform(k, Transform3D(Basis(), tops[k]))
	var ri := MultiMeshInstance3D.new(); ri.multimesh = rm; ri.material_override = _glow_mat(Color(1.0, 0.1, 0.06), 6.0); ri.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_root_dyn.add_child(ri); _warn_l.append(ri)

## The submarine cable: an armoured line on the seabed (seen through shallow water) and a chart line on the surface, the way a control-room
## overlay draws it; pulses run along it while it carries power. After the anchor cut the far part is dark and a red marker pulses at the cut.
func _build_sea_cable(l: Dictionary) -> void:
	var pts: Array = l.pts
	if pts.size() < 2: return
	var a: Vector2 = (pts[0] as Vector2 + Vector2(0.5, 0.5)) * tm; var c: Vector2 = (pts[pts.size() - 1] as Vector2 + Vector2(0.5, 0.5)) * tm
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var sc := SurfaceTool.new(); sc.begin(Mesh.PRIMITIVE_TRIANGLES)
	var n := 40
	var prev := Vector3.ZERO; var prev_s := Vector3.ZERO
	for k in n + 1:
		var m := a.lerp(c, float(k) / n)
		var p := Vector3(m.x, minf(ground(m.x, m.y), 0.0) + 0.3, m.y)
		var ps := Vector3(m.x, maxf(ground(m.x, m.y), 0.0) + 1.2, m.y)
		if k > 0:
			Props3D._tube_seg(st, prev, p, 0.25, a.distance_to(m) - 1.0, a.distance_to(m))
			Props3D._tube_seg(sc, prev_s, ps, 0.7, a.distance_to(m) * 0.25 - 1.0, a.distance_to(m) * 0.25)
		prev = p; prev_s = ps
	var bed := MeshInstance3D.new(); bed.mesh = st.commit()
	var bm := StandardMaterial3D.new(); bm.albedo_color = Color(0.08, 0.08, 0.09); bm.roughness = 0.6; bed.material_override = bm
	_root_dyn.add_child(bed)
	var chart := MeshInstance3D.new(); chart.mesh = sc.commit(); chart.material_override = _glow_mat(Color(1.0, 0.7, 0.35, 1.0), 0.8, 0.8)
	chart.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; _root_dyn.add_child(chart)
	var cut := a.lerp(c, 0.4)
	var mk := MeshInstance3D.new(); var tm2 := TorusMesh.new(); tm2.inner_radius = 9.0; tm2.outer_radius = 12.0; tm2.rings = 24; tm2.ring_segments = 6; mk.mesh = tm2
	mk.material_override = _glow_mat(Color(1.0, 0.18, 0.12, 1.0), 4.0); mk.position = Vector3(cut.x, 1.5, cut.y); mk.visible = false; _root_dyn.add_child(mk)
	_cable = {"id": str(l.id), "chart": chart, "mark": mk, "a": a, "c": c}

# --------------------------------------------------------------------------------------------------------------------
# Every model refresh: windows, lamps, yards, conductor glow, battery, lighthouse, trawler, sky
# --------------------------------------------------------------------------------------------------------------------
func _update_dynamic() -> void:
	var mn := float(model.get("minute", 720.0))
	var n := WorldMath.night(mn)
	_update_sky(mn)
	var by_id := {}
	for t in model.towns: by_id[str(t.id)] = t
	if _hmat != null: _hmat.set_shader_parameter("night", n)
	for id in _town_inst:   # a change in a town's energies starts a wave from its centre (the first model applies at once)
		var tw: Dictionary = by_id.get(id, {})
		var sig := str(tw.get("energies", [])) + str(tw.get("v", 0.0) > 0.0)
		if not _wave.has(id): _wave[id] = {"t0": -100.0, "sig": sig, "done": false}
		elif str(_wave[id].sig) != sig: _wave[id] = {"t0": _t, "sig": sig, "done": false}
	for id in _town_lamps:
		var tw: Dictionary = by_id.get(id, {})
		var on := not tw.is_empty() and float(tw.v) > 0.0 and n > 0.25
		var bright := clampf(float(tw.get("v", 0.0)), 0.0, 1.1)
		bright *= bright
		for node in _town_lamps[id]:
			node.visible = on
			if node is OmniLight3D: node.light_energy = 2.2 * bright * n
		if _town_lampmm.has(id): (_town_lampmm[id][3] as Node3D).visible = n > 0.25
	for s in model.subs:
		var ls: Array = _yard_lights.get(str(s.id), [])
		for node in ls: node.visible = bool(s.get("energised", false)) and n > 0.2
	for ul in _unit_lights:
		var on := false
		for u in model.units: if str(u.id) == ul[0]: on = bool(u.online)
		(ul[1] as Node3D).visible = on and n > 0.15
	for id in _wire_glow:
		var l := _line_by_id(id)
		var gi: MeshInstance3D = _wire_glow[id]
		var live := not l.is_empty() and bool(l.in_service) and int(l.dir) != 0
		gi.visible = live and n > 0.3
		if live:
			var m: ShaderMaterial = gi.material_override
			var kv := float(l.get("kv", 11.0))   # voltage colour (400 kV violet, 220 kV teal, 132 kV green, below amber); the loading band colour takes over above 90 %
			var vc := Color(0.62, 0.55, 1.0) if kv >= 300.0 else (Color(0.3, 0.85, 0.95) if kv >= 200.0 else (Color(0.45, 0.95, 0.55) if kv >= 66.0 else Color(1.0, 0.75, 0.4)))
			if float(l.get("loading", 0.0)) > 0.9 or field is TerrainField and not field is GenField: vc = Color(l.color)
			m.set_shader_parameter("tint", Color(vc, 1.0)); m.set_shader_parameter("pulse", 0.25 + float(l.speed) * 0.8 * float(l.dir))
			m.set_shader_parameter("power", (0.35 + 0.3 * n) * (0.35 if field is GenField else 1.0))
	if not _cable.is_empty():
		var l := _line_by_id(str(_cable.id))
		var ok := not l.is_empty() and bool(l.in_service)
		var cm: ShaderMaterial = (_cable.chart as MeshInstance3D).material_override
		cm.set_shader_parameter("tint", Color(1.0, 0.68, 0.32, 1.0) if ok else Color(0.35, 0.38, 0.45, 1.0))
		cm.set_shader_parameter("pulse", 0.8 * float(l.get("dir", 0)) if ok else 0.0)
		cm.set_shader_parameter("power", 1.2 if ok else 0.5)
		(_cable.mark as Node3D).visible = not ok
		if _cable_ok and not ok and not OS.has_environment("CB_CAM"):   # the cut: turn the camera to the island before the report opens
			var ic: Vector2 = model.get("island_c", Vector2.ZERO)
			_g_target = tile_to_world(ic + Vector2(0, -3)); _g_dist = 1400.0; _g_pitch = deg_to_rad(26.0); _clamp_goal()
		_cable_ok = ok
	if not _battery.is_empty():
		for b in model.get("batteries", []):
			if str(b.id) != _battery.id: continue
			var soc := clampf(float(b.soc), 0.0, 1.0)
			var bar: MeshInstance3D = _battery.bar
			bar.scale = Vector3(maxf(0.05, soc) * 11.0, 1, 1); bar.position.x = -5.5 + soc * 5.5
			var col := Color("#4FB477") if soc > 0.5 else (Color("#E2A33B") if soc > 0.2 else Color("#D9483B"))
			bar.material_override = _glow_mat(col, 2.5, 0.0)
	if not _lighthouse.is_empty():
		var lit := false
		var ic: Vector2 = model.get("island_c", Vector2.ZERO)
		for tw in model.towns: if (tw.pos as Vector2).distance_to(ic) < 3.0 and float(tw.v) > 0.0: lit = true   # the lamp turns only while the island bus is live
		(_lighthouse.lamp as Node3D).visible = lit
		(_lighthouse.beam as Node3D).visible = lit and n > 0.2
		(_lighthouse.light as Node3D).visible = lit
	_place_trawler(mn)

## Lights follow the engine's energies building by building: a house switches when the wave front (WAVE_S seconds from the centre to the
## edge) passes it, so a town lights up outward from its substation and goes dark the same way. Lamps follow the same front.
func _run_waves() -> void:
	if _wave.is_empty(): return
	var by_id := {}
	for t in model.towns: by_id[str(t.id)] = t
	for id in _wave:
		var w: Dictionary = _wave[id]
		if bool(w.done): continue
		var front := (_t - float(w.t0)) / WAVE_S
		var tw: Dictionary = by_id.get(id, {})
		var en: PackedFloat32Array = tw.get("energies", PackedFloat32Array())
		var live := not tw.is_empty() and float(tw.get("v", 0.0)) > 0.0
		for it in _town_inst.get(id, []):
			if float(it[3]) > front: continue
			var mm: MultiMesh = _house_mm[int(it[0])]
			var e := en[int(it[2]) % en.size()] if en.size() > 0 else 0.0
			var cd := mm.get_instance_custom_data(int(it[1]))
			mm.set_instance_custom_data(int(it[1]), Color(clampf(e, 0.0, 1.0) * 0.82, cd.g, 0.0, 0.0))
		if _town_lampmm.has(id):
			var lm: Array = _town_lampmm[id]
			var dns: PackedFloat32Array = lm[1]
			for k in dns.size():
				if dns[k] > front: continue
				var xf: Transform3D = lm[2][k]
				(lm[0] as MultiMesh).set_instance_transform(k, xf if live else Transform3D(Basis().scaled(Vector3.ONE * 0.001), xf.origin))
		if front > 1.2: w.done = true

func _place_trawler(mn: float) -> void:
	if _trawler == null or _cable.is_empty(): if _trawler != null: _trawler.visible = false; return
	var cm := float(model.get("cut_min", -1.0))
	if cm <= 0.0 or mn <= cm - 90.0 or mn >= cm + 60.0: _trawler.visible = false; return
	var u := (mn - cm) / 60.0
	var a: Vector2 = _cable.a; var c: Vector2 = _cable.c
	var mid := a.lerp(c, 0.4)
	var bp := mid + Vector2(u * 7.0, 0.4 + 0.5 * u) * tm
	_trawler.visible = true
	_trawler.position = Vector3(bp.x, 0.0, bp.y)
	_trawler.rotation = Vector3(0, -atan2(0.5, 7.0), 0)

func _process(dt: float) -> void:
	if not visible or field == null: return
	_t += dt
	var k := 1.0 - exp(-dt * 9.0)
	target = target.lerp(_g_target, k); yaw = lerp_angle(yaw, _g_yaw, k); pitch = lerpf(pitch, _g_pitch, k); dist = lerpf(dist, _g_dist, k)
	_apply_camera()
	_run_waves()
	if not (_warn.is_empty() and _warn_l.is_empty()):
		var nn := WorldMath.night(float(model.get("minute", 720.0)))
		var on := nn > 0.3 and fmod(_t, 1.6) < 0.8
		for w in _warn + _warn_l: (w as Node3D).visible = on
	if not _lighthouse.is_empty() and (_lighthouse.beam as Node3D).visible: (_lighthouse.beam as Node3D).rotation.y = _t * 0.9
	if not _cable.is_empty() and (_cable.mark as Node3D).visible: (_cable.mark as Node3D).scale = Vector3.ONE * (1.0 + 0.25 * sin(_t * 5.0))
	if _trawler != null and _trawler.visible: _trawler.position.y = sin(_t * 1.4) * 0.3
	if OS.has_environment("CB_DBGSCALE") and perf.frames == 200: _dbg_scale()
	perf.frames += 1; var ms := dt * 1000.0; perf.ms += ms; perf.worst = maxf(perf.worst, ms)
	if OS.has_environment("CB_FRAMETIME"):   # GPU and CPU render time of the viewport, measured by the RenderingServer (independent of vsync)
		var vp := get_viewport().get_viewport_rid()
		if not _measuring: RenderingServer.viewport_set_measure_render_time(vp, true); _measuring = true
		_ft_gpu += RenderingServer.viewport_get_measured_render_time_gpu(vp); _ft_cpu += RenderingServer.viewport_get_measured_render_time_cpu(vp) + RenderingServer.get_frame_setup_time_cpu(); _ft_n += 1
		if _t - _ft_at > 2.0 and _t > 6.0:
			print("FRAMETIME res=%dx%d gpu_ms=%.2f cpu_render_ms=%.2f frame_ms=%.2f adapter=%s quality=%s" % [get_viewport().size.x, get_viewport().size.y, _ft_gpu / _ft_n, _ft_cpu / _ft_n, perf.ms / perf.frames, RenderingServer.get_video_adapter_name(), quality])
			_ft_at = _t; _ft_gpu = 0.0; _ft_cpu = 0.0; _ft_n = 0; perf.frames = 0; perf.ms = 0.0

# --------------------------------------------------------------------------------------------------------------------
# Camera: orbit / pan / zoom, limits that never show an edge
# --------------------------------------------------------------------------------------------------------------------
func reset_camera() -> void:
	_g_target = Vector3(map_size.x * 0.72, 0.0, map_size.y * 0.66)
	_g_target.y = maxf(ground(_g_target.x, _g_target.z), 0.0)
	_g_yaw = deg_to_rad(32.0); _g_pitch = deg_to_rad(29.0); _g_dist = maxf(map_size.x, map_size.y) * 0.62
	if field is GenField:   # the generated province opens on its capital at play zoom: whole streets readable, the next towns on the horizon
		_g_target = Vector3(map_size.x * 0.5, 0.0, map_size.y * 0.56); _g_target.y = maxf(ground(_g_target.x, _g_target.z), 0.0)
		_g_yaw = deg_to_rad(205.0); _g_pitch = deg_to_rad(22.0); _g_dist = 5200.0
	target = _g_target; yaw = _g_yaw; pitch = _g_pitch; dist = _g_dist
	_apply_camera()

func _clamp_goal() -> void:
	_g_target.x = clampf(_g_target.x, -1200.0, map_size.x + 1200.0)
	_g_target.z = clampf(_g_target.z, -1200.0, map_size.y + 900.0)
	_g_target.y = maxf(ground(_g_target.x, _g_target.z), 0.0)
	_g_pitch = clampf(_g_pitch, PITCH_MIN, PITCH_MAX)
	_g_dist = clampf(_g_dist, DIST_MIN, dist_max)

func _cam_pos(t: Vector3, y: float, p: float, d: float) -> Vector3:
	var off := Vector3(sin(y) * cos(p), sin(p), cos(y) * cos(p)) * d
	return t + off

func _apply_camera() -> void:
	var pos := _cam_pos(target, yaw, pitch, dist)
	var floor_y := maxf(ground(pos.x, pos.z), 0.0) + 15.0 + dist * 0.02   # never under the hill in front
	if pos.y < floor_y: pos.y = floor_y
	cam.look_at_from_position(pos, target, Vector3.UP)
	cam.current = true

## Drag the ground: `rel` in screen px.
func pan_px(rel: Vector2) -> void:
	var s := dist * 0.0012
	var right := Vector3(cos(yaw), 0, -sin(yaw)); var fwd := Vector3(-sin(yaw), 0, -cos(yaw))
	_g_target += (-right * rel.x + fwd * rel.y) * s / maxf(0.35, sin(pitch) * 0.6 + 0.4)
	_clamp_goal()

func orbit_px(rel: Vector2) -> void:
	_g_yaw -= rel.x * 0.006; _g_pitch += rel.y * 0.004; _clamp_goal()

## Zoom by `f` (>1 closer) toward the ground under screen point `sp`.
func zoom_at(sp: Vector2, f: float) -> void:
	var g := ground_point(sp)
	var nd := clampf(_g_dist / f, DIST_MIN, dist_max)
	if not is_nan(g.x):
		var k := 1.0 - nd / _g_dist
		_g_target = _g_target.lerp(g, k * 0.9)
	_g_dist = nd; _clamp_goal()

func center_on_tile(p: Vector2, z := 1.0) -> void:
	_g_target = tile_to_world(p + Vector2(0.5, 0.5)); _g_dist = clampf(maxf(map_size.x, map_size.y) * 0.95 / z, DIST_MIN, dist_max); _clamp_goal()

## CB_CAM camera words for screenshots: yaw=deg, pitch=deg, dist=m, tx/ty (tiles), snap (no easing).
func set_camera_spec(spec: String) -> bool:
	var used := false
	for part in spec.split(","):
		var kv := part.strip_edges().split("=")
		if kv.size() < 2: continue
		match kv[0]:
			"yaw": _g_yaw = deg_to_rad(float(kv[1])); used = true
			"pitch": _g_pitch = deg_to_rad(float(kv[1])); used = true
			"dist": _g_dist = float(kv[1]); used = true
			"tx": _g_target.x = (float(kv[1]) + 0.5) * tm; used = true
			"ty": _g_target.z = (float(kv[1]) + 0.5) * tm; used = true
			"zoom": _g_dist = maxf(map_size.x, map_size.y) * 0.95 / float(kv[1]); used = true
	_clamp_goal()
	target = _g_target; yaw = _g_yaw; pitch = _g_pitch; dist = _g_dist; _apply_camera()
	return used

# --------------------------------------------------------------------------------------------------------------------
# Projection for the 2D overlay (WorldView): screen <-> world. Screen = the canvas coordinates of the full-rect world control.
# --------------------------------------------------------------------------------------------------------------------
func _dbg_scale() -> void:
	var w := get_window()
	print("LOOK2SCALE win=%s vis=%s csf=%s final=%s canvas=%s" % [w.size, get_viewport().get_visible_rect(), w.content_scale_factor, get_viewport().get_final_transform(), get_viewport().canvas_transform])

var canvas_size := Vector2.ZERO   ## the overlay control's size in canvas units (WorldView sets it): screen px per canvas unit = viewport px / this

func _canvas_scale() -> float:
	if canvas_size.x < 1.0: return 1.0
	return get_viewport().get_visible_rect().size.x / canvas_size.x

func project(p: Vector3) -> Vector2:
	if cam.is_position_behind(p): return Vector2(-99999, -99999)
	return cam.unproject_position(p) / _canvas_scale()

## The ground (or sea surface) under a screen point, world metres (Vector3), NAN when the ray misses.
func ground_point(sp: Vector2) -> Vector3:
	var vp := sp * _canvas_scale()
	var o := cam.project_ray_origin(vp); var d := cam.project_ray_normal(vp)
	var t := 0.0; var step := maxf(4.0, dist * 0.01)
	var prev := o
	for i in 600:
		var p := o + d * t
		var g := maxf(ground(p.x, p.z), 0.0)
		if p.y <= g:
			var lo := t - step; var hi := t   # bisect the crossing
			for _k in 12:
				var mid := (lo + hi) * 0.5; var q := o + d * mid
				if q.y <= maxf(ground(q.x, q.z), 0.0): hi = mid
				else: lo = mid
			return o + d * hi
		prev = p
		t += step; step *= 1.01
		if t > 60000.0: break
	return Vector3(NAN, NAN, NAN)

## Screen px per tile at the camera target (WorldView sizes its markers by it).
func px_per_tile() -> float:
	var a := project(target); var b := project(target + Vector3(tm, 0, 0))
	return maxf(1.0, a.distance_to(b))
