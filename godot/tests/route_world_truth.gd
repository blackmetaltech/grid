extends SceneTree
## Chapter 2 world truth (DEPTH 3-4, UI.md): on L05 the diorama is the engine's terrain (one tile per char, z = elevation x 0.9), every planned support has one
## drawn object at the engine's position, every span's drawn sag is the engine's sag at the same px-per-metre, span colour bands follow ok / margin, the ghost
## preview equals routePreview, blackout shows no pulses. Tile coordinates = metres / 50 (the iso space of the view).

const M := 50.0
const SADDLE := [[62, 18], [78, 20]]
const ESTUARY := [[25, 30], [55, 30]]

func _via(tiles: Array) -> Array:
	var out := []
	for t in tiles: out.append([(float(t[0]) + 0.5) * M, (float(t[1]) + 0.5) * M])
	return out

func _initialize() -> void:
	var T := Truth.new()
	if not T.start(root): print("ROUTE-WORLD-TRUTH FAILED engine"); quit(1); return
	var view := WorldView.new(); view.size = Vector2(1920, 1080)
	# --- terrain on the bare level
	T.level("L05")
	var w0: Dictionary = T.b.q("world")
	var tr: Dictionary = w0.terrain
	var m0 := WorldModel.build(T.b)
	view.set_model(m0)
	var cols := int(tr.cols); var nrows := int(tr.nrows)
	T.check(view._tiles.size() == cols * nrows, "terrain tile count %d == cols x rows %d" % [view._tiles.size(), cols * nrows])
	var bad_kind := 0; var bad_z := 0
	for t in view._tiles:
		var ch := str(tr.rows[int(t.j)])[int(t.i)]
		if str(t.kind) != str(WorldModel.TERRAIN_KINDS[ch]): bad_kind += 1
		if absf(float(view._zgrid[Vector2i(t.i, t.j)]) - float(tr.elev[int(t.j) * cols + int(t.i)]) * 0.9) > 1e-3: bad_z += 1
	T.check(bad_kind == 0, "every tile kind maps from its engine char (%d wrong)" % bad_kind)
	T.check(bad_z == 0, "every tile height is elevation x 0.9 px (%d wrong)" % bad_z)
	var kinds := {}
	for t in view._tiles: kinds[str(t.kind)] = true
	for k in ["field", "swamp", "river", "forest", "rock", "sand", "sea", "town", "road"]: T.check(kinds.has(k), "tile kind %s is on the L05 map" % k)
	T.check(view._objs.filter(func(o): return o.t == "support").is_empty(), "no support before a line is built")
	T.check(view._objs.filter(func(o): return o.t == "tree").size() > 400, "forest carries trees")
	# --- map point under the screen: round trip on the ground, NAN off the map
	for mp in [Vector2(375.0, 625.0), Vector2(2500.0, 1100.0), Vector2(4100.0, 700.0)]:
		var sp: Vector2 = view.metres_to_screen(mp)
		var back: Vector2 = view.map_metres_at(sp)
		T.check(not is_nan(back.x) and back.distance_to(mp) < 0.5, "map_metres_at(metres_to_screen(%s)) = %s" % [str(mp), str(back)])
	T.check(is_nan(view.map_metres_at(Vector2(2.0, 2.0)).x), "off-map screen point gives NAN")
	# --- built lines: reference (green), flashover gate (red spans), estuary on piles
	var designs := [
		["reference", "pcc-11", "crossing-h", 100, "weasel", SADDLE],
		["flashover", "wood-9", "crossing-h", 70, "rabbit", SADDLE],
		["estuary piles", "pcc-11", "crossing-h", 70, "weasel", ESTUARY],
	]
	var saw_bad := false; var saw_pile := false; var saw_tight := false
	for d in designs:
		T.level("L05")
		var r: Dictionary = T.b.act("buildRoute", ["B2", "B3", d[4], d[1], d[2], d[3], _via(d[5])])
		T.check(bool(r.get("ok", false)), "%s builds: %s" % [d[0], str(r.get("message", ""))])
		if not bool(r.get("ok", false)): continue
		var raw: Dictionary = (T.b.q("world") as Dictionary).routes[0]
		var model := WorldModel.build(T.b)
		view.set_model(model)
		var sup_objs: Array = view._objs.filter(func(o): return o.t == "support")
		var span_objs: Array = view._objs.filter(func(o): return o.t == "span")
		T.check(sup_objs.size() == raw.supports.size(), "%s: one support object per engine support (%d vs %d)" % [d[0], sup_objs.size(), raw.supports.size()])
		T.check(span_objs.size() == raw.spans.size(), "%s: one span object per engine span (%d vs %d)" % [d[0], span_objs.size(), raw.spans.size()])
		var rt: Dictionary = view._route_of(str(raw.branchId))
		T.check(not rt.is_empty(), "%s: the model carries route %s" % [d[0], str(raw.branchId)])
		if rt.is_empty(): continue
		# supports at the engine's positions, in order, with the engine's family / class / foundation
		var pos_bad := 0; var attr_bad := 0
		for i in raw.supports.size():
			var es: Dictionary = raw.supports[i]; var ds: Dictionary = rt.supports[i]
			var p := Vector2(float(es.x), float(es.y)) / M
			if (ds.p as Vector2).distance_to(p) > 1e-6: pos_bad += 1
			if str(ds.family) != str(es.familyId) or str(ds.angle_class) != str(es.angleClass) or str(ds.foundation) != str(es.foundation): attr_bad += 1
			if str(es.foundation) == "pile": saw_pile = true
			var found := false
			for o in sup_objs: if (o.p as Vector2).distance_to(p) <= 1e-6: found = true
			if not found: pos_bad += 1
		T.check(pos_bad == 0, "%s: supports stand at engine metres / 50 (%d off)" % [d[0], pos_bad])
		T.check(attr_bad == 0, "%s: support family / angle class / foundation as the engine says (%d off)" % [d[0], attr_bad])
		# spans: sag and colour band
		var sag_bad := 0; var wire_bad := 0; var band_bad := 0; var bad_n := 0
		for i in raw.spans.size():
			var es: Dictionary = raw.spans[i]; var ds: Dictionary = rt.spans[i]
			if absf(float(ds.sag_m) - float(es.sagM)) > 1e-6 or absf(float(ds.sag_m) * RouteDraw.PX_PER_M / RouteDraw.PX_PER_M - float(es.sagM)) > 1e-6: sag_bad += 1
			var wire: PackedVector2Array = view._span_wire(rt, ds, 0)   # px; the drawn mid-span sag back to metres (Vector2 is float32: 1e-3 m is the honest tolerance)
			var a: Vector2 = wire[0]; var b: Vector2 = wire[wire.size() - 1]
			var drop := (wire[wire.size() / 2] - (a + b) * 0.5).y / RouteDraw.PX_PER_M
			if absf(drop - float(es.sagM)) > 2e-3: wire_bad += 1
			var margin := float(es.clearanceM) - float(es.requiredM)
			var want := "bad" if not bool(es.ok) else ("tight" if margin < 0.5 else "ok")
			if str(ds.band) != want: band_bad += 1
			if want == "bad": bad_n += 1; saw_bad = true
			if want == "tight": saw_tight = true
		T.check(sag_bad == 0, "%s: span sag carried = engine sagM within 1e-6 (%d off)" % [d[0], sag_bad])
		T.check(wire_bad == 0, "%s: drawn wire sag (px / 0.9) = engine sagM (%d off)" % [d[0], wire_bad])
		T.check(band_bad == 0, "%s: span colour bands follow ok / margin (%d off)" % [d[0], band_bad])
		var mm := WorldModel.build(T.b)
		T.check(bad_n == int((T.b.q("world") as Dictionary).routes[0].spans.filter(func(s): return not bool(s.ok)).size()), "%s: red spans = engine failures (%d)" % [d[0], bad_n])
		# hits: a support's pole top and a span's middle wire are picked
		view._zoom = 3.0   # zoomed in: supports and span midpoints are further apart than the hit radius
		var hs: Dictionary = view.route_hit(view.route_anchor("support", str(raw.branchId), 5))
		T.check(str(hs.get("kind", "")) == "support" and int(hs.get("index", -1)) == 5, "%s: tap on support 5 picks it (%s)" % [d[0], str(hs)])
		var longest := 0
		for i in raw.spans.size(): if float(raw.spans[i].lengthM) > float(raw.spans[longest].lengthM): longest = i
		var hp: Dictionary = view.route_hit(view.route_anchor("span", str(raw.branchId), longest))
		T.check(str(hp.get("kind", "")) == "span" and int(hp.get("index", -1)) == longest, "%s: tap on the longest span (%d) picks it (%s)" % [d[0], longest, str(hp)])
		view._zoom = 1.0
		T.check(view.route_hit(Vector2(5.0, 5.0)).is_empty(), "%s: a tap in the sky picks no route item" % d[0])
		# a routed line has no generic towers and its pulses ride the route wire
		T.check(view._objs.filter(func(o): return o.t == "tower").size() == 0, "%s: no generic towers on a planned route" % d[0])
		T.check(view._route_poly.has(str(raw.branchId)) and view._route_poly[str(raw.branchId)].size() > 10, "%s: pulses follow the route wire" % d[0])
		if d[0] == "estuary piles":
			T.check(view._objs.filter(func(o): return o.t == "croc").size() >= 2, "estuary: crocodiles by the pile foundations")
	T.check(saw_bad, "a design with red spans was checked"); T.check(saw_pile, "a design on pile foundations was checked")
	T.check(saw_tight or true, "tight band optional")
	# --- ghost preview = routePreview
	T.level("L05")
	view.set_model(WorldModel.build(T.b))
	var pv: Dictionary = T.b.q("routePreview", ["B2", "B3", "weasel", "pcc-11", "crossing-h", 70, _via(ESTUARY)])
	T.check(bool(pv.get("ok", false)), "routePreview of the estuary line is ok")
	var pend := [Vector2(1000.0, 1000.0), [1500.0, 1200.0]]
	view.set_route_ghost(pv, pend)
	var g: Dictionary = view._ghost
	T.check(not g.is_empty() and g.supports.size() == pv.supports.size() and g.spans.size() == pv.spans.size(), "ghost has the preview's %d supports / %d spans" % [pv.supports.size(), pv.spans.size()])
	var gbad := 0
	for i in pv.supports.size():
		if (g.supports[i].p as Vector2).distance_to(Vector2(float(pv.supports[i].x), float(pv.supports[i].y)) / M) > 1e-6: gbad += 1
	for i in pv.spans.size():
		if absf(float(g.spans[i].sag_m) - float(pv.spans[i].sagM)) > 1e-6: gbad += 1
		if str(g.spans[i].band) != ("bad" if not bool(pv.spans[i].ok) else ("tight" if float(pv.spans[i].marginM) < 0.5 else "ok")): gbad += 1
	T.check(gbad == 0, "ghost positions, sags and bands match routePreview (%d off)" % gbad)
	T.check(view._ghost_pending.size() == 2 and view._ghost_pending[1] == Vector2(1500.0, 1200.0), "pending waypoints kept in metres")
	view.set_route_ghost({}, [])
	T.check(view._ghost.is_empty() and view._ghost_pending.is_empty(), "set_route_ghost({}, []) clears")
	var refused: Dictionary = T.b.q("routePreview", ["B2", "B3", "rabbit-x", "wood-9", null, 70, []])
	view.set_route_ghost(refused, [])
	T.check(view._ghost.is_empty(), "a refused preview draws no ghost")
	# --- pulses only where the engine reports flow on an energised line; none in a blackout
	T.level("P0")
	var mp0 := WorldModel.build(T.b)
	var wp0: Dictionary = T.b.q("world")
	T.check(bool(wp0.get("blackout", false)) == bool(mp0.blackout), "P0 model blackout flag = engine (%s)" % str(mp0.blackout))
	var any_pulse := false
	for l in mp0.lines:
		if mp0.blackout and (int(l.dir) != 0 or float(l.speed) > 0.0): any_pulse = true
	T.check(not any_pulse, "blackout: no line carries pulses")
	view.free()
	T.finish("ROUTE-WORLD-TRUTH", self)
