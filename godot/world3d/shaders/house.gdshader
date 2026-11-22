// GRID LOOK2 houses (MultiMesh): wall tint from the instance colour, roofs marked by UV.x > 1.5, windows in a world-sized grid per floor.
// INSTANCE_CUSTOM.r = this building's energy from the engine (WorldMath.building_energy: (V/Vnom)^2, 0 when shed or dark), .g = a seed,
// .b unused (night is a uniform). A window is lit when its hash is below the energy: a dark town is dark, a sagging town is dimmer and thinner.
shader_type spatial;
render_mode diffuse_burley;

uniform vec3 roof_a : source_color = vec3(0.50, 0.17, 0.11);
uniform vec3 roof_b : source_color = vec3(0.19, 0.20, 0.24);
uniform vec3 lamp : source_color = vec3(1.0, 0.62, 0.26);
uniform float lamp_power = 2.2;
uniform float night = 0.0;   // set by Province3D from the operator clock

varying vec3 wp;
varying vec3 wn;
varying vec4 ic;
varying float roof;
varying float hy;
void vertex() {
	wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	wn = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
	ic = INSTANCE_CUSTOM;
	roof = step(1.5, UV.x);
	hy = wp.y - MODEL_MATRIX[3].y;
}
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void fragment() {
	if (roof > 0.5) {
		vec3 rc = ic.g < 0.45 ? roof_a : (ic.g < 0.8 ? roof_b : vec3(0.36, 0.30, 0.24));
		rc *= 0.75 + 0.5 * h21(vec2(ic.g * 91.0, 3.0));
		float tiles = 0.85 + 0.15 * step(0.5, fract(wp.y * 3.0));
		float dark = (1.0 - step(0.001, ic.r)) * night;   // a dark town at night: roofs lose the lamplight they would catch
		ALBEDO = rc * tiles * (1.0 - 0.45 * dark); ROUGHNESS = 0.8;
	} else {
		vec3 base = COLOR.rgb;
		// along-wall coordinate in metres
		float u = abs(wn.x) > abs(wn.z) ? wp.z : wp.x;
		vec2 cell = vec2(floor(u / 2.6), floor(hy / 2.9));
		vec2 f = vec2(fract(u / 2.6), fract(hy / 2.9));
		float win = step(0.28, f.x) * step(f.x, 0.72) * step(0.35, f.y) * step(f.y, 0.8);
		win *= step(1.0, hy);   // no windows in the plinth
		float lit = step(h21(cell + ic.g * 17.0), ic.r) * win * step(0.18, h21(cell * 1.7 + ic.g * 5.0));   // some rooms dark by design
		float dark = (1.0 - step(0.001, ic.r)) * night;
		ALBEDO = mix(base, vec3(0.05, 0.06, 0.08), win * 0.85) * (1.0 - 0.45 * dark);
		ROUGHNESS = mix(0.85, 0.15, win);
		float flick = 0.85 + 0.15 * h21(cell * 3.1 + ic.g);
		EMISSION = lamp * lit * lamp_power * flick * (0.15 + 0.85 * night);
	}
}
