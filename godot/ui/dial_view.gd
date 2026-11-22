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
signal codex_requested(id: String)
var codex_id := ""

func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_PASS
	custom_minimum_size = Vector2(160, 132)

func _gui_input(e: InputEvent) -> void:
	if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT and codex_id != "": codex_requested.emit(codex_id); accept_event()

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
	var w := size.x; var h := size.y
	var l2 := GridTheme.look2
	var ink := GridTheme.face_ink()
	var aw := 4.0 if l2 else 7.0   # arc width: thin bands in the glass skin
	draw_style_box(GridTheme.meter_face_sb(10), Rect2(Vector2.ZERO, size))
	if not l2: draw_rect(Rect2(Vector2(5, 5), size - Vector2(10, 10)), Color(GridTheme.SODIUM, 0.06), true)
	var r := minf(w * 0.5 - 18.0, (h - 34.0) / 1.5)
	var c := Vector2(w * 0.5, 22.0 + r)
	_arc(c, r, DialMath.START_DEG, DialMath.START_DEG + DialMath.SWEEP_DEG, Color(ink, 0.35 if l2 else 0.55), aw)
	# the pack's standard range, painted green
	_arc(c, r, DialMath.angle_deg(float(q.stdLo), f0), DialMath.angle_deg(float(q.stdHi), f0), GridTheme.GOOD, aw)
	# danger ends: below the first UFLS stage and above the generator over-frequency trip
	var st: Array = q.get("uflsHz", [])
	if not st.is_empty(): _arc(c, r, DialMath.START_DEG, DialMath.angle_deg(float(st[0]), f0), GridTheme.BAD, aw)
	_arc(c, r, DialMath.angle_deg(float(q.genOfHz), f0), DialMath.START_DEG + DialMath.SWEEP_DEG, GridTheme.BAD, aw)
	for hz in st:   # UFLS stage ticks
		var a := DialMath.angle_deg(float(hz), f0)
		draw_line(_pt(c, r - 9.0, a), _pt(c, r + 4.0, a), GridTheme.WARN, 2.0, true)
	for k in [-2.0, -1.0, -0.5, 0.0, 0.5, 1.0, 2.0]:   # scale ticks around the centre
		var a2 := DialMath.angle_deg(f0 + k, f0)
		draw_line(_pt(c, r - (9.0 if k == 0.0 else 6.0), a2), _pt(c, r + 1.0, a2), ink, 1.0 if l2 else 1.5, true)
	var cf := GridTheme.font(GridTheme.skin_font("semi")); var csz := GridTheme.fs(11)
	GridText.ds(self, cf, Vector2(10.0, 4.0 + csz), TranslationServer.translate("HUD_FREQ"), HORIZONTAL_ALIGNMENT_LEFT, w - 20.0, csz, GridTheme.G_DIM if l2 else Color(ink, 0.8))
	var mf := GridTheme.font("mono"); var rs := TranslationServer.translate("HUD_HZ") % ("%.2f" % self.f); var rsz := GridTheme.fs(17)
	var rw := mf.get_string_size(rs, HORIZONTAL_ALIGNMENT_LEFT, -1, rsz)
	var plate := Rect2(Vector2((w - rw.x) * 0.5 - 8.0, c.y + 14.0), Vector2(rw.x + 16.0, rsz + 8.0))
	if not l2: draw_rect(plate, GridTheme.NIGHT, true)
	GridText.ds(self, mf, plate.position + Vector2(8.0, rsz + 2.0), rs, HORIZONTAL_ALIGNMENT_LEFT, -1, rsz, [GridTheme.SODIUM, GridTheme.WARN, GridTheme.BAD][DialMath.zone(self.f, q)])
	if not l2: draw_line(c + Vector2(2, 2), _pt(c, r - 5.0, needle_deg) + Vector2(2, 2), Color(0, 0, 0, 0.25), 3.0, true)
	draw_line(c, _pt(c, r - 5.0, needle_deg), GridTheme.SODIUM if l2 else Color("#B3261E"), 1.8 if l2 else 3.0, true)
	if l2: draw_circle(c, 4.0, GridTheme.GLASS); draw_arc(c, 4.0, 0.0, TAU, 16, GridTheme.SODIUM, 1.0, true)
	else: draw_circle(c, 5.5, GridTheme.NIGHT); draw_circle(c, 2.0, GridTheme.SODIUM_DIM)
