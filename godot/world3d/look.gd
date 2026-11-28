class_name Look3D
extends RefCounted
## One light grade for every 3D place (Bay3D, Bench3D and its stages, Province3D), called at the end of each _update_sky.
## Audit 1128c: night read as dim day (a white moon at day strength, a flat ambient and a 1.4x exposure lift), so every night job
## looked like mustard mud under overcast. Night now: a cold blue moon key from the side with soft shadows, a deep blue ambient,
## lower saturation, and a stronger glow so lit windows and lamps carry the scene. Day: a cleaner noon (no beige wash).

## n = night 0..1, d = dusk 0..1 (WorldMath). `ambient_k` scales the ambient for places with sky ambient (the province).
static func grade(env: Environment, moon: DirectionalLight3D, n: float, d: float, quality: String, terrain: Array = []) -> void:
	var day := (1.0 - n) * (1.0 - d)
	var nk := smoothstep(0.25, 0.9, n)
	# moon: cool, side-lit, about a quarter of the sun; shadows on the high tier
	if moon != null:
		moon.light_color = Color(0.58, 0.70, 1.0)
		moon.light_energy = 0.6 * nk   # 1128c sweep 1: 0.42 left the island and P0 murky
		moon.light_specular = 0.6
		moon.visible = moon.light_energy > 0.01
		moon.shadow_blur = 2.0
	# ambient: deep blue at night, so shadow sides read as night and not as mud
	var amb_night := Color(0.11, 0.16, 0.30)
	if env.ambient_light_source == Environment.AMBIENT_SOURCE_COLOR:
		env.ambient_light_color = env.ambient_light_color.lerp(amb_night, nk)
		env.ambient_light_energy = lerpf(env.ambient_light_energy, 0.55, nk)
	else:
		env.ambient_light_sky_contribution = lerpf(env.ambient_light_sky_contribution, 0.25, nk)
		env.ambient_light_color = env.ambient_light_color.lerp(amb_night, nk)
		env.ambient_light_energy = lerpf(env.ambient_light_energy, 0.6, nk)
	env.tonemap_exposure = lerpf(lerpf(1.0, 0.86, day), 1.25, nk) * lerpf(1.0, 1.05, d * (1.0 - n))   # noon a touch under: no pastel wash
	env.tonemap_white = lerpf(8.0, 6.0, nk)
	# colour: some bite by day, desaturated and a little contrasty at night (warm lights still read warm against it)
	env.adjustment_enabled = true
	env.adjustment_saturation = lerpf(lerpf(1.0, 1.08, day), 0.72, nk)
	env.adjustment_contrast = lerpf(lerpf(1.04, 1.10, day), 1.12, nk)
	env.adjustment_brightness = 1.0
	# glow: lamps and windows bloom at night
	if quality != "low":
		env.glow_enabled = true
		env.glow_blend_mode = Environment.GLOW_BLEND_MODE_ADDITIVE if nk > 0.5 else Environment.GLOW_BLEND_MODE_SOFTLIGHT
		env.glow_intensity = lerpf(0.6, 0.9, nk)
		env.glow_strength = 1.0
		env.glow_bloom = lerpf(0.02, 0.0, nk)
		env.glow_hdr_threshold = lerpf(1.2, 0.9, nk)
		env.glow_hdr_scale = 2.0
		env.set_glow_level(0, 0.0); env.set_glow_level(1, 0.6); env.set_glow_level(2, 0.8); env.set_glow_level(3, 1.0); env.set_glow_level(4, 0.7); env.set_glow_level(5, 0.4)
	for t in terrain:
		if t is ShaderMaterial: (t as ShaderMaterial).set_shader_parameter("night", n)
	Kit3D.night(nk)
	for w in _tree_mats:
		var m = w.get_ref()
		if m != null: m.set_shader_parameter("night", n)

## The shared tree material (bench and bay MultiMeshes; the province makes its own from the same shader). Night is set by grade().
static var _tree_mats: Array = []
static func tree_mat() -> ShaderMaterial:
	var m := ShaderMaterial.new(); m.shader = load("res://world3d/shaders/tree.gdshader")
	_tree_mats = _tree_mats.filter(func(w): return w.get_ref() != null)
	_tree_mats.append(weakref(m))
	return m
