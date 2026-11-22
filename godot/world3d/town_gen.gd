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
		var c: Vector2 = gf.towns[ti].c; var r: float = gf.towns[ti].r
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
				if half < block * 0.6: continue
				var main := k == 0
				var a := c + across * off - along * half; var b := c + across * off + along * half
				streets.append([a, b, 11.0 if main else 7.0])
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
						var dn := p.distance_to(c) / r
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
					lamps.append([Vector3(lp.x, ground.call(lp.x, lp.y) + 7.0, lp.y), id, lp.distance_to(c) / r])
					ls += 34.0; lq += 1
	return {"places": places, "streets": streets, "lamps": lamps, "centres": centres}

## Road surfaces: a ribbon a little above the ground, sampled every 20 m so it follows the land.
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
			for idx in [0, 1, 2, 0, 2, 3]:
				st.set_uv(Vector2(0.0 if idx < 2 or idx == 3 else 1.0, 0.0)); st.add_vertex(v[idx])
	return st.commit()
