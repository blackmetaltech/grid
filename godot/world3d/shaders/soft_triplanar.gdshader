// A calm triplanar surface for masonry and concrete (world3d/bench3d.gd): the texture only modulates a base colour by `contrast`, so a rock photo
// becomes dressed stone or poured concrete instead of a noisy cliff. World-space mapping: walls and floors of any size share one scale.
shader_type spatial;
render_mode diffuse_burley, specular_schlick_ggx;
uniform sampler2D tex : source_color, filter_linear_mipmap_anisotropic, repeat_enable;
uniform sampler2D nrm : hint_normal, filter_linear_mipmap_anisotropic, repeat_enable;
uniform vec3 base : source_color = vec3(0.6, 0.58, 0.54);
uniform float contrast = 0.35;    // 0: flat base colour, 1: the texture as it is
uniform float scale = 0.12;       // texture repeats per metre
uniform float bump = 0.4;
uniform float rough = 0.9;
uniform float courses = 0.0;      // > 0: mortar lines every `courses` metres (stone walls)

varying vec3 wp;
varying vec3 wn;
void vertex() {
	wp = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	wn = normalize((MODEL_MATRIX * vec4(NORMAL, 0.0)).xyz);
}

void fragment() {
	vec3 bw = pow(abs(wn), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
	vec3 t = texture(tex, wp.zy * scale).rgb * bw.x + texture(tex, wp.xz * scale).rgb * bw.y + texture(tex, wp.xy * scale).rgb * bw.z;
	float lum = dot(t, vec3(0.333));
	float mean = dot(textureLod(tex, vec2(0.5), 10.0).rgb, vec3(0.333));
	vec3 c = base * mix(1.0, lum / max(mean, 0.05), contrast);
	if (courses > 0.0) {   // dressed stone: horizontal mortar courses and staggered joints, on the walls only
		float row = floor(wp.y / courses);
		float along = (bw.x > bw.z ? wp.z : wp.x) / (courses * 1.9) + 0.5 * mod(row, 2.0);
		float m = smoothstep(0.90, 0.96, abs(fract(wp.y / courses) - 0.5) * 2.0);   // 1 at a bed joint
		float j = smoothstep(0.94, 0.98, abs(fract(along) - 0.5) * 2.0);            // 1 at a head joint
		c *= mix(1.0, 0.72, max(m, j) * (1.0 - bw.y));
	}
	ALBEDO = c;
	ROUGHNESS = rough;
	vec3 n = texture(nrm, wp.zy * scale).rgb * bw.x + texture(nrm, wp.xz * scale).rgb * bw.y + texture(nrm, wp.xy * scale).rgb * bw.z;
	NORMAL_MAP = n;
	NORMAL_MAP_DEPTH = bump;
}
