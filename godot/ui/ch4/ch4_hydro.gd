class_name Ch4Hydro
extends Ch4Base
## L12 Over the Hill: Kestrel Falls to the city. Top: the plant, two (or three) 300 km circuits with their series capacitors, the city; when the circuit trips one
## wire goes dark. Below: the rotor wheel (E' against the bus), the P-delta chart (the sine before and after the trip, the 2.0 pu the plant sends, the swing's peak and
## the unstable angle) and the rotor angle through the swing. Panel: AVR set-point, series capacitors, a third circuit, re-dispatch. Cute mode: the plant has a face that
## is worried while the swing is heading for the unstable point.
const VREFS := [0.9, 0.95, 1.0, 1.05]
const SERIES := [0, 30, 50]
const REDUCE := [0, 20, 40, 60]

func _init() -> void:
	scenario = "l12"; name = "Ch4Hydro"

func _layout_panel() -> void:
	var inner := Rect2(panel.position + Vector2(12.0, 8.0), panel.size - Vector2(24.0, 16.0)); var x := inner.position.x
	for k in 4: _add_chip(Rect2(Vector2(x + 72.0 * k, inner.position.y + 20.0), Vector2(66, 42)), "vref", VREFS[k])
	x += 72.0 * 4 + 10.0
	for k in 3: _add_chip(Rect2(Vector2(x + 82.0 * k, inner.position.y + 20.0), Vector2(76, 42)), "series", SERIES[k])
	_add_chip(Rect2(Vector2(inner.position.x, inner.position.y + 72.0), Vector2(140, 50)), "third", 1)
	for k in 4: _add_chip(Rect2(Vector2(inner.position.x + 150.0 + 82.0 * k, inner.position.y + 72.0), Vector2(76, 50)), "redispatch", REDUCE[k])

func _press(h: Dictionary, _p: Vector2) -> void:
	match str(h.id):
		"vref": _act("setAvrRef", [float(h.arg)])
		"series": _act("setSeriesComp", [float(h.arg)])
		"third": _act("addCircuit", [not bool(q.build.third)])
		"redispatch": _act("setRedispatch", [float(h.arg)])

# ---- stage ------------------------------------------------------------------------------------------------------------------------
func _draw_stage() -> void:
	var w := size.x
	draw_rect(Rect2(0, 300.0, w, 4), Color(1, 1, 1, 0.04))
	_draw_line_scene(Rect2(Vector2(56.0, 150.0), Vector2(w - 90.0, 140.0)))
	var top := 318.0; var bh := maxf(panel.position.y - top - 14.0, 200.0)
	_draw_rotor(Rect2(Vector2(30.0, top), Vector2(250.0, bh)))
	_draw_pdelta(Rect2(Vector2(296.0, top), Vector2(420.0, bh)))
	_draw_swing(Rect2(Vector2(732.0, top), Vector2(minf(400.0, w - 732.0 - 220.0), bh)))
	_draw_numbers(Rect2(Vector2(maxf(732.0 + 410.0, w - 214.0), top), Vector2(200.0, bh)))

func _draw_line_scene(r: Rect2) -> void:
	var gy := r.end.y - 10.0; var n := int(q.circuits); var fired: bool = bool(q.fired)
	var worried: bool = not bool(q.swing.stable) and not bool(q.ok) or (not bool(q.swing.stable))
	# the plant: dam and two units
	draw_rect(Rect2(Vector2(r.position.x, gy - 90.0), Vector2(70.0, 90.0)), Color("#58606E")); draw_rect(Rect2(Vector2(r.position.x - 24.0, gy - 120.0), Vector2(24.0, 120.0)), Color("#2B5A7A"))
	for k in 2:
		var c := Vector2(r.position.x + 22.0 + 30.0 * k, gy - 30.0); draw_circle(c, 11.0, Color("#262E47")); draw_arc(c, 11.0, 0, TAU, 20, Color("#9FD8FF"), 2.0)
		var a := _t * 6.0 + k; draw_line(c, c + Vector2(cos(a), sin(a)) * 9.0, Color("#CFEAFF"), 2.0)
	_text(_semi(), 12, Vector2(r.position.x - 24.0, gy + 14.0), T("C4_KESTREL"), Color(GridTheme.TEXT, 0.8))
	if GridSettings.cute: _face(Vector2(r.position.x + 35.0, gy - 66.0), 11.0, not worried, 0.9)
	# the circuits
	var x0 := r.position.x + 90.0; var x1 := r.end.x - 130.0; var th := 66.0
	for k in 12:
		var tx := lerpf(x0, x1, float(k) / 11.0)
		draw_line(Vector2(tx, gy), Vector2(tx, gy - th), Color("#9AA6B2"), 4.0); draw_line(Vector2(tx - 12.0, gy - th), Vector2(tx + 12.0, gy - th), Color("#9AA6B2"), 3.0)
	for ci in n:
		var y := gy - th - 2.0 + 9.0 * ci; var gone := fired and ci == n - 1
		var col := Color(GridTheme.COPPER) if not gone else Color(0.5, 0.5, 0.5, 0.5)
		var pts := PackedVector2Array()
		for i in 60:
			var u := float(i) / 59.0; var seg := fmod(u * 11.0, 1.0); pts.append(Vector2(lerpf(x0, x1, u), y + 8.0 * 4.0 * seg * (1.0 - seg)))
		if gone: for i in range(0, 58, 4): draw_line(pts[i], pts[i + 1], col, 2.0)
		else:
			draw_polyline(pts, col, 2.5, true)
			var spd := 0.08 + 0.3 * float(q.pm) / 3.0
			for d in 10:
				var u2 := fposmod(float(d) / 10.0 + _t * spd, 1.0); draw_circle(pts[int(u2 * 59.0)] + Vector2(0, -3), 2.2, Color(GridTheme.LIVE, 0.9))
		if int(q.build.seriesPct) > 0 and not gone:
			var m := pts[30] + Vector2(0, -3.0); draw_rect(Rect2(m + Vector2(-5, -10), Vector2(10, 20)), Color("#0E1432")); draw_line(m + Vector2(-5, -8), m + Vector2(-5, 8), Color("#7AA7FF"), 3.0); draw_line(m + Vector2(5, -8), m + Vector2(5, 8), Color("#7AA7FF"), 3.0)
		if gone: _text(_mono(), 16, pts[30] + Vector2(-8, 4), "✗", GridTheme.BAD)
	_text(_mono(), 12, Vector2((x0 + x1) * 0.5 - 150.0, gy - th - 34.0), T("C4_LINE") % [n, _f(float(q.pm) * 100.0, 0)], Color(GridTheme.TEXT, 0.85), 300.0, 1)
	# the city
	var cx := r.end.x - 110.0
	for k in 4:
		var hr := Rect2(Vector2(cx + 28.0 * k, gy - 40.0 - 14.0 * (k % 2)), Vector2(22.0, 40.0 + 14.0 * (k % 2))); draw_rect(hr, Color("#3A4256"))
		for wy in 3: draw_rect(Rect2(hr.position + Vector2(5, 6 + 12 * wy), Vector2(5, 5)), Color("#FFD27A", 0.9 if not (fired and not bool(q.swing.stable)) else 0.1))
	_text(_semi(), 12, Vector2(cx, gy + 14.0), T("C4_CITY"), Color(GridTheme.TEXT, 0.8))

func _draw_rotor(r: Rect2) -> void:
	draw_style_box(GridTheme.ink_sb(0.82, 10, 0.0), r)
	_text(_semi(), 11, r.position + Vector2(12.0, 17.0), T("C4_ROTOR"), Color(GridTheme.TEXT, 0.7))
	var c := r.position + Vector2(r.size.x * 0.5, r.size.y * 0.52); var R := minf(r.size.x, r.size.y) * 0.34
	draw_arc(c, R, 0.0, TAU, 48, Color(1, 1, 1, 0.18), 1.5)
	draw_line(c, c + Vector2(R, 0), Color("#FFFFFF"), 3.0); _text(_mono(), 11, c + Vector2(R + 4.0, 4.0), "V", Color.WHITE)
	var sw: Dictionary = q.swing; var tS: Array = sw.tS; var dd: Array = sw.deltaDeg
	var ang := float(q.delta0)
	if bool(q.fired) and not tS.is_empty():   # replay the swing once the trip has happened, then rest at the last angle
		var t := fmod(_t, float(tS[tS.size() - 1]) + 1.0); var idx := 0
		for i in tS.size(): if float(tS[i]) <= t: idx = i
		ang = float(dd[idx]) if t < float(tS[tS.size() - 1]) else float(dd[dd.size() - 1])
	var a := deg_to_rad(ang)
	var e := c + Vector2(cos(-a), sin(-a)) * R * 1.12
	draw_arc(c, R * 0.35, -a, 0.0, 20, Color(GridTheme.SODIUM), 2.0)
	_arrow(c, e, Color(GridTheme.SODIUM), 4.0); _text(_mono(), 11, e + Vector2(4.0, -4.0), "E′", GridTheme.SODIUM)
	var du := deg_to_rad(float(sw.deltaU)); if float(sw.deltaU) > 0.0:
		draw_line(c, c + Vector2(cos(-du), sin(-du)) * R * 1.2, Color(GridTheme.BAD, 0.7), 2.0); _text(_mono(), 10, c + Vector2(cos(-du), sin(-du)) * R * 1.2 + Vector2(-20, -4), "δu", GridTheme.BAD)
	_text(_mono(), 13, r.position + Vector2(12.0, r.size.y - 12.0), "δ = %s°" % _f(ang, 0), GridTheme.SODIUM)

func _draw_pdelta(r: Rect2) -> void:
	draw_style_box(GridTheme.ink_sb(0.82, 10, 0.0), r)
	_text(_semi(), 11, r.position + Vector2(12.0, 17.0), T("C4_PDELTA"), Color(GridTheme.TEXT, 0.7))
	var plot := Rect2(r.position + Vector2(38.0, 30.0), r.size - Vector2(54.0, 58.0)); var pmaxy := 4.4
	var X := func(d: float) -> float: return plot.position.x + plot.size.x * d / 180.0
	var Y := func(p: float) -> float: return plot.end.y - plot.size.y * clampf(p, 0.0, pmaxy) / pmaxy
	draw_rect(plot, Color("#0B1026"))
	for k in [1.0, 2.0, 3.0, 4.0]: draw_line(Vector2(plot.position.x, Y.call(k)), Vector2(plot.end.x, Y.call(k)), Color(1, 1, 1, 0.07), 1.0); _text(_mono(), 10, Vector2(r.position.x + 4.0, Y.call(k) + 4.0), _f(k, 0), Color(GridTheme.TEXT, 0.5))
	for k in [0, 90, 180]: _text(_mono(), 10, Vector2(X.call(float(k)) - 10.0, plot.end.y + 14.0), "%d°" % k, Color(GridTheme.TEXT, 0.5))
	var pre := PackedVector2Array(); var post := PackedVector2Array()
	for c in q.curves: pre.append(Vector2(X.call(float(c.d)), Y.call(float(c.pre)))); post.append(Vector2(X.call(float(c.d)), Y.call(float(c.post))))
	draw_polyline(pre, Color(GridTheme.LIVE, 0.8), 2.0, true); draw_polyline(post, Color("#FF9A3E"), 2.5, true)
	var pm := float(q.pm); draw_line(Vector2(plot.position.x, Y.call(pm)), Vector2(plot.end.x, Y.call(pm)), Color.WHITE, 2.0); _text(_mono(), 10, Vector2(plot.end.x - 90.0, Y.call(pm) - 5.0), "P_m %s" % _f(pm, 2), Color.WHITE)
	if bool(q.ok):
		draw_circle(Vector2(X.call(float(q.delta0)), Y.call(pm)), 5.0, GridTheme.LIVE); _text(_mono(), 10, Vector2(X.call(float(q.delta0)) - 10.0, Y.call(pm) + 16.0), "δ₀", GridTheme.LIVE)
		if q.deltaPost != null: draw_circle(Vector2(X.call(float(q.deltaPost)), Y.call(pm)), 5.0, Color("#FF9A3E")); _text(_mono(), 10, Vector2(X.call(float(q.deltaPost)) - 6.0, Y.call(pm) + 16.0), "δ₁", Color("#FF9A3E"))
		if float(q.swing.deltaU) > 0.0: var xu: float = X.call(float(q.swing.deltaU)); draw_line(Vector2(xu, plot.position.y), Vector2(xu, plot.end.y), Color(GridTheme.BAD, 0.8), 1.5); _text(_mono(), 10, Vector2(xu - 8.0, plot.position.y + 11.0), "δu", GridTheme.BAD)
		var pk := float(q.swing.peak); var sw_ok := bool(q.swing.stable)
		var xp: float = X.call(minf(pk, 180.0)); draw_line(Vector2(xp, plot.position.y), Vector2(xp, plot.end.y), _good(sw_ok), 2.0); _text(_mono(), 10, Vector2(xp - 20.0, plot.end.y - 6.0), "%s°" % _f(pk, 0), _good(sw_ok))

func _draw_swing(r: Rect2) -> void:
	draw_style_box(GridTheme.ink_sb(0.82, 10, 0.0), r)
	_text(_semi(), 11, r.position + Vector2(12.0, 17.0), T("C4_SWING"), Color(GridTheme.TEXT, 0.7))
	var plot := Rect2(r.position + Vector2(38.0, 30.0), r.size - Vector2(54.0, 58.0)); var sw: Dictionary = q.swing
	draw_rect(plot, Color("#0B1026"))
	var tS: Array = sw.tS; var dd: Array = sw.deltaDeg; if tS.size() < 2: return
	var tmax := maxf(float(tS[tS.size() - 1]), 0.5); var dmax := maxf(150.0, float(sw.deltaU) + 10.0)
	var X := func(t: float) -> float: return plot.position.x + plot.size.x * t / tmax
	var Y := func(d: float) -> float: return plot.end.y - plot.size.y * clampf(d, 0.0, dmax) / dmax
	for k in [0, 50, 100, 150]: _text(_mono(), 10, Vector2(r.position.x + 4.0, Y.call(float(k)) + 4.0), "%d°" % k, Color(GridTheme.TEXT, 0.5))
	if float(sw.deltaU) > 0.0: draw_line(Vector2(plot.position.x, Y.call(float(sw.deltaU))), Vector2(plot.end.x, Y.call(float(sw.deltaU))), Color(GridTheme.BAD, 0.8), 1.5)
	draw_line(Vector2(plot.position.x, Y.call(70.0)), Vector2(plot.end.x, Y.call(70.0)), Color(GridTheme.GOOD, 0.7), 1.0); _text(_mono(), 10, Vector2(plot.end.x - 88.0, Y.call(70.0) - 4.0), T("C4_STAR70"), Color(GridTheme.GOOD, 0.8))
	var pts := PackedVector2Array(); for i in tS.size(): pts.append(Vector2(X.call(float(tS[i])), Y.call(float(dd[i]))))
	draw_polyline(pts, _good(bool(sw.stable)), 2.5, true)
	_text(_mono(), 10, Vector2(plot.position.x, plot.end.y + 14.0), "0", Color(GridTheme.TEXT, 0.5)); _text(_mono(), 10, Vector2(plot.end.x - 40.0, plot.end.y + 14.0), "%s s" % _f(tmax, 1), Color(GridTheme.TEXT, 0.5))
	var txt := T("C4_SW_OK") % _f(float(sw.peak), 0) if bool(sw.stable) else (T("C4_SW_NOEQ") if bool(sw.noEquilibrium) else T("C4_SW_SLIP") % _f(float(sw.peak), 0))
	_text(_mono(), 12, r.position + Vector2(0.0, 17.0), txt, _good(bool(sw.stable)), r.size.x - 12.0, 2)

func _draw_numbers(r: Rect2) -> void:
	draw_style_box(GridTheme.ink_sb(0.82, 10, 0.0), r)
	var m := _mono(); var y := r.position.y + 24.0
	var lines := [["E′ = %s pu" % _f(float(q.E), 3), Color.WHITE], ["X before %s pu" % _f(float(q.xPre), 3), Color(GridTheme.LIVE)], ["X after %s pu" % _f(float(q.xPost), 3), Color("#FF9A3E")],
		["P_max %s → %s" % [_f(float(q.pmaxPre), 2), _f(float(q.pmaxPost), 2)], Color.WHITE], ["P_m = %s pu" % _f(float(q.pm), 2), Color.WHITE], ["P_max/P_m after: %s" % _f(float(q.margin), 2), _good(float(q.margin) >= 1.0)],
		["circuit rating %d MVA" % int(q.circuitMva), Color(GridTheme.TEXT, 0.7)], ["trip at %s" % str(q.eventClock), Color(GridTheme.SODIUM)]]
	for l in lines: _text(m, 12, Vector2(r.position.x + 12.0, y), str(l[0]), l[1]); y += 22.0

func _draw_panel_body() -> void:
	var inner := Rect2(panel.position + Vector2(12.0, 8.0), panel.size - Vector2(24.0, 16.0)); var lock := _locked(); var b: Dictionary = q.build
	_text(_semi(), 11, inner.position + Vector2(0, 14.0), T("C4_AVR_CAP2"), Color(GridTheme.TEXT, 0.7)); _text(_semi(), 11, inner.position + Vector2(298.0, 14.0), T("C4_SERIES_CAP"), Color(GridTheme.TEXT, 0.7))
	var l12: Dictionary = kit.get("l12", {})
	for h in hits:
		var id := str(h.id); var arg = h.arg
		match id:
			"vref": _chip(h.rect, _f(float(arg), 2), "pu", is_equal_approx(float(b.vref), float(arg)), id, arg, not lock)
			"series":
				var pr := ""; for s in l12.get("series", []): if int(s.pct) == int(arg): pr = str(s.price)
				_chip(h.rect, "%d %%" % int(arg), pr if int(arg) > 0 else "", int(b.seriesPct) == int(arg), id, arg, not lock)
			"third": _chip(h.rect, T("C4_THIRD"), str(l12.get("circuitPrice", "")), bool(b.third), id, arg, not lock)
			"redispatch":
				var pr2 := ""; for s in l12.get("redispatch", []): if int(s.mw) == int(arg): pr2 = str(s.price)
				_chip(h.rect, ("−%d MW" % int(arg)) if int(arg) > 0 else "0 MW", pr2 if int(arg) > 0 else "", int(b.reduceMW) == int(arg), id, arg, not lock)
	_text(_semi(), 11, inner.position + Vector2(0, 150.0), T("C4_PEAKS2"), Color(GridTheme.TEXT, 0.7))
	var sw: Dictionary = q.swing; var ok := bool(sw.stable)
	_text(_mono(), 11, inner.position + Vector2(0, 168.0), ("✓ " if ok else "✗ ") + T("C4_CHK_SYNC") % _f(float(sw.peak), 0) + "   " + ("✓ " if bool(q.ok) and float(sw.peak) <= 70.0 and ok else "· ") + T("C4_CHK_70"), _good(ok))
