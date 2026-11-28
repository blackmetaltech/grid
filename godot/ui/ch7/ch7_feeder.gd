class_name Ch7Feeder
extends Ch7Base
## L24 Coordination: the time-current drawer (log-log). Each relay's IDMT curve, a vertical line at each scripted fault's current, a dot where the curve of every relay
## in the fault's path crosses it (the relay nearest the fault must be the lowest dot, the next one 0.3 s above), and the conductors' I2t limits dashed.
## The panel: a time-multiplier stepper per relay, the curve and the pickup. Cute mode: each relay is a little face, happy when it waits its turn.
const COLS := [Color("#39E1FF"), Color("#FFC56B"), Color("#5BD69A"), Color("#FF4FD8")]

func _init() -> void:
	super._init(); scenario = "L24"; name = "Ch7Feeder"

func _layout_panel() -> void:
	var inner := Rect2(panel.position + Vector2(12.0, 8.0), panel.size - Vector2(24.0, 16.0))
	for k in 4: hits.append({"rect": Rect2(Vector2(inner.position.x + 160.0 * k, inner.position.y + 14.0), Vector2(150, 70)), "kind": "slider", "id": "tms", "arg": k})
	_chip_row(inner.position.x, inner.position.y + 108.0, 46.0, 34.0, 5.0, ["SI", "VI", "EI"], "curve", ["SI", "VI", "EI"], q.design.relays[0].curve)
	_chip_row(inner.position.x + 250.0, inner.position.y + 108.0, 52.0, 34.0, 5.0, ["75", "100", "150"], "pickup", [75.0, 100.0, 150.0], q.design.relays[0].pct)

func _tms(k: int) -> float: return float(q.design.relays[k].tms)
func _set_tms(k: int, v: float) -> void: _act("setRelayTms", ["R%d" % (k + 1), snappedf(clampf(v, 0.025, 1.2), 0.025)])

func _press(h: Dictionary, p: Vector2) -> void:
	if str(h.id) == "fold": folded = not folded; layout(); queue_redraw(); return
	match str(h.id):
		"curve": _act("setRelayCurve", ["all", str(h.arg)])
		"pickup": _act("setRelayPickup", ["all", float(h.arg)])
		"tms":
			var k := int(h.arg); var pt := stepper_parts(h.rect)
			if (pt.minus as Rect2).grow(6.0).has_point(p): _set_tms(k, _tms(k) - (0.025 if bool(h.get("right", false)) else 0.05))
			elif (pt.plus as Rect2).grow(6.0).has_point(p): _set_tms(k, _tms(k) + (0.025 if bool(h.get("right", false)) else 0.05))
			elif on_track(h.rect, p): _drag(h, p)

func _drag(h: Dictionary, p: Vector2) -> void:
	var tr: Rect2 = stepper_parts(h.rect).track
	_set_tms(int(h.arg), lerpf(0.025, 1.2, clampf((p.x - tr.position.x) / tr.size.x, 0.0, 1.0)))

func _draw_panel_body() -> void:
	var inner := Rect2(panel.position + Vector2(12.0, 8.0), panel.size - Vector2(24.0, 16.0))
	_text(_semi(), 10, inner.position + Vector2(0, 10), T("C7_RELAY_CAP"), Color(GridTheme.TEXT, 0.65))
	for k in 4:
		var r := Rect2(Vector2(inner.position.x + 160.0 * k, inner.position.y + 14.0), Vector2(150, 70))
		_stepper(r, T("C7_RELAY") % (k + 1) + "  " + T("C7_IS") % str(q.is[k]), WorkOrder.num(_tms(k)), (_tms(k) - 0.025) / 1.175, "tms%d" % k)
		draw_rect(Rect2(r.position + Vector2(r.size.x - 14, 6), Vector2(8, 8)), COLS[k])
	_text(_semi(), 10, inner.position + Vector2(0, 102), T("C7_CURVE_CAP"), Color(GridTheme.TEXT, 0.65)); _text(_semi(), 10, inner.position + Vector2(250, 102), T("C7_PICKUP_CAP"), Color(GridTheme.TEXT, 0.65))

func _draw_stage() -> void:
	var l3 := _look3()
	var w := _right() if l3 else size.x; var top := _stage_top(); var bh := _stage_h(220.0)
	if l3: bh = clampf(_stage_bottom() - top - 12.0, 220.0, 330.0)
	var r := Rect2(Vector2(30.0, top), Vector2(maxf(w - 60.0 - 250.0, 420.0) if not l3 else minf(w * 0.5, 700.0), bh))
	_frame(r, 80.0, 8000.0, 0.01, 30.0, true, true, T("C7_TC_X"), T("C7_TC_Y"))
	for L in q.limits:
		_poly(L.pts, Color(GridTheme.BAD, 0.35), 1.0)
	for k in q.curves.size():
		_poly(q.curves[k].pts, COLS[k], 2.5)
		var ip := _pt(float(q.curves[k].is), 30.0); draw_line(ip, ip + Vector2(0, 14), COLS[k], 2.0)
	var lg := Rect2(Vector2(r.end.x + 12.0, top if not l3 else 156.0), Vector2(maxf(w - r.end.x - 42.0, 200.0) if not l3 else 290.0, bh)); draw_style_box(_box_sb(0.9), lg)
	var lx: float = lg.position.x + 12.0; var ly: float = lg.position.y + 38.0
	_text(_semi(), 10, Vector2(lx, ly - 14.0), T("C7_LEG_CURVES"), Color(GridTheme.TEXT, 0.7))
	for k in 4:
		draw_rect(Rect2(Vector2(lx, ly + 18.0 * k - 8.0), Vector2(14, 6)), COLS[k]); _text(_mono(), 10, Vector2(lx + 20.0, ly + 18.0 * k), "R%d  I_s %s A" % [k + 1, str(q.is[k])], GridTheme.TEXT)
	var by2: float = ly + 18.0 * 4 + 6.0
	draw_line(Vector2(lx, by2 - 4.0), Vector2(lx + 14.0, by2 - 4.0), Color(GridTheme.BAD, 0.7), 1.5); GridText.dm(self, _mono(), Vector2(lx + 20.0, by2), T("C7_LIMIT_ALL"), HORIZONTAL_ALIGNMENT_LEFT, lg.size.x - 36.0, GridTheme.fs(10), -1, Color(GridTheme.BAD, 0.85))
	var tot = q.get("totalS")
	if tot != null:
		var okc := _good(bool(q.get("ok", false)))
		_text(_mono(), 12, Vector2(lx, by2 + 56.0), T("C7_LEG_TOTALS") % WorkOrder.num(snappedf(float(tot), 0.001)), okc)
		GridText.dm(self, _mono(), Vector2(lx, by2 + 76.0), T("C7_LEG_SPARE") % WorkOrder.num(snappedf(float(q.get("minMarginS", 0.0)), 0.001)), HORIZONTAL_ALIGNMENT_LEFT, lg.size.x - 24.0, GridTheme.fs(12), -1, okc)
	var lx2: float = float((plot.r as Rect2).position.x) + 12.0
	var gy: float = float((plot.r as Rect2).end.y) - 96.0; var gw: float = float((plot.r as Rect2).size.x) - 24.0
	for g in (["C7_G24_PICK", "C7_G24_TMS", "C7_G24_CT", "C7_G24_CURVE"] if not _phone() and not l3 else []):
		var gh := _mono().get_multiline_string_size(T(g), HORIZONTAL_ALIGNMENT_LEFT, gw, GridTheme.fs(10)).y
		GridText.dm(self, _mono(), Vector2(lx2, gy + 10.0), T(g), HORIZONTAL_ALIGNMENT_LEFT, gw, GridTheme.fs(10), -1, Color(GridTheme.TEXT, 0.7)); gy += gh + 3.0
	var fi := -1
	for f in q.faults:
		fi += 1
		var x := _pt(float(f.amps), 0.01).x; var pr: Rect2 = plot.r
		draw_line(Vector2(x, pr.position.y), Vector2(x, pr.end.y), Color(GridTheme.TEXT, 0.35), 1.0)
		_text(_mono(), 10, Vector2(x - 12.0, pr.position.y + 11.0 + (18.0 * float(fi % 2) if l3 else 0.0)), str(f.id), GridTheme.TEXT, 24.0, 1)   # 3D: neighbouring fault labels alternate rows (F5 over F4)
		for j in f.times.size():
			if f.times[j] == null: continue
			var dp := _pt(float(f.amps), float(f.times[j])); draw_circle(dp, 5.0 if j == f.times.size() - 1 else 3.5, COLS[j])
		if bool(f.burnt): draw_circle(_pt(float(f.amps), float(f.nearestS)), 9.0, Color(GridTheme.BAD, 0.5))
	if l3: _top_y = top + bh + 8.0; _pins3()

## The 3D valley: a chip on each relay kiosk in its chart colour, and on the fault being shown (with the relay that opens).
func _pins3() -> void:
	for k in 4: _pin("R%d" % (k + 1), [T("C7_RELAY") % (k + 1) + "  " + T("C7_IS") % str(q.is[k])], [COLS[k]], 16.0)
	if _revealed() and not q.faults.is_empty():
		var l3 = app.get("grid_world").look3d
		var d: Dictionary = l3.d7; var order: Array = d.get("order", [])
		if not order.is_empty():
			var cur: Dictionary = order[int(d.get("cur", 0)) % order.size()]
			var fl: Array = ["%s  %d A" % [str(cur.id), int(cur.amps)]]; var fc: Array = [GridTheme.G_TEXT]
			if int(cur.opener) >= 0: fl.append(T("C7_RELAY") % (int(cur.opener) + 1) + " " + T("C7_OPEN")); fc.append(COLS[int(cur.opener)])
			_pin("fault", fl, fc, 18.0)
