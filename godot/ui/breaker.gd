class_name Breaker
extends Control
## The breaker (UI.md 5): a big knife-switch handle bottom-right, labelled "Run the night" / "Pause". Pull = app.set_speed(rate); pulling again
## pauses. A small knob cycles 1x / 2x / 4x (app speed levels 1 / 2 / 3). Glows sodium while the night runs. Always enabled: the engine decides.

signal toggled(running: bool)
const RATES := ["1×", "2×", "4×"]
var app: CbApp
var rate := 1                 ## 1..3, remembered while paused
var _pos := 0.0               ## lever position 0 (off) .. 1 (on), eased
var _hover := false
var _plate := Rect2()
var _knob_c := Vector2()
var _knob_r := 16.0

func _init() -> void:
	custom_minimum_size = Vector2(190, 168); mouse_filter = Control.MOUSE_FILTER_STOP; focus_mode = CbKit.focus_mode()
	mouse_exited.connect(func(): _hover = false; queue_redraw())

func running() -> bool: return app != null and app.speed > 0
func label_text() -> String:
	if running(): return TranslationServer.translate("BREAKER_PAUSE")
	return TranslationServer.translate("BREAKER_RUN_NIGHT" if is_night_shift() else "BREAKER_RUN_DAY")

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
	if running(): app.set_speed(0)
	else: app.set_speed(rate)
	toggled.emit(running()); queue_redraw()

func cycle_rate() -> void:
	rate = rate % 3 + 1
	if running(): app.set_speed(rate)
	queue_redraw()

func sync() -> void:
	if app != null and app.speed > 0: rate = clampi(app.speed, 1, 3)
	queue_redraw()

func _process(dt: float) -> void:
	var goal := 1.0 if running() else 0.0
	if _pos != goal:
		_pos = move_toward(_pos, goal, dt * (1.0 / 0.18 if not CbSettings.reduced_motion else 100.0)); queue_redraw()
	elif running() and not CbSettings.reduced_motion: queue_redraw()   # glow breathes

func _layout_rects() -> void:
	var w := size.x; var h := size.y
	_plate = Rect2(Vector2(6, 4), Vector2(w - 12, h - 8))
	_knob_r = 17.0; _knob_c = Vector2(w - 38.0, 50.0)

func _gui_input(e: InputEvent) -> void:
	_layout_rects()
	if e is InputEventMouseMotion:
		var hv: bool = _plate.has_point((e as InputEventMouseMotion).position)
		if hv != _hover: _hover = hv; queue_redraw()
	elif e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT:
		var p: Vector2 = (e as InputEventMouseButton).position
		if p.distance_to(_knob_c) <= _knob_r + 8.0: cycle_rate()
		else: toggle()
		accept_event()
	elif e.is_action_pressed("ui_accept") and has_focus(): toggle(); accept_event()

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
	for s in [Vector2(18, 16), Vector2(w - 18, 16), Vector2(18, h - 16), Vector2(w - 18, h - 16)]:   # screws
		draw_circle(s, 4.0, GridTheme.NIGHT); draw_line(s + Vector2(-2.5, 1.5), s + Vector2(2.5, -1.5), GridTheme.SODIUM_DIM, 1.2)
	# knife switch: slot, pivot at the bottom, blade swings between OFF (leaning left) and ON (leaning right)
	var pv := Vector2(w * 0.36, h - 56.0)
	draw_rect(Rect2(pv + Vector2(-34, -4), Vector2(68, 10)), GridTheme.NIGHT, true)
	draw_rect(Rect2(pv + Vector2(-34, -4), Vector2(68, 10)), Color(GridTheme.SODIUM_DIM, 0.4), false, 1.0)
	var ang := lerpf(-34.0, 34.0, _pos); var tip := _pt(pv, 74.0, ang)
	for t in [Vector2(-30, -2), Vector2(30, -2)]: draw_circle(pv + t, 5.0, GridTheme.COPPER)
	draw_line(pv + Vector2(1.5, 1.5), tip + Vector2(1.5, 1.5), Color(0, 0, 0, 0.35), 8.0, true)
	draw_line(pv, tip, GridTheme.COPPER.lightened(0.15) if on else GridTheme.COPPER.darkened(0.2), 7.0, true)
	var grip := GridTheme.SODIUM if on else GridTheme.SODIUM_DIM
	draw_circle(tip, 13.0, GridTheme.NIGHT); draw_circle(tip, 10.0, grip)
	draw_circle(tip + Vector2(-3, -3), 3.0, Color(1, 1, 1, 0.35))
	draw_circle(pv, 7.0, GridTheme.NIGHT); draw_circle(pv, 3.0, GridTheme.SODIUM_DIM)
	# rate knob (top right)
	draw_circle(_knob_c, _knob_r + 3.0, GridTheme.NIGHT); draw_circle(_knob_c, _knob_r, GridTheme.INK.lightened(0.12))
	var ka := -50.0 + 50.0 * (rate - 1)
	draw_line(_knob_c, _pt(_knob_c, _knob_r - 3.0, ka), GridTheme.SODIUM, 3.0, true)
	var mf := GridTheme.font("mono"); var msz := GridTheme.fs(13); var rt := rate_text()
	var rw := mf.get_string_size(rt, HORIZONTAL_ALIGNMENT_LEFT, -1, msz)
	draw_string(mf, _knob_c + Vector2(-rw.x * 0.5, _knob_r + 4.0 + msz), rt, HORIZONTAL_ALIGNMENT_LEFT, -1, msz, GridTheme.SODIUM if on else GridTheme.DIM)
	# label
	var f := GridTheme.font("semi"); var fsz := GridTheme.fs(17); var lt := label_text()
	var lw := f.get_string_size(lt, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz)
	draw_string(f, Vector2((w - lw.x) * 0.5, h - 12.0), lt, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz, GridTheme.SODIUM if on else GridTheme.TEXT)
