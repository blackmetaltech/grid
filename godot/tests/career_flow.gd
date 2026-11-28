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
static var story_calls := 0

static func _drive(app: CbApp, seen: Array, max_steps := 12) -> void:
	for i in max_steps:
		await _frames(app, 3)
		var m := app.modal()
		if m == null or m.name == "career": return
		seen.append(str(m.name))
		if m.name == "career_incidents":
			for b in (app.b.q("career").get("story", []) as Array):   # 1.9: a call from someone: answer it, the card goes and the result is said
				if str(b.on) != "incident": continue
				var ok_b := _press(app, m, "Story_%s_a" % str(b.id)); await _frames(app, 2)
				CbSmoke._check(ok_b and _node(m, "Story_" + str(b.id)) == null and (_node(m, "Result") as Label).text != "", "career flow: the call '%s' is answered on the incident sheet" % str(b.id))
				story_calls += 1
			for inc in (app.b.q("career").incidents as Array):
				_press(app, m, "Tie_" + str(inc.id)); await _frames(app, 1)
				var crewed_before := bool(inc.crewed)
				if _press(app, m, "Crew_" + str(inc.id)):
					await _frames(app, 2)
					var cb := _node(m, "Crew_" + str(inc.id)) as Button
					CbSmoke._check(not crewed_before and cb != null and cb.disabled and cb.text == TranslationServer.translate("CAR_INC_CREWED") and _node(m, "Result") != null and (_node(m, "Result") as Label).text != "", "career flow: sending a crew turns the card's button into Crew sent and the engine's sentence shows")
			_press(app, m, "Done")
		elif m.name == "career_ending":
			var rc: Array = app.b.q("career").get("recap", [])
			CbSmoke._check(rc.is_empty() or (_node(m, "Recap") != null and _node(m, "After") != null), "career flow: the ending tells the run (recap %d lines)" % rc.size())
			return
		else: _press(app, m, "Continue")

static func run(app: CbApp) -> void:
	var ck := CbSmoke._check
	var fails0 := CbSmoke.fails
	await app.get_tree().create_timer(2.0).timeout   # the paper flow leaves timers running; let them fire before this flow starts
	var path0 := Career.path
	Career.path = "user://career_flow_test.cfg"; Career.forget()
	GridUi.load_strings()
	# --- entry: the title has a Career line; its docket offers New career only while nothing is saved ---
	CareerScreen.guide_all = false
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
	ck.call(_node(sc.drawer, "GuideCard") != null and _node(sc.drawer, "VegCard") == null and _node(sc.drawer, "Card_recloser") == null, "career flow: quarter 1 is guided: one job, the other tools held back")
	ck.call(not sc.sel.is_empty(), "career flow: quarter 1 picks the weakest asset on the map")
	ck.call(_press(app, sc.drawer, "GuideAll"), "career flow: Show every tool ends the guide"); await _frames(app, 2)
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
	# --- 1.3: the charter chooser and the weekly district ---
	Career.open(app); await _frames(app, 3)
	entry = _modal_named(app, "career_entry")
	ck.call(entry != null and _node(entry, "Weekly") != null and _node(entry, "Choose") != null, "career flow: the docket offers this week's district and the charter chooser")
	if entry != null: _press(app, entry, "Choose")
	await _frames(app, 3)
	var chs := _modal_named(app, "career_charters")
	ck.call(chs != null and _node(chs, "Charter_storm") != null, "career flow: the chooser lists the charters")
	if chs != null: _press(app, chs, "Charter_storm")
	await _frames(app, 4)
	var sc3 := Career.screen(app)
	ck.call(sc3 != null and str(sc3.d.charter) == "storm" and str(sc3.d.code).begins_with("C2/") and sc3.charter_lbl.text != "", "career flow: a Storm Coast career starts, the bar names it and its code is C2")
	if sc3 != null: sc3.queue_free()
	await _frames(app, 2)
	var sc4 := Career.weekly(app); await _frames(app, 4)
	ck.call(sc4 != null and str(sc4.d.weekly) != "" and str(sc4.d.charter) != "standard", "career flow: this week's district starts with a charter and its week")
	if sc4 != null:
		var wk := str(sc4.d.weekly)
		ck.call(Career.weekly_record(wk, 500) == 500 and Career.weekly_record(wk, 300) == 500 and Career.weekly_best(wk) == 500, "career flow: the weekly best keeps the higher score")
		sc4.queue_free()
	await _frames(app, 2)
	# --- 1.9: a letter on the desk: seed 5 has the hospital's letter in year 1; it shows on the board, its answer is taken, the promise is pinned ---
	var sc5 := Career.start(app, 5, "standard"); await _frames(app, 4)
	if sc5 != null:
		for i in 6:
			if (app.b.q("career").get("story", []) as Array).any(func(b): return str(b.id) == "inesPromise"): break
			app.b.act("careerEndQuarter", []); sc5.refresh(); sc5._build_drawer(); await _frames(app, 2)
		sc5.refresh(); CareerScreen.guide_all = true; sc5._build_drawer(); await _frames(app, 3)
		var card := _node(sc5.drawer, "Story_inesPromise")
		ck.call(card != null and _node(card, "StoryBody") != null and (_node(card, "StoryBody") as Label).text.contains("F"), "career flow: the hospital's letter is on the desk with its two answers")
		if card != null: _press(app, card, "Story_inesPromise_a")
		await _frames(app, 3)
		ck.call(_node(sc5.drawer, "Story_inesPromise") == null and _node(sc5.drawer, "Promise") != null, "career flow: answering it takes the letter away and pins the promise")
		CareerScreen.guide_all = false
		sc5.queue_free(); await _frames(app, 2)
	await _district_pass(app, ck)
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

## The 3D district under the screen (the desktop look): the world layer and the title sheet are put away and the district shown while the screen is open; a tap on the map picks a section,
## a drag over it moves the camera and picks nothing; the colour chips reach the district; leaving gives everything back.
static func _district_pass(app: CbApp, ck: Callable) -> void:
	var wv = app.get("grid_world")
	var dn := District3D.new(); dn.name = "District3D"; dn.visible = false; app.add_child(dn); app.set("district3d", dn)
	var title := Control.new(); title.name = "fake_title"; title.set_meta("cb_modal", true); app.root.add_child(title)
	var look0 := GridTheme.look2; GridTheme.look2 = true
	var win := app.get_window(); var size0 := win.size; var forced0 := CbLayout.forced   # the smoke window is phone-sized: the district is the desktop look
	CbLayout.forced = "desktop"; win.size = Vector2i(1920, 1080); win.size_changed.emit(); await _frames(app, 4)
	var wv_vis: bool = wv.visible
	var sc := Career.start(app, 7, "standard"); await _frames(app, 5)
	if sc == null: ck.call(false, "district pass: the career starts"); return
	ck.call(sc.district == dn and dn.visible and not wv.visible and bool(wv.career3d) and not title.visible and sc.map._d3_mode(), "career flow 3D: the district is shown and the world layer and the title are put away")
	ck.call(sc._bg.color.a == 0.0, "career flow 3D: the screen's own ground is clear")
	var tg := sc.map.point_of({"type": "section", "id": "F2.2"})
	var press := InputEventMouseButton.new(); press.button_index = MOUSE_BUTTON_LEFT; press.pressed = true; press.position = tg
	sc.map._gui_input(press)
	var rel := InputEventMouseButton.new(); rel.button_index = MOUSE_BUTTON_LEFT; rel.pressed = false; rel.position = tg
	sc.map._gui_input(rel); await _frames(app, 2)
	ck.call(str(sc.sel.get("id", "")) == "F2.2", "career flow 3D: a tap on a section's place on the map picks it (%s)" % str(sc.sel))
	var g0: Vector3 = dn._g_target; var y0: float = dn._g_yaw
	var pick_before := sc.sel.duplicate()
	var p2 := sc.map.point_of({"type": "section", "id": "F5.3"})
	press.position = p2; press.pressed = true; sc.map._gui_input(press)
	var mv := InputEventMouseMotion.new(); mv.position = p2 + Vector2(60, 0); mv.relative = Vector2(60, 0); mv.button_mask = MOUSE_BUTTON_MASK_LEFT; sc.map._gui_input(mv)
	rel.position = p2 + Vector2(60, 0); sc.map._gui_input(rel); await _frames(app, 2)
	ck.call(str(sc.sel.get("id", "")) == str(pick_before.get("id", "")) and not dn._g_target.is_equal_approx(g0), "career flow 3D: a drag over the district moves the camera and picks nothing")
	var d0: float = dn._g_dist
	var wh := InputEventMouseButton.new(); wh.button_index = MOUSE_BUTTON_WHEEL_UP; wh.pressed = true; wh.position = Vector2(400, 300); sc.map._gui_input(wh)
	ck.call(dn._g_dist < d0, "career flow 3D: the wheel zooms the district in")
	var oy := dn._g_yaw
	var mo := InputEventMouseMotion.new(); mo.position = Vector2(300, 300); mo.relative = Vector2(40, 0); mo.button_mask = MOUSE_BUTTON_MASK_RIGHT; sc.map._gui_input(mo)
	ck.call(not is_equal_approx(dn._g_yaw, oy), "career flow 3D: a right-button drag turns it")
	sc.pad_walk(1); await _frames(app, 2)
	ck.call(str(sc.sel.get("type", "")) != "" and sc.map._d3_mode(), "career flow 3D: LB / RB still walk the pickables")
	var hb := _node(sc, "Colour_health") as Button
	if hb != null: hb.pressed.emit()
	await _frames(app, 2)
	ck.call(dn.mode == "health", "career flow 3D: the colour chips reach the district")
	sc.close(); await _frames(app, 3)
	ck.call(not dn.visible and wv.visible == wv_vis and not bool(wv.career3d) and title.visible, "career flow 3D: leaving gives the world layer and the title back")
	GridTheme.look2 = look0; CbLayout.forced = forced0; win.size = size0; win.size_changed.emit(); app.set("district3d", null); dn.queue_free(); title.queue_free()
	await _frames(app, 2)
