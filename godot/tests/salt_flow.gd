extends SceneTree
## Salt flow (chapter 2, L29 "Salt Wind"), headless with the real engine bridge: the insulator and coast cells exist on L29 and not on L05 (which keeps its 7 args); picking an
## insulator re-strings the line with the engine's args and the budget spent is the engine's sum; the hover chip's amber note counts the supports short of their creepage; the
## support tag prints the engine's creepage and need (red when short); Retry's design keeps the insulators; the naive pin line loses by salt flashover and the lesson reads.

const WP := [Vector2(4425.0, 1525.0), Vector2(4425.0, 2075.0)]   # the east corridor of the L29 reference designs, tile (88,30) and (88,41) in metres

func _initialize() -> void:
	var T := Truth.new()
	if not T.start(root): print("SALT-FLOW FAILED engine"); quit(1); return
	CbRegion.refresh(T.b); GridUi.load_strings(); TrayStrings.load_strings()
	var world := WorldView.new(); world.size = Vector2(1400, 800); root.add_child(world)
	var radio := RadioLog.new(); root.add_child(radio)
	var ins := Instruments.new(); root.add_child(ins)
	var tags := TagView.new(); tags.b = T.b; tags.world = world; root.add_child(tags)
	var tray := RouteTray.new(); tray.b = T.b; tray.world = world; tray.radio = radio; tray.instruments = ins; tray.tags = tags
	root.add_child(tray); tray.size = Vector2(1100.0, 96.0)
	var sync := func():
		world.refresh(T.b)
		var w = T.b.q("world"); ins.refresh_route(T.b, w, w.terrain != null, false); tray.refresh()
	var fake := CbApp.new(); fake.b = T.b
	# ---- L05 is exactly as it was ----
	T.level("L05"); sync.call()
	var kinds5: Array = tray.items.map(func(i): return i.kind)
	T.check(not kinds5.has("insulator") and not kinds5.has("coast") and not tray.kit.has("insulator"), "L05 has no insulator or coast cells (%s)" % str(kinds5))
	T.check(tray._args("B2", "B3", []).size() == 7, "L05 keeps 7 args")
	T.check(not RouteTray.ins_allowed(T.b), "L05 does not allow insulators")
	var li5: Dictionary = T.b.q("levelInfo")
	T.check(not WorkOrder.conditions(fake, li5).any(func(c): return str(c).contains("fog")), "L05's work order has no fog line")
	# ---- L29: the cells ----
	T.level("L29"); sync.call()
	var kinds: Array = tray.items.map(func(i): return i.kind)
	T.check(kinds.count("insulator") == 3 and kinds.count("coast") == 3, "L29 cells: 3 insulator + 3 coast (%s)" % str(kinds))
	T.check(tray.kit.insulator == "pin" and tray.kit.coast == "pin", "default kit: pins")
	var ipos: int = tray.item_index("insulator", "pin"); var xpos: int = tray.item_index("xfmr")
	T.check(ipos > tray.item_index("conductor", "dog") and tray.items[ipos].group < tray.items[xpos].group, "the insulator groups sit after the conductors and before the transformers")
	T.check(tray._args("B3", "B5", []).size() == 9 and tray._args("B3", "B5", [])[7] == "pin", "L29 appends both insulator ids")
	var li: Dictionary = T.b.q("levelInfo")
	var conds: Array = WorkOrder.conditions(fake, li)
	T.check(conds.any(func(c): return str(c) == "Survive the sea fog at 04:00 (salt on the insulators)"), "work order pass line for the fog (%s)" % str(conds))
	var lamps: Array = WorkOrder.lamp_texts(li)
	T.check(str(lamps[2]).contains("every support by the sea ≥ 372 mm creepage"), "third lamp names the creepage target: %s" % str(lamps[2]))
	# ---- survey the naive line with pins ----
	tray.select_kit("family", "pcc-11"); tray.select_kit("conductor", "rabbit"); tray.select_kit("span", "90")
	if float(tray.kit.kv) < 1.0: tray.step_kv(1)
	var s0 := float(T.b.g.budget.spent)
	tray.activate(tray.item_index("survey")); tray.press_yard("B3")
	for p in WP: tray.press_ground(p)
	tray.hover_m = Vector2(NAN, NAN); tray.hover_yard = "B5"; tray._update_survey_preview()   # the pointer rests on the harbour yard
	var wps: Array = []; for p in WP: wps.append([p.x, p.y])
	var args := ["B3", "B5", "rabbit", "pcc-11", null, 90.0, wps, "pin", "pin"]
	var pv: Dictionary = T.b.q("routePreview", ["B3", "B5", "rabbit", "pcc-11", null, 90.0, wps, "pin", "pin"])
	T.check(pv.ok and tray.preview.ok and tray.preview.cost.total == pv.cost.total, "the hover preview carries the insulators and is the engine's")
	var short: Array = pv.saltShort
	T.check(not short.is_empty() and tray.chip_text.contains("%d supports short of their salt creepage (worst: pole " % short.size()), "amber note counts the engine's saltShort (%d): %s" % [short.size(), tray.chip_text])
	var worst_i := int(short[0]); var wg := -1.0
	for i in short: var g := float(pv.supports[int(i)].needMm) - float(pv.supports[int(i)].creepageMm); if g > wg + 1e-9: wg = g; worst_i = int(i)
	T.check(tray.chip_text.contains("pole %d, %d mm of %d)" % [worst_i + 1, int(round(float(pv.supports[worst_i].creepageMm))), int(round(float(pv.supports[worst_i].needMm)))]), "the note names the worst pole and its numbers")
	T.check(tray.chip_text.get_slice("\n", 1).contains("insulators "), "the second chip line still prints the insulator cost")
	var fin := tray.press_yard("B5"); sync.call()
	T.check(fin.get("ok", false), "yard click builds the pin line: %s" % str(fin.get("message", fin)))
	var want: Dictionary = T.b.q("routePreview", args)
	T.near(float(T.b.g.budget.spent) - s0, float(want.cost.total), 0.011, "spent = the engine's cost of the pin line")
	T.check(not T.b.g.routes.back().request.has("insulatorId"), "a plain-pin line records no insulator ids")
	# ---- the support tag, short ----
	var rec: Dictionary = T.b.g.routes.back(); var plan: Dictionary = T.b.q("world").routes.back()
	var sups: Array = plan.supports; var top := 0
	for i in sups.size(): if float(sups[i].needMm) > float(sups[top].needMm): top = i
	var tg: Dictionary = tags.describe_route("support", TagView.route_id(str(rec.branchId), top))
	var sp: Dictionary = sups[top]
	T.check(tg.ins_lines[0] == "Insulator: pin insulator, 320 mm creepage", "tag insulator line: %s" % tg.ins_lines[0])
	var want_salt := "Salt: class IV, %d m from the sea → needs 31 mm/kV × 12 kV = %d mm" % [int(round(float(sp.seaM))), int(round(float(sp.needMm)))]
	T.check(tg.ins_lines[1] == want_salt and bool(tg.short) and int(round(float(sp.needMm))) == 372, "tag salt line is the engine's numbers, flagged short: %s (want %s)" % [tg.ins_lines[1], want_salt])
	# ---- selecting a coast insulator re-strings with the engine's args ----
	tray.hover = tray.item_index("coast", "fog1"); tray._cell_hover()
	var wantf: Dictionary = T.b.q("routePreview", ["B3", "B5", "rabbit", "pcc-11", null, 90.0, (rec.request.waypoints as Array).slice(1, (rec.request.waypoints as Array).size() - 1), "pin", "fog1"])
	T.check(tray.chip_text.begins_with("re-strung") and tray.preview.cost.total == wantf.cost.total, "hovering the coast fog disc previews the re-string: %s" % tray.chip_text.get_slice("\n", 0))
	tray.hover = -1
	var rs := tray.select_kit("coast", "fog1"); sync.call()
	T.check(rs.get("ok", false) and T.b.g.routes.size() == 2, "re-string ok, still two lines (the district's L05 line and the harbour line)")
	var r1: Dictionary = T.b.g.routes.back()
	T.check(str(r1.request.insulatorId) == "pin" and str(r1.request.coastInsulatorId) == "fog1", "the line now records pin inland, fog disc on the coast (%s)" % str(r1.request))
	T.near(float(T.b.g.budget.spent) - s0, float(wantf.cost.total), 0.011, "spent = the engine's cost of the re-strung line (%f vs %f)" % [float(T.b.g.budget.spent) - s0, float(wantf.cost.total)])
	var sp2: Dictionary = (T.b.q("world").routes.back().supports as Array)[top]
	var tg2: Dictionary = tags.describe_route("support", TagView.route_id(str(r1.branchId), top))
	T.check(tg2.ins_lines[0] == "Insulator: fog disc, %d mm creepage" % int(round(float(sp2.creepageMm))) and int(round(float(sp2.creepageMm))) == 430 and not bool(tg2.short), "tag after the fog disc: %s, not short" % tg2.ins_lines[0])
	T.check(RouteTray.INS_MM[str(sp2.insulatorId)] == int(sp2.creepageMm), "the tray's label creepage is the engine's")
	# ---- Retry keeps the insulators ----
	tray.select_kit("insulator", "disc2"); sync.call()
	var design := ShiftReport.design_of(fake)
	var br_a: Array = design.filter(func(a): return a[0] == "buildRoute")
	T.check(br_a.size() == 2 and (br_a[1][1] as Array).size() == 9 and br_a[1][1][7] == "disc2" and br_a[1][1][8] == "fog1", "the design record replays both insulator ids: %s" % str(br_a[1][1].slice(7)))
	T.check((br_a[0][1] as Array).size() == 7, "the L05 line's request has no insulator ids (7 args)")
	T.level("L29")
	var bad := ShiftReport.replay(fake, design)
	T.check(bad == 0 and T.b.g.routes.size() == 2 and str(T.b.g.routes.back().request.insulatorId) == "disc2" and str(T.b.g.routes.back().request.coastInsulatorId) == "fog1", "Retry rebuilds the line with its insulators and does not stack the district's own line again (refused %d)" % bad)
	# ---- the naive pin line loses by salt flashover ----
	T.level("L29"); sync.call()
	tray.kit.insulator = "pin"; tray.kit.coast = "pin"
	tray.activate(tray.item_index("survey")); tray.press_yard("B3")
	for p in WP: tray.press_ground(p)
	tray.press_yard("B5"); sync.call()
	var xf := T.b.act("placeTransformer", ["B5", "B6", "dt-250"])
	T.check(xf.get("ok", false), "transformer placed: %s" % str(xf.get("message", "")))
	var n := 0
	while str(T.b.g.get("status", "playing")) == "playing" and n < 60: T.b.act("tick", [1]); n += 1
	var li2: Dictionary = T.b.q("levelInfo")
	T.check(str(T.b.g.status) == "lost" and str(T.b.g.block.verdictKey) == "level.lost.saltFlashover", "the pin line is lost to the sea fog (%s, %s)" % [str(T.b.g.status), str(T.b.g.block.get("verdictKey", ""))])
	T.check(str(li2.lesson).contains("372 mm") and str(li2.lesson).contains("320 mm") and str(li2.lesson).contains("flashed over"), "the lesson reads with the player's numbers: %s" % str(li2.lesson))
	T.finish("SALT-FLOW", self)
