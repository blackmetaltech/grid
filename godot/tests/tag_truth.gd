extends SceneTree
## Tag truth (UI.md 4): the numbers a paper tag shows are the engine's benchDetail values at the shown precision (I 2 dp, R 3 dp, V 1 dp, loss in
## whole watts), the equation line carries the run's own eq numbers and evaluates (v0 - i*r = v within 1e-3), the hamlet tag's voltage equals
## benchStatus.vLoadV, and the lamp bar is (V / 48)^2. A sweep of L01 and L02 designs, both topologies.

func _num(s: String) -> float: return float(s)

func _initialize() -> void:
	var T := Truth.new()
	if not T.start(root): print("TAG-TRUTH FAILED engine"); quit(1); return
	CbRegion.refresh(T.b)
	var world := WorldView.new(); world.size = Vector2(1400, 800); root.add_child(world)
	var tag := TagView.new(); tag.b = T.b; tag.world = world; root.add_child(tag)
	var designs := 0
	var rx := RegEx.new(); rx.compile("-?\\d+(?:\\.\\d+)?")
	var cases: Array = []
	for hut in [120, 180, 300]:
		for mm2 in [2.5, 10, 25, 50]: cases.append(["L01", hut, mm2, "", 0.0])
	for topo in ["radial", "trunk"]:
		for a in [4, 25, 50]:
			for c in [4, 16, 50]: cases.append(["L02", 0, a, topo, c])
	for cs in cases:
		T.level(cs[0])
		var ok := true
		if cs[0] == "L01": ok = T.b.act("placeHut", [cs[1]]).get("ok", false) and T.b.act("layCable", ["main", cs[2]]).get("ok", false)
		else:
			if cs[3] == "trunk": T.b.act("placeJunction", [])
			ok = T.b.act("layCable", ["main", cs[2]]).get("ok", false) and T.b.act("layCable", ["b", cs[4]]).get("ok", false)
		var label := str(cs)
		T.check(ok, "%s accepted" % label)
		if not ok: continue
		world.refresh(T.b)
		var det: Dictionary = T.b.q("benchDetail"); var bs: Dictionary = T.b.q("benchStatus"); var kit: Dictionary = T.b.q("benchKit")
		designs += 1
		for run in det.runs:
			# the equation evaluates on the engine's own numbers
			var eq: Dictionary = run.eq
			T.near(float(eq.v0) - float(eq.i) * float(eq.r), float(eq.v), 1e-3, "%s %s: v0 - i*r = v" % [label, run.id])
			T.check(tag.open("cable", str(run.id)), "%s: cable tag %s opens" % [label, run.id])
			var d := tag.desc
			var txt: String = tag.eq_label.text
			T.check(txt == TagView.eq_text(eq), "%s %s: equation label = eq_text" % [label, run.id])
			# displayed numbers, parsed back from the label, equal the engine at the shown precision
			var nums: Array = []
			for m in rx.search_all(txt): nums.append(_num(m.get_string()))
			T.check(nums.size() == 5, "%s %s: five numbers in the equation (%s)" % [label, run.id, txt])
			if nums.size() == 5:
				T.near(nums[0], round(float(eq.v0) * 10.0) / 10.0, 1e-9, "%s %s: v0 shown" % [label, run.id])
				T.near(nums[2], float(eq.i), 0.005 + 1e-9, "%s %s: I shown to 2 dp" % [label, run.id])
				T.near(nums[3], float(eq.r), 0.0005 + 1e-9, "%s %s: R shown to 3 dp" % [label, run.id])
				T.near(nums[4], float(eq.v), 0.05 + 1e-9, "%s %s: V shown to 1 dp" % [label, run.id])
				T.check(txt.begins_with("V = "), "%s: equation starts V = " % label)
			var shown := {}
			for r in d.rows: shown[str(r[0])] = str(r[1])
			T.check(shown[tag.tx("TAG_RLOOP")] == "%.3f Ω" % float(run.rLoopOhm), "%s %s: R loop row" % [label, run.id])
			T.check(shown[tag.tx("TAG_I")] == "%.2f A" % float(run.iA), "%s %s: I row" % [label, run.id])
			T.check(shown[tag.tx("TAG_DROP")] == "%.1f V" % float(run.dropV), "%s %s: drop row" % [label, run.id])
			T.check(str(shown[tag.tx("TAG_LOSS")]).begins_with("%d W" % int(round(float(run.lossW)))), "%s %s: loss row" % [label, run.id])
			T.near(float(str(shown[tag.tx("TAG_LOSS")]).get_slice(" ", 0)), float(run.lossW), 0.5 + 1e-9, "%s %s: loss W to the watt" % [label, run.id])
			T.check(str(d.title) == tag.tx("TAG_CABLE") % [TagView.fmt_mm2(float(run.mm2)), str(int(round(float(run.lengthM))))], "%s %s: title mm2 and metres" % [label, run.id])
			var texts: Array = tag.lines.map(func(l): return l.text)
			T.check(texts.has(txt), "%s %s: the equation is on the tag" % [label, run.id])
			if det.runs.size() == 1: T.check(str(shown[tag.tx("TAG_LOSS")]).ends_with("(%.1f %%)" % float(det.totals.lossPct)), "%s: loss percent of the circuit" % label)
		# hamlet tags: V = the engine's per-hamlet worst voltage, lamps = (V/48)^2, I = the feeding run
		var towns: Array = world.model.towns
		for t in towns:
			T.check(tag.open("hamlet", str(t.id)), "%s: hamlet tag %s opens" % [label, t.id])
			var hd := tag.desc
			var vl: Array = bs.vLoadV
			T.near(float(hd.v), float(vl[int(t.idx)]), 1e-3, "%s %s: hamlet V = benchStatus.vLoadV" % [label, t.id])
			T.check(hd.v_text == "%.1f V" % float(hd.v), "%s %s: V text" % [label, t.id])
			var run_id := TagView.run_of_hamlet(str(bs.scenario), str(bs.bench.topology), int(t.idx))
			var feed: Dictionary = {}
			for r in det.runs: if str(r.id) == run_id: feed = r
			T.near(float(hd.i), float(feed.iA), 1e-9, "%s %s: hamlet I = feeding run iA" % [label, t.id])
			T.check(hd.i_text == "%.2f A" % float(feed.iA), "%s %s: I text 2 dp" % [label, t.id])
			T.near(float(hd.lamp), clampf(pow(float(feed.vRecvV) / float(kit.homeV), 2.0), 0.0, 1.0), 1e-9, "%s %s: lamp bar = (V/48)^2" % [label, t.id])
			T.check(hd.good == (float(feed.vRecvV) >= float(bs.bench.limits.vMinV)), "%s %s: good/bad dot vs the limit" % [label, t.id])
			var homes: Array = T.b.q("world").bench.homes
			T.check(str(hd.homes_text) == "%d homes · %d W each" % [int(homes[int(t.idx)]), int(kit.homeW)], "%s %s: homes line (%s)" % [label, t.id, hd.homes_text])
		# hut tag
		T.check(tag.open("hut", "hut"), "%s: hut tag opens" % label)
		T.check(tag.desc.rows[1][1] == "%d W" % int(round(float(det.totals.sourceW))), "%s: hut power out" % label)
		T.check(tag.close() and not tag.is_open(), "%s: tag closes" % label)
	# before anything is laid: dark hamlet, no cable
	T.level("L01"); world.refresh(T.b)
	T.check(tag.open("hamlet", "h1") and tag.desc.has("dark"), "an unconnected hamlet tag says dark")
	T.check(not tag.is_open() or tag.close(), "close")
	T.check(designs == cases.size(), "all designs ran (%d)" % designs)
	print("designs checked: %d" % designs)
	T.finish("TAG-TRUTH", self)
