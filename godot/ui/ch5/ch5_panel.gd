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
var _readout: Label
var _chart: PvChart

class PvChart extends Control:
	var data: Dictionary = {}
	func _init() -> void: custom_minimum_size = Vector2(0, 150); mouse_filter = Control.MOUSE_FILTER_IGNORE
	func _draw() -> void:
		var r := Rect2(Vector2(34, 6), size - Vector2(44, 28))
		draw_rect(r, Color(0, 0, 0, 0.06)); draw_rect(r, Color(0, 0, 0, 0.5), false, 1.0)
		var pts: Array = data.get("points", [])
		if pts.size() < 2: return
		var pmax := float(data.get("noseMW", 1.0)) * 1.15; pmax = maxf(pmax, float(data.get("loadMW", 1.0)) * 1.1)
		var f := ThemeDB.fallback_font
		var poly := PackedVector2Array()
		for p in pts: poly.append(Vector2(r.position.x + r.size.x * float(p.pMW) / pmax, r.position.y + r.size.y * (1.0 - (float(p.v) - 0.4) / 0.7)))
		draw_polyline(poly, Color(0.1, 0.35, 0.65), 2.0)
		var nose := Vector2(r.position.x + r.size.x * float(data.noseMW) / pmax, r.position.y + r.size.y * (1.0 - (float(data.noseV) - 0.4) / 0.7))
		draw_circle(nose, 5.0, Color(0.8, 0.15, 0.1)); draw_string(f, nose + Vector2(-26, -8), "nose", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(0.8, 0.15, 0.1))
		var lx := r.position.x + r.size.x * float(data.loadMW) / pmax
		draw_line(Vector2(lx, r.position.y), Vector2(lx, r.end.y), Color(0.15, 0.5, 0.2), 1.5)
		draw_string(f, Vector2(r.position.x, r.end.y + 14), "0", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(0, 0, 0, 0.7))
		draw_string(f, Vector2(r.end.x - 40, r.end.y + 14), "%d MW" % int(pmax), HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(0, 0, 0, 0.7))
		draw_string(f, Vector2(2, r.position.y + 10), "1.1", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(0, 0, 0, 0.7)); draw_string(f, Vector2(2, r.end.y), "0.4", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(0, 0, 0, 0.7))

func _init() -> void:
	name = "Ch5Panel"; visible = false; mouse_filter = Control.MOUSE_FILTER_STOP
	add_theme_stylebox_override("panel", GridTheme.paper_sb(4, 10.0))
	_box = VBoxContainer.new(); _box.add_theme_constant_override("separation", 4); add_child(_box)
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
	size = Vector2(W, 0); custom_minimum_size = Vector2(W, 0); reset_size(); position = Vector2(vp.x - W - 14.0, 74.0)

func _do(act: String, args: Array) -> bool:
	var r: Dictionary = app.b.act(act, args)
	var quiet := DisplayServer.get_name() == "headless"
	if r.get("ok", false):
		if not quiet: app.sfx("click")
	elif not quiet: app.sfx("bad"); app.toast(str(r.get("message", "")), "bad")
	if not quiet: app.game_on_changed()
	return bool(r.get("ok", false))

func _line(text: String, size_px := 14, font := "mono") -> Label:
	var l := GridTheme.label(text, size_px, GridTheme.PAPER_INK, font); l.autowrap_mode = TextServer.AUTOWRAP_WORD; l.custom_minimum_size = Vector2(W - 28.0, 0); _box.add_child(l); return l

func _button(text: String, nm: String, cb: Callable) -> Button:
	var b := Button.new(); b.text = text; b.custom_minimum_size = Vector2(0, 28); b.focus_mode = CbKit.focus_mode(); b.name = nm
	b.add_theme_font_size_override("font_size", GridTheme.fs(14)); b.pressed.connect(cb); _box.add_child(b); return b

func _rebuild() -> void:
	for c in _box.get_children(): _box.remove_child(c); c.queue_free()
	var q = app.b.q("ch5Panel")
	if not (q is Dictionary) or not q.get("active", false): return
	var g: Dictionary = app.b.g
	_box.add_child(GridTheme.label(tx("C5_TITLE_" + _level), 18, GridTheme.PAPER_INK, "title"))
	if (q.buses as Array).size() > 0:
		_button(tx("C5_UNIT_KV") if _pu else tx("C5_UNIT_PU"), "c5_unit", func(): _pu = not _pu; _sig = ""; refresh())
		for b in q.buses: _box.add_child(_bus_row(b, q))
	var tr: Dictionary = q.track
	match _level:
		"L14": _line(tx("C5_TAPS") % int(tr.get("tapOps", 0)), 13)
		"L15": _line(tx("C5_OPS") % int(tr.get("switchOps", 0)), 13)
		"L16": _l16(q)
		"L17": _l17(q)
		"L18": _l18(q, g)

func _bus_row(b: Dictionary, q: Dictionary) -> Label:
	var pu = b.get("pu"); var txt := "%s  " % str(b.name).substr(0, 14).rpad(14)
	if pu == null: txt += "-"
	elif _pu: txt += "%.3f pu" % float(pu)
	else: txt += "%.2f kV" % float(b.kV)
	var l := GridTheme.label(txt, 14, GridTheme.PAPER_INK, "mono")
	var lo = q.get("lo"); var hi = q.get("hi")
	if pu != null and lo != null and float(b.kv) > 1.0 and ((hi != null and float(pu) > float(hi)) or float(pu) < float(lo)) and str(b.id) in ["B4", "B5", "B6", "B2"]: l.add_theme_color_override("font_color", Color(0.75, 0.1, 0.05))
	return l

func _l16(q: Dictionary) -> void:
	_line(tx("C5_L16_HEAD"), 12, "sans")
	for ln in q.lines:
		var n = ln.get("n1Pct"); var pct := int(ln.loadingPct)
		var bar := "#".repeat(clampi(int(round(pct / 10.0)), 0, 14))
		var t := "%s %-14s %3d%%" % [str(ln.id), bar, pct]
		if n != null: t += "  N-1 %d%%" % int(n)
		var l := _line(t if ln.inService else str(ln.id) + "  " + tx("C5_OPEN"), 12)
		if pct > 100: l.add_theme_color_override("font_color", Color(0.75, 0.1, 0.05))
	var tr: Dictionary = q.track
	if tr.has("n1Max"): _line(tx("C5_N1") % int(round(float(tr.n1Max) * 100.0)), 13, "sans")

func _l17(q: Dictionary) -> void:
	var pv = q.get("pv")
	if pv == null: _line(tx("C5_L17_WAIT"), 13, "sans"); return
	_chart = PvChart.new(); _chart.data = pv; _box.add_child(_chart)
	_line(tx("C5_L17_NOSE") % [float(pv.noseMW), float(pv.loadMW), float(pv.marginPct)], 14, "mono")
	var h := _line(tx("C5_L17_CAP"), 12, "sans"); h.modulate = Color(1, 1, 1, 0.8)

func _l18(q: Dictionary, g: Dictionary) -> void:
	var gs: Dictionary = q.gs
	var locked: bool = str(g.get("status", "playing")) != "playing" or int(g.tick) > int(g.levelStart)
	if not locked: _line(tx("C5_L18_HIDE"), 13, "sans")   # the sweep table holds the answers: it is drawn once the predictions are locked
	else:
		_line(tx("C5_L18_GS") % [int(gs.gsIterations), int(gs.nrIterations)], 13, "sans")
		for i in [1, 2, 3, 5, 8]:
			var s: Dictionary = gs.sweeps[i]
			_line("GS %2d  V2 %.5f  err 1e%d" % [int(s.k), float(s.v2), int(floor(log(maxf(float(s.mismatch), 1e-16)) / log(10.0)))], 12)
		_line("NR %2d  V2 %.5f  err < 1e-8" % [int(gs.nrIterations), float((gs.truth as Dictionary).get("l18.v2", 0.0))], 12)
	for p in PRED: _predict(str(p[0]), str(p[1]), tx(str(p[2])), locked)
	var p3 = q.get("pv3")
	if p3 != null:
		_line(tx("C5_L18_Q") % [float(p3.q), float(p3.qMax), float(p3.vSet)], 13, "mono")
		var h := HBoxContainer.new(); h.add_theme_constant_override("separation", 6); _box.add_child(h)
		for d in [-0.01, 0.01]:
			var b := Button.new(); b.text = ("B3  -0.01" if d < 0 else "B3  +0.01"); b.name = "c5_vset_" + ("dn" if d < 0 else "up"); b.custom_minimum_size = Vector2(120, 28); b.disabled = locked; b.focus_mode = CbKit.focus_mode()
			b.pressed.connect(func(): if _do("setVSet", ["B3", snappedf(float(p3.vSet) + d, 0.001)]): _sig = ""; refresh())
			h.add_child(b)

func _predict(id: String, unit: String, caption: String, locked: bool) -> void:
	var h := HBoxContainer.new(); h.add_theme_constant_override("separation", 6)
	var lb := GridTheme.label(caption, 13, GridTheme.PAPER_INK, "sans"); lb.custom_minimum_size.x = 170; lb.autowrap_mode = TextServer.AUTOWRAP_WORD; h.add_child(lb)
	var e := LineEdit.new(); e.placeholder_text = "?"; e.custom_minimum_size = Vector2(80, 28); e.editable = not locked; e.name = "c5_p_" + id
	for p in app.b.g.metrics.predictions: if p.id == id: e.text = str(snappedf(float(p.predicted), 0.0001))
	e.text_submitted.connect(func(s): _submit(id, unit, s)); e.focus_exited.connect(func(): _submit(id, unit, e.text))
	h.add_child(e); h.add_child(GridTheme.label(unit, 13, GridTheme.PAPER_INK, "sans")); _box.add_child(h)

func _submit(id: String, unit: String, s: String) -> void:
	var t := s.strip_edges().replace(",", ".")
	if t == "" or not t.is_valid_float(): return
	for p in app.b.g.metrics.predictions: if p.id == id and is_equal_approx(float(p.predicted), float(t)): return
	_do("predict", [id, float(t), unit])
