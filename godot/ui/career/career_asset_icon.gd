class_name CareerAssetIcon
extends Control
## 1.14 a small picture of the asset on its board card (coordinator: "the board is a list of identical rows"): a wooden pole with its crossarm and spans,
## a cable joint in its trench, a primary transformer with its fins and bushings, or a switchboard. The ink of the thing is its health colour.

var kind := "pole"     ## "pole" | "joint" | "tx" | "switchgear"
var col := Color.WHITE

func _init() -> void:
	custom_minimum_size = Vector2(52, 52); mouse_filter = Control.MOUSE_FILTER_IGNORE

func _draw() -> void:
	var s := size; var c := s * 0.5
	var ink := Color("#2A2418")
	draw_rect(Rect2(Vector2(2, 2), s - Vector2(4, 4)), Color("#DCD2B8")); draw_rect(Rect2(Vector2(2, 2), s - Vector2(4, 4)), Color(ink, 0.4), false, 1.0)
	match kind:
		"pole":
			draw_line(Vector2(c.x, 10), Vector2(c.x, s.y - 6), Color("#7A5A36"), 4.0)
			draw_line(Vector2(c.x - 15, 15), Vector2(c.x + 15, 15), Color("#7A5A36"), 3.0)
			for dx in [-12.0, 0.0, 12.0]: draw_circle(Vector2(c.x + dx, 13), 2.5, ink)
			draw_polyline(PackedVector2Array([Vector2(4, 18), Vector2(c.x - 12, 13)]), col, 2.0, true)
			draw_polyline(PackedVector2Array([Vector2(c.x + 12, 13), Vector2(s.x - 4, 18)]), col, 2.0, true)
		"joint":
			draw_rect(Rect2(Vector2(4, c.y - 2), Vector2(s.x - 8, s.y * 0.5 - 4)), Color("#8A7A5E"))   # the trench in section
			draw_line(Vector2(4, c.y + 8), Vector2(s.x - 4, c.y + 8), col, 4.0)
			draw_rect(Rect2(Vector2(c.x - 9, c.y + 3), Vector2(18, 10)), ink)   # the joint shell
			draw_line(Vector2(4, c.y - 2), Vector2(s.x - 4, c.y - 2), Color("#4A4A4A"), 3.0)   # the road above
		"tx":
			draw_rect(Rect2(Vector2(c.x - 14, 16), Vector2(28, 26)), Color("#6E7884"))
			for k in 5: draw_line(Vector2(c.x - 12 + k * 6, 18), Vector2(c.x - 12 + k * 6, 40), Color("#4A525C"), 1.5)   # cooling fins
			for dx in [-8.0, 0.0, 8.0]: draw_line(Vector2(c.x + dx, 16), Vector2(c.x + dx, 8), col, 3.0)   # bushings
			draw_line(Vector2(6, s.y - 6), Vector2(s.x - 6, s.y - 6), ink, 2.0)
		_:
			draw_rect(Rect2(Vector2(c.x - 18, 10), Vector2(36, 34)), Color("#7C8490"))
			for k in 3:
				draw_rect(Rect2(Vector2(c.x - 15 + k * 11, 14), Vector2(8, 26)), Color("#5A626E"))
				draw_circle(Vector2(c.x - 11 + k * 11, 20), 2.0, col)
