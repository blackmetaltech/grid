extends SceneTree
## Chapter 2 bench flow (L04 "Spin the Alternator", L06 "Exam Bridge: The Town Line"), headless with the real engine bridge: the stage and panel appear on these two levels and nowhere
## else (the kit tray's queries stay inactive); the knobs, chips and the prediction box send the engine's actions and every number on the panel is the engine's `ch2Bench`; a locked panel
## (the night runs) refuses and says why; the work order lists the tolerances; the run ends in the shift-report lesson with the player's numbers.

class Fake extends CbApp:
	var seen: Array = []
	var hook := Callable()
	func game_on_changed() -> void:
		if hook.is_valid(): hook.call()
	func toast(text: String, _level := "info") -> void: seen.append(text)
	func sfx(_k: String) -> void: pass

func _initialize() -> void:
	var T := Truth.new()
	if not T.start(root): print("CH2-FLOW FAILED engine"); quit(1); return
	CbRegion.refresh(T.b); GridUi.load_strings(); TrayStrings.load_strings()
	var app := Fake.new(); app.b = T.b; app.started = true
	var bench := Ch2Bench.new(); bench.app = app; root.add_child(bench); bench.size = Vector2(1366, 768)
	await process_frame   # a script's _initialize runs before the root is in the tree: nodes added now are outside it until a frame has passed (release_focus then errors)
	app.hook = func(): bench.refresh()   # what the real shell does after every action
	# ---- free play and a chapter-1 bench: nothing of ours shows ----
	T.level("L03"); bench.refresh()
	T.check(not bench.visible, "the chapter-2 stage is hidden on L03")
	T.check(not T.b.q("ch2Bench").active, "ch2Bench is inactive on L03")
	# ---- L04 ----
	T.level("L04"); bench.refresh()
	T.check(bench.visible and bench.kind == "machine", "the stage shows on L04")
	T.check(not T.b.q("benchKit").active and not T.b.q("benchStatus").active, "the kit tray and the bench voltmeter stay out of L04")
	T.near(float(bench.q.fHz), 500.0 * 4.0 / 120.0, 1e-9, "the fresh winding is 4 poles: 16.67 Hz")
	T.check(not bool(bench.q.ok) and not bool(bench.q.fOk), "and the engine says it is out of band")
	for i in 4: bench._nudge("poles", 1)
	T.check(int(T.b.q("ch2Bench").machine.poles) == 12, "four + presses on the poles knob: 12 poles")
	bench.refresh()
	T.near(float(bench.q.fHz), 50.0, 1e-9, "12 poles at 500 rpm make 50 Hz")
	# the knob geometry: a point on the track maps to the engine's range, with the engine's step
	var hit := {}
	for h in bench.hits: if str(h.id) == "field": hit = h
	var tr: Rect2 = bench._knob_parts(hit.rect).track
	bench._knob_drag(hit, Vector2(tr.position.x + tr.size.x * 0.5, tr.position.y + 8.0)); bench._process(0.016)
	T.near(float(T.b.q("ch2Bench").machine.fieldT), 0.6, 1e-9, "the middle of the field track is 0.6 T (0.3 to 0.9)")
	bench._send("setTurns", 13); bench._send("setField", 0.8); bench._send("setArea", 0.1); bench.refresh()
	var nba := 13.0 * 0.8 * 0.1
	T.near(float(bench.q.e0V), nba * TAU * 50.0, 1e-9, "e0 on the panel is N B A w")
	T.near(float(bench.q.eRmsV), nba * TAU * 50.0 / sqrt(2.0), 1e-9, "E rms = e0 / sqrt 2")
	T.check(bool(bench.q.ok), "13 turns, 0.8 T, 0.1 m2 on 12 poles is inside the band")
	T.near(float(bench.q.spent), float(T.b.g.budget.spent), 1e-9, "the price tag is the engine's spent")
	# a refusal is the engine's message
	var n0 := app.seen.size(); bench._send("setPoles", 11)
	T.check(app.seen.size() == n0 + 1 and str(app.seen[-1]).contains("pairs"), "an odd pole count is refused with the engine's words: %s" % str(app.seen[-1]))
	# the prediction box
	bench.predict_edit.text = "327"; bench._on_predict(); bench.refresh()
	var pr = T.b.q("ch2Bench").prediction
	T.check(pr is Dictionary and is_equal_approx(float(pr.predicted), 327.0), "the prediction reaches the engine")
	bench.predict_edit.text = "abc"; bench._on_predict(); T.check(bench.predict_msg != "", "a non-number is refused on the panel")
	# the work order lists the tolerances; the third lamp names the prediction
	var li: Dictionary = T.b.q("levelInfo"); var conds: Array = WorkOrder.conditions(app, li)
	T.check(conds.any(func(c): return str(c).contains("Village voltage within") and str(c).contains("2")), "work order: voltage tolerance (%s)" % str(conds))
	T.check(conds.any(func(c): return str(c).contains("Frequency within")), "work order: frequency tolerance")
	T.check(str(WorkOrder.lamp_texts(li)[2]).contains("rediction within"), "third lamp: prediction within 1 %% (%s)" % str(WorkOrder.lamp_texts(li)))
	# the night runs: the panel locks
	app.speed = 2
	var cur := int(T.b.q("ch2Bench").machine.turns)
	var th := {}
	for h in bench.hits: if str(h.id) == "turns": th = h
	var ev := InputEventMouseButton.new(); ev.button_index = MOUSE_BUTTON_LEFT; ev.pressed = true; ev.position = (th.rect as Rect2).get_center()
	bench._gui_input(ev); bench._process(0.016)
	T.check(int(T.b.q("ch2Bench").machine.turns) == cur and app.seen[-1] == TranslationServer.translate("C2_LOCKED"), "a press while the turbine runs changes nothing and says why")
	app.speed = 0
	T.b.act("tick", [10]); bench.refresh()
	T.check(str(T.b.g.status) == "won", "the evening runs and the village is lit (%s)" % str(T.b.g.get("statusReason")))
	var li2: Dictionary = T.b.q("levelInfo")
	T.check(str(li2.lesson).contains("13 × 0.8 × 0.1 × 314.2 = 326.7 V") and str(li2.lesson).contains("= 50 Hz"), "the lesson prints the player's numbers: %s" % str(li2.lesson))
	T.near(float(T.b.g.metrics.track.predErrPct), 100.0 * absf(327.0 - nba * TAU * 50.0) / (nba * TAU * 50.0), 1e-9, "the prediction error is the engine's")
	# ---- L06 ----
	T.level("L06"); bench.refresh()
	T.check(bench.visible and bench.kind == "town", "the stage shows on L06 as the town line")
	T.near(float(bench.q.lossKw), 600.0, 1e-9, "no transformers: 600 kW lost at 4 kV (AC-15)")
	T.check(bench.hits.filter(func(h): return str(h.id) == "ratio").size() == 11 and bench.hits.filter(func(h): return str(h.id) == "kva").size() == 4, "chips: 11 ratios and 4 ratings")
	bench._send("setLineRatio", 10); bench.refresh()
	T.near(float(bench.q.lossKw), 6.0, 1e-9, "10:1 to 40 kV loses 6 kW (AC-16)")
	T.near(float(bench.q.iA), 20.0, 1e-9, "the line carries 20 A")
	bench._send("setTransformerKva", 630); bench.refresh()
	T.check(bool(bench.q.overload) and not bool(bench.q.ok), "630 kVA overloads at 800 kW")
	bench._send("setTransformerKva", 1000); bench.refresh()
	T.check(bool(bench.q.ok), "1000 kVA is fine")
	bench.predict_edit.text = "600"; bench._on_predict(); bench.refresh()
	T.check(is_equal_approx(float(bench.q.prediction.predicted), 600.0), "the 4 kV prediction reaches the engine")
	T.b.act("tick", [10]); bench.refresh()
	T.check(str(T.b.g.status) == "won", "the town line passes")
	T.near(float(T.b.g.metrics.track.predErrPct), 0.0, 1e-9, "the 600 kW prediction is exact")
	T.check(str(T.b.q("levelInfo").lesson).contains("I = P ÷ V = 800 kW ÷ 40 kV = 20 A"), "the lesson prints I = P / V")
	T.finish("CH2-FLOW", self)
