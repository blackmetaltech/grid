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
	draw_string(f, Vector2(0, fz), caption, HORIZONTAL_ALIGNMENT_LEFT, -1, fz, Color(ink, 0.62))
	var tx := "%s / %s" % [CareerKit.num(ytd, dec), CareerKit.num(target, dec)]
	var col := GridTheme.GOOD if ytd < target * 0.8 else (GridTheme.WARN if ytd <= target else GridTheme.BAD)
	var ts := fb.get_string_size(tx, HORIZONTAL_ALIGNMENT_LEFT, -1, fz2)
	draw_string(fb, Vector2(size.x - ts.x, fz2), tx, HORIZONTAL_ALIGNMENT_LEFT, -1, fz2, col)
	var mx := maxf(maxf(target, expected), ytd) * 1.12
	var by := size.y - 12.0; var bh := 7.0
	draw_rect(Rect2(0, by, size.x, bh), Color(ink, 0.12))
	draw_rect(Rect2(0, by, size.x * clampf(ytd / mx, 0.0, 1.0), bh), col)
	var gx := size.x * clampf(target / mx, 0.0, 1.0)
	draw_line(Vector2(gx, by - 4.0), Vector2(gx, by + bh + 3.0), ink, 2.0)
	var ex := size.x * clampf(expected / mx, 0.0, 1.0)
	draw_colored_polygon(PackedVector2Array([Vector2(ex - 5.0, by - 8.0), Vector2(ex + 5.0, by - 8.0), Vector2(ex, by - 1.0)]), GridTheme.SODIUM)
