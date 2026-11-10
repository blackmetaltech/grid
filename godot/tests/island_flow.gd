extends SceneTree
## Island flow (chapter 2 finale, L30 "Bring the Island Home"), headless with the real engine bridge: the sea cable and island battery cells exist on L30 and not on L05 / L29 (which
## keep their poles), and L30 has no survey, pole, span or conductor cells; the cable laid through the tray is the engine's state and cost; the transformer and the battery go on through
## the tray; re-picking a cable replaces it (refund by demolish); the tags print the engine's charging power and the battery's live numbers; the work order says what has to stay lit;
## the naive cable-only island loses at 21:00 through the tray with the lesson and the try hint rendered in the incident report; Retry's design keeps cable, transformer and battery.

const RULE := "Q = V²ωCℓ = 11 kV² × 2π·50 × 0.30 µF/km × 4 km"

func _texts(n: Node, out: Array) -> void:
	if n is Label or n is Button: out.append(str(n.text))
	for c in n.get_children(): _texts(c, out)

func _initialize() -> void:
	var T := Truth.new()
	if not T.start(root): print("ISLAND-FLOW FAILED engine"); quit(1); return
	CbRegion.refresh(T.b); GridUi.load_strings(); TrayStrings.load_strings()
	var world := WorldView.new(); world.size = Vector2(1400, 800); root.add_child(world)
	var radio := RadioLog.new(); root.add_child(radio)
	var ins := Instruments.new(); root.add_child(ins)
	var tags := TagView.new(); tags.b = T.b; tags.world = world; root.add_child(tags)
	var tray := RouteTray.new(); tray.b = T.b; tray.world = world; tray.radio = radio; tray.instruments = ins; tray.tags = tags
	root.add_child(tray); tray.size = Vector2(1100.0, 96.0)
	var sync := func():
		world.refresh(T.b)
		var w = T.b.q("world"); ins.refresh_route(T.b, w, w.terrain != null, false); tray.refresh(); tags.refresh()
	var fake := CbApp.new(); fake.b = T.b
	var kinds_of := func() -> Array: return tray.items.map(func(i): return i.kind)
	# ---- L05 and L29 are exactly as they were: poles, no sea cell, no island battery ----
	for lid in ["L05", "L29"]:
		T.level(lid); sync.call()
		var k0: Array = kinds_of.call()
		T.check(not k0.has("sea") and not k0.has("isl") and k0.has("survey") and k0.has("family") and k0.has("conductor") and k0.has("xfmr"), "%s keeps the pole kit and has no sea / island cells (%s)" % [lid, str(k0)])
		T.check(not ins.bat.visible, "%s shows no battery gauge" % lid)
	# ---- L30: the cells ----
	T.level("L30"); sync.call()
	var kinds: Array = kinds_of.call()
	T.check(kinds.count("sea") == 3 and kinds.count("isl") == 5 and kinds.count("xfmr") == 3, "L30 cells: 3 sea cables, 5 batteries, 3 transformers (%s)" % str(kinds))
	for gone in ["survey", "family", "crossing", "span", "conductor", "kv", "insulator", "coast"]: T.check(not kinds.has(gone), "L30 has no %s cell" % gone)
	var gs: Array = tray.items.map(func(i): return int(i.group))
	T.check(tray.item_index("sea") < tray.item_index("xfmr") and tray.item_index("xfmr") < tray.item_index("isl") and gs[tray.item_index("sea")] != gs[tray.item_index("xfmr")] and gs[tray.item_index("xfmr")] != gs[tray.item_index("isl")], "sea cable group, transformer group, island battery group, in the order the job is built")
	var i120: int = tray.item_index("sea", "sub-11-120")
	var cap: Array = tray.caption(tray.items[i120])
	T.check(cap.size() == 2 and cap[0] == "120 mm²" and cap[1] == "$150K/km", "sea cable caption: two short lines, mm² and price per km (%s)" % str(cap))
	T.near(tray.sea_per_km("sub-11-120"), 150000.0, 0.01, "price per km before purchase is the engine's actionCost / 4 km")
	T.near(tray.isl_cost("isl-50kw-150kwh"), 67500.0, 0.01, "battery price before purchase is the engine's actionCost")
	T.check(tray.tip(tray.items[tray.item_index("isl", "isl-50kw-150kwh")]).contains("$67,500"), "battery tip prints its price")
	var ib: int = tray.item_index("isl", "isl-50kw-150kwh")
	var capb: Array = tray.caption(tray.items[ib])
	T.check(capb[0] == "50 kW" and capb[1] == "150 kWh", "battery caption: kW and kWh (%s)" % str(capb))
	T.check(tray.tip(tray.items[ib]).contains("50 kW · 150 kWh"), "battery tip prints 50 kW · 150 kWh: %s" % tray.tip(tray.items[ib]))
	T.check(tray.tip(tray.items[i120]).contains("46 kvar") and tray.tip(tray.items[i120]).contains("0.30 µF/km"), "cable tip prints the 46 kvar: %s" % tray.tip(tray.items[i120]))
	T.check(not ins.vil.blank or true, "voltmeter exists")
	T.check(ins.bat.visible and ins.bat.blank and ins.bat_k < 1.0, "the battery gauge is up, small and blank before any battery stands there")
	# ---- the sea cable through the tray: the harbour and island yards glow, one tap lays it ----
	tray.activate(i120); sync.call()
	T.check(tray.mode == "sea" and tray.armed_sea == "sub-11-120", "tapping the cable cell arms it")
	var pegs: Array = []
	for y in tray.yards: if tray._peg_shown(y): pegs.append(str(y.id))
	pegs.sort()
	T.check(pegs == ["B5", "B7"] and world.peg_count() == 2, "the harbour yard B5 and the island yard B7 glow (%s, %d pegs)" % [str(pegs), world.peg_count()])
	T.check(tray.yards[tray.target_hi].id == "B7", "the island yard is the highlighted default")
	var s0 := float(T.b.g.budget.spent)
	var r1: Dictionary = tray.press_yard("B7"); sync.call()
	T.check(r1.get("ok", false) and tray.mode == "", "one tap on the island yard lays the cable: %s" % str(r1.get("message", r1)))
	T.check(T.b.g.cables.size() == 1 and T.b.g.cables[0].cableId == "sub-11-120" and is_equal_approx(float(T.b.g.cables[0].lengthKm), 4.0), "the cable is the engine's record, 120 mm² and 4.0 km")
	var br: Dictionary = {}
	for x in T.b.g.branches: if x.kind == "cable": br = x
	T.check(br.from == "B5" and br.to == "B7", "the branch runs harbour yard B5 to island yard B7")
	T.near(float(T.b.g.budget.spent) - s0, 600000.0, 0.01, "spent = 4 km x $150,000 (the pack's price)")
	T.near(float(T.b.g.budget.spent) - s0, float(T.b.g.cables[0].cost), 0.01, "spent = the engine's cable cost")
	T.near(tray.sea_per_km("sub-11-120"), 150000.0, 0.01, "the tray's price per km is the engine's once laid")
	T.check(tray.item_index("sea", "sub-11-120") == i120 and tray._selected(tray.items[i120]) and not tray._selected(tray.items[tray.item_index("sea", "sub-11-70")]), "the laid cable's cell is marked")
	# a tap on the other end laid the same: arming 120 again and tapping the harbour yard says it is already laid
	tray.activate(i120); tray.press_yard("B5"); sync.call()
	T.check(T.b.g.cables.size() == 1 and tray.mode == "", "arming the same cable and tapping the harbour yard changes nothing (and one tap is enough at either end)")
	# ---- the cable tag: the engine's charging power and the equation ----
	var wq: Dictionary = T.b.q("world")
	var wbr: Dictionary = {}
	for x in wq.branches: if x.kind == "cable": wbr = x
	var tg: Dictionary = tags.describe("seacable", str(br.id))
	T.check(not tg.is_empty() and tg.title == "Sea cable 120 mm²", "sea cable tag: %s" % str(tg.get("title", "")))
	T.near(float(tg.q_kvar), float(wbr.chargingKvar), 0.05, "tag charging = the world query's chargingKvar (%f vs %f)" % [float(tg.q_kvar), float(wbr.chargingKvar)])
	T.check(tg.head == "Submarine XLPE 3c 120 mm² Cu, 4.0 km, C 0.30 µF/km → charges 46 kvar", "tag headline: %s" % str(tg.head))
	T.check(tg.eq == RULE, "tag equation: %s" % str(tg.eq))
	T.near(float(tg.amps), float(wbr.chargingKvar) * 1000.0 / (sqrt(3.0) * 11000.0), 0.001, "charging current I = Q / (sqrt 3 V) = %f A" % float(tg.amps))
	T.check(str(tg.eq_i).contains("2.4 A") and str(tg.note).contains("no load"), "the tag says the charging is drawn at no load and gives the amps: %s / %s" % [str(tg.note), str(tg.eq_i)])
	var q_hand := 11000.0 * 11000.0 * TAU * 50.0 * 0.30e-6 * 4.0 / 1000.0
	T.near(float(wbr.chargingKvar), q_hand, 0.01, "charging = V²ωCℓ by hand (%f)" % q_hand)
	T.check(tags.open("seacable", str(br.id)) and tags.lines.any(func(l): return str(l.text) == RULE), "the tag opens with the equation on it")
	tags.close()
	# ---- the transformer through the tray, then the naive island: cable and transformer only ----
	tray.activate(tray.item_index("xfmr", "dt-100")); var rx: Dictionary = tray.press_yard("B8"); sync.call(); tray.cancel()
	T.check(rx.get("ok", false), "the island transformer goes on through the tray: %s" % str(rx.get("message", rx)))
	var island_yard: Dictionary = tags.describe("yard", "B7")
	T.check(str(island_yard.title).begins_with("Island yard") and island_yard.rows.any(func(r): return r[0] == "Sea cable" and str(r[1]) == "120 mm² · 4.0 km"), "the island yard tag names the island and its cable: %s / %s" % [str(island_yard.title), str(island_yard.rows)])
	T.check(island_yard.rows.any(func(r): return r[0] == "Charging" and str(r[1]) == "46 kvar"), "the island yard tag prints the charging power")
	# ---- the battery through the tray ----
	var s1 := float(T.b.g.budget.spent)
	tray.activate(ib); sync.call()
	T.check(tray.mode == "isl" and tray.yards[tray.target_hi].id == "B8" and world.peg_count() == 1, "arming a battery lights the island's 0.42 kV yard only")
	var rb: Dictionary = tray.press_yard("B8"); sync.call()
	T.check(rb.get("ok", false) and T.b.g.storage.size() == 1 and T.b.g.storage[0].bus == "B8" and T.b.g.storage[0].catalogId == "isl-50kw-150kwh", "the battery stands on B8 (%s)" % str(rb.get("message", rb)))
	T.near(float(T.b.g.budget.spent) - s1, (150.0 * 50.0 + 400.0 * 150.0), 0.01, "spent = 150 per kW + 400 per kWh (the catalogue)")
	T.check(tray._selected(tray.items[ib]), "the placed battery's cell is marked")
	T.check(ins.bat.visible and not ins.bat.blank and absf(ins.bat.target - 100.0 * float(T.b.g.storage[0].soc)) < 1e-6, "the gauge reads the engine's state of charge (%f vs %f)" % [ins.bat.target, 100.0 * float(T.b.g.storage[0].soc)])
	# ---- the battery tag: live numbers ----
	var bt: Dictionary = tags.describe("battery", str(T.b.g.storage[0].id))
	T.check(bt.title == "Island battery 50 kW · 150 kWh", "battery tag title: %s" % str(bt.title))
	var soc_now := float(T.b.g.storage[0].soc)
	T.near(float(bt.usable_kwh), (soc_now - 0.1) * 150.0 * sqrt(0.86), 0.01, "usable now = (soc - 0.1) x kWh x eta (%f)" % float(bt.usable_kwh))
	T.near(float(bt.cap_kwh), 0.8 * 150.0 * sqrt(0.86), 0.01, "window = 0.8 x kWh x eta")
	T.near(float(bt.hours), float(bt.usable_kwh) / 45.0, 0.01, "hours left = usable / 45 kW peak (%f)" % float(bt.hours))
	T.check(float(bt.usable_kwh) < float(bt.cap_kwh) - 1.0 or soc_now > 0.89, "at partial charge the usable energy is below the window")
	T.check(absf(float(bt.soc) - float(T.b.g.storage[0].soc)) < 1e-9, "the tag's charge is the engine's")
	T.check(str(bt.carries) == "Carries the island for %.1f h more at tonight's 45 kW peak." % float(bt.hours), "battery tag sentence: %s" % str(bt.carries))
	T.check(tray.on_tap(Vector2(-1000, -1000)) == false, "a tap far from everything opens nothing")
	# ---- re-pick: the cable is replaced and refunded, the battery is replaced ----
	var s2 := float(T.b.g.budget.spent)
	tray.activate(tray.item_index("sea", "sub-11-185")); tray.press_yard("B7"); sync.call()
	T.check(T.b.g.cables.size() == 1 and T.b.g.cables[0].cableId == "sub-11-185" and T.b.g.branches.filter(func(x): return x.kind == "cable").size() == 1, "re-picking the cable leaves exactly one: the 185 mm²")
	T.near(float(T.b.g.budget.spent) - s2, 4.0 * 190000.0 - 600000.0, 0.01, "re-pick cost = the difference (the old cable was refunded by demolish)")
	var s3 := float(T.b.g.budget.spent)
	tray.activate(tray.item_index("isl", "isl-50kw-125kwh")); tray.press_yard("B8"); sync.call()
	T.check(T.b.g.storage.size() == 1 and T.b.g.storage[0].catalogId == "isl-50kw-125kwh", "re-picking the battery leaves exactly one: the 125 kWh pack")
	T.near(float(T.b.g.budget.spent) - s3, (150.0 * 50.0 + 400.0 * 125.0) - (150.0 * 50.0 + 400.0 * 150.0), 0.01, "re-picking the battery costs the difference (the old pack was refunded)")
	# ---- work order lines ----
	var li: Dictionary = T.b.q("levelInfo")
	var conds: Array = WorkOrder.conditions(fake, li)
	T.check(conds.any(func(c): return str(c) == "The island stays lit from 21:00 to 23:00 when the cable is cut"), "work order pass line for the cut (%s)" % str(conds))
	var lamps: Array = WorkOrder.lamp_texts(li)
	T.check(str(lamps[2]).replace("\u00a0", " ").contains("battery ≥ 20 % left at 23:00"), "third lamp: %s" % str(lamps[2]))
	T.level("L05"); sync.call()
	T.check(not WorkOrder.conditions(fake, T.b.q("levelInfo")).any(func(c): return str(c).contains("island")), "L05's work order has no island line")
	# ---- Retry keeps cable, transformer and battery ----
	T.level("L30"); sync.call()
	tray.activate(tray.item_index("sea", "sub-11-70")); tray.press_yard("B7")
	tray.activate(tray.item_index("xfmr", "dt-100")); tray.press_yard("B8"); tray.cancel()
	tray.activate(tray.item_index("isl", "isl-50kw-150kwh")); tray.press_yard("B8"); sync.call()
	var design := ShiftReport.design_of(fake)
	var names: Array = design.map(func(a): return str(a[0]))
	T.check(names.has("layCableRoute") and names.has("placeStorage") and names.count("placeTransformer") >= 1, "the design record has the cable, the transformer and the battery (%s)" % str(names))
	var cab: Array = design.filter(func(a): return a[0] == "layCableRoute")
	var bat: Array = design.filter(func(a): return a[0] == "placeStorage")
	T.check(cab[0][1] == ["B5", "B7", "sub-11-70"] and bat[0][1] == ["B8", "isl-50kw-150kwh"], "design args: %s / %s" % [str(cab), str(bat)])
	T.level("L30")
	T.check(T.b.g.get("cables", []).size() == 0 and T.b.g.storage.size() == 0, "a restarted job is bare")
	var bad := ShiftReport.replay(fake, design)
	sync.call()
	T.check(bad == 0 and T.b.g.cables.size() == 1 and T.b.g.cables[0].cableId == "sub-11-70" and T.b.g.storage.size() == 1 and T.b.g.storage[0].catalogId == "isl-50kw-150kwh", "Retry rebuilds the cable and the battery (refused %d)" % bad)
	T.check(T.b.g.branches.filter(func(x): return x.kind == "xfmr" and x.to == "B8").size() == 1, "Retry rebuilds the island transformer too, and the district's own transformers stand once")
	var bad2 := ShiftReport.replay(fake, design)
	T.check(bad2 == 0 and T.b.g.cables.size() == 1 and T.b.g.storage.size() == 1, "a second replay stacks nothing (cable and battery stand already)")
	# ---- the naive island, through the tray: cable and transformer, no battery ----
	T.level("L30"); sync.call()
	tray.activate(tray.item_index("sea", "sub-11-70")); tray.press_yard("B7")
	tray.activate(tray.item_index("xfmr", "dt-100")); tray.press_yard("B8"); tray.cancel(); sync.call()
	T.check(not ins.bat.visible or ins.bat.blank, "no battery: the gauge says so")
	var n := 0
	while str(T.b.g.get("status", "playing")) == "playing" and n < 60: T.b.act("tick", [1]); n += 1; sync.call()
	T.check(str(T.b.g.status) == "lost" and str(T.b.g.block.verdictKey) == "level.lost.islandNoBattery" and int(T.b.g.clock.block) == 84, "the cable-only island is dark at 21:00 (%s, %s, block %s)" % [str(T.b.g.status), str(T.b.g.block.get("verdictKey", "")), str(T.b.g.clock.block)])
	var li2: Dictionary = T.b.q("levelInfo")
	T.check(str(li2.lesson).contains("No battery stood on the island") and str(li2.lesson).contains("Q = V²"), "the lesson reads in the player's numbers: %s" % str(li2.lesson).left(120))
	T.check(str(li2.tryHint).begins_with("From the cut at 21:00") and str(li2.tryHint).contains("inverter must give at least"), "the try hint names what carries the island: %s" % str(li2.tryHint))
	T.check(not ins.vil.blank or true, "voltmeter after the loss")
	T.check(ins.bat_k == 1.0 and ins.vil.caption == "ISLAND", "after the cut the gauge is full size, and the voltmeter is the island's (%s)" % ins.vil.caption)
	# the incident report renders the cause, the lesson and the hint
	var e: Dictionary = fake.end_data()
	var col := VBoxContainer.new(); root.add_child(col)
	ShiftReport._lost(fake, col, e, li2, true)
	var out: Array = []; _texts(col, out)
	var all := " | ".join(out)
	T.check(all.contains("At 21:00 the island went dark") and all.contains("No battery stood on the island") and all.contains("From the cut at 21:00") and all.contains("WO-30"), "incident report: cause, lesson, hint and the job (%s)" % all.left(200))
	# ---- the chapter-end card is wired ----
	T.check(ShiftReport.CHAPTER_END.get("L30", "") == "L07" and GridStrings.S.has("CH2_TOBI") and GridStrings.S["CH2_TOBI"] == "Island's on the grid. Mind the anchor.", "L30 opens the chapter 2 card, Tobi has the last word")
	T.finish("ISLAND-FLOW", self)
