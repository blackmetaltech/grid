extends SceneTree
## Route flow (chapter 2, L05 "The River Line"), headless with the real engine bridge: Survey line -> the yards glow as pegs -> yard, ground clicks (through the tray's
## public functions), yard -> one route in the world and the budget spent is the engine's; a hover asks `routePreview` (ghost + chip are its numbers); changing the conductor
## re-strings the line with the same waypoints; a refusal shows the engine's message (and one SYS radio line per new refusal); transformers; the clearance gauge and the village
## voltmeter read the engine; the span tag's equation is the engine's w, L, H, D; nothing changes while the night runs; pad and keyboard drive the same survey.

const WP := [Vector2(1525.0, 425.0), Vector2(2125.0, 425.0), Vector2(3125.0, 725.0)]   # the gorge corridor of the reference designs (metres)

func _initialize() -> void:
	var T := Truth.new()
	if not T.start(root): print("ROUTE-FLOW FAILED engine"); quit(1); return
	CbRegion.refresh(T.b); GridUi.load_strings(); TrayStrings.load_strings()
	var world := WorldView.new(); world.size = Vector2(1400, 800); root.add_child(world)
	var radio := RadioLog.new(); root.add_child(radio)
	var ins := Instruments.new(); root.add_child(ins)
	var tags := TagView.new(); tags.b = T.b; tags.world = world; root.add_child(tags)
	var tray := RouteTray.new(); tray.b = T.b; tray.world = world; tray.radio = radio; tray.instruments = ins; tray.tags = tags
	var cues: Array = []; tray.sfx = func(c): cues.append(c)
	root.add_child(tray); tray.size = Vector2(1100.0, 96.0)
	var sync := func():
		world.refresh(T.b)
		var w = T.b.q("world"); ins.refresh_route(T.b, w, w.terrain != null, false); tray.refresh()
	var sys := func() -> Array: return radio.lines.filter(func(l): return l.speaker == "SYS")
	# ---- start: items, yards ----
	T.level("L05"); sync.call()
	T.check(tray.visible, "the route tray shows on a level with a terrain")
	var kinds: Array = tray.items.map(func(i): return i.kind)
	T.check(kinds.count("survey") == 1 and kinds.count("family") == 3 and kinds.count("crossing") == 3 and kinds.count("span") == 1 and kinds.count("conductor") == 3 and kinds.count("xfmr") == 4, "cells: survey, 3 families, 3 crossings, span, 3 conductors, 4 transformers (%s)" % str(kinds))
	var conds: Array = tray.items.filter(func(i): return i.kind == "conductor").map(func(i): return i.id)
	T.check(conds == T.b.q("palette").actions[0].parts, "conductor reels are the engine's allowed conductors (%s)" % str(conds))
	T.check(tray.yards.size() == 4 and tray.pairs.size() == 2, "four yards, two transformer pairs (%d, %d)" % [tray.yards.size(), tray.pairs.size()])
	T.check(str(tray.yards[1].label).begins_with("Hydro yard") and str(tray.yards[2].label).begins_with("Village yard"), "yard names: %s / %s" % [tray.yards[1].label, tray.yards[2].label])
	T.check(ins.clear.visible and ins.vil.visible and ins.clear.blank and ins.clear.readout_text() == "no line", "clearance gauge blank before a route: '%s'" % ins.clear.readout_text())
	T.check(ins.clear.vmin == -2.0 and ins.clear.vmax == 3.0 and ins.vil.vmin == 340.0 and ins.vil.vmax == 460.0, "gauge scales: -2..+3 m, 340..460 V")
	# ---- the kit: part cells, span knob ----
	T.check(tray.allowed_spans("wood-9") == [60, 70] and tray.allowed_spans("tubular-13") == [60, 70, 90, 100, 120], "the span knob only offers spans the family can carry")
	tray.activate(tray.item_index("family", "tubular-13")); tray.activate(tray.item_index("crossing", "tubular-13")); tray.activate(tray.item_index("conductor", "rabbit"))
	for k in 3: if int(tray.kit.span) != 90: tray.activate(tray.item_index("span"))
	T.check(tray.kit == {"family": "tubular-13", "crossing": "tubular-13", "span": 90, "conductor": "rabbit"}, "kit chosen: %s" % str(tray.kit))
	tray.select_kit("family", "wood-9")
	T.check(int(tray.kit.span) == 70 and tray.kit.family == "wood-9", "wood poles clamp the 90 m span to 70 m (%s)" % str(tray.kit.span))
	tray.select_kit("family", "tubular-13"); tray.select_kit("span", "90")
	# ---- survey: pegs, start yard, ground clicks, live ghost ----
	tray.activate(tray.item_index("survey")); sync.call()
	T.check(tray.mode == "survey" and world.peg_count() == 4, "Survey line lights the four yards as pegs (%d)" % world.peg_count())
	var g0 := tray.ghost_calls
	T.check(tray.press_yard("B2").get("started", "") == "B2" and tray.from_id == "B2", "a yard click starts the line at B2")
	tray.hover_ground(WP[0], true)
	T.check(tray.ghost_calls > g0 and tray.last_ghost.pending.size() == 2, "the ghost was requested with the pending polyline (%d calls)" % (tray.ghost_calls - g0))
	for p in WP: T.check(tray.press_ground(p), "ground click at %s" % str(p))
	tray.hover_ground(Vector2(3625.0, 725.0), true)
	var args := ["B2", "B3", "rabbit", "tubular-13", "tubular-13", 90.0, [[1525.0, 425.0], [2125.0, 425.0], [3125.0, 725.0], [3625.0, 725.0]]]
	var pv: Dictionary = T.b.q("routePreview", args)
	T.check(pv.ok and tray.preview.ok and tray.preview.cost.total == pv.cost.total, "the hover preview is the engine's routePreview")
	var chip := "%.1f km · %d poles · worst clearance %+.1f m · %s" % [float(pv.lengthM) / 1000.0, (pv.supports as Array).size(), float(pv.worstMarginM), CbRegion.money(float(pv.cost.total), false, 0)]
	T.check(tray.chip_text == chip, "chip text: '%s' (want '%s')" % [tray.chip_text, chip])
	T.check(tray.chip_dot == (GridTheme.GOOD if float(pv.worstMarginM) > 0.5 else (GridTheme.WARN if float(pv.worstMarginM) >= 0.0 else GridTheme.BAD)), "chip dot follows the margin")
	T.check(absf(ins.clear.ghost - float(pv.worstMarginM)) < 1e-9, "the clearance gauge's ghost needle is the previewed margin (%f)" % ins.clear.ghost)
	T.check(tray.last_ghost.plan.supports.size() == (pv.supports as Array).size(), "the ghost plan has the engine's supports")
	var spent0 := float(T.b.g.budget.spent)
	var spans_before: int = (T.b.q("world").routes as Array).size()
	var ev := InputEventKey.new(); ev.pressed = true; ev.keycode = KEY_BACKSPACE
	T.check(tray.key(ev) and tray.waypoints.size() == 2, "Backspace removes the last waypoint")
	tray.press_ground(WP[2])
	var fin := tray.press_yard("B3"); sync.call()
	T.check(fin.get("ok", false), "yard click B3 builds the line: %s" % str(fin.get("message", fin)))
	T.check(T.b.g.routes.size() == 1 and (T.b.q("world").routes as Array).size() == 1 and spans_before == 0, "the world has exactly one route")
	var rec: Dictionary = T.b.g.routes[0]
	var want: Dictionary = T.b.q("routePreview", ["B2", "B3", "rabbit", "tubular-13", "tubular-13", 90.0, [[1525.0, 425.0], [2125.0, 425.0], [3125.0, 725.0]]])
	T.near(float(T.b.g.budget.spent) - spent0, float(want.cost.total), 0.011, "the budget spent is the engine's route cost (%f)" % (float(T.b.g.budget.spent) - spent0))
	T.check(tray.mode == "" and world.peg_count() == 0 and cues.has("reel"), "the survey ends: pegs gone, reel cue")
	T.check(tray.last_ghost.plan.is_empty(), "the ghost is cleared")
	# ---- clearance gauge = the engine's worst margin ----
	var m: MeterView = ins.clear
	var steps := 0
	while not m.settled() and steps < 600: m.step(1.0 / 60.0); steps += 1
	T.check(not m.blank and m.target == float(rec.worstMarginM), "clearance gauge target is the engine's worst margin (%f)" % m.target)
	T.near(m.needle_value(), clampf(float(rec.worstMarginM), -2.0, 3.0), 0.001 * 5.0, "needle rests on the engine value")
	T.check(m.readout_text() == "%+.1f m" % float(rec.worstMarginM), "readout '%s'" % m.readout_text())
	T.check(float(m.zones[0][1]) == 0.0 and float(m.zones[1][1]) == 0.5, "zones: red below 0, amber 0-0.5, green above")
	# ---- span and support tags: the engine's numbers ----
	var ws: int = int(rec.worst.span)
	T.check(tags.open("span", TagView.route_id(str(rec.branchId), ws)) and tags.eq_label != null, "the worst span's tag opens")
	var eq: String = tags.eq_label.text
	var wst: Dictionary = rec.worst
	var want_eq := "D = wL²/8H = %.2f × %s² ÷ (8 × %s N) = %.2f m" % [float(wst.wNPerM), TagView._g1(float(wst.lengthM)), TagView._thou(float(wst.hN)), float(wst.sagM)]
	T.check(eq == want_eq, "span equation '%s' (want '%s')" % [eq, want_eq])
	var D := float(wst.wNPerM) * float(wst.lengthM) * float(wst.lengthM) / (8.0 * float(wst.hN))
	T.near(D, float(wst.sagM), 0.006, "the equation evaluates to the shown sag (%f)" % D)
	var wspan: Dictionary = (T.b.q("world").routes[0].spans as Array)[ws]
	T.check(tags.lines.any(func(l): return l.text == tray.tx("TAG_CLEARANCE_V") % ["%.1f" % float(wspan.clearanceM), "%.1f" % float(wspan.requiredM)]), "clearance line: %s" % str(tags.lines.map(func(l): return l.text)))
	var other := 0 if ws != 0 else 1
	tags.open("span", TagView.route_id(str(rec.branchId), other))
	T.check(tags.eq_label.text.begins_with("D = wL²/8H, L = "), "a span without engine w and H shows D = wL²/8H with L and D only ('%s')" % tags.eq_label.text)
	T.check(tags.open("support", TagView.route_id(str(rec.branchId), 2)) and tags.desc.lines.size() == 2 and str(tags.desc.lines[0]).contains("·"), "support tag: %s" % str(tags.desc.lines))
	var rp: Dictionary = (T.b.q("world").routes[0].supports as Array)[2]
	T.check(str(tags.desc.lines[0]).begins_with(tray.tx("TAG_ANG_" + str(rp.angleClass))) and str(tags.desc.lines[0]).ends_with("%d°" % int(round(float(rp.angleDeg)))), "support angle line is the engine's class and degrees ('%s')" % tags.desc.lines[0])
	T.check(tags.open("yard", "B2") and tags.desc.title.begins_with("Hydro yard"), "yard tag: %s" % tags.desc.title)
	tags.close()
	# ---- change the conductor: re-strung with the same waypoints ----
	var wp_before: Array = (rec.request.waypoints as Array).duplicate(true)
	var r2: Dictionary = tray.select_kit("conductor", "dog"); sync.call()
	T.check(r2.get("ok", false) and r2.restrung == 1, "conductor swap re-strings one line")
	T.check(T.b.g.routes.size() == 1 and T.b.g.routes[0].request.conductorId == "acsr-dog" and T.b.g.routes[0].request.waypoints == wp_before, "same waypoints, new conductor in world.routes (%s)" % str(T.b.g.routes[0].request.conductorId))
	T.check(T.b.g.branches.filter(func(x): return x.kind == "line").size() == 1, "one line branch after the swap")
	# ---- refusal: wood poles over the river ----
	var n_sys: int = sys.call().size()
	var rw: Dictionary = tray.select_kit("family", "wood-9"); sync.call()
	T.check(not rw.get("ok", true) and T.b.g.routes[0].request.familyId == "tubular-13", "wood poles over the river are refused; the line stays")
	var wood_args := ["B2", "B3", "dog", "wood-9", "tubular-13", 70.0, [[1525.0, 425.0], [2125.0, 425.0], [3125.0, 725.0]]]
	var ref: Dictionary = T.b.q("routePreview", wood_args)
	T.check(sys.call().size() == n_sys + 1 and sys.call().back().text == str(ref.refusal.message), "one SYS radio line with the engine's message ('%s')" % str(sys.call().back().text))
	# a waypoint in the river with wood: the chip is the engine's message, once on the radio
	tray.select_kit("crossing", "none")
	tray.activate(tray.item_index("survey")); tray.press_yard("B2"); tray.press_ground(Vector2(1775.0, 1025.0))
	tray.hover_ground(Vector2(2000.0, 1025.0), true)
	var rargs := ["B2", "B3", "dog", "wood-9", null, 70.0, [[1775.0, 1025.0], [2000.0, 1025.0]]]
	var rr: Dictionary = T.b.q("routePreview", rargs)
	T.check(not rr.ok and tray.chip_text == str(rr.refusal.message) and tray.chip_dot == GridTheme.BAD, "refusal in the chip: '%s'" % tray.chip_text)
	var n2: int = sys.call().size(); tray.hover_ground(Vector2(2000.0, 1025.0), true)
	T.check(sys.call().size() == n2, "the same refusal key is not repeated on the radio")
	var fr := tray.press_yard("B3")
	T.check(not fr.get("ok", true) and T.b.g.routes.size() == 1 and tray.from_id == "B2", "finishing a refused survey builds nothing and keeps the survey")
	T.check(tray.cancel() and tray.from_id == "" and tray.waypoints.is_empty(), "cancel clears the survey")
	# ---- replacing a line between the same yards ----
	tray.select_kit("family", "tubular-13"); tray.select_kit("crossing", "tubular-13"); tray.select_kit("span", "70")
	tray.activate(tray.item_index("survey")); tray.press_yard("B2")
	for p in WP: tray.press_ground(p)
	var n3: int = sys.call().size()
	var fr2 := tray.press_yard("B3"); sync.call()
	T.check(fr2.get("ok", false) and T.b.g.routes.size() == 1 and sys.call().size() == n3 + 1 and str(sys.call().back().text).begins_with("A line already joins B2 and B3"), "a second survey between the same yards replaces the first after the radio warns ('%s')" % str(sys.call().back().text))
	# ---- transformers ----
	tray.activate(tray.item_index("xfmr", "dt-250")); sync.call()
	T.check(tray.mode == "xfmr" and world.peg_count() == 4, "a kVA picked: the yards glow")
	T.check(tray.press_yard("B2").get("ok", false) and tray.press_yard("B4").get("ok", false), "placeTransformer on both pairs"); sync.call()
	var xf: Array = T.b.g.branches.filter(func(x): return x.kind == "xfmr")
	T.check(xf.size() == 2 and xf.all(func(x): return x.catalogId == "dt-250"), "two dt-250 in the engine (%d)" % xf.size())
	T.check(tray.mode == "xfmr", "the transformer stays armed for the next pair")
	tray.cancel()
	tray.select_kit("conductor", "weasel"); sync.call()
	T.check(T.b.g.branches.filter(func(x): return x.kind == "xfmr").size() == 2 and T.b.g.routes.size() == 1, "a re-string keeps the transformers")
	# ---- village voltmeter ----
	T.b.act("tick", [8]); sync.call()
	var bi: Dictionary = T.b.q("busInfo", ["B4"]); var v := float(bi.vPu) * float(bi.kvNom) * 1000.0
	var vm: MeterView = ins.vil
	steps = 0
	while not vm.settled() and steps < 600: vm.step(1.0 / 60.0); steps += 1
	T.check(not vm.blank and absf(vm.target - v) < 1e-9, "voltmeter target = engine vPu x kV (%.2f V)" % vm.target)
	T.near(vm.needle_value(), clampf(v, 340.0, 460.0), 0.001 * 120.0, "voltmeter needle rests on the engine value")
	T.near(float(vm.zones[0][1]), float(T.b.q("levelInfo").thresholds.villageBandLoPu) * 420.0, 1e-6, "red below the level's band floor (%f V)" % float(vm.zones[0][1]))
	# ---- locked while the night runs ----
	var lock := {"on": true}; tray.locked = func(): return lock.on
	var kit0 := tray.kit.duplicate(); var nl: int = sys.call().size()
	tray.activate(tray.item_index("survey")); tray.activate(tray.item_index("family", "wood-9"))
	T.check(tray.mode == "" and tray.kit == kit0 and sys.call().size() > nl and str(sys.call().back().text) == tray.tx("TRAY_LOCKED"), "locked while the night runs: nothing changes, the radio says so")
	T.check(tray.press_yard("B2").is_empty() and not tray.press_ground(Vector2(100, 100)), "yard and ground presses refused while locked")
	lock.on = false
	# ---- pad ----
	tray.activate(tray.item_index("survey")); tray.set_target_hi(0)
	T.check(tray.pad_button(JOY_BUTTON_DPAD_RIGHT) and tray.target_hi == 1, "D-pad walks the yards before a start")
	T.check(tray.pad_button(JOY_BUTTON_A) and tray.from_id == "B2", "A picks the highlighted yard as the start")
	var c0 := tray.cursor_m
	tray.pad_button(JOY_BUTTON_DPAD_RIGHT)
	T.check(tray.cursor_on and tray.cursor_m.distance_to(c0) > 0.0 and absf(tray.cursor_m.x - c0.x) == 50.0 and absf(tray.cursor_m.y - c0.y) == 50.0, "D-pad moves the survey cursor in 50 m steps (%s -> %s)" % [str(c0), str(tray.cursor_m)])
	T.check(tray.pad_button(JOY_BUTTON_A) and tray.waypoints.size() == 1, "A drops a waypoint at the cursor")
	T.check(tray.pad_button(JOY_BUTTON_B) and tray.waypoints.is_empty() and tray.mode == "survey", "B removes the last waypoint")
	T.check(tray.pad_button(JOY_BUTTON_B) and tray.from_id == "" and tray.mode == "", "B again cancels the survey")
	T.check(not tray.pad_button(JOY_BUTTON_B), "B with nothing to undo is left to the shell")
	T.check(tray.pad_button(JOY_BUTTON_RIGHT_SHOULDER) and tray.engaged and tray.focus == 0, "RB cycles the cells")
	# ---- keyboard (the earlier re-strings spent the budget: a fresh job) ----
	T.level("L05"); sync.call()
	ev.keycode = KEY_S; T.check(tray.key(ev) and tray.mode == "survey", "S starts a survey")
	tray.press_yard("B2"); for p in WP: tray.press_ground(p)
	tray.hover_ground(Vector2(3900.0, 700.0), true)
	T.check(tray.nearest_end() == "B3", "the nearest yard to the pointer is B3")
	ev.keycode = KEY_ENTER; tray.key(ev); sync.call()
	T.check(T.b.g.routes.size() == 1 and tray.mode == "", "Enter finishes at the nearest yard (replacing the line)")
	ev.keycode = KEY_ESCAPE
	tray.activate(tray.item_index("survey")); T.check(tray.cancel_key() and tray.mode == "", "Esc cancels the survey")
	ev.keycode = KEY_3; T.check(tray.key(ev), "number keys pick a cell")
	T.check(tray.on_long(Vector2.ZERO) == false, "long-press with nothing to remove does nothing")
	T.finish("ROUTE-FLOW", self)
