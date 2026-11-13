class_name Ch7Merit
extends Ch7Base
## L26 Merit Order: the day's merit-order stack. Before the run: demand, solar and the hydro unit's water-value schedule. After it: generation by plant hour by hour, the
## demand line, the corridor flow against its limit, and the two prices (north / city) that split when the wire is full. The panel picks the dispatch rule and each
## plant's hours (click a plant to step through the windows the kit offers).
const PCOL := {"coalsub": Color("#8A7F6A"), "coalsc": Color("#E0703A"), "ccgt": Color("#39E1FF"), "ocgt": Color("#FF4FD8"), "hydro": Color("#4C7DFF"), "solar": Color("#FFE066")}
const ORDER := ["coalsub", "coalsc", "hydro", "solar", "ccgt", "ocgt"]

func _init() -> void:
	super._init(); scenario = "L26"; name = "Ch7Merit"
	_edit("lambda20")

var _home := Vector2.ZERO

func _submit(key: String) -> void: _predict_submit(key, "lambda20", "$/MWh")
func _after_refresh() -> void: _sync_predict("lambda20", "lambda20")

func _layout_panel() -> void:
	var inner := Rect2(panel.position + Vector2(12.0, 8.0), panel.size - Vector2(24.0, 16.0))
	_chip_row(inner.position.x, inner.position.y + 20.0, 150.0, 40.0, 6.0, [T("C7_MODE_merit"), T("C7_MODE_lambda"), T("C7_MODE_corridor")], "mode", ["merit", "lambda", "corridor"], str(q.design.mode))
	var x := inner.position.x
	for p in q.plants:
		_add_chip(Rect2(Vector2(x, inner.position.y + 84.0), Vector2(112, 46)), "win", str(p.id)); x += 118.0
	var e: LineEdit = edits["lambda20"]; e.size = Vector2(84, 30); _home = Vector2(inner.position.x + 520.0, inner.position.y + 24.0) if not _phone() else Vector2(inner.position.x + 480.0, inner.position.y + 24.0); e.position = _home

func _press(h: Dictionary, _p: Vector2) -> void:
	if str(h.id) == "fold": folded = not folded; layout(); queue_redraw(); return
	if str(h.id) == "mode": _act("setDispatchMode", [str(h.arg)]); return
	for p in q.plants:
		if str(p.id) != str(h.arg): continue
		var opts: Array = kit.plants[q.plants.find(p)].windows; var cur: Array = p.window; var i := 0
		for k in opts.size(): if int(opts[k][0]) == int(cur[0]) and int(opts[k][1]) == int(cur[1]): i = k
		var nx: Array = opts[(i + 1) % opts.size()]; _act("setCommitment", [str(p.id), int(nx[0]), int(nx[1])])

func _draw_panel_body() -> void:
	var inner := Rect2(panel.position + Vector2(12.0, 8.0), panel.size - Vector2(24.0, 16.0))
	_text(_semi(), 10, inner.position + Vector2(0, 12), T("C7_MODE_CAP"), Color(GridTheme.TEXT, 0.65)); _text(_semi(), 10, inner.position + Vector2(0, 78), T("C7_WINDOW_CAP"), Color(GridTheme.TEXT, 0.65))
	if _phone(): _text(_semi(), 10, inner.position + Vector2(190, 12), T("C7_PREDICT_LAM"), GridTheme.SODIUM)
	elif _revealed(): _text(_semi(), 10, inner.position + Vector2(480, 14), T("C7_PREDICT_LAM"), Color(GridTheme.TEXT, 0.8))
	var x := inner.position.x
	for p in q.plants:
		var w: Array = p.window; var on: bool = int(w[0]) != int(w[1])
		_chip(Rect2(Vector2(x, inner.position.y + 84.0), Vector2(112, 46)), T("C7_PLANT_" + str(p.id)), ("%d-%d  " % [int(w[0]), int(w[1])] + T("C7_MWH") % WorkOrder.num(float(p.b))) if on else T("C7_OFF"), on, "win", str(p.id)); x += 118.0
	if _revealed():
		var ok := str(q.get("kind", "")) == "" or q.get("kind") == null
		_text(_mono(), 12, inner.position + Vector2(480, 84), T("C7_COST") % str(q.costText), _good(ok))
		if q.get("trip") != null: _text(_mono(), 12, inner.position + Vector2(480, 104), T("C7_TRIP") % str(q.trip.time), GridTheme.BAD)
		else:
			var l: Dictionary = q.lambda20
			_text(_mono(), 12, inner.position + Vector2(480, 104), "20:00 %s %s / %s %s" % [T("C7_LAM_G"), str(l.g), T("C7_LAM_S"), str(l.s)], GridTheme.TEXT)

func _draw_stage() -> void:
	var w := size.x; var top := _stage_top(); var bh := _stage_h(240.0)
	var r := Rect2(Vector2(30.0, top), Vector2(maxf(w * 0.62, 420.0), bh))
	_frame(r, 0.0, 24.0, 0.0, 1600.0, false, false, "h", T("C7_STACK"))
	var pr: Rect2 = plot.r; var bw := pr.size.x / 24.0
	var rev := _revealed()
	for h in 24:
		var y0 := 0.0
		for k in ORDER:
			var v := 0.0
			if rev:
				var hh: Dictionary = q.hourly
				v = float(hh.hydro[h]) if k == "hydro" else float(hh.solar[h]) if k == "solar" else float(hh.p[k][h])
			else:
				v = 0.0
			if v <= 0.0: continue
			var a := _pt(float(h), y0); var b := _pt(float(h), y0 + v)
			draw_rect(Rect2(Vector2(pr.position.x + bw * h + 1.0, b.y), Vector2(bw - 2.0, a.y - b.y)), Color(PCOL[k], 0.9)); y0 += v
	if not rev: _text(_mono(), 11, Vector2(pr.position.x + 12.0, pr.end.y - 14.0), T("C7_PREVIEW_NONE"), Color(GridTheme.TEXT, 0.6))
	var lgx: float = pr.position.x + 10.0
	for k in ORDER:
		var nm := T("C7_HYDRO") if k == "hydro" else T("C7_SOLAR") if k == "solar" else T("C7_PLANT_" + k)
		draw_rect(Rect2(Vector2(lgx, pr.position.y + 6.0), Vector2(12, 12)), PCOL[k]); _text(_mono(), 10, Vector2(lgx + 16.0, pr.position.y + 16.0), nm, GridTheme.TEXT); lgx += 36.0 + 8.0 * nm.length()
	draw_line(Vector2(lgx + 6.0, pr.position.y + 12.0), Vector2(lgx + 26.0, pr.position.y + 12.0), GridTheme.TEXT, 2.0); _text(_mono(), 10, Vector2(lgx + 30.0, pr.position.y + 16.0), T("C7_DEMAND"), GridTheme.TEXT)
	var dem := []
	for h in 24: dem.append([float(h) + 0.5, float(rev if false else q.demandMW[h])])
	_poly(dem, GridTheme.TEXT, 2.0)
	# right: the corridor and the prices
	var sr := Rect2(Vector2(r.end.x + 16.0, top), Vector2(maxf(w - r.end.x - 46.0, 300.0), bh))
	if rev:
		(edits["lambda20"] as LineEdit).position = _home
		_frame(Rect2(sr.position, Vector2(sr.size.x, bh * 0.5 - 6.0)), 0.0, 24.0, -500.0, 600.0, false, false, "", T("C7_FLOW"))
		var fl := []
		for h in 24: fl.append([float(h) + 0.5, q.hourly.flow[h]])
		_poly([[0.0, q.corridorMW], [24.0, q.corridorMW]], Color(GridTheme.BAD, 0.7), 1.5); _poly([[0.0, -float(q.corridorMW)], [24.0, -float(q.corridorMW)]], Color(GridTheme.BAD, 0.7), 1.5)
		_poly(fl, GridTheme.LIVE, 2.5)
		_frame(Rect2(sr.position + Vector2(0, bh * 0.5 + 6.0), Vector2(sr.size.x, bh * 0.5 - 6.0)), 0.0, 24.0, 0.0, 120.0, false, false, "h", T("C7_LAMBDA"))
		var lg := []; var ls := []
		for h in 24:
			if q.hourly.lamG[h] != null: lg.append([float(h) + 0.5, q.hourly.lamG[h]])
			if q.hourly.lamS[h] != null: ls.append([float(h) + 0.5, q.hourly.lamS[h]])
		_poly(lg, GridTheme.SODIUM, 2.5); _poly(ls, GridTheme.REACTIVE, 2.5)
	else:
		_frame(Rect2(sr.position, Vector2(sr.size.x, bh * 0.5 - 6.0)), 0.0, 24.0, -500.0, 600.0, false, false, "", T("C7_FLOW") + "  (" + T("C7_CORRIDOR") % int(q.corridorMW) + ")")
		_poly([[0.0, q.corridorMW], [24.0, q.corridorMW]], Color(GridTheme.BAD, 0.7), 1.5); _poly([[0.0, -float(q.corridorMW)], [24.0, -float(q.corridorMW)]], Color(GridTheme.BAD, 0.7), 1.5)
		if not _phone(): _text(_mono(), 12, sr.position + Vector2(14, bh * 0.5 + 30.0), T("C7_HIDDEN"), GridTheme.DIM)
		if _phone():
			_card_text(Rect2(sr.position + Vector2(0, bh * 0.5 + 6.0), Vector2(sr.size.x, bh * 0.5 - 6.0)), [[T("C7_G26_LAMBDA"), Color(GridTheme.TEXT, 0.75)], [T("C7_G26_CORR"), Color(GridTheme.TEXT, 0.75)]], 11, 6.0, 8.0)
			(edits["lambda20"] as LineEdit).position = _home
		else:
			draw_multiline_string(_mono(), sr.position + Vector2(14, bh * 0.5 + 56.0), T("C7_G26_LAMBDA"), HORIZONTAL_ALIGNMENT_LEFT, sr.size.x - 28.0, GridTheme.fs(11), -1, Color(GridTheme.TEXT, 0.75))
			draw_multiline_string(_mono(), sr.position + Vector2(14, bh * 0.5 + 92.0), T("C7_G26_CORR"), HORIZONTAL_ALIGNMENT_LEFT, sr.size.x - 28.0, GridTheme.fs(11), -1, Color(GridTheme.TEXT, 0.75))
			_text(_semi(), 11, sr.position + Vector2(14, bh * 0.5 + 138.0), T("C7_PREDICT_LAM"), GridTheme.SODIUM)
			(edits["lambda20"] as LineEdit).position = sr.position + Vector2(14, bh * 0.5 + 146.0)
