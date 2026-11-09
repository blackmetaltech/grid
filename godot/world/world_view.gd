class_name WorldView
extends Control
## Placeholder world until M2: a night-indigo sky and a plain ground plane (no text). The real diorama replaces this file.
const SKY := Color("#0E1330")
const LAND := Color("#1B2440")
var cover := 0.0
var blocked := false
var title_mode := false

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_PASS
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

func set_cover(px: float) -> void: cover = px; queue_redraw()
func set_blocked(b: bool) -> void: blocked = b
func set_title(on: bool) -> void: title_mode = on; queue_redraw()
func set_camera(_spec: String) -> void: pass

func _draw() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), SKY)
	var y := size.y * 0.62
	draw_polygon(PackedVector2Array([Vector2(0, y), Vector2(size.x, y - size.y * 0.04), Vector2(size.x, size.y), Vector2(0, size.y)]), PackedColorArray([LAND]))
