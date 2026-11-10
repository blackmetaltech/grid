class_name WorkOrder
extends RefCounted
## The work order (UI.md 6): a paper docket that slides in over a dimmed world when a job starts (and from the top-left pin). Place line, the story beat
## as a radio transcript, the goal, the pass conditions as check boxes, the three lamps to earn with their cost targets, the Learner / Engineer switch (first
## job only) and "Take the job". Built with app.dialog(), so Esc / B / Android Back close it; closing folds the docket into the pin.
## Reads only `levelInfo` (title, brief, place, story, thresholds, star3, frozen, horizonBlocks) and the snapshot's levelStart / mode / tick.

static var _d: Dictionary = {}
static var auto := not OS.has_environment("CB_SMOKE") and not OS.has_environment("CB_NOWORKORDER")   ## open on job start (smoke runs and CB_NOWORKORDER=1 skip it)
static var instant_next := false   ## the next open() snaps in (the mode chip restarts the job and must not replay the slide)

static func T(key: String) -> String: return TranslationServer.translate(key)

static func is_open() -> bool:
	return not _d.is_empty() and is_instance_valid(_d.host) and not (_d.host as Node).is_queued_for_deletion()

static func host_node() -> Control: return _d.host if is_open() else null

## Number without trailing zeros: 43.2, 5, 0.94.
static func num(x: float) -> String:
	var s := "%.3f" % x
	if "." in s: s = s.rstrip("0").rstrip(".")
	return s

static func _hm(minutes: float) -> String:
	var mm := int(round(minutes))
	if mm == 1440: return "24:00"
	mm = posmod(mm, 1440)
	return "%02d:%02d" % [mm / 60, mm % 60]

## "18:00–23:00" from the engine's level start and horizon ("" for jobs without a horizon).
static func window_text(app: CbApp, li: Dictionary) -> String:
	var ls = app.b.g.get("levelStart"); var hz = li.get("horizonBlocks")
	if ls == null or hz == null: return ""
	return T("WO_WINDOW") % [_hm(float(ls) * 15.0), _hm((float(ls) + float(hz)) * 15.0)]

static func _th_text(key: String, v: float) -> String:
	if key == "loadingMax": v *= 100.0
	return T("TH_" + key) % num(v)

## Pass conditions (everything the level checks except the third-star thresholds), as plain sentences.
static func conditions(app: CbApp, li: Dictionary) -> Array:
	var out: Array = []
	var th: Dictionary = li.get("thresholds", {}); var s3: Array = li.get("star3", [])
	var win := window_text(app, li)
	var keys := th.keys(); keys.sort()
	for k in keys:
		if k in s3 or not GridStrings.S.has("TH_" + str(k)): continue
		var t := _th_text(str(k), float(th[k]))
		if str(k) in ["vLoadMinV", "loadBusMinPu"] and win != "": t += ", " + win
		out.append(t)
	var fz = li.get("frozen")
	if fz is Dictionary: out.append(T("WO_COND_BUDGET") % CbRegion.money(float(fz.budget), false, 0))
	return out

## The three lamp captions: pass, cost star A, cost star B plus the extra third-star conditions. Empty when the job awards no stars.
static func lamp_texts(li: Dictionary) -> Array:
	if not bool(li.get("stars", false)): return []
	var fz = li.get("frozen")
	var l2 := T("LAMP_NO_COST"); var l3 := T("LAMP_NO_COST")
	if fz is Dictionary:
		var th: Dictionary = li.get("thresholds", {}); var extra: Array = []
		for k in (li.get("star3", []) as Array):
			if th.has(k) and GridStrings.S.has("TH_" + str(k)): var tx := _th_text(str(k), float(th[k])); extra.append(tx.substr(0, 1).to_lower() + tx.substr(1))
		l2 = T("LAMP_2") % CbRegion.money(float(fz.starA), false, 0)
		l3 = T("LAMP_3") % [CbRegion.money(float(fz.starB), false, 0), (T("LAMP_AND") + ", ".join(extra)) if not extra.is_empty() else ""]
	return [T("LAMP_1"), l2, l3]

## Split an engine story line "TOBI: text" into [speaker, text].
static func split_line(line: String) -> Array:
	var i := line.find(": ")
	if i >= 2 and i <= 8 and line.substr(0, i) == line.substr(0, i).to_upper(): return [line.substr(0, i), line.substr(i + 2)]
	return ["", line]

static func _pin_center(app: CbApp) -> Vector2:
	var ch = app.get("chrome")
	if ch != null and ch.pin != null and ch.pin.visible: return ch.pin.get_global_rect().get_center()
	return Vector2(80, 40)

static func close_now() -> void:
	if is_open(): (_d.host as Node).queue_free()
	_d = {}

## Fold the docket into the pin (Esc, "Take the job"); the pin then gives a little nod.
static func close(app: CbApp) -> void:
	if not is_open(): return
	var d := _d
	PaperKit.fold(d, _pin_center(app), func():
		if _d == d: _d = {}
		_nod_pin(app))

static func _nod_pin(app: CbApp) -> void:
	var ch = app.get("chrome")
	if ch == null or ch.pin == null or not PaperKit.animate(): return
	var pin: Control = ch.pin
	pin.pivot_offset = pin.size * 0.5
	var tw := pin.create_tween(); tw.tween_property(pin, "scale", Vector2(1.12, 1.12), 0.12); tw.tween_property(pin, "scale", Vector2.ONE, 0.18)

## Job start: only a job that has not run yet gets its docket (a loaded game in progress goes straight to work).
static func open_fresh(app: CbApp) -> void:
	if int(app.b.g.get("tick", 0)) <= int(app.b.g.get("levelStart", 0)): open(app)

static func open(app: CbApp) -> void:
	var li = app.b.q("levelInfo")
	if not (li is Dictionary and li.get("active", false)): return
	if is_open(): return
	GridUi.load_strings()
	var fresh: bool = int(app.b.g.get("tick", 0)) <= int(app.b.g.get("levelStart", 0))
	var w := minf(880.0, app.vw() - 40.0)
	var compact := PaperKit.compact(app)   # landscape phone: Goal and "To pass" first, everything else scrolls under a "more" cue
	var short: bool = app.vs_h() < 840.0
	var d := PaperKit.sheet(app, "workorder", w, (app.vs_h() - 24.0) if short else 0.0, 0.8, 18.0 if compact else 30.0)
	_d = d
	app.sfx("page")
	var host: PaperHost = d.host; host.closer = func(): close(app)
	var vb: VBoxContainer = d.vb
	if compact: vb.add_theme_constant_override("separation", 6)
	var col := VBoxContainer.new(); col.add_theme_constant_override("separation", 6 if compact else 12); col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if short: vb.add_child(PaperKit.scroll_box(col))
	else: vb.add_child(col)
	_content(app, col, li, short, compact)
	_footer(app, vb, li, fresh)
	if instant_next: instant_next = false
	else: PaperKit.slide_in(d)
	app.focus_dialog()

static func _story(col: VBoxContainer, li: Dictionary, compact: bool) -> void:
	var story: Array = li.get("story", [])
	if story.is_empty(): return
	col.add_child(PaperKit.lbl(T("WO_RADIO"), 14, "mono", Color(PaperKit.INK, 0.6)))
	for line in story:
		var sp := split_line(str(line))
		var row := HBoxContainer.new(); row.add_theme_constant_override("separation", 12); col.add_child(row)
		var sl := PaperKit.lbl(sp[0], 16, "mono", PaperKit.SPEAKER.get(sp[0], PaperKit.INK)); sl.custom_minimum_size.x = 64; sl.size_flags_vertical = Control.SIZE_SHRINK_BEGIN; row.add_child(sl)
		row.add_child(PaperKit.lbl(sp[1], 16 if compact else 18, "sans", PaperKit.INK, true))
		if sp[0] == "NIA" and GridSettings.cute and not compact: row.add_child(PaperKit.Tick.new())

static func _goal(app: CbApp, col: VBoxContainer, li: Dictionary, compact: bool) -> void:
	col.add_child(PaperKit.lbl(T("WO_GOAL"), 14, "mono", Color(PaperKit.INK, 0.6)))
	col.add_child(PaperKit.lbl(str(li.brief), 18 if compact else 21, "semi", PaperKit.INK, true))
	var conds := conditions(app, li)
	if not conds.is_empty():
		col.add_child(PaperKit.lbl(T("WO_PASS"), 14, "mono", Color(PaperKit.INK, 0.6)))
		for c in conds:
			var row := HBoxContainer.new(); row.add_theme_constant_override("separation", 12); col.add_child(row)
			var ck := PaperKit.Check.new(); if compact: ck.custom_minimum_size = Vector2(24, 24)
			row.add_child(ck); row.add_child(PaperKit.lbl(str(c), 17 if compact else 19, "sans", PaperKit.INK, true))

static func _lamps(col: VBoxContainer, li: Dictionary, compact: bool) -> void:
	var lamps := lamp_texts(li)
	if lamps.is_empty(): return
	col.add_child(PaperKit.lbl(T("WO_STARS"), 14, "mono", Color(PaperKit.INK, 0.6)))
	var gr := HBoxContainer.new(); gr.add_theme_constant_override("separation", 14); col.add_child(gr)
	for i in 3:
		var cell := VBoxContainer.new(); cell.size_flags_horizontal = Control.SIZE_EXPAND_FILL; cell.add_theme_constant_override("separation", 2); gr.add_child(cell)
		var lamp := PaperKit.Lamp.new(40.0 if compact else 54.0, false); lamp.size_flags_horizontal = Control.SIZE_SHRINK_CENTER; cell.add_child(lamp)
		var cap := PaperKit.lbl(str(lamps[i]), 15 if compact else 16, "sans", PaperKit.INK, true); cap.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; cell.add_child(cap)

## Desktop: title, radio transcript, goal, pass list, lamps. Short screens (`short`): the goal and the pass list come right after the title, the transcript and
## the lamps follow (they are the part that may scroll).
static func _content(app: CbApp, col: VBoxContainer, li: Dictionary, short := false, compact := false) -> void:
	var num_s := str(li.id).trim_prefix("L")
	var head := HBoxContainer.new(); head.add_theme_constant_override("separation", 12); col.add_child(head)
	var hv := VBoxContainer.new(); hv.size_flags_horizontal = Control.SIZE_EXPAND_FILL; hv.add_theme_constant_override("separation", 2); head.add_child(hv)
	var t := PaperKit.lbl(T("WO_TITLE") % [num_s, str(li.title).to_upper()], 36 if compact else 54, "title", PaperKit.INK, true); hv.add_child(t)
	if str(li.get("place", "")) != "": hv.add_child(PaperKit.lbl(str(li.place), 15 if compact else 18, "semi", Color(PaperKit.INK, 0.75), true))
	if GridSettings.cute and not compact: head.add_child(PaperKit.Doodle.new())
	col.add_child(PaperKit.rule())
	if short:
		_goal(app, col, li, compact); _story(col, li, compact); _lamps(col, li, compact)
	else:
		_story(col, li, compact); _goal(app, col, li, compact); _lamps(col, li, compact)

static func _footer(app: CbApp, vb: VBoxContainer, li: Dictionary, fresh: bool) -> void:
	vb.add_child(PaperKit.rule())
	var foot := HFlowContainer.new(); foot.add_theme_constant_override("h_separation", 16); foot.add_theme_constant_override("v_separation", 8); vb.add_child(foot)
	var left := HBoxContainer.new(); left.add_theme_constant_override("separation", 10); left.size_flags_horizontal = Control.SIZE_EXPAND_FILL; foot.add_child(left)
	var first_job: bool = str(li.id) == "L01"
	if first_job and fresh and app.cfg.modes.size() >= 2:
		left.add_child(PaperKit.lbl(T("WO_MODE"), 15, "mono", Color(PaperKit.INK, 0.6)))
		var cur := str(app.b.g.get("mode", "learner"))
		var opts: Array = [["learner", T("MODE_CHIP_LEARNER")], ["engineer", T("MODE_CHIP_ENGINEER")]]
		left.add_child(PaperKit.chip(opts, cur, func(id: String):
			CbSettings.last_mode = id; CbSettings.save_all()
			instant_next = true
			app.start_level(str(li.id), true)))
	var go := PaperKit.btn(T("WO_TAKE") if fresh else T("WO_BACK"), true, func(): close(app), 22)
	go.name = "Take"; go.custom_minimum_size.x = 220; foot.add_child(go)
	(vb.get_parent().get_parent() as PaperHost).primary = go
