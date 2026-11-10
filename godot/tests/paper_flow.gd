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

static func _texts(root: Node) -> String:
	var out: Array = []; _find(root, func(n): return n is Label or n is Button, out)
	return " | ".join(out.map(func(l): return str(l.text)))

static func _play_until_over(app: CbApp, max_ticks: int) -> void:
	for i in max_ticks:
		if str(app.b.g.get("status", "playing")) != "playing": break
		app.next_tick(); await _frames(app, 1)

static func run(app: CbApp) -> void:
	var ck := CbSmoke._check
	var quiet0: bool = app.quiet; var auto0 := WorkOrder.auto; var inst0 := WorkOrder.instant_next
	app.quiet = false; WorkOrder.auto = true
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
	if eng != null:
		eng.pressed.emit(); await _frames(app, 4)
		ck.call(str(app.b.g.get("mode", "")) == "engineer" and WorkOrder.is_open() and int(app.b.g.get("tick", 0)) == int(app.b.g.get("levelStart", -1)), "paper flow: the chip restarts the job as Engineer and the docket is back")
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
	# --- Retry restarts the job ---
	var retry := _button(rep, "Retry") if rep != null else null
	if retry != null: retry.pressed.emit()
	await _frames(app, 4)
	ck.call(str(app.b.g.get("status", "")) == "playing" and int(app.b.g.get("tick", 0)) == int(app.b.g.get("levelStart", -1)) and app.end_ui == null, "paper flow: Retry starts the job again from the beginning")
	ck.call(ShiftReport.host_node() == null and WorkOrder.is_open(), "paper flow: the report is gone and the work order is back")
	CbSmoke._key(app, KEY_ESCAPE); await _frames(app, 3)
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
		ck.call(_count(rep, func(n): return n is PaperKit.PaperHist) == 1, "paper flow: the histogram is on the shift report")
		ck.call(_texts(rep).contains(TranslationServer.translate("REP_COST")) and _texts(rep).contains(TranslationServer.translate("REP_LOSS")), "paper flow: cost and line loss metrics")
		ck.call(_button(rep, "Copy") != null and _button(rep, "Retry") != null, "paper flow: Retry and Copy design code")
		var cp := _button(rep, "Copy"); if cp != null: cp.pressed.emit()
		ck.call(DisplayServer.get_name() == "headless" or DisplayServer.clipboard_get().begins_with("CB1."), "paper flow: Copy design code puts the CB1 code on the clipboard")
	app.menus.end_look(); await _frames(app, 3)
	ck.call(app.modal() == null, "paper flow: Look around closes the report")
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
	app.quiet = quiet0; WorkOrder.auto = auto0; WorkOrder.instant_next = inst0
