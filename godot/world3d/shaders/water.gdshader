// GRID LOOK2 water (sea and river): colour by depth (the depth buffer behind the surface), two scrolling normal noises, fresnel, shore foam.
shader_type spatial;
render_mode blend_mix, depth_draw_always, cull_back, diffuse_burley, specular_schlick_ggx;

uniform sampler2D depth_tex : hint_depth_texture, filter_linear;
uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;
uniform sampler2D wave_a : hint_normal, filter_linear_mipmap, repeat_enable;
uniform sampler2D wave_b : hint_normal, filter_linear_mipmap, repeat_enable;
uniform vec3 shallow : source_color = vec3(0.18, 0.42, 0.42);
uniform vec3 deep : source_color = vec3(0.02, 0.08, 0.13);
uniform float flow_x = 0.0;
uniform float flow_z = 0.0;
uniform float scale = 1.0;
uniform float night = 0.0;

varying vec3 wpos;
void vertex() { wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz; }

void fragment() {
	vec2 uv = wpos.xz / (90.0 * scale);
	vec2 fl = vec2(flow_x, flow_z) * TIME;
	vec3 na = texture(wave_a, uv + vec2(0.012, 0.007) * TIME + fl).rgb;
	vec3 nb = texture(wave_b, uv * 2.7 - vec2(0.009, 0.013) * TIME + fl * 1.7).rgb;
	NORMAL_MAP = normalize(mix(na, nb, 0.5));
	NORMAL_MAP_DEPTH = 0.55;
	float d = texture(depth_tex, SCREEN_UV).r;
	vec4 ndc = vec4(SCREEN_UV * 2.0 - 1.0, d, 1.0);
	vec4 vw = INV_PROJECTION_MATRIX * ndc; vw.xyz /= vw.w;
	float thick = clamp(VERTEX.z - vw.z, 0.0, 400.0);
	float k = 1.0 - exp(-thick * 0.09);
	vec3 col = mix(shallow, deep, k);
	float foam = (1.0 - smoothstep(0.0, 1.6, thick)) * (0.55 + 0.45 * texture(wave_b, uv * 9.0 + TIME * 0.05).r);
	col = mix(col, vec3(0.85, 0.9, 0.92), foam * 0.5 * (1.0 - night * 0.7));
	float fres = pow(1.0 - clamp(dot(NORMAL, VIEW), 0.0, 1.0), 4.0);
	ALBEDO = col;
	ALPHA = clamp(0.55 + 0.45 * k + fres * 0.3, 0.0, 1.0);
	ROUGHNESS = mix(0.06, 0.42, night);   // a rougher sea at night: the moon path was a hard white slab (art review 1.15)
	METALLIC = 0.0;
	SPECULAR = mix(0.55, 0.18, night);
}
