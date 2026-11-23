// The L04 waterfall (world3d/bench3d.gd): a falling sheet whose streaks run down UV.y, thinning to spray at the edges (UV.x) and turning to foam at the foot.
// UV.x 0..1 across the sheet, UV.y 0 at the lip, 1 in the pool. Lit like water (rough, a little sky colour) with a faint glow so it reads at night.
shader_type spatial;
render_mode blend_mix, depth_draw_opaque, cull_disabled, diffuse_burley, specular_schlick_ggx;
uniform sampler2D streaks : filter_linear_mipmap, repeat_enable;
uniform vec3 water : source_color = vec3(0.78, 0.86, 0.90);
uniform vec3 deep : source_color = vec3(0.25, 0.38, 0.44);
uniform float speed = 0.9;      // sheet lengths per second near the foot
uniform float night = 0.0;

void fragment() {
	// the water speeds up as it falls: the streak pattern is stretched near the foot
	float v = UV.y;
	float fall = v * v * 0.8 + v * 0.2;
	vec2 p = vec2(UV.x * 3.0, fall * 1.6 - TIME * speed);
	float a = texture(streaks, p).r;
	float b = texture(streaks, vec2(UV.x * 7.0 + 0.37, fall * 3.1 - TIME * speed * 1.4)).r;
	float s = smoothstep(0.35, 0.75, a * 0.6 + b * 0.4);
	float edge = smoothstep(0.0, 0.14, UV.x) * smoothstep(0.0, 0.14, 1.0 - UV.x);
	float foam = smoothstep(0.78, 1.0, v);
	vec3 col = mix(deep, water, 0.45 + 0.55 * s);
	col = mix(col, vec3(0.93, 0.96, 0.97), foam * 0.8);
	ALBEDO = col;
	ROUGHNESS = 0.35;
	SPECULAR = 0.5;
	EMISSION = col * (0.05 + 0.12 * night);
	ALPHA = clamp((0.55 + 0.45 * s) * edge * (1.0 - 0.25 * foam) + foam * 0.2, 0.0, 0.96);
}
