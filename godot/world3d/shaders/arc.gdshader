// Audit 1128c: the fault marker was a lit yellow ball (it read as a moon). An arc flash: a white-hot core that fades to a blue
// glow at the rim, with flickering streaks; additive, so it blooms. `power` is driven by the stage (0 hides it).
shader_type spatial;
render_mode unshaded, blend_add, depth_draw_never, cull_back, shadows_disabled;
uniform vec4 tint : source_color = vec4(0.62, 0.78, 1.0, 1.0);
uniform float power = 2.0;
varying vec3 lp;
void vertex() { lp = VERTEX; }
float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void fragment() {
	float f = clamp(dot(NORMAL, VIEW), 0.0, 1.0);
	float core = pow(f, 7.0);
	float halo = pow(f, 1.6) * 0.45;
	float ang = atan(lp.y, lp.x + 1e-4);
	float streak = pow(h(vec2(floor(ang * 9.0), floor(TIME * 24.0))), 6.0) * smoothstep(0.15, 0.6, f) * (1.0 - core);
	float flick = 0.75 + 0.25 * h(vec2(floor(TIME * 30.0), 3.1));
	vec3 c = mix(tint.rgb, vec3(1.0), core) * (core * 3.0 + halo + streak * 1.5) * flick;
	ALBEDO = c * power;
}
