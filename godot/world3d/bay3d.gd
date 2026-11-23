class_name Bay3D
extends Node3D
## The island bay in 3D (DECISIONS 23): one small scene drawn at metre scale from the bench model, used twice: the title backdrop (dusk, hamlet dark,
## lighthouse lit, a slow camera drift) and the bench levels L01 to L03. It reads what WorldView's `_rebuild_island` already decided (tile kinds and
## heights, trees, homes, hut, junction boxes) and the bench model (cable polylines and sizes, home voltages), so the 3D land is the 2D land.
##
## Lights come from the engine: each home's lamp has brightness (V / V0)^2 from the bench's own vLoadV and sourceV (WorldModel gives it as the town's
## `energies`), warm at the level's limit (43.2 V) or more and amber below; the porch bulb at the hut sits on the source, so it is (V0 / V0)^2 = 1 and white.
## The bench lumps a hamlet's homes on one node, so every home of a hamlet carries the same number: no gradient along the row is invented.
##
## WorldView drives it through the same small interface as Province3D (project, ground_point, ground, tm, px_per_tile, pan/orbit/zoom, camera spec), so the
## 2D overlay (labels, site pegs, the surveyed route, the hand) and the mouse picking stay in WorldView and map to the same tiles as in 2D.

const LEVELS := ["L01", "L02", "L03"]
const PXM := 0.9                  # WorldView's z px per metre (RouteDraw.PX_PER_M)
const HOME_LIGHT_E := 2.4         # OmniLight3D energy of a home at brightness 1
const PORCH_LIGHT_E := 3.2
const WARM := Color(1.0, 0.84, 0.54)      # at or above the limit
const AMBER := Color(1.0, 0.42, 0.06)     # below it
const WHITE := Color(1.0, 0.97, 0.90)     # the porch bulb, on the source
const PITCH_MIN := deg_to_rad(10.0)
const PITCH_MAX := deg_to_rad(80.0)

var quality := "high"
var tm := 10.0
var field = null                  # non-null once built: WorldView's `_l3()` asks for it
var own_lines := true             # the cable is a 3D mesh: WorldView draws no screen-space line overlay
var model: Dictionary = {}
var cam: Camera3D
var env: Environment
var sky_mat: ShaderMaterial
var sun: DirectionalLight3D
var moon: DirectionalLight3D
var canvas_size := Vector2.ZERO
var view = null                   # the WorldView that drives this scene (QA picking round trip)
var drift := false                # the title: a slow sway of the camera
var title := false
var target := Vector3.ZERO
var yaw := 0.0
var pitch := deg_to_rad(34.0)
var dist := 330.0
var _g_target := Vector3.ZERO
var _g_yaw := 0.0
var _g_pitch := deg_to_rad(34.0)
var _g_dist := 330.0
var _dist_default := 330.0
var _W := 0
var _H := 0
var _h := PackedFloat32Array()    # ground height (m) at tile centres
var _terrain_key := ""
var _places_key := ""
var _cables_key := ""
var _root_static: Node3D
var _root_places: Node3D
var _root_cables: Node3D
var _homes: Array = []            # [{ti, k, light, mat}]
var _porch: Dictionary = {}       # {light, mat}
var _lh: Dictionary = {}          # lighthouse {lamp_mat, light}
var _lh_pos := Vector2(-1e9, 0.0) # where it stands (metres, x / z)
var _water_mats: Array[ShaderMaterial] = []
var _terrain_mat: StandardMaterial3D
var _t := 0.0
var _minute := -1.0
var _measuring := false
var _ft_gpu := 0.0
var _ft_cpu := 0.0
var _ft_n := 0
var _ft_at := 0.0
var _ft_ms := 0.0
var _ft_frames := 0

func _ready() -> void: _setup()

func _setup() -> void:
	if _root_static != null: return
	quality = Province3D.pick_quality()
	_root_static = Node3D.new(); _root_static.name = "Static"; add_child(_root_static)
	_root_places = Node3D.new(); _root_places.name = "Places"; add_child(_root_places)
	_root_cables = Node3D.new(); _root_cables.name = "Cables"; add_child(_root_cables)
	cam = Camera3D.new(); cam.name = "Camera"; cam.near = 0.5; cam.far = 20000.0; cam.fov = 42.0; add_child(cam)
	_make_env()
	print("BAY3D quality=%s renderer=%s adapter=%s" % [quality, RenderingServer.get_current_rendering_method(), RenderingServer.get_video_adapter_name()])

# --------------------------------------------------------------------------------------------------------------------
# Environment: sky, sun, moon, haze (the camera carries it, so Province3D's WorldEnvironment is not in the way)
# --------------------------------------------------------------------------------------------------------------------
func _make_env() -> void:
	env = Environment.new()
	env.background_mode = Environment.BG_SKY
	var sky := Sky.new(); sky_mat = ShaderMaterial.new(); sky_mat.shader = load("res://world3d/shaders/sky.gdshader")
	var nt := NoiseTexture2D.new(); nt.seamless = true; nt.width = 256; nt.height = 256
	var fn := FastNoiseLite.new(); fn.frequency = 0.012; fn.fractal_octaves = 4; nt.noise = fn
	sky_mat.set_shader_parameter("noise", nt)
	sky.sky_material = sky_mat; sky.radiance_size = Sky.RADIANCE_SIZE_64
	sky.process_mode = Sky.PROCESS_MODE_INCREMENTAL
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.reflected_light_source = Environment.REFLECTION_SOURCE_DISABLED
	env.tonemap_mode = Environment.TONE_MAPPER_AGX
	env.glow_enabled = quality != "low"
	env.glow_intensity = 0.8; env.glow_bloom = 0.05; env.glow_hdr_threshold = 1.0
	env.glow_blend_mode = Environment.GLOW_BLEND_MODE_SOFTLIGHT
	env.fog_enabled = true; env.fog_mode = Environment.FOG_MODE_DEPTH
	env.fog_depth_begin = 500.0; env.fog_depth_end = 9000.0; env.fog_depth_curve = 1.6
	env.fog_sky_affect = 0.3; env.fog_density = 1.0
	env.adjustment_enabled = true; env.adjustment_contrast = 1.06; env.adjustment_saturation = 1.06
	if quality != "low": env.ssao_enabled = true; env.ssao_radius = 1.5; env.ssao_intensity = 1.4
	sun = DirectionalLight3D.new(); sun.name = "Sun"; sun.shadow_enabled = quality != "low"
	sun.directional_shadow_max_distance = 900.0; sun.light_angular_distance = 0.5; add_child(sun)
	moon = DirectionalLight3D.new(); moon.name = "Moon"; moon.shadow_enabled = false; moon.light_color = Color(0.62, 0.72, 1.0); add_child(moon)
	cam.environment = env
	var vp := get_viewport()
	if vp == null: return   # not in the tree yet (a test): the viewport tiers do not matter there
	if quality == "high": vp.msaa_3d = Viewport.MSAA_4X
	elif quality == "medium": vp.msaa_3d = Viewport.MSAA_2X
	else:   # integrated GPUs: the 3D view renders at 60 % and is upscaled with sharpening; the UI stays at full resolution
		vp.scaling_3d_scale = 0.6
		vp.scaling_3d_mode = Viewport.SCALING_3D_MODE_FSR; vp.fsr_sharpness = 0.35

func _update_sky(mn: float) -> void:
	_minute = mn
	var n := WorldMath.night(mn); var d := WorldMath.dusk(mn)
	var zen := Color(0.20, 0.40, 0.74).lerp(Color(0.02, 0.035, 0.09), n).lerp(Color(0.09, 0.17, 0.42), d * 0.7)
	var hor := Color(0.70, 0.80, 0.90).lerp(Color(0.06, 0.09, 0.18), n).lerp(Color(0.95, 0.72, 0.52), d * 0.55)
	sky_mat.set_shader_parameter("zenith", zen); sky_mat.set_shader_parameter("horizon", hor); sky_mat.set_shader_parameter("ground", hor * 0.35)
	sky_mat.set_shader_parameter("night", n); sky_mat.set_shader_parameter("dusk", d)
	sky_mat.set_shader_parameter("sun_glow", Color(1.0, 0.62, 0.32).lerp(Color(1.0, 0.9, 0.75), 1.0 - d))
	sky_mat.set_shader_parameter("cloud_lit", Color(1.0, 0.93, 0.85).lerp(Color(1.0, 0.55, 0.35), d).lerp(Color(0.10, 0.12, 0.2), n))
	sky_mat.set_shader_parameter("cloud_dark", Color(0.55, 0.58, 0.66).lerp(Color(0.35, 0.25, 0.35), d).lerp(Color(0.03, 0.04, 0.07), n))
	var a := (mn - 360.0) / 720.0 * PI
	var elev := sin(a) * deg_to_rad(50.0) + deg_to_rad(6.0)
	var to_sun := Vector3(cos(a) * cos(elev), sin(elev), sin(a) * cos(elev) * 0.6 + 0.35 * cos(elev)).normalized()
	sun.visible = elev > deg_to_rad(-6.0)
	if sun.visible and sun.is_inside_tree(): sun.look_at_from_position(Vector3.ZERO, -to_sun, Vector3.UP if absf(to_sun.y) < 0.99 else Vector3.FORWARD)
	var lowk := clampf(elev / deg_to_rad(12.0), 0.0, 1.0)
	sun.light_color = Color(1.0, 0.66, 0.40).lerp(Color(1.0, 0.95, 0.88), lowk)
	sun.light_energy = clampf((elev + deg_to_rad(4.0)) / deg_to_rad(10.0), 0.0, 1.0) * lerpf(0.9, 2.0, lowk)
	var mdir := Vector3(0.40, 0.55, 0.75).normalized()   # behind the camera, high: the bay is lit from the front and the sea's glint stays out of the frame
	if moon.is_inside_tree(): moon.look_at_from_position(Vector3.ZERO, -mdir, Vector3.UP)
	moon.light_energy = 1.0 * smoothstep(0.35, 0.85, n); moon.visible = moon.light_energy > 0.01
	sky_mat.set_shader_parameter("moon_dir", mdir)
	env.ambient_light_color = Color(0.20, 0.27, 0.42).lerp(Color(0.34, 0.40, 0.55), d * (1.0 - n)).lerp(Color(0.20, 0.28, 0.46), n * 0.8)
	env.ambient_light_energy = lerpf(0.9, 1.5, n)
	env.fog_light_color = hor.lerp(Color(0.46, 0.55, 0.72), 0.7 * d * (1.0 - n)).lerp(Color(0.05, 0.08, 0.15), n * 0.6)
	env.fog_light_energy = lerpf(1.0, 0.5, n)
	env.tonemap_exposure = lerpf(1.0, 1.5, n)
	for wm in _water_mats: wm.set_shader_parameter("night", n)

# --------------------------------------------------------------------------------------------------------------------
# Model in: WorldView hands over its own tiles, heights and objects after it rebuilt them
# --------------------------------------------------------------------------------------------------------------------
func set_model(m: Dictionary, tiles: Array, zgrid: Dictionary, objs: Array) -> void:
	_setup()   # a scene built in a test is filled before its first frame
	model = m
	tm = float(m.get("tile_m", 10.0))
	_W = int(m.map.x); _H = int(m.map.y)
	var kinds := PackedStringArray()
	for t in tiles: kinds.append(str(t.kind))
	var tkey := "%s|%d|%d|%d" % [m.level, _W, _H, hash("".join(kinds))]
	if tkey != _terrain_key or field == null:
		_terrain_key = tkey
		_h.resize(_W * _H)
		for t in tiles: _h[int(t.j) * _W + int(t.i)] = float(zgrid.get(Vector2i(int(t.i), int(t.j)), 0.0)) / PXM
		_smooth_heights(2)
		_build_terrain(tiles)
		_build_props(objs)
		field = self
		_build_lighthouse(tiles)
		reset_camera()
	var pkey := JSON.stringify([m.level, m.towns.map(func(t): return [t.id, t.pos, t.count]), m.units.map(func(u): return [u.id, u.pos]), m.subs.map(func(s): return [s.id, s.pos, s.get("energised", true)])])
	if pkey != _places_key: _places_key = pkey; _build_places(objs)
	var ckey := JSON.stringify(m.lines.map(func(l): return [l.id, l.pts, l.get("mm2")]))
	if ckey != _cables_key: _cables_key = ckey; _build_cables()
	_update_lights()
	if absf(float(m.minute) - _minute) > 0.4: _update_sky(float(m.minute))
	if OS.has_environment("CB_BAYPICK") and view != null and not _pick_done:
		_pick_done = true
		get_tree().create_timer(3.0).timeout.connect(qa_pick)

var _pick_done := false

## QA (CB_BAYPICK=1): every tile centre on screen goes world -> screen (WorldView.world_to_screen) -> ground under the pointer (WorldView.map_metres_at,
## the call the tray and the route survey use) and must land on the same tile. Prints one BAYPICK line.
func qa_pick() -> void:
	var n := 0; var ok := 0; var worst := 0.0
	var vr := Rect2(Vector2.ZERO, view.size).grow(-40.0)
	for j in _H:
		for i in _W:
			var sp: Vector2 = view.world_to_screen(Vector2(i, j))
			if not vr.has_point(sp): continue
			n += 1
			var m: Vector2 = view.map_metres_at(sp)
			if is_nan(m.x): continue
			if Vector2i(int(floorf(m.x / tm)), int(floorf(m.y / tm))) == Vector2i(i, j): ok += 1
			worst = maxf(worst, m.distance_to((Vector2(i, j) + Vector2(0.5, 0.5)) * tm))
	print("BAYPICK level=%s tiles_on_screen=%d same_tile=%d worst_offset_m=%.2f tile_m=%.0f" % [str(model.get("level", "-")), n, ok, worst, tm])

func set_title(on: bool) -> void:
	title = on; drift = on and not CbSettings.reduced_motion   # reduced motion: the bay holds still
	if field != null: reset_camera()

func _clear(n: Node) -> void:
	for c in n.get_children():
		n.remove_child(c); c.queue_free()

func _noise(a: int, b: int, s: int) -> float: return WorldMath.hash2(a, b, s)

## Things grow with the tile size, so a 25 m tile (L03) does not leave a school too small to see; one rule, no level named.
func _bs() -> float: return clampf(tm / 10.0, 1.0, 2.5)

# --------------------------------------------------------------------------------------------------------------------
# Land and sea
# --------------------------------------------------------------------------------------------------------------------
## Ground height (m): bilinear between tile centres, clamped at the map's rim (which is sea).
func ground(x: float, z: float) -> float:
	if _W < 2: return 0.0
	var fx := clampf(x / tm - 0.5, 0.0, float(_W) - 1.001); var fz := clampf(z / tm - 0.5, 0.0, float(_H) - 1.001)
	var i := int(fx); var j := int(fz); var u := fx - float(i); var v := fz - float(j)
	var a := lerpf(_h[j * _W + i], _h[j * _W + i + 1], u); var b := lerpf(_h[(j + 1) * _W + i], _h[(j + 1) * _W + i + 1], u)
	var out := Vector2(maxf(maxf(-x, x - float(_W) * tm), 0.0), maxf(maxf(-z, z - float(_H) * tm), 0.0)).length()   # past the map's rim the sea bed drops away: deep water, no edge
	return lerpf(a, b, v) - minf(out * 0.12, 30.0)

static func _kind_colour(kind: String) -> Color:
	match kind:
		"sand": return Color(0.66, 0.58, 0.42)
		"mangrove": return Color(0.17, 0.25, 0.13)
		"water": return Color(0.30, 0.30, 0.24)
		_: return Color(0.26, 0.40, 0.17)

## The 2D island steps between tile kinds (sand +1 m, sea -6.7 m); blurred here so a shore is a slope, not a wall. The hut, the cable and the picking use the blurred ground.
func _smooth_heights(passes: int) -> void:
	var land := _h.duplicate()   # the unblurred heights: a tile that was land (>= 0) keeps at least half a metre
	for k in land.size(): land[k] = land[k] if land[k] >= 0.0 else 0.0
	for _p in passes:
		var src := _h.duplicate()
		for j in _H:
			for i in _W:
				var sum := 0.0; var n := 0
				for dj: int in [-1, 0, 1]:
					for di: int in [-1, 0, 1]:
						var ii := i + di; var jj := j + dj
						if ii < 0 or jj < 0 or ii >= _W or jj >= _H: continue
						sum += src[jj * _W + ii]; n += 1
				_h[j * _W + i] = sum / float(n)
		for k in _h.size():   # land stays land: a blurred rim must not sink the homes into the sea
			if land[k] > 0.0: _h[k] = maxf(_h[k], minf(land[k], 0.5))

func _build_terrain(tiles: Array) -> void:
	_clear(_root_static)
	_water_mats.clear()
	var kind_of := {}
	for t in tiles: kind_of[Vector2i(int(t.i), int(t.j))] = str(t.kind)
	var cell := tm / 4.0
	var mg := 14   # tiles of sea bed round the map
	var nx := (_W + 2 * mg) * 4; var nz := (_H + 2 * mg) * 4
	var verts := PackedVector3Array(); var norms := PackedVector3Array(); var cols := PackedColorArray(); var idx := PackedInt32Array()
	verts.resize((nx + 1) * (nz + 1)); norms.resize(verts.size()); cols.resize(verts.size())
	for jz in nz + 1:
		for ix in nx + 1:
			var x := float(ix) * cell - float(mg) * tm; var z := float(jz) * cell - float(mg) * tm
			var y := ground(x, z)
			var k := jz * (nx + 1) + ix
			verts[k] = Vector3(x, y, z)
			var e := cell * 0.5
			norms[k] = Vector3(ground(x - e, z) - ground(x + e, z), 2.0 * e, ground(x, z - e) - ground(x, z + e)).normalized()
			# colour: bilinear between the tile centres' kinds, a little noise, darker under water
			var fx := clampf(x / tm - 0.5, 0.0, float(_W) - 1.001); var fz := clampf(z / tm - 0.5, 0.0, float(_H) - 1.001)
			var i0 := int(fx); var j0 := int(fz); var u := fx - float(i0); var v := fz - float(j0)
			var c00 := _kind_colour(kind_of.get(Vector2i(i0, j0), "water")); var c10 := _kind_colour(kind_of.get(Vector2i(i0 + 1, j0), "water"))
			var c01 := _kind_colour(kind_of.get(Vector2i(i0, j0 + 1), "water")); var c11 := _kind_colour(kind_of.get(Vector2i(i0 + 1, j0 + 1), "water"))
			var c := c00.lerp(c10, u).lerp(c01.lerp(c11, u), v)
			c = c * (0.9 + 0.2 * _noise(ix, jz, 3))
			if y < 0.0: c = c.lerp(Color(0.22, 0.28, 0.27), clampf(-y / 3.0, 0.0, 0.8))
			cols[k] = Color(c.r, c.g, c.b, 1.0)
	for jz in nz:
		for ix in nx:
			var a := jz * (nx + 1) + ix; var b := a + 1; var c := a + nx + 1; var d := c + 1
			idx.append_array([a, b, c, b, d, c])   # clockwise seen from above (front faces in Godot)
	var arr := []; arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = verts; arr[Mesh.ARRAY_NORMAL] = norms; arr[Mesh.ARRAY_COLOR] = cols; arr[Mesh.ARRAY_INDEX] = idx
	var mesh := ArrayMesh.new(); mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	_terrain_mat = StandardMaterial3D.new(); _terrain_mat.vertex_color_use_as_albedo = true; _terrain_mat.roughness = 0.95
	var gn := NoiseTexture2D.new(); gn.seamless = true; gn.width = 256; gn.height = 256
	var fn := FastNoiseLite.new(); fn.frequency = 0.045; fn.fractal_octaves = 4; gn.noise = fn
	var cr := Gradient.new(); cr.colors = PackedColorArray([Color(0.62, 0.62, 0.62), Color(1.12, 1.12, 1.12)]); gn.color_ramp = cr
	_terrain_mat.albedo_texture = gn; _terrain_mat.uv1_triplanar = true; _terrain_mat.uv1_scale = Vector3(0.05, 0.05, 0.05)
	var mi := MeshInstance3D.new(); mi.name = "Land"; mi.mesh = mesh; mi.material_override = _terrain_mat; _root_static.add_child(mi)
	# the sea
	var sea := MeshInstance3D.new(); sea.name = "Sea"
	var pm := PlaneMesh.new(); pm.size = Vector2(24000, 24000); pm.subdivide_width = 0; pm.subdivide_depth = 0
	sea.mesh = pm; sea.position = Vector3(float(_W) * tm * 0.5, 0.0, float(_H) * tm * 0.5)
	sea.material_override = _water_mat(); sea.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	_root_static.add_child(sea)

func _water_mat() -> ShaderMaterial:
	var wm := ShaderMaterial.new(); wm.shader = load("res://world3d/shaders/water.gdshader")
	for k in ["wave_a", "wave_b"]:
		var nt := NoiseTexture2D.new(); nt.seamless = true; nt.as_normal_map = true; nt.bump_strength = 6.0; nt.width = 256; nt.height = 256
		var fn := FastNoiseLite.new(); fn.frequency = 0.02 if k == "wave_a" else 0.035; fn.fractal_octaves = 3; fn.seed = 7 if k == "wave_a" else 11
		nt.noise = fn; wm.set_shader_parameter(k, nt)
	wm.set_shader_parameter("scale", 0.35)   # a bay: small ripples
	_water_mats.append(wm)
	return wm

# --------------------------------------------------------------------------------------------------------------------
# Trees: palms on the sand, broadleaf inland, mangrove in the marsh (positions are WorldView's `_objs`)
# --------------------------------------------------------------------------------------------------------------------
static func palm_mesh() -> ArrayMesh:
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	st.set_uv(Vector2.ZERO)   # the trunk and the fronds share one surface: every vertex needs a UV
	Props3D._cyl(st, Vector3.ZERO, Vector3(0.03, 0.82, 0.0), 0.035, 0.022, 5, Color(0.45, 0.34, 0.22))
	st.set_color(Color(0.20, 0.36, 0.14))
	var base := Vector3(0.03, 0.82, 0.0)
	for k in 8:
		var a := TAU * float(k) / 8.0
		var d := Vector3(cos(a), 0.0, sin(a)); var side := Vector3(-d.z, 0.0, d.x) * 0.05
		var mid := base + d * 0.2 + Vector3(0.0, 0.07, 0.0); var tip := base + d * 0.4 + Vector3(0.0, -0.13, 0.0)
		Props3D._tri(st, base, mid + side, tip); Props3D._tri(st, base, tip, mid - side)
	return Props3D._commit(st)

func _mm(mesh: Mesh, xf: Array, cols: Array, nm: String, two_sided := false) -> void:
	if xf.is_empty(): return
	var mm := MultiMesh.new(); mm.transform_format = MultiMesh.TRANSFORM_3D; mm.use_colors = true; mm.mesh = mesh; mm.instance_count = xf.size()
	for i in xf.size(): mm.set_instance_transform(i, xf[i]); mm.set_instance_color(i, cols[i])
	var m := StandardMaterial3D.new(); m.vertex_color_use_as_albedo = true; m.roughness = 0.9
	if two_sided: m.cull_mode = BaseMaterial3D.CULL_DISABLED
	var mi := MultiMeshInstance3D.new(); mi.name = nm; mi.multimesh = mm; mi.material_override = m; _root_static.add_child(mi)

func _build_props(objs: Array) -> void:
	var tx := []; var tc := []; var mx := []; var mc := []; var px := []; var pc := []
	for o in objs:
		var t := str(o.t)
		if not (t == "tree" or t == "mangrove" or t == "palm"): continue
		var p: Vector2 = o.p; var v := float(o.get("v", 0.5))
		var x := p.x * tm; var z := p.y * tm; var y := ground(x, z) - 0.15
		var rot := Basis(Vector3.UP, v * TAU)
		var g := 1.0 + (_bs() - 1.0) * 0.6
		if t == "palm":
			var s := (6.5 + 3.0 * v) * g
			px.append(Transform3D(rot.scaled(Vector3(s, s, s)), Vector3(x, y, z))); pc.append(Color(0.9 + 0.1 * v, 0.9, 0.9))
		elif t == "mangrove":
			var s := (2.4 + 1.6 * v) * g
			mx.append(Transform3D(rot.scaled(Vector3(s, s * 0.9, s)), Vector3(x, y, z))); mc.append(Color(0.55 + 0.2 * v, 0.7, 0.5))
		else:
			var s := (5.0 + 3.0 * v) * g
			tx.append(Transform3D(rot.scaled(Vector3(s, s, s)), Vector3(x, y, z))); tc.append(Color(0.8 + 0.3 * v, 0.9 + 0.1 * v, 0.7))
	_mm(Props3D.broadleaf(), tx, tc, "Trees"); _mm(Props3D.broadleaf(), mx, mc, "Mangrove")
	_mm(palm_mesh(), px, pc, "Palms", true)

## A headland: sand next to the sea, as far as possible from the hamlets (the same rule as WorldView's cute lighthouse, which is not drawn in 3D).
func _build_lighthouse(tiles: Array) -> void:
	var kind_of := {}
	for t in tiles: kind_of[Vector2i(int(t.i), int(t.j))] = str(t.kind)
	var towns: Array = []
	for tw in model.towns: towns.append((tw.pos as Vector2) + Vector2(0.5, 0.5))
	var best := Vector2i(-1, -1); var bs := -1e9
	for t in tiles:
		if str(t.kind) != "sand": continue
		var i := int(t.i); var j := int(t.j)
		if kind_of.get(Vector2i(i - 1, j), "water") != "water" and kind_of.get(Vector2i(i, j - 1), "water") != "water": continue
		var sc := 99.0
		for q in towns: sc = minf(sc, Vector2(i + 0.5, j + 0.5).distance_to(q))
		if sc > bs: bs = sc; best = Vector2i(i, j)
	_lh = {}; _lh_pos = Vector2(-1e9, 0.0)
	if best.x < 0: return
	var n := Node3D.new(); n.name = "Lighthouse"
	var x := (float(best.x) + 0.5) * tm; var z := (float(best.y) + 0.5) * tm
	_lh_pos = Vector2(x, z)
	n.position = Vector3(x, maxf(ground(x, z), 0.0) - 0.3, z); _root_static.add_child(n)
	var mi := MeshInstance3D.new(); mi.mesh = Props3D.lighthouse()
	var mat := StandardMaterial3D.new(); mat.vertex_color_use_as_albedo = true; mat.roughness = 0.7; mi.material_override = mat; n.add_child(mi)
	var lamp := MeshInstance3D.new(); var sm := SphereMesh.new(); sm.radius = 0.9; sm.height = 1.8; sm.radial_segments = 12; sm.rings = 6; lamp.mesh = sm
	var lm := StandardMaterial3D.new(); lm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; lm.albedo_color = Color(1.0, 0.92, 0.7)
	lamp.material_override = lm; lamp.position = Vector3(0, 16.4, 0); lamp.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; n.add_child(lamp)
	var o := OmniLight3D.new(); o.omni_range = 70.0; o.light_color = Color(1.0, 0.9, 0.7); o.position = Vector3(0, 16.4, 0); n.add_child(o)
	var halo := MeshInstance3D.new(); var hm := SphereMesh.new(); hm.radius = 7.0; hm.height = 14.0; hm.radial_segments = 12; hm.rings = 6; halo.mesh = hm
	var hmat := ShaderMaterial.new(); hmat.shader = load("res://world3d/shaders/glow.gdshader"); hmat.set_shader_parameter("tint", Color(1.0, 0.85, 0.55, 0.05)); hmat.set_shader_parameter("power", 1.0)
	halo.material_override = hmat; halo.position = Vector3(0, 16.4, 0); halo.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; n.add_child(halo)
	_lh = {"light": o, "lamp": lm, "halo": hmat}

# --------------------------------------------------------------------------------------------------------------------
# Places: homes, the school, the hut with its porch bulb, junction boxes and converters
# --------------------------------------------------------------------------------------------------------------------
static func house_mesh(w: float, d: float, h: float, rh: float, wall: Color, roof: Color) -> ArrayMesh:
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	Props3D._box(st, Vector3(0, h * 0.5, 0), Vector3(w, h, d), wall)
	var ov := 0.4; var x := w * 0.5 + ov; var zz := d * 0.5 + ov
	st.set_color(roof)
	var a := Vector3(-x, h, -zz); var b := Vector3(x, h, -zz); var c := Vector3(x, h, zz); var dd := Vector3(-x, h, zz)
	var t0 := Vector3(-x, h + rh, 0); var t1 := Vector3(x, h + rh, 0)
	Props3D._tri(st, a, t1, b); Props3D._tri(st, a, t0, t1); Props3D._tri(st, dd, c, t1); Props3D._tri(st, dd, t1, t0)
	st.set_color(wall)
	Props3D._tri(st, Vector3(-w * 0.5, h, -d * 0.5), Vector3(-w * 0.5, h, d * 0.5), Vector3(-w * 0.5, h + rh * 0.9, 0))
	Props3D._tri(st, Vector3(w * 0.5, h, d * 0.5), Vector3(w * 0.5, h, -d * 0.5), Vector3(w * 0.5, h + rh * 0.9, 0))
	return Props3D._commit(st)

static func _quad(st: SurfaceTool, c: Vector3, ex: Vector3, ey: Vector3, n: Vector3) -> void:
	st.set_normal(n)
	for p in [c - ex - ey, c + ex - ey, c + ex + ey, c - ex - ey, c + ex + ey, c - ex + ey]: st.add_vertex(p)

static func windows_mesh(w: float, d: float, h: float) -> ArrayMesh:
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var zf := d * 0.5 + 0.03
	for sx in [-0.5, 0.5]: _quad(st, Vector3(sx * w * 0.5, h * 0.58, zf), Vector3(0.7, 0, 0), Vector3(0, 0.7, 0), Vector3.BACK)
	_quad(st, Vector3(w * 0.5 + 0.03, h * 0.58, 0.0), Vector3(0, 0, -0.7), Vector3(0, 0.7, 0), Vector3.RIGHT)
	return Props3D._commit(st)

## A soft disc of light on the ground (additive): the lamp's pool, readable from the whole bay. Its strength is set in _update_lights.
func _pool(parent: Node3D, pos: Vector3, radius: float) -> ShaderMaterial:
	var pm := PlaneMesh.new(); pm.size = Vector2(radius * 2.0, radius * 2.0)
	var mi := MeshInstance3D.new(); mi.mesh = pm; mi.position = pos; mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var gm := ShaderMaterial.new(); gm.shader = load("res://world3d/shaders/glow.gdshader"); gm.set_shader_parameter("radial", radius); gm.set_shader_parameter("power", 0.0)
	mi.material_override = gm; parent.add_child(mi)
	return gm

func _flat_mat(c: Color, rough := 0.85) -> StandardMaterial3D:
	var m := StandardMaterial3D.new(); m.albedo_color = c; m.roughness = rough; return m

func _build_places(objs: Array) -> void:
	_clear(_root_places)
	_homes.clear(); _porch = {}
	var wall_cols := [Color(0.86, 0.80, 0.68), Color(0.78, 0.84, 0.82), Color(0.90, 0.74, 0.60), Color(0.82, 0.82, 0.76)]
	var roof_cols := [Color(0.50, 0.22, 0.16), Color(0.36, 0.38, 0.42), Color(0.46, 0.28, 0.18)]
	var body_mat := StandardMaterial3D.new(); body_mat.vertex_color_use_as_albedo = true; body_mat.roughness = 0.9; body_mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	for o in objs:
		var t := str(o.t)
		var p: Vector2 = o.p
		var x := p.x * tm; var z := p.y * tm
		var y := maxf(ground(x, z), 0.0)
		if t == "bld":
			var v := float(o.get("v", 0.5)); var role := str(o.get("role", ""))
			var w := 5.6 + 1.2 * v; var d := 4.6 + 0.8 * v; var h := 3.0 + 0.5 * v; var rh := 1.9
			var wall: Color = wall_cols[int(v * 97.0) % wall_cols.size()]; var roof: Color = roof_cols[int(v * 53.0) % roof_cols.size()]
			if role == "school": w = 18.0; d = 9.0; h = 6.2; rh = 2.6; wall = Color(0.62, 0.28, 0.20); roof = Color(0.30, 0.31, 0.35)
			elif role == "health": w = 10.0; d = 7.0; h = 3.6; rh = 1.6; wall = Color(0.92, 0.92, 0.90); roof = Color(0.55, 0.57, 0.60)
			var n := Node3D.new(); n.name = "Home_%s_%d" % [str(model.towns[int(o.ti)].id), int(o.k)]
			n.position = Vector3(x, y - 0.1, z); n.rotation.y = (v - 0.5) * 0.35; n.scale = Vector3.ONE * _bs(); _root_places.add_child(n)
			var bi := MeshInstance3D.new(); bi.mesh = house_mesh(w, d, h, rh, wall, roof); bi.material_override = body_mat; n.add_child(bi)
			var wi := MeshInstance3D.new(); wi.mesh = windows_mesh(w, d, h)
			var wm := StandardMaterial3D.new(); wm.albedo_color = Color(0.04, 0.05, 0.08); wm.emission_enabled = true; wm.emission = WARM; wm.emission_energy_multiplier = 0.0
			wi.material_override = wm; wi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; n.add_child(wi)
			var lt := OmniLight3D.new(); lt.omni_range = (11.0 if role == "" else 18.0); lt.omni_attenuation = 1.4; lt.light_specular = 0.2; lt.position = Vector3(0, h * 0.6, d * 0.5 + 1.6); n.add_child(lt)
			if role == "health":   # a red cross on the front
				var cm := _flat_mat(Color(0.8, 0.1, 0.1)); var cb := MeshInstance3D.new(); var bm := BoxMesh.new(); bm.size = Vector3(0.5, 2.0, 0.1); cb.mesh = bm; cb.material_override = cm; cb.position = Vector3(0, h * 0.62, d * 0.5 + 0.06); n.add_child(cb)
				var cb2 := MeshInstance3D.new(); var bm2 := BoxMesh.new(); bm2.size = Vector3(2.0, 0.5, 0.1); cb2.mesh = bm2; cb2.material_override = cm; cb2.position = cb.position; n.add_child(cb2)
			var pool := _pool(n, Vector3(0, 0.35, d * 0.5 + 2.0), 9.0 if role == "" else 14.0)
			_homes.append({"ti": int(o.ti), "k": int(o.k), "light": lt, "mat": wm, "pool": pool})
		elif t == "unit" and str(o.u.kind) == "hut": _build_hut(Vector3(x, y, z), bool(o.u.online))
		elif t == "sub": _build_sub(Vector3(x, y, z))
		elif t == "flag":
			var pole := MeshInstance3D.new(); var cm := CylinderMesh.new(); cm.top_radius = 0.07; cm.bottom_radius = 0.09; cm.height = 9.0; pole.mesh = cm; pole.material_override = _flat_mat(Color(0.8, 0.8, 0.82), 0.4)
			pole.position = Vector3(x, y + 4.5, z); _root_places.add_child(pole)

func _build_hut(pos: Vector3, _online: bool) -> void:
	var n := Node3D.new(); n.name = "Hut"; n.position = pos - Vector3(0, 0.1, 0); n.scale = Vector3.ONE * _bs(); _root_places.add_child(n)
	var body := MeshInstance3D.new(); var bm := BoxMesh.new(); bm.size = Vector3(4.2, 2.6, 3.0); body.mesh = bm; body.material_override = _flat_mat(Color(0.40, 0.50, 0.46), 0.6); body.position = Vector3(0, 1.3, 0); n.add_child(body)
	var roof := MeshInstance3D.new(); var rm := BoxMesh.new(); rm.size = Vector3(4.6, 0.2, 3.4); roof.mesh = rm; roof.material_override = _flat_mat(Color(0.22, 0.24, 0.26), 0.5); roof.position = Vector3(0, 2.7, 0); n.add_child(roof)
	var panel := MeshInstance3D.new(); var pm := BoxMesh.new(); pm.size = Vector3(3.4, 0.08, 1.8); panel.mesh = pm; panel.material_override = _flat_mat(Color(0.08, 0.12, 0.28), 0.2)
	panel.position = Vector3(0, 3.15, 0.2); panel.rotation.x = deg_to_rad(-22.0); n.add_child(panel)
	var door := MeshInstance3D.new(); var dm := BoxMesh.new(); dm.size = Vector3(1.0, 1.9, 0.08); door.mesh = dm; door.material_override = _flat_mat(Color(0.28, 0.20, 0.14)); door.position = Vector3(-0.8, 0.95, 1.52); n.add_child(door)
	var post := MeshInstance3D.new(); var cm := CylinderMesh.new(); cm.top_radius = 0.05; cm.bottom_radius = 0.05; cm.height = 2.7; post.mesh = cm; post.material_override = _flat_mat(Color(0.3, 0.3, 0.32)); post.position = Vector3(0.9, 1.35, 1.9); n.add_child(post)
	var bulb := MeshInstance3D.new(); var sm := SphereMesh.new(); sm.radius = 0.22; sm.height = 0.44; sm.radial_segments = 10; sm.rings = 5; bulb.mesh = sm
	var bm2 := StandardMaterial3D.new(); bm2.albedo_color = Color(0.1, 0.1, 0.1); bm2.emission_enabled = true; bm2.emission = WHITE; bm2.emission_energy_multiplier = 0.0
	bulb.material_override = bm2; bulb.position = Vector3(0.9, 2.75, 1.9); bulb.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; n.add_child(bulb)
	var lt := OmniLight3D.new(); lt.omni_range = 16.0; lt.omni_attenuation = 1.3; lt.light_color = WHITE; lt.position = Vector3(0.9, 2.6, 2.3); n.add_child(lt)
	_porch = {"light": lt, "mat": bm2, "pool": _pool(n, Vector3(0.9, 0.35, 3.0), 8.0)}

func _build_sub(pos: Vector3) -> void:
	var b := MeshInstance3D.new(); var bm := BoxMesh.new(); bm.size = Vector3(2.4, 1.8, 1.8) * _bs(); b.mesh = bm; b.material_override = _flat_mat(Color(0.55, 0.58, 0.60), 0.5); b.position = pos + Vector3(0, 0.9 * _bs(), 0); _root_places.add_child(b)

# --------------------------------------------------------------------------------------------------------------------
# Cables: a dark sheath along the ground and a glow overlay in the engine's loading colour, pulses running while the line carries power
# --------------------------------------------------------------------------------------------------------------------
func _build_cables() -> void:
	_clear(_root_cables)
	for l in model.lines:
		if str(l.kind) != "cable": continue
		var pts: Array = l.pts
		if pts.size() < 2: continue
		var mm2 := float(l.get("mm2", 10.0)) if l.get("mm2") != null else 10.0
		var r := (0.08 + 0.024 * sqrt(mm2)) * _bs()
		var path: Array[Vector3] = []
		for k in range(pts.size() - 1):
			var a: Vector2 = ((pts[k] as Vector2) + Vector2(0.5, 0.5)) * tm; var b: Vector2 = ((pts[k + 1] as Vector2) + Vector2(0.5, 0.5)) * tm
			var n := maxi(1, int(a.distance_to(b) / 2.0))
			for q in n + (1 if k == pts.size() - 2 else 0):
				var p := a.lerp(b, float(q) / float(n)); path.append(Vector3(p.x, maxf(ground(p.x, p.y), 0.0) + r + 0.05, p.y))
		var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES); var s2 := SurfaceTool.new(); s2.begin(Mesh.PRIMITIVE_TRIANGLES)
		var run := 0.0
		for k in range(path.size() - 1):
			Props3D.add_wire(st, path[k], path[k + 1], 0.0, r, run, 1); Props3D.add_wire(s2, path[k], path[k + 1], 0.0, r * 1.3, run, 1); run += path[k].distance_to(path[k + 1])
		var core := MeshInstance3D.new(); core.name = "Cable_" + str(l.id); core.mesh = st.commit(); core.material_override = _flat_mat(Color(0.10, 0.09, 0.08), 0.6); _root_cables.add_child(core)
		var gl := MeshInstance3D.new(); gl.name = "Glow_" + str(l.id); gl.mesh = s2.commit()
		var gm := ShaderMaterial.new(); gm.shader = load("res://world3d/shaders/glow.gdshader")
		gm.set_shader_parameter("tint", Color(l.color, 0.5)); gm.set_shader_parameter("power", 1.1); gm.set_shader_parameter("pulse", 0.9 if int(l.dir) != 0 else 0.0); gm.set_shader_parameter("inflate", 0.0011)
		gl.material_override = gm; gl.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; _root_cables.add_child(gl)

# --------------------------------------------------------------------------------------------------------------------
# Lights: the engine's voltages
# --------------------------------------------------------------------------------------------------------------------
## (V / V0)^2 for a home: WorldModel's `energies` are exactly that from the bench's vLoadV and sourceV (and zero when the hamlet is dead).
static func home_brightness(m: Dictionary, ti: int, k: int) -> float:
	var t: Dictionary = m.towns[ti]
	var en: PackedFloat32Array = t.energies
	return clampf(float(en[k]) if k < en.size() else 0.0, 0.0, 1.5)

## Warm at the level's limit or more, amber below. A level with no voltage limit on the home (L03's school is judged on losses) is warm whenever it is lit.
static func home_warm(m: Dictionary, ti: int) -> bool:
	var t: Dictionary = m.towns[ti]
	var lim := float(t.get("limit", 0.0))
	return float(t.get("volts", 0.0)) >= lim if lim > 0.0 else true

## The porch bulb hangs on the hut, which sits on the source: (V0 / V0)^2 = 1 while the hut runs, 0 otherwise.
static func porch_brightness(m: Dictionary) -> float:
	for u in m.units:
		if str(u.kind) == "hut": return 1.0 if bool(u.online) else 0.0
	return 0.0

func _update_lights() -> void:
	for h in _homes:
		var b := home_brightness(model, int(h.ti), int(h.k))
		var col := WARM if home_warm(model, int(h.ti)) else AMBER
		var lt: OmniLight3D = h.light; var mat: StandardMaterial3D = h.mat
		lt.light_energy = b * HOME_LIGHT_E; lt.light_color = col; lt.visible = b > 0.003
		mat.emission = col; mat.emission_energy_multiplier = b * 5.0
		var pm: ShaderMaterial = h.pool; pm.set_shader_parameter("tint", Color(col, 1.0)); pm.set_shader_parameter("power", b * 0.9)
	if not _porch.is_empty():
		var b := porch_brightness(model)
		var lt: OmniLight3D = _porch.light; var mat: StandardMaterial3D = _porch.mat
		lt.light_energy = b * PORCH_LIGHT_E; lt.light_color = WHITE; lt.visible = b > 0.003
		mat.emission = WHITE; mat.emission_energy_multiplier = b * 4.0
		var pm: ShaderMaterial = _porch.pool; pm.set_shader_parameter("tint", Color(WHITE, 1.0)); pm.set_shader_parameter("power", b * 0.9)
	if not _lh.is_empty():
		var nn := WorldMath.night(float(model.get("minute", 1080.0)))
		var k := clampf(0.25 + 1.2 * nn, 0.0, 1.4)
		(_lh.light as OmniLight3D).light_energy = 3.0 * k; (_lh.halo as ShaderMaterial).set_shader_parameter("power", 1.0 * k)
		(_lh.lamp as StandardMaterial3D).albedo_color = Color(1.0, 0.92, 0.7) * (0.6 + 1.6 * k)

## What the scene's own lights say (tests/bay_lights_truth.gd): per home its brightness, the Light3D's energy and colour; the porch bulb.
func lamp_report() -> Dictionary:
	var homes: Array = []
	for h in _homes:
		var lt: OmniLight3D = h.light
		homes.append({"town": model.towns[int(h.ti)].id, "k": int(h.k), "b": home_brightness(model, int(h.ti), int(h.k)), "light": lt.light_energy, "warm": lt.light_color.g > 0.7})
	var rep := {"homes": homes}
	if not _porch.is_empty():
		var lt: OmniLight3D = _porch.light
		rep["porch"] = {"b": lt.light_energy / PORCH_LIGHT_E, "light": lt.light_energy, "amber": lt.light_color.g < 0.7}
	return rep

# --------------------------------------------------------------------------------------------------------------------
# Camera: orbit / pan / zoom for WorldView (same interface as Province3D)
# --------------------------------------------------------------------------------------------------------------------
func _map_m() -> Vector2: return Vector2(float(_W), float(_H)) * tm

func reset_camera() -> void:
	var mm := _map_m()
	_dist_default = maxf(mm.x * 0.82, mm.y * 1.5)
	_g_target = Vector3(mm.x * 0.5, 0.0, mm.y * 0.44); _g_yaw = deg_to_rad(8.0); _g_pitch = deg_to_rad(36.0); _g_dist = _dist_default
	if title:   # from the east along the island: the hamlet in the foreground, the lighthouse at the far end, the last of the sun behind it; the menu sits over the quiet left
		var hamlet := Vector2(mm.x * 0.8, mm.y * 0.3)
		for tw in model.get("towns", []): hamlet = ((tw.pos as Vector2) + Vector2(0.5, 0.5)) * tm; break
		_g_target = Vector3(hamlet.x - 0.14 * mm.x, 0.0, hamlet.y + 0.055 * mm.x); _g_yaw = deg_to_rad(88.0); _g_pitch = deg_to_rad(12.0); _g_dist = 0.39 * mm.x
	_g_target.y = maxf(ground(_g_target.x, _g_target.z), 0.0)
	target = _g_target; yaw = _g_yaw; pitch = _g_pitch; dist = _g_dist
	_apply_camera()

func _clamp_goal() -> void:
	var mm := _map_m()
	_g_target.x = clampf(_g_target.x, -0.1 * mm.x, 1.1 * mm.x); _g_target.z = clampf(_g_target.z, -0.1 * mm.y, 1.1 * mm.y)
	_g_target.y = maxf(ground(_g_target.x, _g_target.z), 0.0)
	_g_pitch = clampf(_g_pitch, PITCH_MIN, PITCH_MAX)
	_g_dist = clampf(_g_dist, 25.0, _dist_default * 1.8)

func _apply_camera() -> void:
	var y := yaw + (deg_to_rad(4.0) * sin(_t * 0.05) if drift else 0.0)
	var p := pitch + (deg_to_rad(1.5) * sin(_t * 0.037) if drift else 0.0)
	var tg := target
	if drift: tg += Vector3(cos(y), 0, -sin(y)) * 14.0 * sin(_t * 0.031)
	var pos := tg + Vector3(sin(y) * cos(p), sin(p), cos(y) * cos(p)) * dist
	pos.y = maxf(pos.y, maxf(ground(pos.x, pos.z), 0.0) + 4.0)
	if not cam.is_inside_tree(): return
	cam.look_at_from_position(pos, tg, Vector3.UP)
	cam.current = true

func pan_px(rel: Vector2) -> void:
	var s := dist * 0.0012
	var right := Vector3(cos(yaw), 0, -sin(yaw)); var fwd := Vector3(-sin(yaw), 0, -cos(yaw))
	_g_target += (-right * rel.x + fwd * rel.y) * s / maxf(0.35, sin(pitch) * 0.6 + 0.4)
	_clamp_goal()

func orbit_px(rel: Vector2) -> void:
	_g_yaw -= rel.x * 0.006; _g_pitch += rel.y * 0.004; _clamp_goal()

func zoom_at(sp: Vector2, f: float) -> void:
	var g := ground_point(sp)
	var nd := clampf(_g_dist / f, 25.0, _dist_default * 1.8)
	if not is_nan(g.x): _g_target = _g_target.lerp(g, (1.0 - nd / _g_dist) * 0.9)
	_g_dist = nd; _clamp_goal()

func center_on_tile(p: Vector2, z := 1.0) -> void:
	_g_target = Vector3((p.x + 0.5) * tm, 0.0, (p.y + 0.5) * tm); _g_dist = clampf(_dist_default / z, 25.0, _dist_default * 1.8); _clamp_goal()

## CB_CAM camera words for screenshots: yaw=deg, pitch=deg, dist=m, tx / ty (tiles), zoom (1 = the opening framing). They apply at once.
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
			"zoom": _g_dist = _dist_default / maxf(0.1, float(kv[1])); used = true
			"nodrift": drift = false; used = true
	_clamp_goal()
	target = _g_target; yaw = _g_yaw; pitch = _g_pitch; dist = _g_dist; _apply_camera()
	return used

func _process(dt: float) -> void:
	if not visible or field == null: return
	_t += dt
	var k := 1.0 - exp(-dt * 9.0)
	target = target.lerp(_g_target, k); yaw = lerp_angle(yaw, _g_yaw, k); pitch = lerpf(pitch, _g_pitch, k); dist = lerpf(dist, _g_dist, k)
	_apply_camera()
	_ft_frames += 1; _ft_ms += dt * 1000.0
	if OS.has_environment("CB_FRAMETIME"):   # render time of the viewport as the RenderingServer measures it, independent of vsync
		var vp := get_viewport().get_viewport_rid()
		if not _measuring: RenderingServer.viewport_set_measure_render_time(vp, true); _measuring = true
		_ft_gpu += RenderingServer.viewport_get_measured_render_time_gpu(vp); _ft_cpu += RenderingServer.viewport_get_measured_render_time_cpu(vp) + RenderingServer.get_frame_setup_time_cpu(); _ft_n += 1
		if _t - _ft_at > 2.0 and _t > 6.0:
			print("BAYTIME res=%dx%d gpu_ms=%.2f cpu_render_ms=%.2f frame_ms=%.2f adapter=%s quality=%s level=%s" % [get_viewport().size.x, get_viewport().size.y, _ft_gpu / _ft_n, _ft_cpu / _ft_n, _ft_ms / _ft_frames, RenderingServer.get_video_adapter_name(), quality, str(model.get("level", "-"))])
			_ft_at = _t; _ft_gpu = 0.0; _ft_cpu = 0.0; _ft_n = 0; _ft_ms = 0.0; _ft_frames = 0

# --------------------------------------------------------------------------------------------------------------------
# Projection for the 2D overlay: screen <-> world (screen = the canvas coordinates of the full-rect WorldView)
# --------------------------------------------------------------------------------------------------------------------
func _canvas_scale() -> float:
	if canvas_size.x < 1.0: return 1.0
	return get_viewport().get_visible_rect().size.x / canvas_size.x

func project(p: Vector3) -> Vector2:
	if cam.is_position_behind(p): return Vector2(-99999, -99999)
	return cam.unproject_position(p) / _canvas_scale()

## The ground (or the sea surface) under a screen point, in metres; NAN when the ray misses.
func ground_point(sp: Vector2) -> Vector3:
	var vp := sp * _canvas_scale()
	var o := cam.project_ray_origin(vp); var d := cam.project_ray_normal(vp)
	var t := 0.0; var step := maxf(1.0, dist * 0.01)
	for _i in 800:
		var p := o + d * t
		if p.y <= maxf(ground(p.x, p.z), 0.0):
			var lo := t - step; var hi := t
			for _k in 12:
				var mid := (lo + hi) * 0.5; var q := o + d * mid
				if q.y <= maxf(ground(q.x, q.z), 0.0): hi = mid
				else: lo = mid
			return o + d * hi
		t += step; step *= 1.01
		if t > 30000.0: break
	return Vector3(NAN, NAN, NAN)

func px_per_tile() -> float:
	var a := project(target); var b := project(target + Vector3(tm, 0, 0))
	return maxf(1.0, a.distance_to(b))
