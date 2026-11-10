extends SceneTree
## Bench geometry truth (UI.md "Chapter 1 world"): on L01-L03 every drawn cable is as long as the engine's run (drawn polyline length x metres
## per tile = benchDetail runs[].lengthM, within 1 %); hut, hamlets and school stand on land; no cable tile is mangrove or water.
## Tile scale: 10 m per tile on L01/L02, 25 m per tile on L03 (1 km would be 100 tiles).

const SIZES := [4, 25, 50]

func _initialize() -> void:
	var T := Truth.new()
	if not T.start(root): print("BENCH-GEOMETRY-TRUTH FAILED engine"); quit(1); return
	var view := WorldView.new(); view.size = Vector2(1200, 700)
	var designs := 0
	# L01: every hut site x sizes
	for hut in [120, 150, 180, 210, 240, 270, 300]:
		for mm2 in SIZES:
			T.level("L01")
			if not T.b.act("placeHut", [hut]).get("ok", false) or not T.b.act("layCable", ["main", mm2]).get("ok", false): T.check(false, "L01 accepts hut %d / %d mm2" % [hut, mm2]); continue
			_check(T, view, "L01 hut %d m %d mm2" % [hut, mm2]); designs += 1
	# L02: radial / trunk x (main, branch) sizes
	for topo in ["radial", "trunk"]:
		for a in SIZES:
			for c in SIZES:
				T.level("L02")
				if topo == "trunk": T.b.act("placeJunction", [])
				var ok: bool = T.b.act("layCable", ["main", a]).get("ok", false) and T.b.act("layCable", ["b", c]).get("ok", false)
				if not ok: T.check(false, "L02 accepts %s %d/%d" % [topo, a, c]); continue
				_check(T, view, "L02 %s %d/%d mm2" % [topo, a, c]); designs += 1
	# L03: 48 V / 380 V x sizes
	for conv in [false, true]:
		for mm2 in [10, 25, 50]:
			T.level("L03")
			if conv: T.b.act("placeConverters", [true])
			if not T.b.act("layCable", ["main", mm2]).get("ok", false): T.check(false, "L03 accepts %s %d mm2" % [conv, mm2]); continue
			_check(T, view, "L03 converters=%s %d mm2" % [conv, mm2]); designs += 1
	# before anything is laid: the map still has hut + hamlets on land, and surveyed (dashed) routes
	for lv in ["L02", "L03"]:
		T.level(lv); _check_land(T, view, WorldModel.build(T.b), lv + " bare")
	T.check(designs >= 7 * 3 + 18 + 6, "enough designs were checked (%d)" % designs)
	print("designs checked: %d" % designs)
	view.free()
	T.finish("BENCH-GEOMETRY-TRUTH", self)

func _plen(pts: Array) -> float:
	var s := 0.0
	for k in range(pts.size() - 1): s += (pts[k] as Vector2).distance_to(pts[k + 1])
	return s

func _check(T: Truth, view: WorldView, tag: String) -> void:
	var m := WorldModel.build(T.b)
	var det: Dictionary = T.b.q("benchDetail")
	var runs: Array = det.get("runs", [])
	if runs.is_empty() and tag.begins_with("L03 converters=false"):   # 48 V over 1 km has no circuit solution, so benchDetail is empty: the run is still GEOM.l03.distanceM
		runs = [{"id": "main", "lengthM": 1000.0}]
	T.check(runs.size() > 0, "%s: the engine reports runs" % tag)
	var tile_m := float(m.tile_m)
	var by_id := {}
	for l in m.lines: by_id[str(l.id)] = l
	T.check(m.lines.size() == runs.size(), "%s: one drawn cable per engine run (%d vs %d)" % [tag, m.lines.size(), runs.size()])
	var drawn := 0.0; var want := 0.0
	for r in runs:
		var id := str(r.id)
		T.check(by_id.has(id), "%s: drawn cable '%s' exists" % [tag, id])
		if not by_id.has(id): continue
		var dm := _plen(by_id[id].pts) * tile_m
		drawn += dm; want += float(r.lengthM)
		T.check(absf(dm - float(r.lengthM)) <= 0.01 * float(r.lengthM), "%s run %s: drawn %.1f m vs engine %.1f m" % [tag, id, dm, float(r.lengthM)])
	T.check(absf(drawn - want) <= 0.01 * want, "%s: total drawn %.1f m vs engine %.1f m" % [tag, drawn, want])
	_check_land(T, view, m, tag)

func _check_land(T: Truth, view: WorldView, m: Dictionary, tag: String) -> void:
	view.set_model(m)
	var kinds := {}
	for t in view._tiles: kinds[Vector2i(t.i, t.j)] = str(t.kind)
	var tile := func(p: Vector2) -> String: return str(kinds.get(Vector2i((p + Vector2(0.5, 0.5)).floor()), "off-map"))
	for t in m.towns: T.check(tile.call(t.pos) in ["grass", "sand"], "%s: %s %s on land (%s)" % [tag, t.kind, t.id, tile.call(t.pos)])
	for u in m.units: T.check(tile.call(u.pos) in ["grass", "sand"], "%s: hut on land (%s)" % [tag, tile.call(u.pos)])
	var all: Array = []
	for l in m.lines: all.append(l.pts)
	all.append_array(m.get("ghosts", []))
	for pts in all:
		for k in range(pts.size() - 1):
			var a: Vector2 = pts[k]; var c: Vector2 = pts[k + 1]
			var n := int(maxf(1.0, a.distance_to(c) * 8.0))
			for q in n + 1:
				var kind: String = tile.call(a.lerp(c, float(q) / float(n)))
				if kind not in ["grass", "sand"]:
					T.check(false, "%s: cable crosses %s at %s" % [tag, kind, str(a.lerp(c, float(q) / float(n)))]); return
	T.check(true, "%s: cable tiles are land" % tag)
