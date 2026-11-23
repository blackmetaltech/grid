class_name CareerHealthGauge
extends HBoxContainer
## 1.14 an asset's health on its board card: ten cells filled to the health (red under 3, amber under 6, green above) and the number beside them.

var health := 10.0

class Cells extends Control:
	var health := 10.0
	func _init() -> void:
		custom_minimum_size = Vector2(110, 12); mouse_filter = Control.MOUSE_FILTER_IGNORE; size_flags_vertical = Control.SIZE_SHRINK_CENTER
	func _draw() -> void:
		var w := (size.x - 9.0 * 2.0) / 10.0
		for k in 10:
			var r := Rect2(Vector2(k * (w + 2.0), 0), Vector2(w, size.y))
			var fill := clampf(health - float(k), 0.0, 1.0)
			draw_rect(r, Color(1, 1, 1, 0.12) if CareerKit.glass() else Color("#2A2418", 0.18))
			if fill > 0.0: draw_rect(Rect2(r.position, Vector2(w * fill, size.y)), CareerKit.health_col(health))

func _ready() -> void:
	add_theme_constant_override("separation", 8)
	var c := Cells.new(); c.health = health; add_child(c)
	add_child(CareerKit.lbl(TranslationServer.translate("CAR_GAUGE_HEALTH") % CareerKit.num(health, 1), 16, GridTheme.TEXT, "mono"))
