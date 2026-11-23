class_name TownGen
extends RefCounted
## LOOK2: towns as places for the generated province (GenField). Each engine town gets a street grid turned to its own angle, a main street
## and a cross street, a square with a hall at the centre, terraces and shop blocks near the square, houses with gardens further out, and
## street lamps along every street. Every building carries an energy index (the engine's shed share darkens whole districts: the index runs
## round the town by angle, so a 21 % shed is a 21 % wedge of streets) and its distance from the centre (lights come on and go out in a
## wave outward from the substation). Presentation only.

## Returns {places: [[x, z, w, d, h, rot, town_id, idx, big, dn]], streets: [[a: Vector2, b: Vector2, width]], lamps: [[Vector3, town_id, dn]],
## centres: [[Vector2, town_id, rot]]}.
static func build(gf: GenField, model: Dictionary, quality: String, ground: Callable) -> Dictionary:
	var places: Array = []; var streets: Array = []; var lamps: Array = []; var centres: Array = []
	var block := 70.0 if quality == "high" else (85.0 if quality == "medium" else 110.0)
	var keep_k := 1.0 if quality == "high" else (0.8 if quality == "medium" else 0.5)
	for ti in model.towns.size():
		var tw: Dictionary = model.towns[ti]
		var c: Vector2 = gf.towns[ti].c; var r: float = gf.towns[ti].r * 1.45   # the grid covers the ribbon; houses keep inside the wandering edge (gf.town_dn)
		var id := str(tw.id); var count := maxi(1, int(tw.count))
		var rot := TAU * WorldMath.hash2(ti, 7, 901)
		var ax := Vector2(cos(rot), sin(rot)); var ay := Vector2(-ax.y, ax.x)
		centres.append([c, id, rot])
		var n := int(r / block)
		for dir in 2:   # streets along ax (dir 0) and along ay (dir 1), every `block` metres
			var along: Vector2 = ax if dir == 0 else ay; var across: Vector2 = ay if dir == 0 else ax
			for k in range(-n, n + 1):
				var off := k * block
				var half := sqrt(maxf(0.0, r * r - off * off)) * (0.8 + 0.25 * WorldMath.hash2(ti, k + 50 * dir, 902))
				var main := k == 0
				var lim := 1.25 if main else 0.95   # streets end at the town's edge, each end on its own; the main street runs on a little
				var ha := half; var hb := half
				while ha > 0.0 and gf.town_dn(ti, c + across * off - along * ha) > lim: ha -= 10.0
				while hb > 0.0 and gf.town_dn(ti, c + across * off + along * hb) > lim: hb -= 10.0
				if ha + hb < block * 1.2: continue
				half = maxf(ha, hb)
				var a := c + across * off - along * ha; var b := c + across * off + along * hb
				streets.append([a, b, 11.0 if main else 7.0, ti])
				# houses on both sides, every 12-15 m, set back from the kerb; lamps every 34 m
				var s := -half + 8.0
				var q := 0
				while s < half - 8.0:
					var step := 12.0 + 3.5 * WorldMath.hash2(ti * 31 + k, q, 903 + dir)
					var mid := s + step * 0.5; s += step; q += 1
					if absf(fposmod(mid + block * 0.5, block) - block * 0.5) < 9.0: continue   # leave the crossings open
					for sd2 in [-1.0, 1.0]:
						var side: float = sd2
						var hh := WorldMath.hash2(ti * 131 + k * 7 + q, int(side) + 3 * dir, 904)
						var p := c + across * off + along * mid + across * side * (9.0 + 3.0 * hh)
						var dn := gf.town_dn(ti, p)
						if dn > 1.0: continue
						if p.distance_to(c) < 34.0: continue   # the square
						var in_yard := false
						for f in gf.flats: if (f.c as Vector2).distance_to(p) < float(f.r) * 0.5 + 18.0: in_yard = true
						if in_yard: continue   # yards and plants stay clear
						var keep := lerpf(0.97, 0.3, pow(dn, 1.4)) * keep_k
						if WorldMath.hash2(ti * 17 + k, q * 2 + int(side > 0), 905 + dir) > keep: continue
						var core := dn < 0.28
						var w := (8.0 + 5.0 * hh) if not core else (12.0 + 8.0 * hh)
						var dd := 7.0 + 3.0 * WorldMath.hash2(q, k, 906)
						var h := (5.0 + 3.0 * WorldMath.hash2(k, q, 907)) if not core else (8.5 + 6.0 * WorldMath.hash2(k, q, 908))
						if count >= 26 and dn < 0.16 and hh > 0.55:   # the capital's skyline: a few office and flat towers round the square
							w = 16.0 + 8.0 * hh; dd = 14.0 + 6.0 * WorldMath.hash2(k, q, 910); h = 20.0 + 26.0 * WorldMath.hash2(q, k, 911)
						var ang := atan2(-along.y, along.x)
						var idx := int(fposmod(atan2((p - c).y, (p - c).x) - rot, TAU) / TAU * count) % count
						places.append([p.x, p.y, w, dd, h, ang + (WorldMath.hash2(q, k, 909) - 0.5) * 0.06, id, idx, (core and hh > 0.4) or h > 19.0, dn])
				var ls := -half + 15.0; var lq := 0
				while ls < half - 10.0:
					var side2 := 1.0 if lq % 2 == 0 else -1.0
					var lp := c + across * off + along * ls + across * side2 * 4.5
					if gf.town_dn(ti, lp) < 1.05: lamps.append([Vector3(lp.x, ground.call(lp.x, lp.y) + 7.0, lp.y), id, gf.town_dn(ti, lp)])
					ls += 34.0; lq += 1
	return {"places": places, "streets": streets, "lamps": lamps, "centres": centres}

## Road surfaces: a ribbon a little above the ground, sampled every 20 m so it follows the land.
## A warm disc per town (the lit core seen from far away): a fan, COLOR.a = town index, UV.x = 0 at the centre and 1 at the rim.
static func core_mesh(centres: Array, radii: Array, ground: Callable, gf: GenField = null) -> ArrayMesh:
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES); st.set_normal(Vector3.UP)
	for k in centres.size():
		var c: Vector2 = centres[k][0]; var r: float = radii[k] * 1.1; var ti: int = k
		var y: float = float(ground.call(c.x, c.y)) + 3.0
		for s in 48:
			var a0 := TAU * s / 48.0; var a1 := TAU * (s + 1) / 48.0
			var r0 := r; var r1 := r
			if gf != null: r0 = gf.town_edge(ti, a0) * 1.05; r1 = gf.town_edge(ti, a1) * 1.05   # the glow follows the town's own edge
			for pt: Array in [[c, 0.0], [c + Vector2(cos(a0), sin(a0)) * r0, 1.0], [c + Vector2(cos(a1), sin(a1)) * r1, 1.0]]:
				st.set_color(Color(0, 0, 0, float(ti) / 63.0)); st.set_uv(Vector2(pt[1], 0)); st.add_vertex(Vector3(pt[0].x, y, pt[0].y))
	return st.commit()

static func street_mesh(streets: Array, ground: Callable) -> ArrayMesh:
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	st.set_normal(Vector3.UP)
	for sd in streets:
		var a: Vector2 = sd[0]; var b: Vector2 = sd[1]; var w: float = sd[2]
		var d := (b - a).normalized(); var o := Vector2(-d.y, d.x) * w * 0.5
		var n := maxi(1, int(a.distance_to(b) / 20.0))
		for k in n:
			var p0 := a.lerp(b, float(k) / n); var p1 := a.lerp(b, float(k + 1) / n)
			var v := [Vector3(p0.x + o.x, 0, p0.y + o.y), Vector3(p1.x + o.x, 0, p1.y + o.y), Vector3(p1.x - o.x, 0, p1.y - o.y), Vector3(p0.x - o.x, 0, p0.y - o.y)]
			for vi in 4: v[vi].y = ground.call(v[vi].x, v[vi].z) + 0.18
			var lat := o.normalized(); var ti := int(sd[3]) if sd.size() > 3 else 0
			for idx in [0, 1, 2, 0, 2, 3]:   # COLOR: lateral direction (rg), side (b), town index (a): the street shader widens far streets and lights them by town
				st.set_color(Color(lat.x * 0.5 + 0.5, lat.y * 0.5 + 0.5, 1.0 if idx < 2 else 0.0, float(ti) / 63.0))
				st.set_uv(Vector2(0.0 if idx < 2 or idx == 3 else 1.0, 1.0 if w > 9.0 else 0.0)); st.add_vertex(v[idx])   # UV.y: a main street
	return st.commit()
