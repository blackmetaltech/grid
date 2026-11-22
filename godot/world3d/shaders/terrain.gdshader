// GRID LOOK2 terrain: six splat-mapped CC0 materials (Poly Haven, docs/ASSETS.md), world-space UVs at two scales with a rotated second
// sample (no visible tile), a macro noise for large-scale colour drift, a field patchwork (plots with hedgerows) on farmland, slope rock.
// COLOR = (grass/field, forest floor, rock, sand) weights, UV2 = (mud/salt-marsh, paved/town) weights, written per vertex from the engine's tile kinds.
shader_type spatial;
render_mode diffuse_burley, specular_schlick_ggx;

uniform sampler2D grass_a : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D grass_n : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D forest_a : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D forest_n : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D rock_a : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D rock_n : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D sand_a : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D sand_n : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D mud_a : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D field_a : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D macro_noise : filter_linear_mipmap, repeat_enable;
uniform float tile_m = 22.0;
uniform float night = 0.0;
uniform vec3 grass_tint = vec3(1.0);
uniform bool cheap = false;   // low tier: one sample per kind, no field plots, no normal maps   // the generated province: greener farmland

varying vec3 wpos;
varying vec3 wnrm;
varying vec2 w2;

void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	wnrm = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
	w2 = UV2;
}

float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// two samples at different scales and rotations, blended by a macro noise: kills the grid of repeats
vec3 tex2(sampler2D t, vec2 p, float m) {
	vec2 q = mat2(vec2(0.8, -0.6), vec2(0.6, 0.8)) * p * 0.37 + vec2(0.31, 0.17);
	return mix(texture(t, p).rgb, texture(t, q).rgb, 0.35 + 0.3 * m);
}
vec3 nrm2(sampler2D t, vec2 p) { return texture(t, p).rgb; }

void fragment() {
	vec2 p = wpos.xz / tile_m;
	float m1 = texture(macro_noise, wpos.xz / 1900.0).r;
	float m2 = texture(macro_noise, wpos.xz / 420.0 + vec2(0.37, 0.71)).r;
	float m = m1 * 0.7 + m2 * 0.3;
	vec4 w = COLOR;
	float mud = w2.x, paved = w2.y;
	// slope: steep ground shows rock whatever the map says
	float slope = 1.0 - clamp(wnrm.y, 0.0, 1.0);
	float rk = smoothstep(0.22, 0.42, slope);
	w.b = max(w.b, rk);
	// break the splat edges with noise so kinds do not meet on straight tile lines
	float jit = (m2 - 0.5) * 0.5;
	w = max(w + vec4(jit, -jit, 0.0, 0.0) * 0.6, vec4(0.0));
	float sum = w.r + w.g + w.b + w.a + mud + paved + 1e-4;
	w /= sum; mud /= sum; paved /= sum;

	if (cheap) {
		vec3 cc = texture(grass_a, p).rgb * grass_tint * w.r + texture(forest_a, p * 1.3).rgb * vec3(0.55, 0.62, 0.45) * w.g + texture(rock_a, p * 0.6).rgb * w.b
			+ texture(sand_a, p * 1.5).rgb * w.a + texture(mud_a, p).rgb * mud + vec3(0.36, 0.35, 0.33) * paved;
		cc *= mix(vec3(0.86, 0.92, 0.80), vec3(1.10, 1.04, 0.92), m1);
		ALBEDO = cc * mix(0.62, 1.0, smoothstep(0.2, 2.2, wpos.y)); ROUGHNESS = 0.92; SPECULAR = 0.25;
	} else {
	// fields: Voronoi plots (~170 m), each with its own crop; hedgerows where two plots meet
	vec2 fq = wpos.xz / 170.0;
	vec2 fi = floor(fq); vec2 ff = fract(fq);
	float d1 = 8.0; float d2 = 8.0; vec2 cell = vec2(0.0);
	for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
		vec2 o = vec2(float(x), float(y));
		vec2 pt = o + vec2(h21(fi + o), h21(fi + o + 17.3)) * 0.85;
		float dd = length(pt - ff);
		if (dd < d1) { d2 = d1; d1 = dd; cell = fi + o; } else if (dd < d2) { d2 = dd; }
	}
	float crop = h21(cell * 1.31);
	vec3 g = tex2(grass_a, p, m);
	vec3 plot = g;
	if (crop < 0.34) plot = g * vec3(0.96, 1.04, 0.88);
	else if (crop < 0.52) plot = mix(g, vec3(0.55, 0.52, 0.32), 0.30);
	else if (crop < 0.64) { float ang = h21(cell + 3.0) * 3.14; vec2 rp = mat2(vec2(cos(ang), -sin(ang)), vec2(sin(ang), cos(ang))) * wpos.xz; plot = mix(g, tex2(field_a, rp / 14.0, m) * vec3(1.0, 0.92, 0.82), 0.6); }
	else if (crop < 0.84) plot = g * vec3(0.86, 1.0, 0.76);
	else plot = mix(g, vec3(0.62, 0.56, 0.32), 0.22);
	float hedge = 1.0 - smoothstep(0.012, 0.03, d2 - d1);
	plot = mix(g, plot, smoothstep(0.0, 0.12, d2 - d1));   // soft field edges: crops fade into the hedge line
	plot = mix(plot, vec3(0.12, 0.17, 0.08), hedge * 0.6);
	vec3 grass = mix(g, plot, 0.6) * grass_tint;

	vec3 col = grass * w.r
		+ tex2(forest_a, p * 1.3, m) * vec3(0.55, 0.62, 0.45) * w.g
		+ tex2(rock_a, p * 0.6, m) * w.b
		+ tex2(sand_a, p * 1.5, m) * w.a
		+ tex2(mud_a, p, m) * vec3(0.85, 0.9, 0.8) * mud
		+ mix(vec3(0.32, 0.31, 0.30), vec3(0.42, 0.40, 0.37), m2) * paved;
	// macro colour drift: some hillsides drier, some lusher
	col *= mix(vec3(0.86, 0.92, 0.80), vec3(1.10, 1.04, 0.92), m1);
	// wet sand / mud darkens near the waterline
	col *= mix(0.62, 1.0, smoothstep(0.2, 2.2, wpos.y));

	vec3 n = nrm2(grass_n, p) * (w.r + paved) + nrm2(forest_n, p * 1.3) * (w.g + mud) + nrm2(rock_n, p * 0.6) * w.b + nrm2(sand_n, p * 1.5) * w.a;
	NORMAL_MAP = n;
	NORMAL_MAP_DEPTH = 0.9;
	ALBEDO = col;
	ROUGHNESS = mix(0.95, 0.75, w.b) * mix(1.0, 0.5, mud);
	SPECULAR = 0.3;
	}
}
