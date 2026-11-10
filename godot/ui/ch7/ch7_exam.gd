class_name Ch7Exam
extends Ch7Base
## L27 Exam Bridge: Faults & lambda. Left: the five exam questions (a box each; after the run the engine's answer and a tick or a cross). Right: the grown board's breaker
## rating and tonight's 3-unit dispatch (a box per unit; set them with Enter). Display and input only: the engine marks the exam.
const IDS := ["ps17", "ps18", "ps20", "ps21", "ps24"]
const UNITS := {"ps17": "kA", "ps18": "kA", "ps20": "$/MWh", "ps21": "$/MWh", "ps22": "$/MWh", "ps24": "s"}
var qids: Array = IDS

func _init() -> void:
	super._init(); scenario = "L27"; name = "Ch7Exam"
	for k in IDS: _edit(k)
	for k in 3: _edit("p%d" % k)

func _submit(key: String) -> void:
	if key.begins_with("p"):
		var v := []
		for k in 3:
			var t: String = (edits["p%d" % k] as LineEdit).text.strip_edges().replace(",", ".")
			if not t.is_valid_float(): return
			v.append(float(t))
		var cur: Array = q.design.dispatch
		if is_equal_approx(float(cur[0]), v[0]) and is_equal_approx(float(cur[1]), v[1]) and is_equal_approx(float(cur[2]), v[2]): return
		if not _locked(): _act("setDispatch3", v)
	else: _predict_submit(key, key, str(UNITS[key]))

func _after_refresh() -> void:
	for k in IDS: _sync_predict(k, k)
	for k in 3:
		var e: LineEdit = edits["p%d" % k]; e.visible = true; e.editable = not _locked()
		if not e.has_focus(): e.text = WorkOrder.num(float(q.design.dispatch[k]))

func _layout_panel() -> void:
	var inner := Rect2(panel.position + Vector2(12.0, 8.0), panel.size - Vector2(24.0, 16.0)); var rs := []; var ra := []
	for r in kit.get("ratings", []): rs.append(WorkOrder.num(float(r.kA))); ra.append(float(r.kA))
	_chip_row(inner.position.x, inner.position.y + 20.0, 56.0, 40.0, 5.0, rs, "rating", ra, q.design.rating)
	for k in 3:
		var e: LineEdit = edits["p%d" % k]; e.position = Vector2(inner.position.x + 340.0 + 90.0 * k, inner.position.y + 26.0); e.size = Vector2(80, 30)

func _press(h: Dictionary, _p: Vector2) -> void:
	if str(h.id) == "rating": _act("setBreakerRating", [float(h.arg)])

func _draw_panel_body() -> void:
	var inner := Rect2(panel.position + Vector2(12.0, 8.0), panel.size - Vector2(24.0, 16.0))
	_text(_semi(), 10, inner.position + Vector2(0, 12), T("C7_BREAKERS"), Color(GridTheme.TEXT, 0.65)); _text(_semi(), 10, inner.position + Vector2(340, 12), T("C7_DISPATCH_CAP"), Color(GridTheme.TEXT, 0.65))
	var s := 0.0
	for k in 3: s += float(q.design.dispatch[k])
	_text(_mono(), 12, inner.position + Vector2(340, 84), T("C7_DISPATCH_SUM") % [WorkOrder.num(s), int(q.demandMW)], Color(GridTheme.TEXT, 0.8))
	if _revealed():
		_text(_mono(), 12, inner.position + Vector2(0, 84), T("C7_BOARD_KA") % [WorkOrder.num(float(q.boardKA.threePh)), WorkOrder.num(float(q.boardKA.slg))], _good(bool(q.ratingOk)))

func _draw_stage() -> void:
	var w := size.x; var top := 150.0; var bh := maxf(panel.position.y - top - 14.0, 240.0)
	var r := Rect2(Vector2(30.0, top), Vector2(minf(w - 60.0, 760.0), bh)); draw_style_box(GridTheme.ink_sb(0.82, 10, 0.0), r)
	_text(_semi(), 12, r.position + Vector2(14, 22), T("C7_EXAM"), Color(GridTheme.TEXT, 0.75))
	var y := r.position.y + 46.0; var i := 0
	for qq in q.questions:
		var id := str(qq.id)
		_text(_mono(), 12, Vector2(r.position.x + 14, y + 20), T("C7_Q_" + id), GridTheme.TEXT)
		if edits.has(id):
			var e: LineEdit = edits[id]; e.position = Vector2(r.position.x + 330, y + 2); e.size = Vector2(90, 30)
		if _revealed() and qq.get("actual") != null:
			var ok := bool(qq.get("within", false)); _text(_mono(), 13, Vector2(r.position.x + 440, y + 20), (T("C7_ANSWER") % WorkOrder.num(float(qq.actual))) + ("  ✓" if ok else "  ✗"), _good(ok))
		y += 40.0; i += 1
