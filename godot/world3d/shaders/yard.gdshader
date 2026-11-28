// 1128c: plant and substation yards: concrete slabs with dark joints every 6 m, oil stains, tyre tracks and a gravel border,
// in world metres (was a flat untextured box that went black at night).
shader_type spatial;
render_mode diffuse_burley;
uniform float slab = 6.0;
varying vec3 wp;
void vertex() { wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz; }
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
void fragment() {
	vec2 p = wp.xz;
	vec2 c = floor(p / slab);
	vec2 f = fract(p / slab) * slab;
	float px = max(fwidth(p.x), 1e-3);
	float joint = 1.0 - smoothstep(0.06, 0.06 + px * 1.5, min(min(f.x, slab - f.x), min(f.y, slab - f.y)));
	joint *= 1.0 - smoothstep(0.3, 1.2, px);
	vec3 col = vec3(0.47, 0.46, 0.43) * (0.9 + 0.18 * h21(c));
	col *= 0.85 + 0.25 * vn(p / 3.0);
	col *= 1.0 - 0.35 * smoothstep(0.62, 0.8, vn(p / 9.0 + 7.0));            // oil and damp
	float track = smoothstep(0.75, 0.95, abs(sin(p.x * 0.9 + vn(p * 0.05) * 3.0))) * smoothstep(0.4, 0.7, vn(p / 40.0));
	col *= 1.0 - 0.12 * track;
	col *= 1.0 - 0.45 * joint;
	ALBEDO = col; ROUGHNESS = 0.88; SPECULAR = 0.25;
}
