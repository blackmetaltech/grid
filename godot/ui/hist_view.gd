class_name HistView
extends Control
## Histogram of the result card: the engine's `resultCard` bins, your design's marker and, for a build-cost histogram, the star A / B targets.

var r: Dictionary = {}

func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	custom_minimum_size = Vector2(240, 130)
	size_flags_horizontal = Control.SIZE_EXPAND_FILL

func set_data(q: Dictionary) -> void: r = q; queue_redraw()

func _x(v: float, lo: float, hi: float, x0: float, w: float) -> float: return x0 + w * clampf((v - lo) / maxf(hi - lo, 1e-9), 0.0, 1.0)

func _draw() -> void:
	var bins: Array = r.get("bins", [])
	if bins.is_empty(): return
	var f := CbKit.font_regular(); var fs := CbKit.fs(13)
	var x0 := 6.0; var w := size.x - 12.0; var base := size.y - 22.0; var top := 8.0
	var lo := float(bins[0].from); var hi := float(bins[bins.size() - 1].to)
	var mx := 1
	for b in bins: mx = maxi(mx, int(b.count))
	var bw := w / bins.size()
	for i in bins.size():
		var h := (base - top) * float(int(bins[i].count)) / mx
		draw_rect(Rect2(x0 + i * bw + 1.0, base - h, bw - 2.0, h), Color(CbKit.ACC, 0.75))
	draw_line(Vector2(x0, base), Vector2(x0 + w, base), CbKit.DIM, 1.0)
	draw_string(f, Vector2(x0, size.y - 5.0), CbKit.num(lo, 1), HORIZONTAL_ALIGNMENT_LEFT, -1, fs, CbKit.DIM)
	draw_string(f, Vector2(x0 + w - 70.0, size.y - 5.0), CbKit.num(hi, 1), HORIZONTAL_ALIGNMENT_RIGHT, 70.0, fs, CbKit.DIM)
	if r.get("mine") != null:
		var mx_ := _x(float(r.mine), lo, hi, x0, w)
		draw_line(Vector2(mx_, top), Vector2(mx_, base), CbKit.AM, 3.0)
		draw_string(f, Vector2(clampf(mx_ - 20.0, 0.0, size.x - 44.0), top + 10.0), tr("HIST_YOU"), HORIZONTAL_ALIGNMENT_LEFT, -1, fs, CbKit.AM)
	if str(r.get("histogram", "")) == "capex":
		for pair in [[r.get("starA"), "HIST_STAR_A"], [r.get("starB"), "HIST_STAR_B"]]:
			if pair[0] == null or float(pair[0]) < lo or float(pair[0]) > hi: continue
			var sx := _x(float(pair[0]), lo, hi, x0, w)
			draw_line(Vector2(sx, top + 14.0), Vector2(sx, base), CbKit.GR, 2.0)
			draw_string(f, Vector2(sx + 3.0, top + 24.0), tr(pair[1]), HORIZONTAL_ALIGNMENT_LEFT, -1, fs, CbKit.GR)
