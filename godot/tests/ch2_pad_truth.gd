extends SceneTree
## Chapter 2 bench by pad (1.19 hand play, Ravi: the pad could not set any L04 / L06 control). Headless with the real engine bridge: pad button events go
## through Ch2Bench.pad_input, the entry its relay node uses. The ring starts in the panel on job start; up / down walk the rows and stay inside the panel;
## left / right nudge a knob or walk a chip row; A picks a chip or opens the number pad on the prediction box. Poles to 12 on L04, ratio to 10 on L06.
## The panel lets go while a dialog, the number pad or the drawer is up. Until the prediction is made the numbers that are its answer read "?".
## The build drawer: on no level does an action without an argument form get a bare Place (it sent "undefined").

class Fake extends CbApp:
	var seen: Array = []
	var hook := Callable()
	func game_on_changed() -> void:
		if hook.is_valid(): hook.call()
	func toast(text: String, _level := "info") -> void: seen.append(text)
	func sfx(_k: String) -> void: pass

func _pad(bench: Ch2Bench, idx: int) -> bool:
	var e := InputEventJoypadButton.new(); e.button_index = idx; e.pressed = true
	var used := bench.pad_input(e)
	var up := InputEventJoypadButton.new(); up.button_index = idx; up.pressed = false
	bench.pad_input(up)   # the release is not a press
	return used

func _initialize() -> void:
	var T := Truth.new()
	if not T.start(root): print("CH2-PAD FAILED engine"); quit(1); return
	CbRegion.refresh(T.b); GridUi.load_strings(); TrayStrings.load_strings()
	var app := Fake.new(); app.b = T.b; app.started = true
	var bench := Ch2Bench.new(); bench.app = app; root.add_child(bench); bench.size = Vector2(1366, 768)
	await process_frame
	app.hook = func(): bench.refresh()
	T.check(app.get_node_or_null("Ch2PadRelay") != null, "the bench hangs its pad relay on the app")
	# ---- L04: the ring starts on the poles knob ----
	T.level("L04"); bench.refresh()
	T.check(bench.pad_free() and bench.pad_stop().get("id", "") == "poles", "job start: the pad ring is on the poles knob (%s)" % str(bench.pad_stop()))
	T.check(_pad(bench, JOY_BUTTON_DPAD_UP) and bench.pad_stop().get("id", "") == "poles", "up on the first row stays inside the panel")
	for i in 4: T.check(_pad(bench, JOY_BUTTON_DPAD_RIGHT), "right on the poles knob is used")
	T.check(int(T.b.q("ch2Bench").machine.poles) == 12, "four rights on the poles knob: 12 poles (%s)" % str(T.b.q("ch2Bench").machine.poles))
	T.check(_pad(bench, JOY_BUTTON_DPAD_LEFT) and int(T.b.q("ch2Bench").machine.poles) == 10, "left steps it back by one pair")
	_pad(bench, JOY_BUTTON_DPAD_RIGHT)
	T.check(_pad(bench, JOY_BUTTON_DPAD_DOWN) and bench.pad_stop().get("id", "") == "turns", "down: the turns knob")
	var t0 := int(T.b.q("ch2Bench").machine.turns)
	_pad(bench, JOY_BUTTON_DPAD_RIGHT)
	T.check(int(T.b.q("ch2Bench").machine.turns) == t0 + 1, "right on turns adds one turn")
	_pad(bench, JOY_BUTTON_DPAD_DOWN); var b0 := float(T.b.q("ch2Bench").machine.fieldT)
	_pad(bench, JOY_BUTTON_DPAD_RIGHT)
	T.near(float(T.b.q("ch2Bench").machine.fieldT), b0 + 0.05, 1e-9, "a press on field B is 0.05 T (it was 0.01: 18 presses to 0.69)")
	_pad(bench, JOY_BUTTON_DPAD_LEFT); _pad(bench, JOY_BUTTON_DPAD_UP)
	T.near(float(T.b.q("ch2Bench").machine.fieldT), b0, 1e-9, "and back")
	_pad(bench, JOY_BUTTON_DPAD_DOWN); _pad(bench, JOY_BUTTON_DPAD_DOWN)
	T.check(bench.pad_stop().get("id", "") == "area", "down twice more: the coil area knob")
	T.check(_pad(bench, JOY_BUTTON_DPAD_DOWN) and bench.pad_stop().get("kind", "") == "predict", "down: the prediction box")
	T.check(_pad(bench, JOY_BUTTON_DPAD_DOWN) and bench.pad_stop().get("kind", "") == "predict", "down on the last row stays inside the panel")
	# the answer is hidden until the prediction is made
	T.check(bench.hide_answer(), "L04 before predicting: the answer is hidden")
	T.check(bench.shown(325.3, 1) == "?", "hidden numbers read '?'")
	T.check(bench.trace_colour() == Ch2Bench.NEUTRAL and bench.value_colour(true) == Ch2Bench.NEUTRAL, "before predicting the scope trace and the voltage cells stay one neutral colour (green on target gave it away)")
	# A on the prediction box opens the number pad; OK sends the prediction
	T.check(_pad(bench, JOY_BUTTON_A), "A on the prediction box is used")
	var np = bench.numpad_host().get_node_or_null("Numpad")
	await process_frame
	T.check(np != null and np.get_viewport().gui_get_focus_owner() != null and str(np.get_viewport().gui_get_focus_owner().name) != "K_13", "the number pad opens on a digit, not OK")
	if np != null:
		np._key("OK")
		T.check(is_instance_valid(np) and not np.is_queued_for_deletion() and T.b.q("ch2Bench").prediction == null, "OK on an empty field does nothing (a stray A sent 6 kW)")
	T.check(np != null, "A opens the number pad")
	T.check(not bench.pad_free() and not _pad(bench, JOY_BUTTON_DPAD_UP), "the panel lets go of the pad while the number pad is up")
	if np != null:
		for k in ["3", "2", "7", "OK"]: np._key(k)
	await process_frame
	T.check(bench.get_viewport().gui_get_focus_owner() != bench.predict_edit, "after OK the prediction box does not keep the focus (its outline read as a second ring, 1.19 GPU check)")
	var pr = T.b.q("ch2Bench").prediction
	T.check(pr is Dictionary and is_equal_approx(float(pr.predicted), 327.0), "the pad's 327 reaches the engine as the prediction (%s)" % str(pr))
	bench.refresh()
	T.check(not bench.hide_answer() and bench.shown(325.3, 1) == "325.3", "after predicting every number shows")
	# 1.19 (DECISIONS 29): the prediction binds. The box locks for this design; a new design hides the numbers and asks again; back to the predicted one, they show
	T.check(not bench.predict_edit.editable and bench.predict_btn.modulate.a < 0.9, "predicted: the box locks for this design and Predict dims")
	T.check(not bench.predict_btn.disabled and bench.predict_btn.focus_mode != Control.FOCUS_NONE, "Predict stays a focus target (disabled, the core pad parked its focus on why?: a second ring, 1.19 GPU check)")
	var n0p := app.seen.size(); bench.predict_btn.pressed.emit()
	T.check(app.seen.size() == n0p + 1 and str(app.seen[-1]) == "You already predicted this design." and is_equal_approx(float(T.b.q("ch2Bench").prediction.predicted), 327.0), "pressing the dimmed Predict says why and changes nothing")
	var n1 := app.seen.size(); _pad(bench, JOY_BUTTON_A)
	T.check(bench.numpad_host().get_node_or_null("Numpad") == null and app.seen.size() == n1 + 1 and str(app.seen[-1]) == "You already predicted this design.", "A on the locked box says why (%s)" % str(app.seen.slice(n1)))
	_pad(bench, JOY_BUTTON_DPAD_UP); _pad(bench, JOY_BUTTON_DPAD_RIGHT)
	T.check(bench.hide_answer() and bench.shown(325.3, 1) == "?" and bench.predict_edit.editable, "a new coil area: the numbers hide again and the box opens for a new prediction")
	_pad(bench, JOY_BUTTON_DPAD_LEFT)
	T.check(not bench.hide_answer() and not bench.predict_edit.editable, "back to the predicted winding: they show and the box locks again")
	_pad(bench, JOY_BUTTON_DPAD_DOWN)
	# locked: the night runs, a nudge is refused and says why
	app.speed = 1; var n0 := app.seen.size(); var p0 := int(T.b.q("ch2Bench").machine.poles)
	_pad(bench, JOY_BUTTON_DPAD_UP); _pad(bench, JOY_BUTTON_DPAD_UP); _pad(bench, JOY_BUTTON_DPAD_UP); _pad(bench, JOY_BUTTON_DPAD_UP)
	_pad(bench, JOY_BUTTON_DPAD_RIGHT)
	T.check(int(T.b.q("ch2Bench").machine.poles) == p0 and app.seen.size() == n0 + 1, "while the night runs a pad nudge changes nothing and says why")
	app.speed = 0
	# a dialog or the drawer takes the pad back
	app.set("_cover_px", 360.0)
	T.check(not bench.pad_free() and not _pad(bench, JOY_BUTTON_DPAD_DOWN), "an open drawer takes the pad")
	app.set("_cover_px", 0.0)
	T.check(bench.pad_free(), "a closed drawer gives it back")
	# ---- B hands the pad back to the shell (1.20: the D-pad no longer reached the radio's why?) ----
	var why := Button.new(); why.text = "why?"; why.focus_mode = Control.FOCUS_ALL; root.add_child(why)   # stands in for the radio's why?
	why.grab_focus(); await process_frame
	T.check(bench.pad_held and _pad(bench, JOY_BUTTON_B) and not bench.pad_held, "B with the ring in the panel lets go of the pad")
	T.check(not _pad(bench, JOY_BUTTON_DPAD_UP) and not _pad(bench, JOY_BUTTON_DPAD_LEFT), "after B the D-pad goes to the shell (it can reach why?)")
	T.check(not _pad(bench, JOY_BUTTON_A) and not bench.pad_held, "after B, A on another control is the shell's")
	T.check(not _pad(bench, JOY_BUTTON_B), "a second B is the shell's too")
	bench.predict_btn.grab_focus(); _pad(bench, JOY_BUTTON_DPAD_LEFT); bench._process(0.016)
	T.check(not bench.pad_held, "from Predict (where B leaves the focus) a D-pad press walks away; it does not take the ring back")
	T.check(bench.predict_edit.focus_mode == Control.FOCUS_CLICK, "the prediction box takes focus by click only (the pad never parks in it)")
	why.grab_focus()
	_pad(bench, JOY_BUTTON_DPAD_DOWN); bench.predict_btn.grab_focus(); bench._process(0.016)   # the shell's D-pad moved its focus onto the panel's Predict
	T.check(bench.pad_held, "a D-pad press that lands on the panel takes the ring back")
	_pad(bench, JOY_BUTTON_B); why.grab_focus(); bench._process(0.016)
	T.check(not bench.pad_held, "B again: the shell has it")
	bench.predict_btn.grab_focus(); bench._process(0.016)
	T.check(not bench.pad_held, "focus moved there without a D-pad press (B parks it) does not take the ring")
	T.check(_pad(bench, JOY_BUTTON_A) and bench.pad_held and bench.numpad_host().get_node_or_null("Numpad") == null, "A on the panel's Predict takes the ring back (and does not press Predict)")
	why.grab_focus()
	# ---- L06: ratio chips, kVA chips, prediction ----
	T.level("L06"); bench.refresh()
	T.check(bench.pad_free() and bench.pad_stop().get("id", "") == "ratio" and int(bench.pad_stop().arg) == int(bench.q.town.ratio), "job start: the ring is on the chosen ratio chip (%s)" % str(bench.pad_stop()))
	T.check(bench.hide_answer(), "L06 before predicting: the answer is hidden")
	var ratios: Array = (bench.q.ratios as Array).map(func(x): return int(x)); var want := ratios.find(10)
	for i in want: _pad(bench, JOY_BUTTON_DPAD_RIGHT)
	T.check(int(bench.pad_stop().get("arg", -1)) == 10, "rights walk the ratio chips to 10:1 (%s)" % str(bench.pad_stop()))
	T.check(int(T.b.q("ch2Bench").town.ratio) == 1, "walking does not choose")
	T.check(_pad(bench, JOY_BUTTON_A) and int(T.b.q("ch2Bench").town.ratio) == 10, "A chooses 10:1 (%s)" % str(T.b.q("ch2Bench").town.ratio))
	for i in 20: _pad(bench, JOY_BUTTON_DPAD_RIGHT)
	T.check(int(bench.pad_stop().get("arg", -1)) == int(ratios[-1]), "right stops at the last chip")
	_pad(bench, JOY_BUTTON_DPAD_DOWN)
	T.check(bench.pad_stop().get("id", "") == "kva" and int(bench.pad_stop().arg) == int(bench.q.town.kva), "down: the ring lands on the chosen kVA chip")
	var kvas: Array = (bench.q.kvas as Array).map(func(x): return int(x)); var k0 := kvas.find(int(bench.q.town.kva)); var kd := -1 if k0 > 0 else 1
	_pad(bench, JOY_BUTTON_DPAD_LEFT if kd < 0 else JOY_BUTTON_DPAD_RIGHT); _pad(bench, JOY_BUTTON_A)
	T.check(int(T.b.q("ch2Bench").town.kva) == int(kvas[k0 + kd]), "a step along the kVA chips and A pick that rating (%s)" % str(T.b.q("ch2Bench").town.kva))
	T.check(_pad(bench, JOY_BUTTON_DPAD_DOWN) and bench.pad_stop().get("kind", "") == "predict", "down: the prediction box")
	T.check(_pad(bench, JOY_BUTTON_DPAD_UP) and _pad(bench, JOY_BUTTON_DPAD_UP) and bench.pad_stop().get("id", "") == "ratio" and int(bench.pad_stop().arg) == 10, "up twice: back on the chosen 10:1")
	# ---- the build drawer: no bare Place on any level ----
	var bare: Array = []; var seen_levels := 0
	for n in range(0, 45):
		var id := "L%02d" % n
		if not bool(T.b.act("startLevel", [id, 1, "learner"]).get("ok", false)): continue
		seen_levels += 1
		var scr := GridBuildScreen.new(); scr.app = app; root.add_child(scr)
		var col := VBoxContainer.new(); scr.add_child(col); scr.build(col)
		for bt in col.find_children("place_*", "Button", true, false):
			var act := str(bt.name).trim_prefix("place_")
			if not GridBuildScreen.SCHEMA.has(act): bare.append("%s/%s" % [id, act])
		scr.free()
	T.check(seen_levels > 20, "the drawer sweep saw the levels (%d)" % seen_levels)
	T.check(bare.is_empty(), "no level's drawer has a Place without an argument form (%s)" % str(bare))
	T.finish("CH2-PAD", self)
