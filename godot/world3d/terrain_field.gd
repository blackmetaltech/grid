class_name TerrainField
extends RefCounted
## LOOK2: the ground as a continuous height field (metres) built from the engine's terrain map (WorldModel.terrain_of: tile kinds and
## elevations at tile centres). Inside the map the height is the engine's elevation, bilinear between tile centres, with under a metre of
## detail noise, so a line's clearance on screen is the clearance the engine judged. Water is carved: sea beds deepen with distance from
## the shore, rivers sit 2.5 m below their high-water level. Outside the map the land carries on (hills to the west, forest to the north,
## farmland to the east, sea to the south) so no edge is ever visible. Pure data; nothing here knows the engine's physics.

const K_GRASS := 0
const K_FOREST := 1
const K_ROCK := 2
const K_SAND := 3
const K_MUD := 4
const K_PAVED := 5
const K_SEA := 6
const K_RIVER := 7
const K_TOWN := 8           # town blocks: gardens and paving
const KIND_CODE := {"field": K_GRASS, "forest": K_FOREST, "rock": K_ROCK, "sand": K_SAND, "swamp": K_MUD, "town": K_TOWN, "road": K_PAVED, "sea": K_SEA, "river": K_RIVER}
const RIVER_LEVEL := 1.7      # water surface of the river, m (the engine's high-water level is 2 m)

var W := 0                    # tiles
var H := 0                    # rows of the engine map
var H2 := 0                   # rows including open sea / island rows south of it (L30)
var tm := 50.0                # metres per tile
var base := PackedFloat32Array()   # W x H2 heights at tile centres, m
var kind := PackedByteArray()      # W x H2 kind codes
var island_c := Vector2(-999, -999)   # tiles
var n_detail := FastNoiseLite.new()
var n_hills := FastNoiseLite.new()
var n_ridge := FastNoiseLite.new()
var n_coast := FastNoiseLite.new()
var size_m := Vector2.ZERO

func _init(T: Dictionary, map: Vector2, ic: Vector2) -> void:
	W = int(T.cols); H = int(T.rows); H2 = maxi(H, int(map.y)); tm = float(T.tile_m)
	island_c = ic
	size_m = Vector2(W, H2) * tm
	for n in [n_detail, n_hills, n_ridge, n_coast]: (n as FastNoiseLite).seed = 1789
	n_detail.frequency = 1.0 / 55.0; n_detail.fractal_octaves = 3
	n_hills.frequency = 1.0 / 2600.0; n_hills.fractal_octaves = 5
	n_ridge.frequency = 1.0 / 3400.0; n_ridge.fractal_octaves = 5; n_ridge.fractal_type = FastNoiseLite.FRACTAL_RIDGED
	n_coast.frequency = 1.0 / 900.0; n_coast.fractal_octaves = 3
	var kinds: PackedStringArray = T.kinds; var elev: PackedFloat32Array = T.elev
	base.resize(W * H2); kind.resize(W * H2)
	for j in H2:
		for i in W:
			var k := j * W + i
			if j < H:
				kind[k] = int(KIND_CODE.get(kinds[k], K_GRASS)); base[k] = elev[k]
			else:   # L30: open sea with the island round island_c
				var d := Vector2(i + 0.5, j + 0.5).distance_to(island_c)
				if d < 1.9: kind[k] = K_GRASS; base[k] = 2.5
				elif d < 2.9: kind[k] = K_SAND; base[k] = 1.0
				else: kind[k] = K_SEA; base[k] = 0.0
	# sea beds: multi-source BFS from the land tiles, 4.5 m deeper per tile of open water, at most 32 m
	var dist := PackedInt32Array(); dist.resize(W * H2); dist.fill(-1)
	var q: Array[int] = []
	for k in W * H2:
		if kind[k] != K_SEA: dist[k] = 0; q.append(k)
	var head := 0
	while head < q.size():
		var c := q[head]; head += 1
		var ci := c % W; var cj := c / W
		for d in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
			var ni: int = ci + d.x; var nj: int = cj + d.y
			if ni < 0 or nj < 0 or ni >= W or nj >= H2: continue
			var nk := nj * W + ni
			if dist[nk] >= 0: continue
			dist[nk] = dist[c] + 1; q.append(nk)
	for k in W * H2:
		if kind[k] == K_SEA: base[k] = -minf(32.0, 1.2 + 4.5 * float(dist[k]))
		elif kind[k] == K_RIVER: base[k] = RIVER_LEVEL - 2.6

func _at(i: int, j: int) -> float:
	return base[clampi(j, 0, H2 - 1) * W + clampi(i, 0, W - 1)]

func kind_at_tile(i: int, j: int) -> int:
	return kind[clampi(j, 0, H2 - 1) * W + clampi(i, 0, W - 1)]

## Bilinear between tile centres, clamped at the map edge.
func _bilinear(x: float, z: float) -> float:
	var u := x / tm - 0.5; var v := z / tm - 0.5
	var i := floori(u); var j := floori(v); var fu := u - i; var fv := v - j
	return lerpf(lerpf(_at(i, j), _at(i + 1, j), fu), lerpf(_at(i, j + 1), _at(i + 1, j + 1), fu), fv)

func inside(x: float, z: float) -> bool: return x >= 0.0 and z >= 0.0 and x <= size_m.x and z <= size_m.y

## Ground height (m) at world x (east) / z (south), metres.
func height(x: float, z: float) -> float:
	var cx := clampf(x, 0.0, size_m.x); var cz := clampf(z, 0.0, size_m.y)
	var dx := absf(x - cx); var dz := absf(z - cz); var d := sqrt(dx * dx + dz * dz)
	if d <= 0.0:
		var h := _bilinear(x, z)
		var k := kind_at_tile(int(x / tm), int(z / tm))
		var amp := 0.7
		if k == K_ROCK: amp = 2.2
		elif k == K_SEA or k == K_RIVER or k == K_PAVED or k == K_TOWN: amp = 0.25
		return h + n_detail.get_noise_2d(x, z) * amp
	# outside the map: the coast carries on east and west with a wobble, the land rises into hills (west), forest country (north), farms (east)
	var wob := n_coast.get_noise_2d(x, z) * minf(d / 600.0, 1.0) * 140.0
	var e := _bilinear(cx, clampf(z + wob, 0.0, size_m.y))
	if e < 0.0:   # sea: deepen offshore
		var off := maxf(0.0, z - size_m.y)
		return minf(e, -1.0) - off * 0.006 - minf(d, 3000.0) * 0.002
	var f := smoothstep(0.0, 1800.0, d)
	var hills := (n_hills.get_noise_2d(x, z) * 0.5 + 0.5)
	var add := 0.0
	if x < 0.0: add += (n_ridge.get_noise_2d(x, z) * 0.5 + 0.5) * 420.0 * smoothstep(0.0, 3500.0, -x) + (-x) * 0.015   # the western uplands
	if z < 0.0: add += hills * 190.0 * smoothstep(0.0, 3000.0, -z) + (n_ridge.get_noise_2d(x, z) * 0.5 + 0.5) * 160.0 * smoothstep(3000.0, 9000.0, -z)
	if x > size_m.x: add += hills * 45.0 * smoothstep(0.0, 3000.0, x - size_m.x)
	var land := smoothstep(0.5, 6.0, e)   # keep beaches low: hills only behind the coast
	return e + (add + hills * 12.0 * f) * land + n_detail.get_noise_2d(x, z) * 0.8

## Water surface at a point inside a river tile, else NAN.
func river_surface(x: float, z: float) -> float:
	if not inside(x, z): return NAN
	return RIVER_LEVEL if kind_at_tile(int(x / tm), int(z / tm)) == K_RIVER else NAN

## Splat weights at a point: [Color(grass, forest, rock, sand), Vector2(mud, paved)].
func splat(x: float, z: float, h: float) -> Array:
	var w := PackedFloat32Array([0, 0, 0, 0, 0, 0, 0, 0, 0])
	if inside(x, z):
		# bilinear blend of the four nearest tiles' one-hot kinds: soft borders, not tile squares
		var u := x / tm - 0.5; var v := z / tm - 0.5
		var i := floori(u); var j := floori(v); var fu := u - i; var fv := v - j
		for c in [[0, 0, (1 - fu) * (1 - fv)], [1, 0, fu * (1 - fv)], [0, 1, (1 - fu) * fv], [1, 1, fu * fv]]:
			var kk := kind_at_tile(i + int(c[0]), j + int(c[1]))
			if kk == K_SEA or kk == K_RIVER: kk = K_SAND if h > -1.5 else K_MUD
			if kk == K_TOWN: w[K_GRASS] += float(c[2]) * 0.55; w[K_PAVED] += float(c[2]) * 0.45
			else: w[kk] += float(c[2])
	else:
		if h < 2.2: w[K_SAND] = 1.0
		else:
			var fo := n_hills.get_noise_2d(x * 3.1, z * 3.1)
			var forest := 0.0
			if z < 0.0: forest = smoothstep(-0.25, 0.15, fo)
			elif x < 0.0: forest = smoothstep(-0.1, 0.3, fo)
			else: forest = smoothstep(0.25, 0.45, fo)
			w[K_FOREST] = forest; w[K_GRASS] = 1.0 - forest
			if h > 260.0: w[K_ROCK] = smoothstep(260.0, 380.0, h)
	return [Color(w[K_GRASS], w[K_FOREST], w[K_ROCK], w[K_SAND]), Vector2(w[K_MUD], w[K_PAVED])]

## Is a point forest (for tree scattering), inside or outside the map.
func is_forest(x: float, z: float, h: float) -> bool:
	if inside(x, z): return kind_at_tile(int(x / tm), int(z / tm)) == K_FOREST
	var s: Array = splat(x, z, h)
	return (s[0] as Color).g > 0.6

## A rectangular grid mesh of the field: step metres, with a skirt that drops 40 m at the border (hides the seam to the far mesh). `hole` (Rect2,
## metres) skips the quads fully inside it (the far mesh leaves the near area to the near mesh).
func grid_mesh(r: Rect2, step: float, hole: Rect2 = Rect2(), skirt := true) -> ArrayMesh:
	var nx := int(ceil(r.size.x / step)) + 1; var nz := int(ceil(r.size.y / step)) + 1
	var hs := PackedFloat32Array(); hs.resize(nx * nz)
	for j in nz:
		for i in nx: hs[j * nx + i] = height(r.position.x + i * step, r.position.y + j * step)
	var verts := PackedVector3Array(); var nrm := PackedVector3Array(); var cols := PackedColorArray(); var uv2 := PackedVector2Array()
	verts.resize(nx * nz); nrm.resize(nx * nz); cols.resize(nx * nz); uv2.resize(nx * nz)
	for j in nz:
		for i in nx:
			var k := j * nx + i
			var x := r.position.x + i * step; var z := r.position.y + j * step; var h := hs[k]
			verts[k] = Vector3(x, h, z)
			var hl := hs[j * nx + maxi(i - 1, 0)]; var hr := hs[j * nx + mini(i + 1, nx - 1)]
			var hu := hs[maxi(j - 1, 0) * nx + i]; var hd := hs[mini(j + 1, nz - 1) * nx + i]
			nrm[k] = Vector3(hl - hr, 2.0 * step, hu - hd).normalized()
			var s: Array = splat(x, z, h)
			cols[k] = s[0]; uv2[k] = s[1]
	var idx := PackedInt32Array()
	var has_hole := hole.size.x > 0.0
	for j in nz - 1:
		for i in nx - 1:
			if has_hole:
				var qr := Rect2(r.position.x + i * step, r.position.y + j * step, step, step)
				if hole.encloses(qr): continue
			var a := j * nx + i; var b := a + 1; var c := a + nx; var d := c + 1
			idx.append_array([a, b, c, b, d, c])
	if skirt:   # a curtain below the border
		var ring: Array[int] = []
		for i in nx: ring.append(i)
		for j in range(1, nz): ring.append(j * nx + nx - 1)
		for i in range(nx - 2, -1, -1): ring.append((nz - 1) * nx + i)
		for j in range(nz - 2, 0, -1): ring.append(j * nx)
		ring.append(0)
		for t in ring.size() - 1:
			var a0 := ring[t]; var b0 := ring[t + 1]
			var a1 := verts.size(); verts.append(verts[a0] - Vector3(0, 40, 0)); nrm.append(nrm[a0]); cols.append(cols[a0]); uv2.append(uv2[a0])
			var b1 := verts.size(); verts.append(verts[b0] - Vector3(0, 40, 0)); nrm.append(nrm[b0]); cols.append(cols[b0]); uv2.append(uv2[b0])
			idx.append_array([a0, a1, b0, b0, a1, b1, a0, b0, a1, b0, b1, a1])
	var arr := []; arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = verts; arr[Mesh.ARRAY_NORMAL] = nrm; arr[Mesh.ARRAY_COLOR] = cols; arr[Mesh.ARRAY_TEX_UV2] = uv2; arr[Mesh.ARRAY_INDEX] = idx
	var m := ArrayMesh.new(); m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	return m
