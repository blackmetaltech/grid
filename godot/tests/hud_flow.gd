extends SceneTree
## HUD flow, headless with the real engine bridge: the radio wraps every line in full (never an ellipsis), caps its height and fades the oldest, the
## "why?" link adds ADA's line for THAT step (the engine coach `why`) without opening the log, "log ▸" opens it; the breaker (default 2x on a bench level,
## speed knob by click / + / -, pad up / down); the tray refuses changes while the night runs or the level is over and keeps a second tap on a reel;
## one selection ring after LB / RB; the converter label is whole dollars and fits; the L03 school tag shows the delivered power from the engine.

func _initialize() -> void:
	var T := Truth.new()
	if not T.start(root): print("HUD-FLOW FAILED engine"); quit(1); return
	CbRegion.refresh(T.b)
	var app := CbApp.new(); app.audio = CbAudio.new(); app.b = T.b; app.started = true
	var world := WorldView.new(); world.size = Vector2(1400, 800); root.add_child(world)
	var radio := RadioLog.new(); radio.app = app; radio.width = 560.0; radio.max_h = 240.0; root.add_child(radio)   # desktop width: time and speaker beside the line (under 440 px they stack above it)
	var ins := Instruments.new(); root.add_child(ins)
	var tags := TagView.new(); tags.b = T.b; tags.world = world; root.add_child(tags)
	var tray := KitTray.new(); tray.b = T.b; tray.world = world; tray.radio = radio; tray.instruments = ins; tray.tags = tags
	tray.locked = func(): return app.speed > 0 or str(T.b.g.get("status", "playing")) != "playing"
	root.add_child(tray); tray.size = Vector2(1100.0, 96.0)
	var sync := func(): world.refresh(T.b); ins.volt.visible = true; tray.refresh()
	# ---- radio ----
	T.level("L01"); sync.call()
	var coach: Dictionary = T.b.q("coach")
	radio.say("TOBI", str(coach.text), "coach", str(coach.id), str(coach.why))
	var long_txt := "Mind the mangrove: the cable has to bend round it, and every extra metre of copper costs both money and volts at the far homes, so pick the site with care."
	radio.say("ADA", "Short one.", "sys"); radio.say("SYS", "Another short line.", "sys"); radio.say("ADA", long_txt, "sys")
	T.check(radio.lines.size() == 4, "four radio lines")
	var rows: Array = radio._box.get_children().filter(func(c): return c is HBoxContainer and c.name != "LogRow")
	T.check(rows.size() >= 2, "several rows show (%d)" % rows.size())
	var labels: Array = []
	for r in rows: for c in r.get_children(): if c is Label and c.autowrap_mode != TextServer.AUTOWRAP_OFF: labels.append(c)
	T.check(not labels.is_empty(), "text labels wrap")
	for l in labels:
		T.check(l.autowrap_mode != TextServer.AUTOWRAP_OFF and l.max_lines_visible < 0 and l.text_overrun_behavior == TextServer.OVERRUN_NO_TRIMMING, "a radio line wraps in full, no ellipsis")
		T.check(not str(l.text).contains("…"), "no ellipsis in the text")
	for i in 6: await process_frame   # wrapped labels settle their height over a few layout passes
	T.check(radio.size.y <= radio.max_h + 2.0, "radio height %.0f stays within the cap %.0f" % [radio.size.y, radio.max_h])
	T.check(radio.size.y > 70.0, "the panel grew with its text (%.0f)" % radio.size.y)
	# fading: the cap drops the oldest rows, never the newest
	var n_before := radio._box.get_child_count()
	radio.max_h = 150.0; radio._rebuild(); for i in 6: await process_frame
	T.check(radio._box.get_child_count() < n_before and radio.size.y <= 152.0, "over the cap the oldest rows drop (%d -> %d rows, %.0f)" % [n_before, radio._box.get_child_count(), radio.size.y])
	T.check(radio.lines.back().text == long_txt and str(radio._box.get_child(radio._box.get_child_count() - 2).get_child(2).text) == long_txt, "the newest line is the one kept")
	radio.max_h = 320.0; radio.visible_lines = 4; radio._rebuild()
	# why / log
	radio.clear(); radio.say("TOBI", str(coach.text), "coach", str(coach.id), str(coach.why)); radio._rebuild()
	var why: Button = null; var logb: Button = null
	for n in radio.find_children("*", "Button", true, false):
		if n.name == "Why": why = n
		elif n.name == "Log": logb = n
	T.check(why != null and logb != null, "the live coach line has why? and the panel has log ▸")
	T.check(logb != null and logb.text == "log ▸", "log affordance label")
	if why != null:
		why.pressed.emit()
		var l: Dictionary = radio.lines.back()
		T.check(l.speaker == "ADA" and l.text == str(coach.why) and l.step == str(coach.id), "why? appends ADA's why-line of that step (%s)" % str(l.text).left(40))
		T.check(radio.full_opened == 0, "why? does not open the full log")
		T.check(radio.find_children("Why", "Button", true, false).is_empty(), "why? is spent once said")
	radio.app = null
	if logb != null: logb.pressed.emit(); T.check(radio.full_opened == 1, "log ▸ opens the full log")
	# ---- breaker ----
	var br := Breaker.new(); br.app = app; root.add_child(br); br.size = br.custom_minimum_size
	br.sync()
	T.check(br.rate == 2 and br.rate_text() == "2×", "a bench level's breaker starts at 2x")
	br.toggle(); T.check(app.speed == 2, "the night runs at app speed 2")
	br.step_rate(1); T.check(br.rate == 3 and app.speed == 3, "+ goes to 4x")
	br.step_rate(1); T.check(br.rate == 3, "+ stops at 4x")
	br.step_rate(-1); br.step_rate(-1); br.step_rate(-1); T.check(br.rate == 1 and app.speed == 1, "- walks down to 1x")
	br._layout_rects()
	var c := br._speed_rect.get_center()
	T.check(br._speed_rect.size.x >= 60.0 and br._speed_rect.size.y >= 60.0, "speed knob tap area is generous (%s)" % str(br._speed_rect.size))
	var ev := InputEventMouseButton.new(); ev.pressed = true; ev.button_index = MOUSE_BUTTON_LEFT; ev.position = c + Vector2(10, 12)
	br._gui_input(ev); T.check(br.rate == 2 and app.speed == 2, "clicking near the knob cycles the speed")
	ev.position = Vector2(60, 100); br._gui_input(ev); T.check(app.speed == 0, "clicking the handle pauses")
	T.check(TranslationServer.translate("BREAKER_SPEED") % br.rate_text() == "speed 2×", "caption reads 'speed 2×'")
	# ---- tray locks ----
	tray.activate(tray.item_index("hut")); sync.call(); tray.place_target(2); sync.call()
	tray.activate(tray.item_index("reel", 25.0)); sync.call()
	var before: Dictionary = T.b.q("benchStatus").bench
	T.check(before.cableMm2.main == 25.0, "a 25 mm2 cable is laid")
	app.speed = 2; radio.clear()
	tray.activate(tray.item_index("reel", 10.0)); sync.call()
	T.check(T.b.q("benchStatus").bench.cableMm2.main == 25.0, "running night: a reel pick keeps the cable")
	T.check(radio.lines.size() == 1 and radio.lines[0].speaker == "SYS" and radio.lines[0].text == "Pause the night first to change the cable", "SYS line asks to pause first")
	var k := InputEventKey.new(); k.pressed = true; k.keycode = KEY_5
	tray.key(k); sync.call()
	T.check(T.b.q("benchStatus").bench.cableMm2.main == 25.0, "number hotkeys do not change the cable while running")
	tray.activate(tray.item_index("hut")); sync.call()
	T.check(int(T.b.q("benchStatus").bench.hutM) == int(before.hutM), "nor the hut")
	app.speed = 0
	tray.activate(tray.item_index("reel", 10.0)); sync.call()
	T.check(T.b.q("benchStatus").bench.cableMm2.main == 10.0, "paused: the pick works again")
	# ---- pad ring ----
	tray.focus = -1; tray.hover = tray.item_index("reel", 2.5); tray._after_hover()
	tray.pad_button(JOY_BUTTON_RIGHT_SHOULDER); tray.pad_button(JOY_BUTTON_RIGHT_SHOULDER)
	T.check(tray.hover == -1 and tray.engaged and tray.focus == 1, "LB / RB: the stale hover is gone, one focus ring (focus %d)" % tray.focus)
	var fi := tray.focus
	tray.pad_button(JOY_BUTTON_RIGHT_SHOULDER)
	T.check(tray.preview_item() == fi + 1, "the ghost preview follows the focused item")
	var pv: Dictionary = T.b.q("benchPreview", [{"mm2": tray.items[fi + 1].mm2, "run": "main"}])
	T.check(pv.ok and absf(ins.volt.ghost - float(pv.vMinV)) < 1e-9, "ghost needle shows the focused reel's preview")
	# ---- L02: a second tap keeps the armed reel ----
	T.level("L02"); sync.call()
	tray.activate(tray.item_index("reel", 16.0)); T.check(tray.mode == "reel", "L02 reel armed")
	tray.activate(tray.item_index("reel", 16.0)); T.check(tray.mode == "reel" and is_equal_approx(tray.armed_mm2, 16.0), "second tap keeps it selected")
	# ---- L03 ----
	T.level("L03"); sync.call()
	var ci := tray.item_index("converters")
	var kit: Dictionary = T.b.q("benchKit")
	var want := CbRegion.money(2.0 * float(kit.converterPrice), false, 0)
	T.check(tray._pair_text() == want and not want.contains("."), "converter pair price in whole dollars (%s)" % want)
	var semi := GridTheme.font("semi"); var mono := GridTheme.font("mono")
	T.check(mono.get_string_size(tray.tx("TRAY_PAIR") % want, HORIZONTAL_ALIGNMENT_LEFT, -1, GridTheme.fs(10)).x <= tray.items[ci].rect.size.x - 4.0, "'%s' fits its cell" % (tray.tx("TRAY_PAIR") % want))
	var sch := ""
	for t in world.model.towns: if t.kind == "school": sch = str(t.id)
	T.check(sch != "", "L03 has a school")
	var d := tags.describe("hamlet", sch)
	T.check(str(d.homes_text).ends_with(tags.tx("TAG_NOT_CONNECTED")), "unpowered school: '%s'" % str(d.homes_text))
	tray.activate(ci); tray.activate(tray.item_index("reel", 10.0)); sync.call()
	var det: Dictionary = T.b.q("benchDetail")
	d = tags.describe("hamlet", sch)
	T.check(det.get("active", false) and str(d.homes_text).contains(TagView.fmt_m(float(det.totals.deliveredW)) + " W") and not str(d.homes_text).contains("—"), "powered school shows delivered power: '%s'" % str(d.homes_text))
	# tags: a wide pick around a hamlet
	var hp := world.world_to_screen(world.model.towns[0].pos)
	var sc: float = world._scale()
	T.check(world.pick(hp + Vector2(130.0, -125.0) * sc).is_empty(), "(the narrow pick misses the halo)")
	T.check(tags.on_tap(hp + Vector2(130.0, -125.0) * sc) and tags.is_open(), "a tap in the bulbs' halo opens the tag")
	T.finish("HUD-FLOW", self)
