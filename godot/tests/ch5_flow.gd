extends SceneTree
## Chapter 5 flow (L14-L18), headless with the real engine bridge: the control card shows only on L14-L18, reads buses in pu and in kV from the engine, draws each level's
## instrument (tap count, line loadings with N-1, the P-V curve with the nose, the GS table and predictions), and its buttons are the engine's own actions.

func _find(n: Node, nm: String):
	if str(n.name) == nm: return n
	for c in n.get_children():
		var r = _find(c, nm)
		if r != null: return r
	return null

func _texts(n: Node, out: Array) -> void:
	if n is Label: out.append((n as Label).text)
	if n is Button: out.append((n as Button).text)
	if n is HBoxContainer: out.append(" ".join(n.get_children().filter(func(c): return c is Label).map(func(c): return (c as Label).text)).strip_edges())   # a row of fixed columns reads as one line
	for c in n.get_children(): _texts(c, out)

func _initialize() -> void:
	var T := Truth.new()
	if not T.start(root): print("CH5-FLOW FAILED engine"); quit(1); return
	CbRegion.refresh(T.b); GridUi.load_strings()
	var fake := CbApp.new(); fake.b = T.b; fake.started = true
	var p := Ch5Panel.new(); p.app = fake; root.add_child(p)
	await process_frame   # a script's _initialize runs before the root is in the tree: nodes added now are outside it until a frame has passed (get_viewport_rect then errors)
	T.level("L07"); p.refresh()
	T.check(not p.visible, "no chapter 5 card on L07")
	T.level("L14"); T.b.act("tick", [4]); p.refresh()
	var tx: Array = []; _texts(p, tx)
	T.check(p.visible and _find(p, "c5_unit") != null, "L14: the card and the pu / kV toggle")
	T.check(tx.any(func(s): return "pu" in str(s) and "." in str(s)), "L14: buses in pu (%s)" % str(tx.slice(0, 6)))
	p._pu = false; p._sig = ""; p.refresh(); tx.clear(); _texts(p, tx)
	T.check(tx.any(func(s): return "kV" in str(s) and not "Show" in str(s) and not "pu" in str(s)), "L14: buses in kV after the toggle")
	T.check(tx.any(func(s): return "tap changes" in str(s)), "L14: the tap counter")
	var r: Dictionary = T.b.act("setTapAuto", ["T3", 1.0, 0.0125, 3]); T.check(r.ok and float(T.b.g.budget.spent) > 1.0e4, "setTapAuto is priced by the engine (%s)" % str(T.b.g.budget.spent))
	T.level("L15"); T.b.act("tick", [3]); p.refresh(); tx.clear(); _texts(p, tx)
	T.check(tx.any(func(s): return "switching operations" in str(s)), "L15: the switching counter")
	T.level("L16"); T.b.act("tick", [34]); p.refresh(); tx.clear(); _texts(p, tx)
	T.check(tx.any(func(s): return "T7" in str(s) and "N-1" in str(s)), "L16: the chord's loading with its N-1 figure (%s)" % str(tx.slice(0, 12)))
	var wide := 0.0
	for c in p._box.get_children():   # each line row of the card is one row of fixed columns: its columns fit the card's width, so a value never wraps under its line
		if c is HBoxContainer and c.get_child_count() == 3: wide = maxf(wide, (c as HBoxContainer).get_combined_minimum_size().x)
	T.check(wide > 100.0 and wide <= p._box.custom_minimum_size.x, "L16: the line rows fit the card on one row each (%.0f px of %.0f)" % [wide, p._box.custom_minimum_size.x])
	T.level("L17"); p.refresh(); tx.clear(); _texts(p, tx)
	T.check(tx.any(func(s): return "Press Run" in str(s)), "L17 before the first block says what will appear")
	T.b.act("tick", [2]); p.refresh(); tx.clear(); _texts(p, tx)
	T.check(p._chart != null and (p._chart.data.points as Array).size() > 10 and tx.any(func(s): return "nose" in str(s)), "L17: the P-V curve and the nose line")
	T.level("L18"); p.refresh(); tx.clear(); _texts(p, tx)
	T.check(not tx.any(func(s): return "Gauss-Seidel needs" in str(s)) and tx.any(func(s): return "Givens" in str(s)), "L18: the givens, not the sweep answers, before the run")
	T.check(_find(p, "c5_p_l18_v2") != null and _find(p, "c5_vset_up") != null, "L18: prediction fields and the set-point button")
	# 11-28b audit: the L18 card ran under the lever and the speed keys; it must end above the breaker
	var hs := GDScript.new(); hs.source_code = "extends Control\nvar breaker: Control\n"; hs.reload()
	var host := Control.new(); host.set_script(hs); root.add_child(host)
	var brk := Control.new(); host.add_child(brk); host.set("breaker", brk)
	var vpy := p.get_viewport_rect().size.y; brk.position = Vector2(0, minf(vpy - 230.0, 380.0)); brk.size = Vector2(200, 220)
	root.remove_child(p); host.add_child(p); await process_frame
	for i in 3: p.refresh(); await process_frame
	T.check(p.position.y + p.size.y <= brk.position.y, "L18: the card ends above the breaker (%.0f <= %.0f)" % [p.position.y + p.size.y, brk.position.y])
	host.remove_child(p); root.add_child(p); host.queue_free()
	p._submit("l18.v2", "pu", "1.01334"); T.check(T.b.g.metrics.predictions.size() == 1, "the prediction is taken")
	r = T.b.act("setVSet", ["B3", 1.07]); T.check(r.ok, "setVSet goes through the bridge")
	T.b.act("tick", [1]); p.refresh(); tx.clear(); _texts(p, tx)
	T.check(tx.any(func(s): return "Gauss-Seidel needs" in str(s)), "L18: the GS against Newton line after the run starts")
	T.finish("CH5-FLOW", self)
