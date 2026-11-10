class_name Ch6Panel
extends PanelContainer
## Chapter 6's control-room card (right edge), drawn only on L19-L22: the frequency in numbers (f, the lowest point, the RoCoF the last trip started at, shed MW), and the
## actions the generic tray has no cell for: hold a spare unit spinning, put a battery on frequency response, run a store on the sun's clock, move the irrigation pumps,
## fit ride-through, and the textbook predictions of the exam bridge. Display and input only: every number and every refusal is the engine's.
const W := 350.0
const LEVELS := ["L19", "L20", "L21", "L22"]
var app: CbApp
var _level := ""
var _sig := ""
var _box: VBoxContainer
var _readout: Label
var _edits := {}
var _card := false
var _curve: NetCurve

func _init() -> void:
	name = "Ch6Panel"; visible = false; mouse_filter = Control.MOUSE_FILTER_STOP
	add_theme_stylebox_override("panel", GridTheme.paper_sb(4, 10.0))
	_box = VBoxContainer.new(); _box.add_theme_constant_override("separation", 4); add_child(_box)
	GridUi.load_strings()

func tx(k: String) -> String: return TranslationServer.translate(k)

func _g() -> Dictionary: return app.b.g

func refresh() -> void:
	if app == null or not app.started or app.b == null: visible = false; return
	var li = app.b.q("levelInfo")
	_level = str(li.id) if li is Dictionary and li.get("active", false) else ""
	visible = _level in LEVELS
	if not visible: return
	var g := _g()
	var sig := _level + str(g.budget.spent) + str((g.actionLog as Array).size()) + str((g.units as Array).size()) + str((g.storage as Array).size()) + str(g.get("status", "")) + str(g.get("tick", 0))
	for u in g.units: sig += ("1" if u.online else "0") + str(snappedf(float(u.droopPct), 0.1))
	for b in g.storage: sig += str(b.mode)
	for l in g.loads: sig += str(l.get("shape") != null)
	sig += str((g.rules as Dictionary).get("derLegacyIds", []).size())
	if sig != _sig: _sig = sig; _rebuild()
	_readout.text = _readout_text(g)
	_layout()

func _layout() -> void:
	var vp := get_viewport_rect().size
	size = Vector2(W, 0); custom_minimum_size = Vector2(W, 0)
	position = Vector2(vp.x - W - 14.0, 74.0)

func _readout_text(g: Dictionary) -> String:
	var tr: Dictionary = g.metrics.track
	var s := tx("C6_F") % float(g.freq.fHz)
	if tr.has("nadirHz") and float(tr.nadirHz) < float(g.freq.fHz) - 1e-6 or tr.has("rocof0"): s += "\n" + tx("C6_NADIR") % [float(tr.get("nadirHz", g.freq.fHz)), float(tr.get("rocof0", 0.0))]
	if float(tr.get("shedMW", 0.0)) > 0.0: s += "\n" + tx("C6_SHED") % float(tr.shedMW)
	if _level == "L20" and tr.has("inRangePct"): s += "\n" + tx("C6_BAND") % [float(tr.inRangePct), float(tr.get("curtailPct", 0.0))]
	return s

func _btn(text: String, act: String, args: Array, extra: Array = []) -> void:
	var b := Button.new(); b.text = text; b.custom_minimum_size = Vector2(0, 30); b.focus_mode = CbKit.focus_mode(); b.name = "c6_" + act
	b.add_theme_font_size_override("font_size", GridTheme.fs(14))
	b.pressed.connect(func():
		var ok := _do(act, args)
		for e in extra: if ok: ok = _do(e[0], e[1])
	)
	_box.add_child(b)

func _do(act: String, args: Array) -> bool:
	var r: Dictionary = app.b.act(act, args)
	var quiet := DisplayServer.get_name() == "headless"
	if r.get("ok", false):
		if not quiet: app.sfx("click")
	elif not quiet: app.sfx("bad"); app.toast(str(r.get("message", "")), "bad")
	if not quiet: app.game_on_changed()
	return bool(r.get("ok", false))

func _rebuild() -> void:
	for c in _box.get_children(): _box.remove_child(c); c.queue_free()
	_edits.clear()
	var g := _g()
	var head := GridTheme.label(tx("C6_TITLE_" + _level), 18, GridTheme.PAPER_INK, "title"); _box.add_child(head)
	_readout = GridTheme.label("", 14, GridTheme.PAPER_INK, "mono"); _box.add_child(_readout)
	var locked: bool = str(g.get("status", "playing")) != "playing" or int(g.tick) > int(g.levelStart)
	match _level:
		"L19": _l19(g, locked)
		"L20": _l20(g, locked)
		"L21": _l21(g, locked)
		"L22": _l22(g, locked)
	for c in _box.get_children(): if c is Button: (c as Button).disabled = locked and not (c.name == "c6_noop")

func _unit(g: Dictionary, id: String):
	for u in g.units: if u.id == id: return u
	return null

func _l19(g: Dictionary, locked: bool) -> void:
	var sp = _unit(g, "U17")
	if sp != null and not sp.online and sp.commit.schedule.size() == 0: _btn(tx("C6_SPIN"), "spinUnit", ["U17"]); _note(tx("C6_SPIN_WHY"))
	_ffr_buttons(g)
	_predict("rocof0", "Hz/s", tx("C6_P_ROCOF"), locked)
	_note(tx("C6_BARS"))

func _note(t: String) -> void:
	var l := GridTheme.label(t, 12, Color(GridTheme.PAPER_INK, 0.75), "sans"); l.autowrap_mode = TextServer.AUTOWRAP_WORD; l.custom_minimum_size.x = W - 24.0; _box.add_child(l)

func _ffr_buttons(g: Dictionary) -> void:
	for b in g.storage:
		if str(b.mode) != "ffr": _btn(tx("C6_FFR") % [str(b.id), int(round(float(b.mw)))], "setFfr", [str(b.id)])

func _l20(g: Dictionary, locked: bool) -> void:
	_curve = NetCurve.new(); _curve.custom_minimum_size = Vector2(W - 24.0, 92.0); _curve.g = g; _curve.fc = app.b.q("netForecast"); _curve.note = tx("C6_FORECAST"); _curve.cap = tx("C6_NET"); _curve.ramp_fmt = tx("C6_RAMP"); _box.add_child(_curve)
	_note(tx("C6_COMMIT_GLOSS"))
	var r = app.b.q("actionCost", ["placeUnit", ["B1", "ocgt-105", 105]])
	if r is Dictionary and r.get("ok", false): _note(tx("C6_PEAKER_PRICE") % [CbRegion.money(float(r.cost) / 105.0, false, 0), CbRegion.money(float(r.cost), false, 0)])
	for b in g.storage:
		if str(b.mode) != "schedule": _btn(tx("C6_CLOCK") % [str(b.id), int(round(float(b.mw)))], "setStoreClock", [str(b.id), 10, 14, 15, 21])
	for l in g.loads:
		if str(l["class"]) == "agricultural":
			var noon: bool = l.shape != null and float((l.shape.p as Array)[44]) > 0.5
			_btn(tx("C6_PUMP_NIGHT") if noon else tx("C6_PUMP_NOON"), "shiftLoad", [str(l.id), "night" if noon else "noon"])

func _l21(g: Dictionary, locked: bool) -> void:
	for id in ["U6", "U7", "U8"]:
		var u = _unit(g, id)
		if u != null and not u.online and u.commit.schedule.size() == 0: _btn(tx("C6_COAL") % id, "spinUnit", [id]); break
	for u in g.units:
		if str(u.kind) == "synccon" and not u.online: _btn(tx("C6_COND") % [str(u.id), int(round(float(u.mva)))], "spinUnit", [str(u.id)])
	_ffr_buttons(g)
	if (g.rules as Dictionary).get("derLegacyIds", []).size() > 0: _btn(tx("C6_RIDE"), "upgradeRideThrough", []); _note(tx("C6_RIDE_GLOSS"))
	_predict("rocof0", "Hz/s", tx("C6_P_ROCOF"), locked)
	_note(tx("C6_BARS"))

func _l22(g: Dictionary, locked: bool) -> void:
	var card := Label.new(); card.text = tx("C6_FORM_TEXT"); card.autowrap_mode = TextServer.AUTOWRAP_WORD; card.custom_minimum_size.x = W - 24.0; card.visible = _card
	card.add_theme_font_size_override("font_size", GridTheme.fs(11)); card.add_theme_color_override("font_color", GridTheme.PAPER_INK); card.name = "c6_card"
	var tg := Button.new(); tg.text = tx("C6_FORMULAS_HIDE") if _card else tx("C6_FORMULAS"); tg.name = "c6_toggle"; tg.focus_mode = CbKit.focus_mode(); tg.add_theme_font_size_override("font_size", GridTheme.fs(13))
	tg.pressed.connect(func(): _card = not _card; _sig = ""; refresh())
	_box.add_child(tg); _box.add_child(card)
	for id in ["U1", "U2"]:
		var u = _unit(g, id)
		if u == null: continue
		var h := HBoxContainer.new(); h.add_theme_constant_override("separation", 4)
		var lb := GridTheme.label(tx("C6_DROOP") % ["G" + id.substr(1), float(u.droopPct)], 14, GridTheme.PAPER_INK, "mono"); lb.custom_minimum_size.x = 130; h.add_child(lb)
		for d in [-0.5, -0.1, 0.1, 0.5]:
			var b := Button.new(); b.text = ("%+.1f" % d); b.custom_minimum_size = Vector2(34, 28); b.name = "c6_d_%s_%s" % [id, str(d)]; b.disabled = locked
			b.add_theme_font_size_override("font_size", GridTheme.fs(12)); b.pressed.connect(func(): _do("setDroop", [id, snappedf(float(_unit(_g(), id).droopPct) + d, 0.01)])); h.add_child(b)
		_box.add_child(h)
	_predict("examA", "Hz/s", tx("C6_P_A"), locked)
	_predict("examB", "Hz", tx("C6_P_B"), locked)
	_predict("examC", "MW", tx("C6_P_C"), locked)

func _predict(id: String, unit: String, caption: String, locked: bool) -> void:
	var h := HBoxContainer.new(); h.add_theme_constant_override("separation", 6)
	var lb := GridTheme.label(caption, 13, GridTheme.PAPER_INK, "sans"); lb.custom_minimum_size.x = 190; lb.autowrap_mode = TextServer.AUTOWRAP_WORD; h.add_child(lb)
	var e := LineEdit.new(); e.placeholder_text = "?"; e.custom_minimum_size = Vector2(80, 28); e.editable = not locked; e.name = "c6_p_" + id; e.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	for p in _g().metrics.predictions: if p.id == id: e.text = str(snappedf(float(p.predicted), 0.0001))
	e.text_submitted.connect(func(s): _submit(id, unit, s)); e.focus_exited.connect(func(): _submit(id, unit, e.text))
	h.add_child(e); h.add_child(GridTheme.label(unit, 13, GridTheme.PAPER_INK, "sans")); _box.add_child(h); _edits[id] = e

func _submit(id: String, unit: String, s: String) -> void:
	var t := s.strip_edges().replace(",", ".")
	if t == "" or not t.is_valid_float(): return
	for p in _g().metrics.predictions: if p.id == id and is_equal_approx(float(p.predicted), float(t)): return
	_do("predict", [id, float(t), unit])


## L20's net load: demand minus the sun, from the day's history, with the steepest climb marked. Display only.
class NetCurve extends Control:
	var g: Dictionary = {}
	var cap := ""
	var ramp_fmt := ""
	var fc = null
	var note := ""
	func _draw() -> void:
		draw_rect(Rect2(Vector2.ZERO, size), Color(GridTheme.PAPER_INK, 0.08))
		var e: Array = g.get("history", {}).get("entries", [])
		var f := ThemeDB.fallback_font
		draw_string(f, Vector2(4, 12), cap, HORIZONTAL_ALIGNMENT_LEFT, -1, 11, GridTheme.PAPER_INK)
		var top := 18.0; var bh := size.y - top - 14.0
		var fnet: Array = fc.net if fc is Dictionary else []
		var fhi := 1.0
		for v in fnet: fhi = maxf(fhi, float(v))
		if not fnet.is_empty():
			var fp := PackedVector2Array()
			for i in fnet.size(): fp.append(Vector2(4.0 + (size.x - 8.0) * float(i) / 95.0, top + bh * (1.0 - float(fnet[i]) / fhi)))
			for i in range(0, fp.size() - 1, 2): draw_line(fp[i], fp[i + 1], Color(GridTheme.PAPER_INK, 0.45), 1.5)
			draw_string(f, Vector2(4, size.y - 3), note, HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color(GridTheme.PAPER_INK, 0.7))
		if e.size() < 2: return
		var net: Array = []; var hi := fhi
		for x in e:
			var pv := float((x.genMW as Dictionary).get("pv", 0.0)); var n := float(x.demandMW) - pv; net.append(n); hi = maxf(hi, n)
		var ramp := 0.0; var at := 0
		for i in range(1, net.size()):
			var r: float = (float(net[i]) - float(net[i - 1])) / 15.0
			if r > ramp: ramp = r; at = i
		var pts := PackedVector2Array()
		for i in net.size(): pts.append(Vector2(4.0 + (size.x - 8.0) * float(i) / 95.0, top + bh * (1.0 - float(net[i]) / hi)))
		if pts.size() > 1: draw_polyline(pts, GridTheme.PAPER_INK, 2.0)
		if ramp > 1.0:
			draw_circle(pts[at], 4.0, Color("#C0392B"))
			var blk := int(e[at].block)
			draw_string(f, Vector2(4, size.y - 15), ramp_fmt % [int(round(ramp)), blk / 4, (blk % 4) * 15], HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color("#C0392B"))
