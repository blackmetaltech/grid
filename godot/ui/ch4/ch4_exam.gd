class_name Ch4Exam
extends Ch4Base
## L13 Exam Bridge: Generator Phasors. Left, the rated case drawn from V and I (the closing side E and the angle stay hidden until the exam is marked). Middle, the night
## operation as the excitation slider moves it: E at its angle, the current it makes, Q. Right, the Q gauge against the -0.2 pu target and the 60 degree limit.
## The panel takes the three predictions (E, delta, P_max) and the excitation. Display and input only; the engine marks the exam.
const IDS := ["E", "delta", "pmax"]
const UNITS := {"E": "pu", "delta": "deg", "pmax": "pu"}
var edits := {}
var _lvl_seen := false

func _init() -> void:
	scenario = "l13"; name = "Ch4Exam"
	for k in IDS:
		var e := LineEdit.new(); e.placeholder_text = "?"; e.custom_minimum_size = Vector2(70, 30); e.alignment = HORIZONTAL_ALIGNMENT_RIGHT; e.visible = false
		e.text_submitted.connect(func(_s): _submit(k)); e.focus_exited.connect(func(): _submit(k)); add_child(e); edits[k] = e

func _submit(k: String) -> void:
	var e: LineEdit = edits[k]; var txt := e.text.strip_edges().replace(",", ".")
	if txt == "" or not txt.is_valid_float() or _locked(): return
	var cur = q.get("predictions", {}).get(k)
	if cur != null and is_equal_approx(float(cur), float(txt)): return
	_act("predict", [str(q.ids[k]), float(txt), UNITS[k]])

func refresh(st: Dictionary, k: Dictionary) -> void:
	super.refresh(st, k)
	for key in IDS:
		var e: LineEdit = edits[key]; e.visible = true; e.editable = not _locked()
		var cur = st.get("predictions", {}).get(key)
		if not e.has_focus() and cur != null: e.text = WorkOrder.num(float(cur))

func _layout_panel() -> void:
	var inner := Rect2(panel.position + Vector2(12.0, 8.0), panel.size - Vector2(24.0, 16.0))
	for k in IDS.size():
		var e: LineEdit = edits[IDS[k]]; e.position = inner.position + Vector2(84.0 + 170.0 * k, 24.0); e.size = Vector2(88, 30)
	hits.append({"rect": Rect2(Vector2(inner.position.x, inner.position.y + 66.0), Vector2(330, 70)), "kind": "slider", "id": "exc", "arg": ""})

func _pe() -> String:
	var p: Dictionary = q.predictions
	return "—" if not bool(q.running) or p.E == null or p.delta == null or p.pmax == null else _f(float(q.predErrPct), 1)

func _exc() -> float: return float(q.night.excitation) if q.night.excitation != null else 1.0

func _set_exc(v: float) -> void: _act("setExcitation", [snappedf(clampf(v, 0.5, 2.0), 0.001)])

func _press(h: Dictionary, p: Vector2) -> void:
	var pt := stepper_parts(h.rect)
	if (pt.minus as Rect2).grow(6.0).has_point(p): _set_exc(_exc() - (0.01 if bool(h.get("right", false)) else 0.001))
	elif (pt.plus as Rect2).grow(6.0).has_point(p): _set_exc(_exc() + (0.01 if bool(h.get("right", false)) else 0.001))
	else: _drag(h, p)

func _drag(h: Dictionary, p: Vector2) -> void:
	var tr: Rect2 = stepper_parts(h.rect).track
	_set_exc(lerpf(0.5, 2.0, clampf((p.x - tr.position.x) / tr.size.x, 0.0, 1.0)))

# ---- stage ------------------------------------------------------------------------------------------------------------------------
func _draw_stage() -> void:
	var w := size.x; var top := 150.0; var bh := maxf(panel.position.y - top - 14.0, 200.0)
	_draw_rated(Rect2(Vector2(30.0, top), Vector2(380.0, bh)))
	_draw_night(Rect2(Vector2(426.0, top), Vector2(380.0, bh)))
	_draw_gauges(Rect2(Vector2(822.0, top), Vector2(maxf(w - 822.0 - 30.0, 300.0), bh)))

func _draw_rated(r: Rect2) -> void:
	draw_style_box(GridTheme.ink_sb(0.82, 10, 0.0), r)
	_text(_semi(), 11, r.position + Vector2(12.0, 17.0), T("C4_RATED_CASE"), Color(GridTheme.TEXT, 0.7))
	var s := 112.0; var o := r.position + Vector2(48.0, r.size.y * 0.55)
	var V := Vector2(s, 0.0); var a := deg_to_rad(36.87); var I := Vector2(cos(a), sin(a)) * s * 0.9   # screen y down: I lags V, so it points below the axis
	_arrow(o, o + V, Color.WHITE, 3.0); _text(_mono(), 12, o + V * 0.5 + Vector2(-20, 18), "V = 1", Color.WHITE)
	_arrow(o, o + I, Color(GridTheme.SODIUM), 3.0); _text(_mono(), 12, o + I * 0.5 + Vector2(16, 24), "I = 1, pf 0.8 lag", GridTheme.SODIUM)
	var ans = q.get("answers")
	if ans is Dictionary:
		var jx := Vector2(cos(-deg_to_rad(53.13)), sin(-deg_to_rad(53.13))) * s * 1.2
		_arrow(o + V, o + V + jx, Color("#FF9A3E"), 3.0); _text(_mono(), 12, o + V + jx * 0.5 + Vector2(14, 8), "jX_s I", Color("#FF9A3E"))
		var E := V + jx; _arrow(o, o + E, Color(GridTheme.GOOD), 4.0); _text(_mono(), 13, o + E * 0.5 + Vector2(-60, -8), "E = %s" % _f(float(ans.E), 3), GridTheme.GOOD)
		draw_arc(o, 40.0, -deg_to_rad(float(ans.delta)), 0.0, 16, GridTheme.GOOD, 2.0); _text(_mono(), 12, o + Vector2(46, -10), "δ = %s°" % _f(float(ans.delta), 2), GridTheme.GOOD)
		_text(_mono(), 12, r.position + Vector2(12.0, r.size.y - 14.0), "P_max = %s pu" % _f(float(ans.pmax), 3), GridTheme.GOOD)
	else:
		var jx2 := Vector2(cos(-deg_to_rad(53.13)), sin(-deg_to_rad(53.13))) * s * 1.2
		_arrow(o + V, o + V + jx2, Color("#FF9A3E", 0.8), 3.0); _text(_mono(), 12, o + V + jx2 * 0.5 + Vector2(14, 8), "jX_s I", Color("#FF9A3E"))
		draw_arc(o + V, 22.0, -deg_to_rad(53.13), deg_to_rad(36.87) if false else 0.0, 12, Color("#FF9A3E", 0.6), 1.5)
		_text(_mono(), 11, o + V + Vector2(-110.0, -34.0), T("C4_J_HINT"), Color("#FF9A3E", 0.85))
		_text(_semi(), 14, o + Vector2(0.0, -r.size.y * 0.32), T("C4_E_HIDDEN"), Color(GridTheme.TEXT, 0.7))
		_text(_mono(), 11, r.position + Vector2(12.0, r.size.y - 52.0), T("C4_GLOSS_PU"), Color(GridTheme.TEXT, 0.6)); _text(_mono(), 11, r.position + Vector2(12.0, r.size.y - 34.0), T("C4_GLOSS_XS"), Color(GridTheme.TEXT, 0.6))
		_text(_mono(), 12, r.position + Vector2(12.0, r.size.y - 14.0), T("C4_RATED_NOTE"), Color(GridTheme.TEXT, 0.7))

func _draw_night(r: Rect2) -> void:
	draw_style_box(GridTheme.ink_sb(0.82, 10, 0.0), r)
	_text(_semi(), 11, r.position + Vector2(12.0, 17.0), T("C4_NIGHT") % WorkOrder.num(float(q.night.p)), Color(GridTheme.TEXT, 0.7))
	var s := 150.0; var o := r.position + Vector2(48.0, r.size.y * 0.55); var n: Dictionary = q.night
	var V := Vector2(s, 0.0); _arrow(o, o + V, Color.WHITE, 3.0); _text(_mono(), 12, o + V + Vector2(6, 4), "V", Color.WHITE)
	if n.excitation == null or n.deltaDeg == null:
		var ghost := Vector2(cos(-deg_to_rad(40.0)), sin(-deg_to_rad(40.0))) * 1.05 * s
		for k in 10: draw_line(o + ghost * (float(k) / 10.0), o + ghost * ((float(k) + 0.5) / 10.0), Color(GridTheme.SODIUM, 0.45), 2.0)
		_text(_mono(), 12, o + ghost + Vector2(4, -6), "E ?", Color(GridTheme.SODIUM, 0.6))
		_text(_semi(), 14, o + ghost + Vector2(-60, -34), T("C4_SET_EXC") if n.excitation == null else T("C4_NO_STEADY"), Color(GridTheme.TEXT, 0.7))
		_text(_mono(), 11, r.position + Vector2(12.0, r.size.y - 30.0), T("C4_NIGHT_HINT1"), Color(GridTheme.TEXT, 0.6)); _text(_mono(), 11, r.position + Vector2(12.0, r.size.y - 12.0), T("C4_QRULE"), Color(GridTheme.TEXT, 0.6)); return
	var e := float(n.excitation); var d := deg_to_rad(float(n.deltaDeg))
	var E := Vector2(cos(-d), sin(-d)) * e * s; _arrow(o, o + E, Color(GridTheme.GOOD) if bool(n.taskDone) else Color(GridTheme.SODIUM), 4.0); _text(_mono(), 12, o + E + Vector2(4, -6), "E = %s" % _f(e, 3), GridTheme.SODIUM)
	draw_arc(o, 44.0, -d, 0.0, 16, GridTheme.SODIUM, 2.0); _text(_mono(), 12, o + Vector2(50, -12), "δ = %s°" % _f(float(n.deltaDeg), 1), GridTheme.SODIUM)
	# I = (E - V) / (j X_s) = -j (E - V) / X_s, drawn at the same scale (pu of current)
	var ec := Vector2(e * cos(d) - 1.0, e * sin(d)); var xs := float(q.xs); var Ic := Vector2(ec.y / xs, -ec.x / xs)
	var iv := Vector2(Ic.x, -Ic.y) * s * 0.9; _arrow(o, o + iv, Color("#7CC4FF"), 3.0); _text(_mono(), 12, o + iv + Vector2(4, 14), "I", Color("#7CC4FF"))
	_text(_mono(), 12, r.position + Vector2(12.0, r.size.y - 30.0), T("C4_P_Q") % [WorkOrder.num(float(n.p)), _f(float(n.q), 3)], _good(bool(n.taskDone)))
	_text(_mono(), 11, r.position + Vector2(12.0, r.size.y - 12.0), T("C4_QRULE"), Color(GridTheme.TEXT, 0.6))

func _draw_gauges(r: Rect2) -> void:
	draw_style_box(GridTheme.ink_sb(0.82, 10, 0.0), r)
	var n: Dictionary = q.night; var x := r.position.x + 20.0; var wd := r.size.x - 40.0
	_text(_semi(), 11, r.position + Vector2(12.0, 17.0), T("C4_QGAUGE"), Color(GridTheme.TEXT, 0.7))
	var qlo := -0.6; var qhi := 0.4
	var X := func(v: float) -> float: return x + wd * (clampf(v, qlo, qhi) - qlo) / (qhi - qlo)
	var gy := r.position.y + 70.0; draw_rect(Rect2(Vector2(x, gy), Vector2(wd, 22.0)), Color("#0B1026"))
	var tol := float(n.qTolPu); var tg := float(n.qTarget)
	draw_rect(Rect2(Vector2(X.call(tg - tol), gy), Vector2(X.call(tg + tol) - X.call(tg - tol), 22.0)), Color(GridTheme.GOOD, 0.45))
	draw_line(Vector2(X.call(0.0), gy - 4.0), Vector2(X.call(0.0), gy + 26.0), Color(1, 1, 1, 0.4), 1.0)
	for k in [-0.6, -0.4, -0.2, 0.0, 0.2, 0.4]: _text(_mono(), 10, Vector2(X.call(k) - 16.0, gy + 40.0), _f(k, 1), Color(GridTheme.TEXT, 0.55), 32.0, 1)
	_text(_mono(), 10, Vector2(x, gy - 8.0), T("C4_ABSORBS"), Color(GridTheme.TEXT, 0.6)); _text(_mono(), 10, Vector2(x, gy - 8.0), T("C4_SUPPLIES"), Color(GridTheme.TEXT, 0.6), wd, 2)
	if n.q != null:
		var xx: float = X.call(float(n.q)); draw_colored_polygon(PackedVector2Array([Vector2(xx, gy + 22.0), Vector2(xx - 8, gy + 36.0), Vector2(xx + 8, gy + 36.0)]), _good(bool(n.taskDone)))
		_text(_mono(), 14, Vector2(x, gy + 68.0), "Q = %s pu" % _f(float(n.q), 3), _good(bool(n.taskDone)))
		var dy := gy + 110.0; var dm := 90.0
		draw_rect(Rect2(Vector2(x, dy), Vector2(wd, 16.0)), Color("#0B1026"))
		draw_rect(Rect2(Vector2(x, dy), Vector2(wd * float(n.deltaDeg) / dm, 16.0)), _good(float(n.deltaDeg) < float(n.deltaMaxDeg)))
		draw_line(Vector2(x + wd * float(n.deltaMaxDeg) / dm, dy - 4.0), Vector2(x + wd * float(n.deltaMaxDeg) / dm, dy + 20.0), Color.WHITE, 2.0)
		_text(_mono(), 12, Vector2(x, dy + 38.0), T("C4_DELTA_LIM") % [_f(float(n.deltaDeg), 1), int(n.deltaMaxDeg)], _good(float(n.deltaDeg) < float(n.deltaMaxDeg)))
	if n.q == null:
		_text(_mono(), 12, Vector2(x, gy + 74.0), T("C4_GAUGE_HINT1"), Color(GridTheme.TEXT, 0.65)); _text(_mono(), 12, Vector2(x, gy + 94.0), T("C4_GAUGE_HINT2"), Color(GridTheme.TEXT, 0.65))
	if bool(q.done):
		var ans = q.get("answers"); var y := r.position.y + r.size.y - 54.0
		if ans is Dictionary: _text(_mono(), 12, Vector2(x, y), T("C4_ANS_E") % _f(float(n.answerE), 3), Color(GridTheme.SODIUM))
		_text(_mono(), 12, Vector2(x, y + 18.0), T("C4_PRED_ERR") % _pe(), _good(float(q.predErrPct) <= 5.0))

func _draw_panel_body() -> void:
	var inner := Rect2(panel.position + Vector2(12.0, 8.0), panel.size - Vector2(24.0, 16.0)); var mono := _mono()
	_text(_semi(), 11, inner.position + Vector2(0, 14.0), T("C4_PRED_CAP"), Color(GridTheme.TEXT, 0.7))
	var lab := ["E (pu)", "δ (deg)", "P_max (pu)"]
	for k in IDS.size():
		var e: LineEdit = edits[IDS[k]]; e.editable = not _locked()
		_text(mono, 11, Vector2(e.position.x - 80.0, e.position.y + 19.0), lab[k], Color(GridTheme.TEXT, 0.7))
	for h in hits:
		if str(h.id) == "exc":
			var v := _exc(); _stepper(h.rect, T("C4_EXC_CAP"), "E = %s pu" % _f(v, 3) if q.night.excitation != null else T("C4_UNSET"), (v - 0.5) / 1.5, "exc")
	var checks := [[T("C4_CHK_PRED") % _pe(), float(q.predErrPct) <= 5.0 and int(q.predictions.size()) == 3 and q.predictions.E != null and q.predictions.delta != null and q.predictions.pmax != null], [T("C4_CHK_TASK"), bool(q.night.taskDone)]]
	var x := inner.position.x
	for c in checks: _text(mono, 11, Vector2(x, inner.position.y + 168.0), ("✓ " if c[1] else "· ") + str(c[0]), _good(bool(c[1])) if bool(c[1]) else Color(GridTheme.TEXT, 0.6)); x += 210.0
