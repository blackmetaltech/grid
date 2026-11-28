// GRID 11-28b: weathered poured concrete for cooling towers and chimneys. Vertex colour carries the foot-to-lip grade
// (Province3D's lathe); on top: horizontal pour lifts every 1.5 m, vertical rain streaks, a soot band under the lip and a
// sky-facing sheen kept low so it never reads as porcelain. World space, so any mesh works.
shader_type spatial;
render_mode diffuse_burley, cull_disabled;

uniform sampler2D grime : filter_linear_mipmap, repeat_enable;
uniform float top_y = 115.0;      // local height of the lip (soot band below it)
uniform vec3 tint : source_color = vec3(1.0);

varying vec3 wp;
varying vec3 lp;
void vertex() {
	wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	lp = VERTEX;
}
void fragment() {
	float near = 1.0 - smoothstep(200.0, 2500.0, length(VERTEX));
	float ang = atan(lp.z, lp.x);
	float u = ang * 30.0;                                   // ~ metres round a 30 m radius
	float streak = texture(grime, vec2(u / 11.0, lp.y / 90.0)).r;
	float lift = smoothstep(0.85, 1.0, fract(lp.y / 1.5)) * near;
	float soot = smoothstep(top_y - 14.0, top_y, lp.y);
	float blot = texture(grime, vec2(u / 37.0, lp.y / 23.0) + 0.3).r;
	vec3 c = COLOR.rgb * tint * 0.86 * (0.66 + 0.5 * streak) * (0.88 + 0.2 * blot);
	c *= 1.0 - 0.10 * lift;
	c = mix(c, c * 0.45, soot * 0.7);
	// 1128c (art review: smooth plastic towers): rain streaks in vertical runs, pour lifts at every distance, the open foot
	float run = fract(sin(floor(u / 1.4) * 91.7) * 4375.5);
	float rain = smoothstep(0.55, 1.0, run) * (0.6 + 0.4 * texture(grime, vec2(u / 3.0, lp.y / 40.0)).r) * smoothstep(top_y, top_y * 0.3, lp.y);
	c *= 1.0 - 0.28 * rain;
	c *= 1.0 - 0.06 * smoothstep(0.9, 1.0, fract(lp.y / 1.5));
	if (lp.y < 9.0) {   // the air inlet: a dark ring behind diagonal columns
		float col = abs(fract(u / 4.0 + lp.y / 9.0 * 0.5) - 0.5) < 0.09 || abs(fract(u / 4.0 - lp.y / 9.0 * 0.5) - 0.5) < 0.09 ? 1.0 : 0.0;
		c = mix(vec3(0.03, 0.03, 0.035), c * 0.8, col);
	}
	c *= 0.85;
	ALBEDO = c;
	ROUGHNESS = 0.95; SPECULAR = 0.12;
}
