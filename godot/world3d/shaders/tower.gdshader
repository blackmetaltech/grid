// GRID LOOK2 lattice towers and conductors: lit steel from the vertex colour; members thicken with camera distance so a tower keeps
// its silhouette at play zoom (a 46 m tower 5 km away is otherwise a few sub-pixel lines).
shader_type spatial;
uniform float inflate = 0.0006;
uniform float metal = 0.55;
uniform float rough = 0.45;
uniform vec3 tint : source_color = vec3(1.0);
void vertex() {
	float d = length((MODELVIEW_MATRIX * vec4(VERTEX, 1.0)).xyz);
	VERTEX += NORMAL * inflate * max(0.0, d - 250.0);
}
void fragment() {
	ALBEDO = COLOR.rgb * tint; METALLIC = metal; ROUGHNESS = rough;
}
