class_name Ch5Panel
extends PanelContainer
## Chapter 5's control card (right edge), drawn only on L14-L18: the buses of the job in per unit and in kilovolts (one toggle, because 1.00 pu is every voltage), and the
## instrument of each level: the tap and switching counts (L14, L15), the loading of every line with the loading after losing each one (L16), the P-V curve with the
## operating point and the nose (L17), the Gauss-Seidel sweeps beside Newton, the predictions and the set-point of the PV bus (L18). Display and input only: every number
## comes from the engine query `ch5Panel`, every refusal is the engine's.
const W := 310.0
const LEVELS := ["L14", "L15", "L16", "L17", "L18"]
const PRED := [["l18.v2gs1", "pu", "C5_P_GS1"], ["l18.v2", "pu", "C5_P_V2"], ["l18.pslack", "MW", "C5_P_PS"]]
var app: CbApp
var _level := ""
var _sig := ""
var _pu := true
var _box: VBoxContainer
var _scroll: ScrollContainer
var _title: Label
var _fold: Button
var _collapsed := false
var _readout: Label
var _chart: PvChart

class PvChart extends Control:
	var data: Dictionary = {}
	func _init() -> void: custom_minimum_size = Vector2(0, 150); mouse_filter = Control.MOUSE_FILTER_IGNORE
	func _draw() -> void:
		var r := Rect2(Vector2(34, 6), size - Vector2(44, 28))
		draw_rect(r, Color(0, 0, 0, 0.06)); draw_rect(r, Color(0, 0, 0, 0.5), false, 1.0)
		var pts: Array = data.get("points", [])
		var f := ThemeDB.fallback_font
		draw_string(f, Vector2(2, r.position.y + 10), "1.1", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(0, 0, 0, 0.7)); draw_string(f, Vector2(2, r.end.y), "0.4", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(0, 0, 0, 0.7))
		draw_string(f, Vector2(r.position.x, r.end.y + 14), "0", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(0, 0, 0, 0.7))
		draw_string(f, Vector2(r.position.x + 4, r.position.y + 24), "V (pu)", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(0, 0, 0, 0.55)); draw_string(f, Vector2(r.end.x - 52, r.end.y - 6), "P (MW)", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(0, 0, 0, 0.55))
		if pts.size() < 2:   # before the first Run: empty axes and a faint hint of where the nose will be
			draw_polyline(PackedVector2Array([Vector2(r.position.x + 6, r.position.y + 16), Vector2(r.position.x + r.size.x * 0.55, r.position.y + r.size.y * 0.30), Vector2(r.position.x + r.size.x * 0.82, r.position.y + r.size.y * 0.55), Vector2(r.position.x + r.size.x * 0.90, r.position.y + r.size.y * 0.80)]), Color(0.1, 0.35, 0.65, 0.22), 2.0)
			draw_string(f, Vector2(r.position.x + r.size.x * 0.66, r.position.y + r.size.y * 0.52), "nose", HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(0.8, 0.15, 0.1, 0.35)); return
		var pmax := float(data.get("noseMW", 1.0)) * 1.15; pmax = maxf(pmax, float(data.get("loadMW", 1.0)) * 1.1)
		var poly := PackedVector2Array()
		for p in pts: poly.append(Vector2(r.position.x + r.size.x * float(p.pMW) / pmax, r.position.y + r.size.y * (1.0 - (float(p.v) - 0.4) / 0.7)))
		draw_polyline(poly, Color(0.1, 0.35, 0.65), 2.0)
		var nose := Vector2(r.position.x + r.size.x * float(data.noseMW) / pmax, r.position.y + r.size.y * (1.0 - (float(data.noseV) - 0.4) / 0.7))
		draw_circle(nose, 5.0, Color(0.8, 0.15, 0.1)); draw_string(f, nose + Vector2(-26, -8), "nose", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(0.8, 0.15, 0.1))
		var lx := r.position.x + r.size.x * float(data.loadMW) / pmax
		draw_line(Vector2(lx, r.position.y), Vector2(lx, r.end.y), Color(0.15, 0.5, 0.2), 1.5)
		draw_string(f, Vector2(r.end.x - 40, r.end.y + 14), "%d MW" % int(pmax), HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(0, 0, 0, 0.7))

func _init() -> void:
	name = "Ch5Panel"; visible = false; mouse_filter = Control.MOUSE_FILTER_STOP
	add_theme_stylebox_override("panel", GridTheme.paper_sb(4, 10.0))
	var root := VBoxContainer.new(); root.add_theme_constant_override("separation", 4); add_child(root)
	var head := HBoxContainer.new(); root.add_child(head)
	_title = GridTheme.label("", 18, GridTheme.PAPER_INK, "title"); _title.size_flags_horizontal = Control.SIZE_EXPAND_FILL; head.add_child(_title)
	_fold = Button.new(); _fold.text = "▾"; _fold.name = "c5_fold"; _fold.flat = true; _fold.custom_minimum_size = Vector2(36, 28); _fold.focus_mode = CbKit.focus_mode(); _fold.add_theme_color_override("font_color", GridTheme.PAPER_INK); _fold.add_theme_color_override("font_hover_color", GridTheme.PAPER_INK); _fold.add_theme_font_size_override("font_size", GridTheme.fs(20))   # folds the card to its title so the map can be reached
	_fold.pressed.connect(func(): _collapsed = not _collapsed; _fold.text = "▸" if _collapsed else "▾"; refresh()); head.add_child(_fold)
	_scroll = ScrollContainer.new(); _scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; root.add_child(_scroll)   # a long card (L18's givens) scrolls inside the screen
	_box = VBoxContainer.new(); _box.add_theme_constant_override("separation", 4); _box.custom_minimum_size.x = W - 26.0; _scroll.add_child(_box)
	GridUi.load_strings()

func tx(k: String) -> String: return TranslationServer.translate(k)

func refresh() -> void:
	if app == null or not app.started or app.b == null: visible = false; return
	var li = app.b.q("levelInfo")
	_level = str(li.id) if li is Dictionary and li.get("active", false) else ""
	visible = _level in LEVELS
	if not visible: return
	var g: Dictionary = app.b.g
	var sig := _level + str((g.actionLog as Array).size()) + str(g.get("status", "")) + str(g.get("tick", 0)) + str(_pu)
	if sig != _sig: _sig = sig; _rebuild()
	var vp := get_viewport_rect().size
	var phone: bool = CbLayout.kind == "phone"
	var vw: float = float(app.vw()) if app.is_inside_tree() else vp.x
	var vh: float = float(app.vs_h()) if app.is_inside_tree() else vp.y
	var w := minf(W, maxf(240.0, vw * 0.32)) if phone else W   # desktop keeps its 310 px card
	var top := 74.0 if not phone else 70.0
	var room := maxf(120.0, (vh - top - 195.0) if phone else (vh - 74.0 - 150.0)) - (70.0 if phone else 40.0)   # leaves the tray, the radio and the lever their rows (phone: the budget tag's top)
	_scroll.visible = not _collapsed
	size = Vector2(w, 0); custom_minimum_size = Vector2(w, 0)
	_box.custom_minimum_size.x = w - 26.0
	_scroll.custom_minimum_size = Vector2(w - 20.0, minf(_box.get_combined_minimum_size().y + 4.0, room) if not _collapsed else 0.0)
	reset_size()
	position = Vector2(minf(vw - w - 14.0, vw - size.x - 8.0), top)   # wholly inside the screen, whatever the font scale made of the content

func _do(act: String, args: Array) -> bool:
	var r: Dictionary = app.b.act(act, args)
	var quiet := DisplayServer.get_name() == "headless"
	if r.get("ok", false):
		if not quiet: app.sfx("click")
	elif not quiet: app.sfx("bad"); app.toast(str(r.get("message", "")), "bad")
	if not quiet: app.game_on_changed()
	return bool(r.get("ok", false))

func _line(text: String, size_px := 14, font := "mono") -> Label:
	var l := GridTheme.label(text, size_px, GridTheme.PAPER_INK, font); l.autowrap_mode = TextServer.AUTOWRAP_WORD; l.custom_minimum_size = Vector2(maxf(160.0, size.x - 28.0 if size.x > 100.0 else W - 28.0), 0); _box.add_child(l); return l

func _button(text: String, nm: String, cb: Callable) -> Button:
	var b := Button.new(); b.text = text; b.custom_minimum_size = Vector2(0, 28); b.focus_mode = CbKit.focus_mode(); b.name = nm
	b.add_theme_font_size_override("font_size", GridTheme.fs(14)); b.pressed.connect(cb); _box.add_child(b); return b

func _rebuild() -> void:
	for c in _box.get_children(): _box.remove_child(c); c.queue_free()
	var q = app.b.q("ch5Panel")
	if not (q is Dictionary) or not q.get("active", false): return
	var g: Dictionary = app.b.g
	_title.text = tx("C5_TITLE_" + _level)
	var started: bool = str(g.get("status", "playing")) != "playing" or int(g.tick) > int(g.levelStart)
	if (q.buses as Array).size() > 0 and not (_level == "L18" and not started):   # L18 before Run: the givens below are the board
		if _level == "L14": _line(tx("C5_BASES_L14"), 12, "sans")
		_button(tx("C5_UNIT_KV") if _pu else tx("C5_UNIT_PU"), "c5_unit", func(): _pu = not _pu; _sig = ""; refresh())
		for b in q.buses: _box.add_child(_bus_row(b, q))
	var tr: Dictionary = q.track
	match _level:
		"L14": _line(tx("C5_TAPS") % int(tr.get("tapOps", 0)), 13)
		"L15":
			var nl = q.get("noLoad")
			if nl != null: _line(tx("C5_L15_NOLOAD") % [float(nl.v0), float(nl.v0) * 400.0], 13, "sans")
			_line(tx("C5_L15_GLOSS"), 12, "sans")
			_line(tx("C5_OPS") % int(tr.get("switchOps", 0)), 13)
		"L16": _l16(q)
		"L17": _l17(q)
		"L18": _l18(q, g)

func _bus_row(b: Dictionary, q: Dictionary) -> Label:
	var pu = b.get("pu"); var txt := "%s  " % str(b.name).substr(0, 14).rpad(14)
	if pu == null: txt += tx("C5_NOT_YET")
	elif _pu: txt += "%.3f pu" % float(pu)
	else: txt += "%.2f kV" % float(b.kV)
	if b.get("given", false): txt += " " + tx("C5_GIVEN")
	var l := GridTheme.label(txt, 14, GridTheme.PAPER_INK, "mono")
	var lo = q.get("lo"); var hi = q.get("hi")
	if pu != null and lo != null and float(b.kv) > 1.0 and ((hi != null and float(pu) > float(hi)) or float(pu) < float(lo)) and str(b.id) in ["B4", "B5", "B6", "B2"]: l.add_theme_color_override("font_color", Color(0.75, 0.1, 0.05))
	return l

func _l16(q: Dictionary) -> void:
	_line(tx("C5_L16_HEAD"), 12, "sans")
	for ln in q.lines:
		var n = ln.get("n1Pct"); var pct := int(ln.loadingPct)
		var bar := "#".repeat(clampi(int(round(pct / 10.0)), 0, 14))
		var t := "%s %-14s %3d%% of %d MVA" % [str(ln.id), bar, pct, int(round(float(ln.ratingMVA)))]
		if n != null: t += "  N-1 %d%%" % int(n)
		var l := _line(t if ln.inService else str(ln.id) + "  " + tx("C5_OPEN"), 12)
		if pct > 100: l.add_theme_color_override("font_color", Color(0.75, 0.1, 0.05))
	var tr: Dictionary = q.track
	if tr.has("peakLoadingN1"): _line(tx("C5_L16_DAYWORST") % [int(round(float(tr.peakLoadingN1) * 100.0)), _hm(int(tr.get("peakLoadingBlock", 0)))], 13, "sans")   # the report's number, with its time, beside the "now" table
	if tr.has("n1Max"): _line(tx("C5_N1") % int(round(float(tr.n1Max) * 100.0)) + tx("C5_AT") % _hm(int(tr.get("n1MaxBlock", 0))), 13, "sans")
	_line(tx("C5_L16_GLOSS"), 12, "sans")

static func _hm(b: int) -> String: return "%02d:%02d" % [b / 4, (b % 4) * 15]

func _l17(q: Dictionary) -> void:
	var pv = q.get("pv")
	if pv == null:
		_chart = PvChart.new(); _box.add_child(_chart)
		_line(tx("C5_L17_MARGIN_NONE"), 14, "mono"); _line(tx("C5_L17_WAIT"), 13, "sans"); return
	_chart = PvChart.new(); _chart.data = pv; _box.add_child(_chart)
	_line(tx("C5_L17_NOSE") % [float(pv.noseMW), float(pv.loadMW), float(pv.marginPct)], 14, "mono")
	var h := _line(tx("C5_L17_CAP"), 12, "sans"); h.modulate = Color(1, 1, 1, 0.8)

func _l18(q: Dictionary, g: Dictionary) -> void:
	var gs: Dictionary = q.gs
	var gv = q.get("givens")
	if gv != null:
		_line(tx("C5_G_HEAD"), 13, "sans")
		for ln in gv.lines: _line("%s  %s-%s  z = %.4f + j%.4f pu" % [str(ln.id), str(ln.from), str(ln.to), float(ln.r), float(ln.x)], 11)
		_line(tx("C5_G_SLACK") % float(gv.slackV), 11)
		_line(tx("C5_G_LOAD") % [float(gv.loadP), float(gv.loadQ), float(gv.extraP), float(gv.extraQ)], 11)
		_line(tx("C5_G_PV") % [float(gv.pvP) / 100.0, float(gv.pvV), float(gv.qMax) / 100.0], 11)
		_line(tx("C5_G_START"), 11)
		_line(tx("C5_G_FORMULA"), 11)
	var locked: bool = str(g.get("status", "playing")) != "playing" or int(g.tick) > int(g.levelStart)
	_line(tx("C5_L18_WHAT_GS"), 12, "sans")
	var fl := _line(tx("C5_L18_FORMULA2"), 14, "mono"); fl.add_theme_color_override("font_color", Color(0.1, 0.25, 0.55))   # the update on a line of its own
	_line(tx("C5_L18_SLACK"), 12, "sans")
	if locked:   # the sweep table holds the answers: it is drawn once the predictions are locked

		_line(tx("C5_L18_GS") % [int(gs.gsIterations), int(gs.nrIterations)], 13, "sans")
		for i in [1, 2, 3, 5, 8]:
			var s: Dictionary = gs.sweeps[i]
			_line("GS %2d  V2 %.5f  err 1e%d" % [int(s.k), float(s.v2), int(floor(log(maxf(float(s.mismatch), 1e-16)) / log(10.0)))], 12)
		_line("NR %2d  V2 %.5f  err < 1e-8" % [int(gs.nrIterations), float((gs.truth as Dictionary).get("l18.v2", 0.0))], 12)
	for p in PRED: _predict(str(p[0]), str(p[1]), tx(str(p[2])), locked)
	var p3 = q.get("pv3")
	if p3 != null:
		_line(tx("C5_L18_Q") % [float(p3.q), float(p3.qMax), float(p3.vSet)], 13, "mono")
		_line(tx("C5_L18_VSET_GLOSS"), 12, "sans")
		var h := HBoxContainer.new(); h.add_theme_constant_override("separation", 6); _box.add_child(h)
		for d in [-0.01, 0.01]:
			var b := Button.new(); b.text = (tx("C5_VSET_DN") if d < 0 else tx("C5_VSET_UP")); b.name = "c5_vset_" + ("dn" if d < 0 else "up"); b.custom_minimum_size = Vector2(130, 28); b.add_theme_font_size_override("font_size", GridTheme.fs(12)); b.disabled = locked; b.focus_mode = CbKit.focus_mode()
			b.pressed.connect(func(): if _do("setVSet", ["B3", snappedf(float(p3.vSet) + d, 0.001)]): _sig = ""; refresh())
			h.add_child(b)

func _predict(id: String, unit: String, caption: String, locked: bool) -> void:
	var h := HBoxContainer.new(); h.add_theme_constant_override("separation", 6)
	var lb := GridTheme.label(("▶ " if id == "l18.v2gs1" and not locked else "") + caption, 13, GridTheme.PAPER_INK, "sans"); lb.custom_minimum_size.x = 170; lb.autowrap_mode = TextServer.AUTOWRAP_WORD; h.add_child(lb)
	var e := LineEdit.new(); e.placeholder_text = "?"; e.custom_minimum_size = Vector2(80, 28); e.editable = not locked; e.name = "c5_p_" + id
	for p in app.b.g.metrics.predictions: if p.id == id: e.text = str(snappedf(float(p.predicted), 0.0001))
	if id == "l18.v2gs1" and not locked:   # the first thing to type: an accent outline
		var sb := StyleBoxFlat.new(); sb.bg_color = Color(1, 1, 1, 0.55); sb.border_color = Color(0.9, 0.5, 0.1); sb.set_border_width_all(3); sb.set_corner_radius_all(4); sb.content_margin_left = 6
		e.add_theme_stylebox_override("normal", sb); e.add_theme_color_override("font_color", Color(0, 0, 0)); e.placeholder_text = tx("C5_TYPE_HERE"); e.add_theme_color_override("font_placeholder_color", Color(0.45, 0.25, 0.05))
	e.text_submitted.connect(func(s): _submit(id, unit, s)); e.focus_exited.connect(func(): _submit(id, unit, e.text))
	h.add_child(e); h.add_child(GridTheme.label(unit, 13, GridTheme.PAPER_INK, "sans")); _box.add_child(h)

func _submit(id: String, unit: String, s: String) -> void:
	var t := s.strip_edges().replace(",", ".")
	if t == "" or not t.is_valid_float(): return
	for p in app.b.g.metrics.predictions: if p.id == id and is_equal_approx(float(p.predicted), float(t)): return
	_do("predict", [id, float(t), unit])
