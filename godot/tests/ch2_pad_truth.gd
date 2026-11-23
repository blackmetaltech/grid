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
	_pad(bench, JOY_BUTTON_DPAD_DOWN); _pad(bench, JOY_BUTTON_DPAD_DOWN)
	T.check(bench.pad_stop().get("id", "") == "area", "down twice more: the coil area knob")
	T.check(_pad(bench, JOY_BUTTON_DPAD_DOWN) and bench.pad_stop().get("kind", "") == "predict", "down: the prediction box")
	T.check(_pad(bench, JOY_BUTTON_DPAD_DOWN) and bench.pad_stop().get("kind", "") == "predict", "down on the last row stays inside the panel")
	# the answer is hidden until the prediction is made
	T.check(bench.hide_answer(), "L04 before predicting: the answer is hidden")
	T.check(bench.shown(325.3, 1) == "?", "hidden numbers read '?'")
	# A on the prediction box opens the number pad; OK sends the prediction
	T.check(_pad(bench, JOY_BUTTON_A), "A on the prediction box is used")
	var np = bench.numpad_host().get_node_or_null("Numpad")
	T.check(np != null, "A opens the number pad")
	T.check(not bench.pad_free() and not _pad(bench, JOY_BUTTON_DPAD_UP), "the panel lets go of the pad while the number pad is up")
	if np != null:
		for k in ["3", "2", "7", "OK"]: np._key(k)
	await process_frame
	var pr = T.b.q("ch2Bench").prediction
	T.check(pr is Dictionary and is_equal_approx(float(pr.predicted), 327.0), "the pad's 327 reaches the engine as the prediction (%s)" % str(pr))
	bench.refresh()
	T.check(not bench.hide_answer() and bench.shown(325.3, 1) == "325.3", "after predicting every number shows")
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
