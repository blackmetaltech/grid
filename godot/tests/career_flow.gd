class_name CareerFlow
extends RefCounted
## Career "The Utility" end to end, inside the full app (called from main.gd game_smoke after the paper flow): the entry docket, a new career, the map / board / timeline, a project started through
## the UI, quarters ended through the incident cards to the first annual review (three verdicts), the saved code round-trip, and the phone fit. Prints `CAREER-FLOW OK` when every check holds.

static func _frames(app: CbApp, n := 3) -> void:
	for i in n: await app.get_tree().process_frame

static func _find(n: Node, pred: Callable, out: Array) -> void:
	if pred.call(n): out.append(n)
	for c in n.get_children(): _find(c, pred, out)

static func _count(root: Node, pred: Callable) -> int:
	var out: Array = []; _find(root, pred, out); return out.size()

static func _node(root: Node, nm: String) -> Node:
	if root == null: return null
	var out: Array = []; _find(root, func(n): return n.name == nm and not n.is_queued_for_deletion(), out)
	return out[0] if not out.is_empty() else null

static func _texts(root: Node) -> String:
	var out: Array = []; _find(root, func(n): return n is Label or n is Button, out)
	return " | ".join(out.map(func(l): return str(l.text)))

static func _press(app: CbApp, root: Node, nm: String) -> bool:
	var b := _node(root, nm) as Button
	if b == null or b.disabled: return false
	b.pressed.emit(); return true

static func _modal_named(app: CbApp, nm: String) -> Control:
	var n := app.root.get_node_or_null(nm)
	return n as Control if n != null and not n.is_queued_for_deletion() else null

## Answer whatever sheet is up (incident cards: tie and crew, then Done; reports: Continue), until the career screen is the topmost thing again. Returns the names of the sheets seen.
static func _drive(app: CbApp, seen: Array, max_steps := 12) -> void:
	for i in max_steps:
		await _frames(app, 3)
		var m := app.modal()
		if m == null or m.name == "career": return
		seen.append(str(m.name))
		if m.name == "career_incidents":
			for inc in (app.b.q("career").incidents as Array):
				_press(app, m, "Tie_" + str(inc.id)); await _frames(app, 1)
				var crewed_before := bool(inc.crewed)
				if _press(app, m, "Crew_" + str(inc.id)):
					await _frames(app, 2)
					var cb := _node(m, "Crew_" + str(inc.id)) as Button
					CbSmoke._check(not crewed_before and cb != null and cb.disabled and cb.text == TranslationServer.translate("CAR_INC_CREWED") and _node(m, "Result") != null and (_node(m, "Result") as Label).text != "", "career flow: sending a crew turns the card's button into Crew sent and the engine's sentence shows")
			_press(app, m, "Done")
		elif m.name == "career_ending": return
		else: _press(app, m, "Continue")

static func run(app: CbApp) -> void:
	var ck := CbSmoke._check
	var fails0 := CbSmoke.fails
	await app.get_tree().create_timer(2.0).timeout   # the paper flow leaves timers running; let them fire before this flow starts
	var path0 := Career.path
	Career.path = "user://career_flow_test.cfg"; Career.forget()
	GridUi.load_strings()
	# --- entry: the title has a Career line; its docket offers New career only while nothing is saved ---
	app.to_title(); await _frames(app)
	var title: Control = app.root.get_node_or_null("title")
	ck.call(title != null and _node(title, "Line_career") != null, "career flow: the title has a Career line")
	if title != null and _node(title, "Line_career") != null: (_node(title, "Line_career") as Button).pressed.emit()
	await _frames(app, 3)
	var entry := _modal_named(app, "career_entry")
	ck.call(entry != null and _node(entry, "New") != null and _node(entry, "Continue") == null, "career flow: the entry docket offers New career and no Continue yet")
	if entry != null: _press(app, entry, "New")
	await _frames(app, 4)
	var sc := Career.screen(app)
	ck.call(sc != null and app.modal() == sc, "career flow: New career opens the career screen on top")
	if sc == null: Career.path = path0; print("CAREER-FLOW FAILED"); return
	var d: Dictionary = sc.d
	ck.call(bool(d.get("active", false)) and int(d.t) == 0 and (d.feeders as Array).size() == 9 and (d.primaries as Array).size() == 2, "career flow: a fresh district, 2 primaries and 9 feeders")
	# --- strip: year label, 40 pips, End quarter, readouts ---
	ck.call(sc.year_lbl.text.contains("1") and int(sc.timeline.d.quarters) == 40 and sc.end_btn != null and not sc.end_btn.disabled, "career flow: the strip shows year 1 quarter 1, the 40-quarter timeline and End quarter")
	ck.call(sc.bar_saidi.target > 0.0 and sc.bar_saifi.target > 0.0 and sc.stats.cash.text.begins_with("$"), "career flow: cash and SAIDI / SAIFI against target are shown (%s)" % str(sc.stats.cash.text))
	# --- map: every feeder has points; a tap on a section selects it; the board lights up for it ---
	var pk := sc.map.point_of({"type": "section", "id": "F1.2"})
	ck.call(pk.x > 0.0 and sc.map.pick_at(pk).get("id", "") == "F1.2", "career flow: the map puts F1.2 on screen and picks it (%s)" % str(pk))
	sc.map.picked.emit(sc.map.pick_at(pk)); await _frames(app, 2)
	ck.call(str(sc.sel.get("id", "")) == "F1.2" and _node(sc.drawer, "Start_reconductor") != null and _node(sc.drawer, "Start_tieSwitch") != null, "career flow: picking F1.2 lights up the reconductor and tie cards")
	ck.call(_node(sc.drawer, "Why") != null and (_node(sc.drawer, "Why") as Label).text.contains("SAIDI"), "career flow: a card carries the engine's why-this-helps line (%s)" % (str((_node(sc.drawer, "Why") as Label).text) if _node(sc.drawer, "Why") != null else ""))
	# --- start a project through the UI; it shows under Running; cancel it again ---
	var cash0 := float(sc.d.cash)
	ck.call(_press(app, sc.drawer, "Start_recloser"), "career flow: the Start button of the recloser card is there")
	await _frames(app, 2)
	ck.call((sc.d.projects as Array).size() == 1 and str(sc.d.projects[0].kind) == "recloser", "career flow: Start put a recloser project on the engine's list")
	(_node(sc.tab_row, "Tab_run") as Button).pressed.emit(); await _frames(app, 2)
	ck.call(_node(sc.drawer, "Run_P1") != null or _count(sc.drawer, func(n): return n is Button and str(n.name).begins_with("Cancel_")) == 1, "career flow: the running list shows the project with a Cancel button")
	# vegetation stepper
	(_node(sc.tab_row, "Tab_board") as Button).pressed.emit(); await _frames(app, 2)
	var v0 := int(sc.d.vegLevel); _press(app, sc.drawer, "VegPlus"); await _frames(app, 2)
	ck.call(int(sc.d.vegLevel) == v0 + 1, "career flow: the vegetation stepper raises the budget (%d to %d)" % [v0, int(sc.d.vegLevel)])
	# the worst-assets card: its Start replaces the asset through the engine
	var fixes: Array = []; _find(_node(sc.drawer, "WorstCard"), func(n): return n is Button and str(n.name).begins_with("Fix_"), fixes)
	ck.call(not fixes.is_empty(), "career flow: the Worst assets card lists assets with a Start button")
	if not fixes.is_empty():
		var np := (sc.d.projects as Array).size(); (fixes[0] as Button).pressed.emit(); await _frames(app, 2)
		ck.call((sc.d.projects as Array).size() == np + 1 and str(sc.d.projects[np].kind) == "replaceAssets", "career flow: the Worst assets Start put a replacement on the engine's list")
	# a primary pick shows its units and the transformer card
	sc.map.picked.emit({"type": "primary", "id": "P1"}); await _frames(app, 2)
	ck.call(_node(sc.drawer, "Start_newTransformer") != null and _node(sc.info_box, "Asset_P1-T1") != null, "career flow: picking P1 offers the transformer card and its assets")
	# --- end quarters through the incidents to the first annual review ---
	var seen: Array = []
	var reviews0 := 0
	for q in 4:
		ck.call(_press(app, sc, "EndQuarter"), "career flow: End quarter is pressed (quarter %d)" % (q + 1))
		await _drive(app, seen)
	ck.call(seen.has("career_quarter"), "career flow: a quarter report sheet appeared (%s)" % str(seen))
	ck.call(seen.has("career_review") and (sc.d.reviews as Array).size() == 1, "career flow: the fourth quarter ends with the annual review (%s)" % str(seen))
	ck.call(int(sc.d.t) == 4 and sc.year_lbl.text.contains("2"), "career flow: the strip moved to year 2 (%s)" % sc.year_lbl.text)
	# the review sheet itself: render it again from the engine's first review and look at it
	CareerSheets.review(sc, 0, Callable()); await _frames(app, 3)
	var rv := _modal_named(app, "career_review")
	ck.call(rv != null and _node(rv, "Verdict_regulator") != null and _node(rv, "Verdict_finance") != null and _node(rv, "Verdict_crew") != null, "career flow: the review sheet has the three verdicts")
	if rv != null:
		var t := _texts(rv)
		ck.call(t.contains("Okafor") and t.contains("Vance") and t.contains("Tobi") and (t.contains("GOOD") or t.contains("OK") or t.contains("POOR")), "career flow: each verdict names who judged it and gives a grade")
		ck.call(t.contains(TranslationServer.translate("CAR_RV_MET")) or t.contains(TranslationServer.translate("CAR_RV_MISSED")), "career flow: the review says whether the targets were met")
		_press(app, rv, "Continue")
	await _frames(app, 2)
	# the timeline marks the judged year
	ck.call(int(sc.timeline.d.reviews.size()) == 1, "career flow: the timeline strip knows year 1 was judged")
	# --- the saved code round-trips ---
	var code := str(sc.d.code); var t_before := int(sc.d.t)
	var sv := Career.saved()
	ck.call(str(sv.get("code", "")) == code and int(sv.year) == 2, "career flow: the career code is saved after every action (year %d)" % int(sv.get("year", 0)))
	app.back(); await _frames(app, 3)
	ck.call(Career.screen(app) == null, "career flow: Esc leaves the career screen")
	app.b.act("careerQuit", [])
	ck.call(not bool(app.b.q("career").get("active", true)), "career flow: after careerQuit there is no career in the engine")
	Career.open(app); await _frames(app, 3)
	entry = _modal_named(app, "career_entry")
	ck.call(entry != null and _node(entry, "Continue") != null, "career flow: with a saved career the docket offers Continue")
	if entry != null: _press(app, entry, "Continue")
	await _frames(app, 4)
	sc = Career.screen(app)
	ck.call(sc != null and str(sc.d.code) == code and int(sc.d.t) == t_before, "career flow: Continue replays the saved code to the same quarter (t %s)" % (str(sc.d.t) if sc != null else "-"))
	ck.call(Jobs.list(app).size() > 0, "career flow: the job board lists jobs")
	# --- phone fit ---
	if sc != null: await _phone_fit(app, ck, sc)
	var sc2 := Career.screen(app)
	if sc2 != null: sc2.queue_free()
	await _frames(app, 2)
	Career.forget(); Career.path = path0
	app.b.act("careerQuit", [])
	print("CAREER-FLOW OK" if CbSmoke.fails == fails0 else "CAREER-FLOW FAILED %d" % (CbSmoke.fails - fails0))

## A 2424 x 1080 phone with the harsh safe area: the strip, the map, the info panel, the drawer and the sheets are all inside it, and the End quarter button is reachable.
static func _phone_fit(app: CbApp, ck: Callable, sc0: CareerScreen) -> void:
	var win := app.get_window()
	var size0 := win.size; var forced0 := CbLayout.forced; var env0 := OS.get_environment("CB_INSET")
	OS.set_environment("CB_INSET", "44,8,70,14"); CbLayout.forced = "phone"
	win.size = Vector2i(2424, 1080); win.size_changed.emit(); await _frames(app, 4)
	var vp := app.get_viewport().get_visible_rect().size
	var area := Rect2(app.inset.x, app.inset.y, vp.x - app.inset.x - app.inset.z, vp.y - app.inset.y - app.inset.w)
	var fake: bool = vp.y < 700.0 and PaperKit.compact(app)
	ck.call(fake, "career flow phone fit: the harness got a phone-sized safe area (%s, inset %s)" % [str(vp), str(app.inset)])
	if fake:
		Career.screen(app).queue_free(); await _frames(app, 2)
		var sc := Career.cont(app); await _frames(app, 5)
		sc.map.picked.emit({"type": "section", "id": "F2.2", "feeder": "F2"}); await _frames(app, 3)
		for nm in ["Strip", "Drawer", "InfoPanel", "EndQuarter", "Leave", "CopyCode", "CareerMap"]:
			var n := _node(sc, nm) as Control
			ck.call(n != null and area.grow(1.5).encloses(n.get_global_rect()), "career flow phone fit: %s is inside the safe area (%s in %s)" % [nm, str(n.get_global_rect()) if n != null else "-", str(area)])
		var strip := _node(sc, "Strip") as Control; var mp := sc.map; var ip := _node(sc, "InfoPanel") as Control
		ck.call(mp.get_global_rect().size.y >= 200.0, "career flow phone fit: the map keeps room to draw (%s)" % str(mp.get_global_rect().size))
		ck.call(strip.get_global_rect().end.y <= mp.get_global_rect().position.y + 1.0 and mp.get_global_rect().end.y <= ip.get_global_rect().position.y + 1.0, "career flow phone fit: strip, map and info panel do not overlap")
		# the three sheets
		CareerSheets.quarter(sc, Callable()); await _frames(app, 3)
		var q := _modal_named(app, "career_quarter")
		ck.call(q != null and area.grow(1.5).encloses((q.get_child(1) as Control).get_global_rect()), "career flow phone fit: the quarter report is inside the safe area")
		if q != null: _press(app, q, "Continue")
		await _frames(app, 2)
		CareerSheets.review(sc, 0, Callable()); await _frames(app, 3)
		var r := _modal_named(app, "career_review")
		ck.call(r != null and area.grow(1.5).encloses((r.get_child(1) as Control).get_global_rect()), "career flow phone fit: the annual review is inside the safe area")
		if r != null: _press(app, r, "Continue")
		await _frames(app, 2)
		CareerSheets.ending(sc); await _frames(app, 3)
		var e := _modal_named(app, "career_ending")
		ck.call(e != null and area.grow(1.5).encloses((e.get_child(1) as Control).get_global_rect()), "career flow phone fit: the ending sheet is inside the safe area")
		if e != null: _press(app, e, "Look")
		await _frames(app, 2)
	OS.set_environment("CB_INSET", env0); CbLayout.forced = forced0
	win.size = size0; win.size_changed.emit(); await _frames(app, 4)
