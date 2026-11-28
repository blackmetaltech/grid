// Chain-link fence panels (Kit3D.fence): a diamond wire mesh drawn in the shader, cut out with alpha scissor; UV in metres.
// Fades to a light grey veil at a distance where the wires are under a pixel (no moire).
shader_type spatial;
render_mode cull_disabled, diffuse_burley;
void fragment() {
	vec2 p = UV / 0.06;
	vec2 q = vec2(p.x + p.y, p.x - p.y);
	vec2 f = abs(fract(q) - 0.5);
	float px = max(fwidth(q.x), 1e-3);
	float d = min(0.5 - f.x, 0.5 - f.y);
	float wire = 1.0 - smoothstep(0.05, 0.05 + px, d);
	float veil = smoothstep(0.25, 0.9, px);
	float a = mix(wire, 0.35, veil);
	float rail = step(UV.y, 0.06) + step(2.32, UV.y);
	a = max(a, rail);
	ALBEDO = vec3(0.50, 0.52, 0.54);
	METALLIC = 0.6; ROUGHNESS = 0.45;
	ALPHA = a; ALPHA_SCISSOR_THRESHOLD = 0.5;
}
