// GRID 11-28b: industrial cladding for plant halls, boilers and works sheds. World-space, so any box mesh works:
// walls get vertical ribs (a normal ripple), panel seams and tone steps, rain streaks; roofs (faces looking up) get
// standing seams and weathering. Detail fades with distance so far halls read as clean masses, not noise.
shader_type spatial;
render_mode diffuse_burley;

uniform vec3 base : source_color = vec3(0.55, 0.58, 0.60);
uniform vec3 roof_col : source_color = vec3(0.30, 0.31, 0.32);
uniform float rib_m = 0.9;        // rib pitch (m)
uniform float panel_m = 7.5;      // panel width (m)
uniform float metal = 0.12;   // 1128c (art review: the hall rendered solid black at night): 0.35 metal had no diffuse left under a dark sky
uniform sampler2D grime : filter_linear_mipmap, repeat_enable;   // any noisy greyscale (rock roughness)

varying vec3 wp;
varying vec3 wn;
void vertex() {
	wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	wn = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}
float h11(float x) { return fract(sin(x * 91.17) * 43758.5453); }
void fragment() {
	float near = 1.0 - smoothstep(120.0, 900.0, length(VERTEX));
	if (wn.y > 0.7) {   // roof
		float seam = smoothstep(0.9, 1.0, abs(fract(wp.x / 1.2) * 2.0 - 1.0));
		float g = texture(grime, wp.xz / 31.0).r;
		ALBEDO = roof_col * (0.82 + 0.3 * g) * (1.0 - 0.18 * seam * near);
		ROUGHNESS = 0.7; METALLIC = metal * 0.6;
	} else {
		float u = abs(wn.x) > abs(wn.z) ? wp.z : wp.x;
		float rib = fract(u / rib_m);
		float panel = floor(u / panel_m);
		float seam = 1.0 - smoothstep(0.0, 0.05, abs(fract(u / panel_m) - 0.5) - 0.46);
		float tone = 0.9 + 0.2 * h11(panel + floor(wp.y / 9.0) * 7.0);
		float streak = texture(grime, vec2(u / 9.0, wp.y / 70.0)).r;   // stretched down the wall: rain marks
		vec3 c = base * tone * (0.84 + 0.28 * streak);
		c *= 1.0 - 0.25 * seam * near;
		ALBEDO = c;
		NORMAL_MAP = vec3(0.5 + 0.28 * sin(rib * 6.2832) * near, 0.5, 1.0);   // the ribs catch a raking light
		ROUGHNESS = mix(0.55, 0.75, streak); METALLIC = metal;
	}
}
