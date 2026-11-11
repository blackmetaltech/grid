class_name Ch7Swing
extends Ch7Base
## L25 Clear It in Time: the P-delta drawer. The three power-angle curves (before, during, after the fault), the mechanical line P_m, the operating angle, and (after
## the run) the accelerating area A1 and decelerating area A2, the rotor's path, and the swing in time. The panel picks the relay and the breaker.
func _init() -> void:
	super._init(); scenario = "L25"; name = "Ch7Swing"
	_edit("deltaCrDeg")

func _submit(key: String) -> void: _predict_submit(key, "deltaCrDeg", "deg")
func _after_refresh() -> void: _sync_predict("deltaCrDeg", "deltaCrDeg")

func _relay_ids() -> Array:
	var out := []
	for r in kit.get("relays", []): out.append(str(r.id))
	return out

func _layout_panel() -> void:
	var inner := Rect2(panel.position + Vector2(12.0, 8.0), panel.size - Vector2(24.0, 16.0)); var ids := _relay_ids(); var cw := minf(78.0, (inner.size.x - 40.0) / maxf(ids.size(), 1.0))
	var labs := []
	for i in ids: labs.append(str(i).replace("idmt-", "").replace("dist-", "").replace("si-", "SI ").replace("ei-", "EI ").replace("z1", "zone 1").replace("z2", "zone 2"))
	_chip_row(inner.position.x, inner.position.y + 20.0, cw, 40.0, 4.0, labs, "relay", ids, str(q.design.relay))
	var y := inner.position.y + 76.0
	_chip_row(inner.position.x, y + 8.0, 52.0, 36.0, 5.0, ["2", "3", "5"], "cycles", [2.0, 3.0, 5.0], q.design.cycles)
	_chip_row(inner.position.x + 190.0, y + 8.0, 62.0, 36.0, 5.0, [T("C7_OFF"), "on"], "reclose", [false, true], q.design.reclose)
	var e: LineEdit = edits["deltaCrDeg"]; e.position = Vector2(inner.position.x + 440.0, y + 6.0); e.size = Vector2(84, 30)

func _press(h: Dictionary, _p: Vector2) -> void:
	match str(h.id):
		"relay": _act("setRelayType", [str(h.arg)])
		"cycles": _act("setBreakerCycles", [int(h.arg)])
		"reclose": _act("setAutoReclose", [bool(h.arg)])

func _draw_panel_body() -> void:
	var inner := Rect2(panel.position + Vector2(12.0, 8.0), panel.size - Vector2(24.0, 16.0))
	_text(_semi(), 10, inner.position + Vector2(0, 12), T("C7_RELAY_CAP2"), Color(GridTheme.TEXT, 0.65))
	_text(_semi(), 10, inner.position + Vector2(0, 76), T("C7_BREAKER_CAP"), Color(GridTheme.TEXT, 0.65)); _text(_semi(), 10, inner.position + Vector2(190, 76), T("C7_RECLOSE_CAP"), Color(GridTheme.TEXT, 0.65))
	_text(_semi(), 10, inner.position + Vector2(440, 76), T("C7_PREDICT_DCR"), GridTheme.SODIUM)
	_text(_mono(), 11, inner.position + Vector2(0, 138), T("C7_VS") % [int(q.clearMs), int(q.tCrMs)], _good(int(q.clearMs) <= int(q.tCrMs)))
	_text(_mono(), 10, inner.position + Vector2(0, 152), T("C7_CLEAR_SUM") % [int(q.relayMs), int(q.breakerMs), int(q.design.cycles)], Color(GridTheme.TEXT, 0.7))
	if _revealed():
		var ok := bool(q.stable)
		_text(_mono(), 12, inner.position + Vector2(300, 152), (T("C7_TCR") % int(q.tCrMs)) + "   " + (T("C7_MARGIN_MS") % int(q.marginMs)), _good(ok))

func _draw_stage() -> void:
	var w := size.x; var top := 150.0; var bh := maxf(panel.position.y - top - 14.0, 220.0)
	var pw := minf(w * 0.55, 640.0); var r := Rect2(Vector2(30.0, top), Vector2(pw, bh))
	_frame(r, 0.0, 180.0, 0.0, 2.0, false, false, "delta, deg", T("C7_PDELTA"))
	var c: Dictionary = q.curves
	var pre := []; var dur := []; var post := []
	for i in c.deltaDeg.size(): pre.append([c.deltaDeg[i], c.pre[i]]); dur.append([c.deltaDeg[i], c.during[i]]); post.append([c.deltaDeg[i], c.post[i]])
	if _revealed():   # the two areas, shaded
		var d0 := float(q.delta0Deg); var dc := float(q.clearAtDeg); var dm := float(q.peakDeg); var pm := float(c.pm)
		var a1 := PackedVector2Array(); var a2 := PackedVector2Array()
		for i in 25:
			var d := lerpf(d0, dc, float(i) / 24.0); a1.append(_pt(d, pm))
		for i in 25:
			var d := lerpf(dc, d0, float(i) / 24.0); a1.append(_pt(d, _interp(dur, d)))
		if a1.size() > 2: draw_colored_polygon(a1, Color(GridTheme.BAD, 0.35))
		if bool(q.stable):
			for i in 25:
				var d := lerpf(dc, dm, float(i) / 24.0); a2.append(_pt(d, _interp(post, d)))
			for i in 25:
				var d := lerpf(dm, dc, float(i) / 24.0); a2.append(_pt(d, pm))
			if a2.size() > 2: draw_colored_polygon(a2, Color(GridTheme.GOOD, 0.35))
	_poly(pre, Color(GridTheme.TEXT, 0.7), 2.0); _poly(dur, GridTheme.BAD, 2.5); _poly(post, GridTheme.LIVE, 2.5)
	_poly([[0.0, c.pm], [180.0, c.pm]], GridTheme.SODIUM, 2.0)
	var lp := _pt(150.0, 1.7); _text(_mono(), 10, lp, T("C7_PRE"), Color(GridTheme.TEXT, 0.7)); _text(_mono(), 10, _pt(100.0, float(_interp(post, 100.0)) + 0.1), T("C7_POST"), GridTheme.LIVE); _text(_mono(), 10, _pt(100.0, float(_interp(dur, 100.0)) + 0.1), T("C7_DURING"), GridTheme.BAD)
	_text(_mono(), 10, _pt(4.0, float(c.pm) + 0.07), T("C7_PM"), GridTheme.SODIUM)
	if _revealed():
		_text(_mono(), 10, _pt(112.0, 0.35), T("C7_A1"), Color(GridTheme.BAD, 0.9)); _text(_mono(), 10, _pt(112.0, 0.22), T("C7_A2"), Color(GridTheme.GOOD, 0.9))
		var dp := _pt(float(q.clearAtDeg), float(c.pm)); draw_circle(dp, 5.0, GridTheme.TEXT)
	# the swing in time
	var sr := Rect2(Vector2(r.end.x + 16.0, top), Vector2(maxf(w - r.end.x - 46.0, 280.0), bh))
	if _revealed():
		var tr: Dictionary = q.trace; var tmax := float(tr.t[tr.t.size() - 1]); tmax = maxf(tmax, 1.0)
		_frame(sr, 0.0, tmax, 0.0, 200.0, false, false, "t, s", T("C7_SWING"))
		var pts := []
		for i in tr.t.size(): pts.append([tr.t[i], tr.deltaDeg[i]])
		_poly(pts, GridTheme.LIVE if bool(q.stable) else GridTheme.BAD, 2.5)
		_poly([[0.0, q.deltaUDeg], [tmax, q.deltaUDeg]], Color(GridTheme.BAD, 0.6), 1.0)
		_text(_semi(), 20, Vector2(sr.position.x, sr.end.y - 40.0), T("C7_STABLE") if bool(q.stable) else T("C7_SLIPS"), _good(bool(q.stable)), sr.size.x, 1)
	else:
		draw_style_box(GridTheme.ink_sb(0.82, 10, 0.0), sr); _text(_mono(), 12, sr.position + Vector2(14, 28), T("C7_HIDDEN"), GridTheme.DIM)
		_text(_mono(), 12, sr.position + Vector2(14, 52), T("C7_G25_TARGET") % int(q.tCrMs), GridTheme.SODIUM)
		var gy: float = sr.position.y + 80.0
		for g in ["C7_G25_Z1", "C7_G25_Z2", "C7_G25_IDMT"]:
			draw_multiline_string(_mono(), Vector2(sr.position.x + 14.0, gy), T(g), HORIZONTAL_ALIGNMENT_LEFT, sr.size.x - 28.0, GridTheme.fs(11), -1, Color(GridTheme.TEXT, 0.75)); gy += 34.0
		draw_multiline_string(_mono(), sr.position + Vector2(14, gy + 10.0), T("C7_GLOSS_PM"), HORIZONTAL_ALIGNMENT_LEFT, sr.size.x - 28.0, GridTheme.fs(12), -1, Color(GridTheme.TEXT, 0.75))

func _interp(pts: Array, d: float) -> float:
	for i in range(1, pts.size()):
		if float(pts[i][0]) >= d:
			var a: Array = pts[i - 1]; var b: Array = pts[i]; var t := (d - float(a[0])) / maxf(float(b[0]) - float(a[0]), 1e-9)
			return lerpf(float(a[1]), float(b[1]), t)
	return float(pts[pts.size() - 1][1])
