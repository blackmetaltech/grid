extends SceneTree
## Finale flow (L28), headless with the real engine bridge: the day card shows only on L28 and reads Day 1 with the heatwave threat; the engine's parts reach the tray; the parts shelf
## names no answer and prices every part, buying every fix overspends, taking parts back refunds them, and a plan picked by hand runs through the bridge, the island lamp reads "on its battery" after the lightning and the card never lies about a dark island; the game-end card builds.

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
	var parts := ["cf_tap", "cf_cap", "cf_statcom", "cf_reactor", "cf_spin", "cf_gfm", "cf_line", "cf_feeder", "cf_batt2", "cf_batt4"]
	var all_there := true
	for n in parts: all_there = all_there and kit.has(n)
	T.check(all_there, "the shelf offers ten parts under three threats (%s)" % str(kit))
	# the shelf does not name the answer: every part is open, priced by the engine, and no row is ticked, skipped or marked "not needed" before the player buys
	var honest := true; var priced := true
	for n in parts:
		var bt := (p._kit.get_node(n) as Button)
		honest = honest and not bt.disabled and not bt.text.begins_with("✓") and not bt.text.begins_with("–") and not ("needed" in bt.text)
		priced = priced and ("$" in bt.text or "no cost" in bt.text)
	T.check(honest, "no part is pre-marked as right or not needed")
	T.check(priced, "every part carries its price (%s)" % (p._kit.get_node("cf_batt4") as Button).text)
	T.check("$50.8M" in (p._kit.get_node("cf_batt4") as Button).text and "$53.4M" in (p._kit.get_node("cf_line") as Button).text, "prices are the engine's (battery %s, line %s)" % [(p._kit.get_node("cf_batt4") as Button).text, (p._kit.get_node("cf_line") as Button).text])
	# the safe "buy every fix" plan breaks the budget: a reactor and both island paths on top of the rest
	for id in ["tap", "cap", "reactor", "spin", "line", "batt4"]:
		(p._kit.get_node("cf_" + id) as Button).pressed.emit(); p.refresh()
	var spent := float(T.b.g.budget.spent); var cap := float(T.b.g.budget.capexLimit)
	T.check(spent > cap, "buying every fix overspends the budget (%s of %s)" % [str(spent), str(cap)])
	# take back the reactor and the line by pressing them again: the engine refunds them, the spun unit's fuel stays paid
	for id in ["reactor", "line"]:
		(p._kit.get_node("cf_" + id) as Button).pressed.emit(); p.refresh()
	var spent2 := float(T.b.g.budget.spent)
	T.check(spent2 <= cap and spent2 > 5.3e7, "taken back, the plan fits (%s of %s)" % [str(spent2), str(cap)])
	T.check(not ChfPanel.bought(T.b.g, "line") and not ChfPanel.bought(T.b.g, "reactor") and ChfPanel.bought(T.b.g, "spin"), "the line and the reactor are gone, U4 still spins")
	T.check((p._kit.get_node("cf_spin") as Button).disabled and (p._kit.get_node("cf_batt4") as Button).text.begins_with("✓"), "bought parts are ticked; the spun unit cannot be taken back")
	T.check(not (p._kit.get_node("cf_line") as Button).disabled, "the other island path stays open: buying both is the player's call, not the card's")
	for i in 100: T.b.act("tick", [1])
	p.refresh()
	T.check(str(p._day_lbl.text).begins_with("DAY 2 of 3"), "Day 2 after a day of ticks (%s)" % p._day_lbl.text)
	T.check("Storm" in str(p._threat.text), "the storm threat on Day 2")
	for i in 94: T.b.act("tick", [1])
	p.refresh()
	T.check("battery" in str(p._island.text), "after the lightning the island is on its battery (%s)" % p._island.text)
	var n := 0
	while str(T.b.g.get("status", "playing")) == "playing" and n < 300: T.b.act("tick", [1]); n += 1
	p.refresh(); T.check(str(p._day_lbl.text) == "THREE DAYS DONE", "after the end the card says the three days are done (%s)" % p._day_lbl.text)
	T.check(str(T.b.g.get("status", "")) == "won", "the plan picked by hand (taps, capacitor, U4, the 4-hour battery) wins all three days (%s after %d ticks, %s)" % [str(T.b.g.get("status", "")), n, str(T.b.g.get("statusReason", ""))])
	# a STATCOM placed by hand in the tray shows on the shelf as bought, and pressing it takes it back with a refund; its map peg names it a STATCOM
	T.level("L28"); p.refresh()
	T.check(not (p._kit.get_node("cf_statcom") as Button).disabled and float(T.b.g.budget.spent) == 0.0, "a fresh L28: the shelf is open and nothing is spent")
	var r := T.b.act("placeShunt", ["B4", "statcom-200", 1]); T.check(bool(r.get("ok", false)), "a STATCOM placed at Eastgate 400 (%s)" % str(r.get("message", "")))
	p.refresh()
	var ct := (p._kit.get_node("cf_statcom") as Button).text
	T.check(ct.begins_with("✓") and not (p._kit.get_node("cf_cap") as Button).text.begins_with("✓"), "the hand-placed STATCOM reads bought, the capacitor does not (%s)" % ct)
	var tray := GridTray.new(); tray.b = T.b; root.add_child(tray)
	var pegs: Array = tray.elements("shunt")
	T.check(pegs.size() == 1 and "STATCOM" in str(pegs[0].label) and not ("bank" in str(pegs[0].label)), "the STATCOM's map peg names its kind (%s)" % (str(pegs[0].label) if not pegs.is_empty() else "none"))
	T.finish("CHF-FLOW", self)
