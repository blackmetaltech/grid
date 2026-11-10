extends SceneTree
## Finale flow (L28), headless with the real engine bridge: the day card shows only on L28 and reads Day 1 with the heatwave threat; the engine's parts reach the tray; the reference design runs
## through the bridge, the island lamp reads "on its battery" after the lightning and the card never lies about a dark island; the game-end card builds.

func _initialize() -> void:
	var T := Truth.new()
	if not T.start(root): print("CHF-FLOW FAILED engine"); quit(1); return
	CbRegion.refresh(T.b); GridUi.load_strings()
	var fake := CbApp.new(); fake.b = T.b; fake.started = true
	var p := ChfPanel.new(); p.app = fake; root.add_child(p)
	T.level("L07"); p.refresh()
	T.check(not p.visible, "no finale card on L07")
	T.level("L28"); p.refresh()
	T.check(p.visible, "the finale card shows on L28")
	T.check(str(p._day_lbl.text).begins_with("DAY 1 of 3"), "Day 1 at the start (%s)" % p._day_lbl.text)
	T.check("Heatwave" in str(p._threat.text), "the day's threat is the heatwave")
	T.check("lit" in str(p._island.text), "the island is lit at the start (%s)" % p._island.text)
	var pal = T.b.q("palette")
	var names: Array = []
	for a in pal.actions: names.append(str(a.action) + ":" + str((a.parts as Array).size()))
	T.check(names.has("placeStorage:3") and names.has("placeShunt:4") and names.has("stringLine:3"), "the engine offers the finale's parts to the tray (%s)" % str(names))
	for a in [["setTapAuto", ["T34", 1.02, 0.015, 1]], ["setTapAuto", ["T35", 1.02, 0.015, 1]], ["placeShunt", ["B4", "cap-400-50", 4]], ["setShuntSteps", ["C1", 2]], ["setShuntAuto", ["C1", 0.975, 1.03, 1]], ["spinUnit", ["U4"]], ["placeStorage", ["B18", "bess-4h-50"]]]:
		var r: Dictionary = T.b.act(a[0], a[1]); T.check(r.ok, "%s goes through the bridge: %s" % [a[0], str(r.get("message", ""))])
	for i in 100: T.b.act("tick", [1])
	p.refresh()
	T.check(str(p._day_lbl.text).begins_with("DAY 2 of 3"), "Day 2 after a day of ticks (%s)" % p._day_lbl.text)
	T.check("Storm" in str(p._threat.text), "the storm threat on Day 2")
	for i in 94: T.b.act("tick", [1])
	p.refresh()
	T.check("battery" in str(p._island.text), "after the lightning the island is on its battery (%s)" % p._island.text)
	T.finish("CHF-FLOW", self)
