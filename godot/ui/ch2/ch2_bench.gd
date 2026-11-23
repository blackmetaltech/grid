class_name Ch2Bench
extends Control
## Chapter 2's two closed-form benches on one stage: L04 "Spin the Alternator" (a cutaway alternator, the oscilloscope hologram above it, the village's bulbs
## and fan) and L06 "Exam Bridge: The Town Line" (powerhouse, step-up, a heat-glowing line, step-down, the town, and the 800 kW bar split into what arrives and
## what the wire kept). The panel at the bottom is the tray: knobs for the winding (poles, turns, field, coil area) or the chips of the turns ratio and kVA rating,
## the prediction box and the paper price tag. Display and input only: every number comes from the engine query `ch2Bench`, every change is an engine action.
## Cute mode: the bulbs and windows have faces that are happy exactly when the engine says the numbers are in band.

const M := 14.0
const PANEL_H := 138.0
const SLOWMO := 25.0           ## the rotor is drawn this many times slower than the shaft turns (500 rpm is 8 turns a second)
const SCOPE_MS := 40.0         ## the scope's horizontal span

var app: CbApp
var q: Dictionary = {}         ## the engine's ch2Bench
var kind := ""                 ## "" | "machine" | "town"
var panel := Rect2()
var hits: Array = []           ## {rect, id, kind: "knob"|"step"|"chip"|"predict", ...}
var pending := {}              ## action name -> arg, applied once per frame (a drag sends many)
var drag_id := ""
var predict_edit: LineEdit
var predict_btn: Button
var predict_msg := ""
var _t := 0.0
var _level := ""
var _hover := ""

static func T(key: String) -> String: return TranslationServer.translate(key)

func _init() -> void:
	name = "Ch2Bench"; mouse_filter = Control.MOUSE_FILTER_STOP; visible = false
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	predict_edit = LineEdit.new(); predict_edit.placeholder_text = "0"; predict_edit.custom_minimum_size = Vector2(80, 30); predict_edit.alignment = HORIZONTAL_ALIGNMENT_RIGHT
	predict_edit.text_submitted.connect(func(_s): _on_predict()); predict_edit.visible = false; add_child(predict_edit)
	predict_btn = Button.new(); predict_btn.pressed.connect(_on_predict); predict_btn.visible = false; add_child(predict_btn)
	GridUi.load_strings(); TrayStrings.load_strings()
	predict_btn.text = T("C2_PREDICT_BTN")

func _locked() -> bool:
	return app == null or app.speed > 0 or str(app.b.g.get("status", "playing")) != "playing"

## The 3D bench (world3d/bench3d.gd) is showing: the place is drawn in 3D and this stage keeps only its instruments and the panel, in glass.
func _look3() -> bool:
	var w = app.get("grid_world") if app != null else null
	return w != null and w.look3d != null and w.look3d.visible and w.look3d is Bench3D

## In 3D only the panel (and a price tag hung above a narrow panel) takes the mouse; drags on the stage reach the world and turn the camera.
func _has_point(p: Vector2) -> bool:
	if not _look3(): return Rect2(Vector2.ZERO, size).has_point(p)
	var r := panel.grow(4.0)
	if _tag_above(): r = r.grow_side(SIDE_TOP, 72.0)
	return r.has_point(p)

# ---- state ------------------------------------------------------------------------------------------------------------------------
func refresh() -> void:
	if app == null or not app.started: visible = false; return
	var r = app.b.q("ch2Bench")
	if not (r is Dictionary) or not r.get("active", false):
		visible = false; kind = ""; q = {}; return
	q = r; kind = str(r.kind); visible = true
	var li = app.b.q("levelInfo")
	var id: String = str(li.id) if li is Dictionary and li.get("active", false) else ""
	if id != _level: _level = id; predict_msg = ""; predict_edit.text = ""
	predict_edit.editable = not _locked(); predict_btn.disabled = _locked()
	layout(); queue_redraw()

func layout() -> void:
	if app == null or not visible: return
	var ch = app.get("chrome")
	var slot: Rect2 = ch.tray_rect() if ch != null else Rect2(Vector2(M, size.y - 96 - M), Vector2(size.x - 2 * M, 96))
	var w := maxf(slot.size.x, 300.0)   # exactly the slot between the radio and the breaker
	panel = Rect2(Vector2(slot.position.x, slot.end.y - PANEL_H), Vector2(w, PANEL_H))
	if panel.end.x > size.x - M: panel.position.x = size.x - M - panel.size.x
	hits.clear()
	var pad := 12.0
	var inner := Rect2(panel.position + Vector2(pad, 8.0), panel.size - Vector2(2.0 * pad, 16.0))
	if kind == "machine":
		var n := 4; var cw := inner.size.x / float(n)
		var ids := ["poles", "turns", "field", "area"]
		for i in n:
			var c := Rect2(inner.position + Vector2(cw * i, 0.0), Vector2(cw - 8.0, 66.0))
			hits.append({"rect": c, "id": ids[i], "kind": "knob"})
		_place_predict(Rect2(inner.position + Vector2(0.0, 76.0), Vector2(inner.size.x, 40.0)))
	elif kind == "town":
		var rr: Array = q.ratios; var cw2 := (inner.size.x - 64.0) / float(rr.size())
		for i in rr.size():
			hits.append({"rect": Rect2(inner.position + Vector2(64.0 + cw2 * i, 0.0), Vector2(cw2 - 3.0, 30.0)), "id": "ratio", "kind": "chip", "arg": int(rr[i])})
		var kv: Array = q.kvas; var kw := minf(66.0, (inner.size.x - 64.0 - 24.0) / float(q.kvas.size()) - 6.0)
		for i in kv.size():
			hits.append({"rect": Rect2(inner.position + Vector2(64.0 + (kw + 6.0) * i, 36.0), Vector2(kw, 30.0)), "id": "kva", "kind": "chip", "arg": int(kv[i])})
		_place_predict(Rect2(inner.position + Vector2(0.0, 76.0), Vector2(inner.size.x, 40.0)))

func _narrow() -> bool: return panel.size.x < 540.0

## The price tag hangs above the panel: on a narrow panel, and in 3D on any panel under 760 px (the 3D world has room above it; the predict row needs its width).
func _tag_above() -> bool: return _narrow() or (_look3() and panel.size.x < 760.0)

func _place_predict(row: Rect2) -> void:
	predict_edit.visible = true; predict_btn.visible = true
	var bw := 90.0
	var tag_room := 0.0 if _tag_above() else 186.0
	if _look3() and not _tag_above(): tag_room = minf(_tag_w() + 22.0, row.size.x * 0.4)   # 3D: the tag grows with an over-budget figure; the row steps clear of it (never more than 40 % of the row)   # a narrow panel hangs the price tag above itself and gives the row to the prediction
	predict_btn.position = row.position + Vector2(row.size.x - bw - tag_room, 4.0); predict_btn.size = Vector2(bw, 30.0)
	predict_edit.position = predict_btn.position - Vector2(88.0, 0.0); predict_edit.size = Vector2(80.0, 30.0)

# ---- input ------------------------------------------------------------------------------------------------------------------------
func _gui_input(e: InputEvent) -> void:
	if not visible: return
	if e is InputEventMouseButton and e.button_index == MOUSE_BUTTON_LEFT:
		if e.pressed:
			predict_edit.release_focus()
			var h := _hit_at(e.position)
			if h.is_empty(): return
			if _locked(): app.toast(T("C2_LOCKED"), "warn"); app.sfx("bad"); accept_event(); return
			if str(h.kind) == "chip":
				_send("setLineRatio" if str(h.id) == "ratio" else "setTransformerKva", h.arg)
			elif str(h.kind) == "knob":
				drag_id = str(h.id); _knob_press(h, e.position)
			accept_event()
		else:
			drag_id = ""
	elif e is InputEventMouseMotion:
		var hv := _hit_at(e.position)
		var hs: String = "%s/%s" % [str(hv.get("id", "")), str(hv.get("arg", ""))] if not hv.is_empty() else ""
		if hs != _hover: _hover = hs; queue_redraw()
		if drag_id != "" and (e.button_mask & MOUSE_BUTTON_MASK_LEFT) != 0 and not _locked():
			for h in hits:
				if str(h.id) == drag_id and str(h.kind) == "knob": _knob_drag(h, e.position)
			accept_event()

func _hit_at(p: Vector2) -> Dictionary:
	for h in hits: if (h.rect as Rect2).has_point(p): return h
	return {}

## Geometry of one knob cell: [-] button, track, [+] button below the caption and value.
func _knob_parts(r: Rect2) -> Dictionary:
	var by := r.position.y + 40.0
	return {"minus": Rect2(Vector2(r.position.x, by), Vector2(24, 24)), "plus": Rect2(Vector2(r.end.x - 24.0, by), Vector2(24, 24)),
		"track": Rect2(Vector2(r.position.x + 30.0, by + 4.0), Vector2(r.size.x - 60.0, 16.0))}

## The knobs' ranges and steps (the engine's `ranges` and its action argument rules).
func _spec(id: String) -> Dictionary:
	var rg: Dictionary = q.ranges
	match id:
		"poles": return {"act": "setPoles", "min": float(rg.poles.min), "max": float(rg.poles.max), "step": 2.0, "log": false}
		"turns": return {"act": "setTurns", "min": float(rg.turns.min), "max": float(rg.turns.max), "step": 1.0, "log": true}
		"field": return {"act": "setField", "min": float(rg.fieldT.min), "max": float(rg.fieldT.max), "step": 0.01, "log": false}
		_: return {"act": "setArea", "min": float(rg.areaM2.min), "max": float(rg.areaM2.max), "step": 0.005, "log": false}

func _value(id: String) -> float:
	var m: Dictionary = q.machine
	match id:
		"poles": return float(m.poles)
		"turns": return float(m.turns)
		"field": return float(m.fieldT)
		_: return float(m.areaM2)

func _to_frac(id: String, v: float) -> float:
	var s := _spec(id)
	if bool(s.log): return clampf(log(v / float(s.min)) / log(float(s.max) / float(s.min)), 0.0, 1.0)
	return clampf((v - float(s.min)) / (float(s.max) - float(s.min)), 0.0, 1.0)

func _from_frac(id: String, f: float) -> float:
	var s := _spec(id)
	var v: float = float(s.min) * pow(float(s.max) / float(s.min), f) if bool(s.log) else lerpf(float(s.min), float(s.max), f)
	var st: float = float(s.step); var lo: float = float(s.min)
	v = lo + roundf((v - lo) / st) * st
	return clampf(snappedf(v, st if st >= 1.0 else 0.001), float(s.min), float(s.max))

func _knob_press(h: Dictionary, p: Vector2) -> void:
	var parts := _knob_parts(h.rect)
	var id := str(h.id); var s := _spec(id)
	if (parts.minus as Rect2).grow(6.0).has_point(p): _nudge(id, -1); drag_id = ""
	elif (parts.plus as Rect2).grow(6.0).has_point(p): _nudge(id, 1); drag_id = ""
	else: _knob_drag(h, p)
	if s.is_empty(): return

func _knob_drag(h: Dictionary, p: Vector2) -> void:
	var tr: Rect2 = _knob_parts(h.rect).track
	var f := clampf((p.x - tr.position.x) / tr.size.x, 0.0, 1.0)
	var id := str(h.id); var v := _from_frac(id, f)
	if not is_equal_approx(v, _value(id)): _queue(str(_spec(id).act), v if id in ["field", "area"] else int(v))

func _nudge(id: String, dir: int) -> void:
	var s := _spec(id); var v := clampf(_value(id) + float(s.step) * dir, float(s.min), float(s.max))
	v = snappedf(v, float(s.step) if float(s.step) >= 1.0 else 0.001)
	_send(str(s.act), v if id in ["field", "area"] else int(v))

func _queue(act: String, arg) -> void: pending[act] = arg

func _process(dt: float) -> void:
	if not visible: return
	_t += dt
	var l3 := _look3()
	if l3 != _was3: _was3 = l3; layout()   # the 3D bench came up (or went) after this level's first layout: the predict row and the tag move
	for act in pending.keys():   # one action per knob per frame, whatever the drag sent
		var arg = pending[act]; _send(String(act), arg)
	pending.clear()
	if not CbSettings.reduced_motion or kind != "": queue_redraw()

func _send(act: String, arg) -> void:
	var r: Dictionary = app.b.act(act, [arg])
	if r.get("ok", false): app.sfx("click")
	else: app.sfx("bad"); app.toast(str(r.get("message", "")), "bad")
	app.game_on_changed()

func _on_predict() -> void:
	var txt := predict_edit.text.strip_edges().replace(",", ".")
	if txt == "" or not txt.is_valid_float(): predict_msg = T("C2_PREDICT_BAD"); queue_redraw(); return
	var unit := "V" if kind == "machine" else "kW"
	var r: Dictionary = app.b.act("predict", [str(q.predictId), float(txt), unit])
	predict_msg = ""
	if r.get("ok", false): app.sfx("click")
	else: app.sfx("bad"); app.toast(str(r.get("message", "")), "bad")
	predict_edit.release_focus(); app.game_on_changed()

# ---- drawing helpers --------------------------------------------------------------------------------------------------------------
func _text(font: Font, fsz: int, at: Vector2, s: String, col: Color, w := -1.0, align := 0) -> void:
	var f := GridTheme.fs(fsz); var tw := font.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, f).x
	var x := at.x
	if w > 0.0: x = at.x + (w - tw) * (0.5 if align == 1 else 1.0 if align == 2 else 0.0)
	GridText.ds(self, font, Vector2(x, at.y), s, HORIZONTAL_ALIGNMENT_LEFT, -1, f, col)

func _money(x: float) -> String: return CbRegion.money(x, false, 0)
func _f(x: float, d: int) -> String: return String.num(x, d)
func _good(ok: bool) -> Color: return GridTheme.GOOD if ok else GridTheme.BAD

func _draw() -> void:
	if not visible or q.is_empty(): return
	if _look3():
		_chips.clear()
		if _tag_above(): _chips.append(Rect2(Vector2(panel.end.x - 240.0, panel.position.y - 80.0), Vector2(240.0, 80.0)))   # the hanging price tag
		if kind == "machine": _draw_machine3()
		elif kind == "town": _draw_town3()
		_draw_panel()
		return
	draw_rect(Rect2(Vector2.ZERO, size), GridTheme.NIGHT, true)   # an opaque stage: the island the world draws underneath is not this level's place
	draw_polygon(PackedVector2Array([Vector2(0, 0), Vector2(size.x, 0), Vector2(size.x, size.y), Vector2(0, size.y)]), PackedColorArray([Color("#0E1432"), Color("#0E1432"), Color("#2A3768"), Color("#2A3768")]))
	for i in 38: # stars
		var sx := fposmod(float(i) * 197.31, size.x); var sy := fposmod(float(i) * 83.7, size.y * 0.42)
		draw_circle(Vector2(sx, sy), 1.0 + float(i % 3) * 0.4, Color(1, 1, 1, 0.25 + 0.2 * sin(_t * 1.3 + float(i))))
	if kind == "machine": _draw_machine()
	elif kind == "town": _draw_town()
	_draw_panel()

# ---- L04: the alternator ----------------------------------------------------------------------------------------------------------
func _draw_machine() -> void:
	var w := size.x; var h := size.y
	draw_rect(Rect2(0, h * 0.70, w, h), Color("#17331F"))   # grass, the waterfall's bank
	var R := minf(h * 0.095, w * 0.075); var c := Vector2(w * 0.27, h * 0.53)
	_draw_scope(Rect2(Vector2(w * 0.05, h * 0.17), Vector2(w * 0.50, h * 0.20)))
	_draw_alternator(c, R)
	_draw_waterfall(Vector2(w * 0.04, h * 0.42), h * 0.20)
	_draw_village(Rect2(Vector2(w * 0.60, h * 0.45), Vector2(w * 0.37, h * 0.25)))
	_draw_readouts(Rect2(Vector2(w * (0.60 if w >= 1100.0 else 0.57), h * 0.17), Vector2(w * (0.36 if w >= 1100.0 else 0.41), h * 0.24)))
	var mono := GridTheme.font("mono")
	var tx := c.x + R + 34.0
	_text(mono, 13, Vector2(tx, c.y - 6.0), T("C2_RPM") % int(q.machine.rpm), Color(GridTheme.TEXT, 0.9))
	_text(mono, 12, Vector2(tx, c.y + 14.0), T("C2_SLOWMO") % int(SLOWMO), Color(GridTheme.DIM, 0.95))

func _draw_waterfall(at: Vector2, hh: float) -> void:
	var cut := at + Vector2(-0.0, 0.0)
	draw_rect(Rect2(cut + Vector2(-30, -10), Vector2(46, hh + 40)), Color("#3A3F52"))
	for i in 7:
		var x := cut.x + 4.0 + float(i) * 4.5
		var off := fposmod(_t * 90.0 + float(i) * 23.0, hh)
		draw_line(Vector2(x, cut.y + off - 30.0), Vector2(x, cut.y + off), Color("#9FD8FF", 0.75), 2.5, true)
	draw_rect(Rect2(cut + Vector2(-4, hh), Vector2(54, 10)), Color("#4A8FD0", 0.8))   # the pool, the Francis runner's penstock leads on to the machine
	draw_line(cut + Vector2(40, hh + 4), Vector2(cut.x + 70.0, cut.y + hh - 20.0), Color("#6C7A8C"), 8.0)

func _draw_scope(r: Rect2) -> void:
	var mono := GridTheme.font("mono"); var semi := GridTheme.font("semi")
	draw_style_box(GridTheme.ink_sb(0.82, 10, 0.0), r)
	draw_rect(r.grow(-6.0), Color(GridTheme.LIVE, 0.05), true)
	var mid := r.position.y + r.size.y * 0.5; var scale := (r.size.y * 0.5 - 12.0) / 400.0   # px per volt, ±400 V full scale
	for k in [-300, -200, -100, 0, 100, 200, 300]: draw_line(Vector2(r.position.x + 8, mid - k * scale), Vector2(r.end.x - 8, mid - k * scale), Color(GridTheme.LIVE, 0.14 if k != 0 else 0.3), 1.0)
	for k in 9: draw_line(Vector2(r.position.x + 8 + (r.size.x - 16.0) * k / 8.0, r.position.y + 6), Vector2(r.position.x + 8 + (r.size.x - 16.0) * k / 8.0, r.end.y - 6), Color(GridTheme.LIVE, 0.10), 1.0)
	# the target band: the peak the village needs, ± the tolerance (green), both sides
	var pk := float(q.vPeakTargetV); var tol := float(q.machine.vTolPct) / 100.0
	for sgn in [-1.0, 1.0]:
		draw_rect(Rect2(Vector2(r.position.x + 8, mid - sgn * pk * (1.0 + tol) * scale), Vector2(r.size.x - 16.0, pk * 2.0 * tol * scale)), Color(GridTheme.GOOD, 0.22), true)
	var e0 := float(q.e0V); var f := float(q.fHz); var col: Color = GridTheme.GOOD if bool(q.ok) else (GridTheme.WARN if (bool(q.vOk) or bool(q.fOk)) else GridTheme.BAD)
	var n := 220; var pts := PackedVector2Array(); var x0 := r.position.x + 8.0; var wd := r.size.x - 16.0
	var drift := _t * 0.004 if not CbSettings.reduced_motion else 0.0   # the trace crawls: the scope runs 250 times slower than the clock on the wall
	for i in n + 1:
		var tt := (float(i) / float(n)) * (SCOPE_MS / 1000.0) + drift
		var v := clampf(e0 * sin(TAU * f * tt), -420.0, 420.0)
		pts.append(Vector2(x0 + wd * float(i) / float(n), mid - v * scale))
	draw_polyline(pts, Color(col, 0.22), 7.0, true)
	draw_polyline(pts, col, 2.5, true)
	_text(semi, 11, r.position + Vector2(12, 16), T("C2_SCOPE") % int(SCOPE_MS), Color(GridTheme.LIVE, 0.8))
	_text(mono, 13, Vector2(r.position.x + 210.0, r.position.y + 17.0), T("C2_SCOPE_E0") % _f(e0, 1), col)
	_text(mono, 11, Vector2(r.end.x - 200.0, r.end.y - 8.0), T("C2_SCOPE_BAND") % _f(pk, 0), Color(GridTheme.GOOD, 0.9), 190.0, 2)
	# one period's width, measured on the trace: a ruler under the first cycle
	var per_px := wd * (1.0 / f) / (SCOPE_MS / 1000.0)
	if per_px < wd:
		var ry := r.end.y - 18.0
		draw_line(Vector2(x0, ry), Vector2(x0 + per_px, ry), Color(GridTheme.SODIUM, 0.9), 2.0); draw_line(Vector2(x0, ry - 4), Vector2(x0, ry + 4), GridTheme.SODIUM, 2.0); draw_line(Vector2(x0 + per_px, ry - 4), Vector2(x0 + per_px, ry + 4), GridTheme.SODIUM, 2.0)
		_text(mono, 11, Vector2(x0 + 4.0, ry - 6.0), T("C2_PERIOD") % _f(1000.0 / f, 1), GridTheme.SODIUM)

func _draw_alternator(c: Vector2, R: float) -> void:
	var m: Dictionary = q.machine; var p := int(m.poles)
	var okf: bool = bool(q.fOk)
	# base and stator: an iron ring with a coil group for each pair of poles
	draw_rect(Rect2(c + Vector2(-R * 1.25, R * 1.0), Vector2(R * 2.5, 12.0)), Color("#2B3140"))
	draw_circle(c, R + 12.0, Color("#3A4256")); draw_circle(c, R + 12.0, Color(0, 0, 0, 0.0))
	draw_arc(c, R + 12.0, 0.0, TAU, 64, Color("#6C7A8C"), 3.0, true)
	draw_circle(c, R, Color("#10152B"))
	var coils := maxi(2, p)
	var fl := fposmod(_t * 6.0, TAU)
	for k in coils:
		var a := TAU * float(k) / float(coils) + PI / float(coils)
		var pos := c + Vector2(cos(a), sin(a)) * (R + 3.0)
		var live := 0.5 + 0.5 * sin(fl * float(p) * 0.5 - float(k) * PI)   # coils light alternately: the emf changes sign as a north then a south pole passes
		draw_circle(pos, minf(11.0, R * 3.14 / float(coils) * 0.38), Color(GridTheme.COPPER).lerp(Color("#FFE0B0"), live * 0.7))
	# rotor: p pole faces, north red and south blue, turning at the shaft speed in slow motion
	var theta := _t * (float(m.rpm) / 60.0) * TAU / SLOWMO if not CbSettings.reduced_motion else 0.3
	var rr := R - 8.0
	draw_circle(c, rr, Color("#262E47"))
	for k in p:
		var a0 := theta + TAU * float(k) / float(p); var span := TAU / float(p) * 0.78
		var pts := PackedVector2Array(); pts.append(c)
		for j in 7: var aa := a0 - span * 0.5 + span * float(j) / 6.0; pts.append(c + Vector2(cos(aa), sin(aa)) * rr)
		draw_colored_polygon(pts, Color("#D8483F") if k % 2 == 0 else Color("#3F6FD8"))
		if p <= 12:
			var lp := c + Vector2(cos(a0), sin(a0)) * rr * 0.72
			_text(GridTheme.font("mono"), 11, lp + Vector2(-4, 4), "N" if k % 2 == 0 else "S", Color.WHITE)
	draw_circle(c, 10.0, Color("#8E99A8")); draw_circle(c, 4.0, GridTheme.NIGHT)
	_text(GridTheme.font("semi"), 13, c + Vector2(R + 34.0, -R * 0.5), T("C2_POLES") + " " + T("C2_V_POLES") % p + " · " + T("C2_FORMULA_F"), Color(GridTheme.TEXT, 0.9))
	if GridSettings.cute:   # the hub has a face: happy when the village's frequency is right
		_face(c + Vector2(0, 0), 14.0, okf, 0.9)

func _face(c: Vector2, r: float, happy: bool, a: float) -> void:
	draw_circle(c + Vector2(-r * 0.35, -r * 0.2), r * 0.12, Color(GridTheme.INK, a)); draw_circle(c + Vector2(r * 0.35, -r * 0.2), r * 0.12, Color(GridTheme.INK, a))
	var pts := PackedVector2Array()
	for i in 9:
		var t := float(i) / 8.0; var bow := 1.0 - (2.0 * t - 1.0) * (2.0 * t - 1.0)
		pts.append(c + Vector2(lerpf(-r * 0.4, r * 0.4, t), r * ((0.2 + 0.22 * bow) if happy else (0.5 - 0.22 * bow))))
	draw_polyline(pts, Color(GridTheme.INK, a), maxf(1.5, r * 0.1), true)

func _draw_village(r: Rect2) -> void:
	var vr := float(q.eRmsV); var tgt := float(q.machine.vTargetRms); var f := float(q.fHz); var f0 := float(q.machine.fTargetHz)
	var ratio := vr / tgt
	draw_rect(Rect2(r.position + Vector2(0, r.size.y - 8.0), Vector2(r.size.x, 8.0)), Color("#2A3A22"))
	_text(GridTheme.font("semi"), 12, r.position + Vector2(0, -4), T("C2_VILLAGE"), Color(GridTheme.TEXT, 0.7))
	var cols := [Color("#C9A27A"), Color("#B88A6B"), Color("#D2B48C")]
	var hw := r.size.x / 3.0
	for i in 3:
		var hx := r.position.x + hw * i + 6.0; var hr := Rect2(Vector2(hx, r.position.y + 34.0), Vector2(hw - 16.0, r.size.y - 42.0))
		draw_rect(hr, cols[i]); draw_colored_polygon(PackedVector2Array([hr.position + Vector2(-6, 0), hr.position + Vector2(hr.size.x + 6, 0), hr.position + Vector2(hr.size.x * 0.5, -22)]), Color("#8B3B2E"))
		# the bulb in the window
		var bc := hr.position + Vector2(hr.size.x * 0.5, hr.size.y * 0.5)
		var burnt := ratio > 1.15; var hot := ratio > 1.02 + 0.0 and not burnt
		var glow := clampf(ratio, 0.0, 1.2)
		draw_rect(Rect2(bc - Vector2(18, 16), Vector2(36, 32)), Color("#141A33"))
		if not burnt:
			var col := Color("#FFD27A").lerp(Color.WHITE, clampf((ratio - 1.0) * 6.0, 0.0, 1.0)) if ratio >= 0.0 else Color.BLACK
			draw_circle(bc, 14.0 * (0.4 + 0.6 * clampf(glow, 0.0, 1.0)), Color(col, 0.18 + 0.5 * clampf(glow, 0.0, 1.0)))
			draw_circle(bc, 8.0, Color(col, clampf(glow, 0.05, 1.0)))
		else:
			draw_line(bc + Vector2(-6, -6), bc + Vector2(6, 6), Color(GridTheme.BAD), 2.0); draw_line(bc + Vector2(6, -6), bc + Vector2(-6, 6), Color(GridTheme.BAD), 2.0)
		if GridSettings.cute and not burnt: _face(bc, 8.0, bool(q.vOk), clampf(glow, 0.2, 1.0))
		if i == 1:   # the fan on the sill: turns at f / f0 of its proper speed, the clock face hangs on the house to its left
			var fc := hr.position + Vector2(hr.size.x * 0.5, hr.size.y * 0.86); var spin := _t * TAU * 1.2 * (f / f0)
			for k in 3:
				var a := spin + TAU * float(k) / 3.0
				draw_line(fc, fc + Vector2(cos(a), sin(a)) * 11.0, Color("#CFD8E6"), 4.0, true)
			draw_circle(fc, 3.0, Color("#4A5568"))
	var cc := r.position + Vector2(6.0 + (hw - 16.0) * 0.5, r.size.y * 0.26 + 8.0)   # wall clock on the first house: its second hand runs f / f0 times its proper speed (time-lapse)
	draw_circle(cc, 11.0, Color("#F3EEDF")); draw_arc(cc, 11.0, 0, TAU, 20, Color(GridTheme.INK), 1.5)
	var ha := -PI * 0.5 + _t * TAU / 6.0 * (f / f0)
	draw_line(cc, cc + Vector2(cos(ha), sin(ha)) * 9.0, GridTheme.BAD, 1.5, true)

func _draw_readouts(r: Rect2) -> void:
	draw_style_box(GridTheme.ink_sb(0.82, 10, 0.0), r)
	var mono := GridTheme.font("mono"); var semi := GridTheme.font("semi")
	var y := r.position.y + 20.0; var x := r.position.x + 12.0; var lh := minf(26.0, (r.size.y - 14.0) / 5.0)
	var m: Dictionary = q.machine
	var rows := [
		[T("C2_R_FREQ"), T("C2_R_FREQ_V") % _f(float(q.fHz), 2), T("C2_R_NEED") % [_f(float(q.fLoHz), 2), _f(float(q.fHiHz), 2)], bool(q.fOk)],
		[T("C2_R_RMS"), T("C2_R_RMS_V") % _f(float(q.eRmsV), 1), T("C2_R_NEED") % [_f(float(q.vLoV), 1), _f(float(q.vHiV), 1)], bool(q.vOk)],
		[T("C2_R_PEAK"), T("C2_R_PEAK_V") % _f(float(q.e0V), 1), T("C2_R_NEED_PEAK"), bool(q.vOk)],
		[T("C2_R_NBA"), T("C2_R_NBA_V") % [_f(float(q.nba), 3), _f(float(q.omega), 1)], "", true],
		[T("C2_R_COPPER"), T("C2_R_COPPER_V") % _f(float(q.kg), 0), "", true],
	]
	var vx := 140.0
	if _look3():   # 3D: the value column starts after the widest caption (the fixed 140 px ran "PEAK e0 = rms x sqrt 2" into its value)
		for row in rows: vx = maxf(vx, semi.get_string_size(str(row[0]), HORIZONTAL_ALIGNMENT_LEFT, -1, GridTheme.fs(11)).x + 14.0)
	for row in rows:
		_text(semi, 11, Vector2(x, y), str(row[0]), Color(GridTheme.TEXT, 0.65))
		_text(mono, 15, Vector2(x + vx, y), str(row[1]), _good(bool(row[3])) if str(row[2]) != "" else GridTheme.TEXT)
		if str(row[2]) != "": _text(mono, 10, Vector2(r.end.x - 150.0, y), str(row[2]), Color(GridTheme.DIM, 0.95), 140.0, 2)
		y += lh

# ---- L06: the town line -----------------------------------------------------------------------------------------------------------
func _draw_town() -> void:
	var w := size.x; var h := size.y; var sc := clampf(h / 768.0, 0.7, 1.6)
	var ground := h * 0.66
	draw_rect(Rect2(0, ground, w, h - ground), Color("#17331F"))
	var tw: Dictionary = q.town; var ratio := int(tw.ratio)
	var loss := float(q.lossPct); var heat := clampf(loss / 40.0, 0.0, 1.0)
	var iA := float(q.iA); var vtown := clampf(float(q.vTownPu), 0.0, 1.0)
	var x_gen := w * 0.09; var x_up := w * 0.20; var x_dn := w * 0.71; var x_town := w * 0.79
	var mono := GridTheme.font("mono"); var semi := GridTheme.font("semi")
	# textbook badge
	draw_style_box(GridTheme.paper_sb(3, 0.0), Rect2(Vector2(M, 80.0), Vector2(minf(w * 0.34, 380.0), 46.0)))
	_text(semi, 14, Vector2(M + 12.0, 100.0), T("C2_TEXTBOOK"), GridTheme.PAPER_INK)
	_text(GridTheme.font("sans"), 11, Vector2(M + 12.0, 118.0), T("C2_TEXTBOOK_SUB"), Color(GridTheme.PAPER_INK, 0.8))
	# powerhouse
	var g := sc * 1.3
	draw_rect(Rect2(Vector2(x_gen - 38 * g, ground - 56 * g), Vector2(76 * g, 56 * g)), Color("#9AA6B2")); draw_colored_polygon(PackedVector2Array([Vector2(x_gen - 44 * g, ground - 56 * g), Vector2(x_gen + 44 * g, ground - 56 * g), Vector2(x_gen, ground - 82 * g)]), Color("#6C7A8C"))
	var gc := Vector2(x_gen, ground - 28 * g)
	draw_circle(gc, 15.0 * g, Color("#262E47")); draw_arc(gc, 15.0 * g, 0, TAU, 24, GridTheme.SODIUM, 2.0)
	var a := _t * 5.0
	for k in 3: draw_line(gc, gc + Vector2(cos(a + TAU * k / 3.0), sin(a + TAU * k / 3.0)) * 12.0 * g, GridTheme.SODIUM, 2.0)
	_text(mono, 12, Vector2(x_gen - 70, ground + 20.0), T("C2_GEN_KV") % _f(float(tw.vGenV) / 1000.0, 0), Color(GridTheme.TEXT, 0.85), 140.0, 1)
	# transformers: a box with the turns ratio on it
	for side in [0, 1]:
		var tx := x_up if side == 0 else x_dn
		if ratio > 1:
			var bw := 44.0 * g; var bh := 54.0 * g
			draw_rect(Rect2(Vector2(tx - bw * 0.5, ground - bh), Vector2(bw, bh)), Color("#6C7A8C")); draw_rect(Rect2(Vector2(tx - bw * 0.5, ground - bh), Vector2(bw, bh)), GridTheme.NIGHT, false, 2.0)
			for k in 4: draw_line(Vector2(tx - bw * 0.32 + k * bw * 0.21, ground - bh), Vector2(tx - bw * 0.32 + k * bw * 0.21, ground - bh - 16.0 * g), Color("#C8D2DE"), 3.0)
			_text(mono, 12, Vector2(tx - 40, ground + 20.0), "%d:1" % ratio if side == 0 else "1:%d" % ratio, GridTheme.SODIUM, 80.0, 1)
		else:
			draw_rect(Rect2(Vector2(tx - 3, ground - 40 * g), Vector2(6, 40 * g)), Color("#8A6A43"))
	# the line: towers, sagging wires, glowing with the heat of I²R; charges drift at a speed proportional to the current
	var xs0 := x_up + 30.0 * g if ratio > 1 else x_gen + 44.0 * g; var xs1 := x_dn - 30.0 * g if ratio > 1 else x_town - 20.0
	var nt := 9; var th := (126.0 if ratio > 1 else 80.0) * sc
	var wire := Color(GridTheme.COPPER).lerp(Color("#FF5A2E"), heat); var glow := Color("#FF7A3E", 0.10 + 0.5 * heat)
	var tcol := Color("#9AA6B2") if ratio > 1 else Color("#8A6A43")
	for i in nt:
		var tx2 := lerpf(xs0, xs1, float(i) / float(nt - 1))
		draw_line(Vector2(tx2, ground), Vector2(tx2, ground - th), tcol, 5.0 if ratio > 1 else 4.0)
		draw_line(Vector2(tx2 - 11, ground - th), Vector2(tx2 + 11, ground - th), tcol, 3.0)
	for wi in 2:
		var off := float(wi) * 8.0
		var pts := PackedVector2Array()
		for i in 60:
			var u := float(i) / 59.0; var x := lerpf(xs0, xs1, u)
			var seg := fmod(u * float(nt - 1), 1.0); var sag := 12.0 * sc * 4.0 * seg * (1.0 - seg)
			pts.append(Vector2(x, ground - th - 2.0 + off + sag))
		if heat > 0.04: draw_polyline(pts, glow, 9.0 + heat * 10.0, true)
		draw_polyline(pts, wire, 2.5, true)
		var speed := 0.04 + 0.5 * minf(iA / 200.0, 1.0)
		for d in 14:
			var u2 := fposmod(float(d) / 14.0 + (_t * speed) * (1.0 if wi == 0 else -1.0), 1.0)
			var idx := int(u2 * 59.0); draw_circle(pts[idx] + Vector2(0, -3), 2.4, Color(GridTheme.LIVE, 0.9))
	_text(mono, 14, Vector2((xs0 + xs1) * 0.5 - 120.0, ground - th - 38.0 * sc), T("C2_LINE_KV") % _f(float(q.vLineV) / 1000.0, 0) + "   " + T("C2_LINE_AMPS") % _f(iA, 0), wire.lightened(0.25), 240.0, 1)
	# the town: houses whose windows light with the voltage the town gets
	var cols := [Color("#C9A27A"), Color("#B88A6B"), Color("#D2B48C"), Color("#BFA58A")]
	var hs := 1.25 * sc
	for i in 4:
		var hx := x_town + float(i % 2) * 52.0 * hs - 4.0; var hy := ground - 48.0 * hs
		var hr := Rect2(Vector2(hx, hy), Vector2(40.0 * hs, 48.0 * hs)); draw_rect(hr, cols[i])
		draw_colored_polygon(PackedVector2Array([hr.position + Vector2(-5, 0), hr.position + Vector2(hr.size.x + 5, 0), hr.position + Vector2(hr.size.x * 0.5, -18.0 * hs)]), Color("#8B3B2E"))
		for wy in 2:
			var wc := hr.position + Vector2(hr.size.x * 0.5, 14.0 * hs + wy * 22.0 * hs)
			var wh := Vector2(9.0 * hs, 8.0 * hs)
			draw_rect(Rect2(wc - wh, wh * 2.0), Color("#141A33"))
			draw_rect(Rect2(wc - wh, wh * 2.0), Color(Color("#FFD27A"), clampf(vtown * vtown, 0.0, 1.0) * (0.35 + 0.65 * float((i + wy) % 2 == 0 or vtown > 0.6))), true)
			if GridSettings.cute: _face(wc, 7.5 * hs, vtown >= 0.97, 0.7 if vtown > 0.3 else 0.9)
	var tv := T("C2_TOWN_V") % _f(vtown * 100.0, 0); var tvw := mono.get_string_size(tv, HORIZONTAL_ALIGNMENT_LEFT, -1, GridTheme.fs(13)).x
	_text(mono, 13, Vector2(minf(x_town - 20.0, w - 14.0 - tvw), ground + 20.0), tv, _good(bool(q.ok)))
	# Sankey: the 800 kW as sent; green what arrives, red what the wire kept
	_draw_sankey(Rect2(Vector2(w * 0.10, maxf(h * 0.20, 134.0)), Vector2(w * 0.82, 92.0)))

func _draw_sankey(r: Rect2) -> void:
	var mono := GridTheme.font("mono"); var semi := GridTheme.font("semi")
	var tw: Dictionary = q.town; var p := float(tw.pW) / 1000.0; var lossk := float(q.lossKw); var arr := float(q.deliveredKw)
	draw_style_box(GridTheme.ink_sb(0.82, 10, 0.0), r)
	_text(semi, 11, r.position + Vector2(12, 18), T("C2_SANKEY"), Color(GridTheme.TEXT, 0.7))
	var lt := T("C2_LOST") % [_f(lossk, 1 if lossk < 100.0 else 0), _f(loss_pct(), 2 if loss_pct() < 10.0 else 0)]
	_text(mono, 13, Vector2(r.end.x - 12.0 - 460.0, r.position.y + 18.0), lt, _good(bool(q.ok)), 460.0, 2)
	var bar := Rect2(r.position + Vector2(12, 28), Vector2(r.size.x - 24.0, 24.0)); var gw := bar.size.x * arr / p
	draw_rect(Rect2(bar.position, Vector2(gw, bar.size.y)), GridTheme.GOOD); draw_rect(Rect2(bar.position + Vector2(gw, 0), Vector2(bar.size.x - gw, bar.size.y)), GridTheme.BAD)
	var limit_x := bar.position.x + bar.size.x * (1.0 - float(tw.lossMaxPct) / 100.0)   # the loss limit marks where green must reach
	draw_line(Vector2(limit_x, bar.position.y - 4), Vector2(limit_x, bar.end.y + 4), Color.WHITE, 2.0)
	_text(mono, 12, Vector2(limit_x - 190.0, bar.end.y + 15.0), T("C2_R_LIMIT") % WorkOrder.num(float(tw.lossMaxPct)), Color(Color.WHITE, 0.85), 186.0, 2)
	_text(mono, 13, bar.position + Vector2(8, 17), T("C2_ARRIVES") % _f(arr, 0), GridTheme.NIGHT)
	_text(mono, 12, Vector2(r.position.x + 12, r.end.y - 10.0), T("C2_LOSS_EQ") % [_f(float(q.iA), 1), _f(float(q.iA), 1), _f(float(tw.rLoopOhm), 0), _f(lossk, 2)], Color(GridTheme.TEXT, 0.9))

func loss_pct() -> float: return float(q.lossPct)

# ---- the panel: knobs / chips, prediction, price tag --------------------------------------------------------------------------------
func _draw_panel() -> void:
	draw_style_box(GridTheme.ink_sb(0.94, 10, 0.0), panel)
	draw_line(panel.position + Vector2(10, 2), panel.position + Vector2(panel.size.x - 10, 2), Color(GridTheme.SODIUM_DIM, 0.35), 1.0)
	var semi := GridTheme.font("semi"); var mono := GridTheme.font("mono"); var lock := _locked()
	var inner := Rect2(panel.position + Vector2(12.0, 8.0), panel.size - Vector2(24.0, 16.0))
	if kind == "machine":
		for h in hits:
			if str(h.kind) != "knob": continue
			var r: Rect2 = h.rect; var id := str(h.id); var v := _value(id)
			var cap := T("C2_" + id.to_upper())
			var vs := ""
			match id:
				"poles": vs = T("C2_V_POLES") % int(v)
				"turns": vs = T("C2_V_TURNS") % int(v)
				"field": vs = T("C2_V_TESLA") % _f(v, 2)
				_: vs = T("C2_V_M2") % _f(v, 3)
			draw_style_box(_cell_sb(Color(GridTheme.NIGHT, 0.55), drag_id == id), r)
			_text(semi, 11, r.position + Vector2(8, 15), cap, Color(GridTheme.TEXT, 0.7))
			_text(mono, 17, Vector2(r.position.x, r.position.y + 35.0), vs, GridTheme.SODIUM if not lock else GridTheme.DIM, r.size.x - 8.0, 2)
			var pt := _knob_parts(r)
			for k in ["minus", "plus"]:
				var br: Rect2 = pt[k]; draw_rect(br, Color(GridTheme.INK).lightened(0.1 if _hover == "%s/" % id else 0.0)); draw_rect(br, Color(GridTheme.SODIUM_DIM, 0.5), false, 1.0)
				_text(semi, 16, br.position + Vector2(0, 18), "−" if k == "minus" else "+", GridTheme.TEXT, br.size.x, 1)
			var tr: Rect2 = pt.track; var fr := _to_frac(id, v)
			draw_rect(Rect2(tr.position + Vector2(0, 6), Vector2(tr.size.x, 4)), Color(GridTheme.SODIUM_DIM, 0.35))
			draw_rect(Rect2(tr.position + Vector2(0, 6), Vector2(tr.size.x * fr, 4)), GridTheme.SODIUM if not lock else GridTheme.DIM)
			draw_circle(tr.position + Vector2(tr.size.x * fr, 8), 8.0, GridTheme.SODIUM if not lock else GridTheme.DIM); draw_circle(tr.position + Vector2(tr.size.x * fr, 8), 3.0, GridTheme.NIGHT)
		_text(semi, 11, Vector2(inner.position.x, inner.position.y + 94.0), T("C2_PREDICT_V"), Color(GridTheme.TEXT, 0.7))
	elif kind == "town":
		_text(semi, 11, Vector2(inner.position.x, inner.position.y + 19.0), T("C2_RATIO"), Color(GridTheme.TEXT, 0.7))
		_text(semi, 11, Vector2(inner.position.x, inner.position.y + 55.0), T("C2_KVA"), Color(GridTheme.TEXT, 0.7))
		for h in hits:
			var r: Rect2 = h.rect; var arg := int(h.arg)
			var cur: bool = (str(h.id) == "ratio" and arg == int(q.town.ratio)) or (str(h.id) == "kva" and arg == int(q.town.kva))
			var hv := _hover == "%s/%d" % [str(h.id), arg]
			draw_style_box(_cell_sb(Color(GridTheme.SODIUM, 0.2) if cur else (Color(GridTheme.INK).lightened(0.12) if hv else Color(GridTheme.NIGHT, 0.55)), cur or hv), r)
			var s := ""
			if str(h.id) == "ratio": s = T("C2_RATIO_NONE") if arg == 1 else T("C2_RATIO_CHIP") % arg
			else: s = T("C2_KVA_CHIP") % arg
			_text(mono, 13 if r.size.x > 34.0 else 11, Vector2(r.position.x, r.position.y + 20.0), s, GridTheme.SODIUM if cur and not lock else (GridTheme.TEXT if not lock else GridTheme.DIM), r.size.x, 1)
		var ld := float(q.loading) * 100.0
		if ld > 0.0: _text(mono, 12, Vector2(inner.position.x + 64.0 + 4.0 * (minf(66.0, (inner.size.x - 64.0 - 24.0) / 4.0 - 6.0) + 6.0) + 8.0, inner.position.y + 55.0), (T("C2_LOAD_OVER") if bool(q.overload) else T("C2_LOAD")) % _f(ld, 0), GridTheme.BAD if bool(q.overload) else Color(GridTheme.DIM, 0.95))
		_text(semi, 11, Vector2(inner.position.x, inner.position.y + 94.0), T("C2_PREDICT_LOSS"), Color(GridTheme.TEXT, 0.7))
	# the prediction: what was typed, and what turned out
	var pr = q.get("prediction")
	var unit := "V" if kind == "machine" else "kW"
	if predict_msg != "": _text(mono, 12, Vector2(inner.position.x + 10.0, inner.position.y + 118.0), predict_msg, GridTheme.WARN)
	elif pr is Dictionary:
		var s2 := T("C2_PREDICTED") % [_f(float(pr.predicted), 1), unit] if pr.get("actual") == null else T("C2_PREDICTED_ACT") % [_f(float(pr.predicted), 1), unit, _f(float(pr.actual), 1)]
		_text(mono, 12, Vector2(inner.position.x + 10.0, inner.position.y + 118.0), s2, GridTheme.SODIUM)
	_draw_price_tag(panel)

func _cell_sb(fill: Color, lit: bool) -> StyleBoxFlat:
	if _look3(): return GridTheme.glass_cell_sb(fill, lit)
	var s := StyleBoxFlat.new(); s.bg_color = fill; s.set_corner_radius_all(7)
	s.border_color = GridTheme.SODIUM if lit else Color(GridTheme.SODIUM_DIM, 0.28); s.set_border_width_all(2 if lit else 1)
	return s

## The price tag's width as _draw_price_tag sizes it (it grows to its words at the 16 px floor).
func _tag_w() -> float:
	if q.is_empty(): return 176.0
	var txt := T("C2_SPENT") % [_money(float(q.get("spent", 0.0))), _money(float(q.get("budget", 0.0)))]
	var fz16 := GridText.floor_size(self, 13)
	return maxf(176.0, maxf(GridTheme.font("semi").get_string_size(tr("TRAY_BUDGET_CAP"), HORIZONTAL_ALIGNMENT_LEFT, -1, fz16).x + 34.0, GridTheme.font("mono").get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fz16).x + 20.0))

func _draw_price_tag(pn: Rect2) -> void:
	var spent := float(q.get("spent", 0.0)); var budget := float(q.get("budget", 0.0))
	var over := budget > 0.0 and spent > budget + 0.0001
	var txt := T("C2_SPENT") % [_money(spent), _money(budget)]
	var mono := GridTheme.font("mono"); var semi := GridTheme.font("semi")
	var w := 176.0; var h := 44.0
	var fz16 := GridText.floor_size(self, 13)   # 1.9: the tag grows to its words at the 16 px floor (it clipped "build incl. starting kit")
	w = maxf(w, maxf(semi.get_string_size(tr("TRAY_BUDGET_CAP"), HORIZONTAL_ALIGNMENT_LEFT, -1, fz16).x + 34.0, mono.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fz16).x + 20.0)); h = maxf(h, fz16 * 2.0 + 16.0)
	var org := Vector2(pn.end.x - 12.0 - w, pn.end.y - 12.0 - h) if not _tag_above() else Vector2(pn.end.x - 12.0 - w, pn.position.y - h - 6.0)
	var g3 := _look3()
	draw_set_transform(org + Vector2(w, h) * 0.5, 0.0 if g3 else deg_to_rad(-1.4), Vector2.ONE)
	var rect := Rect2(Vector2(-w * 0.5, -h * 0.5), Vector2(w, h))
	draw_style_box(GridTheme.glass_sb(0.8, 4, 0.0) if g3 else GridTheme.paper_sb(3, 0.0), rect)
	if not g3: draw_circle(Vector2(-w * 0.5 + 11.0, -h * 0.5 + 11.0), 3.5, GridTheme.INK)
	var fsz := GridTheme.fs(13); var tw2 := mono.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz).x
	while tw2 > w - 16.0 and fsz > 9: fsz -= 1; tw2 = mono.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz).x
	var ink := GridTheme.G_TEXT if g3 else GridTheme.PAPER_INK
	GridText.ds(self, semi, Vector2(-w * 0.5 + (12.0 if g3 else 22.0), -h * 0.5 + 15.0), tr("TRAY_BUDGET_CAP"), HORIZONTAL_ALIGNMENT_LEFT, -1, GridTheme.fs(10), Color(GridTheme.G_DIM if g3 else ink, 1.0 if g3 else 0.7))
	GridText.ds(self, mono, Vector2(-tw2 * 0.5, h * 0.5 - 8.0), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz, (GridTheme.BAD if g3 else GridTheme.BAD.darkened(0.15)) if over else ink)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

# ---- the 3D bench: glass instruments over the world, place names as chips on the 3D objects ---------------------------------------------
const TOP := 92.0              ## below the work order pin
var _chips: Array = []         ## rects of the chips drawn this frame (a later chip steps clear of an earlier one)
var _top_y := TOP              ## chips stay below the instruments at the top
var _was3 := false

## A caption from the 2D bench's capitals, in sentence case for a chip ("GENERATOR 4 kV" -> "Generator 4 kV"); units keep their case.
static func sentence(s: String) -> String:
	var words := s.split(" ")
	for i in words.size():
		var wd := words[i]
		if wd.length() > 1 and wd == wd.to_upper() and wd != wd.to_lower(): words[i] = wd.to_lower()
	var out := " ".join(words)
	return out.substr(0, 1).to_upper() + out.substr(1) if out != "" else out

func _draw_machine3() -> void:
	var w := size.x; var h := size.y
	var sh := clampf(h * 0.17, 128.0, 186.0)
	var scope := Rect2(Vector2(M, TOP), Vector2(minf(w * 0.40, 760.0), sh))
	_draw_scope(scope)
	var rw := clampf(w * 0.33, 540.0, 620.0)
	var ro := Rect2(Vector2(w - M - rw, TOP), Vector2(rw, 5.0 * 26.0 + 20.0))
	_draw_readouts(ro)
	_top_y = maxf(scope.end.y, ro.end.y) + 10.0
	var m: Dictionary = q.machine
	_chip("alternator", [sentence(T("C2_POLES")) + " " + T("C2_V_POLES") % int(m.poles) + " · " + T("C2_FORMULA_F"), T("C2_RPM") % int(m.rpm) + " · " + T("C2_SLOWMO") % int(SLOWMO)], [GridTheme.G_TEXT, GridTheme.G_DIM])
	_chip("village", [sentence(T("C2_VILLAGE"))], [GridTheme.G_TEXT])

func _draw_town3() -> void:
	var w := size.x
	var semi := GridTheme.font("semi"); var sans := GridTheme.font("sans")
	var t1 := sentence(T("C2_TEXTBOOK")); var t2 := T("C2_TEXTBOOK_SUB")
	var bw := maxf(semi.get_string_size(t1, HORIZONTAL_ALIGNMENT_LEFT, -1, GridTheme.fs(14)).x, sans.get_string_size(t2, HORIZONTAL_ALIGNMENT_LEFT, -1, GridTheme.fs(11)).x) + 24.0
	var badge := Rect2(Vector2(M, TOP), Vector2(bw, 52.0))
	draw_style_box(GridTheme.glass_sb(0.78, 4, 0.0), badge)
	_text(semi, 14, badge.position + Vector2(12, 21), t1, GridTheme.G_TEXT)
	_text(sans, 11, badge.position + Vector2(12, 43), t2, GridTheme.G_DIM)
	var sk := Rect2(Vector2(w * 0.10, badge.end.y + 10.0), Vector2(w * 0.80, 92.0))
	_draw_sankey(sk)
	_top_y = sk.end.y + 10.0
	var tw: Dictionary = q.town; var ratio := int(tw.ratio)
	_chip("gen", [sentence(T("C2_GEN_KV") % _f(float(tw.vGenV) / 1000.0, 0))], [GridTheme.G_TEXT])
	if ratio > 1:
		_chip("up", ["%d:1" % ratio], [GridTheme.SODIUM])
		_chip("down", ["1:%d" % ratio], [GridTheme.SODIUM])
	var heat := Bench3D.line_heat(float(q.lossPct))
	_chip("line", [sentence(T("C2_LINE_KV") % _f(float(q.vLineV) / 1000.0, 0)) + " · " + T("C2_LINE_AMPS") % _f(float(q.iA), 0), T("C2_LINE_KM") % _f(float(q.kmOneWay), 0)], [GridTheme.G_TEXT.lerp(Bench3D.heat_colour(heat).lightened(0.3), heat), GridTheme.G_DIM])
	_chip("town", [T("C2_TOWN_V") % _f(clampf(float(q.vTownPu), 0.0, 1.0) * 100.0, 0)], [_good(bool(q.ok))])

## A glass chip hung over a 3D place (Bench3D.anchors), with a leader line down to it; off screen or behind the camera it is not drawn.
func _chip(key: String, lines: Array, cols: Array) -> void:
	var wv = app.get("grid_world")
	var l3 = wv.look3d
	var a = l3.anchors.get(key)
	if a == null: return
	var wp: Vector2 = l3.project(a)
	if wp.x < -9000.0: return
	var sp: Vector2 = get_global_transform_with_canvas().affine_inverse() * ((wv as Control).get_global_transform_with_canvas() * wp)
	if not Rect2(Vector2.ZERO, size).grow(-4.0).has_point(sp): return
	var semi := GridTheme.font("semi"); var fz := GridTheme.fs(13)
	var cw := 0.0
	for ln in lines: cw = maxf(cw, semi.get_string_size(str(ln), HORIZONTAL_ALIGNMENT_LEFT, -1, fz).x)
	var lh := float(fz) + 6.0
	var r := Rect2(Vector2(sp.x - (cw + 24.0) * 0.5, sp.y - 34.0 - (lh * lines.size() + 12.0)), Vector2(cw + 24.0, lh * lines.size() + 12.0))
	r.position.x = clampf(r.position.x, M, size.x - M - r.size.x)
	r.position.y = clampf(r.position.y, _top_y, panel.position.y - 8.0 - r.size.y)
	for c in _chips:   # step clear of the chips already drawn
		if (c as Rect2).grow(4.0).intersects(r): r.position.y = (c as Rect2).end.y + 8.0
	if r.end.y > panel.position.y - 8.0: return
	_chips.append(r)
	var foot := Vector2(clampf(sp.x, r.position.x + 8.0, r.end.x - 8.0), r.end.y)
	if sp.y > r.end.y + 4.0:
		draw_line(foot, sp, Color(GridTheme.G_TICK, 0.7), 1.0, true)
		draw_circle(sp, 3.0, GridTheme.G_TICK)
	draw_style_box(GridTheme.glass_sb(0.78, 4, 0.0), r)
	for i in lines.size():
		_text(semi, 13, Vector2(r.position.x + 12.0, r.position.y + 6.0 + lh * (i + 1) - 6.0), str(lines[i]), cols[mini(i, cols.size() - 1)])
