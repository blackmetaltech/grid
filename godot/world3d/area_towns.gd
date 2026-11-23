class_name AreaTowns
extends RefCounted
## 1.18 (DECISIONS 25): the engine-terrain levels (chapter 2's Mainland: L05, L29, L30) draw their towns with TownGen's grown streets, like the
## generated province. This gives TownGen what it reads from a GenField, built from the engine's own town tiles: each model town gets the town
## tiles nearest it, a centre and a radius; `town_dn` is under 1 only on those tiles, so streets and houses never leave the engine's town (the
## tiles a line may not cross in L29). Rivers come from the engine's river tiles; substations are kept clear as yards.

var towns: Array = []                   # per model town: {c: Vector2 m, r: float m, tiles: Dictionary of Vector2i}
var flats: Array = []                   # [{c, r}]
var river := PackedVector2Array()       # no polyline: river tiles answer river_surface
var tm := 50.0
var field = null                        # the TerrainField

func _init(f, model: Dictionary, areas: Array) -> void:
	field = f; tm = f.tm
	for t in model.towns: towns.append({"c": ((t.pos as Vector2) + Vector2(0.5, 0.5)) * tm, "r": 0.0, "tiles": {}})
	for tiles in areas:
		var c := Vector2.ZERO
		for t in tiles: c += Vector2(t) + Vector2(0.5, 0.5)
		c /= float(maxi(1, tiles.size()))
		var best := -1; var bd := 1e9
		for k in model.towns.size():
			var d := ((model.towns[k].pos as Vector2) + Vector2(0.5, 0.5)).distance_to(c)
			if d < bd: bd = d; best = k
		if best < 0: continue
		for t in tiles: towns[best].tiles[t] = true
	for tw in towns:
		if tw.tiles.is_empty(): continue
		var c := Vector2.ZERO
		for t in tw.tiles: c += Vector2(t) + Vector2(0.5, 0.5)
		c = c / float(tw.tiles.size()) * tm
		var r := 0.0
		for t in tw.tiles: r = maxf(r, ((Vector2(t) + Vector2(0.5, 0.5)) * tm).distance_to(c))
		tw.c = c; tw.r = (r + tm * 0.7) / 1.45   # TownGen grows the reach by 1.45
	for s in model.subs: flats.append({"c": ((s.pos as Vector2) + Vector2(0.5, 0.5)) * tm, "r": 30.0})

func town_dn(ti: int, p: Vector2) -> float:
	var tw: Dictionary = towns[ti]
	if tw.tiles.is_empty(): return 9.0
	var t := Vector2i(int(floorf(p.x / tm)), int(floorf(p.y / tm)))
	if not tw.tiles.has(t): return 1.5
	return clampf(p.distance_to(tw.c) / maxf(1.0, float(tw.r) * 1.45), 0.0, 0.97)

func town_edge(ti: int, _ang: float) -> float: return float(towns[ti].r) * 1.45

func river_surface(x: float, z: float) -> float: return field.river_surface(x, z)

func _river_dist(x: float, z: float) -> float:
	return 0.0 if not is_nan(field.river_surface(x, z)) else 1e9
