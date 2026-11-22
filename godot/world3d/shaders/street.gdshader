// GRID LOOK2 streets and town cores (manager review 1.15: from play height a town must read as a place, not speckle).
// Streets: asphalt by day; at night a sodium glow that grows with distance, widened so a far street stays a line instead of sub-pixel noise.
// The town's lit share (town_lit, from the engine) scales the glow. The warm core disc is town_core.gdshader.
shader_type spatial;
render_mode cull_disabled;
uniform float night = 0.0;
uniform float town_lit[64];
uniform vec3 lamp : source_color = vec3(1.0, 0.66, 0.32);
varying float far;
varying float lit;
void vertex() {
	float d = length((MODELVIEW_MATRIX * vec4(VERTEX, 1.0)).xyz);
	far = smoothstep(700.0, 3500.0, d);
	lit = town_lit[clamp(int(COLOR.a * 63.0 + 0.5), 0, 63)];
	vec2 lat = COLOR.rg * 2.0 - 1.0;
	float side = COLOR.b * 2.0 - 1.0;
	VERTEX.xz += lat * side * d * 0.0007 * far * UV.y;   // main streets stay about one pixel wide at any distance past 3.5 km
	VERTEX.y += far * d * 0.0002;
}
void fragment() {
	float nn = smoothstep(0.35, 0.9, night);
	ALBEDO = vec3(0.17, 0.17, 0.18) * (1.0 - 0.6 * far * nn);
	ROUGHNESS = 0.92;
	EMISSION = lamp * nn * lit * (0.04 + 0.4 * far) * mix(0.3, 1.0, UV.y);   // arteries bright, side streets a faint mesh
}
