class_name Ch7Base
extends Ch4Base
## Chapter 7's stages share this base (it reuses chapter 4's stage plumbing: opaque stage, bottom panel, chips, lock while the clock runs): prediction boxes and
## log/linear plots. Display and input only: every number is the engine's `ch7Study`, every change an engine action.
var edits := {}        ## key -> LineEdit
var plot := {}         ## the last frame drawn by _frame(): rect, lims, logs

func _init() -> void:
	super._init()
	GridUi.load_strings()

func _edit(key: String, w := 78.0) -> LineEdit:
	var e := LineEdit.new(); e.placeholder_text = "?"; e.custom_minimum_size = Vector2(w, 30); e.size = Vector2(w, 30); e.alignment = HORIZONTAL_ALIGNMENT_RIGHT; e.visible = false
	e.text_submitted.connect(func(_s): _submit(key)); e.focus_exited.connect(func(): _submit(key)); add_child(e); edits[key] = e
	return e

## What a box sends (the subclass says how: predict, or a setting built from several boxes).
func _submit(_key: String) -> void: pass

func _predict_submit(key: String, qid: String, unit: String) -> void:
	var e: LineEdit = edits[key]; var txt := e.text.strip_edges().replace(",", ".")
	if txt == "" or not txt.is_valid_float() or _locked(): return
	var cur = q.get("predictions", {}).get(qid)
	if cur != null and is_equal_approx(float(cur), float(txt)): return
	_act("predict", [qid, float(txt), unit])

func _sync_predict(key: String, qid: String) -> void:
	var e: LineEdit = edits[key]; e.visible = true; e.editable = not _locked()
	var cur = q.get("predictions", {}).get(qid)
	if not e.has_focus() and cur != null: e.text = WorkOrder.num(float(cur))

func refresh(st: Dictionary, k: Dictionary) -> void:
	super.refresh(st, k)
	_after_refresh()

func _after_refresh() -> void: pass
func _revealed() -> bool: return bool(q.get("revealed", false))

# ---- plots ----------------------------------------------------------------------------------------------------------------------
func _frame(r: Rect2, xlo: float, xhi: float, ylo: float, yhi: float, logx: bool, logy: bool, xcap := "", ycap := "") -> void:
	plot = {"r": r, "xlo": xlo, "xhi": xhi, "ylo": ylo, "yhi": yhi, "lx": logx, "ly": logy}
	draw_style_box(GridTheme.ink_sb(0.82, 10, 0.0), r)
	var inner := r.grow(-10.0); plot["r"] = Rect2(inner.position + Vector2(34, 6), inner.size - Vector2(42, 28)); var pr: Rect2 = plot.r
	draw_rect(pr, Color(GridTheme.NIGHT, 0.6)); draw_rect(pr, Color(GridTheme.SODIUM_DIM, 0.35), false, 1.0)
	var xs: Array = _ticks(xlo, xhi, logx); var ys: Array = _ticks(ylo, yhi, logy)
	for v in xs:
		var p := _pt(float(v), ylo); draw_line(Vector2(p.x, pr.position.y), Vector2(p.x, pr.end.y), Color(GridTheme.TEXT, 0.08), 1.0)
		_text(_mono(), 9, Vector2(p.x - 18.0, pr.end.y + 12.0), WorkOrder.num(float(v)), Color(GridTheme.TEXT, 0.6), 36.0, 1)
	for v in ys:
		var p := _pt(xlo, float(v)); draw_line(Vector2(pr.position.x, p.y), Vector2(pr.end.x, p.y), Color(GridTheme.TEXT, 0.08), 1.0)
		_text(_mono(), 9, Vector2(r.position.x + 4.0, p.y + 3.0), WorkOrder.num(float(v)), Color(GridTheme.TEXT, 0.6), 34.0, 2)
	if xcap != "": _text(_mono(), 10, Vector2(pr.position.x, r.end.y - 2.0), xcap, Color(GridTheme.TEXT, 0.55), pr.size.x, 2)
	if ycap != "": _text(_semi(), 10, Vector2(r.position.x + 40.0, r.position.y + 14.0), ycap, Color(GridTheme.TEXT, 0.7))

func _ticks(lo: float, hi: float, lg: bool) -> Array:
	var out := []
	if lg:
		var e := floorf(log(lo) / log(10.0))
		while pow(10.0, e) <= hi * 1.001:
			for m in [1.0, 2.0, 5.0]:
				var v: float = m * pow(10.0, e)
				if v >= lo * 0.999 and v <= hi * 1.001: out.append(v)
			e += 1.0
	else:
		var step := (hi - lo) / 5.0; var mag := pow(10.0, floorf(log(step) / log(10.0))); step = ceilf(step / mag) * mag
		var v := ceilf(lo / step) * step
		while v <= hi + 1e-9: out.append(v); v += step
	return out

func _pt(x: float, y: float) -> Vector2:
	var r: Rect2 = plot.r
	var fx := (log(maxf(x, 1e-9)) - log(float(plot.xlo))) / (log(float(plot.xhi)) - log(float(plot.xlo))) if bool(plot.lx) else (x - float(plot.xlo)) / (float(plot.xhi) - float(plot.xlo))
	var fy := (log(maxf(y, 1e-9)) - log(float(plot.ylo))) / (log(float(plot.yhi)) - log(float(plot.ylo))) if bool(plot.ly) else (y - float(plot.ylo)) / (float(plot.yhi) - float(plot.ylo))
	return Vector2(r.position.x + clampf(fx, -0.05, 1.05) * r.size.x, r.end.y - clampf(fy, -0.05, 1.05) * r.size.y)

func _poly(pts: Array, col: Color, wd := 2.0) -> void:
	var a := PackedVector2Array()
	for p in pts: a.append(_pt(float(p[0]), float(p[1])))
	if a.size() > 1: draw_polyline(a, col, wd, true)

var rows: Array = []   ## chip rows recorded by _layout_panel, drawn after the panel body

func layout() -> void:
	rows.clear()
	super.layout()

func _chip_row(x: float, y: float, w: float, h: float, gap: float, labels: Array, id: String, args: Array, on_arg) -> void:
	for k in labels.size():
		var r := Rect2(Vector2(x + (w + gap) * k, y), Vector2(w, h)); _add_chip(r, id, args[k])
		rows.append({"r": r, "label": str(labels[k]), "on": str(args[k]) == str(on_arg), "id": id, "arg": args[k]})

func _draw_panel() -> void:
	super._draw_panel()
	for c in rows: _chip(c.r, c.label, "", c.on, c.id, c.arg)
