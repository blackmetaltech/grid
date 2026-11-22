class_name Clock24View
extends Control
## 24 h dial (UI.md 1): noon at the top, midnight at the bottom; the level's shift window painted as a sodium arc (elapsed part brighter), one
## hand on the engine clock, mono "19:40" on a plate under the dial. Everything it shows comes from the engine `clock` query, the level's
## `levelStart` block and `levelInfo.horizonBlocks` (blocks are 15 minutes).

signal codex_requested(id: String)
const BLOCK_MIN := 15.0
const DAY_MIN := 1440.0
var minutes := 0.0          ## engine clock, minutes of day (target)
var hand := 0.0             ## drawn hand, minutes of day (eases to `minutes`)
var win_start := -1.0       ## shift window start, minutes of day (-1 = no window)
var win_len := 0.0          ## shift window length, minutes (>= 1440 = the whole day)
var elapsed := 0.0          ## minutes of the window played so far
var running := false
var _have := false

func _init() -> void:
	custom_minimum_size = Vector2(118, 132); mouse_filter = Control.MOUSE_FILTER_IGNORE

## clock: engine `clock` query; level_start: snapshot levelStart (block, absolute); horizon: levelInfo.horizonBlocks or null.
func set_state(clock: Dictionary, level_start, horizon, instant := false) -> void:
	minutes = float(clock.minuteOfDay)
	if horizon != null and level_start != null:
		win_start = fposmod(float(level_start) * BLOCK_MIN, DAY_MIN); win_len = float(horizon) * BLOCK_MIN
		elapsed = clampf(float(clock.tick) * BLOCK_MIN - float(level_start) * BLOCK_MIN, 0.0, win_len)
	else: win_start = -1.0; win_len = 0.0; elapsed = 0.0
	if instant or not _have or CbSettings.reduced_motion: hand = minutes
	_have = true; queue_redraw()

func time_text() -> String: return "%02d:%02d" % [int(minutes) / 60 % 24, int(minutes) % 60]

func _process(dt: float) -> void:
	if not _have or is_equal_approx(hand, minutes): return
	var d := fposmod(minutes - hand + DAY_MIN * 0.5, DAY_MIN) - DAY_MIN * 0.5
	if absf(d) < 0.01: hand = minutes
	else: hand = fposmod(hand + d * (1.0 - exp(-dt * 8.0)), DAY_MIN)
	queue_redraw()

## Degrees clockwise from 12 o'clock for a minute of day (noon at top).
static func deg_of(min_of_day: float) -> float: return (min_of_day - 720.0) / DAY_MIN * 360.0

func _pt(c: Vector2, r: float, deg: float) -> Vector2: return c + Vector2(sin(deg_to_rad(deg)), -cos(deg_to_rad(deg))) * r
func _arc(c: Vector2, r: float, a0: float, a1: float, col: Color, w: float) -> void:
	var n := maxi(4, int(absf(a1 - a0) / 3.0)); var pts := PackedVector2Array()
	for i in n + 1: pts.append(_pt(c, r, lerpf(a0, a1, float(i) / n)))
	draw_polyline(pts, col, w, true)

func _draw() -> void:
	var w := size.x; var plate_h := float(GridTheme.fs(17)) + 10.0
	var d := minf(w, size.y - plate_h + 6.0); var c := Vector2(w * 0.5, d * 0.5); var r := d * 0.5 - 3.0
	var l2 := GridTheme.look2
	var glow := 0.10 + (0.08 if running else 0.0)
	if l2:
		draw_circle(c, r, GridTheme.GLASS); draw_arc(c, r, 0.0, TAU, 64, GridTheme.HAIR, 1.0, true)
	else:
		for i in 4: draw_arc(c, r + 3.0 - i * 0.7, 0.0, TAU, 48, Color(GridTheme.SODIUM, glow * 0.3), 2.0)
		draw_circle(c, r, GridTheme.NIGHT); draw_circle(c, r - 4.0, GridTheme.METER_FACE)
		draw_circle(c, r - 4.0, Color(GridTheme.SODIUM, 0.06))
	var ink := GridTheme.face_ink(); var ra := r - 12.0
	var aw := 4.0 if l2 else 7.0
	if win_start >= 0.0:
		var a0 := deg_of(win_start)
		if win_len >= DAY_MIN - 0.5:
			_arc(c, ra, a0, a0 + 359.0, Color(GridTheme.SODIUM_DIM, 0.55), aw)
			_arc(c, ra, a0, a0 + 359.0 * elapsed / win_len, GridTheme.SODIUM, aw)
		else:
			var a1 := a0 + win_len / DAY_MIN * 360.0
			_arc(c, ra, a0, a1, Color(GridTheme.SODIUM_DIM, 0.55), aw)
			if elapsed > 0.0: _arc(c, ra, a0, a0 + win_len / DAY_MIN * 360.0 * elapsed / win_len, GridTheme.SODIUM, aw)
	for h in 24:
		var a := deg_of(h * 60.0); var big := h % 6 == 0
		draw_line(_pt(c, r - 9.0 - (3.0 if big else 0.0) + 2.0, a), _pt(c, r - 5.0, a), ink, (1.5 if big else 1.0) if l2 else (2.0 if big else 1.0), true)
	var f := GridTheme.font("mono"); var fsz := GridTheme.fs(11)
	for h in [0, 6, 12, 18]:
		var s := "%02d" % h; var tw := f.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz)
		var p := _pt(c, r * 0.52, deg_of(h * 60.0))
		GridText.ds(self, f, p + Vector2(-tw.x * 0.5, fsz * 0.35), s, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz, Color(ink, 0.75))
	var ha := deg_of(hand)
	if not l2: draw_line(c + Vector2(1.5, 1.5), _pt(c, r - 8.0, ha) + Vector2(1.5, 1.5), Color(0, 0, 0, 0.25), 3.0, true)
	draw_line(c, _pt(c, r - 8.0, ha), GridTheme.SODIUM if l2 else Color("#B3261E"), 1.8 if l2 else 2.5, true)
	if l2: draw_circle(c, 3.5, GridTheme.GLASS); draw_arc(c, 3.5, 0.0, TAU, 16, GridTheme.SODIUM, 1.0, true)
	else: draw_circle(c, 4.5, GridTheme.NIGHT)
	var t := time_text(); var tsz := GridTheme.fs(17); var tw2 := f.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, tsz)
	var plate := Rect2(Vector2((w - tw2.x) * 0.5 - 8.0, d + 2.0), Vector2(tw2.x + 16.0, tsz + 8.0))
	if not l2: draw_rect(plate, GridTheme.NIGHT, true)
	GridText.ds(self, f, plate.position + Vector2(8.0, tsz + 2.0), t, HORIZONTAL_ALIGNMENT_LEFT, -1, tsz, GridTheme.SODIUM)
