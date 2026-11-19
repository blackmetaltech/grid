class_name Ch8Exam
extends Ch8Base
## L36 Exam Bridge: the givens of a small 11 kV feeder (wire, three sections with loads and devices, fault and repair rates), three prediction boxes (far-end voltage drop, SAIFI, SAIDI)
## and the "why" card (which equation governs the drop). After the run the engine's answers appear beside each prediction with a tick or a cross. Display and input only: the engine marks the exam.
const IDS := ["dropPct", "saifi", "saidi"]
const UNITS := {"dropPct": "%", "saifi": "/yr", "saidi": "min"}

func _init() -> void:
	super._init(); scenario = "L36"; name = "Ch8Exam"
	for k in IDS: _edit(k, 92.0)

func _submit(key: String) -> void: _predict_submit(key, key, str(UNITS[key]))

func _after_refresh() -> void:
	for k in IDS: _sync_predict(k, k)

func _build_panel(ip: Rect2) -> void:
	for k in IDS.size():
		var e: LineEdit = edits[IDS[k]]; e.position = ip.position + Vector2(214.0 * k, 20.0); e.size = Vector2(92, 30)
		_cap(ip, 214.0 * k, 12, T("C8_QS_" + IDS[k]))
	_cap(ip, 0, 66, T("C8_WHY_CAP"))
	var ch: Array = q.why.choices
	for k in ch.size(): _c(ip, 0, 72.0 + 36.0 * k, 450, 32, "", "why", str(ch[k].id), str(q.why.chosen) == str(ch[k].id))

func _pressed(h: Dictionary, _p: Vector2) -> void:
	if str(h.id) == "why": _act("answerWhy", [str(h.arg)])

func _body(ip: Rect2) -> void:
	for k in IDS.size():
		var e: LineEdit = edits[IDS[k]]; _text(_mono(), 11, e.position + Vector2(98.0, 20.0), T("C8_U_" + IDS[k]), Color(GridTheme.TEXT, 0.7))
	if _revealed(): _text(_semi(), 11, ip.position + Vector2(470.0, 92.0), T("C8_WHY_RIGHT") if bool(q.get("whyOk", false)) else T("C8_WHY_WRONG"), _good(bool(q.get("whyOk", false))))

func _over(ip: Rect2) -> void:
	var ch: Array = q.why.choices
	for k in ch.size():
		var r := Rect2(ip.position + Vector2(0, 72.0 + 36.0 * k), Vector2(450, 32)); var on := str(q.why.chosen) == str(ch[k].id)
		draw_multiline_string(_semi(), r.position + Vector2(10.0, 13.0), str(ch[k].text), HORIZONTAL_ALIGNMENT_LEFT, r.size.x - 20.0, GridTheme.fs(10), 2, GridTheme.SODIUM if on else Color(GridTheme.TEXT, 0.85))

func _draw_stage() -> void:
	var sb := _sbox(380.0); var w := sb.size.x + 60.0; var top := sb.position.y; var bh := sb.size.y
	var g: Dictionary = q.givens; var secs: Array = g.sections
	var gr := Rect2(Vector2(30.0, top), Vector2(minf(w * 0.46, 860.0), bh))
	var lines := [[T("C8_G_LINE") % [int(g.kV), str(g.conductor), WorkOrder.num(float(g.rOhmKm)), WorkOrder.num(float(g.xOhmKm))], Color(GridTheme.TEXT, 0.9)]]
	for s in secs:
		lines.append([T("C8_G_SEC") % [str(s.id), WorkOrder.num(float(s.km)), int(s.customers), WorkOrder.num(float(s.kw)), WorkOrder.num(float(s.kvar)), T("C8_DEV_" + str(s.device))], Color(GridTheme.TEXT, 0.85)])
	lines.append([T("C8_G_FAULTS") % [WorkOrder.num(float(g.lambdaPerKm)), WorkOrder.num(float(g.repairH)), WorkOrder.num(float(g.manualH))], Color(GridTheme.TEXT, 0.85)])
	lines.append([T("C8_G_TASK"), GridTheme.SODIUM]); lines.append([T("C8_G_THINK"), Color(GridTheme.TEXT, 0.6)])
	_lines(gr, T("C8_GIV_CAP"), lines, 12, 8.0)
	# right: the three sections as a line, then the answers
	var rr := Rect2(Vector2(gr.end.x + 12.0, top), Vector2(maxf(w - 30.0 - gr.end.x - 12.0, 300.0), bh)); _card(rr)
	_text(_semi(), 11, rr.position + Vector2(12.0, 20.0), T("C8_DIAG_CAP"), GridTheme.SODIUM)
	var km := 0.0
	for s in secs: km += float(s.km)
	var x0 := rr.position.x + 70.0; var span := rr.size.x - 70.0 - 40.0; var ly := rr.position.y + 90.0; var x := x0
	draw_rect(Rect2(Vector2(rr.position.x + 16.0, ly - 14.0), Vector2(28, 28)), Color(GridTheme.INK).lightened(0.15)); draw_rect(Rect2(Vector2(rr.position.x + 16.0, ly - 14.0), Vector2(28, 28)), GridTheme.SODIUM_DIM, false, 1.5)
	draw_line(Vector2(rr.position.x + 44.0, ly), Vector2(x0, ly), GridTheme.LIVE, 4.0)
	for s in secs:
		var l := span * float(s.km) / km; var a := Vector2(x, ly); var b := Vector2(x + l, ly)
		draw_line(a, b, GridTheme.LIVE, 4.0); draw_circle(b, 6.0, GridTheme.SODIUM)
		_text(_semi(), 11, (a + b) * 0.5 + Vector2(-50.0, -22.0), "%s  %s" % [str(s.id), T("C8_KM") % WorkOrder.num(float(s.km))], GridTheme.TEXT, 100.0, 1)
		_houses((a + b) * 0.5 + Vector2(-30.0, 14.0), int(s.customers), Color(GridTheme.TEXT, 0.55))
		_text(_mono(), 10, (a + b) * 0.5 + Vector2(-60.0, 52.0), T("C8_G_LOAD") % [WorkOrder.num(float(s.kw)), WorkOrder.num(float(s.kvar))], Color(GridTheme.TEXT, 0.7), 120.0, 1)
		var dev := str(s.device)
		if dev != "none":
			var col := GridTheme.COPPER if dev == "manual" else GridTheme.GOOD
			draw_rect(Rect2(a - Vector2(8, 8), Vector2(16, 16)), Color(GridTheme.INK)); draw_rect(Rect2(a - Vector2(8, 8), Vector2(16, 16)), col, false, 2.5); draw_rect(Rect2(a - Vector2(4, 4), Vector2(8, 8)), col)
			_text(_mono(), 10, a + Vector2(-30.0, -14.0), T("C8_DEV_SHORT_" + dev), col, 60.0, 1)
		x += l
	var y := rr.position.y + 190.0
	_text(_semi(), 11, Vector2(rr.position.x + 12.0, y), T("C8_ANS_CAP"), GridTheme.SODIUM); y += 12.0
	for qq in q.questions:
		var id := str(qq.id); y += 34.0
		_text(_mono(), 12, Vector2(rr.position.x + 14.0, y), T("C8_QS_" + id), GridTheme.TEXT)
		var mine = qq.get("predicted")
		_text(_mono(), 12, Vector2(rr.position.x + 14.0, y + 16.0), (T("C8_YOURS") % (WorkOrder.num(float(mine)) + " " + T("C8_U_" + id))) if mine != null else T("C8_NO_GUESS"), Color(GridTheme.TEXT, 0.7))
		if _revealed() and qq.get("actual") != null:
			var ok := bool(qq.get("within5", false)); var err = qq.get("errPct")
			_text(_mono(), 13, Vector2(rr.position.x + 14.0, y + 16.0), (T("C8_ANSWER") % WorkOrder.num(float(qq.actual))) + ("  ✓" if ok else "  ✗") + ((("  " + T("C8_OFF_BY") % WorkOrder.num(float(err)))) if err != null else ""), _good(ok), rr.size.x - 28.0, 2)
		y += 18.0
	var made := 0
	for qq in q.questions: if qq.get("predicted") != null: made += 1
	_text(_mono(), 11, Vector2(rr.position.x + 14.0, rr.end.y - 16.0), T("C8_MADE") % made, _good(made == 3))
