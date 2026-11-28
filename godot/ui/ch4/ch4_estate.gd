class_name Ch4Estate
extends Ch4Base
## L11 Star or Delta: the Tanner estate. The motors (500 kW at pf 0.70), the capacitor bank drawn as star or delta with the voltage across one can against its rating,
## the power triangle (P, the motors' Q, the bank's Q and what is left), the pump and its starter, and the bus voltage through the pump's start against the 10 % limit.
## The panel buys cans by the microfarad. Cute mode: the motors and the cans have faces, happy when the numbers are in band; a can that bursts shows it.
var sel_unit := 100.0
var sel_conn := "Y"
var sel_rated := 250.0
const STARTERS := ["dol", "yd", "soft"]

func _init() -> void:
	scenario = "l11"; name = "Ch4Estate"

func refresh(st: Dictionary, k: Dictionary) -> void:
	if st.get("bank") is Dictionary:
		var b: Dictionary = st.bank; sel_unit = float(b.unitUF); sel_conn = str(b.conn); sel_rated = float(b.ratedV)
	super.refresh(st, k)

func _count() -> int: return int(q.bank.count) if q.get("bank") is Dictionary else 0

func _send_bank(count: int) -> void:
	_act("setBank", [sel_unit, clampi(count, 0, 140), sel_conn, sel_rated])

func _layout_panel() -> void:
	var inner := Rect2(panel.position + Vector2(12.0, 8.0), panel.size - Vector2(24.0, 16.0)); var x := inner.position.x
	for k in 3: _add_chip(Rect2(Vector2(x + 66.0 * k, inner.position.y + 20.0), Vector2(60, 40)), "unit", [25.0, 50.0, 100.0][k])
	x += 66.0 * 3 + 8.0
	for k in 2: _add_chip(Rect2(Vector2(x + 78.0 * k, inner.position.y + 20.0), Vector2(72, 40)), "rated", [250.0, 440.0][k])
	x += 78.0 * 2 + 8.0
	for k in 2: _add_chip(Rect2(Vector2(x + 62.0 * k, inner.position.y + 20.0), Vector2(56, 40)), "conn", ["Y", "D"][k])
	var sr := Rect2(Vector2(inner.position.x, inner.position.y + 66.0), Vector2(190, 58))
	hits.append({"rect": sr, "kind": "slider", "id": "count", "arg": ""})
	for k in 3: _add_chip(Rect2(Vector2(inner.position.x + 202.0 + 88.0 * k, inner.position.y + 66.0), Vector2(82, 58)), "starter", STARTERS[k])

func _press(h: Dictionary, p: Vector2) -> void:
	var id := str(h.id)
	if id == "unit": sel_unit = float(h.arg); _send_bank(_count() if _count() > 0 else 0)
	elif id == "rated": sel_rated = float(h.arg); _send_bank(_count())
	elif id == "conn": sel_conn = str(h.arg); _send_bank(_count())
	elif id == "starter": _act("setStarter", [str(h.arg)])
	elif id == "count":
		var pt := stepper_parts(h.rect)
		if (pt.minus as Rect2).grow(6.0).has_point(p): _send_bank(_count() - (1 if bool(h.get("right", false)) else 5))
		elif (pt.plus as Rect2).grow(6.0).has_point(p): _send_bank(_count() + (1 if bool(h.get("right", false)) else 5))
		elif on_track(h.rect, p): _drag(h, p)   # only the track itself jumps (a click on the caption or the value sent 0 -> 140)

func _drag(h: Dictionary, p: Vector2) -> void:
	var tr: Rect2 = stepper_parts(h.rect).track
	var n := int(roundf(clampf((p.x - tr.position.x) / tr.size.x, 0.0, 1.0) * 140.0))
	if n != _count(): _send_bank(n)

# ---- stage ------------------------------------------------------------------------------------------------------------------------
func _draw_stage() -> void:
	if _look3(): _draw_stage3(); return
	var w := _vs().x; var h := _vs().y; var ground := h * 0.665
	draw_rect(Rect2(0, ground, w, h - ground), Color("#1E2A2A")); draw_rect(Rect2(0, ground, w, 5), Color("#34474A"))
	_draw_triangle(Vector2(150.0, 205.0))
	_draw_motors(Rect2(Vector2(40.0, ground - 150.0), Vector2(250.0, 150.0)))
	_draw_bank(Vector2(w * 0.40, ground - 190.0), ground)
	_draw_bus_trace(Rect2(Vector2(maxf(w * 0.58, 760.0), 118.0), Vector2(minf(w * 0.40, w - 790.0 - 20.0), 190.0)))
	_draw_pump(Rect2(Vector2(w * 0.72, ground - 150.0), Vector2(w * 0.25, 150.0)), ground)
	# the wiring: motors bus -> bank -> pump
	var by := ground - 28.0
	draw_line(Vector2(290.0, by), Vector2(w * 0.72, by), Color("#C9CED6"), 4.0)
	_text(_mono(), 11, Vector2(300.0, by - 8.0), T("C4_ESTATE_BUS"), Color(GridTheme.TEXT, 0.6))

## The 3D estate: the motor hall, the bank and the pump house are Stage3D's; here the two charts (glass) and a chip on each place.
func _draw_stage3() -> void:
	var w := _vs().x
	_draw_triangle(Vector2(150.0, 205.0))
	var bw := minf(w * 0.40, w - 790.0 - 20.0)
	if w >= 1250.0: _draw_bus_trace(Rect2(Vector2(maxf(w * 0.58, 760.0), 118.0), Vector2(bw, 190.0)))
	else: _draw_bus_trace(Rect2(Vector2(w - 360.0 - 14.0, 118.0), Vector2(360.0, 190.0)))
	var dim := GridTheme.G_DIM
	_pin("motors", [T("C4_MOTORS") % [int(q.estateKw), _f(float(q.estatePf), 2)], T("C4_BUSV") % _f(float(q.vBusPu) * 100.0, 1)], [GridTheme.G_TEXT, _good(float(q.vBusPu) >= 0.94)], 20.0)
	var b = q.get("bank")
	if b is Dictionary:
		var burst := bool(b.burst)
		var lines: Array = [T("C4_BANK_Y") if str(b.conn) == "Y" else T("C4_BANK_D"), T("C4_BANK_TXT") % [int(b.count), int(b.unitUF), int(b.cPhaseUF)], T("C4_CANV") % [int(b.canV), int(b.ratedV)]]
		var cols: Array = [GridTheme.G_TEXT, GridTheme.G_TEXT, _good(not burst)]
		if burst: lines.push_front(T("C4_BURST")); cols.push_front(GridTheme.BAD)
		_pin("bank", lines, cols, 30.0)
	else: _pin("bank", [T("C4_NOBANK")], [dim], 30.0)
	_pin("pump", [T("C4_PUMP") % [int(q.pumpKw), T("C4_ST_" + str(q.starter).to_upper())], T("C4_IST") % [int(q.iStartA), _f(float(q.iStartA) / float(q.iFullA), 1)]], [GridTheme.G_TEXT, dim], 24.0)

func _draw_triangle(c: Vector2) -> void:
	var P := 500.0; var qm := float(q.motorsKvar); var qb := float(q.bank.qKvar) if q.get("bank") is Dictionary else 0.0; var qn := float(q.qNetKvar)
	var sc := 150.0 / 520.0
	draw_style_box(_box_sb(0.82), Rect2(c + Vector2(-122.0, -98.0), Vector2(290.0, 248.0)))
	_text(_semi(), 11, c + Vector2(-110.0, -80.0), T("C4_TRIANGLE"), Color(GridTheme.TEXT, 0.7))
	var o := c + Vector2(-100.0, 70.0)
	var pv := Vector2(P * sc, 0.0)
	draw_line(o, o + pv, Color("#7CFFB2"), 3.0); _text(_mono(), 11, o + Vector2(P * sc * 0.5 - 20.0, 16.0), "P 500 kW", Color("#7CFFB2"))
	_arrow(o + pv, o + pv + Vector2(0.0, -qm * sc), Color(GridTheme.REACTIVE), 3.0)
	_text(_mono(), 11, o + pv + Vector2(6.0, -qm * sc * 0.5), "Q %s" % _f(qm, 0), Color(GridTheme.REACTIVE))
	if qb > 0.5:
		_arrow(o + pv + Vector2(0.0, -qm * sc), o + pv + Vector2(0.0, -qn * sc), Color(GridTheme.LIVE), 3.0)
		_text(_mono(), 11, o + pv + Vector2(6.0, -(qm - qb * 0.5) * sc), "−%s" % _f(qb, 0), Color(GridTheme.LIVE))
	_arrow(o, o + pv + Vector2(0.0, -qn * sc), _good(bool(q.pass.pf)), 3.0)
	_text(_mono(), 14, c + Vector2(-110.0, 104.0), "pf %s" % _f(float(q.pf), 3), _good(bool(q.pass.pf) and bool(q.pass.lead)))
	_text(_mono(), 11, c + Vector2(-110.0, 118.0), T("C4_NEED") % [_f(float(q.needKvar), 0), WorkOrder.num(float(q.pfMin))], Color(GridTheme.TEXT, 0.75))
	_text(_mono(), 11, c + Vector2(-110.0, 132.0), T("C4_BANKQ") % _f(qb, 0), _good(bool(q.pass.pf)))

func _draw_motors(r: Rect2) -> void:
	draw_rect(r, Color("#3A4256")); draw_rect(r, Color("#6C7A8C"), false, 2.0)
	for k in 5:
		var mc := r.position + Vector2(36.0 + 44.0 * k, 54.0); draw_circle(mc, 17.0, Color("#262E47")); draw_arc(mc, 17.0, 0.0, TAU, 24, Color("#8E99A8"), 2.0)
		var a := _t * 5.0 + k; draw_line(mc, mc + Vector2(cos(a), sin(a)) * 13.0, Color("#B8C0CC"), 2.5)
	_text(_semi(), 12, r.position + Vector2(8.0, 100.0), T("C4_MOTORS") % [int(q.estateKw), _f(float(q.estatePf), 2)], Color(GridTheme.TEXT, 0.9))
	_text(_mono(), 11, r.position + Vector2(8.0, 120.0), T("C4_BUSV") % _f(float(q.vBusPu) * 100.0, 1), _good(float(q.vBusPu) >= 0.94))
	if GridSettings.cute: _face(r.position + Vector2(r.size.x - 26.0, 118.0), 12.0, bool(q.pass.pf), 0.9)

func _draw_bank(c: Vector2, ground: float) -> void:
	var b = q.get("bank"); var conn := str(b.conn) if b is Dictionary else sel_conn
	var by := ground - 28.0
	draw_style_box(GridTheme.ink_sb(0.55, 10, 0.0), Rect2(c + Vector2(-110.0, -134.0), Vector2(320.0, 276.0)))
	draw_line(Vector2(c.x - 120.0, by), Vector2(c.x - 120.0, c.y - 80.0), Color("#C9CED6"), 3.0); draw_line(Vector2(c.x - 120.0, c.y - 80.0), Vector2(c.x - 100.0, c.y - 80.0), Color("#C9CED6"), 3.0)
	_wrap(_semi(), 11, c + Vector2(-100.0, -114.0), T("C4_BANK_Y") if conn == "Y" else T("C4_BANK_D"), Color(GridTheme.TEXT, 0.75), 300.0)
	var burst: bool = b is Dictionary and bool(b.burst)
	var col := Color("#D8483F") if burst else Color("#7AA7FF")
	if conn == "Y":
		for k in 3:
			var x := c.x - 60.0 + 60.0 * k
			draw_line(Vector2(x, c.y - 80.0), Vector2(x, c.y - 70.0), Color("#C9CED6"), 2.0)
			draw_rect(Rect2(Vector2(x - 10.0, c.y - 70.0), Vector2(20.0, 36.0)), col); draw_rect(Rect2(Vector2(x - 10.0, c.y - 70.0), Vector2(20.0, 36.0)), Color.WHITE, false, 1.5)
			draw_line(Vector2(x, c.y - 34.0), Vector2(x, c.y - 14.0), Color("#C9CED6"), 2.0)
		draw_line(Vector2(c.x - 100.0, c.y - 80.0), Vector2(c.x + 60.0, c.y - 80.0), Color("#C9CED6"), 2.0)
		draw_line(Vector2(c.x - 60.0, c.y - 14.0), Vector2(c.x + 60.0, c.y - 14.0), Color("#C9CED6"), 2.0); draw_circle(Vector2(c.x, c.y - 14.0), 4.0, Color("#C9CED6"))
	else:
		var A := Vector2(c.x - 70.0, c.y - 30.0); var B := Vector2(c.x + 70.0, c.y - 30.0); var Cc := Vector2(c.x, c.y - 100.0)
		for p in [A, B, Cc]: draw_circle(p, 4.0, Color("#C9CED6"))
		draw_line(Vector2(c.x - 100.0, c.y - 80.0), Cc, Color("#C9CED6"), 2.0)
		for e in [[A, B], [B, Cc], [Cc, A]]:
			var m: Vector2 = (e[0] + e[1]) * 0.5
			draw_line(e[0], e[1], Color("#C9CED6"), 2.0)
			draw_rect(Rect2(m - Vector2(10.0, 10.0), Vector2(20.0, 20.0)), col); draw_rect(Rect2(m - Vector2(10.0, 10.0), Vector2(20.0, 20.0)), Color.WHITE, false, 1.5)
	if b is Dictionary:
		_text(_mono(), 11, c + Vector2(-100.0, 6.0), T("C4_BANK_TXT") % [int(b.count), int(b.unitUF), int(b.cPhaseUF)], Color(GridTheme.TEXT, 0.85))
		var cv := float(b.canV); var rv := float(b.ratedV)
		var gx := c.x - 100.0; var gy := c.y + 28.0; var gw := 200.0
		draw_rect(Rect2(Vector2(gx, gy), Vector2(gw, 10.0)), _bg(Color("#0B1026")))
		draw_rect(Rect2(Vector2(gx, gy), Vector2(gw * minf(cv / 450.0, 1.0), 10.0)), _good(not burst))
		draw_line(Vector2(gx + gw * rv / 450.0, gy - 4.0), Vector2(gx + gw * rv / 450.0, gy + 14.0), Color.WHITE, 2.0)
		var per := float(b.qKvar) / maxf(3.0 * float(b.count), 1.0) if str(b.conn) == "Y" else float(b.qKvar) / maxf(3.0 * float(b.count), 1.0)
		_text(_mono(), 11, Vector2(gx, gy + 48.0), T("C4_CANS_FORMULA") % [int(b.count), _f(per, 2), _f(float(b.qKvar), 0)], GridTheme.SODIUM)
		_text(_mono(), 11, Vector2(gx, gy + 28.0), T("C4_CANV") % [int(cv), int(rv)], _good(not burst))
		if burst:
			_text(_semi(), 16, Vector2(c.x - 100.0, c.y - 138.0), T("C4_BURST"), GridTheme.BAD, 200.0, 1)
	else: _wrap(_mono(), 11, c + Vector2(-100.0, 6.0), T("C4_NOBANK"), Color(GridTheme.TEXT, 0.6), 300.0)
	_wrap(_mono(), 10, c + Vector2(-100.0, 102.0), T("C4_CANS_GLOSS"), Color(GridTheme.TEXT, 0.6), 300.0)

func _draw_pump(r: Rect2, ground: float) -> void:
	var c := r.position + Vector2(60.0, 76.0)
	draw_circle(c, 30.0, Color("#2B5A7A")); draw_arc(c, 30.0, 0.0, TAU, 32, Color("#9FD8FF"), 3.0)
	var a := _t * (3.0 + 4.0 * float(bool(q.started))); for k in 3: draw_line(c, c + Vector2(cos(a + k * TAU / 3.0), sin(a + k * TAU / 3.0)) * 24.0, Color("#CFEAFF"), 5.0)
	_text(_semi(), 12, r.position + Vector2(0.0, 134.0), T("C4_PUMP") % [int(q.pumpKw), T("C4_ST_" + str(q.starter).to_upper())], Color(GridTheme.TEXT, 0.9))
	var imax := maxf(float(q.iStartA), 1.0); var bx := r.position.x + 150.0; var bh := 120.0
	draw_rect(Rect2(Vector2(bx, r.position.y + 20.0 + bh * (1.0 - float(q.iFullA) / 900.0)), Vector2(26.0, bh * float(q.iFullA) / 900.0)), Color("#7CFFB2"))
	draw_rect(Rect2(Vector2(bx + 34.0, r.position.y + 20.0 + bh * (1.0 - imax / 900.0)), Vector2(26.0, bh * imax / 900.0)), Color("#FFB020"))
	_text(_mono(), 10, Vector2(bx - 8.0, r.position.y + 16.0), "%d" % int(q.iFullA), Color("#7CFFB2"), 42.0, 1); _text(_mono(), 10, Vector2(bx + 26.0, r.position.y + 16.0), "%d A" % int(imax), Color("#FFB020"), 42.0, 1)

func _draw_bus_trace(r: Rect2) -> void:
	draw_style_box(_box_sb(0.82), r)
	_text(_semi(), 11, r.position + Vector2(12.0, 17.0), T("C4_TRACE"), Color(GridTheme.TEXT, 0.7))
	var plot := Rect2(r.position + Vector2(14.0, 36.0), r.size - Vector2(28.0, 100.0))
	var v0 := float(q.vBusPu); var dip := float(q.dipPct) / 100.0; var vmin := 0.80; var vmax := 1.04
	var Y := func(v: float) -> float: return plot.position.y + plot.size.y * (1.0 - (clampf(v, vmin, vmax) - vmin) / (vmax - vmin))
	var lim: float = v0 * (1.0 - float(q.dipMaxPct) / 100.0)
	draw_rect(Rect2(Vector2(plot.position.x, Y.call(vmax)), Vector2(plot.size.x, Y.call(lim) - Y.call(vmax))), Color(GridTheme.GOOD, 0.10))
	draw_line(Vector2(plot.position.x, Y.call(lim)), Vector2(plot.end.x, Y.call(lim)), Color(GridTheme.BAD, 0.8), 1.5)
	_text(_mono(), 10, Vector2(plot.end.x - 130.0, Y.call(lim) - 5.0), T("C4_LIMIT") % WorkOrder.num(float(q.dipMaxPct)), Color(GridTheme.BAD, 0.9))
	var xs := plot.position.x + plot.size.x * 0.35; var ok := bool(q.pass.dip)
	var pts := PackedVector2Array([Vector2(plot.position.x, Y.call(v0)), Vector2(xs, Y.call(v0)), Vector2(xs + 3.0, Y.call(v0 * (1.0 - dip))), Vector2(xs + plot.size.x * 0.40, Y.call(v0 * (1.0 - dip * 0.55))), Vector2(xs + plot.size.x * 0.55, Y.call(v0)), Vector2(plot.end.x, Y.call(v0))])
	draw_polyline(pts, _good(ok), 3.0, true)
	draw_line(Vector2(xs, plot.position.y), Vector2(xs, plot.end.y), Color(1, 1, 1, 0.3), 1.0)
	_text(_mono(), 10, Vector2(xs + 4.0, plot.position.y + 10.0), T("C4_PUMP_STARTS"), Color(GridTheme.TEXT, 0.6))
	_text(_mono(), 13, Vector2(r.position.x + 12.0, r.end.y - 28.0), T("C4_DIP") % _f(float(q.dipPct), 1), _good(ok))
	_text(_mono(), 11, Vector2(r.position.x + 12.0, r.end.y - 10.0), T("C4_IST") % [int(q.iStartA), _f(float(q.iStartA) / float(q.iFullA), 1)], Color(GridTheme.TEXT, 0.75))

func _draw_panel_body() -> void:
	var inner := Rect2(panel.position + Vector2(12.0, 8.0), panel.size - Vector2(24.0, 16.0)); var lock := _locked(); var mono := _mono()
	_text(_semi(), 11, inner.position + Vector2(0, 14.0), T("C4_CAP_CAP"), Color(GridTheme.TEXT, 0.7))
	for h in hits:
		var id := str(h.id); var k := str(h.kind)
		if k == "chip":
			var arg = h.arg
			match id:
				"unit": _chip(h.rect, "%d µF" % int(arg), "", is_equal_approx(sel_unit, float(arg)), id, arg, not lock)
				"rated": _chip(h.rect, "%d V" % int(arg), T("C4_CAN"), is_equal_approx(sel_rated, float(arg)), id, arg, not lock)
				"conn": _chip(h.rect, "Y" if str(arg) == "Y" else "Δ", "", sel_conn == str(arg), id, arg, not lock)
				"starter":
					var pr := ""; for s in kit.get("l11", {}).get("starters", []): if str(s.id) == str(arg): pr = str(s.price)
					_chip(h.rect, T("C4_ST_" + str(arg).to_upper()), pr, str(q.starter) == str(arg), id, arg, not lock)
		elif k == "slider":
			var n := _count(); _stepper(h.rect, T("C4_CANS"), "%d" % n, float(n) / 140.0, "count")
	var y := inner.position.y + 160.0
	var hv := hover.get_slice("/", 1) if hover.begins_with("starter/") else str(q.starter)
	_text(mono, 11, inner.position + Vector2(0, 140.0), T("C4_HINT_" + hv.to_upper()), Color(GridTheme.SODIUM, 0.85))
	var qb := float(q.bank.qKvar) if q.get("bank") is Dictionary else 0.0
	_text(mono, 12, inner.position + Vector2(462.0, 92.0), T("C4_BANK_RD") % [_f(qb, 0), _f(float(q.needKvar), 0)], _good(qb >= float(q.needKvar) and bool(q.pass.lead)))
	var checks := [[T("C4_CHK_PF") % _f(float(q.pf), 3), bool(q.pass.pf) and bool(q.pass.lead)], [T("C4_CHK_CAN"), bool(q.pass.can)], [T("C4_CHK_DIP") % _f(float(q.dipPct), 1), bool(q.pass.dip)]]
	var x := inner.position.x
	for c in checks:
		_text(mono, 11, Vector2(x, y), ("✓ " if c[1] else "✗ ") + str(c[0]), _good(bool(c[1]))); x += 130.0
