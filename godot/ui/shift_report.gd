class_name ShiftReport
extends RefCounted
## The result screen (cfg game_end_screen -> true). Won: a paper "Shift report" with three lamps stamped one after the other (lit = earned), the metrics,
## the histogram in print ink, ADA's note (the engine's lesson line with the player's numbers) and Retry / Next job / Copy design code.
## Lost: an "Incident report" in red ink: the cause in plain words, the lesson with the player's numbers, what to try (the coach's current step) and
## Retry / Look around. A failure never shows the histogram. The world stays visible beside the sheet. Data: app.end_data(), levelInfo, resultCard,
## benchStatus, coach, solutionCode (queries only).

const STAMP_DELAY := 0.42
static var _d: Dictionary = {}

static func T(key: String) -> String: return TranslationServer.translate(key)

static func is_open() -> bool: return not _d.is_empty() and is_instance_valid(_d.host) and not (_d.host as Node).is_queued_for_deletion()
static func host_node() -> Control: return _d.host if is_open() else null

## cfg hook: build the report and own the end state. Returns true (the kit card is skipped).
static func open(app: CbApp) -> bool:
	GridUi.load_strings()
	var e: Dictionary = app.end_data()
	var won: bool = bool(e.won)
	var li = app.b.q("levelInfo"); var has_li: bool = li is Dictionary and li.get("active", false)
	var lid := str(e.level_id)
	var stars := int(app.b.g.get("stars", 0)) if won else 0
	if won and lid != "": GridSettings.record_stars(lid, stars)
	var at_left: bool = app.vw() >= 1000.0   # wide screens: the sheet sits at the left, the island stays visible beside it
	var w := minf(700.0, app.vw() * (0.52 if at_left else 0.94))
	var short: bool = app.vs_h() < 920.0
	var d := PaperKit.sheet(app, "end", w, (app.vs_h() - 40.0) if short else 0.0, 0.34)
	_d = d
	app.sfx("page")
	var host: Control = d.host; var pn: PanelContainer = d.panel
	app.end_ui = host
	# the sheet sits at the left so the lit (or dark) hamlet stays visible beside it
	pn.remove_meta("cb_dlg")
	var left := 24.0 if at_left else (app.vw() - w) * 0.5
	pn.anchor_left = 0.0; pn.anchor_right = 0.0; pn.anchor_top = 0.5; pn.anchor_bottom = 0.5
	pn.offset_left = left; pn.offset_right = left + w
	if short: pn.offset_top = -(app.vs_h() - 40.0) * 0.5; pn.offset_bottom = (app.vs_h() - 40.0) * 0.5
	else: pn.offset_top = 0; pn.offset_bottom = 0; pn.grow_vertical = Control.GROW_DIRECTION_BOTH
	var vb: VBoxContainer = d.vb
	var col := VBoxContainer.new(); col.add_theme_constant_override("separation", 12); col.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if short:
		var sc := ScrollContainer.new(); sc.size_flags_vertical = Control.SIZE_EXPAND_FILL; sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; vb.add_child(sc); sc.add_child(col)
	else: vb.add_child(col)
	var lamps: Array = []
	if won: lamps = _won(app, col, e, li if has_li else {}, stars, short)
	else: _lost(app, col, e, li if has_li else {})
	vb.add_child(PaperKit.rule())
	var row := HFlowContainer.new(); row.add_theme_constant_override("h_separation", 12); row.add_theme_constant_override("v_separation", 8); vb.add_child(row)
	var primary: Button = null
	var retry := PaperKit.btn(T("REP_RETRY"), not won, func(): _retry(app, lid, str(e.mode)), 20); retry.name = "Retry"; row.add_child(retry)
	if won:
		if str(e.next_level) != "":
			var nx := PaperKit.btn(T("REP_NEXT"), true, func(): app.start_level(str(e.next_level), true), 20); nx.name = "Next"; row.add_child(nx); primary = nx
		var cp := PaperKit.btn(T("REP_COPY"), false, func(): pass, 20); cp.name = "Copy"
		cp.pressed.connect(func(): _copy_code(app, cp)); row.add_child(cp)
		if primary == null: primary = retry
	else:
		var lk := PaperKit.btn(T("REP_LOOK"), false, func(): app.menus.end_look(), 20); lk.name = "Look"; row.add_child(lk); primary = retry
	if won and lid != "" and app.scores != null:
		var line: String = app.scores_submit_level(lid)
		if line != "": vb.add_child(PaperKit.lbl(line, 14, "sans", Color(PaperKit.INK, 0.6), true))
	PaperKit.slide_in(d, 60.0)
	(host as PaperHost).primary = primary
	app.focus_dialog()
	_stamp_lamps(app, lamps)
	return true

static func _retry(app: CbApp, lid: String, mode: String) -> void:
	if lid != "": app.start_level(lid, true)
	else: app.new_game(mode)

static func _copy_code(app: CbApp, btn: Button) -> void:
	var code = app.b.q("solutionCode")
	if not (code is String) or str(code) == "": app.toast(T("REP_NO_CODE"), "warn"); return
	DisplayServer.clipboard_set(str(code))
	var old := btn.text; btn.text = T("REP_COPIED")
	app.toast(T("REP_CODE_TOAST"), "good")
	if btn.is_inside_tree():
		btn.get_tree().create_timer(2.0).timeout.connect(func(): if is_instance_valid(btn): btn.text = old)

# ---- won ----------------------------------------------------------------------------------------------------------------------------
static func _head(col: VBoxContainer, title: String, sub: String, ink: Color) -> void:
	var head := HBoxContainer.new(); col.add_child(head)
	var hv := VBoxContainer.new(); hv.size_flags_horizontal = Control.SIZE_EXPAND_FILL; hv.add_theme_constant_override("separation", 0); head.add_child(hv)
	hv.add_child(PaperKit.lbl(title.to_upper(), 60, "title", ink, true))
	hv.add_child(PaperKit.lbl(sub, 18, "semi", Color(PaperKit.INK, 0.75), true))

static func _won(app: CbApp, col: VBoxContainer, e: Dictionary, li: Dictionary, stars: int, compact := false) -> Array:
	var lid := str(e.level_id)
	_head(col, T("REP_WON"), T("REP_SUB") % [lid.trim_prefix("L"), str(e.title)], PaperKit.INK)
	col.add_child(PaperKit.rule())
	var texts := WorkOrder.lamp_texts(li)
	var lamps: Array = []
	var lr := HBoxContainer.new(); lr.add_theme_constant_override("separation", 10); col.add_child(lr)
	for i in 3:
		var cell := VBoxContainer.new(); cell.size_flags_horizontal = Control.SIZE_EXPAND_FILL; cell.add_theme_constant_override("separation", 0); lr.add_child(cell)
		var lamp := PaperKit.Lamp.new(60.0 if compact else 86.0, i < stars); lamp.size_flags_horizontal = Control.SIZE_SHRINK_CENTER; cell.add_child(lamp); lamps.append(lamp)
		if i < texts.size():
			var cap := PaperKit.lbl(str(texts[i]), 15, "sans", PaperKit.INK if i < stars else Color(PaperKit.INK, 0.55), true); cap.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; cell.add_child(cap)
	col.add_child(PaperKit.rule())
	# metrics: cost, worst home, line loss (bench) or what the grid level tracks
	var g: Dictionary = app.b.g
	var m: Array = [[T("REP_COST"), CbRegion.money(float(g.get("budget", {}).get("spent", 0.0)), false, 0)]]
	var bs = app.b.q("benchStatus")
	if bs is Dictionary and bs.get("active", false):
		if bool(bs.get("powered", false)): m.append([T("REP_WORST"), T("REP_V") % WorkOrder.num(snappedf(float(bs.vMinV), 0.1))])
		m.append([T("REP_LOSS"), T("REP_PCT") % WorkOrder.num(snappedf(float(bs.lossPct), 0.1))])
	else:
		var tr_: Dictionary = g.get("metrics", {}).get("track", {})
		if tr_.get("lossPct") != null: m.append([T("REP_LOSS"), T("REP_PCT") % WorkOrder.num(snappedf(float(tr_.lossPct), 0.1))])
	var mr := HBoxContainer.new(); mr.add_theme_constant_override("separation", 20); col.add_child(mr)
	for it in m:
		var cell := VBoxContainer.new(); cell.size_flags_horizontal = Control.SIZE_EXPAND_FILL; cell.add_theme_constant_override("separation", 0); mr.add_child(cell)
		cell.add_child(PaperKit.lbl(str(it[0]), 14, "mono", Color(PaperKit.INK, 0.6)))
		cell.add_child(PaperKit.lbl(str(it[1]), 34, "title", PaperKit.INK))
	# histogram in print ink (only ever on a win)
	var rc = app.b.q("resultCard")
	if rc is Dictionary and rc.get("active", false) and not (rc.get("bins", []) as Array).is_empty():
		col.add_child(PaperKit.lbl(str(rc.metric), 14, "mono", Color(PaperKit.INK, 0.6)))
		var h := PaperKit.PaperHist.new(); h.name = "PaperHist"; h.custom_minimum_size = Vector2(240, 84 if compact else 120); h.set_data(rc); col.add_child(h)
		if str(rc.get("source", "")) == "bot": col.add_child(PaperKit.lbl(str(rc.label), 14, "sans", Color(PaperKit.INK, 0.6), true))
		if rc.get("mine") != null and rc.get("percentile") != null:
			col.add_child(PaperKit.lbl(T("RESULT_MINE_FMT") % [str(rc.get("mineText", CbKit.num(float(rc.mine), 1))), int(round(float(rc.percentile) * 100.0)), int(rc.n)], 15, "sans", PaperKit.INK, true))
	var lesson := str(li.get("lesson", ""))
	if lesson != "": col.add_child(_note(lesson, PaperKit.BLUE))
	return lamps

## ADA's handwritten-ish note: a sticky slip, slightly crooked, in pen blue.
static func _note(text: String, ink: Color, title := "") -> Control:
	var pc := PanelContainer.new()
	var sb := StyleBoxFlat.new(); sb.bg_color = Color("#FBF1B6"); sb.set_corner_radius_all(3); sb.border_color = Color(PaperKit.INK, 0.2); sb.set_border_width_all(1)
	sb.content_margin_left = 18; sb.content_margin_right = 18; sb.content_margin_top = 12; sb.content_margin_bottom = 14; sb.shadow_color = Color(0, 0, 0, 0.18); sb.shadow_size = 4; sb.shadow_offset = Vector2(1, 2)
	pc.add_theme_stylebox_override("panel", sb); pc.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 2); pc.add_child(v)
	v.add_child(PaperKit.lbl(title if title != "" else T("REP_ADA") + " ›", 14, "mono", Color(ink, 0.8)))
	v.add_child(PaperKit.lbl(text, 18, "semi", ink, true))
	pc.rotation = deg_to_rad(-0.8)
	pc.name = "Note"
	return pc

# ---- lost ---------------------------------------------------------------------------------------------------------------------------
static func _lost(app: CbApp, col: VBoxContainer, e: Dictionary, li: Dictionary) -> void:
	var lid := str(e.level_id)
	var head := HBoxContainer.new(); col.add_child(head)
	var hv := VBoxContainer.new(); hv.size_flags_horizontal = Control.SIZE_EXPAND_FILL; hv.add_theme_constant_override("separation", 0); head.add_child(hv)
	hv.add_child(PaperKit.lbl(T("REP_LOST").to_upper(), 60, "title", PaperKit.RED, true))
	hv.add_child(PaperKit.lbl(T("REP_SUB") % [lid.trim_prefix("L"), str(e.title)] if lid != "" else str(e.title), 18, "semi", Color(PaperKit.INK, 0.75), true))
	head.add_child(Stamp.new(T("REP_STAMP_LOST")))
	col.add_child(PaperKit.rule())
	col.add_child(PaperKit.lbl(T("REP_CAUSE"), 14, "mono", Color(PaperKit.INK, 0.6)))
	col.add_child(PaperKit.lbl(str(e.reason), 23, "semi", PaperKit.RED, true))
	var bs = app.b.q("benchStatus")
	if bs is Dictionary and bs.get("active", false) and bool(bs.get("powered", false)) and (bs.bench as Dictionary).get("limits", {}).get("vMinV") != null:
		col.add_child(PaperKit.lbl(T("REP_NUMBERS") % [WorkOrder.num(snappedf(float(bs.vMinV), 0.1)), WorkOrder.num(float(bs.bench.limits.vMinV))], 18, "sans", PaperKit.INK, true))
	var lesson := str(li.get("lesson", ""))
	if lesson != "": col.add_child(_note(lesson, PaperKit.BLUE))
	var co = app.b.q("coach"); var tip := T("REP_TRY_FALLBACK")
	if co is Dictionary and co.get("active", false) and not co.get("done", true) and str(co.get("text", "")) != "": tip = str(co.text)
	col.add_child(_note(tip, PaperKit.INK, T("REP_TRY")))

## A rubber stamp, tilted, in red ink.
class Stamp extends Control:
	var text := ""
	func _init(t := "") -> void:
		text = t; custom_minimum_size = Vector2(150, 80); mouse_filter = Control.MOUSE_FILTER_IGNORE
	func _draw() -> void:
		var f := GridTheme.font("title"); var sz := GridTheme.fs(34)
		draw_set_transform(size * 0.5, deg_to_rad(-10.0), Vector2.ONE)
		var ts := f.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, sz)
		var r := Rect2(-ts * 0.5 - Vector2(12, 6), ts + Vector2(24, 12))
		draw_rect(r, Color(PaperKit.RED, 0.9), false, 4.0)
		draw_rect(r.grow(-6), Color(PaperKit.RED, 0.55), false, 1.5)
		draw_string(f, Vector2(-ts.x * 0.5, ts.y * 0.5 - 8.0), text, HORIZONTAL_ALIGNMENT_LEFT, -1, sz, Color(PaperKit.RED, 0.9))

# ---- stamping -----------------------------------------------------------------------------------------------------------------------
## Each earned lamp is stamped in turn: the ring thumps down and the "stamp" sound plays. Headless / reduced motion: all stamped at once.
static func _stamp_lamps(app: CbApp, lamps: Array) -> void:
	var n := 0
	for lp in lamps:
		var lamp := lp as PaperKit.Lamp
		if not lamp.lit: continue
		if not PaperKit.animate():
			lamp.set_stamp(1.0); n += 1; continue
		var delay := 0.55 + STAMP_DELAY * n
		var tw := lamp.create_tween()
		tw.tween_interval(delay)
		tw.tween_callback(func(): app.sfx("stamp"))
		tw.tween_method(lamp.set_stamp, 0.01, 1.0, 0.22)
		n += 1
	if n > 0 and not PaperKit.animate(): app.sfx("stamp")
