class_name CareerBar
extends Control
## A SAIDI / SAIFI readout: caption, "so far / target", and a bar with the target tick and the expected-for-the-year marker. Green under 80 % of the target, amber to the target, red past it.

var caption := ""
var ytd := 0.0
var target := 1.0
var expected := 0.0
var dec := 1
var compact := false
var ink := GridTheme.TEXT   ## caption / track colour (paper ink on the sheets)

func _init() -> void:
	name = "CareerBar"; mouse_filter = Control.MOUSE_FILTER_PASS; custom_minimum_size = Vector2(210, 40)

func set_vals(cap: String, y: float, tg: float, ex: float, decimals: int) -> void:
	caption = cap; ytd = y; target = tg; expected = ex; dec = decimals
	tooltip_text = "%s, %s, %s" % [TranslationServer.translate("CAR_SOFAR") % CareerKit.num(y, decimals), TranslationServer.translate("CAR_TARGET") % CareerKit.num(tg, decimals), TranslationServer.translate("CAR_EXPECTED") % CareerKit.num(ex, decimals)]
	queue_redraw()

func _draw() -> void:
	var f := GridTheme.font("mono"); var fb := GridTheme.font("semi")
	var fz := GridTheme.fs(13); var fz2 := GridTheme.fs(15 if not compact else 14)
	# 1.10: the caption is in plain words now ("Minutes off per customer (SAIDI) / target"): it wraps by words to the bar's width, and the
	# value sits at the right of the last caption line when it fits, else on a line of its own
	var fzf := GridText.floor_size(self, fz)
	var lines: Array = []; var cur := ""
	for w in caption.split(" "):
		var t2 := w if cur == "" else cur + " " + w
		if cur != "" and f.get_string_size(t2, HORIZONTAL_ALIGNMENT_LEFT, -1, fzf).x > size.x: lines.append(cur); cur = w
		else: cur = t2
	if cur != "": lines.append(cur)
	var tx := "%s / %s" % [CareerKit.num(ytd, dec), CareerKit.num(target, dec)]
	var col := GridTheme.GOOD if ytd < target * 0.8 else (GridTheme.WARN if ytd <= target else GridTheme.BAD)
	if ink.v < 0.3: col = CareerKit.INK_GOOD if ytd < target * 0.8 else (CareerKit.INK_WARN if ytd <= target else CareerKit.INK_BAD)   # on the paper planner
	var fz2f := GridText.floor_size(self, fz2)
	var ts := fb.get_string_size(tx, HORIZONTAL_ALIGNMENT_LEFT, -1, fz2f)
	var lh := float(fzf) + 3.0
	for i in lines.size(): GridText.ds(self, f, Vector2(0, fzf + i * lh), str(lines[i]), HORIZONTAL_ALIGNMENT_LEFT, -1, fz, Color(ink, 0.62))
	var last_w := f.get_string_size(str(lines.back()) if not lines.is_empty() else "", HORIZONTAL_ALIGNMENT_LEFT, -1, fzf).x
	var inline := last_w + 12.0 + ts.x <= size.x
	var vy := fzf + (lines.size() - 1) * lh if inline else fzf + lines.size() * lh + 2.0
	GridText.ds(self, fb, Vector2(size.x - ts.x, vy), tx, HORIZONTAL_ALIGNMENT_LEFT, -1, fz2, col)
	var want_h := vy + 22.0
	if absf(custom_minimum_size.y - want_h) > 0.5: custom_minimum_size.y = want_h
	var mx := maxf(maxf(target, expected), ytd) * 1.12
	var by := size.y - 12.0; var bh := 7.0
	draw_rect(Rect2(0, by, size.x, bh), Color(ink, 0.12))
	draw_rect(Rect2(0, by, size.x * clampf(ytd / mx, 0.0, 1.0), bh), col)
	var gx := size.x * clampf(target / mx, 0.0, 1.0)
	draw_line(Vector2(gx, by - 4.0), Vector2(gx, by + bh + 3.0), ink, 2.0)
	var ex := size.x * clampf(expected / mx, 0.0, 1.0)
	draw_colored_polygon(PackedVector2Array([Vector2(ex - 5.0, by - 8.0), Vector2(ex + 5.0, by - 8.0), Vector2(ex, by - 1.0)]), GridTheme.SODIUM)
