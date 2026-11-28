// Trees (MultiMesh): vertex colour = trunk/foliage base and baked self-shadow, instance colour varies the hue; wind sway near the top.
// Audit 1128c: leaf breakup (a world-space noise so a crown is not one flat colour), a soft wrap light and a little translucency
// so canopies glow at the rim against a low sun, and a cool, darker read at night instead of black cut-outs.
shader_type spatial;
render_mode diffuse_burley, specular_schlick_ggx;
uniform float sway = 0.25;
uniform float night = 0.0;
varying float top;
varying float tone;
varying vec3 lp;
void vertex() {
	top = clamp(VERTEX.y / 1.0, 0.0, 1.0);
	lp = VERTEX;
	vec3 wo = MODEL_MATRIX[3].xyz;
	tone = fract(sin(dot(wo.xz, vec2(12.9898, 78.233))) * 43758.5453);
	VERTEX.x += sin(TIME * 1.3 + wo.x * 0.05 + wo.z * 0.07) * sway * top * top * 0.06;
}
float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float vn(vec3 p) {
	vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
		mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
void fragment() {
	float leaf = vn(lp * 26.0 + tone * 9.0) * 0.6 + vn(lp * 61.0) * 0.4;
	vec3 hue = mix(vec3(0.92, 1.0, 0.86), vec3(1.08, 1.0, 0.82), tone);   // some trees yellower, some bluer
	ALBEDO = COLOR.rgb * hue * (0.78 + 0.42 * leaf);
	ROUGHNESS = 0.9;
	SPECULAR = 0.12;
	BACKLIGHT = vec3(0.10, 0.16, 0.05) * top * (1.0 - night);
	AO = mix(0.55, 1.0, smoothstep(0.0, 0.75, top)) * (0.8 + 0.2 * leaf);
	AO_LIGHT_AFFECT = 0.3;
	// far away a wood averages to a lit canopy green (each tree is a pixel: its dark underside and AO read as black dots)
	float fd = smoothstep(700.0, 3500.0, length(VERTEX));
	ALBEDO = mix(ALBEDO, COLOR.rgb * hue * 1.15 + vec3(0.02, 0.03, 0.0), fd);
	AO = mix(AO, 1.0, fd);
}
