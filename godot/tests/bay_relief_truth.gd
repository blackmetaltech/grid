extends SceneTree
## The shaped island (1.18) stays off the engine's things: on L01 (every hut site), L02 (radial and trunk) and L03 every point of every route any
## design may take, every home, the hut and each box stand on dry ground (>= 0.3 m) in the 3D bay, while the island is no longer a slab: it has
## relief, a coast that wanders, a headland under the lighthouse and a jetty below the first hamlet.

func _initialize() -> void:
	var T := Truth.new()
	if not T.start(root): print("BAY-RELIEF-TRUTH FAILED engine"); quit(1); return
	for hut in [120, 210, 300]:
		T.level("L01")
		T.check(bool(T.b.act("placeHut", [hut]).get("ok", false)) and bool(T.b.act("layCable", ["main", 16]).get("ok", false)), "L01 hut %d accepted" % hut)
		_check(T, "L01 hut %d" % hut)
	T.level("L01"); _check(T, "L01 bare")
	for topo in ["radial", "trunk"]:
		T.level("L02")
		if topo == "trunk": T.b.act("placeJunction", [])
		T.b.act("layCable", ["main", 25]); T.b.act("layCable", ["b", 16])
		_check(T, "L02 " + topo)
	T.level("L03"); T.b.act("layCable", ["main", 25]); _check(T, "L03")
	T.finish("BAY-RELIEF-TRUTH", self)

func _check(T: Truth, tag: String) -> void:
	var m := WorldModel.build(T.b)
	var view := WorldView.new(); view.size = Vector2(1200, 700); view.set_model(m)
	var bay := Bay3D.new(); root.add_child(bay)
	bay.set_model(m, view._tiles, view._zgrid, view._objs)
	var tm: float = bay.tm
	var polys: Array = []
	for r in m.get("island", {}).get("routes", []): polys.append(r)
	for l in m.lines: polys.append(l.pts)
	var low := 99.0; var n := 0
	for poly in polys:
		for k in range((poly as Array).size() - 1):
			var a: Vector2 = ((poly[k] as Vector2) + Vector2(0.5, 0.5)) * tm; var b: Vector2 = ((poly[k + 1] as Vector2) + Vector2(0.5, 0.5)) * tm
			var steps := maxi(1, int(a.distance_to(b) / 2.0))
			for q in steps + 1:
				var p := a.lerp(b, float(q) / float(steps)); low = minf(low, bay.ground(p.x, p.y)); n += 1
	T.check(low >= 0.3, "%s: every route point is dry (%d points, lowest %.2f m)" % [tag, n, low])
	var lowo := 99.0
	for o in view._objs:
		var t := str(o.t)
		if t == "bld" or t == "unit" or t == "sub":
			var p: Vector2 = (o.p as Vector2) * tm; lowo = minf(lowo, bay.ground(p.x, p.y))
	T.check(lowo >= 0.3, "%s: every home, hut and box is dry (lowest %.2f m)" % [tag, lowo])
	# not a slab: relief, a wandering north shore, a headland, a jetty
	var top := 0.0; var shore: Array = []
	var W := float(m.map.x) * tm; var H := float(m.map.y) * tm
	var x := tm * 2.0
	while x < W - tm * 2.0:
		var z := -tm * 4.0; var found := -1.0
		while z < H:
			var g := bay.ground(x, z); top = maxf(top, g)
			if found < 0.0 and g > 0.0: found = z
			z += 1.0
		if found >= 0.0: shore.append(found)
		x += 5.0
	var mean := 0.0
	for s in shore: mean += float(s)
	mean /= maxf(1.0, float(shore.size()))
	var vr := 0.0
	for s in shore: vr += (float(s) - mean) * (float(s) - mean)
	vr /= maxf(1.0, float(shore.size()))
	T.check(top >= 8.0 * clampf(tm / 10.0, 1.0, 2.5), "%s: the land rises (highest %.1f m)" % [tag, top])
	T.check(sqrt(vr) >= 6.0, "%s: the north shore wanders (sd %.1f m over %d columns)" % [tag, sqrt(vr), shore.size()])
	var lh: Node3D = bay.get_node_or_null("Static/Lighthouse")
	T.check(lh != null and lh.position.y >= 4.0, "%s: the lighthouse stands on a headland (%.1f m)" % [tag, lh.position.y if lh != null else -1.0])
	if tag.begins_with("L01"): T.check(bay.get_node_or_null("Static/Jetty") != null, "%s: a jetty below the hamlet" % tag)
	print("%s: route low %.2f, objects low %.2f, top %.1f m, shore sd %.1f m" % [tag, low, lowo, top, sqrt(vr)])
	view.free(); bay.free()
