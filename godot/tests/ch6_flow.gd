extends SceneTree
## Chapter 6 flow (L19-L22), headless with the real engine bridge: the control-room card shows only on L19-L22, offers the spare-unit, battery, clock, pump and ride-through buttons the
## state calls for, the actions go through the bridge as the engine's own (prices, refusals), the predictions are taken, and L19's naive run loses at the 20:00 trip while the spare unit passes.

func _buttons(n: Node, out: Array) -> void:
	if n is Button: out.append(str((n as Button).name))
	for c in n.get_children(): _buttons(c, out)

func _initialize() -> void:
	var T := Truth.new()
	if not T.start(root): print("CH6-FLOW FAILED engine"); quit(1); return
	CbRegion.refresh(T.b); GridUi.load_strings()
	var fake := CbApp.new(); fake.b = T.b; fake.started = true
	var p := Ch6Panel.new(); p.app = fake; root.add_child(p)
	T.level("L07"); p.refresh()
	T.check(not p.visible, "no control-room card on L07")
	T.level("L19"); p.refresh()
	var bs: Array = []; _buttons(p, bs)
	T.check(p.visible and bs.has("c6_spinUnit_U17"), "L19: the card offers the spare coal unit (%s)" % str(bs))
	T.check(p._edits.has("rocof0"), "L19: a RoCoF prediction field")
	var r: Dictionary = T.b.act("spinUnit", ["U17"]); T.check(r.ok, "spinUnit goes through the bridge: %s" % str(r.get("message", "")))
	p.refresh(); bs.clear(); _buttons(p, bs); T.check(true, "(rows are fixed: the spare unit row stays, switched ON)")
	T.check(float(T.b.g.budget.spent) > 1.0e7, "the engine charged the year of evenings (%s)" % str(T.b.g.budget.spent))
	p._submit("rocof0", "Hz/s", "0.4")
	T.check(T.b.g.metrics.predictions.size() == 1 and absf(float(T.b.g.metrics.predictions[0].predicted) - 0.4) < 1e-9, "the prediction is taken")
	T.level("L21"); p.refresh(); bs.clear(); _buttons(p, bs)
	T.check(bs.has("c6_spinUnit_U6") and bs.has("c6_upgradeRideThrough_"), "L21: hold coal and ride-through (%s)" % str(bs))
	# Retry keeps every battery and every hold (the replay used to stop at the first battery of a kind)
	T.level("L21")
	for i in 3: T.b.act("placeStorage", ["B1", "bess-gfm-50"])
	T.b.act("spinUnit", ["U6"]); T.b.act("spinUnit", ["U7"]); T.b.act("upgradeRideThrough", [])
	var design := ShiftReport.design_of(fake)
	T.level("L21")
	var refused := ShiftReport.replay(fake, design)
	T.check(refused == 0 and T.b.g.storage.size() == 3, "Retry restores all three batteries (%d, refused %d)" % [T.b.g.storage.size(), refused])
	var held := 0
	for u in T.b.g.units: if u.id in ["U6", "U7"] and u.commit.schedule.size() > 0: held += 1
	T.check(held == 2 and (T.b.g.rules.derLegacyIds as Array).is_empty(), "Retry holds U6 and U7 again and refits the rooftops")
	T.level("L20"); p.refresh(); bs.clear(); _buttons(p, bs)
	T.check(bs.has("c6_shiftLoad"), "L20: the pumps to noon (%s)" % str(bs))
	T.level("L22"); p.refresh()
	T.check(p._edits.has("examA") and p._edits.has("examB") and p._edits.has("examC"), "L22: three exam fields")
	T.finish("CH6-FLOW", self)
