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
	T.check(names.has("placeStorage:3") and names.has("placeShunt:3") and names.has("stringLine:3"), "the engine offers the finale's parts to the tray (%s)" % str(names))
	var kit: Array = []
	for c in p._kit.get_children(): kit.append(str(c.name))
	T.check(kit.has("cf_tap") and kit.has("cf_cap") and kit.has("cf_spin") and kit.has("cf_line") and kit.has("cf_batt"), "the build kit has its five buttons (%s)" % str(kit))
	for id in ["tap", "cap", "spin", "batt"]:   # the recipe by clicks only: the lesson with a battery on the island
		(p._kit.get_node("cf_" + id) as Button).pressed.emit()
		p.refresh()
	T.check(float(T.b.g.budget.spent) > 1.0e6 and float(T.b.g.budget.spent) <= 7.0e7, "the recipe is within the budget (%s)" % str(T.b.g.budget.spent))
	T.check((p._kit.get_node("cf_line") as Button).disabled and (p._kit.get_node("cf_tap") as Button).text.begins_with("✓"), "done buttons are marked and the island's second choice is closed")
	var lt := (p._kit.get_node("cf_line") as Button).text; var bt := (p._kit.get_node("cf_batt") as Button).text
	T.check(lt.begins_with("–") and "not needed" in lt and not lt.begins_with("✓"), "the island option not built reads 'not needed', not done (%s)" % lt)
	T.check(bt.begins_with("✓"), "the island option built is ticked (%s)" % bt)
	for i in 100: T.b.act("tick", [1])
	p.refresh()
	T.check(str(p._day_lbl.text).begins_with("DAY 2 of 3"), "Day 2 after a day of ticks (%s)" % p._day_lbl.text)
	T.check("Storm" in str(p._threat.text), "the storm threat on Day 2")
	for i in 94: T.b.act("tick", [1])
	p.refresh()
	T.check("battery" in str(p._island.text), "after the lightning the island is on its battery (%s)" % p._island.text)
	var n := 0
	while str(T.b.g.get("status", "playing")) == "playing" and n < 300: T.b.act("tick", [1]); n += 1
	T.check(str(T.b.g.get("status", "")) == "won", "the clicked recipe wins all three days (%s after %d ticks, %s)" % [str(T.b.g.get("status", "")), n, str(T.b.g.get("statusReason", ""))])
	# a STATCOM placed by hand covers the Eastgate capacitor: the kit says so instead of ticking a capacitor never built; its map peg names it a STATCOM
	T.level("L28"); p.refresh()
	T.check(not (p._kit.get_node("cf_cap") as Button).disabled, "the capacitor button is open on a fresh L28")
	var r := T.b.act("placeShunt", ["B4", "statcom-200", 1]); T.check(bool(r.get("ok", false)), "a STATCOM placed at Eastgate 400 (%s)" % str(r.get("message", "")))
	p.refresh()
	var ct := (p._kit.get_node("cf_cap") as Button).text
	T.check((p._kit.get_node("cf_cap") as Button).disabled and ct.begins_with("–") and "STATCOM" in ct, "the capacitor button reads 'STATCOM instead' (%s)" % ct)
	var tray := GridTray.new(); tray.b = T.b; root.add_child(tray)
	var pegs: Array = tray.elements("shunt")
	T.check(pegs.size() == 1 and "STATCOM" in str(pegs[0].label) and not ("bank" in str(pegs[0].label)), "the STATCOM's map peg names its kind (%s)" % (str(pegs[0].label) if not pegs.is_empty() else "none"))
	T.finish("CHF-FLOW", self)
