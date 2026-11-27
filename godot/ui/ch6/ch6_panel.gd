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
var _root: VBoxContainer
var _scroll: ScrollContainer
var _toggle_btn: Button
var _collapsed := false
var _kept := false
var _reset_frame := -1
var _last_tick := 1 << 30
var _seen_level := ""
var _curve: NetCurve
var _bar: ShareBar

func _init() -> void:
	name = "Ch6Panel"; visible = false; mouse_filter = Control.MOUSE_FILTER_STOP
	add_theme_stylebox_override("panel", GridTheme.paper_sb(4, 10.0))
	_root = VBoxContainer.new(); _root.add_theme_constant_override("separation", 2); add_child(_root)
	_toggle_btn = Button.new(); _toggle_btn.flat = true; _toggle_btn.name = "c6_collapse"; _toggle_btn.alignment = HORIZONTAL_ALIGNMENT_LEFT; _toggle_btn.focus_mode = CbKit.focus_mode()
	_toggle_btn.add_theme_font_size_override("font_size", GridTheme.fs(16)); _toggle_btn.add_theme_color_override("font_color", GridTheme.chit_ink())
	_toggle_btn.pressed.connect(func(): _collapsed = not _collapsed; _apply_collapse()); _root.add_child(_toggle_btn)
	_scroll = ScrollContainer.new(); _scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; _scroll.name = "c6_scroll"; _root.add_child(_scroll)
	_box = VBoxContainer.new(); _box.add_theme_constant_override("separation", 4); _box.size_flags_horizontal = Control.SIZE_EXPAND_FILL; _scroll.add_child(_box)
	GridUi.load_strings()

## LOOK2: glass with light ink while the 3D province shows (GridTheme.look2), paper in the classic look.
var _skin := ""
func _apply_skin() -> void:
	var want := "glass" if GridTheme.look2 else "paper"
	if want == _skin: return
	_skin = want; _sig = ""
	add_theme_stylebox_override("panel", GridTheme.glass_sb(0.78, 4, 10.0) if GridTheme.look2 else GridTheme.paper_sb(4, 10.0))
	_toggle_btn.add_theme_color_override("font_color", GridTheme.chit_ink())

## True while a number is being typed into one of the fields (the chrome then leaves the keys alone).
func editing() -> bool:
	for k in _edits: if is_instance_valid(_edits[k]) and (_edits[k] as LineEdit).has_focus(): return true
	return false

func tx(k: String) -> String: return TranslationServer.translate(k)

func _g() -> Dictionary: return app.b.g

func refresh() -> void:
	if app == null or not app.started or app.b == null: visible = false; return
	var li = app.b.q("levelInfo")
	_level = str(li.id) if li is Dictionary and li.get("active", false) else ""
	visible = _level in LEVELS
	if not visible: return
	_apply_skin()
	var g := _g()
	if _level != _seen_level or int(g.tick) < _last_tick: _reset_frame = Engine.get_process_frames(); _seen_level = _level   # a fresh start or a Retry
	if Engine.get_process_frames() == _reset_frame:   # Retry restarts the job and replays the build in the same frame: was a build already standing once it is back?
		var k := float(g.budget.spent) > 0.0 and int(g.tick) <= int(g.levelStart)
		_kept = k; _sig = ""
	_last_tick = int(g.tick)
	var sig := _level + str(g.budget.spent) + str((g.actionLog as Array).size()) + str((g.units as Array).size()) + str((g.storage as Array).size()) + str(g.get("status", "")) + str(g.get("tick", 0))
	for u in g.units: sig += ("1" if u.online else "0") + str(snappedf(float(u.droopPct), 0.1))
	for b in g.storage: sig += str(b.mode)
	for l in g.loads: sig += str(l.get("shape") != null)
	sig += str((g.rules as Dictionary).get("derLegacyIds", []).size())
	if sig != _sig and not editing(): _sig = sig; _rebuild()
	_readout.text = _readout_text(g)
	_apply_collapse()

func _phone() -> bool: return CbLayout.kind == "phone"

func _apply_collapse() -> void:
	_scroll.visible = not (_phone() and _collapsed)
	_toggle_btn.visible = _phone()
	_toggle_btn.text = ("▸ " if _collapsed else "▾ ") + tx("C6_TITLE_" + _level) if _level != "" else ""
	_layout()

func _layout() -> void:
	if not is_inside_tree(): return   # a panel built off-tree (headless flow test) has no viewport to fit
	var vp := Vector2(app.vw(), app.vs_h()) if app != null and app.is_inside_tree() and app.has_method("vw") else get_viewport_rect().size   # the app's usable area: the safe-area inset is already taken off
	var pw := minf(W, vp.x - 16.0) if _phone() else W
	var top := 74.0
	# wholly inside the viewport: below the HUD, above the spent/budget tag; taller content scrolls (finger drag or wheel), on the phone the header collapses it.
	# The scroll box needs an explicit height on every layout: a ScrollContainer in AUTO mode has no minimum height of its own (the desktop card shrank to a 0 px strip).
	var maxh := maxf(60.0, vp.y - 185.0 - top)
	_scroll.custom_minimum_size = Vector2(pw - 24.0 if _phone() else 0.0, 0)   # desktop: as wide as its widest row (the button captions stay on one line)
	var want: float = _box.get_combined_minimum_size().y
	var room := maxh - ((_toggle_btn.get_combined_minimum_size().y if _toggle_btn.visible else 0.0) + 24.0)
	var fits := want <= maxf(40.0, room)
	if not _phone() and fits:   # desktop card that fits: no scroll box behaviour at all, the card is exactly its content (as before the phone layout)
		_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; _scroll.custom_minimum_size.y = 0.0
	else:
		_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
		_scroll.custom_minimum_size.y = minf(want, maxf(40.0, room)) if _scroll.visible else 0.0
	custom_minimum_size = Vector2(pw, 0); reset_size()
	var w := maxf(size.x, get_combined_minimum_size().x)
	size.x = w
	position = Vector2(maxf(4.0, vp.x - w - (8.0 if _phone() else 14.0)), clampf(top, 4.0, maxf(4.0, vp.y - size.y - 24.0)))

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
	var head := GridTheme.label(tx("C6_TITLE_" + _level), 18, GridTheme.chit_ink(), "title"); if not _phone(): _box.add_child(head)   # on a phone the collapse header carries the title
	_readout = GridTheme.label("", 14, GridTheme.chit_ink(), "mono"); _box.add_child(_readout)
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

func _note(t: String) -> void:
	var l := GridTheme.label(t, 12, Color(GridTheme.chit_ink(), 0.75), "sans"); l.autowrap_mode = TextServer.AUTOWRAP_WORD; l.custom_minimum_size.x = W - 24.0; _box.add_child(l)

func _cost_text(act: String, args: Array) -> String:
	var r = app.b.q("actionCost", [act, args])
	if r is Dictionary and r.get("ok", false) and float(r.cost) > 0.0: return " · " + tx("C6_COSTS") % CbRegion.money(float(r.cost), true, 1)
	return ""

## One fixed row per switch: [ON] when it is done (button disabled), [OFF] with the engine's price when it is not. Rows never appear or vanish, so nothing moves under the pointer.
func _toggle(label: String, on: bool, act: String, args: Array) -> void:
	var b := Button.new(); b.custom_minimum_size = Vector2(0, 30); b.focus_mode = CbKit.focus_mode(); b.name = "c6_" + act + "_" + (str(args[0]) if args.size() > 0 else "")
	b.add_theme_font_size_override("font_size", GridTheme.fs(14)); b.alignment = HORIZONTAL_ALIGNMENT_LEFT
	b.text = ("[ON]  " if on else "[OFF] ") + label + ("" if on else _cost_text(act, args)); b.disabled = on; b.custom_minimum_size = Vector2(0, 34)
	b.pressed.connect(func(): _do(act, args))
	_box.add_child(b)

func _held(u) -> bool: return u != null and (u.online or u.commit.schedule.size() > 0)

func _l19(g: Dictionary, locked: bool) -> void:
	_kept_note(g)
	var sp = _unit(g, "U17")
	if sp != null: _toggle(tx("C6_SPIN"), _held(sp), "spinUnit", ["U17"]); _note(tx("C6_SPIN_WHY"))
	_note(tx("C6_BATT_READY"))
	_predict("rocof0", "Hz/s", tx("C6_P_ROCOF"), locked)

func _kept_note(g: Dictionary) -> void:
	if _kept: _note(tx("C6_KEPT"))

func _l20(g: Dictionary, locked: bool) -> void:
	_curve = NetCurve.new(); _curve.custom_minimum_size = Vector2(W - 24.0, 118.0); _curve.g = g; _curve.fc = app.b.q("netForecast"); _curve.note = tx("C6_FORECAST"); _curve.cap = tx("C6_NET"); _curve.ramp_fmt = tx("C6_RAMP"); _box.add_child(_curve)
	_note(tx("C6_COMMIT_GLOSS"))
	var r = app.b.q("actionCost", ["placeUnit", ["B1", "ocgt-105", 105]])
	if r is Dictionary and r.get("ok", false): _note(tx("C6_PEAKER_PRICE") % [CbRegion.money(float(r.cost) / 105.0, false, 0), CbRegion.money(float(r.cost), false, 0)])
	for b in g.storage:
		if str(b.mode) != "schedule": _btn(tx("C6_CLOCK") % [str(b.id), int(round(float(b.mw)))], "setStoreClock", [str(b.id), 10, 14, 15, 21])
		else:   # a store on its clock keeps its row, ticked (the row used to vanish: after Retry "S2-S8, no S1" read as a lost store)
			var done := Button.new(); done.text = "✓ " + tx("C6_CLOCKED") % [str(b.id), int(round(float(b.mw)))]; done.disabled = true; done.custom_minimum_size = Vector2(0, 30); done.name = "c6_clocked_" + str(b.id)
			done.focus_mode = Control.FOCUS_NONE; done.add_theme_font_size_override("font_size", GridTheme.fs(14)); _box.add_child(done)
	for u in g.units:   # a peaker you bought stands idle until ordered on: one button orders it on for the dusk ramp (testers bought gas units and never committed them)
		if str(u.get("catalogId", "")) != "ocgt-105": continue
		var sch: Array = (u.get("commit", {}) as Dictionary).get("schedule", []) if u.get("commit") is Dictionary else []
		if sch.any(func(v): return float(v) > 0.5) or bool(u.get("online", false)):
			var on := Button.new(); on.text = "✓ " + tx("C6_PEAKER_ON") % [str(u.id), int(round(float(u.pMax)))]; on.disabled = true; on.custom_minimum_size = Vector2(0, 30); on.name = "c6_peaker_on_" + str(u.id)
			on.focus_mode = Control.FOCUS_NONE; on.add_theme_font_size_override("font_size", GridTheme.fs(14)); _box.add_child(on)
		else: _btn(tx("C6_PEAKER_ORDER") % [str(u.id), int(round(float(u.pMax)))], "commit", [str(u.id), true, 56])
	for l in g.loads:
		if str(l["class"]) == "agricultural":
			var noon: bool = l.shape != null and float((l.shape.p as Array)[44]) > 0.5
			_btn(tx("C6_PUMP_NIGHT") if noon else tx("C6_PUMP_NOON"), "shiftLoad", [str(l.id), "night" if noon else "noon"])
			_note(tx("C6_PUMP_EFFECT") % int(round(float(l.Ppeak) * 0.95)))

func _l21(g: Dictionary, locked: bool) -> void:
	_kept_note(g)
	for id in ["U6", "U7", "U8"]:
		var u = _unit(g, id)
		if u != null: _toggle(tx("C6_COAL") % id, _held(u), "spinUnit", [id])
	for u in g.units:
		if str(u.kind) == "synccon": _toggle(tx("C6_COND") % [str(u.id), int(round(float(u.mva)))], u.online, "spinUnit", [str(u.id)])
	var ids: Array = (g.rules as Dictionary).get("derLegacyIds", [])
	_toggle(tx("C6_RIDE"), ids.size() == 0, "upgradeRideThrough", [])
	_note(tx("C6_RIDE_GLOSS")); _note(tx("C6_BATT_READY"))
	_predict("rocof0", "Hz/s", tx("C6_P_ROCOF"), locked)
	_note(tx("C6_BARS"))

func _l22(g: Dictionary, locked: bool) -> void:
	var card := Label.new(); card.text = tx("C6_FORM_TEXT"); card.autowrap_mode = TextServer.AUTOWRAP_WORD; card.custom_minimum_size.x = W - 24.0; card.visible = _card
	card.add_theme_font_size_override("font_size", GridTheme.fs(11)); card.add_theme_color_override("font_color", GridTheme.chit_ink()); card.name = "c6_card"
	var tg := Button.new(); tg.text = tx("C6_FORMULAS_HIDE") if _card else tx("C6_FORMULAS"); tg.name = "c6_toggle"; tg.focus_mode = CbKit.focus_mode(); tg.add_theme_font_size_override("font_size", GridTheme.fs(13))
	tg.pressed.connect(func(): _card = not _card; _sig = ""; refresh())
	_box.add_child(tg); _box.add_child(card)
	_note(tx("C6_TASK"))
	var bar := ShareBar.new(); bar.custom_minimum_size = Vector2(W - 24.0, 40.0); bar.name = "c6_sharebar"; bar.caption = tx("C6_TARGET"); _bar = bar; _box.add_child(bar)
	var u1 = _unit(g, "U1"); var u2 = _unit(g, "U2")
	if u1 != null and u2 != null:
		var w1: float = float(u1.mva) / float(u1.droopPct); var w2: float = float(u2.mva) / float(u2.droopPct)
		_bar.share = 100.0 * w1 / (w1 + w2)
	for id in ["U1", "U2"]:
		var u = _unit(g, id)
		if u == null: continue
		var h := HBoxContainer.new(); h.add_theme_constant_override("separation", 4)
		var lb := GridTheme.label(tx("C6_DROOP") % ["G" + id.substr(1), float(u.droopPct)], 14, GridTheme.chit_ink(), "mono"); lb.custom_minimum_size.x = 130; h.add_child(lb)
		for d in [-0.5, -0.1, 0.1, 0.5]:
			var b := Button.new(); b.text = ("%+.1f" % d); b.custom_minimum_size = Vector2(34, 28); b.name = "c6_d_%s_%s" % [id, str(d)]; b.disabled = locked
			b.add_theme_font_size_override("font_size", GridTheme.fs(12)); b.pressed.connect(func(): _do("setDroop", [id, snappedf(float(_unit(_g(), id).droopPct) + d, 0.01)])); h.add_child(b)
		_box.add_child(h)
	_predict("examA", "Hz/s", tx("C6_P_A"), locked)
	_predict("examB", "Hz", tx("C6_P_B"), locked)
	_predict("examC", "MW", tx("C6_P_C"), locked)

func _predict(id: String, unit: String, caption: String, locked: bool) -> void:
	var h := HBoxContainer.new(); h.add_theme_constant_override("separation", 6)
	var lb := GridTheme.label(caption, 13, GridTheme.chit_ink(), "sans"); lb.custom_minimum_size.x = 210; lb.autowrap_mode = TextServer.AUTOWRAP_WORD; h.add_child(lb)
	var e := LineEdit.new(); e.placeholder_text = "? " + unit; e.custom_minimum_size = Vector2(104, 28); e.editable = not locked; e.name = "c6_p_" + id; e.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	for p in _g().metrics.predictions: if p.id == id: e.text = str(snappedf(float(p.predicted), 0.0001))
	e.text_submitted.connect(func(s): _submit(id, unit, s)); e.focus_exited.connect(func(): _submit(id, unit, e.text))
	h.add_child(e); _box.add_child(h); _edits[id] = e

func _submit(id: String, unit: String, s: String) -> void:
	var t := s.strip_edges().replace(",", ".")
	if t == "" or not t.is_valid_float(): return
	for p in _g().metrics.predictions: if p.id == id and is_equal_approx(float(p.predicted), float(t)): return
	_do("predict", [id, float(t), unit])


## L20's net load: demand minus the sun over the day, with an MW axis, the forecast (dashed) and what has happened (solid), and the dusk ramp shaded and labelled. Display only.
class NetCurve extends Control:
	var g: Dictionary = {}
	var cap := ""
	var ramp_fmt := ""
	var fc = null
	var note := ""
	var LM := 34.0
	func _x(i: float) -> float: return LM + (size.x - LM - 6.0) * i / 95.0
	func _draw() -> void:
		# 1.9: laid out from the floored text size (16 px on screen), so the caption, the axis numbers and the ramp label never sit on each other
		var f := ThemeDB.fallback_font; var ink := GridTheme.chit_ink()
		var fz := GridText.floor_size(self, 11)
		draw_rect(Rect2(Vector2.ZERO, size), Color(ink, 0.08))
		GridText.ds(self, f, Vector2(4, fz), cap, HORIZONTAL_ALIGNMENT_LEFT, -1, fz, ink)
		var fnet: Array = fc.net if fc is Dictionary else []
		var e: Array = g.get("history", {}).get("entries", [])
		var net: Array = []
		for x in e: net.append(float(x.demandMW) - float((x.genMW as Dictionary).get("pv", 0.0)))
		var hi := 1.0
		for v in fnet: hi = maxf(hi, float(v))
		for v in net: hi = maxf(hi, float(v))
		hi = ceilf(hi / 1000.0) * 1000.0
		LM = f.get_string_size("%d" % int(hi), HORIZONTAL_ALIGNMENT_LEFT, -1, fz).x + 8.0
		var has_ramp: bool = fc is Dictionary and float(fc.ramp) > 1.0
		var top := fz * (2.0 if has_ramp else 1.0) + 12.0 + fz * 0.6; var bh := size.y - top - fz - 6.0
		var want_h := fz * 3.0 + 18.0 + 70.0
		if custom_minimum_size.y < want_h - 0.5: custom_minimum_size.y = want_h
		for k in 3:   # MW ticks: 0, half, full
			var v := hi * float(k) / 2.0; var y := top + bh * (1.0 - v / hi)
			draw_line(Vector2(LM - 3.0, y), Vector2(size.x - 4.0, y), Color(ink, 0.15), 1.0)
			GridText.ds(self, f, Vector2(2, y + fz * 0.35), "%d" % int(v), HORIZONTAL_ALIGNMENT_LEFT, -1, fz, Color(ink, 0.8))
		for h in [0, 6, 12, 18, 24]:
			var hs := "%02d" % h; var hw := f.get_string_size(hs, HORIZONTAL_ALIGNMENT_LEFT, -1, fz).x
			GridText.ds(self, f, Vector2(clampf(_x(minf(float(h) * 4.0, 95.0)) - hw * 0.5, LM, size.x - hw - 2.0), size.y - 3.0), hs, HORIZONTAL_ALIGNMENT_LEFT, -1, fz, Color(ink, 0.7))
		if has_ramp:   # the dusk ramp: a shaded band around the steepest climb, labelled in MW per hour on its own line under the caption
			var at := float(fc.at); var x0 := _x(maxf(at - 6.0, 0.0)); var x1 := _x(minf(at + 2.0, 95.0))
			draw_rect(Rect2(Vector2(x0, top), Vector2(x1 - x0, bh)), Color("#C0392B", 0.16))
			GridText.ds(self, f, Vector2(4, fz * 2.0 + 6.0), ramp_fmt % int(round(float(fc.ramp) * 60.0)), HORIZONTAL_ALIGNMENT_LEFT, -1, fz, Color("#C0392B"))
		if not fnet.is_empty():
			var fp := PackedVector2Array()
			for i in fnet.size(): fp.append(Vector2(_x(float(i)), top + bh * (1.0 - float(fnet[i]) / hi)))
			for i in range(0, fp.size() - 1, 2): draw_line(fp[i], fp[i + 1], Color(ink, 0.5), 1.5)
		if net.size() > 1:
			var pts := PackedVector2Array()
			for i in net.size(): pts.append(Vector2(_x(float(i)), top + bh * (1.0 - float(net[i]) / hi)))
			draw_polyline(pts, ink, 2.0)


## L22: the 60 % target against the share G1 would take at the droops now set (bar plus number). Display only.
class ShareBar extends Control:
	var share := 0.0
	var caption := ""
	func _draw() -> void:
		var f := ThemeDB.fallback_font; var ink := GridTheme.chit_ink()
		var fz := GridText.floor_size(self, 11)
		if custom_minimum_size.y < fz * 2.0 + 26.0: custom_minimum_size.y = fz * 2.0 + 26.0
		GridText.ds(self, f, Vector2(0, fz), caption, HORIZONTAL_ALIGNMENT_LEFT, -1, fz, ink)
		var r := Rect2(0.0, fz + 6.0, size.x - 56.0, 14.0)
		draw_rect(r, Color(ink, 0.12))
		draw_rect(Rect2(r.position.x + r.size.x * 0.58, r.position.y, r.size.x * 0.04, r.size.y), Color("#3E8E5A", 0.45))   # the 58-62 % target band
		var ok := absf(share - 60.0) <= 2.0
		draw_rect(Rect2(r.position, Vector2(r.size.x * clampf(share / 100.0, 0.0, 1.0), r.size.y)), Color("#3E8E5A") if ok else Color("#C0392B"))
		draw_line(Vector2(r.position.x + r.size.x * 0.6, r.position.y - 3.0), Vector2(r.position.x + r.size.x * 0.6, r.end.y + 3.0), ink, 2.0)
		GridText.ds(self, f, Vector2(r.end.x + 6.0, r.position.y + 12.0), "%.0f %%" % share, HORIZONTAL_ALIGNMENT_LEFT, -1, fz, ink)
		GridText.ds(self, f, Vector2(r.position.x + r.size.x * 0.6 - 10.0, size.y - 1.0), "60", HORIZONTAL_ALIGNMENT_LEFT, -1, fz, Color(ink, 0.8))
