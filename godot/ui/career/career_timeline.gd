class_name CareerTimeline
extends Control
## The ten-year strip: forty quarter pips (spent ones filled, the current one ringed in sodium), a diamond on every fourth for the annual review (green / red once judged). Hover tooltips name the quarter.

var d: Dictionary = {}
var compact := false

func _init() -> void:
	name = "CareerTimeline"; mouse_filter = Control.MOUSE_FILTER_PASS; custom_minimum_size = Vector2(300, 30)

func set_data(data: Dictionary) -> void:
	d = data; queue_redraw()

func _geom() -> Dictionary:
	var n := int(d.get("quarters", 40)); var w := size.x - 8.0
	var pitch := w / float(n)
	return {"n": n, "pitch": pitch, "x0": 4.0}

func _pip_c(q: int, g: Dictionary) -> Vector2:
	var extra := float(q / 4) * 0.0   # evenly spaced; the diamonds mark the years
	return Vector2(float(g.x0) + (float(q) + 0.5) * float(g.pitch) + extra, size.y * 0.42)

func _met_of(year: int) -> int:
	for r in d.get("reviews", []):
		if int(r.year) == year: return 1 if bool(r.met) else 0
	return -1

func _draw() -> void:
	if d.is_empty(): return
	var g := _geom(); var n: int = g.n; var t := int(d.get("t", 0)); var ended := d.get("ending") != null
	var pr := float(g.pitch) * 0.30
	var f := GridTheme.font("mono"); var fz := GridTheme.fs(12)
	draw_line(Vector2(float(g.x0), size.y * 0.42), Vector2(float(g.x0) + float(g.pitch) * n, size.y * 0.42), Color(GridTheme.SODIUM_DIM, 0.25), 2.0)
	for q in n:
		var c := _pip_c(q, g); var yr := q / 4 + 1; var review := q % 4 == 3
		var past := q < t or (ended and q <= t)
		if review:
			var m := _met_of(yr); var r := pr * 1.5 + 2.0
			var col := GridTheme.GOOD if m == 1 else (GridTheme.BAD if m == 0 else Color(GridTheme.SODIUM, 0.8))
			var pts := PackedVector2Array([c + Vector2(0, -r), c + Vector2(r, 0), c + Vector2(0, r), c + Vector2(-r, 0)])
			if m >= 0: draw_colored_polygon(pts, col)
			else: draw_colored_polygon(pts, Color(col, 0.12))
			draw_polyline(PackedVector2Array([pts[0], pts[1], pts[2], pts[3], pts[0]]), col, 2.0, true)
		else:
			if past: draw_circle(c, pr, Color(GridTheme.SODIUM_DIM, 0.95))
			else: draw_arc(c, pr, 0, TAU, 12, Color(GridTheme.DIM, 0.55), 1.4, true)
		if q == t and not ended:
			draw_arc(c, pr * 1.9 + 1.5, 0, TAU, 24, GridTheme.SODIUM, 3.0, true)
			draw_circle(c, pr * 1.1, GridTheme.SODIUM)
		if q % 4 == 0 and float(g.pitch) >= 11.0:
			GridText.ds(self, f, Vector2(c.x - float(g.pitch) * 0.3, size.y - 3.0), "Y%d" % yr if float(g.pitch) >= 17.0 else str(yr), HORIZONTAL_ALIGNMENT_LEFT, -1, fz, Color(GridTheme.TEXT, 0.6))

func _get_tooltip(at: Vector2) -> String:
	if d.is_empty(): return ""
	var g := _geom(); var q := clampi(int((at.x - float(g.x0)) / float(g.pitch)), 0, int(g.n) - 1); var yr := q / 4 + 1
	if q % 4 == 3:
		var m := _met_of(yr)
		if m == 1: return TranslationServer.translate("CAR_PIP_MET") % yr
		if m == 0: return TranslationServer.translate("CAR_PIP_MISSED") % yr
		return TranslationServer.translate("CAR_PIP_REVIEW") % yr
	return TranslationServer.translate("CAR_PIP_Q") % [yr, q % 4 + 1]
