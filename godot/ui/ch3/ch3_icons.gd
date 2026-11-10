class_name Ch3Icons
extends RefCounted
## Chapter 3 tray icons, drawn on the tray's canvas item.

## A series capacitor: a line with two plates in its run (both sides of the gap carry the same current).
static func series(ci: CanvasItem, c: Vector2) -> void:
	var wire := Color("#B9C0C9"); var plate := Color("#E8C547")
	ci.draw_line(Vector2(c.x - 22.0, c.y), Vector2(c.x - 4.0, c.y), wire, 2.0); ci.draw_line(Vector2(c.x + 4.0, c.y), Vector2(c.x + 22.0, c.y), wire, 2.0)
	ci.draw_rect(Rect2(c.x - 6.0, c.y - 14.0, 3.5, 28.0), plate); ci.draw_rect(Rect2(c.x + 2.5, c.y - 14.0, 3.5, 28.0), plate)
	ci.draw_arc(Vector2(c.x - 15.0, c.y - 8.0), 4.0, PI, TAU, 8, GridTheme.COPPER, 1.5)
