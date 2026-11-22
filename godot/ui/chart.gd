class_name GridChart
extends Control
## A small line chart of one history column (timeline drawer): auto range, a marker for events and a cursor for the scrubber.

var ys: Array = []
var title := ""
var col := Color("#39E1FF")
var dec := 2
var peg := false          ## the range is exactly lo_fixed..hi_fixed and points outside it sit on the edge (a runaway frequency pegs, like the dial's needle)
var lo_fixed := NAN
var hi_fixed := NAN
var marks: Array = []      ## indices of history entries with an event
var cursor := -1
var guide: Array = []      ## horizontal guide values (e.g. the standard frequency range)

func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	custom_minimum_size = Vector2(240, 120)
	size_flags_horizontal = Control.SIZE_EXPAND_FILL

func _range() -> Vector2:
	if peg and not is_nan(lo_fixed) and not is_nan(hi_fixed): return Vector2(lo_fixed, hi_fixed)
	var lo := INF; var hi := -INF
	for y in ys: lo = minf(lo, float(y)); hi = maxf(hi, float(y))
	for g in guide: lo = minf(lo, float(g)); hi = maxf(hi, float(g))
	if not is_nan(lo_fixed): lo = minf(lo, lo_fixed)
	if not is_nan(hi_fixed): hi = maxf(hi, hi_fixed)
	if lo == INF: return Vector2(0, 1)
	if hi - lo < 1e-6: lo -= 0.5; hi += 0.5
	var pad := (hi - lo) * 0.08
	return Vector2(lo - pad, hi + pad)

func _draw() -> void:
	var f := CbKit.font_regular(); var fs := CbKit.fs(13)
	var left := 46.0; var top := 18.0; var w := size.x - left - 6.0; var h := size.y - top - 6.0
	GridText.ds(self, f, Vector2(2, 12), title, HORIZONTAL_ALIGNMENT_LEFT, size.x - 4.0, fs, CbKit.DIM)
	draw_rect(Rect2(left, top, w, h), Color(CbKit.DEEP, 0.6))
	if ys.size() < 2: return
	var rg := _range()
	var px := func(i: int) -> float: return left + w * float(i) / float(ys.size() - 1)
	var py := func(y: float) -> float: return top + h * (1.0 - (y - rg.x) / (rg.y - rg.x))
	for g in guide: draw_line(Vector2(left, py.call(float(g))), Vector2(left + w, py.call(float(g))), Color(CbKit.GR, 0.6), 1.0)
	var pts := PackedVector2Array()
	for i in ys.size(): pts.append(Vector2(px.call(i), py.call(clampf(float(ys[i]), rg.x, rg.y) if peg else float(ys[i]))))
	draw_polyline(pts, col, 2.0, true)
	GridText.ds(self, f, Vector2(2, top + 10.0), ("%." + str(dec) + "f") % rg.y, HORIZONTAL_ALIGNMENT_LEFT, left - 4.0, fs, CbKit.DIM)
	GridText.ds(self, f, Vector2(2, top + h), ("%." + str(dec) + "f") % rg.x, HORIZONTAL_ALIGNMENT_LEFT, left - 4.0, fs, CbKit.DIM)
	for m in marks: draw_line(Vector2(px.call(int(m)), top), Vector2(px.call(int(m)), top + h), CbKit.RD, 2.0)
	if cursor >= 0 and cursor < ys.size():
		draw_line(Vector2(px.call(cursor), top), Vector2(px.call(cursor), top + h), CbKit.AM, 2.0)
		draw_circle(pts[cursor], 4.0, CbKit.AM)
