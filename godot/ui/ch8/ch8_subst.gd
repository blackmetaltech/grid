class_name Ch8Subst
extends Ch8Base
## L34 Firm Capacity: the transformer thermometer. The survivor's hot-spot and top-oil temperature through the outage day against the 140 C line, the load against what is served, the
## days of life lost. The panel: transformer size, bus-section close, tie transfer, demand response. Cute mode: the thermometer's bulb is happy while the hot spot stays under the line.
const HOT := Color("#E5484D")
const OIL := Color("#FFB020")

func _init() -> void:
	super._init(); scenario = "L34"; name = "Ch8Subst"

func _build_panel(ip: Rect2) -> void:
	var d: Dictionary = q.design
	var caps2 := [T("C8_SIZE_CAP"), T("C8_BUS_CAP"), T("C8_TIE_XFER_CAP"), T("C8_DR_CAP")]
	for r in 4: _cap(ip, 0, 26.0 + 40.0 * r, caps2[r])
	var sizes: Array = kit.get("sizes", [])
	for k in sizes.size(): _c(ip, 108.0 + 86.0 * k, 4, 82, 36, T("C8_MVA") % WorkOrder.num(float(sizes[k].mva)), "size", float(sizes[k].mva), is_equal_approx(float(d.sizeMva), float(sizes[k].mva)), str(sizes[k].each))
	_c(ip, 108, 44, 82, 36, T("C8_MANUAL"), "bus", "manual", str(d.bus) == "manual", T("C8_BUS_H") % int(kit.get("bus", {}).get("manualH", 1)))
	_c(ip, 194, 44, 82, 36, T("C8_AUTO"), "bus", "auto", str(d.bus) == "auto", str(kit.get("bus", {}).get("auto", "")))
	var ties: Array = kit.get("ties", [])
	for k in ties.size(): _c(ip, 108.0 + 86.0 * k, 84, 82, 36, T("C8_" + str(ties[k].id).to_upper()), "tie", str(ties[k].id), str(d.tie) == str(ties[k].id), str(ties[k].price))
	var drs: Array = kit.get("dr", [])
	for k in drs.size(): _c(ip, 108.0 + 86.0 * k, 124, 82, 36, T("C8_" + str(drs[k].id).to_upper()), "dr", str(drs[k].id), str(d.dr) == str(drs[k].id), str(drs[k].price))

func _pressed(h: Dictionary, _p: Vector2) -> void:
	match str(h.id):
		"size": _act("setTransformerSize", [float(h.arg)])
		"bus": _act("setBusSection", [str(h.arg)])
		"tie": _act("setTransfer", [str(h.arg)])
		"dr": _act("setDemandResponse", [str(h.arg)])

func _body(ip: Rect2) -> void:
	var ok := not bool(q.overheat) and not bool(q.notRestored)
	GridText.dm(self, _mono(), ip.position + Vector2(390.0, 22.0), T("C8_L34_OK") if ok else (T("C8_L34_HOT") if bool(q.overheat) else T("C8_L34_LATE")), HORIZONTAL_ALIGNMENT_LEFT, 240.0, GridTheme.fs(11), 5, _good(ok))

func _draw_stage() -> void:
	if _look3(): _draw_stage3(); return
	var sb := _sbox(420.0); var w := sb.size.x + 60.0; var top := sb.position.y; var bh := sb.size.y
	var day: Dictionary = q.day; var n: int = (day.hotC as Array).size(); var step := float(q.stepMin) / 60.0
	var hot_peak := float(q.hotPeakC); var lim := float(q.hotLimitC); var ok := not bool(q.overheat) and not bool(q.notRestored)
	# left: the thermometer
	var th := Rect2(Vector2(30.0, top), Vector2(270.0, bh)); _card(th)
	_text(_semi(), 11, th.position + Vector2(14.0, 20.0), T("C8_THERMO"), GridTheme.SODIUM)
	var tx := th.position.x + 70.0; var y1 := th.position.y + 46.0; var y2 := th.end.y - 74.0; var tmin := 20.0; var tmax := maxf(180.0, ceilf((hot_peak + 5.0) / 20.0) * 20.0)
	var tube := Rect2(Vector2(tx - 11.0, y1), Vector2(22.0, y2 - y1)); draw_rect(tube, Color(GridTheme.TEXT, 0.12)); draw_rect(tube, Color(GridTheme.TEXT, 0.4), false, 1.5)
	var fy := lerpf(y2, y1, clampf((hot_peak - tmin) / (tmax - tmin), 0.0, 1.0)); var mc := GridTheme.GOOD if hot_peak <= lim else HOT
	draw_rect(Rect2(Vector2(tx - 7.0, fy), Vector2(14.0, y2 - fy + 4.0)), mc); draw_circle(Vector2(tx, y2 + 20.0), 24.0, mc); draw_arc(Vector2(tx, y2 + 20.0), 24.0, 0, TAU, 28, Color(GridTheme.TEXT, 0.4), 1.5)
	_face(Vector2(tx, y2 + 20.0), 22.0, ok, 0.9)
	for tv in range(int(tmin), int(tmax) + 1, 20):
		var py := lerpf(y2, y1, (float(tv) - tmin) / (tmax - tmin)); draw_line(Vector2(tx + 11.0, py), Vector2(tx + 18.0, py), Color(GridTheme.TEXT, 0.5), 1.0); _text(_mono(), 10, Vector2(tx + 22.0, py + 4.0), str(tv), Color(GridTheme.TEXT, 0.6))
	var ly := lerpf(y2, y1, (lim - tmin) / (tmax - tmin)); draw_line(Vector2(tx - 40.0, ly), Vector2(tx + 18.0, ly), HOT, 2.0); _text(_mono(), 10, Vector2(tx - 66.0, ly + 4.0), T("C8_LIMIT_C") % int(lim), HOT)
	_text(_mono(), 18, Vector2(th.position.x + 124.0, th.position.y + 90.0), T("C8_C") % WorkOrder.num(hot_peak), _good(hot_peak <= lim)); _text(_mono(), 10, Vector2(th.position.x + 124.0, th.position.y + 106.0), T("C8_HOT_AT") % str(q.hotPeakAt), Color(GridTheme.TEXT, 0.7))
	var lol := float(q.lolDays); var lstar := float(q.lolStarDays)
	_text(_mono(), 18, Vector2(th.position.x + 124.0, th.position.y + 170.0), T("C8_DAYS") % WorkOrder.num(lol), _good(lol <= lstar)); _text(_mono(), 10, Vector2(th.position.x + 124.0, th.position.y + 186.0), T("C8_LOL"), Color(GridTheme.TEXT, 0.7))
	GridText.dm(self, _mono(), th.position + Vector2(124.0, 206.0), T("C8_LOL_LAMPS") % [WorkOrder.num(lstar * 2.0), WorkOrder.num(lstar)], HORIZONTAL_ALIGNMENT_LEFT, 112.0, GridTheme.fs(10), 5, Color(GridTheme.TEXT, 0.6))
	# right: the readings
	var tw := minf(340.0, (w - 60.0) * 0.25); var tr := Rect2(Vector2(w - 30.0 - tw, top), Vector2(tw, bh))
	_readings(tr)
	# centre: temperatures, and load against served
	var cx := th.end.x + 12.0; var cwid := tr.position.x - 12.0 - cx
	_charts(Rect2(Vector2(cx, top), Vector2(cwid, bh)))

func _readings(tr: Rect2) -> void:
	var lines := []
	lines.append([T("C8_FIRM_LINE") % [int(q.n), WorkOrder.num(float(q.sizeMva)), WorkOrder.num(float(q.totalMva)), WorkOrder.num(float(q.firmMva)), WorkOrder.num(float(q.peakMva))], _good(float(q.shortfallMva) <= 0.0)])
	lines.append([T("C8_TRIP_LINE") % [WorkOrder.num(float(q.tripHour)), WorkOrder.num(float(q.sizeMva) * 1.5)], Color(GridTheme.TEXT, 0.85)])
	lines.append([(T("C8_BACK_LINE") % WorkOrder.num(float(q.restoredAtH))) if not bool(q.notRestored) else T("C8_NOT_BACK") % WorkOrder.num(float(q.restoreWithinH)), _good(not bool(q.notRestored))])
	lines.append([T("C8_UNSERVED") % WorkOrder.num(float(q.unservedMWh)), Color(GridTheme.TEXT, 0.85)])
	if bool(q.overheat): lines.append([T("C8_L34_HOT"), HOT])
	lines.append([T("C8_L34_GLOSS_AGE"), Color(GridTheme.TEXT, 0.6)]); lines.append([T("C8_L34_GLOSS_FIRM"), Color(GridTheme.TEXT, 0.6)])
	_lines(tr, T("C8_L34_TITLE"), lines)

## The temperatures through the day and the load against what is served.
func _charts(box: Rect2) -> void:
	var day: Dictionary = q.day; var n: int = (day.hotC as Array).size(); var step := float(q.stepMin) / 60.0
	var hot_peak := float(q.hotPeakC); var lim := float(q.hotLimitC)
	var tmin := 20.0; var tmax := maxf(180.0, ceilf((hot_peak + 5.0) / 20.0) * 20.0)
	var top := box.position.y; var bh := box.size.y; var cx := box.position.x; var cwid := box.size.x
	var p1 := Rect2(Vector2(cx, top), Vector2(cwid, bh * 0.58))
	_frame(p1, 0.0, 24.0, tmin, tmax, false, false, T("C8_HOUR"), T("C8_Y_C"))
	var pr: Rect2 = plot.r
	var hot := []; var oil := []
	for i in n: hot.append([float(i) * step, day.hotC[i]]); oil.append([float(i) * step, day.topOilC[i]])
	draw_rect(Rect2(_pt(0.0, tmax), Vector2(pr.size.x, _pt(0.0, lim).y - _pt(0.0, tmax).y)), Color(HOT, 0.10))
	draw_line(_pt(0.0, lim), _pt(24.0, lim), HOT, 1.5); _text(_mono(), 10, _pt(0.0, lim) + Vector2(8.0, -4.0), T("C8_PROT") % int(lim), HOT)
	var trip := float(q.tripHour); draw_line(_pt(trip, tmin), _pt(trip, tmax), Color(GridTheme.WARN, 0.7), 1.5); _text(_mono(), 10, _pt(trip, tmax) + Vector2(4.0, 14.0), T("C8_TRIP_TAG"), GridTheme.WARN)
	if not bool(q.notRestored): var bx := trip + float(q.restoredAtH); draw_line(_pt(bx, tmin), _pt(bx, tmax), Color(GridTheme.GOOD, 0.7), 1.5); _text(_mono(), 10, _pt(bx, tmax) + Vector2(4.0, 28.0), T("C8_BACK_TAG"), GridTheme.GOOD)
	_poly(oil, OIL, 2.0); _poly(hot, HOT, 3.0)
	_text(_mono(), 10, pr.position + Vector2(10.0, 14.0), T("C8_LEG_HOT"), HOT); _text(_mono(), 10, pr.position + Vector2(260.0 if _look3() else 160.0, 14.0), T("C8_LEG_OIL"), OIL)
	var p2 := Rect2(Vector2(cx, p1.end.y + 12.0), Vector2(cwid, bh - p1.size.y - 12.0))
	var lmax := 0.0
	for i in n: lmax = maxf(lmax, float(day.loadMva[i]))
	lmax = maxf(lmax, float(q.sizeMva) * 1.5)
	_frame(p2, 0.0, 24.0, 0.0, ceilf((lmax + 6.0) / 10.0) * 10.0, false, false, T("C8_HOUR"), T("C8_Y_MVA"))
	var load := []; var served := []
	for i in n: load.append([float(i) * step, day.loadMva[i]]); served.append([float(i) * step, day.servedMva[i]])
	var lim15 := float(q.sizeMva) * 1.5; var firm := float(q.firmMva)
	draw_line(_pt(0.0, lim15), _pt(24.0, lim15), Color(GridTheme.WARN, 0.8), 1.5); _text(_mono(), 10, _pt(0.0, lim15) + Vector2(8.0, -4.0), T("C8_LIM15") % WorkOrder.num(lim15), GridTheme.WARN)
	draw_line(_pt(0.0, firm), _pt(24.0, firm), Color(GridTheme.LIVE, 0.6), 1.5); _text(_mono(), 10, _pt(24.0, firm) + Vector2(-160.0, 12.0), T("C8_FIRM_TAG") % WorkOrder.num(firm), GridTheme.LIVE)
	_poly(load, Color(GridTheme.TEXT, 0.9), 2.0); _poly(served, GridTheme.GOOD, 3.0)
	_text(_mono(), 10, (plot.r as Rect2).position + Vector2(10.0, 14.0), T("C8_LEG_LOAD"), GridTheme.TEXT); _text(_mono(), 10, (plot.r as Rect2).position + Vector2(130.0, 14.0), T("C8_LEG_SERVED"), GridTheme.GOOD)

## The 3D substation: the two day charts and the readings stay as glass cards; the transformers, the bus section, the tie and the town carry the thermometer's numbers as chips.
func _draw_stage3() -> void:
	var w := _right(); var bh := _cards3_h(520.0)
	var cwid := minf(w * 0.37, 700.0)
	var cr := Rect2(Vector2(M, TOP), Vector2(cwid, bh)); _charts(cr)
	var rw := minf(w * 0.3, 440.0)
	var rr := Rect2(Vector2(w - M - rw, TOP), Vector2(rw, minf(bh, 380.0))); _readings(rr)
	_pins.append(cr); _pins.append(rr)
	var hot := float(q.hotPeakC); var lim := float(q.hotLimitC); var d: Dictionary = q.design
	var l3 = app.get("grid_world").look3d
	_pin("tx1", [T("C8_TX_TRIP") % WorkOrder.num(float(q.tripHour))], [GridTheme.BAD], 18.0)
	_pin("tx2", [T("C8_HOT_PIN") % [WorkOrder.num(hot), int(lim)], T("C8_HOT_AT") % str(q.hotPeakAt)], [_good(hot <= lim), GridTheme.G_DIM], 18.0)
	var bl := T("C8_BUS_PIN") % (T("C8_AUTO") if str(d.bus) == "auto" else T("C8_MANUAL"))
	_pin("bus", [bl, T("C8_BUS_H") % int(kit.get("bus", {}).get("manualH", 1)) if str(d.bus) == "manual" else T("C8_AUTO")], [GridTheme.G_TEXT, GridTheme.G_DIM], 18.0)
	_pin("tie", [T("C8_TIE_PIN") % T("C8_" + str(d.tie).to_upper())], [GridTheme.G_TEXT], 18.0)
	var dim_n := 0
	if l3 != null: dim_n = int(l3.report().get("dimmed", 0))
	_pin("town", [(T("C8_DR_PIN") % dim_n) if dim_n > 0 else T("C8_DR_CAP") + ": " + T("C8_NONE")], [GridTheme.SODIUM if dim_n > 0 else GridTheme.G_DIM], 18.0)
