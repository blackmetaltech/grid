class_name Breaker
extends Control
## The breaker (UI.md 5): a big knife-switch handle bottom-right, labelled "Run the night" / "Pause". Pull = app.set_speed(rate); pulling again
## pauses. A small knob (tap, + / -, D-pad up / down, or pad X toggles run) cycles 1x / 2x / 4x (app speed levels 1 / 2 / 3). Glows sodium while the night runs. Always enabled: the engine decides.

signal toggled(running: bool)
const RATES := ["1×", "2×", "4×"]
var app: CbApp
var rate := 2                 ## 1..3 (1x / 2x / 4x), remembered while paused; a bench level's night starts at 2x
var _level := ""
var _speed_rect := Rect2()    ## the speed knob and its caption: one generous tap target
var _pos := 0.0               ## lever position 0 (off) .. 1 (on), eased
var _hover := false
var _plate := Rect2()
var _knob_c := Vector2()
var _knob_r := 16.0

func _init() -> void:
	TrayStrings.load_strings()
	custom_minimum_size = Vector2(190, 168); mouse_filter = Control.MOUSE_FILTER_STOP; focus_mode = CbKit.focus_mode()
	mouse_exited.connect(func(): _hover = false; queue_redraw())

func running() -> bool: return app != null and app.speed > 0
## After a lost job the handle restarts it (play-testers were stranded with a "Run the night" lever that did nothing).
func lost() -> bool: return app != null and app.b != null and str(app.b.g.get("status", "")) == "lost"
func label_text() -> String:
	if lost(): return TranslationServer.translate("BREAKER_RETRY")
	if running(): return TranslationServer.translate("BREAKER_PAUSE")
	if is_evening_shift(): return TranslationServer.translate("BREAKER_RUN_EVENING")
	return TranslationServer.translate("BREAKER_RUN_NIGHT" if is_night_shift() else "BREAKER_RUN_DAY")
## A job that opens between 15:00 and 18:00 (L05 at 16:00) runs into the evening peak.
func is_evening_shift() -> bool:
	if app == null or app.b == null: return false
	var ls = app.b.g.get("levelStart")
	if ls == null: return false
	var mins := fposmod(float(ls) * 15.0, 1440.0)
	return mins >= 900.0 and mins < 1080.0

## The level's verb: a shift that starts from 18:00 through the small hours is a night, anything else a day.
func is_night_shift() -> bool:
	if app == null or app.b == null: return true
	var ls = app.b.g.get("levelStart")
	if ls == null: return true
	var mins := fposmod(float(ls) * 15.0, 1440.0)
	return mins >= 1080.0 or mins < 300.0
func rate_text() -> String: return RATES[clampi(rate, 1, 3) - 1]

## Pull the handle: run at the chosen rate, or pause.
func toggle() -> void:
	if app == null or not app.started: return
	if lost():
		var lid := str((app.b.q("levelInfo") as Dictionary).get("id", ""))
		if lid != "": ShiftReport._retry(app, lid, "")   # same as the report's Retry: the design stays on the table
		return
	if running(): app.set_speed(0)
	else: app.set_speed(rate)
	app.sfx("breaker_close" if running() else "breaker_open")
	toggled.emit(running()); queue_redraw()

func cycle_rate() -> void: set_rate(rate % 3 + 1)

## Keyboard + / - and pad D-pad up / down.
func step_rate(d: int) -> void: set_rate(clampi(rate + d, 1, 3))

func set_rate(r: int) -> void:
	rate = clampi(r, 1, 3)
	if running(): app.set_speed(rate)
	queue_redraw()

## A new level resets the knob to the default: 2x on a bench level (the night is short), 1x elsewhere.
func sync() -> void:
	if app != null and app.started and app.b != null:
		var li = app.b.q("levelInfo"); var id: String = str(li.get("id", "")) if li is Dictionary and li.get("active", false) else ""
		if id != _level:
			_level = id
			if id != "": rate = 2 if str(li.get("kind", "")) == "bench" else 1
	if app != null and app.speed > 0: rate = clampi(app.speed, 1, 3)
	queue_redraw()

var _pad_seen := false
func _process(dt: float) -> void:
	if CbKit.pad_mode != _pad_seen: _pad_seen = CbKit.pad_mode; queue_redraw()
	var goal := 1.0 if running() else 0.0
	if _pos != goal:
		_pos = move_toward(_pos, goal, dt * (1.0 / 0.18 if not CbSettings.reduced_motion else 100.0)); queue_redraw()
	elif running() and not CbSettings.reduced_motion: queue_redraw()   # glow breathes

func _layout_rects() -> void:
	var w := size.x; var h := size.y
	_plate = Rect2(Vector2(6, 4), Vector2(w - 12, h - 8))
	_knob_r = 19.0; _knob_c = Vector2(w - 46.0, 58.0)
	_speed_rect = Rect2(Vector2(w - 84.0, 8.0), Vector2(76.0, 100.0))

func _gui_input(e: InputEvent) -> void:
	_layout_rects()
	if e is InputEventMouseMotion:
		var hv: bool = _plate.has_point((e as InputEventMouseMotion).position)
		if hv != _hover: _hover = hv; queue_redraw()
	elif e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT:
		var p: Vector2 = (e as InputEventMouseButton).position
		if _speed_rect.has_point(p): cycle_rate()
		else: toggle()
		accept_event()
	elif has_focus() and e.is_action_pressed("ui_accept"): toggle(); accept_event()
	elif has_focus() and e.is_action_pressed("ui_up"): step_rate(1); accept_event()
	elif has_focus() and e.is_action_pressed("ui_down"): step_rate(-1); accept_event()

func _pt(c: Vector2, r: float, deg: float) -> Vector2: return c + Vector2(sin(deg_to_rad(deg)), -cos(deg_to_rad(deg))) * r

func _draw() -> void:
	_layout_rects()
	var on := running(); var w := size.x; var h := size.y
	var breathe := 0.5 + 0.5 * sin(Time.get_ticks_msec() * 0.004) if on else 0.0
	if on:
		for i in 5: draw_rect(_plate.grow(8.0 - i * 1.5), Color(GridTheme.SODIUM, (0.05 + 0.04 * breathe) * (i + 1) * 0.5), false, 3.0)
	draw_style_box(GridTheme.ink_sb(0.96, 10, 0.0), _plate)
	var edge := StyleBoxFlat.new(); edge.draw_center = false; edge.border_color = GridTheme.SODIUM if (on or has_focus()) else Color(GridTheme.SODIUM_DIM, 0.55 if _hover else 0.35); edge.set_border_width_all(2 if has_focus() else 1); edge.set_corner_radius_all(10)
	draw_style_box(edge, _plate)
	var screws := [Vector2(18, 16), Vector2(w - 18, 16), Vector2(w - 18, h - 16)]
	if not CbKit.pad_mode: screws.append(Vector2(18, h - 16))
	for s in screws:   # screws
		draw_circle(s, 4.0, GridTheme.NIGHT); draw_line(s + Vector2(-2.5, 1.5), s + Vector2(2.5, -1.5), GridTheme.SODIUM_DIM, 1.2)
	# knife switch: slot, pivot at the bottom, blade swings between OFF (leaning left) and ON (leaning right)
	var pv := Vector2(w * 0.29, h - 56.0)
	draw_rect(Rect2(pv + Vector2(-34, -4), Vector2(68, 10)), GridTheme.NIGHT, true)
	draw_rect(Rect2(pv + Vector2(-34, -4), Vector2(68, 10)), Color(GridTheme.SODIUM_DIM, 0.4), false, 1.0)
	var ang := lerpf(-34.0, 34.0, _pos); var tip := _pt(pv, 66.0, ang)
	for t in [Vector2(-30, -2), Vector2(30, -2)]: draw_circle(pv + t, 5.0, GridTheme.COPPER)
	draw_line(pv + Vector2(1.5, 1.5), tip + Vector2(1.5, 1.5), Color(0, 0, 0, 0.35), 8.0, true)
	draw_line(pv, tip, GridTheme.COPPER.lightened(0.15) if on else GridTheme.COPPER.darkened(0.2), 7.0, true)
	var grip := GridTheme.SODIUM if on else GridTheme.SODIUM_DIM
	draw_circle(tip, 13.0, GridTheme.NIGHT); draw_circle(tip, 10.0, grip)
	draw_circle(tip + Vector2(-3, -3), 3.0, Color(1, 1, 1, 0.35))
	draw_circle(pv, 7.0, GridTheme.NIGHT); draw_circle(pv, 3.0, GridTheme.SODIUM_DIM)
	# speed knob (top right): its caption "speed 2×" and the three notches 1× 2× 4× around it; the whole box is the tap target
	draw_style_box(_speed_sb(), _speed_rect)
	draw_circle(_knob_c, _knob_r + 3.0, GridTheme.NIGHT); draw_circle(_knob_c, _knob_r, GridTheme.INK.lightened(0.12))
	var ka := -50.0 + 50.0 * (rate - 1)
	draw_line(_knob_c, _pt(_knob_c, _knob_r - 3.0, ka), GridTheme.SODIUM, 3.5, true)
	var mf := GridTheme.font("mono"); var msz := GridTheme.fs(12)
	for k in 3:
		var tl: String = RATES[k]; var kw := mf.get_string_size(tl, HORIZONTAL_ALIGNMENT_LEFT, -1, msz)
		var tp := _pt(_knob_c, _knob_r + 14.0, -50.0 + 50.0 * k)
		draw_string(mf, tp + Vector2(-kw.x * 0.5, 4.0), tl, HORIZONTAL_ALIGNMENT_LEFT, -1, msz, GridTheme.SODIUM if k == rate - 1 else Color(GridTheme.DIM, 0.8))
	var cap := TranslationServer.translate("BREAKER_SPEED") % rate_text(); var csz := GridTheme.fs(13)
	var cw := mf.get_string_size(cap, HORIZONTAL_ALIGNMENT_LEFT, -1, csz)
	draw_string(mf, Vector2(_speed_rect.get_center().x - cw.x * 0.5, _speed_rect.end.y - 10.0), cap, HORIZONTAL_ALIGNMENT_LEFT, -1, csz, GridTheme.SODIUM if on else GridTheme.TEXT)
	# label
	var f := GridTheme.font("semi"); var fsz := GridTheme.fs(17); var lt := label_text()
	var lw := f.get_string_size(lt, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz)
	var lx := (w - lw.x) * 0.5 + (12.0 if CbKit.pad_mode else 0.0)
	draw_string(f, Vector2(lx, h - 12.0), lt, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz, GridTheme.SODIUM if on else GridTheme.TEXT)
	if CbKit.pad_mode: _pad_glyph(Vector2(lx - 17.0, h - 18.0), "X")

func _speed_sb() -> StyleBoxFlat:
	var sb := StyleBoxFlat.new(); sb.bg_color = Color(GridTheme.NIGHT, 0.5); sb.set_corner_radius_all(8)
	sb.border_color = Color(GridTheme.SODIUM_DIM, 0.55 if _hover else 0.3); sb.set_border_width_all(1)
	return sb

## A round controller button glyph ("X"): shown while the last input was a pad.
func _pad_glyph(c: Vector2, t: String) -> void:
	draw_circle(c, 10.0, Color("#2E5FD0")); draw_arc(c, 10.0, 0.0, TAU, 20, Color(1, 1, 1, 0.7), 1.4)
	var f := GridTheme.font("semi"); var z := GridTheme.fs(13); var tw := f.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, z)
	draw_string(f, c + Vector2(-tw.x * 0.5, z * 0.36), t, HORIZONTAL_ALIGNMENT_LEFT, -1, z, Color.WHITE)
