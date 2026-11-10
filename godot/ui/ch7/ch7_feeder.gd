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
	match str(h.id):
		"curve": _act("setRelayCurve", ["all", str(h.arg)])
		"pickup": _act("setRelayPickup", ["all", float(h.arg)])
		"tms":
			var k := int(h.arg); var pt := stepper_parts(h.rect)
			if (pt.minus as Rect2).grow(6.0).has_point(p): _set_tms(k, _tms(k) - (0.025 if bool(h.get("right", false)) else 0.05))
			elif (pt.plus as Rect2).grow(6.0).has_point(p): _set_tms(k, _tms(k) + (0.025 if bool(h.get("right", false)) else 0.05))
			else: _drag(h, p)

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
	var tot = q.get("totalS"); var mg := float(q.get("minMarginS", 0.0))
	if tot != null: _text(_mono(), 12, inner.position + Vector2(470, 130), (T("C7_TOTAL") % WorkOrder.num(snappedf(float(tot), 0.001))) + "   " + (T("C7_MARGIN") % [WorkOrder.num(snappedf(mg, 0.001)), "0.3 (+0)"]).replace(" (+0)", ""), _good(bool(q.get("ok", false))))

func _draw_stage() -> void:
	var w := size.x; var top := 150.0; var bh := maxf(panel.position.y - top - 14.0, 220.0)
	var r := Rect2(Vector2(30.0, top), Vector2(maxf(w - 60.0, 420.0), bh))
	_frame(r, 80.0, 8000.0, 0.01, 30.0, true, true, T("C7_TC_X"), T("C7_TC_Y"))
	for L in q.limits:
		_poly(L.pts, Color(GridTheme.BAD, 0.35), 1.0)
	for k in q.curves.size():
		_poly(q.curves[k].pts, COLS[k], 2.5)
		var ip := _pt(float(q.curves[k].is), 30.0); draw_line(ip, ip + Vector2(0, 14), COLS[k], 2.0)
	var lx: float = float((plot.r as Rect2).position.x) + 12.0; var ly: float = float((plot.r as Rect2).position.y) + 40.0
	_text(_semi(), 10, Vector2(lx, ly - 14.0), T("C7_LEG_CURVES"), Color(GridTheme.TEXT, 0.7))
	for k in 4:
		draw_rect(Rect2(Vector2(lx, ly + 16.0 * k - 8.0), Vector2(14, 6)), COLS[k]); _text(_mono(), 10, Vector2(lx + 20.0, ly + 16.0 * k), "R%d  I_s %s A" % [k + 1, str(q.is[k])], GridTheme.TEXT)
	var by2: float = ly + 16.0 * 4
	draw_line(Vector2(lx, by2 - 4.0), Vector2(lx + 14.0, by2 - 4.0), Color(GridTheme.BAD, 0.7), 1.5); _text(_mono(), 10, Vector2(lx + 20.0, by2), T("C7_LIMIT_ALL"), Color(GridTheme.BAD, 0.85))
	for f in q.faults:
		var x := _pt(float(f.amps), 0.01).x; var pr: Rect2 = plot.r
		draw_line(Vector2(x, pr.position.y), Vector2(x, pr.end.y), Color(GridTheme.TEXT, 0.35), 1.0)
		_text(_mono(), 10, Vector2(x - 12.0, pr.position.y + 11.0), str(f.id), GridTheme.TEXT, 24.0, 1)
		for j in f.times.size():
			if f.times[j] == null: continue
			var dp := _pt(float(f.amps), float(f.times[j])); draw_circle(dp, 5.0 if j == f.times.size() - 1 else 3.5, COLS[j])
		if bool(f.burnt): draw_circle(_pt(float(f.amps), float(f.nearestS)), 9.0, Color(GridTheme.BAD, 0.5))
