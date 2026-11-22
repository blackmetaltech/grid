// Trees (MultiMesh): vertex colour = trunk/foliage base, instance colour varies the hue; a little wind sway near the top.
shader_type spatial;
render_mode diffuse_burley;
uniform float sway = 0.25;
varying float top;
void vertex() {
	top = clamp(VERTEX.y / 1.0, 0.0, 1.0);
	vec3 wo = MODEL_MATRIX[3].xyz;
	VERTEX.x += sin(TIME * 1.3 + wo.x * 0.05 + wo.z * 0.07) * sway * top * top * 0.06;
}
void fragment() {
	ALBEDO = COLOR.rgb;
	ROUGHNESS = 0.9;
	BACKLIGHT = vec3(0.12, 0.16, 0.06) * top;
}
