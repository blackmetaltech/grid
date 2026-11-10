class_name PhasorView
extends Control
## Phasor mini-diagram: V (white) and I (cyan) from the engine's `phasor` query, the phi arc and the lagging/leading word. `rot_deg` rotates the
## whole diagram (the design's slowly turning phasor); it never changes the angle between the arrows. `arrows()` is what the drawing uses, so the
## phasor-truth test reads the same numbers.

var d: Dictionary = {}
var rot_deg := 0.0
var spin := true

func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	custom_minimum_size = Vector2(220, 200)
	spin = not (OS.has_environment("CB_SHOT") or OS.has_environment("CB_SMOKE") or CbSettings.reduced_motion)

func set_data(q: Dictionary) -> void: d = q; queue_redraw()

func radius() -> float: return minf(size.x, size.y) * 0.5 - 22.0
func centre() -> Vector2: return size * 0.5
func arrows() -> Dictionary: return PhasorMath.arrows(d, radius(), rot_deg)

func _process(dt: float) -> void:
	if spin and not d.is_empty() and is_visible_in_tree(): rot_deg = fposmod(rot_deg + 36.0 * dt, 360.0); queue_redraw()

func _head(from: Vector2, to: Vector2, col: Color, w: float) -> void:
	draw_line(from, to, col, w, true)
	var u := (to - from).normalized()
	if (to - from).length() < 4.0: return
	var n := Vector2(-u.y, u.x)
	draw_colored_polygon(PackedVector2Array([to, to - u * 11.0 + n * 5.0, to - u * 11.0 - n * 5.0]), col)

func _draw() -> void:
	var c := centre(); var r := radius()
	draw_arc(c, r, 0.0, TAU, 48, CbKit.LINE, 1.5, true)
	draw_arc(c, r * 0.5, 0.0, TAU, 40, Color(CbKit.LINE, 0.5), 1.0, true)
	if d.is_empty() or d.get("error", false): return
	var a := arrows()
	var f := CbKit.font_bold(); var fs := CbKit.fs(14)
	# the phi arc, between V and I, inside the shorter arrow
	var av := deg_to_rad(PhasorMath.angle_of(a.v)); var ai := deg_to_rad(PhasorMath.angle_of(a.i))
	var rr := minf(r * 0.34, minf((a.v as Vector2).length(), maxf((a.i as Vector2).length(), 8.0)) * 0.8)
	var diff := ai - av
	while diff > PI: diff -= TAU
	while diff < -PI: diff += TAU
	if absf(diff) > 0.01 and (a.i as Vector2).length() > 3.0: draw_arc(c, rr, -av, -av - diff, 24, CbKit.AM, 2.0, true)
	_head(c, c + (a.v as Vector2), CbKit.TX, 3.0)
	_head(c, c + (a.i as Vector2), Color("#39E1FF"), 3.0)
	draw_string(f, c + (a.v as Vector2) + PhasorMath.dir(PhasorMath.angle_of(a.v)) * 12.0 + Vector2(-4, 5), tr("PHASOR_V"), HORIZONTAL_ALIGNMENT_LEFT, -1, fs, CbKit.TX)
	draw_string(f, c + (a.i as Vector2) + PhasorMath.dir(PhasorMath.angle_of(a.i)) * 12.0 + Vector2(-4, 5), tr("PHASOR_I"), HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color("#39E1FF"))
