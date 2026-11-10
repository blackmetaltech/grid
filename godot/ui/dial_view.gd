class_name DialView
extends Control
## The analogue frequency dial (HUD). The scale is DialMath's piecewise map; the needle eases toward the engine's frequency, and `snap` jumps it
## (tests, first draw). `needle_deg` is the angle actually drawn; `target_deg` the angle the engine's f maps to.

var q: Dictionary = {}          ## the engine `dial` query
var f := 50.0
var f0 := 50.0
var needle_deg := 0.0
var target_deg := 0.0
var _have := false

func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	custom_minimum_size = Vector2(112, 84)

func set_query(d: Dictionary, instant := false) -> void:
	q = d; f = float(d.fHz); f0 = float(d.f0)
	target_deg = DialMath.angle_deg(f, f0)
	if instant or not _have or CbSettings.reduced_motion: needle_deg = target_deg
	_have = true
	queue_redraw()

func snap(d: Dictionary) -> void: set_query(d, true)

func _process(dt: float) -> void:
	if not _have or is_equal_approx(needle_deg, target_deg): return
	needle_deg = lerpf(needle_deg, target_deg, 1.0 - exp(-dt * 9.0))
	if absf(needle_deg - target_deg) < 0.05: needle_deg = target_deg
	queue_redraw()

func _pt(c: Vector2, r: float, deg: float) -> Vector2:   # degrees clockwise from 12 o'clock
	return c + Vector2(sin(deg_to_rad(deg)), -cos(deg_to_rad(deg))) * r

func _arc(c: Vector2, r: float, a0: float, a1: float, col: Color, w: float) -> void:
	var n := maxi(4, int(absf(a1 - a0) / 4.0))
	var pts := PackedVector2Array()
	for i in n + 1: pts.append(_pt(c, r, lerpf(a0, a1, float(i) / n)))
	draw_polyline(pts, col, w, true)

func _draw() -> void:
	if not _have: return
	var r := minf(size.x * 0.5, size.y / 1.5) - 3.0
	var c := Vector2(size.x * 0.5, r + 3.0)
	_arc(c, r, DialMath.START_DEG, DialMath.START_DEG + DialMath.SWEEP_DEG, CbKit.LINE, 7.0)
	# the pack's standard range, painted green
	_arc(c, r, DialMath.angle_deg(float(q.stdLo), f0), DialMath.angle_deg(float(q.stdHi), f0), CbKit.GR, 7.0)
	# danger ends: below the first UFLS stage and above the generator over-frequency trip
	var st: Array = q.get("uflsHz", [])
	if not st.is_empty(): _arc(c, r, DialMath.START_DEG, DialMath.angle_deg(float(st[0]), f0), CbKit.RD, 7.0)
	_arc(c, r, DialMath.angle_deg(float(q.genOfHz), f0), DialMath.START_DEG + DialMath.SWEEP_DEG, CbKit.RD, 7.0)
	for h in st:   # UFLS stage ticks
		var a := DialMath.angle_deg(float(h), f0)
		draw_line(_pt(c, r - 9.0, a), _pt(c, r + 4.0, a), CbKit.AM, 2.0, true)
	for k in [-2.0, -1.0, -0.5, 0.0, 0.5, 1.0, 2.0]:   # scale ticks around the centre
		var a2 := DialMath.angle_deg(f0 + k, f0)
		draw_line(_pt(c, r - (7.0 if k == 0.0 else 4.0), a2), _pt(c, r - 1.0, a2), CbKit.DIM, 1.5, true)
	var col := [CbKit.GR, CbKit.AM, CbKit.RD][DialMath.zone(f, q)] as Color
	draw_line(c, _pt(c, r - 5.0, needle_deg), col, 3.0, true)
	draw_circle(c, 5.0, col)
