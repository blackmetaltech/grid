class_name GenField
extends TerrainField
## LOOK2: the ground for grid levels that have no engine terrain (chapters 5-7, the L28 finale). Render-only and seeded by the level id: hills
## rising to the north-west, a river from the hills to the sea, a coast in the east with the island, forests and fields. The engine's buses
## decide where towns stand (their size follows the town's house count, which WorldModel takes from the bus's peak MW), and the land is
## flattened under every town and yard. Distances are drawn at `tm` metres per engine tile, a presentation scale (docs/LOOK2.md); every
## number on screen still comes from the engine.

var river: PackedVector2Array = PackedVector2Array()   # metres
var coast_x := 0.0                                     # metres: sea east of this line (with a wobble)
var towns: Array = []                                  # [{c: Vector2 m, r: float m}]
var flats: Array = []                                  # [{c, r}] yards and plants: flat ground
var n_gen := FastNoiseLite.new()
var kinds_str := PackedStringArray()                   # per engine tile, for the town flood fill ("town" or "field")
var _bk := {}                                          # Vector2i(3 km cell) -> [towns idx], [flats idx] whose influence reaches it
const BK := 3000.0
var _hc := PackedFloat32Array(); var _hc_r := Rect2(); var _hc_s := 100.0; var _hc_nx := 0; var _hc_nz := 0

func _init(model: Dictionary, tile_vis_m: float) -> void:
	super({"cols": int(model.map.x), "rows": int(model.map.y), "tile_m": tile_vis_m, "kinds": PackedStringArray(), "elev": PackedFloat32Array()}, model.map, Vector2(-999, -999))
	n_gen.seed = hash(str(model.level)) & 0xffff; n_gen.frequency = 1.0 / 9000.0; n_gen.fractal_octaves = 5
	coast_x = (W - 6.5) * tm
	if str(model.level) != "L28":   # 1.16: only the finale has an island town; elsewhere the coast stays east of every town and substation (L07's mill sat on a disc in the sea)
		for t in (model.get("towns", []) as Array) + (model.get("subs", []) as Array):
			var tp = t.pos; var tx: float = float(tp.x) if tp is Vector2 else float(tp[0])
			coast_x = maxf(coast_x, (tx + 6.0) * tm)
	# the river: from the north-western hills, past the towns in the middle, out to the eastern sea
	for p in [Vector2(4, 2), Vector2(18, 9), Vector2(36, 17), Vector2(50, 29), Vector2(66, 33), Vector2(80, 33), Vector2(W, 31)]: river.append(p * tm)
	for t in model.towns:
		var r := 220.0 + float(t.count) * 14.0   # metres: a 40-house town (the largest load) is about 1.6 km across
		towns.append({"c": (Vector2(t.pos) + Vector2(0.5, 0.5)) * tm, "r": r})
	for s in model.subs: flats.append({"c": (Vector2(s.pos) + Vector2(0.5, 0.5)) * tm, "r": 120.0})
	for u in model.units: flats.append({"c": (Vector2(u.pos) + Vector2(0.5, 0.5)) * tm, "r": 450.0})
	for ti in towns.size(): _bucket(towns[ti].c, towns[ti].r * 2.4 * 1.45, 0, ti)   # the ribbon reaches 1.45 r
	for fi in flats.size(): _bucket(flats[fi].c, flats[fi].r * 3.0, 1, fi)
	kinds_str.resize(W * H2); kind.resize(W * H2); base.resize(W * H2)
	for j in H2:
		for i in W:
			var c := (Vector2(i, j) + Vector2(0.5, 0.5)) * tm
			var k := K_GRASS
			if _sea_depth(c.x, c.y) > 0.0: k = K_SEA
			else:
				for ti in towns.size():
					if town_dn(ti, c) < 1.0: k = K_TOWN
			kind[j * W + i] = k; kinds_str[j * W + i] = "town" if k == K_TOWN else "field"

func _bucket(c: Vector2, r: float, which: int, idx: int) -> void:
	for bj in range(floori((c.y - r) / BK), floori((c.y + r) / BK) + 1):
		for bi in range(floori((c.x - r) / BK), floori((c.x + r) / BK) + 1):
			var key := Vector2i(bi, bj)
			if not _bk.has(key): _bk[key] = [[], []]
			_bk[key][which].append(idx)

func _near(x: float, z: float) -> Array:
	return _bk.get(Vector2i(floori(x / BK), floori(z / BK)), [[], []])

## Fill the height cache over `r` at `s` metres (Province3D calls it before building meshes): afterwards height() inside r is a bilinear lookup.
func cache_heights(r: Rect2, s: float) -> void:
	_hc_r = Rect2(); _hc_s = s
	var nx := int(ceil(r.size.x / s)) + 1; var nz := int(ceil(r.size.y / s)) + 1
	var hc := height_grid(r.position.x, r.position.y, s, nx, nz)   # parallel rows (1.18)
	_hc = hc; _hc_nx = nx; _hc_nz = nz; _hc_r = r

## Depth of the sea at a point (> 0 in the sea), with a wobbling coast and the island round Saltmarsh (the easternmost town).
func _sea_depth(x: float, z: float) -> float:
	var cx := coast_x + n_coast.get_noise_2d(x * 0.3, z * 0.3) * 3.0 * tm - maxf(0.0, z - size_m.y * 0.5) * 0.08
	var d := x - cx
	for ti in _near(x, z)[0]:   # towns stay on land; an offshore town makes an island
		var t: Dictionary = towns[ti]
		var dd: float = (t.c as Vector2).distance_to(Vector2(x, z))
		if dd < t.r * 1.7: d = minf(d, -(t.r * 1.7 - dd) * 0.6)
	return d * 0.004 if d > 0.0 else 0.0

func _river_dist(x: float, z: float) -> float:
	var p := Vector2(x, z); var best := 1e12
	for k in river.size() - 1:
		var a := river[k]; var b := river[k + 1]; var ab := b - a
		var t := clampf((p - a).dot(ab) / ab.length_squared(), 0.0, 1.0)
		best = minf(best, p.distance_to(a + ab * t))
	return best + n_detail.get_noise_2d(x * 0.05, z * 0.05) * 60.0

## 1.17 (manager): towns are not circles. A town's edge wanders (three low harmonics, each town its own phases) and runs out along its main
## street, the way a village grows along its road. `town_dn` is the distance from the centre over that edge (1.0 on the edge). TownGen uses the
## same main-street angle (hash 901), so the ribbon follows the town's own road.
func town_edge(ti: int, ang: float) -> float:
	var rot := TAU * WorldMath.hash2(ti, 7, 901)
	var f := 0.8 + 0.14 * sin(2.0 * ang + TAU * WorldMath.hash2(ti, 1, 931)) + 0.09 * sin(3.0 * ang + TAU * WorldMath.hash2(ti, 2, 932)) + 0.06 * sin(5.0 * ang + TAU * WorldMath.hash2(ti, 3, 933))
	var ribbon := 1.0 + 0.45 * pow(absf(cos(ang - rot)), 8.0)
	return float(towns[ti].r) * f * ribbon
func town_dn(ti: int, p: Vector2) -> float:
	var d := p - (towns[ti].c as Vector2)
	return d.length() / town_edge(ti, atan2(d.y, d.x))

func _flat_k(x: float, z: float) -> float:
	var k := 1.0; var p := Vector2(x, z); var nb := _near(x, z)
	for ti in nb[0]: k = minf(k, smoothstep(0.9, 2.2, town_dn(ti, p)))
	for fi in nb[1]: k = minf(k, smoothstep(flats[fi].r, flats[fi].r * 3.0, p.distance_to(flats[fi].c)))
	return k

func inside(x: float, z: float) -> bool: return x >= 0.0 and z >= 0.0 and x <= size_m.x and z <= size_m.y

func height(x: float, z: float) -> float:
	if _hc_r.size.x > 0.0 and _hc_r.has_point(Vector2(x, z)):
		var u := (x - _hc_r.position.x) / _hc_s; var v := (z - _hc_r.position.y) / _hc_s
		var i := mini(int(u), _hc_nx - 2); var j := mini(int(v), _hc_nz - 2); var fu := u - i; var fv := v - j
		return lerpf(lerpf(_hc[j * _hc_nx + i], _hc[j * _hc_nx + i + 1], fu), lerpf(_hc[(j + 1) * _hc_nx + i], _hc[(j + 1) * _hc_nx + i + 1], fu), fv)
	var sea := _sea_depth(x, z)
	if sea > 0.0: return -minf(40.0, 2.0 + sea * 6.0)
	var nw := clampf(1.0 - (x / size_m.x) * 0.9 - (z / size_m.y) * 0.5, 0.0, 1.0)   # higher to the north-west
	var hills := (n_gen.get_noise_2d(x, z) * 0.5 + 0.5)
	var ridge := (n_ridge.get_noise_2d(x * 2.2, z * 2.2) * 0.5 + 0.5)
	var u := x / size_m.x; var v := z / size_m.y
	var band := smoothstep(0.32, 0.0, absf(v - 0.22 - 0.08 * sin(u * 7.0))) * smoothstep(0.85, 0.35, u)   # a range across the north
	var big := clampf(size_m.x / 30000.0, 0.3, 1.0)   # a small map (a mill town) gets low hills, not a 900 m peak
	var h := 22.0 + hills * 150.0 * (0.5 + nw) * big + ridge * ridge * (950.0 * nw * nw + 600.0 * band) * big * big   # drawn steeper than life (manager review 1.15; the scale note says so)
	var shore := clampf((coast_x - x) / (2.5 * tm), 0.0, 1.0)
	h *= sqrt(shore)   # the land meets the sea in cliffs where it is high
	var rd := _river_dist(x, z)
	if rd < 900.0: h = lerpf(RIVER_LEVEL - 2.6, h, smoothstep(55.0, 900.0, rd))   # a valley down to the water
	var flat := _flat_k(x, z)
	h = lerpf(18.0 * shore + 4.0, h, flat)   # towns and yards stand on level ground
	return h + n_detail.get_noise_2d(x, z) * 1.2 * flat

func river_surface(x: float, z: float) -> float:
	return RIVER_LEVEL if _river_dist(x, z) < 60.0 else NAN

func kind_at_tile(i: int, j: int) -> int:
	return kind[clampi(j, 0, H2 - 1) * W + clampi(i, 0, W - 1)]

func splat(x: float, z: float, h: float) -> Array:
	var w := PackedFloat32Array([0, 0, 0, 0, 0, 0, 0, 0, 0])
	if h < 2.4: w[K_SAND] = 1.0
	else:
		var p := Vector2(x, z)
		var town := 0.0
		for ti in _near(x, z)[0]: town = maxf(town, 1.0 - smoothstep(0.7, 1.05, town_dn(ti, p)))
		var fo := n_hills.get_noise_2d(x * 2.4, z * 2.4)
		var forest := smoothstep(0.05, 0.25, fo) * (1.0 - town) * _flat_k(x, z)
		var rock := smoothstep(440.0, 720.0, h)
		w[K_FOREST] = forest * (1.0 - rock); w[K_ROCK] = rock; w[K_GRASS] = (1.0 - forest) * (1.0 - rock) * (1.0 - town * 0.2)
		w[K_PAVED] = town * 0.2   # 1.18: gardens, not a pale disc round the town (lead's art review)
		if _river_dist(x, z) < 120.0: w[K_MUD] = 0.6
	return [Color(w[K_GRASS], w[K_FOREST], w[K_ROCK], w[K_SAND]), Vector2(w[K_MUD], w[K_PAVED])]

func maybe_forest(x: float, z: float) -> bool: return n_hills.get_noise_2d(x * 2.4, z * 2.4) > 0.15

func is_forest(x: float, z: float, h: float) -> bool:
	if h < 3.0 or h > 380.0: return false
	var fo := smoothstep(0.05, 0.25, n_hills.get_noise_2d(x * 2.4, z * 2.4))
	if fo <= 0.5: return false   # 1.18: the cheap noise test first; most of the map is not forest (finale load)
	var p := Vector2(x, z)
	for ti in _near(x, z)[0]: if town_dn(ti, p) < 1.2: return false
	return fo * _flat_k(x, z) > 0.5

## The river as a ribbon of water quads along its polyline, 110 m wide.
func river_mesh() -> ArrayMesh:
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	st.set_normal(Vector3.UP)
	for k in river.size() - 1:
		var a := river[k]; var b := river[k + 1]
		var n := int(a.distance_to(b) / 200.0) + 1
		for q in n:
			var p0 := a.lerp(b, float(q) / n); var p1 := a.lerp(b, float(q + 1) / n)
			var d := (p1 - p0).normalized(); var o := Vector2(-d.y, d.x) * 70.0
			var y := RIVER_LEVEL
			var v := [Vector3(p0.x + o.x, y, p0.y + o.y), Vector3(p1.x + o.x, y, p1.y + o.y), Vector3(p1.x - o.x, y, p1.y - o.y), Vector3(p0.x - o.x, y, p0.y - o.y)]
			for idx in [0, 2, 1, 0, 3, 2]: st.add_vertex(v[idx])   # 1128c C03: faces up (it faced down and the water shader culls it away)
	return st.commit()
