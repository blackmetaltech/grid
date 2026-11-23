class_name PaperFlow
extends RefCounted
## The paper screens end to end, inside the full app (called from main.gd game_smoke, so `CB_SMOKE=1 godot --headless --path godot` runs it):
## title (no kit title nodes) -> "Take the night shift" -> the work order opens -> Esc closes it -> the naive L01 design runs to a loss -> the incident report
## (no histogram anywhere in it) -> Retry restarts the job -> the reference design (hut 120 m, 25 mm2) wins -> the shift report with lit lamp stamps and the
## histogram -> pause menu (Cute mode switch), Jobs clipboard. Animations snap in headless runs, so every state is checked after a couple of frames.

static func _frames(app: CbApp, n := 3) -> void:
	for i in n: await app.get_tree().process_frame

static func _find(n: Node, pred: Callable, out: Array) -> void:
	if pred.call(n): out.append(n)
	for c in n.get_children(): _find(c, pred, out)

static func _count(root: Node, pred: Callable) -> int:
	var out: Array = []; _find(root, pred, out); return out.size()

static func _button(root: Node, nm: String) -> Button:
	var out: Array = []; _find(root, func(n): return n is Button and n.name == nm, out)
	return out[0] if not out.is_empty() else null

static func _job(app: CbApp, id: String) -> Button: return _button(app.modal(), "Job_" + id)

static func _texts(root: Node) -> String:
	var out: Array = []; _find(root, func(n): return n is Label or n is Button, out)
	return " | ".join(out.map(func(l): return str(l.text)))

static func _play_until_over(app: CbApp, max_ticks: int) -> void:
	for i in max_ticks:
		if str(app.b.g.get("status", "playing")) != "playing": break
		app.next_tick(); await _frames(app, 1)
		while app.get("ticker") != null and app.ticker.busy(): await _frames(app, 1)   # 1.8: the tick runs off the main thread

static func run(app: CbApp) -> void:
	var ck := CbSmoke._check
	var quiet0: bool = app.quiet; var auto0 := WorkOrder.auto; var inst0 := WorkOrder.instant_next
	app.quiet = false; WorkOrder.auto = true
	GridSettings.reset_progress()
	# --- title: the game's own, no kit title nodes ---
	app.to_title(); await _frames(app)
	var title: Control = app.root.get_node_or_null("title")
	ck.call(title != null and not app.started and app.modal() == title, "paper flow: the title is up and topmost")
	ck.call(title != null and _count(title, func(n): return n is Button and n.name.begins_with("Line_")) >= 4, "paper flow: the title has its own menu lines")
	ck.call(title != null and _count(title, func(n): return n is Label and (n.text == "NEW GAME" or n.text == "CONTINUE" or n.text == "LEVELS")) == 0, "paper flow: no kit title labels (NEW GAME, CONTINUE, LEVELS)")
	ck.call(title != null and _texts(title).contains("GRID") and _texts(title).contains(TranslationServer.translate("TITLE_SUB")), "paper flow: GRID and its tagline are on the title")
	# --- take the night shift: the work order opens, Esc closes it ---
	var go: Button = _button(title, "Line_night") if title != null else null
	if go == null: go = _button(title, "Line_continue")
	ck.call(go != null, "paper flow: the first menu line is Take the night shift (or Continue)")
	if go != null: go.pressed.emit()
	await _frames(app, 4)
	ck.call(app.started and WorkOrder.is_open() and app.modal() != null and app.modal().name == "workorder", "paper flow: starting the job opens the work order on top")
	if WorkOrder.is_open():
		var wo := WorkOrder.host_node(); var t := _texts(wo)
		ck.call(t.contains("FIRST LIGHT") and t.contains("43.2") and t.contains("TOBI") and t.contains("NIA"), "paper flow: the work order has the job name, the pass condition and the radio transcript")
		ck.call(_count(wo, func(n): return n is PaperKit.Lamp) == 3 and _button(wo, "Take") != null, "paper flow: three target lamps and the Take the job button")
	var eng: Button = null
	if WorkOrder.is_open():
		var cands: Array = []; _find(WorkOrder.host_node(), func(n): return n is Button and n.text == TranslationServer.translate("MODE_CHIP_ENGINEER"), cands)
		if not cands.is_empty(): eng = cands[0]
	ck.call(eng != null, "paper flow: the first job's work order has the Learner / Engineer chip")
	var chip_l := _button(WorkOrder.host_node(), "Chip_learner") if WorkOrder.is_open() else null
	var chip_e := _button(WorkOrder.host_node(), "Chip_engineer") if WorkOrder.is_open() else null
	ck.call(chip_l != null and chip_e != null and bool(chip_l.get_meta("selected")) and not bool(chip_e.get_meta("selected")), "paper flow: the chosen chip (Learner) is marked selected, the other is not")
	ck.call(chip_l != null and _count(chip_l, func(n): return n is PaperKit.ChipCheck) == 1 and _count(chip_e, func(n): return n is PaperKit.ChipCheck) == 0, "paper flow: only the chosen chip carries the pencilled check (and the filled sodium look)")
	if eng != null:
		eng.pressed.emit(); await _frames(app, 4)
		ck.call(str(app.b.g.get("mode", "")) == "engineer" and WorkOrder.is_open() and int(app.b.g.get("tick", 0)) == int(app.b.g.get("levelStart", -1)), "paper flow: the chip restarts the job as Engineer and the docket is back")
		var ce := _button(WorkOrder.host_node(), "Chip_engineer")
		ck.call(ce != null and bool(ce.get_meta("selected")) and _count(ce, func(n): return n is PaperKit.ChipCheck) == 1, "paper flow: after the switch the check moved to Engineer")
		var cands2: Array = []; _find(WorkOrder.host_node(), func(n): return n is Button and n.text == TranslationServer.translate("MODE_CHIP_LEARNER"), cands2)
		if not cands2.is_empty(): cands2[0].pressed.emit(); await _frames(app, 4)
		ck.call(str(app.b.g.get("mode", "")) == "learner", "paper flow: and back to Learner")
	CbSmoke._key(app, KEY_ESCAPE); await _frames(app, 3)
	ck.call(not WorkOrder.is_open() and app.modal() == null, "paper flow: Esc closes the work order")
	var pin: Control = app.chrome.pin
	ck.call(pin.visible, "paper flow: the pin is on the screen after the docket folded")
	app.chrome.pin_pressed.emit(); await _frames(app, 3)
	ck.call(WorkOrder.is_open(), "paper flow: the pin reopens the work order")
	CbSmoke._key(app, KEY_ESCAPE); await _frames(app, 3)
	# --- the naive design loses: incident report, never a histogram ---
	app.b.act("placeHut", [300]); app.b.act("layCable", ["main", 2.5]); app.game_on_changed()
	await _play_until_over(app, 14)
	await _frames(app, 4)
	ck.call(str(app.b.g.get("status", "")) == "lost", "paper flow: the naive L01 design loses")
	ck.call(app.sound.audio.mode == "dc" and is_equal_approx(app.sound.audio.stress, 1.0), "paper flow sound: bench level hums DC, a browned-out hamlet raises the music stress to 1.0")
	var rep: Control = ShiftReport.host_node()
	ck.call(rep != null and app.modal() == rep and app.end_ui == rep, "paper flow: the incident report is up and is the end screen")
	if rep != null:
		ck.call(_texts(rep).contains("INCIDENT REPORT"), "paper flow: it is titled Incident report")
		ck.call(_count(rep, func(n): return n is HistView) == 0, "paper flow: no histogram anywhere in the incident report")
		ck.call(_count(rep, func(n): return n is PaperKit.Lamp) == 0, "paper flow: no lamps on an incident report")
		ck.call(_texts(rep).contains(TranslationServer.translate("REP_TRY")) and _button(rep, "Retry") != null and _button(rep, "Look") != null, "paper flow: what to try, Retry and Look around")
	# --- Look around strands nobody: the pin turns into the red incident / retry pin ---
	var look := _button(rep, "Look") if rep != null else null
	if look != null: look.pressed.emit()
	await _frames(app, 3)
	var pin_t: String = _texts(app.chrome.pin)
	ck.call(app.modal() == null and pin_t.contains(TranslationServer.translate("PIN_INCIDENT")), "paper flow: after Look around the work-order pin reads Incident · Retry")
	ck.call(app.chrome.radio.lines.any(func(l): return str(l.text).contains(TranslationServer.translate("REP_LOOK_HINT"))), "paper flow: the radio tells the player how to get back to work")
	app.chrome.pin_pressed.emit(); await _frames(app, 3)
	ck.call(ShiftReport.is_open() and _texts(ShiftReport.host_node()).contains("INCIDENT REPORT") and _button(ShiftReport.host_node(), "Retry") != null, "paper flow: the red pin reopens the incident report with Retry")
	rep = ShiftReport.host_node()
	# --- Retry restarts the job ---
	var retry := _button(rep, "Retry") if rep != null else null
	var before: Dictionary = (app.b.q("benchStatus").bench as Dictionary).duplicate(true)
	if retry != null: retry.pressed.emit()
	await _frames(app, 4)
	ck.call(str(app.b.g.get("status", "")) == "playing" and int(app.b.g.get("tick", 0)) == int(app.b.g.get("levelStart", -1)) and app.end_ui == null, "paper flow: Retry starts the job again from the beginning")
	var after: Dictionary = app.b.q("benchStatus").bench
	ck.call(before.get("hutM") != null and after.get("hutM") == before.get("hutM") and str(after.get("cableMm2")) == str(before.get("cableMm2")), "paper flow: Retry keeps the design (hut %s m, cables %s)" % [str(after.get("hutM")), str(after.get("cableMm2"))])
	ck.call(ShiftReport.host_node() == null and not WorkOrder.is_open(), "paper flow: the report is gone and the work order stays folded in the pin (no re-read on retry)")
	ck.call(app.chrome.radio.lines.back().text == TranslationServer.translate("REP_RETRY_KEPT"), "paper flow: Tobi says the build is still laid")
	ck.call(not _texts(app.chrome.pin).contains(TranslationServer.translate("PIN_INCIDENT")), "paper flow: after Retry the pin is the work-order pin again")
	# --- the reference design wins: shift report with lit stamps and the histogram ---
	app.b.act("placeHut", [120]); app.b.act("layCable", ["main", 25]); app.game_on_changed()
	await _play_until_over(app, 30)
	await _frames(app, 4)
	ck.call(str(app.b.g.get("status", "")) == "won", "paper flow: the reference design wins")
	ck.call(is_equal_approx(app.sound.audio.stress, 0.2) and app.sound._lit.values().count(true) == 10, "paper flow sound: lit hamlet drops the stress to 0.2 and ten homes are known lit (ten plinks)")
	ck.call(GridSound.overall_mood({"towns": [{"mood": "happy"}, {"mood": "worried"}]}) == "worried" and GridSound.overall_mood({"towns": [{"mood": "asleep"}]}) == "asleep" and GridSound.overall_mood({"towns": [{"mood": "happy"}, {"mood": "sad"}]}) == "sad" and GridSound.overall_mood({"towns": []}) == "", "paper flow sound: overall mood is the worst band")
	rep = ShiftReport.host_node()
	ck.call(rep != null and app.modal() == rep, "paper flow: the shift report is up")
	if rep != null:
		ck.call(_texts(rep).contains("SHIFT REPORT"), "paper flow: it is titled Shift report")
		var lit := _count(rep, func(n): return n is PaperKit.Lamp and n.lit)
		var stamped := _count(rep, func(n): return n is PaperKit.Lamp and n.lit and n.stamp > 0.99)
		ck.call(lit >= 1 and stamped == lit, "paper flow: at least one lamp lit and every lit lamp stamped (%d lit)" % lit)
		var lamp_lines: Array = []; _find(rep, func(n): return n.name == "LampLine", lamp_lines)
		ck.call(lamp_lines.size() == 1 and (lamp_lines[0] as Label).text.begins_with("%d of 3 lamps" % lit), "paper flow: the report's first line says how many lamps were earned (%d)" % lit)
		ck.call(lit == 3 or (lamp_lines[0] as Label).text.contains("Next: "), "paper flow: short of three, the line says what the next lamp needs")
		var rcq: Dictionary = app.b.q("resultCard")
		var few := int(rcq.get("n", 0)) < ShiftReport.HIST_MIN_N
		ck.call(_count(rep, func(n): return n is PaperKit.PaperHist) == (0 if few else 1) and (_count(rep, func(n): return n.name == "FewDesigns") == 1) == few, "paper flow: the histogram is on the shift report when n >= %d, else the one-line 'few designs' note (n=%d)" % [ShiftReport.HIST_MIN_N, int(rcq.get("n", 0))])
		var nxb := _button(rep, "Next")
		ck.call(nxb != null and nxb.has_focus(), "paper flow: a won report focuses Next job by default")
		var ir := ShiftReport.island_rect(app)
		var pr: Rect2 = rep.get_child(1).get_global_rect()
		ck.call(ir.size.x <= 0.0 or app.vw() < 1000.0 or ShiftReport._overlap(Rect2(pr.position - Vector2(app.inset.x, app.inset.y), pr.size), ir) <= 0.0 or pr.size.x <= 470.0, "paper flow: the shift report sits clear of the built island (or has shrunk to its minimum)")
		ck.call(_texts(rep).contains(TranslationServer.translate("REP_COST")) and _texts(rep).contains(TranslationServer.translate("REP_LOSS")), "paper flow: cost and line loss metrics")
		ck.call(_button(rep, "Copy") != null and _button(rep, "Retry") != null, "paper flow: Retry and Copy design code")
		var cp := _button(rep, "Copy"); if cp != null: cp.pressed.emit()
		ck.call(DisplayServer.get_name() == "headless" or DisplayServer.clipboard_get().begins_with("CB1."), "paper flow: Copy design code puts the CB1 code on the clipboard")
	app.menus.end_look(); await _frames(app, 3)
	ck.call(app.modal() == null, "paper flow: Look around closes the report")
	ck.call(_texts(app.chrome.pin).contains(TranslationServer.translate("PIN_DONE_SUB")), "paper flow: after a win the pin offers the report and Next job")
	# --- the pin brings the report back after the job has ended ---
	app.chrome.pin_pressed.emit(); await _frames(app, 3)
	ck.call(ShiftReport.is_open(), "paper flow: the pin reopens the report of a finished job")
	app.menus.end_look(); await _frames(app, 3)
	# --- pause menu and Cute mode ---
	CbSmoke._key(app, KEY_ESCAPE); await _frames(app, 3)
	var pm: Control = app.menu_ui
	ck.call(pm != null and app.modal() == pm and pm.name == "menu", "paper flow: Esc opens the paper pause menu")
	if pm != null:
		var t2 := _texts(pm)
		ck.call(t2.contains("Resume") and t2.contains("Restart job") and t2.contains("Work order") and t2.contains("Settings") and t2.contains("Jobs") and t2.contains("Title"), "paper flow: the pause menu lists Resume, Restart job, Work order, Settings, Jobs, Title")
		var cute0 := GridSettings.cute
		var cb := _button(pm, "Cute")
		if cb != null: cb.pressed.emit()
		ck.call(GridSettings.cute == not cute0 and app.grid_world.cute == GridSettings.cute, "paper flow: the Cute mode switch sets WorldView.cute")
		if cb != null: cb.pressed.emit()
		ck.call(GridSettings.cute == cute0 and app.grid_world.cute == cute0, "paper flow: and switches back")
	CbSmoke._key(app, KEY_ESCAPE); await _frames(app, 3)
	ck.call(app.menu_ui == null and app.modal() == null, "paper flow: Esc closes the pause menu")
	Jobs.open(app); await _frames(app, 3)
	ck.call(app.modal() != null and app.modal().name == "levels" and _button(app.modal(), "Job_L01") != null and _button(app.modal(), "Job_T00") == null, "paper flow: Jobs lists the jobs without the placeholder")
	CbSmoke._key(app, KEY_ESCAPE); await _frames(app, 3)
	ck.call(app.modal() == null, "paper flow: Esc closes Jobs")
	app.b.act("startLevel", ["L07", 1, "learner"]); app.game_on_changed(); await _frames(app, 2)
	var dq: Dictionary = app.b.q("dial")
	ck.call(app.sound.audio.mode == "ac" and absf(app.sound.audio.frequency - float(dq.fHz)) < 0.01, "paper flow sound: grid level hums AC at the dial's frequency")
	# --- dock side: the sheet takes the side the island is not on ---
	var d1 := ShiftReport.dock_for(1920.0, Rect2(100, 200, 500, 400), 700.0)
	ck.call(float(d1.left) > 900.0 and float(d1.w) == 700.0, "paper flow: island on the left -> the sheet docks right")
	var d2 := ShiftReport.dock_for(1920.0, Rect2(1200, 200, 500, 400), 700.0)
	ck.call(float(d2.left) < 100.0 and float(d2.w) == 700.0, "paper flow: island on the right -> the sheet docks left")
	var d2b := ShiftReport.dock_for(1920.0, Rect2(700, 300, 90, 70), 700.0, Rect2(0, 100, 950, 700))
	ck.call(float(d2b.left) > 900.0, "paper flow: both sides clear of the hamlet -> the sheet takes the side that covers less of the island")
	var d3 := ShiftReport.dock_for(1500.0, Rect2(500, 200, 600, 400), 700.0)
	ck.call(float(d3.w) < 700.0 and float(d3.w) >= 460.0, "paper flow: island in the middle -> the sheet shrinks")
	# --- jobs gating: Learner plays in order, Engineer / Sandbox open every job ---
	GridSettings.reset_progress(); CbSettings.last_mode = "learner"
	Jobs.open(app); await _frames(app, 3)
	var jm := app.modal()
	ck.call(_job(app, "L01") != null and not _job(app, "L01").disabled and _job(app, "L02").disabled and _job(app, "L03").disabled and _job(app, "L07").disabled, "paper flow: a fresh Learner has WO-01 open and every later job locked")
	ck.call(_texts(jm).contains("Locked: pass WO-01 first."), "paper flow: a locked job says which one to pass first")
	jm.queue_free(); await _frames(app, 2)
	GridSettings.record_stars("L01", 2); GridSettings.record_pass("L02")
	Jobs.open(app); await _frames(app, 3); jm = app.modal()
	ck.call(not _job(app, "L02").disabled and not _job(app, "L03").disabled and _job(app, "L07").disabled, "paper flow: recorded lamps / passes (grid.cfg) open the next job, no further")
	jm.queue_free(); await _frames(app, 2)
	CbSettings.last_mode = "engineer"
	Jobs.open(app); await _frames(app, 3); jm = app.modal()
	ck.call(not _job(app, "L07").disabled and not _job(app, "L03").disabled, "paper flow: Engineer has every job open")
	jm.queue_free(); await _frames(app, 2)
	CbSettings.last_mode = "sandbox"
	ck.call(Jobs.unlocked(app, "L07"), "paper flow: Sandbox has every job open")
	CbSettings.last_mode = "learner"
	GridSettings.reset_progress()
	# --- chapter end: after WO-03, Next job opens the "Saltmarsh is lit" card, not WO-07 ---
	app.b.act("startLevel", ["L03", 1, "learner"]); app.game_on_changed(); await _frames(app, 3); WorkOrder.close_now()
	ShiftReport._next(app, "L02", "L03"); await _frames(app, 3)
	ck.call(not ShiftReport.chapter_is_open() and str(app.b.q("levelInfo").get("id", "")) == "L03", "paper flow: Next job after WO-02 just starts WO-03")
	WorkOrder.close_now()
	app.b.act("startLevel", ["L03", 1, "learner"]); await _frames(app, 2)
	ShiftReport._next(app, "L03", "L05"); await _frames(app, 3)
	ck.call(ShiftReport.chapter_is_open() and app.modal() == ShiftReport.chapter_node() and str(app.b.q("levelInfo").get("id", "")) == "L03", "paper flow: Next job after WO-03 opens the chapter-end card and does not start WO-05")
	if ShiftReport.chapter_is_open():
		var ct := _texts(ShiftReport.chapter_node())
		ck.call(ct.contains("SALTMARSH IS LIT") and ct.contains("I passed! Well, the exam's tomorrow, but the hall stayed lit all week.") and ct.contains("Chapter 2 · The Mainland") and ct.contains("Brightwater"), "paper flow: the card has the title, Nia's line and Chapter 2 · The Mainland (Brightwater)")
		ck.call(_count(ShiftReport.chapter_node(), func(n): return n is ShiftReport.IslandDoodle) == 1 and _button(ShiftReport.chapter_node(), "Preview") != null, "paper flow: the lit island doodle and the Preview job button")
		_button(ShiftReport.chapter_node(), "Preview").pressed.emit(); await _frames(app, 4)
		ck.call(not ShiftReport.chapter_is_open() and str(app.b.q("levelInfo").get("id", "")) == "L05" and WorkOrder.is_open(), "paper flow: the chapter 2 button opens the WO-05 work order")
		WorkOrder.close_now()
	# --- no old drawer: the Operator Clock is gone and no key chaos opens Build / Inspect / Timeline on a bench level ---
	app.b.act("startLevel", ["L01", 1, "learner"]); app.game_on_changed(); await _frames(app, 3); WorkOrder.close_now(); await _frames(app, 2)
	ck.call(not app.cfg.screens.has("clock") and not app.cfg.dock.any(func(d): return str(d[0]) == "clock") and app.home == "home", "paper flow: no clock screen or dock entry in the config")
	var chaos := [KEY_TAB, KEY_1, KEY_2, KEY_3, KEY_4, KEY_9, KEY_ENTER, KEY_KP_ENTER, KEY_SPACE, KEY_B, KEY_I, KEY_T, KEY_X, KEY_PERIOD, KEY_RIGHT, KEY_DOWN]
	var rng := RandomNumberGenerator.new(); rng.seed = 7
	var leaked := ""
	for i in 160:
		CbSmoke._key(app, chaos[rng.randi() % chaos.size()]); await _frames(app, 1)
		if app.modal() != null: app.back(); await _frames(app, 1)
		if app.cur != app.home or app.holder.visible: leaked = "%s at step %d" % [app.cur, i]; break
		if str(app.b.g.get("status", "playing")) != "playing": break
	ck.call(leaked == "", "paper flow: Tab / digits / Return / B / I / T chaos opens no drawer on a bench level (%s)" % leaked)
	app.back(); app.speed = 0
	await _frames(app, 2)
	# --- scroll cue: more content below shows the cue, the end of the list clears it ---
	var tall := Control.new(); tall.custom_minimum_size = Vector2(100, 900)
	var cbx: PaperKit.CueBox = PaperKit.scroll_box(tall)
	var hold := Control.new(); hold.custom_minimum_size = Vector2(300, 300); hold.size = Vector2(300, 300); app.root.add_child(hold); hold.add_child(cbx); cbx.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	await _frames(app, 4)
	ck.call(cbx.more_below(), "paper flow: a column taller than its sheet shows the 'more' cue")
	cbx.sc.scroll_vertical = 100000; await _frames(app, 3)
	ck.call(not cbx.more_below(), "paper flow: scrolled to the end the cue is gone")
	hold.queue_free()
	# --- phone fit: pause card, work order and report stay inside the safe area on a landscape phone with a notch ---
	await _phone_fit(app, ck)
	app.quiet = quiet0; WorkOrder.auto = auto0; WorkOrder.instant_next = inst0


## Fake a 2424x1080 phone (UI scale 2) with the harsh safe area left 150 / top 32 / bottom 32 (CB_INSET) and check that every paper screen is inside it.
static func _phone_fit(app: CbApp, ck: Callable) -> void:
	var win := app.get_window()
	var size0 := win.size; var forced0 := CbLayout.forced; var env0 := OS.get_environment("CB_INSET")
	OS.set_environment("CB_INSET", "150,32,0,32"); CbLayout.forced = "phone"
	win.size = Vector2i(2424, 1080); win.size_changed.emit(); await _frames(app, 4)
	var vp := app.get_viewport().get_visible_rect().size
	var area := Rect2(app.inset.x, app.inset.y, vp.x - app.inset.x - app.inset.z, vp.y - app.inset.y - app.inset.w)
	var fake: bool = vp.y < 700.0 and app.inset.x > 100.0 and PaperKit.compact(app)
	ck.call(fake, "paper flow phone fit: the harness got a phone-sized safe area (%s, inset %s)" % [str(vp), str(app.inset)])
	if fake:
		app.b.act("startLevel", ["L01", 1, "learner"]); app.game_on_changed(); await _frames(app, 3)
		WorkOrder.close_now(); await _frames(app, 2)
		app.open_menu(); await _frames(app, 3)
		var pn: Control = app.menu_ui.get_child(1)
		ck.call(area.grow(1.0).encloses(pn.get_global_rect()), "paper flow phone fit: the pause card is inside the safe area (%s in %s)" % [str(pn.get_global_rect()), str(area)])
		var dim: ColorRect = app.menu_ui.get_child(0)
		ck.call(dim.get_global_rect().encloses(Rect2(Vector2.ZERO, vp).grow(-1.0)), "paper flow phone fit: the scrim is full-bleed behind the notch (%s)" % str(dim.get_global_rect()))
		app.menus.close_menu(); await _frames(app, 2)
		WorkOrder.open(app); await _frames(app, 3)
		var wo := WorkOrder.host_node()
		var wp: Control = wo.get_child(1)
		ck.call(area.grow(1.0).encloses(wp.get_global_rect()), "paper flow phone fit: the work order is inside the safe area (%s)" % str(wp.get_global_rect()))
		var goal_lbl: Array = []; _find(wo, func(n): return n is Label and n.text == TranslationServer.translate("WO_GOAL"), goal_lbl)
		var pass_lbl: Array = []; _find(wo, func(n): return n is Label and n.text == TranslationServer.translate("WO_PASS"), pass_lbl)
		var cue: Array = []; _find(wo, func(n): return n is PaperKit.CueBox, cue)
		var vis := func(l: Control) -> bool: return cue.is_empty() or (cue[0] as Control).get_global_rect().encloses(l.get_global_rect())
		ck.call(not goal_lbl.is_empty() and not pass_lbl.is_empty() and vis.call(goal_lbl[0]) and vis.call(pass_lbl[0]), "paper flow phone fit: Goal and 'To pass' are visible without scrolling")
		var lastc: Array = []; _find(wo, func(n): return n is PaperKit.Check, lastc)
		ck.call(not lastc.is_empty() and vis.call(lastc[lastc.size() - 1]), "paper flow phone fit: the last pass condition is visible without scrolling")
		WorkOrder.close_now(); await _frames(app, 2)
		app.b.act("placeHut", [300]); app.b.act("layCable", ["main", 2.5]); app.game_on_changed(); await _play_until_over(app, 14); await _frames(app, 4)
		var rp := ShiftReport.host_node()
		if rp != null:
			var rpn: Control = rp.get_child(1)
			ck.call(area.grow(1.0).encloses(rpn.get_global_rect()), "paper flow phone fit: the incident report is inside the safe area (%s)" % str(rpn.get_global_rect()))
			app.menus.end_look(); await _frames(app, 2)
		ShiftReport.chapter_end(app, "L07"); await _frames(app, 3)
		var cn := ShiftReport.chapter_node()
		ck.call(cn != null and area.grow(1.0).encloses(cn.get_child(1).get_global_rect()), "paper flow phone fit: the chapter card is inside the safe area")
		if cn != null: cn.queue_free(); ShiftReport._chapter = {}
		await _frames(app, 2)
		Jobs.open(app); await _frames(app, 3)
		ck.call(area.grow(1.0).encloses(app.modal().get_child(1).get_global_rect()), "paper flow phone fit: the jobs clipboard is inside the safe area")
		app.modal().queue_free(); await _frames(app, 2)
	OS.set_environment("CB_INSET", env0); CbLayout.forced = forced0
	win.size = size0; win.size_changed.emit(); await _frames(app, 4)
