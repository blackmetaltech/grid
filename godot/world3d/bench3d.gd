class_name Bench3D
extends Node3D
## Chapter 2's two bench jobs in 3D: L04 "Spin the Alternator" (a valley with a waterfall, a penstock and a cut-away powerhouse whose alternator is the
## subject, a village down the river) and L06 "Exam Bridge: The Town Line" (the powerhouse, a step-up pad, a two-wire wood-pole line across fields,
## a step-down pad and the town). Display only: every number comes from the engine query `ch2Bench` (src/level/ch2/bench.ts), which WorldView's
## set_model hands over each refresh; the only arithmetic here maps those numbers to light (bulb brightness (V / V0)^2, the wire's glow by the
## share of power it loses).
##
## L04: the rotor has exactly the engine's pole count, N red and S blue, turning at the shaft speed / SLOWMO; the stator's coil bundles grow with
## the turns, the air gap glows with the field, the pole faces grow with the coil area. The village's bulbs follow the rms voltage, amber below the
## band, and flicker when the frequency is far below its target (drawn at a quarter of the real 2f rate, so the eye can follow it).
## L06: conductors glow dull red to orange by the loss share; the town's windows follow the voltage the town sees; the transformer pads follow the
## kVA chip and vanish at ratio 1. The 15 km line is drawn a few hundred metres long; Ch2Bench says so in a chip.
##
## Same camera interface as Bay3D / Province3D (project, ground, ground_point, pan / orbit / zoom, camera spec), so WorldView's input drives it.

const LEVELS := ["L04", "L06"]
const SLOWMO := 25.0              # the rotor is drawn this many times slower than the shaft (Ch2Bench.SLOWMO)
const HOME_LIGHT_E := 4.0
const WARM := Color(1.0, 0.84, 0.54)
const AMBER := Color(1.0, 0.42, 0.06)
const PITCH_MIN := deg_to_rad(6.0)
const PITCH_MAX := deg_to_rad(78.0)
const DIST_MIN := 12.0
const DIST_MAX := 700.0
const FAR_M := 12000.0            # the land runs this far past the play area on every side (the fog takes it long before)
const LIP_X := -45.0              # L04: the waterfall's rock lip (metres)
const LIP_H := 26.0               # L04: its height above the lower valley
const TOWN_V_OK := 0.97           # L06: the 2D bench's "town is happy" share; below it the windows burn amber

var quality := "high"
var tm := 10.0                    # WorldView maps tiles to metres with it (the bench has no tiles of its own)
var field = null                  # non-null once built: WorldView's `_l3()` asks for it
var own_lines := true             # no screen-space line overlay from WorldView
var cam: Camera3D
var env: Environment
var sky_mat: ShaderMaterial
var sun: DirectionalLight3D
var moon: DirectionalLight3D
var canvas_size := Vector2.ZERO
var view = null                   # the WorldView that drives this scene
var drift := false
var title := false
var target := Vector3.ZERO
var yaw := 0.0
var pitch := deg_to_rad(22.0)
var dist := 80.0
var kind := ""                    # "" | "machine" (L04) | "town" (L06)
var q: Dictionary = {}            # the engine's ch2Bench, as last handed over
var anchors: Dictionary = {}      # place name -> Vector3: where Ch2Bench hangs its glass chips

var _g_target := Vector3.ZERO
var _g_yaw := 0.0
var _g_pitch := deg_to_rad(22.0)
var _g_dist := 80.0
var _dist_default := 80.0
var _root: Node3D
var _nz: FastNoiseLite
var _nz_r: FastNoiseLite
var _play := Rect2()              # everything the job shows, metres (x, z)
var _ground := Rect2()            # what the land mesh covers
var _water_mats: Array[ShaderMaterial] = []
var _fall_mat: ShaderMaterial
var _alt: Node3D                  # the alternator (stator, coils, rotor)
var _rotor: Node3D
var _coils: Node3D
var _gap_mat: ShaderMaterial
var _shoe_mats: Array[StandardMaterial3D] = []
var _rotor_key := ""
var _coil_key := ""
var _homes: Array = []            # [{light, mat, pool, ph}]
var _wire_mat: StandardMaterial3D
var _wire_glow: ShaderMaterial
var _xf_nodes: Array = []         # the two transformer pads (L06)
var _junctions: Array = []        # plain poles that stand in for them at ratio 1
var _xf_kva := -1
var _ph := Vector3.ZERO           # the powerhouse's floor centre
var _t := 0.0
var _minute := -1.0
var _brightness := 0.0            # the homes' (V / V0)^2 now
var _amber := false
var _flicker := 0.0               # 0..0.85: how deep the bulbs flicker
var _flicker_hz := 0.0

func _ready() -> void: _setup()

func _setup() -> void:
	if _root != null: return
	quality = Province3D.pick_quality()
	_root = Node3D.new(); _root.name = "Bench"; add_child(_root)
	cam = Camera3D.new(); cam.name = "Camera"; cam.near = 0.2; cam.far = 30000.0; cam.fov = 42.0; add_child(cam)
	_nz = FastNoiseLite.new(); _nz.seed = 4041; _nz.frequency = 1.0 / 90.0; _nz.fractal_octaves = 4
	_nz_r = FastNoiseLite.new(); _nz_r.seed = 4042; _nz_r.frequency = 1.0 / 900.0; _nz_r.fractal_octaves = 4; _nz_r.fractal_type = FastNoiseLite.FRACTAL_RIDGED
	_make_env()

# --------------------------------------------------------------------------------------------------------------------
# Environment: Bay3D's sky, sun, moon and haze, tuned for a valley
# --------------------------------------------------------------------------------------------------------------------
func _make_env() -> void:
	env = Environment.new()
	env.background_mode = Environment.BG_SKY
	var sky := Sky.new(); sky_mat = ShaderMaterial.new(); sky_mat.shader = load("res://world3d/shaders/sky.gdshader")
	var nt := NoiseTexture2D.new(); nt.seamless = true; nt.width = 256; nt.height = 256
	var fn := FastNoiseLite.new(); fn.frequency = 0.012; fn.fractal_octaves = 4; nt.noise = fn
	sky_mat.set_shader_parameter("noise", nt)
	sky.sky_material = sky_mat; sky.radiance_size = Sky.RADIANCE_SIZE_64; sky.process_mode = Sky.PROCESS_MODE_INCREMENTAL
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.reflected_light_source = Environment.REFLECTION_SOURCE_DISABLED
	env.tonemap_mode = Environment.TONE_MAPPER_AGX
	env.glow_enabled = quality != "low"
	env.glow_intensity = 0.8; env.glow_bloom = 0.05; env.glow_hdr_threshold = 1.0
	env.glow_blend_mode = Environment.GLOW_BLEND_MODE_SOFTLIGHT
	env.fog_enabled = true; env.fog_mode = Environment.FOG_MODE_DEPTH
	env.fog_depth_begin = 300.0; env.fog_depth_end = 7000.0; env.fog_depth_curve = 1.5
	env.fog_sky_affect = 0.3; env.fog_density = 1.0
	env.adjustment_enabled = true; env.adjustment_contrast = 1.06; env.adjustment_saturation = 1.06
	if quality != "low": env.ssao_enabled = true; env.ssao_radius = 1.2; env.ssao_intensity = 1.4
	sun = DirectionalLight3D.new(); sun.name = "Sun"; sun.shadow_enabled = quality != "low"
	sun.directional_shadow_max_distance = 700.0; sun.light_angular_distance = 0.5; add_child(sun)
	moon = DirectionalLight3D.new(); moon.name = "Moon"; moon.shadow_enabled = false; moon.light_color = Color(0.62, 0.72, 1.0); add_child(moon)
	cam.environment = env
	var vp := get_viewport()
	if vp == null: return   # built in a test before it joins the tree
	if quality == "high": vp.msaa_3d = Viewport.MSAA_4X
	elif quality == "medium": vp.msaa_3d = Viewport.MSAA_2X
	else:
		vp.scaling_3d_scale = 0.6
		vp.scaling_3d_mode = Viewport.SCALING_3D_MODE_FSR; vp.fsr_sharpness = 0.35

func _update_sky(mn: float) -> void:
	_minute = mn
	var n := WorldMath.night(mn); var d := WorldMath.dusk(mn)
	var zen := Color(0.20, 0.40, 0.74).lerp(Color(0.035, 0.06, 0.15), n).lerp(Color(0.09, 0.17, 0.42), d * 0.7)
	var hor := Color(0.70, 0.80, 0.90).lerp(Color(0.10, 0.14, 0.26), n).lerp(Color(0.95, 0.72, 0.52), d * 0.55)
	sky_mat.set_shader_parameter("zenith", zen); sky_mat.set_shader_parameter("horizon", hor); sky_mat.set_shader_parameter("ground", hor * 0.35)
	sky_mat.set_shader_parameter("night", n); sky_mat.set_shader_parameter("dusk", d)
	sky_mat.set_shader_parameter("sun_glow", Color(1.0, 0.62, 0.32).lerp(Color(1.0, 0.9, 0.75), 1.0 - d))
	sky_mat.set_shader_parameter("cloud_lit", Color(1.0, 0.93, 0.85).lerp(Color(1.0, 0.55, 0.35), d).lerp(Color(0.10, 0.12, 0.2), n))
	sky_mat.set_shader_parameter("cloud_dark", Color(0.55, 0.58, 0.66).lerp(Color(0.35, 0.25, 0.35), d).lerp(Color(0.03, 0.04, 0.07), n))
	var a := (mn - 360.0) / 720.0 * PI
	var elev := sin(a) * deg_to_rad(50.0) + deg_to_rad(6.0)
	var to_sun := Vector3(cos(a) * cos(elev), sin(elev), sin(a) * cos(elev) * 0.6 - 0.35 * cos(elev)).normalized()   # the evening sun sets behind the valley's west end
	sun.visible = elev > deg_to_rad(-6.0)
	if sun.visible and sun.is_inside_tree(): sun.look_at_from_position(Vector3.ZERO, -to_sun, Vector3.UP if absf(to_sun.y) < 0.99 else Vector3.FORWARD)
	var lowk := clampf(elev / deg_to_rad(12.0), 0.0, 1.0)
	sun.light_color = Color(1.0, 0.66, 0.40).lerp(Color(1.0, 0.95, 0.88), lowk)
	sun.light_energy = clampf((elev + deg_to_rad(4.0)) / deg_to_rad(10.0), 0.0, 1.0) * lerpf(0.9, 2.0, lowk)
	var mdir := Vector3(0.35, 0.6, 0.72).normalized()   # behind the opening camera, high: the faces the player looks at are moonlit
	if moon.is_inside_tree(): moon.look_at_from_position(Vector3.ZERO, -mdir, Vector3.UP)
	moon.light_energy = 0.85 * smoothstep(0.35, 0.85, n)
	sky_mat.set_shader_parameter("moon_dir", mdir)
	env.ambient_light_color = Color(0.20, 0.27, 0.42).lerp(Color(0.34, 0.40, 0.55), d * (1.0 - n)).lerp(Color(0.20, 0.28, 0.46), n * 0.8)
	env.ambient_light_energy = lerpf(0.9, 0.75, n)
	env.fog_light_color = hor.lerp(Color(0.46, 0.55, 0.72), 0.7 * d * (1.0 - n)).lerp(Color(0.08, 0.12, 0.22), n * 0.6)
	env.fog_light_energy = lerpf(1.0, 0.5, n)
	env.tonemap_exposure = lerpf(1.0, 1.5, n)
	for wm in _water_mats:
		wm.set_shader_parameter("night", n); wm.set_shader_parameter("use_sky_col", true); wm.set_shader_parameter("sky_col", hor.lerp(zen, 0.25))
	if _fall_mat != null: _fall_mat.set_shader_parameter("night", n)

# --------------------------------------------------------------------------------------------------------------------
# Numbers in
# --------------------------------------------------------------------------------------------------------------------
## WorldView's call each refresh: the bench reads the engine's ch2Bench itself (one cheap query) and the clock from the model.
func set_model(m: Dictionary) -> void:
	_setup()
	var r = null
	if view != null and view.get("app") != null and view.app.get("b") != null: r = view.app.b.q("ch2Bench")
	set_bench(r if r is Dictionary else {}, float(m.get("minute", 1080.0)))

## The engine's ch2Bench and the minute of the day. A query that is not active keeps the last scene.
func set_bench(bq: Dictionary, minute: float) -> void:
	_setup()
	if bq.get("active", false):
		var k := str(bq.kind)
		q = bq
		if k != kind or field == null:
			kind = k; _build()
		_apply()
	if absf(minute - _minute) > 0.4: _update_sky(minute)

func set_title(on: bool) -> void: title = on

func _clear(n: Node) -> void:
	for c in n.get_children():
		n.remove_child(c); c.queue_free()

func _build() -> void:
	_clear(_root)
	_water_mats.clear(); _homes.clear(); _xf_nodes.clear(); _junctions.clear(); _shoe_mats.clear(); anchors.clear()
	_alt = null; _rotor = null; _coils = null; _gap_mat = null; _fall_mat = null; _wire_mat = null; _wire_glow = null
	_rotor_key = ""; _coil_key = ""; _xf_kva = -1
	if kind == "machine":
		_play = Rect2(-110.0, -90.0, 240.0, 180.0)
		_ph = Vector3(-6.0, 1.0, _rz(-6.0) + 40.0)
	else:
		_play = Rect2(-260.0, -90.0, 560.0, 180.0)
		_ph = Vector3(-212.0, 1.0, -16.0)
	_build_terrain()
	if kind == "machine": _build_l04()
	else: _build_l06()
	field = self
	if _minute >= 0.0: _update_sky(_minute)
	reset_camera()

# --------------------------------------------------------------------------------------------------------------------
# Land: an analytic height per job, sampled on a grid that is fine over the play area and grows to FAR_M past it
# --------------------------------------------------------------------------------------------------------------------
## The ground height (m) at (x, z): what is drawn, what things stand on, what the camera keeps above.
func ground(x: float, z: float) -> float:
	if kind == "machine": return _h04(x, z)
	if kind == "town": return _h06(x, z)
	return 0.0

## The river's centre line (z) in L04.
func _rz(x: float) -> float: return 5.0 * sin(x / 60.0) + 2.0 * sin(x / 23.0 + 1.0)

func _lip(z: float) -> float: return LIP_X + 3.0 * _nz.get_noise_2d(7.0, z * 3.0)

## Hills to the horizon: nothing past the play area is flat or missing.
func _far(x: float, z: float) -> float:
	var c := _play.get_center()
	var r := Vector2(x - c.x, z - c.y).length()
	return smoothstep(450.0, 2600.0, r) * (120.0 + 280.0 * (_nz_r.get_noise_2d(x, z) * 0.5 + 0.5))

## 1 inside the rect, 0 beyond `fall` metres outside it.
static func _pad(x: float, z: float, r: Rect2, fall: float) -> float:
	var dx := maxf(maxf(r.position.x - x, x - r.end.x), 0.0); var dz := maxf(maxf(r.position.y - z, z - r.end.y), 0.0)
	return 1.0 - smoothstep(0.0, fall, Vector2(dx, dz).length())

func _ph_rect() -> Rect2: return Rect2(_ph.x - 10.0, _ph.z - 8.0, 20.0, 16.0)
func _village_rect() -> Rect2: return Rect2(22.0, _rz(58.0) + 12.0, 76.0, 26.0)

func _h04(x: float, z: float) -> float:
	var d := z - _rz(x); var w := absf(d)
	var lip := _lip(z)
	var step := LIP_H * (1.0 - smoothstep(lip - 2.5, lip + 2.5, x))
	var side := (44.0 * smoothstep(22.0, 190.0, w)) if d < 0.0 else (42.0 * smoothstep(90.0, 300.0, w))
	var bumps := (_nz.get_noise_2d(x, z) * 0.5 + 0.5) * (1.5 + 0.12 * w) * smoothstep(10.0, 40.0, w)
	var bank := 0.8 * smoothstep(6.0, 15.0, w)
	var ch := -3.0 * (1.0 - smoothstep(5.0, 10.0, w))
	var px := x - (LIP_X + 9.0); var pool := -3.5 * exp(-(px * px + d * d) / 140.0)
	var h := step + side + bumps + bank + ch + pool + _far(x, z)
	h = lerpf(h, 1.0, _pad(x, z, _ph_rect(), 9.0))
	h = lerpf(h, 1.3, _pad(x, z, _village_rect(), 14.0) * 0.85)
	return h

func _rx6(z: float) -> float: return -248.0 + 6.0 * sin(z / 50.0)   # L06: the stream past the powerhouse

func _town_rect() -> Rect2: return Rect2(178.0, -46.0, 104.0, 92.0)

func _h06(x: float, z: float) -> float:
	var w := absf(x - _rx6(z))
	var h := 0.8 + 2.6 * (_nz.get_noise_2d(x * 0.6, z * 0.6) * 0.5 + 0.5)
	h += 46.0 * smoothstep(-275.0, -470.0, x) * (0.6 + 0.4 * (_nz.get_noise_2d(x, z) * 0.5 + 0.5))   # the hills behind the powerhouse
	h += 20.0 * smoothstep(110.0, 320.0, -z) * (_nz.get_noise_2d(z, x) * 0.5 + 0.5)   # a low ridge to the north
	h += -3.2 * (1.0 - smoothstep(4.0, 9.0, w))
	h += _far(x, z)
	h = lerpf(h, 1.0, _pad(x, z, _ph_rect(), 10.0))
	h = lerpf(h, 1.0, _pad(x, z, _town_rect(), 18.0))
	for p in [Vector2(-182.0, 0.0), Vector2(160.0, 0.0)]: h = lerpf(h, 1.0, _pad(x, z, Rect2(p - Vector2(7, 7), Vector2(14, 14)), 6.0))
	return h

## Coordinates along one axis: `cell` apart over [lo, hi], then each cell `grow` times the last out to `far` beyond.
static func _axis(lo: float, hi: float, cell: float, far: float, grow: float) -> PackedFloat32Array:
	var left: Array = []; var c := cell; var x := lo
	while x > lo - far: c *= grow; x -= c; left.push_front(x)
	var out := PackedFloat32Array(left)
	var n := maxi(1, int(ceil((hi - lo) / cell)))
	for i in n + 1: out.append(lo + (hi - lo) * float(i) / float(n))
	c = cell; x = hi
	while x < hi + far: c *= grow; x += c; out.append(x)
	return out

## What the land mesh covers (metres, x / z): the truth test checks it reaches well past the play area.
func ground_rect() -> Rect2: return _ground
func play_rect() -> Rect2: return _play

## Splat weights at a point: COLOR (grass, forest floor, rock, sand), UV2 (mud, paved), as terrain.gdshader reads them.
func _splat(x: float, z: float, h: float) -> Array:
	var c := Color(1, 0, 0, 0); var mud := 0.0; var paved := 0.0
	var wood := smoothstep(0.05, 0.35, _nz.get_noise_2d(x * 0.5 + 300.0, z * 0.5))
	if kind == "machine":
		var d := z - _rz(x); var w := absf(d)
		var f := maxf(wood, smoothstep(20.0, 60.0, -d))   # the north wall is forest
		c = Color(1.0 - f, f, 0.0, 0.0)
		var gravel := 1.0 - smoothstep(7.0, 12.0, w)   # gravel bars at the water
		c = c.lerp(Color(0, 0, 0, 1), gravel)
		mud = (1.0 - smoothstep(6.0, 16.0, Vector2(x - LIP_X - 9.0, d).length())) * 0.8
		paved = maxf(_pad(x, z, _ph_rect(), 3.0), _pad(x, z, _village_rect().grow(-6.0), 4.0) * 0.55)
	else:
		var w := absf(x - _rx6(z))
		var f := wood * (1.0 - _pad(x, z, Rect2(-200, -14, 380, 28), 20.0)) * 0.8 + smoothstep(-280.0, -360.0, x)
		c = Color(1.0 - clampf(f, 0.0, 1.0), clampf(f, 0.0, 1.0), 0.0, 0.0)
		c = c.lerp(Color(0, 0, 0, 1), 1.0 - smoothstep(6.0, 10.0, w))
		paved = maxf(_pad(x, z, _ph_rect(), 3.0), _pad(x, z, _town_rect().grow(-10.0), 6.0) * 0.6)
		for p in [Vector2(-182.0, 0.0), Vector2(160.0, 0.0)]: paved = maxf(paved, _pad(x, z, Rect2(p - Vector2(6, 6), Vector2(12, 12)), 1.5))
	return [c, mud, paved]

func _build_terrain() -> void:
	var cell := 2.5 if quality != "low" else 5.0
	var xs := _axis(_play.position.x - 40.0, _play.end.x + 40.0, cell, FAR_M, 1.06)
	var zs := _axis(_play.position.y - 40.0, _play.end.y + 40.0, cell, FAR_M, 1.06)
	_ground = Rect2(xs[0], zs[0], xs[xs.size() - 1] - xs[0], zs[zs.size() - 1] - zs[0])
	var nx := xs.size(); var nz := zs.size()
	var hs := PackedFloat32Array(); hs.resize(nx * nz)
	for j in nz:
		for i in nx: hs[j * nx + i] = ground(xs[i], zs[j])
	var verts := PackedVector3Array(); var norms := PackedVector3Array(); var cols := PackedColorArray(); var uv2 := PackedVector2Array(); var idx := PackedInt32Array()
	verts.resize(nx * nz); norms.resize(nx * nz); cols.resize(nx * nz); uv2.resize(nx * nz)
	for j in nz:
		for i in nx:
			var k := j * nx + i
			var x := xs[i]; var z := zs[j]; var y := hs[k]
			verts[k] = Vector3(x, y, z)
			var i0 := maxi(i - 1, 0); var i1 := mini(i + 1, nx - 1); var j0 := maxi(j - 1, 0); var j1 := mini(j + 1, nz - 1)
			var dhx := (hs[j * nx + i1] - hs[j * nx + i0]) / (xs[i1] - xs[i0]); var dhz := (hs[j1 * nx + i] - hs[j0 * nx + i]) / (zs[j1] - zs[j0])
			norms[k] = Vector3(-dhx, 1.0, -dhz).normalized()
			var sp := _splat(x, z, y)
			cols[k] = sp[0]; uv2[k] = Vector2(sp[1], sp[2])
	for j in nz - 1:
		for i in nx - 1:
			var a := j * nx + i; var b := a + 1; var c := a + nx; var d := c + 1
			idx.append_array([a, b, c, b, d, c])
	var arr := []; arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = verts; arr[Mesh.ARRAY_NORMAL] = norms; arr[Mesh.ARRAY_COLOR] = cols; arr[Mesh.ARRAY_TEX_UV2] = uv2; arr[Mesh.ARRAY_INDEX] = idx
	var mesh := ArrayMesh.new(); mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	var tmat := ShaderMaterial.new(); tmat.shader = load("res://world3d/shaders/terrain.gdshader")
	for n in ["grass", "forest", "rock", "sand"]:
		tmat.set_shader_parameter(n + "_a", _tex(n + "_albedo")); tmat.set_shader_parameter(n + "_n", _tex(n + "_normal"))
	tmat.set_shader_parameter("mud_a", _tex("mud_albedo")); tmat.set_shader_parameter("field_a", _tex("field_albedo"))
	var mn := NoiseTexture2D.new(); mn.seamless = true; mn.width = 512; mn.height = 512
	var fn := FastNoiseLite.new(); fn.frequency = 0.008; fn.fractal_octaves = 4; mn.noise = fn
	tmat.set_shader_parameter("macro_noise", mn)
	tmat.set_shader_parameter("tile_m", 8.0)
	tmat.set_shader_parameter("fields", 1.0 if kind == "town" else 0.0)
	tmat.set_shader_parameter("wet_top", 0.4)
	tmat.set_shader_parameter("cloud_scale", 0.2)
	tmat.set_shader_parameter("grass_tint", Vector3(0.86, 0.95, 0.70))
	tmat.set_shader_parameter("sand_tint", Vector3(0.95, 0.93, 0.90))
	if quality == "low": tmat.set_shader_parameter("cheap", true)
	var mi := MeshInstance3D.new(); mi.name = "Land"; mi.mesh = mesh; mi.material_override = tmat; _root.add_child(mi)

func _tex(n: String) -> Texture2D:
	var p := "res://world3d/tex/%s.jpg" % n
	return load(p) if ResourceLoader.exists(p) else null

func _water(y: float, rect: Rect2, flow: Vector2) -> void:
	var wm := ShaderMaterial.new(); wm.shader = load("res://world3d/shaders/water.gdshader")
	for k in ["wave_a", "wave_b"]:
		var nt := NoiseTexture2D.new(); nt.seamless = true; nt.as_normal_map = true; nt.bump_strength = 6.0; nt.width = 256; nt.height = 256
		var fn := FastNoiseLite.new(); fn.frequency = 0.02 if k == "wave_a" else 0.035; fn.fractal_octaves = 3; fn.seed = 7 if k == "wave_a" else 11
		nt.noise = fn; wm.set_shader_parameter(k, nt)
	wm.set_shader_parameter("scale", 0.12)
	wm.set_shader_parameter("flow_x", flow.x); wm.set_shader_parameter("flow_z", flow.y)
	wm.set_shader_parameter("shallow", Color(0.20, 0.34, 0.30)); wm.set_shader_parameter("deep", Color(0.04, 0.09, 0.10))
	wm.set_shader_parameter("ssr_steps", 28 if quality == "high" else (16 if quality == "medium" else 0))
	_water_mats.append(wm)
	var pm := PlaneMesh.new(); pm.size = rect.size
	var mi := MeshInstance3D.new(); mi.name = "Water"; mi.mesh = pm; mi.material_override = wm; mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mi.position = Vector3(rect.get_center().x, y, rect.get_center().y); _root.add_child(mi)

# --------------------------------------------------------------------------------------------------------------------
# Shared pieces: materials, the powerhouse, the alternator, homes, poles, trees
# --------------------------------------------------------------------------------------------------------------------
func _mat(c: Color, rough := 0.85, metal := 0.0) -> StandardMaterial3D:
	var m := StandardMaterial3D.new(); m.albedo_color = c; m.roughness = rough; m.metallic = metal; return m

func _vc_mat(rough := 0.85) -> StandardMaterial3D:
	var m := StandardMaterial3D.new(); m.vertex_color_use_as_albedo = true; m.roughness = rough; m.cull_mode = BaseMaterial3D.CULL_DISABLED; return m

func _stone_mat() -> StandardMaterial3D:
	var m := StandardMaterial3D.new(); m.albedo_texture = _tex("rock_albedo"); m.normal_enabled = true; m.normal_texture = _tex("rock_normal")
	m.uv1_triplanar = true; m.uv1_scale = Vector3(0.22, 0.22, 0.22); m.albedo_color = Color(1.1, 1.04, 0.95); m.roughness = 0.92
	return m

func _box(parent: Node3D, c: Vector3, s: Vector3, m: Material, nm := "") -> MeshInstance3D:
	var bm := BoxMesh.new(); bm.size = s
	var mi := MeshInstance3D.new(); mi.mesh = bm; mi.material_override = m; mi.position = c
	if nm != "": mi.name = nm
	parent.add_child(mi); return mi

func _glow_mat(tint: Color, power: float) -> ShaderMaterial:
	var g := ShaderMaterial.new(); g.shader = load("res://world3d/shaders/glow.gdshader")
	g.set_shader_parameter("tint", tint); g.set_shader_parameter("power", power); return g

## A stone powerhouse, 20 x 14 m, 8 m to the eaves, cut away: the wall that faces the opening camera (+z) is left out and the roof covers only the
## back half, so the machine hall reads from outside. A work lamp lights the hall; it is not on the bench's circuit.
func _build_powerhouse(at: Vector3) -> Node3D:
	var n := Node3D.new(); n.name = "Powerhouse"; n.position = at; _root.add_child(n)
	var stone := _stone_mat(); var conc := _mat(Color(0.40, 0.40, 0.39), 0.9); var steel := _mat(Color(0.30, 0.33, 0.36), 0.5, 0.6)
	_box(n, Vector3(0, -0.6, 0), Vector3(20.4, 1.6, 14.4), conc, "Floor")
	_box(n, Vector3(0, 4.0, -6.7), Vector3(20.4, 8.0, 0.8), stone, "BackWall")
	_box(n, Vector3(-9.8, 4.0, 0), Vector3(0.8, 8.0, 14.2), stone, "WestWall")
	_box(n, Vector3(9.8, 4.0, -3.0), Vector3(0.8, 8.0, 8.2), stone, "EastWall")   # cut back at the front corner
	_box(n, Vector3(9.8, 1.0, 3.8), Vector3(0.8, 2.0, 6.4), stone)
	_box(n, Vector3(-9.8, 4.0, 6.8), Vector3(0.9, 8.0, 0.9), stone)   # what is left of the front: the corner pier
	_box(n, Vector3(-6.4, 0.55, 6.8), Vector3(6.0, 1.1, 0.7), stone)   # and a low sill clear of the machine
	_box(n, Vector3(0, 8.35, -2.4), Vector3(21.0, 0.5, 9.6), _mat(Color(0.26, 0.28, 0.30), 0.6, 0.3), "Roof")
	for z in [0.0, 2.6, 5.2]: _box(n, Vector3(0, 8.0, z + 2.6), Vector3(20.0, 0.35, 0.25), steel)   # the open half's roof beams
	for z in [-5.0, 5.4]: _box(n, Vector3(0, 6.9, z), Vector3(19.0, 0.4, 0.4), steel)            # crane rails
	_box(n, Vector3(-3.0, 6.6, 0.2), Vector3(0.5, 0.5, 10.6), _mat(Color(0.85, 0.62, 0.12), 0.5, 0.3), "Crane")
	_box(n, Vector3(9.8, 1.4, -5.0), Vector3(0.9, 2.6, 1.6), _mat(Color(0.26, 0.18, 0.12), 0.8), "Door")
	var lamp := OmniLight3D.new(); lamp.name = "WorkLamp"; lamp.position = Vector3(1.0, 7.2, 1.5); lamp.omni_range = 24.0; lamp.light_energy = 3.2; lamp.light_color = Color(1.0, 0.86, 0.66); lamp.shadow_enabled = quality == "high"; n.add_child(lamp)
	for x in [-5.0, 5.0]:
		var bulb := MeshInstance3D.new(); var sm := SphereMesh.new(); sm.radius = 0.25; sm.height = 0.5; bulb.mesh = sm
		var bmat := _mat(Color(0.1, 0.1, 0.1)); bmat.emission_enabled = true; bmat.emission = Color(1.0, 0.86, 0.66); bmat.emission_energy_multiplier = 4.0
		bulb.material_override = bmat; bulb.position = Vector3(x, 7.4, 0.5); bulb.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; n.add_child(bulb)
	return n

## A ring between radii r0 < r1, from z0 to z1 (axis along z), outer and inner faces and both ends.
static func _ring(st: SurfaceTool, r0: float, r1: float, z0: float, z1: float, seg: int, col: Color) -> void:
	st.set_color(col); st.set_uv(Vector2.ZERO)   # one vertex format with Props3D's boxes in the same mesh
	for s in seg:
		var a0 := TAU * s / seg; var a1 := TAU * (s + 1) / seg
		var c0 := Vector3(cos(a0), sin(a0), 0); var c1 := Vector3(cos(a1), sin(a1), 0)
		for face in [[r1, 1.0], [r0, -1.0]]:
			var r: float = face[0]; var sg: float = face[1]
			var p := [c0 * r + Vector3(0, 0, z0), c1 * r + Vector3(0, 0, z0), c1 * r + Vector3(0, 0, z1), c0 * r + Vector3(0, 0, z1)]
			var ns := [c0 * sg, c1 * sg, c1 * sg, c0 * sg]
			for k in ([0, 1, 2, 0, 2, 3] if sg > 0.0 else [0, 2, 1, 0, 3, 2]): st.set_normal(ns[k]); st.add_vertex(p[k])
		for end in [[z1, 1.0], [z0, -1.0]]:
			var z: float = end[0]; var sg: float = end[1]
			var p := [c0 * r0 + Vector3(0, 0, z), c1 * r0 + Vector3(0, 0, z), c1 * r1 + Vector3(0, 0, z), c0 * r1 + Vector3(0, 0, z)]
			st.set_normal(Vector3(0, 0, sg))
			for k in ([0, 2, 1, 0, 3, 2] if sg > 0.0 else [0, 1, 2, 0, 2, 3]): st.add_vertex(p[k])

## The alternator at `at` (local to `parent`), shaft along z: the turbine casing behind, the stator ring, the rotor. Rotor and coils are rebuilt by _apply.
func _build_alternator(parent: Node3D, at: Vector3) -> void:
	_alt = Node3D.new(); _alt.name = "Alternator"; _alt.position = at; parent.add_child(_alt)
	var conc := _mat(Color(0.38, 0.38, 0.37), 0.9)
	_box(_alt, Vector3(0, -2.55, -1.0), Vector3(6.4, 1.3, 6.4), conc, "Plinth")
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var paint := Color(0.16, 0.30, 0.36)
	_ring(st, 2.12, 2.75, -0.9, 0.9, 64, paint)
	for k in 20:   # cooling ribs on the frame
		var a := TAU * k / 20.0
		Props3D._box(st, Vector3(cos(a), sin(a), 0) * 2.83, Vector3(0.16, 0.16, 1.7), paint.darkened(0.15))
	st.generate_normals()
	var frame := MeshInstance3D.new(); frame.name = "Stator"; frame.mesh = st.commit()
	var fm := StandardMaterial3D.new(); fm.vertex_color_use_as_albedo = true; fm.roughness = 0.45; fm.metallic = 0.25   # no reflected light in this sky: a high metallic reads black
	frame.material_override = fm; _alt.add_child(frame)
	for sx in [-1.0, 1.0]: _box(_alt, Vector3(sx * 1.9, -2.15, 0), Vector3(0.6, 1.2, 1.6), _mat(paint.darkened(0.2), 0.5, 0.5))   # feet
	var casing := MeshInstance3D.new(); casing.name = "Turbine"   # the Francis turbine's spiral casing behind, on the same shaft
	var cs := SurfaceTool.new(); cs.begin(Mesh.PRIMITIVE_TRIANGLES)
	_ring(cs, 0.25, 2.3, -3.9, -2.5, 40, Color(0.30, 0.34, 0.30))
	Props3D._cyl(cs, Vector3(0, 0, -2.5), Vector3(0, 0, -0.9), 0.32, 0.32, 16, Color(0.6, 0.62, 0.64))   # the shaft
	cs.generate_normals(); casing.mesh = cs.commit(); casing.material_override = fm; _alt.add_child(casing)
	var gm := ShaderMaterial.new(); gm.shader = load("res://world3d/shaders/glow.gdshader")
	gm.set_shader_parameter("tint", Color(0.55, 0.78, 1.0, 1.0)); gm.set_shader_parameter("power", 0.5)
	var gs := SurfaceTool.new(); gs.begin(Mesh.PRIMITIVE_TRIANGLES)
	_ring(gs, 2.02, 2.12, -0.88, 0.92, 64, Color.WHITE)
	var gap := MeshInstance3D.new(); gap.name = "AirGap"; gap.mesh = gs.commit(); gap.material_override = gm; gap.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; _alt.add_child(gap)
	_gap_mat = gm

func _frac(v: float, lo: float, hi: float, logk := false) -> float:
	if hi <= lo: return 0.0
	if logk and lo > 0.0: return clampf(log(maxf(v, lo) / lo) / log(hi / lo), 0.0, 1.0)
	return clampf((v - lo) / (hi - lo), 0.0, 1.0)

## The rotor: `p` salient poles round a hub, N red and S blue in turn; the pole faces are wider and longer for a larger coil area (af 0..1).
func _build_rotor(p: int, af: float) -> void:
	if _rotor != null: _alt.remove_child(_rotor); _rotor.queue_free()
	_shoe_mats.clear()
	_rotor = Node3D.new(); _rotor.name = "Rotor"; _alt.add_child(_rotor)
	var steel := _mat(Color(0.42, 0.45, 0.48), 0.4, 0.3)
	var hub := MeshInstance3D.new(); hub.name = "Hub"; var cm := CylinderMesh.new(); cm.top_radius = 1.0; cm.bottom_radius = 1.0; cm.height = 1.7; cm.radial_segments = 32
	hub.mesh = cm; hub.material_override = steel; hub.rotation.x = PI * 0.5; _rotor.add_child(hub)
	var cap := MeshInstance3D.new(); var cc := CylinderMesh.new(); cc.top_radius = 0.38; cc.bottom_radius = 0.38; cc.height = 0.3; cap.mesh = cc; cap.material_override = _mat(Color(0.7, 0.72, 0.74), 0.3, 0.8); cap.rotation.x = PI * 0.5; cap.position.z = 0.95; _rotor.add_child(cap)
	var slot := TAU * 1.45 / float(p)
	var w := clampf(slot * (0.40 + 0.30 * af), 0.10, 1.1)
	var depth := 1.0 + 0.6 * af
	var body := BoxMesh.new(); body.size = Vector3(w, 0.86, depth)
	var shoe := BoxMesh.new(); shoe.size = Vector3(minf(w * 1.45, slot * 0.92), 0.16, depth + 0.06)
	var mats: Array[StandardMaterial3D] = []
	for c in [Color(0.80, 0.20, 0.17), Color(0.20, 0.36, 0.82)]:
		var m := StandardMaterial3D.new(); m.albedo_color = c; m.roughness = 0.5; m.metallic = 0.2
		m.emission_enabled = true; m.emission = c; m.emission_energy_multiplier = 0.25
		mats.append(m); _shoe_mats.append(m)
	for k in p:
		var a := TAU * float(k) / float(p)
		var pole := MeshInstance3D.new(); pole.name = "Pole%d" % k; pole.mesh = body; pole.material_override = mats[k % 2]
		pole.position = Vector3(cos(a), sin(a), 0.0) * 1.42; pole.rotation.z = a - PI * 0.5
		var sh := MeshInstance3D.new(); sh.name = "Shoe"; sh.mesh = shoe; sh.material_override = mats[k % 2]; sh.position = Vector3(0, 0.51, 0); pole.add_child(sh)
		_rotor.add_child(pole)

## The stator's coil bundles on the front face: one per pole, thicker for more turns (tf 0..1 on a log scale, as the knob runs).
func _build_coils(p: int, tf: float) -> void:
	if _coils != null: _alt.remove_child(_coils); _coils.queue_free()
	_coils = Node3D.new(); _coils.name = "Coils"; _alt.add_child(_coils)
	var copper := _mat(Color(0.85, 0.46, 0.24), 0.35, 0.3)
	var tr := lerpf(0.10, 0.48, tf); var tz := lerpf(0.06, 0.42, tf)
	var span := minf(TAU * 2.3 / float(p) * 0.78, 1.6)
	var bm := BoxMesh.new(); bm.size = Vector3(span, tr, tz)
	for k in p:
		var a := TAU * (float(k) + 0.5) / float(p)
		var c := MeshInstance3D.new(); c.name = "Coil%d" % k; c.mesh = bm; c.material_override = copper
		c.position = Vector3(cos(a), sin(a), 0.0) * (2.14 + tr * 0.5) + Vector3(0, 0, 0.9 + tz * 0.5); c.rotation.z = a - PI * 0.5
		_coils.add_child(c)

static func _house_cols(v: float) -> Array:
	var walls := [Color(0.86, 0.80, 0.68), Color(0.78, 0.82, 0.80), Color(0.90, 0.74, 0.60), Color(0.82, 0.82, 0.76), Color(0.74, 0.66, 0.58)]
	var roofs := [Color(0.50, 0.22, 0.16), Color(0.36, 0.38, 0.42), Color(0.46, 0.28, 0.18)]
	return [walls[int(v * 97.0) % walls.size()], roofs[int(v * 53.0) % roofs.size()]]

## A home (Bay3D's house and windows) whose lamp _apply drives.
func _home(pos: Vector2, rot: float, v: float) -> void:
	var w := 6.0 + 1.6 * v; var d := 5.0 + 1.0 * v; var h := 3.0 + 0.6 * v
	var cols := _house_cols(v)
	var n := Node3D.new(); n.name = "Home%d" % _homes.size(); n.position = Vector3(pos.x, ground(pos.x, pos.y) - 0.1, pos.y); n.rotation.y = rot; _root.add_child(n)
	var bi := MeshInstance3D.new(); bi.mesh = Bay3D.house_mesh(w, d, h, 2.0, cols[0], cols[1]); bi.material_override = _vc_mat(0.9); n.add_child(bi)
	var wi := MeshInstance3D.new(); wi.mesh = Bay3D.windows_mesh(w, d, h)
	var wm := StandardMaterial3D.new(); wm.albedo_color = Color(0.13, 0.17, 0.25); wm.metallic = 0.3; wm.roughness = 0.2; wm.cull_mode = BaseMaterial3D.CULL_DISABLED; wm.emission_enabled = true; wm.emission = WARM; wm.emission_energy_multiplier = 0.0
	wi.material_override = wm; wi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; n.add_child(wi)
	var lt := OmniLight3D.new(); lt.omni_range = 14.0; lt.omni_attenuation = 1.3; lt.light_specular = 0.2; lt.position = Vector3(0, h * 0.6, d * 0.5 + 1.6); n.add_child(lt)
	var pm := PlaneMesh.new(); pm.size = Vector2(16, 16)
	var pool := MeshInstance3D.new(); pool.mesh = pm; pool.position = Vector3(0, 0.4, d * 0.5 + 2.0); pool.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var gm := ShaderMaterial.new(); gm.shader = load("res://world3d/shaders/glow.gdshader"); gm.set_shader_parameter("radial", 8.0); gm.set_shader_parameter("power", 0.0)
	pool.material_override = gm; n.add_child(pool)
	_homes.append({"light": lt, "mat": wm, "pool": gm, "ph": v * 11.0})

## A wood pole at (x, z) for a line running along `dir` (radians about y); returns its world attachment points (2 crossarm ends, then the top).
func _pole(x: float, z: float, dir: float, h := 10.0) -> Array:
	var sp: Array = Props3D.support("wood", h, h - 0.6)
	var mi := MeshInstance3D.new(); mi.name = "Pole"; mi.mesh = sp[0]; mi.material_override = _vc_mat(0.85)
	var y := ground(x, z) - 0.2
	mi.position = Vector3(x, y, z); mi.rotation.y = dir; _root.add_child(mi)
	var out: Array = []
	for a in sp[1]: out.append(mi.position + Basis(Vector3.UP, dir) * (a as Vector3))
	return out

## Two conductors through a row of attachment sets (each [left, top, right]) with a light sag; returns the core mesh and the glow mesh.
func _wires(atts: Array, r: float, sag: float) -> Array:
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES); var gs := SurfaceTool.new(); gs.begin(Mesh.PRIMITIVE_TRIANGLES)
	var run := 0.0
	for k in atts.size() - 1:
		for side in [0, 2]:
			var a: Vector3 = atts[k][side]; var b: Vector3 = atts[k + 1][side]
			Props3D.add_wire(st, a, b, sag, r, run, 12); Props3D.add_wire(gs, a, b, sag, r * 2.2, run, 12)
		run += (atts[k][0] as Vector3).distance_to(atts[k + 1][0])
	return [st.commit(), gs.commit()]

## Trees over the land: conifers on the steep and high ground, broadleaf below; `ok` says how dense (0..1) they may stand at a point.
func _trees(ok: Callable, half: float, step: float) -> void:
	var cx := []; var cc := []; var bx := []; var bc := []
	var c := _play.get_center()
	var gx := int(half * 2.0 / step)
	for j in gx:
		for i in gx:
			var x := c.x - half + (float(i) + WorldMath.hash2(i, j, 71)) * step; var z := c.y - half + (float(j) + WorldMath.hash2(i, j, 72)) * step
			var dens: float = ok.call(x, z)
			if dens <= 0.0 or WorldMath.hash2(i, j, 73) > dens: continue
			var y := ground(x, z)
			var sl := Vector2(ground(x + 2.0, z) - ground(x - 2.0, z), ground(x, z + 2.0) - ground(x, z - 2.0)).length() / 4.0
			if sl > 0.9: continue
			var v := WorldMath.hash2(i, j, 74)
			var rot := Basis(Vector3.UP, v * TAU)
			if y > 12.0 or sl > 0.35 or WorldMath.hash2(i, j, 75) < 0.35:
				var s := 9.0 + 9.0 * v
				cx.append(Transform3D(rot.scaled(Vector3(s * 0.8, s, s * 0.8)), Vector3(x, y - 0.3, z))); cc.append(Color(0.75 + 0.3 * v, 0.85 + 0.15 * v, 0.75))
			else:
				var s := 5.5 + 4.0 * v
				bx.append(Transform3D(rot.scaled(Vector3(s, s, s)), Vector3(x, y - 0.2, z))); bc.append(Color(0.8 + 0.3 * v, 0.9 + 0.1 * v, 0.7))
	_mm(Props3D.conifer(), cx, cc, "Conifers"); _mm(Props3D.broadleaf(), bx, bc, "Trees")

func _mm(mesh: Mesh, xf: Array, cols: Array, nm: String) -> void:
	if xf.is_empty(): return
	var mm := MultiMesh.new(); mm.transform_format = MultiMesh.TRANSFORM_3D; mm.use_colors = true; mm.mesh = mesh; mm.instance_count = xf.size()
	for i in xf.size(): mm.set_instance_transform(i, xf[i]); mm.set_instance_color(i, cols[i])
	var m := StandardMaterial3D.new(); m.vertex_color_use_as_albedo = true; m.roughness = 0.9
	var mi := MultiMeshInstance3D.new(); mi.name = nm; mi.multimesh = mm; mi.material_override = m; _root.add_child(mi)

static func _seg_d(p: Vector2, a: Vector2, b: Vector2) -> float:
	var ab := b - a; var l2 := ab.length_squared()
	if l2 < 1e-6: return p.distance_to(a)
	return p.distance_to(a + ab * clampf((p - a).dot(ab) / l2, 0.0, 1.0))

# --------------------------------------------------------------------------------------------------------------------
# L04: the valley, the waterfall, the penstock, the powerhouse and its alternator, the village
# --------------------------------------------------------------------------------------------------------------------
var _pen_a := Vector2.ZERO
var _pen_b := Vector2.ZERO

func _build_l04() -> void:
	var zr := _rz(LIP_X); var lip := _lip(zr)
	_water(-1.2, Rect2(lip + 1.0, -FAR_M, FAR_M * 2.0, FAR_M * 2.0), Vector2(0.05, 0.0))                 # the lower river and the pool
	_water(LIP_H - 1.6, Rect2(lip - 2.0 - FAR_M * 2.0, -FAR_M, FAR_M * 2.0, FAR_M * 2.0), Vector2(0.05, 0.0))   # the river above the lip
	_build_fall(lip, zr)
	var ph := _build_powerhouse(_ph)
	_build_alternator(ph, Vector3(1.5, 3.4, 0.6))
	anchors["alternator"] = _ph + Vector3(1.5, 6.6, 0.6)
	# the penstock: from an intake on the upper river down over the escarpment into the powerhouse's west wall
	_pen_a = Vector2(lip - 34.0, _rz(lip - 34.0) + 9.0); _pen_b = Vector2(_ph.x - 10.5, _ph.z - 2.5)
	_build_penstock()
	# the village down the river, and the low-voltage line that feeds it
	var vc := _village_rect().get_center()
	var spots := [Vector2(-30, -4), Vector2(-15, 5), Vector2(0, -5), Vector2(15, 4), Vector2(30, -3)]
	for k in spots.size():
		var p: Vector2 = vc + spots[k]
		_home(p, (WorldMath.hash2(k, 3, 9) - 0.5) * 0.5 + (0.0 if k % 2 == 0 else PI), WorldMath.hash2(k, 5, 9))
	anchors["village"] = Vector3(vc.x - 8.0, ground(vc.x, vc.y) + 7.5, vc.y)
	var a := Vector2(_ph.x + 12.0, _ph.z - 2.0); var b := vc + Vector2(-38.0, 6.0)
	var dir := -(b - a).angle()
	var atts: Array = []
	for k in 4:
		var p := a.lerp(b, float(k) / 3.0)
		atts.append(_pole(p.x, p.y, dir, 8.0))
	var wm: Array = _wires(atts, 0.025, 0.35)
	var core := MeshInstance3D.new(); core.name = "VillageLine"; core.mesh = wm[0]; core.material_override = _mat(Color(0.12, 0.12, 0.12), 0.5, 0.6); _root.add_child(core)
	# rocks at the foot of the fall and along the river
	var rx := []; var rc := []
	for k in 140:
		var x := lip - 10.0 + WorldMath.hash2(k, 1, 31) * 190.0; var d := (WorldMath.hash2(k, 2, 31) - 0.5) * 34.0
		if k < 40: x = lip + WorldMath.hash2(k, 3, 31) * 22.0; d = (WorldMath.hash2(k, 4, 31) - 0.5) * 30.0
		var z := _rz(x) + d
		if absf(d) < 4.0 or _ph_rect().grow(4.0).has_point(Vector2(x, z)) or _village_rect().grow(4.0).has_point(Vector2(x, z)): continue
		var s := 0.6 + 2.4 * WorldMath.hash2(k, 5, 31) * (1.6 if k < 40 else 1.0)
		rx.append(Transform3D(Basis(Vector3.UP, WorldMath.hash2(k, 6, 31) * TAU).scaled(Vector3(s, s * 0.7, s * 1.2)), Vector3(x, ground(x, z) - 0.25 * s, z))); rc.append(Color(0.8, 0.8, 0.78))
	_mm(Props3D.boulder(), rx, rc, "Rocks")
	_trees(_tree_ok04, 520.0, 7.0)

func _tree_ok04(x: float, z: float) -> float:
	var d := z - _rz(x); var w := absf(d)
	if w < 11.0: return 0.0
	if _ph_rect().grow(10.0).has_point(Vector2(x, z)) or _village_rect().grow(6.0).has_point(Vector2(x, z)): return 0.0
	if _seg_d(Vector2(x, z), _pen_a, _pen_b) < 7.0: return 0.0
	if absf(x - _lip(z)) < 6.0: return 0.0
	if d > 0.0 and x > -110.0 and x < 150.0 and d < 230.0: return 0.0   # the opening view looks in over the south bank: keep it open
	if d < 0.0: return 0.55
	return 0.08 + 0.4 * smoothstep(0.1, 0.4, _nz.get_noise_2d(x * 0.7, z * 0.7))

func _build_fall(lip: float, zr: float) -> void:
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var top := LIP_H - 1.6; var bot := -1.2; var nu := 6; var nv := 18; var half := 6.0
	var pts := []
	for j in nv + 1:
		var s := float(j) / float(nv)
		var row := []
		for i in nu + 1:
			var u := float(i) / float(nu)
			var zz := zr + (u - 0.5) * 2.0 * half * (1.0 + 0.35 * s)   # the sheet spreads as it falls
			row.append([Vector3(lip - 3.0 + 8.0 * s, lerpf(top, bot, s * s), zz), Vector2(u, s)])
		pts.append(row)
	for j in nv:
		for i in nu:
			for k in [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]]:
				var e: Array = pts[j + k[1]][i + k[0]]
				st.set_uv(e[1]); st.add_vertex(e[0])
	st.generate_normals()
	_fall_mat = ShaderMaterial.new(); _fall_mat.shader = load("res://world3d/shaders/waterfall.gdshader")
	var nt := NoiseTexture2D.new(); nt.seamless = true; nt.width = 128; nt.height = 256
	var fn := FastNoiseLite.new(); fn.frequency = 0.05; fn.fractal_octaves = 3; fn.seed = 19; nt.noise = fn
	_fall_mat.set_shader_parameter("streaks", nt)
	var mi := MeshInstance3D.new(); mi.name = "Waterfall"; mi.mesh = st.commit(); mi.material_override = _fall_mat; mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; _root.add_child(mi)
	var mist := MeshInstance3D.new(); mist.name = "Mist"; var sm := SphereMesh.new(); sm.radius = 7.0; sm.height = 8.0; sm.radial_segments = 16; sm.rings = 8; mist.mesh = sm
	mist.material_override = _glow_mat(Color(0.75, 0.85, 0.95, 0.04), 0.12); mist.position = Vector3(lip + 6.0, 0.5, zr); mist.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; _root.add_child(mist)
	anchors["waterfall"] = Vector3(lip, LIP_H + 4.0, zr)

func _build_penstock() -> void:
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var steel := Color(0.24, 0.27, 0.27)
	var n := int(_pen_a.distance_to(_pen_b) / 2.0)
	var prev := Vector3.ZERO
	var conc := _mat(Color(0.55, 0.55, 0.53), 0.9)
	for k in n + 1:
		var p := _pen_a.lerp(_pen_b, float(k) / float(n))
		var y := maxf(ground(p.x, p.y) + 1.3, 2.6 if k == n else -100.0)
		var c := Vector3(p.x, y, p.y)
		if k > 0: Props3D._cyl(st, prev, c, 0.75, 0.75, 14, steel)
		if k % 4 == 0: _box(_root, Vector3(p.x, y - 1.0, p.y), Vector3(1.6, 1.6, 1.8), conc)   # saddles
		prev = c
	var mi := MeshInstance3D.new(); mi.name = "Penstock"; mi.mesh = st.commit(); mi.material_override = _mat(Color(1, 1, 1), 0.5, 0.6)
	(mi.material_override as StandardMaterial3D).vertex_color_use_as_albedo = true
	_root.add_child(mi)
	_box(_root, Vector3(_pen_a.x, ground(_pen_a.x, _pen_a.y) + 1.6, _pen_a.y), Vector3(4.0, 4.0, 4.0), conc, "Intake")

# --------------------------------------------------------------------------------------------------------------------
# L06: the powerhouse, the step-up pad, the line, the step-down pad, the town
# --------------------------------------------------------------------------------------------------------------------
const L06_POLES := 12
const L06_X0 := -165.0
const L06_X1 := 148.0

func _build_l06() -> void:
	_water(-1.0, Rect2(-FAR_M, -FAR_M, FAR_M * 2.0, FAR_M * 2.0), Vector2(0.0, 0.05))
	var ph := _build_powerhouse(_ph)
	_build_alternator(ph, Vector3(1.5, 3.4, 0.6))
	anchors["gen"] = _ph + Vector3(0, 11.0, 2.0)
	# the transformer pads (and the plain poles that stand in at ratio 1)
	for p in [Vector2(-182.0, 0.0), Vector2(160.0, 0.0)]:
		var n := Node3D.new(); n.name = "Transformer"; n.position = Vector3(p.x, ground(p.x, p.y), p.y); _root.add_child(n)
		_box(n, Vector3(0, 0.1, 0), Vector3(11.0, 0.3, 11.0), _mat(Color(0.48, 0.47, 0.44), 0.95))
		for k in 16:   # a fence round the pad
			var a := TAU * k / 16.0
			_box(n, Vector3(cos(a) * 5.4, 1.0, sin(a) * 5.4), Vector3(0.08, 2.0, 0.08), _mat(Color(0.55, 0.56, 0.58), 0.5, 0.6))
		var mi := MeshInstance3D.new(); mi.name = "Tank"; mi.mesh = Props3D.transformer(); mi.material_override = _vc_mat(0.55); n.add_child(mi)
		_xf_nodes.append(n)
		var j := MeshInstance3D.new(); j.name = "Junction"; var sp: Array = Props3D.support("wood", 10.0, 9.4); j.mesh = sp[0]; j.material_override = _vc_mat(0.85)
		j.position = n.position; _root.add_child(j); _junctions.append(j)
	anchors["up"] = Vector3(-182.0, ground(-182.0, 0.0) + 9.0, 0.0)
	anchors["down"] = Vector3(160.0, ground(160.0, 0.0) + 9.0, 0.0)
	# the line: wood poles across the fields, two conductors
	var atts: Array = []
	for k in L06_POLES:
		var x := lerpf(L06_X0, L06_X1, float(k) / float(L06_POLES - 1)); var z := 2.0 * sin(float(k) * 1.7)
		atts.append(_pole(x, z, 0.0, 11.0))
	var gen_end: Array = [_ph + Vector3(10.2, 6.0, 2.0) + Vector3(0, 0, -0.95), _ph + Vector3(10.2, 6.6, 2.0), _ph + Vector3(10.2, 6.0, 2.0) + Vector3(0, 0, 0.95)]
	var mid := atts[L06_POLES / 2][1] as Vector3
	anchors["line"] = mid + Vector3(0, 3.0, 0)
	var wm: Array = _wires(atts, 0.035, 0.9)
	_wire_mat = StandardMaterial3D.new(); _wire_mat.albedo_color = Color(0.62, 0.62, 0.64); _wire_mat.metallic = 0.35; _wire_mat.roughness = 0.35
	_wire_mat.emission_enabled = true; _wire_mat.emission = Color.BLACK; _wire_mat.emission_energy_multiplier = 0.0
	var core := MeshInstance3D.new(); core.name = "Conductors"; core.mesh = wm[0]; core.material_override = _wire_mat; _root.add_child(core)
	_wire_glow = _glow_mat(Color(1.0, 0.4, 0.1, 1.0), 0.0); _wire_glow.set_shader_parameter("inflate", 0.0009)
	var gl := MeshInstance3D.new(); gl.name = "ConductorGlow"; gl.mesh = wm[1]; gl.material_override = _wire_glow; gl.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; _root.add_child(gl)
	# the short leads: generator to the first pole, last pole to the town (not part of the 15 km line: they stay plain metal)
	var lead_a: Array = [gen_end, atts[0]]
	var tw := _town_rect()
	var town_in := Vector3(tw.position.x + 4.0, ground(tw.position.x + 4.0, 0.0) + 6.0, 0.0)
	var lead_b: Array = [atts[L06_POLES - 1], [town_in + Vector3(0, 0, -0.95), town_in, town_in + Vector3(0, 0, 0.95)]]
	for ld in [lead_a, lead_b]:
		var lm: Array = _wires(ld, 0.03, 0.4)
		var li := MeshInstance3D.new(); li.name = "Lead"; li.mesh = lm[0]; li.material_override = _mat(Color(0.5, 0.5, 0.52), 0.4, 0.8); _root.add_child(li)
	# the town: three streets of homes
	var k := 0
	for row in 3:
		for col in 5:
			if (row == 1 and col == 0) or (row == 2 and col == 4): continue
			var x := tw.position.x + 14.0 + float(col) * 19.0 + (WorldMath.hash2(row, col, 61) - 0.5) * 4.0
			var z := tw.position.y + 14.0 + float(row) * 30.0 + (WorldMath.hash2(row, col, 62) - 0.5) * 3.0
			_home(Vector2(x, z), (0.0 if row % 2 == 0 else PI) + (WorldMath.hash2(row, col, 63) - 0.5) * 0.25, WorldMath.hash2(row, col, 64))
			k += 1
	anchors["town"] = Vector3(tw.get_center().x, ground(tw.get_center().x, tw.get_center().y) + 14.0, tw.get_center().y)
	_trees(_tree_ok06, 620.0, 8.0)

func _tree_ok06(x: float, z: float) -> float:
	if absf(z) < 14.0 and x > -200.0 and x < 190.0: return 0.0   # the line's corridor
	if _ph_rect().grow(12.0).has_point(Vector2(x, z)) or _town_rect().grow(4.0).has_point(Vector2(x, z)): return 0.0
	if absf(x - _rx6(z)) < 9.0: return 0.0
	var wood := smoothstep(0.1, 0.35, _nz.get_noise_2d(x * 0.5 + 300.0, z * 0.5))
	var hedge := 1.0 - smoothstep(0.0, 3.0, absf(fposmod(z + 40.0, 120.0) - 60.0))   # hedgerows between the fields
	return maxf(maxf(wood * 0.7, hedge * 0.5), smoothstep(-280.0, -340.0, x) * 0.6)

# --------------------------------------------------------------------------------------------------------------------
# The engine's numbers onto the scene
# --------------------------------------------------------------------------------------------------------------------
## Bulb brightness (V / V0)^2: 0 at 0 V, 1 at the nominal voltage, capped at 1.6 (an overvolted bulb is bright, then gone).
static func bulb_brightness(v: float, v0: float) -> float:
	if v <= 0.0 or v0 <= 0.0: return 0.0
	return clampf((v / v0) * (v / v0), 0.0, 1.6)

## How deep the bulbs flicker (0..0.85): none at the target frequency, deep far below it (16.7 Hz flickers hard; the 2D bench says the same).
static func flicker_depth(f: float, f0: float) -> float:
	if f0 <= 0.0: return 0.0
	return clampf((0.8 * f0 - f) / (0.6 * f0), 0.0, 0.85)

## The line's glow (0..1) from the share of the power the wire loses: plain metal at 2 % or less, full heat from about 60 %.
static func line_heat(loss_pct: float) -> float:
	return pow(clampf((loss_pct - 2.0) / 58.0, 0.0, 1.0), 0.7)

static func heat_colour(h: float) -> Color:
	return Color(0.55, 0.06, 0.02).lerp(Color(1.0, 0.48, 0.10), h)

func _apply() -> void:
	if kind == "machine":
		var m: Dictionary = q.machine; var rg: Dictionary = q.ranges
		var p := int(m.poles)
		var af := _frac(float(m.areaM2), float(rg.areaM2.min), float(rg.areaM2.max))
		var tf := _frac(float(m.turns), float(rg.turns.min), float(rg.turns.max), true)
		var rk := "%d|%.3f" % [p, af]
		if rk != _rotor_key: _rotor_key = rk; _build_rotor(p, af)
		var ck := "%d|%.3f" % [p, tf]
		if ck != _coil_key: _coil_key = ck; _build_coils(p, tf)
		var ff := _frac(float(m.fieldT), float(rg.fieldT.min), float(rg.fieldT.max))
		_gap_mat.set_shader_parameter("power", 0.25 + 2.2 * ff)
		for sm in _shoe_mats: sm.emission_energy_multiplier = 0.15 + 0.9 * ff
		_brightness = bulb_brightness(float(q.eRmsV), float(m.vTargetRms))
		_amber = float(q.eRmsV) < float(q.vLoV)
		_flicker = flicker_depth(float(q.fHz), float(m.fTargetHz))
		_flicker_hz = float(q.fHz) * 2.0 / 4.0   # the real flicker is 2f; drawn at a quarter of it
	elif kind == "town":
		var tw: Dictionary = q.town
		var on := int(tw.ratio) > 1
		var s := 1.25 * pow(float(tw.kva) / 1000.0, 1.0 / 3.0)
		for n in _xf_nodes:
			(n as Node3D).visible = on
			((n as Node3D).get_node("Tank") as Node3D).scale = Vector3.ONE * s
		for j in _junctions: (j as Node3D).visible = not on
		_xf_kva = int(tw.kva)
		var h := line_heat(float(q.lossPct))
		var hc := heat_colour(h)
		_wire_mat.emission = hc; _wire_mat.emission_energy_multiplier = 7.0 * pow(h, 1.3)
		_wire_mat.albedo_color = Color(0.62, 0.62, 0.64).lerp(Color(0.35, 0.12, 0.08), h * 0.8)
		_wire_glow.set_shader_parameter("tint", Color(hc, 1.0)); _wire_glow.set_shader_parameter("power", 1.4 * pow(h, 1.2))
		_brightness = bulb_brightness(float(q.vTownPu), 1.0)
		_amber = float(q.vTownPu) < TOWN_V_OK
		_flicker = 0.0
	_lights()

func _lights() -> void:
	var col := AMBER if _amber else WARM
	for hm in _homes:
		var b := _brightness
		if _flicker > 0.0 and not CbSettings.reduced_motion:
			b *= 1.0 - _flicker * (0.5 + 0.5 * sin(_t * TAU * _flicker_hz + float(hm.ph)))
		var lt: OmniLight3D = hm.light; var mat: StandardMaterial3D = hm.mat
		lt.light_energy = b * HOME_LIGHT_E; lt.light_color = col; lt.visible = b > 0.003
		mat.emission = col; mat.emission_energy_multiplier = b * 9.0
		var pm: ShaderMaterial = hm.pool; pm.set_shader_parameter("tint", Color(col, 1.0)); pm.set_shader_parameter("power", b * 1.4)

## What the scene shows now (tests/bench3d_truth.gd): pole and coil counts, the homes' brightness, the line's glow.
func report() -> Dictionary:
	var r := {"kind": kind, "homes": _homes.size(), "brightness": _brightness, "amber": _amber, "flicker": _flicker}
	if _rotor != null:
		var n := 0
		for c in _rotor.get_children(): if str(c.name).begins_with("Pole"): n += 1
		r["poles"] = n
	if _coils != null:
		r["coils"] = _coils.get_child_count()
		r["coil_depth"] = ((_coils.get_child(0) as MeshInstance3D).mesh as BoxMesh).size.z if _coils.get_child_count() > 0 else 0.0
	if _gap_mat != null: r["gap_glow"] = float(_gap_mat.get_shader_parameter("power"))
	if _wire_mat != null: r["wire_glow"] = _wire_mat.emission_energy_multiplier
	if not _xf_nodes.is_empty(): r["transformers"] = (_xf_nodes[0] as Node3D).visible
	if not _homes.is_empty(): r["window_e"] = (_homes[0].mat as StandardMaterial3D).emission_energy_multiplier
	return r

# --------------------------------------------------------------------------------------------------------------------
# Camera: orbit / pan / zoom for WorldView (same interface as Bay3D)
# --------------------------------------------------------------------------------------------------------------------
func reset_camera() -> void:
	if kind == "machine":   # from the south bank: the cut-away hall in front, the fall behind it on the left, the village on the right
		_g_target = Vector3(_ph.x + 10.0, 0.0, _ph.z - 16.0); _g_yaw = deg_to_rad(-12.0); _g_pitch = deg_to_rad(10.0); _g_dist = 88.0
	else:   # from the south-west, along the line: the powerhouse near, the town at the far end
		_g_target = Vector3(10.0, 0.0, -10.0); _g_yaw = deg_to_rad(-12.0); _g_pitch = deg_to_rad(17.0); _g_dist = 400.0
	var vp := get_viewport()
	if vp != null:   # a narrower window than 16:9 steps back, so both ends stay in the frame
		var vs := vp.get_visible_rect().size
		if vs.y > 0.0: _g_dist *= clampf((16.0 / 9.0) / (vs.x / vs.y), 1.0, 1.4)
	_dist_default = _g_dist
	_g_target.y = ground(_g_target.x, _g_target.z) + 4.0
	target = _g_target; yaw = _g_yaw; pitch = _g_pitch; dist = _g_dist
	_apply_camera()

func _clamp_goal() -> void:
	var b := _play.grow(60.0)
	_g_target.x = clampf(_g_target.x, b.position.x, b.end.x); _g_target.z = clampf(_g_target.z, b.position.y, b.end.y)
	_g_target.y = ground(_g_target.x, _g_target.z) + 4.0
	_g_pitch = clampf(_g_pitch, PITCH_MIN, PITCH_MAX)
	_g_dist = clampf(_g_dist, DIST_MIN, DIST_MAX)

func _apply_camera() -> void:
	var pos := target + Vector3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch)) * dist
	pos.y = maxf(pos.y, maxf(ground(pos.x, pos.z), -1.2) + 2.5)
	if cam == null or not cam.is_inside_tree(): return
	cam.look_at_from_position(pos, target, Vector3.UP)
	cam.current = true

func pan_px(rel: Vector2) -> void:
	var s := dist * 0.0012
	var right := Vector3(cos(yaw), 0, -sin(yaw)); var fwd := Vector3(-sin(yaw), 0, -cos(yaw))
	_g_target += (-right * rel.x + fwd * rel.y) * s / maxf(0.35, sin(pitch) * 0.6 + 0.4)
	_clamp_goal()

func orbit_px(rel: Vector2) -> void:
	_g_yaw -= rel.x * 0.006; _g_pitch += rel.y * 0.004; _clamp_goal()

func zoom_at(sp: Vector2, f: float) -> void:
	var g := _ray_ground(sp)
	var nd := clampf(_g_dist / f, DIST_MIN, DIST_MAX)
	if not is_nan(g.x): _g_target = _g_target.lerp(g, (1.0 - nd / _g_dist) * 0.9)
	_g_dist = nd; _clamp_goal()

func center_on_tile(p: Vector2, z := 1.0) -> void:
	_g_target = Vector3((p.x + 0.5) * tm, 0.0, (p.y + 0.5) * tm); _g_dist = clampf(_dist_default / z, DIST_MIN, DIST_MAX); _clamp_goal()

## CB_CAM words for screenshots: yaw=deg, pitch=deg, dist=m, x / z (metres), zoom (1 = the opening framing). They apply at once.
func set_camera_spec(spec: String) -> bool:
	var used := false
	for part in spec.split(","):
		var kv := part.strip_edges().split("=")
		if kv.size() < 2: continue
		match kv[0]:
			"yaw": _g_yaw = deg_to_rad(float(kv[1])); used = true
			"pitch": _g_pitch = deg_to_rad(float(kv[1])); used = true
			"dist": _g_dist = float(kv[1]); used = true
			"x": _g_target.x = float(kv[1]); used = true
			"z": _g_target.z = float(kv[1]); used = true
			"zoom": _g_dist = _dist_default / maxf(0.1, float(kv[1])); used = true
	_clamp_goal()
	target = _g_target; yaw = _g_yaw; pitch = _g_pitch; dist = _g_dist; _apply_camera()
	return used

func _process(dt: float) -> void:
	if not visible or field == null: return
	_t += dt
	var k := 1.0 - exp(-dt * 9.0)
	target = target.lerp(_g_target, k); yaw = lerp_angle(yaw, _g_yaw, k); pitch = lerpf(pitch, _g_pitch, k); dist = lerpf(dist, _g_dist, k)
	_apply_camera()
	if _rotor != null and not q.is_empty():
		var rpm := float(q.machine.rpm) if kind == "machine" else 500.0
		_rotor.rotation.z = -(_t * rpm / 60.0 * TAU / SLOWMO) if not CbSettings.reduced_motion else 0.3
	if _flicker > 0.0: _lights()

# --------------------------------------------------------------------------------------------------------------------
# Projection for the 2D overlay
# --------------------------------------------------------------------------------------------------------------------
func _canvas_scale() -> float:
	if canvas_size.x < 1.0 or get_viewport() == null: return 1.0
	return get_viewport().get_visible_rect().size.x / canvas_size.x

func project(p: Vector3) -> Vector2:
	if cam == null or not cam.is_inside_tree() or cam.is_position_behind(p): return Vector2(-99999, -99999)
	return cam.unproject_position(p) / _canvas_scale()

## Nothing on the bench is picked from the ground (the panel holds every control): no map point under the pointer.
func ground_point(_sp: Vector2) -> Vector3: return Vector3(NAN, NAN, NAN)

func _ray_ground(sp: Vector2) -> Vector3:
	if cam == null or not cam.is_inside_tree(): return Vector3(NAN, NAN, NAN)
	var vp := sp * _canvas_scale()
	var o := cam.project_ray_origin(vp); var d := cam.project_ray_normal(vp)
	var t := 0.0; var step := maxf(0.5, dist * 0.01)
	for _i in 600:
		var p := o + d * t
		if p.y <= ground(p.x, p.z):
			var lo := t - step; var hi := t
			for _k in 12:
				var mid := (lo + hi) * 0.5; var qq := o + d * mid
				if qq.y <= ground(qq.x, qq.z): hi = mid
				else: lo = mid
			return o + d * hi
		t += step; step *= 1.01
		if t > 20000.0: break
	return Vector3(NAN, NAN, NAN)

func px_per_tile() -> float:
	var a := project(target); var b := project(target + Vector3(tm, 0, 0))
	return maxf(1.0, a.distance_to(b))
