class_name MeterView
extends Control
## Generic analogue panel meter (UI.md 1): cream face, dark bezel, arc scale with major/minor ticks and numbers, coloured zones, a needle on a
## critically damped spring (about 0.4 s to settle) whose rest position is EXACTLY the target value, a mono readout under the pivot, a caption.
## Display only: the value comes from the engine query, the meter never computes physics. `needle_value()` maps the drawn angle back to a value.

signal codex_requested(id: String)

const SWEEP := 120.0            ## degrees of arc, symmetric about 12 o'clock
const OMEGA := 14.0             ## 1/s: critically damped, 2 % settle in about 0.4 s
var vmin := 0.0
var vmax := 60.0
var major := 20.0               ## labelled ticks every `major`
var minor := 5.0
var zones: Array = []           ## [[from, to, Color], ...]
var caption := ""
var units := ""
var decimals := 1
var codex_id := ""
var target := 0.0               ## engine value the needle rests on
var _x := 0.0                   ## needle position, in value units
var _v := 0.0                   ## needle velocity
var _have := false
var _glow := 0.0
var blank := false              ## no real reading (circuit incomplete): needle rests at the scale start, readout "—"
var ghost := NAN                ## what-if value (kit tray hover): a thin ghost needle, NAN = none
var live := false               ## breaker is running: backlight a little warmer

func _init() -> void:
	custom_minimum_size = Vector2(160, 132)
	mouse_filter = Control.MOUSE_FILTER_PASS

func set_range(lo: float, hi: float, maj: float, mnr: float) -> void: vmin = lo; vmax = hi; major = maj; minor = mnr; queue_redraw()

func set_target(v: float, instant := false) -> void:
	target = v
	if instant or not _have or CbSettings.reduced_motion: _x = clampf(v, vmin, vmax); _v = 0.0
	_have = true
	queue_redraw()

func snap(v: float) -> void: set_target(v, true)
## Ghost needle: the engine's previewed value for the part under the pointer (display only; NAN clears it).
func set_ghost(v: float) -> void:
	if is_nan(v) and is_nan(ghost): return
	if not is_nan(v) and not is_nan(ghost) and v == ghost: return
	ghost = v; queue_redraw()
func ghost_value() -> float: return NAN if is_nan(ghost) else value_of_angle(angle_deg(ghost))

func angle_deg(v: float) -> float: return -SWEEP * 0.5 + SWEEP * clampf((v - vmin) / (vmax - vmin), 0.0, 1.0)
func value_of_angle(deg: float) -> float: return vmin + (vmax - vmin) * clampf((deg + SWEEP * 0.5) / SWEEP, 0.0, 1.0)
## The drawn needle angle (degrees clockwise from 12 o'clock) and the value it stands for.
func needle_deg() -> float: return angle_deg(_x)
func needle_value() -> float: return value_of_angle(needle_deg())
func readout_text() -> String:
	if blank: return TranslationServer.translate("METER_BLANK")
	return ("%." + str(decimals) + "f %s") % [target, units]
func settled() -> bool: return _v == 0.0 and _x == clampf(target, vmin, vmax)

## Advance the spring by dt seconds (the engine of _process, callable from tests).
func step(dt: float) -> void:
	var goal := clampf(target, vmin, vmax)
	var n := maxi(1, int(ceil(dt / 0.008))); var h := dt / n
	for i in n:
		var a := -OMEGA * OMEGA * (_x - goal) - 2.0 * OMEGA * _v
		_v += a * h; _x += _v * h
	if absf(_x - goal) < (vmax - vmin) * 1e-5 and absf(_v) < (vmax - vmin) * 1e-4: _x = goal; _v = 0.0   # rests exactly on the engine value
	_glow = lerpf(_glow, clampf(absf(_v) / ((vmax - vmin) * 0.6), 0.0, 1.0), 1.0 - exp(-dt * 6.0))

func _process(dt: float) -> void:
	if not _have or not visible: return
	if not settled() or _glow > 0.002: step(minf(dt, 0.05)); queue_redraw()

func _gui_input(e: InputEvent) -> void:
	if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT and codex_id != "":
		codex_requested.emit(codex_id); accept_event()

func _pt(c: Vector2, r: float, deg: float) -> Vector2: return c + Vector2(sin(deg_to_rad(deg)), -cos(deg_to_rad(deg))) * r

func _arc(c: Vector2, r: float, a0: float, a1: float, col: Color, w: float) -> void:
	var n := maxi(4, int(absf(a1 - a0) / 2.0)); var pts := PackedVector2Array()
	for i in n + 1: pts.append(_pt(c, r, lerpf(a0, a1, float(i) / n)))
	draw_polyline(pts, col, w, true)

func _draw() -> void:
	var w := size.x; var h := size.y
	# warm backlight: sodium halo, brighter while the needle moves or the night runs
	var g := 0.10 + 0.35 * _glow + (0.08 if live else 0.0)
	for i in 4: draw_rect(Rect2(Vector2(-3.0 + i, -3.0 + i), size + Vector2(6.0 - 2.0 * i, 6.0 - 2.0 * i)), Color(GridTheme.SODIUM, g * 0.25), false, 3.0)
	var face := Rect2(Vector2.ZERO, size)
	draw_style_box(GridTheme.meter_face_sb(10), face)
	draw_rect(face.grow(-5.0), Color(GridTheme.SODIUM, 0.05 + 0.1 * g), true)
	var c := Vector2(w * 0.5, h * 0.72)
	var r := minf(w * 0.5 * 0.80 / sin(deg_to_rad(SWEEP * 0.5)) * 0.62, h * 0.50)
	var a0 := -SWEEP * 0.5; var a1 := SWEEP * 0.5
	# zones sit just inside the ticks
	for z in zones:
		var za := angle_deg(float(z[0])); var zb := angle_deg(float(z[1]))
		if zb > za: _arc(c, r - 5.0, za, zb, Color(z[2] as Color, 0.95), 8.0)
	_arc(c, r, a0, a1, GridTheme.PAPER_INK, 1.5)
	var ink := GridTheme.PAPER_INK
	var f := GridTheme.font("mono"); var fsz := GridTheme.fs(11)
	var nmin := int(round((vmax - vmin) / minor))
	for i in nmin + 1:
		var v := vmin + i * minor; var a := angle_deg(v)
		var is_major := absf(fmod(v - vmin + 1e-6, major)) < 1e-4 or absf(fmod(v - vmin + 1e-6, major) - major) < 1e-4
		draw_line(_pt(c, r, a), _pt(c, r + (8.0 if is_major else 4.0), a), ink, 2.0 if is_major else 1.0, true)
		if is_major:
			var s := str(int(round(v))); var tw := f.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz)
			var p := _pt(c, r + 8.0 + 8.0 + tw.x * 0.35, a)
			draw_string(f, p + Vector2(-tw.x * 0.5, fsz * 0.35), s, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz, ink)
	# caption (top-left, tiny scale label), readout under the pivot
	var cf := GridTheme.font("semi"); var csz := GridTheme.fs(11)
	draw_string(cf, Vector2(10.0, 4.0 + csz), TranslationServer.translate("METER_OFF") if blank else caption, HORIZONTAL_ALIGNMENT_LEFT, w - 20.0, csz, Color(ink, 0.8))
	var rs := readout_text(); var rsz := GridTheme.fs(17)
	var rw := f.get_string_size(rs, HORIZONTAL_ALIGNMENT_LEFT, -1, rsz)
	var plate := Rect2(Vector2((w - rw.x) * 0.5 - 8.0, c.y + 10.0), Vector2(rw.x + 16.0, rsz + 8.0))
	draw_rect(plate, GridTheme.NIGHT, true)
	draw_string(f, plate.position + Vector2(8.0, rsz + 2.0), rs, HORIZONTAL_ALIGNMENT_LEFT, -1, rsz, GridTheme.SODIUM)
	if not is_nan(ghost):   # ghost needle: where the needle would rest if the player did this, drawn under the real one
		var ga := angle_deg(ghost)
		draw_line(_pt(c, r - 2.0, ga) , _pt(c, 6.0, ga), Color(GridTheme.SODIUM_DIM, 0.35), 6.0, true)
		draw_line(_pt(c, r - 2.0, ga), _pt(c, 6.0, ga), Color("#2A2418", 0.85), 1.6, true)
		draw_circle(_pt(c, r - 2.0, ga), 3.2, GridTheme.SODIUM)
	# needle with a short shadow and a counterweight tail
	var na := needle_deg()
	draw_line(c + Vector2(2, 2), _pt(c, r - 2.0, na) + Vector2(2, 2), Color(0, 0, 0, 0.25), 3.0, true)
	draw_line(_pt(c, -9.0, na), _pt(c, r - 2.0, na), Color("#B3261E"), 2.5, true)
	draw_circle(c, 5.5, GridTheme.NIGHT); draw_circle(c, 2.0, GridTheme.SODIUM_DIM)
