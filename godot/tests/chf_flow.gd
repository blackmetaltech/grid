extends SceneTree
## Finale flow (L28), headless with the real engine bridge: the day card shows only on L28 and reads Day 1 with the heatwave threat; the engine's parts reach the tray; the parts shelf
## names no answer and prices every part, buying every fix overspends, taking parts back refunds them, the live calls (spin U4 for the hours left, the north feeder) work during the run (DECISIONS 20), and a plan picked by hand runs through the bridge, the island lamp reads "on its battery" after the lightning and the card never lies about a dark island; the game-end card builds.

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
	for id in ["tap", "cap", "reactor", "line", "batt4"]:
		(p._kit.get_node("cf_" + id) as Button).pressed.emit(); p.refresh()
	var spent := float(T.b.g.budget.spent); var cap := float(T.b.g.budget.capexLimit)
	T.check(spent > cap, "buying every fix overspends the budget (%s of %s)" % [str(spent), str(cap)])
	# take back the reactor and the line by pressing them again: the engine refunds them
	for id in ["reactor", "line"]:
		(p._kit.get_node("cf_" + id) as Button).pressed.emit(); p.refresh()
	var spent2 := float(T.b.g.budget.spent)
	T.check(spent2 <= cap and spent2 > 5.3e7, "taken back, the plan fits (%s of %s)" % [str(spent2), str(cap)])
	T.check(not ChfPanel.bought(T.b.g, "line") and not ChfPanel.bought(T.b.g, "reactor"), "the line and the reactor are gone")
	T.check((p._kit.get_node("cf_spin") as Button).disabled and not ChfPanel.bought(T.b.g, "spin"), "with the 4-hour battery the card will not commit three days of U4's fuel the budget cannot pay (DECISIONS 20)")
	T.check((p._kit.get_node("cf_batt4") as Button).text.begins_with("✓"), "bought parts are ticked")
	T.check(not (p._kit.get_node("cf_line") as Button).disabled, "the other island path stays open: buying both is the player's call, not the card's")
	T.check(not p._live.visible, "no live calls before the run")
	for i in 100: T.b.act("tick", [1])
	p.refresh()
	T.check(str(p._day_lbl.text).begins_with("DAY 2 of 3"), "Day 2 after a day of ticks (%s)" % p._day_lbl.text)
	T.check("Storm" in str(p._threat.text), "the storm threat on Day 2")
	T.check(p._live.visible and p._live.get_node_or_null("cf_live_spin") != null, "the live calls show while the day runs, folded card or not")
	T.check((p._live.get_node("cf_live_spin") as Button).disabled, "at Day 2 01:00 the fuel for the hours left is still over the budget (%s)" % (p._live.get_node("cf_live_spin") as Button).text)
	for i in 8: T.b.act("tick", [1])
	p.refresh()
	var sp := p._live.get_node("cf_live_spin") as Button
	T.check(not sp.disabled and "$" in sp.text, "at the radio's call (Day 2 03:00) U4 can be spun for the hours left (%s)" % sp.text)
	sp.pressed.emit(); p.refresh()
	T.check(ChfPanel.bought(T.b.g, "spin") and float(T.b.g.budget.spent) <= cap, "U4 spins and the bill fits (%s of %s)" % [str(T.b.g.budget.spent), str(cap)])
	for i in 86: T.b.act("tick", [1])
	p.refresh()
	T.check("battery" in str(p._island.text), "after the lightning the island is on its battery (%s)" % p._island.text)
	var n := 0
	while str(T.b.g.get("status", "playing")) == "playing" and n < 300: T.b.act("tick", [1]); n += 1
	p.refresh(); T.check(str(p._day_lbl.text) == "THREE DAYS DONE", "after the end the card says the three days are done (%s)" % p._day_lbl.text)
	T.check(str(T.b.g.get("status", "")) == "won" and int(T.b.g.get("stars", 0)) == 3, "taps, capacitor, the 4-hour battery and U4 spun at the call win three lamps (%s, %s stars, %s)" % [str(T.b.g.get("status", "")), str(T.b.g.get("stars", 0)), str(T.b.g.get("statusReason", ""))])
	# the cheaper island answer: the 2-hour battery with the north feeder opened from the card when the lightning comes
	T.level("L28"); p.refresh()
	for id in ["tap", "cap", "spin", "batt2"]:
		(p._kit.get_node("cf_" + id) as Button).pressed.emit(); p.refresh()
	for i in 190: T.b.act("tick", [1])
	p.refresh()
	var fb := p._live.get_node("cf_live_shed") as Button
	T.check(not fb.disabled and "north feeder" in fb.text, "at the lightning the card offers the island's north feeder (%s)" % fb.text)
	fb.pressed.emit(); p.refresh()
	T.check(ChfPanel.north_open(T.b.g) and (p._live.get_node("cf_live_shed") as Button).text.begins_with("✓"), "the north feeder is open and the card says so")
	n = 0
	while str(T.b.g.get("status", "playing")) == "playing" and n < 300: T.b.act("tick", [1]); n += 1
	T.check(str(T.b.g.get("status", "")) == "won" and not ChfPanel.north_open(T.b.g), "the 2-hour battery lasts the night with the feeder open; the 06:00 repair closes it again (%s, %s)" % [str(T.b.g.get("status", "")), str(T.b.g.get("statusReason", ""))])
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
