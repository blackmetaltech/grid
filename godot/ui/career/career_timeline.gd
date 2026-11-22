class_name CareerTimeline
extends Control
## The ten-year strip: forty quarter pips (spent ones filled, the current one ringed in sodium), a diamond on every fourth for the annual review (green / red once judged). Hover tooltips name the quarter.

var d: Dictionary = {}
var compact := false

func _init() -> void:
	name = "CareerTimeline"; mouse_filter = Control.MOUSE_FILTER_PASS; custom_minimum_size = Vector2(300, 30)

func set_data(data: Dictionary) -> void:
	d = data; queue_redraw()

## 1.10: a wall planner on the paper strip: ten year columns, four quarter boxes each. Spent quarters are crossed through in ink, the
## current one is circled in red pen, the review box at the end of each year gets a tick (met) or a cross (missed).
const INK := Color("#2A2418"); const PEN := Color("#B03A2E"); const OK := Color("#2F6B2A")

func _geom() -> Dictionary:
	var n := int(d.get("quarters", 40)); var years := maxi(1, n / 4)
	var col := (size.x - 4.0) / float(years)
	return {"n": n, "years": years, "col": col, "x0": 2.0, "box": minf((col - 10.0) / 4.0, size.y - 22.0)}

func _box_r(q: int, g: Dictionary) -> Rect2:
	var yr := q / 4; var k := q % 4; var bw := float(g.box)
	var x := float(g.x0) + yr * float(g.col) + 4.0 + k * (bw + 0.6)
	return Rect2(Vector2(x, size.y - bw - 2.0), Vector2(bw, bw))

func _met_of(year: int) -> int:
	for r in d.get("reviews", []):
		if int(r.year) == year: return 1 if bool(r.met) else 0
	return -1

func _draw() -> void:
	if d.is_empty(): return
	var g := _geom(); var n: int = g.n; var t := int(d.get("t", 0)); var ended := d.get("ending") != null
	var f := GridTheme.font("semi")
	for y in int(g.years):
		var x := float(g.x0) + y * float(g.col)
		GridText.ds(self, f, Vector2(x + 4.0, 15.0), "Y%d" % (y + 1), HORIZONTAL_ALIGNMENT_LEFT, -1, GridTheme.fs(13), Color(INK, 0.75))
		if y > 0: draw_line(Vector2(x, 2.0), Vector2(x, size.y - 2.0), Color(INK, 0.25), 1.0)
	for q in n:
		var r := _box_r(q, g); var review := q % 4 == 3
		var past := q < t or (ended and q <= t)
		draw_rect(r, Color(INK, 0.06 if not review else 0.12)); draw_rect(r, Color(INK, 0.45), false, 1.0)
		if past and not review: draw_line(r.position + Vector2(2, r.size.y - 2), r.end - Vector2(2, r.size.y - 2), Color(INK, 0.7), 1.5)
		if review:
			var m := _met_of(q / 4 + 1)
			if m == 1: draw_polyline(PackedVector2Array([r.position + r.size * Vector2(0.2, 0.55), r.position + r.size * Vector2(0.42, 0.8), r.position + r.size * Vector2(0.85, 0.2)]), OK, 2.5, true)
			elif m == 0:
				draw_line(r.position + r.size * 0.2, r.position + r.size * 0.8, PEN, 2.5); draw_line(r.position + r.size * Vector2(0.8, 0.2), r.position + r.size * Vector2(0.2, 0.8), PEN, 2.5)
		if q == t and not ended: draw_arc(r.get_center(), r.size.x * 0.72, 0, TAU, 24, PEN, 2.5, true)

func _get_tooltip(at: Vector2) -> String:
	if d.is_empty(): return ""
	var g := _geom(); var yr0 := clampi(int((at.x - float(g.x0)) / float(g.col)), 0, int(g.years) - 1)
	var q := clampi(yr0 * 4 + int((at.x - float(g.x0) - yr0 * float(g.col) - 4.0) / maxf(1.0, float(g.box))), 0, int(g.n) - 1); var yr := q / 4 + 1
	if q % 4 == 3:
		var m := _met_of(yr)
		if m == 1: return TranslationServer.translate("CAR_PIP_MET") % yr
		if m == 0: return TranslationServer.translate("CAR_PIP_MISSED") % yr
		return TranslationServer.translate("CAR_PIP_REVIEW") % yr
	return TranslationServer.translate("CAR_PIP_Q") % [yr, q % 4 + 1]
