// Trees (MultiMesh): vertex colour = trunk/foliage base, instance colour varies the hue; a little wind sway near the top.
shader_type spatial;
render_mode diffuse_burley;
uniform float sway = 0.25;
varying float top;
varying float tone;
void vertex() {
	top = clamp(VERTEX.y / 1.0, 0.0, 1.0);
	vec3 wo = MODEL_MATRIX[3].xyz;
	tone = fract(sin(dot(wo.xz, vec2(12.9898, 78.233))) * 43758.5453);
	VERTEX.x += sin(TIME * 1.3 + wo.x * 0.05 + wo.z * 0.07) * sway * top * top * 0.06;
}
void fragment() {
	// 11-28b audit: canopies caught the sky as a pale cyan sheen at night (default specular); now matte leaves, a crown darker toward
	// its foot (self-shadow) and a tone per tree, so a wood reads as many trees with depth, not one pale blob
	ALBEDO = COLOR.rgb * mix(0.55, 1.0, smoothstep(0.0, 0.8, top)) * (0.8 + 0.4 * tone);
	ROUGHNESS = 0.95;
	SPECULAR = 0.08;
	BACKLIGHT = vec3(0.12, 0.16, 0.06) * top;
}
