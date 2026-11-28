class_name Ch8Tcc
extends Ch8Base
## L33 Fuse Saving: the time-current chart (log-log). The recloser's fast and slow curves, each spur fuse's minimum-melt (dashed) and total-clearing (solid) curve, the band of fault
## currents each spur can see, and a bracket where a curve pair is tightest, labelled with the engine's margin (the fast curve must sit under the melt curve, the slow curve over the
## clearing curve). The panel: the recloser's pickup, two time dials and fast shots, and a link per spur.
const COLS := [Color("#FFC56B"), Color("#5BD69A"), Color("#FF4FD8")]
const FAST := Color("#39E1FF")
const SLOW := Color("#8EA2FF")

func _init() -> void:
	super._init(); scenario = "L33"; name = "Ch8Tcc"

func _build_panel(ip: Rect2) -> void:
	var d: Dictionary = q.design; var rows := [["pickups", "pu", "pickupA"], ["fastTd", "ft", "fastTd"], ["slowTd", "st", "slowTd"], ["fastShots", "sh", "fastShots"]]
	var caps2 := [T("C8_PICKUP_CAP"), T("C8_FAST_CAP"), T("C8_SLOW_CAP"), T("C8_SHOTS_CAP")]
	for r in rows.size():
		_cap(ip, 0, 36.0 + 38.0 * r, caps2[r])
		var vals: Array = kit.get(rows[r][0], [])
		for k in vals.size(): _c(ip, 84.0 + 56.0 * k, 4.0 + 38.0 * r, 52, 34, WorkOrder.num(float(vals[k])), str(rows[r][1]), float(vals[k]), is_equal_approx(float(d[rows[r][2]]), float(vals[k])))
	var links: Array = kit.get("fuseLinks", []); var spurs: Array = kit.get("spurs", [])
	for s in spurs.size():
		var sp: Dictionary = spurs[s]; _cap(ip, 330, 34.0 + 38.0 * s, T("C8_SPUR_CAP") % [str(sp.id), int(sp.loadA)])
		for k in links.size(): _c(ip, 390.0 + 35.0 * k, 4.0 + 38.0 * s, 32, 34, WorkOrder.num(float(links[k])), "link:" + str(sp.id), float(links[k]), is_equal_approx(float(d.fuse[str(sp.id)]), float(links[k])))

func _pressed(h: Dictionary, _p: Vector2) -> void:
	var d: Dictionary = q.design; var id := str(h.id); var v: float = float(h.arg)
	var pu: float = float(d.pickupA); var ft: float = float(d.fastTd); var st: float = float(d.slowTd); var sh: float = float(d.fastShots)
	match id:
		"pu": _act("setRecloser", [v, ft, st, sh])
		"ft": _act("setRecloser", [pu, v, st, sh])
		"st": _act("setRecloser", [pu, ft, v, sh])
		"sh": _act("setRecloser", [pu, ft, st, v])
		_:
			if id.begins_with("link:"): _act("setFuseLink", [id.substr(5), v])

func _kind() -> String: return "ok" if q.get("kind") == null else str(q.kind)

func _draw_stage() -> void:
	if _look3(): _draw_stage3(); return
	var sb := _sbox(420.0); var w := sb.size.x + 60.0; var top := sb.position.y; var bh := sb.size.y
	var r := Rect2(Vector2(30.0, top), Vector2(maxf((w - 60.0) * 0.68, 420.0), bh))
	_tcc(r)
	var lg := Rect2(Vector2(r.end.x + 12.0, top), Vector2(maxf(w - r.end.x - 42.0, 240.0), bh)); _legend(lg)

func _tcc(r: Rect2) -> void:
	var xlo := 80.0; var xhi := 6000.0
	_frame(r, xlo, xhi, 0.01, 300.0, true, true, T("C8_TC_X"), T("C8_TC_Y"))
	var pr: Rect2 = plot.r; var rc: Dictionary = q.recloser
	# the band of fault currents each spur can see
	for k in q.spurs.size():
		var sp: Dictionary = q.spurs[k]; var a := _pt(float(sp.iMinA), 0.01).x; var b := _pt(float(sp.iMaxA), 0.01).x
		draw_rect(Rect2(Vector2(a, pr.position.y), Vector2(b - a, pr.size.y)), Color(COLS[k], 0.08)); _text(_mono(), 10, Vector2(a, pr.end.y - 6.0 - 12.0 * k), str(sp.id), COLS[k])
	# the recloser's pickup and the head load
	var pk := _pt(float(q.design.pickupA), 0.01).x
	draw_line(Vector2(pk, pr.position.y), Vector2(pk, pr.end.y), Color(GridTheme.TEXT, 0.35), 1.0); _text(_mono(), 10, Vector2(pk + 4.0, pr.position.y + 12.0), T("C8_PICKUP_LINE") % WorkOrder.num(float(q.design.pickupA)), Color(GridTheme.TEXT, 0.7))
	var hl := _pt(float(q.headLoadA), 0.01).x
	draw_line(Vector2(hl, pr.position.y), Vector2(hl, pr.end.y), Color(GridTheme.WARN, 0.4), 1.0); _text(_mono(), 10, Vector2(hl - 4.0 - 70.0, pr.position.y + 26.0), T("C8_LOAD_LINE") % WorkOrder.num(float(q.headLoadA)), Color(GridTheme.WARN, 0.8))
	for k in q.spurs.size():
		var sp: Dictionary = q.spurs[k]
		_poly_n(sp.minMelt, Color(COLS[k], 0.9), 1.5, true); _poly_n(sp.totalClear, COLS[k], 2.5)
	if int(q.design.fastShots) > 0: _poly_n(rc.fast, FAST, 3.0)
	_poly_n(rc.slow, SLOW, 3.0)
	# brackets where the pair is tightest, with the engine's margin
	for k in q.spurs.size():
		var sp: Dictionary = q.spurs[k]
		if int(q.design.fastShots) > 0: _bracket(rc.fast, sp.minMelt, float(sp.iMinA), float(sp.iMaxA), COLS[k], float(sp.fastMarginS), false)
		_bracket(rc.slow, sp.totalClear, float(sp.iMinA), float(sp.iMaxA), COLS[k], float(sp.slowMarginS), true)

## The legend card and the margins.
func _legend(lg: Rect2) -> void:
	_card(lg)
	var lx := lg.position.x + 14.0; var ly := lg.position.y + 36.0
	_text(_semi(), 11, Vector2(lx, ly - 16.0), T("C8_LEG"), GridTheme.SODIUM)
	draw_line(Vector2(lx, ly), Vector2(lx + 22.0, ly), FAST, 3.0); _text(_mono(), 10, Vector2(lx + 30.0, ly + 4.0), T("C8_LEG_FAST") % int(q.design.fastShots), GridTheme.TEXT)
	draw_line(Vector2(lx, ly + 18.0), Vector2(lx + 22.0, ly + 18.0), SLOW, 3.0); _text(_mono(), 10, Vector2(lx + 30.0, ly + 22.0), T("C8_LEG_SLOW"), GridTheme.TEXT)
	_dashed(Vector2(lx, ly + 36.0), Vector2(lx + 22.0, ly + 36.0), Color(GridTheme.TEXT, 0.8), 1.5, 4.0); _text(_mono(), 10, Vector2(lx + 30.0, ly + 40.0), T("C8_LEG_MELT"), GridTheme.TEXT)
	draw_line(Vector2(lx, ly + 54.0), Vector2(lx + 22.0, ly + 54.0), Color(GridTheme.TEXT, 0.8), 2.5); _text(_mono(), 10, Vector2(lx + 30.0, ly + 58.0), T("C8_LEG_CLEAR"), GridTheme.TEXT)
	var lines := []
	var tcol := _good(_kind() == "ok")
	lines.append([T("C8_KIND_" + _kind()), tcol])
	for k in q.spurs.size():
		var sp: Dictionary = q.spurs[k]
		lines.append([T("C8_SPUR_LINE") % [str(sp.id), int(sp.fuseA), WorkOrder.num(float(sp.fastMarginS)), WorkOrder.num(float(sp.slowMarginS)), T("C8_YES") if bool(sp.fuseLoadOk) else T("C8_NO"), T("C8_YES") if bool(sp.fuseMelts) else T("C8_NO"), int(sp.iMinA), int(sp.iMaxA)], COLS[k] if bool(sp.ok) else GridTheme.BAD])
	lines.append([T("C8_WORST") % [WorkOrder.num(float(q.marginS)), WorkOrder.num(float(q.marginStarS))], _good(float(q.marginS) >= 0.0)])
	lines.append([T("C8_BLOWS") % [WorkOrder.num(float(q.blowsPerYear)), int(round(float(q.tempFaultShare) * 100.0))], Color(GridTheme.TEXT, 0.8)])
	lines.append([T("C8_L33_GLOSS1"), Color(GridTheme.TEXT, 0.6)]); lines.append([T("C8_L33_GLOSS2"), Color(GridTheme.TEXT, 0.6)])
	var cr := Rect2(lg.position + Vector2(0, 108.0), Vector2(lg.size.x, lg.size.y - 108.0)); _card_lines(cr, lines, 10, 6.0, 0.0)

## A vertical bracket between two curves at the current (inside [lo, hi]) where they are closest, with the engine's margin beside it.
func _bracket(c1: Array, c2: Array, lo: float, hi: float, col: Color, margin: float, slow: bool) -> void:
	var best := INF; var at := 0.0; var ya := 0.0; var yb := 0.0
	var xs := [lo, hi]
	for p in c1:
		if float(p[0]) > lo and float(p[0]) < hi: xs.append(float(p[0]))
	for x in xs:
		var a = _interp(c1, x); var b = _interp(c2, x)
		if a == null or b == null: continue
		var m: float = (float(a) - float(b)) if slow else (float(b) - float(a))
		if m < best: best = m; at = x; ya = float(a); yb = float(b)
	if best == INF: return
	var p1 := _pt(at, ya); var p2 := _pt(at, yb)
	if not (plot.r as Rect2).grow(2.0).has_point(p1) or not (plot.r as Rect2).grow(2.0).has_point(p2): return
	var good := margin >= 0.0
	draw_line(p1, p2, _good(good), 2.0); draw_circle(p1, 3.0, col); draw_circle(p2, 3.0, col)
	if _look3():   # 3D: one decimal, above the bracket's upper end and off the curves (the labels sat on them)
		_text(_mono(), 10, Vector2(minf(p1.x, p2.x) + 8.0, maxf(minf(p1.y, p2.y) - 8.0, (plot.r as Rect2).position.y + 40.0)), (T("C8_SLOW_TAG") if slow else T("C8_FAST_TAG")) + " " + ("+" if margin >= 0.0 else "") + WorkOrder.num(snappedf(margin, 0.1)), _good(good))
		return
	_text(_mono(), 10, (p1 + p2) * 0.5 + Vector2(6.0, 4.0), (T("C8_SLOW_TAG") if slow else T("C8_FAST_TAG")) + " " + ("+" if margin >= 0.0 else "") + WorkOrder.num(snappedf(margin, 0.001)), _good(good))

## The 3D feeder: the time-current chart and its legend stay as glass cards over the sky; the recloser and each spur's fuse carry chips, and after the run a fuse says saved or blown.
func _draw_stage3() -> void:
	var bh := _cards3_h(); var cs := _cards3(760.0, 430.0, bh)
	_tcc(cs[0]); _legend(cs[1])
	var d: Dictionary = q.design; var rev := _revealed()
	_pin("sub", [T("C8_SUB_PIN")], [GridTheme.G_TEXT], 22.0)
	_pin("recloser", [T("C8_PICKUP_LINE") % WorkOrder.num(float(d.pickupA)), T("C8_SHOTS_PIN") % int(d.fastShots)], [GridTheme.G_TEXT, GridTheme.G_DIM], 18.0)
	for sp in q.spurs:
		var id := str(sp.id); var saved: bool = int(d.fastShots) > 0 and float(sp.fastMarginS) >= 0.0
		var lines := [T("C8_LINK_PIN") % [id, int(sp.fuseA)]]; var cols := [GridTheme.G_TEXT]
		lines.append(T("C8_FAST_TAG") + " " + ("+" if float(sp.fastMarginS) >= 0.0 else "") + WorkOrder.num(snappedf(float(sp.fastMarginS), 0.001)) + " s"); cols.append(_good(float(sp.fastMarginS) >= 0.0))
		if rev: lines.append(T("C8_FUSE_SAVED") if saved else T("C8_FUSE_BLOWN")); cols.append(_good(saved))
		_pin("fuse_" + id, lines, cols, 18.0)
		_pin(id, [T("C8_HOMES_PIN") % int(sp.customers)], [GridTheme.G_DIM], 16.0)
