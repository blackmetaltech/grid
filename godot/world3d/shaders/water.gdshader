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
uniform bool use_sky_col = false;   // 1.18: the bay passes the sky's own horizon colour, so the far sea meets the sky without a hard line
uniform vec3 sky_col : source_color = vec3(0.52, 0.68, 0.86);
uniform int ssr_steps = 0;      // 1.18: >0 marches the reflected ray through the depth buffer, so land, homes and lamps show in the water (high and medium)
uniform float surf = 0.0;       // 1.18: >0 draws surf lines running in to the shore (the bay)

// The reflected view ray, marched in view space against the depth buffer: returns the screen colour it hits (a = strength, 0 on a miss).
vec4 ssr(vec3 vpos, vec3 vn, sampler2D dt, sampler2D st, mat4 proj, mat4 iproj) {
	vec3 r = reflect(normalize(vpos), vn);
	if (r.z > 0.25) return vec4(0.0);   // towards the camera: nothing on screen to reflect
	float t = 0.6 + 0.01 * length(vpos);
	for (int i = 0; i < 48; i++) {
		if (i >= ssr_steps) break;
		vec3 p = vpos + r * t;
		vec4 c = proj * vec4(p, 1.0);
		vec2 uv = c.xy / c.w * 0.5 + 0.5;
		if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
		float d = texture(dt, uv).r;
		vec4 sv = iproj * vec4(uv * 2.0 - 1.0, d, 1.0); sv.xyz /= sv.w;
		float behind = sv.z - p.z;   // > 0: the ray is behind the scene there
		if (behind > 0.0 && behind < t * 0.35 + 2.0) {
			vec2 e = smoothstep(vec2(0.0), vec2(0.08), uv) * smoothstep(vec2(0.0), vec2(0.08), 1.0 - uv);
			return vec4(textureLod(st, uv, 1.5).rgb, e.x * e.y * (1.0 - float(i) / float(ssr_steps)) * 0.85 + 0.15);
		}
		t *= 1.22;
	}
	return vec4(0.0);
}

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
	vec3 sky = use_sky_col ? sky_col : mix(vec3(0.52, 0.68, 0.86), vec3(0.03, 0.05, 0.09), night);   // 1.17: the sky in the water at grazing angles (blue by day)
	float sw = 0.0;
	if (surf > 0.0) {   // lines of surf running in over the shallows, broken by the wave noise; strongest where the water is thinnest
		float band = sin(thick * 2.4 - TIME * 1.3 + texture(wave_a, uv * 3.0).r * 5.0);
		sw = smoothstep(0.82, 0.97, band) * (1.0 - smoothstep(0.4, 3.2, thick)) * smoothstep(0.05, 0.3, thick) * surf;
		col = mix(col, vec3(0.92, 0.95, 0.96), sw * (1.0 - night * 0.6));
	}
	float rf = clamp(fres * 1.6, 0.0, 0.7);
	col = mix(col, sky, rf);
	float refl = 0.0;
	if (ssr_steps > 0) {
		vec3 vn = normalize(NORMAL + (VIEW_MATRIX * vec4(na.x + nb.x - 1.0, 0.0, na.y + nb.y - 1.0, 0.0)).xyz * 0.07);   // the ripples wobble the image a little
		vec4 hit = ssr(VERTEX, vn, depth_tex, screen_tex, PROJECTION_MATRIX, INV_PROJECTION_MATRIX);
		refl = hit.a * clamp(0.35 + fres * 1.4, 0.0, 0.9) * (1.0 - sw);
		EMISSION = hit.rgb * refl * 0.9;   // the screen is already lit: the reflection is added as light, not re-shaded
	}
	ALBEDO = col * (1.0 - refl);
	ALPHA = clamp(max(0.55 + 0.45 * k + fres * 0.3, refl), 0.0, 1.0);
	ROUGHNESS = mix(0.06, 0.42, night);   // a rougher sea at night: the moon path was a hard white slab (art review 1.15)
	METALLIC = 0.0;
	SPECULAR = mix(0.55, 0.18, night);
}
