class_name TankView
extends Control
## The world: a rich 2D drawing of the tank, always visible behind the drawers.
##   water level animates to the engine's depth h · inflow stream thickness ∝ valve · outflow jet range ∝ √h (a real parabola: x = 2·Cd·√(h·Δy))
##   the target band, the depth gauge with the depth the tank is heading for (steady state), the valve wheel (click it: opens the controls)
## It reads only what the engine says (flows query); the app tells it how much of the right side a drawer covers (set_cover).
var app
var rig := {"g": 9.80665, "Cd": 0.61, "a": 0.002, "A": 0.5, "H": 2.0, "qMax": 0.009}
var h_now := 0.3
var h_eng := 0.3
var valve := 0.0
var q_in := 0.0
var q_out := 0.0
var steady := 0.0
var band: Array = [1.0, 1.2]
var held := 0
var hold_ticks := 10
var overflows := 0
var cover := 0.0
var blocked := false
var title_mode := false
var zoom := 1.0
var t := 0.0
var _wheel := Vector2.ZERO
var _wheel_r := 34.0

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_PASS
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

func set_cover(px: float) -> void: cover = px; queue_redraw()
func set_blocked(b: bool) -> void: blocked = b
func set_title(on: bool) -> void: title_mode = on; queue_redraw()

## CB_CAM for screenshots: "close", "wide", "full", or a zoom factor.
func set_camera(spec: String) -> void:
	match spec:
		"close": zoom = 1.3
		"wide": zoom = 0.8
		"full": zoom = 1.0
		_: if spec.is_valid_float(): zoom = clampf(float(spec), 0.4, 2.5)
	queue_redraw()

func set_state(g: Dictionary, flows: Dictionary) -> void:
	if app != null and app.b != null:
		var cat: Dictionary = app.b.init_data.get("catalogues", {})
		if cat.has("rig"): rig = cat.rig
	h_eng = float(g.get("h", h_eng)); valve = float(g.get("valve", 0.0)); band = g.get("band", band); hold_ticks = int(g.get("holdTicks", hold_ticks))
	if flows is Dictionary and not flows.is_empty():
		q_in = float(flows.get("qIn", 0.0)); q_out = float(flows.get("qOut", 0.0)); steady = float(flows.get("steady", 0.0)); held = int(flows.get("held", 0)); overflows = int(flows.get("overflows", 0))
	if CbSettings.reduced_motion: h_now = h_eng
	queue_redraw()

func _process(dt: float) -> void:
	if not is_visible_in_tree(): return
	t += dt
	if not CbSettings.reduced_motion: h_now = lerpf(h_now, h_eng, 1.0 - exp(-dt * 3.2))
	else: h_now = h_eng
	queue_redraw()

func _gui_input(e: InputEvent) -> void:
	if blocked or app == null: return
	if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT and app.modal() == null:
		if (e.position - _wheel).length() < _wheel_r * 1.6 and app.started: app.show_screen("controls")

# ---- drawing helpers ----
func _txt(s: String, p: Vector2, size: int, col: Color, align := HORIZONTAL_ALIGNMENT_LEFT, _w := -1.0) -> void:
	if title_mode: return   # the title screen shows the scene without its labels (they would show through the menu panel)
	var f := CbKit.font_bold()
	var ww := f.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
	if align == HORIZONTAL_ALIGNMENT_CENTER: p.x -= ww * 0.5
	elif align == HORIZONTAL_ALIGNMENT_RIGHT: p.x -= ww
	draw_string_outline(f, p, s, HORIZONTAL_ALIGNMENT_LEFT, -1, size, 5, Color(0, 0, 0, 0.55) if CbKit.dark else Color(1, 1, 1, 0.7))
	draw_string(f, p, s, HORIZONTAL_ALIGNMENT_LEFT, -1, size, col)

func _dashed(a: Vector2, b: Vector2, col: Color, wd: float, dash := 12.0, gap := 8.0) -> void:
	var d := (b - a); var ln := d.length()
	if ln < 1.0: return
	var u := d / ln; var p := 0.0
	while p < ln:
		draw_line(a + u * p, a + u * minf(p + dash, ln), col, wd); p += dash + gap

func _draw() -> void:
	var W := size.x; var H := size.y
	var dark := CbKit.dark
	# --- backdrop: a lab wall with a blueprint grid and a floor ---
	var top_c := Color("#0b1624") if dark else Color("#dcebf6")
	var bot_c := Color("#14344e") if dark else Color("#f2f8fc")
	draw_polygon(PackedVector2Array([Vector2(0, 0), Vector2(W, 0), Vector2(W, H), Vector2(0, H)]), PackedColorArray([top_c, top_c, bot_c, bot_c]))
	var grid := Color(0.45, 0.7, 0.95, 0.07) if dark else Color(0.1, 0.3, 0.5, 0.07)
	var gx := 0.0
	while gx < W: draw_line(Vector2(gx, 0), Vector2(gx, H), grid, 1.0); gx += 96.0
	var gy := 0.0
	while gy < H: draw_line(Vector2(0, gy), Vector2(W, gy), grid, 1.0); gy += 96.0
	# --- scene geometry (metres -> pixels) ---
	var top_pad := 96.0; var bottom_pad := 150.0 if not CbLayout.phone else 76.0
	var free_w := W - cover
	var ppm := minf((H - top_pad - bottom_pad - 40.0) / (float(rig.H) + 0.55), free_w / 4.9) * zoom
	var floor_y := H - bottom_pad + 20.0
	var cx := free_w * 0.5 + ppm * 0.45
	if title_mode: cx = W * 0.70
	cx = clampf(cx, ppm * 2.4, W - cover - ppm * 2.4) if not title_mode else cx
	if ppm < 8.0: return   # window too small to draw anything sensible
	var tw := 0.9 * ppm
	var x0 := cx - tw * 0.5; var x1 := cx + tw * 0.5
	var y_b := floor_y - 0.30 * ppm          # tank bottom
	var y_o := y_b - 0.10 * ppm              # orifice centre (depth is measured from here)
	var y_top := y_o - float(rig.H) * ppm    # brim
	var yd := func(depth: float) -> float: return y_o - depth * ppm
	var floor_c := Color("#0a1118") if dark else Color("#c5d3de")
	draw_rect(Rect2(0, floor_y, W, H - floor_y), floor_c)
	draw_line(Vector2(0, floor_y), Vector2(W, floor_y), Color(CbKit.ACC.r, CbKit.ACC.g, CbKit.ACC.b, 0.5), 3.0)
	# --- the drain trough on the floor, right of the tank ---
	var jet_range := 2.0 * float(rig.Cd) * sqrt(maxf(h_now, 0.0) * (floor_y - y_o) / ppm) * ppm
	var tr_x0 := x1 + 0.12 * ppm; var tr_x1 := x1 + 2.2 * ppm
	draw_rect(Rect2(tr_x0, floor_y - 0.12 * ppm, tr_x1 - tr_x0, 0.12 * ppm), Color("#26384a") if dark else Color("#8da3b6"))
	draw_rect(Rect2(tr_x0 + 6, floor_y - 0.12 * ppm + 6, tr_x1 - tr_x0 - 12, 0.12 * ppm - 6), Color("#0f1c29") if dark else Color("#6b8197"))
	if h_now > 0.01:   # water collected in the trough
		draw_rect(Rect2(tr_x0 + 6, floor_y - 0.06 * ppm, tr_x1 - tr_x0 - 12, 0.06 * ppm), Color(0.2, 0.55, 0.85, 0.7))
	_txt("DRAIN", Vector2(tr_x1 - 6, floor_y + 24), 15, CbKit.DIM, HORIZONTAL_ALIGNMENT_RIGHT)
	# --- stand ---
	var stand_c := Color("#3a4a5b") if dark else Color("#7d93a8")
	draw_rect(Rect2(x0 - 0.1 * ppm, y_b, tw + 0.2 * ppm, 0.10 * ppm), stand_c)
	draw_rect(Rect2(x0 - 0.02 * ppm, y_b + 0.10 * ppm, 0.12 * ppm, floor_y - y_b - 0.10 * ppm), stand_c)
	draw_rect(Rect2(x1 - 0.10 * ppm, y_b + 0.10 * ppm, 0.12 * ppm, floor_y - y_b - 0.10 * ppm), stand_c)
	# --- tank glass ---
	draw_rect(Rect2(x0, y_top, tw, y_b - y_top), Color(0.55, 0.8, 1.0, 0.07) if dark else Color(1, 1, 1, 0.35))
	# --- water ---
	var surf := float(yd.call(h_now))
	var amp := 0.0 if CbSettings.reduced_motion else clampf(2.0 + absf(q_in - q_out) / float(rig.qMax) * 7.0, 2.0, 7.0)
	if h_now > 0.002:
		var pts := PackedVector2Array(); var cols := PackedColorArray()
		var steps := 24
		var wtop := Color(0.45, 0.82, 1.0, 0.82); var wbot := Color(0.1, 0.42, 0.78, 0.9)
		for i in steps + 1:
			var x := lerpf(x0 + 4.0, x1 - 4.0, float(i) / steps)
			pts.append(Vector2(x, minf(surf + sin(t * 2.3 + x * 0.045) * amp + sin(t * 1.4 + x * 0.09) * amp * 0.5, y_b - 5.0))); cols.append(wtop)   # (never below the tank floor: that would be a self-intersecting polygon)
		pts.append(Vector2(x1 - 4.0, y_b - 3.0)); cols.append(wbot); pts.append(Vector2(x0 + 4.0, y_b - 3.0)); cols.append(wbot)
		draw_polygon(pts, cols)
		var line := PackedVector2Array()
		for i in steps + 1: line.append(pts[i])
		draw_polyline(line, Color(0.85, 0.96, 1.0, 0.9), 3.0)
		if valve > 0.0 and not CbSettings.reduced_motion:   # bubbles stirred up by the inflow
			for i in 9:
				var f := fmod(t * (0.16 + 0.05 * (i % 3)) + i * 0.37, 1.0)
				var bx := x0 + tw * (0.15 + 0.7 * fmod(i * 0.618, 1.0)) + sin(t * 1.7 + i) * 5.0
				var by := lerpf(y_b - 12.0, surf + 6.0, f)
				if by > surf + 4.0: draw_arc(Vector2(bx, by), 3.0 + (i % 3), 0, TAU, 12, Color(1, 1, 1, 0.35 * (1.0 - f)), 1.5)
	# --- target band ---
	var inb: bool = h_now >= float(band[0]) and h_now <= float(band[1])
	var bcol := CbKit.GR if inb else CbKit.AM
	var yb0 := float(yd.call(float(band[1]))); var yb1 := float(yd.call(float(band[0])))
	draw_rect(Rect2(x0, yb0, tw, yb1 - yb0), Color(bcol.r, bcol.g, bcol.b, 0.16))
	_dashed(Vector2(x0 - 14, yb0), Vector2(x1 + 10, yb0), bcol, 3.0); _dashed(Vector2(x0 - 14, yb1), Vector2(x1 + 10, yb1), bcol, 3.0)
	# --- tank walls (over the water) ---
	var wall_c := Color("#9fb4c8") if dark else Color("#52677a")
	draw_line(Vector2(x0, y_top - 6), Vector2(x0, y_b), wall_c, 7.0); draw_line(Vector2(x1, y_top - 6), Vector2(x1, y_b), wall_c, 7.0); draw_line(Vector2(x0 - 3, y_b), Vector2(x1 + 3, y_b), wall_c, 8.0)
	draw_line(Vector2(x0 - 8, y_top - 6), Vector2(x0 + 14, y_top - 6), wall_c, 5.0); draw_line(Vector2(x1 - 14, y_top - 6), Vector2(x1 + 8, y_top - 6), wall_c, 5.0)
	# --- orifice and jet ---
	draw_rect(Rect2(x1 - 2, y_o - 7, 16, 14), wall_c)
	if h_now > 0.01:
		var jet := PackedVector2Array(); var n := 28
		var drop_m := (floor_y - y_o) / ppm; var tfall := sqrt(2.0 * drop_m / float(rig.g))
		for i in n + 1:
			var tt := tfall * float(i) / n
			jet.append(Vector2(x1 + 14.0 + jet_range * float(i) / n, y_o + 0.5 * float(rig.g) * tt * tt * ppm))   # x grows with time at the exit speed v = Cd·√(2gh)
		draw_polyline(jet, Color(0.35, 0.72, 1.0, 0.85), 9.0 + h_now * 2.0)
		draw_polyline(jet, Color(0.85, 0.96, 1.0, 0.55), 3.0)
		var land := jet[jet.size() - 1]
		if not CbSettings.reduced_motion:
			for i in 5:
				var f2 := fmod(t * 1.6 + i * 0.2, 1.0)
				draw_circle(land + Vector2((f2 - 0.2) * 40.0 * (1 if i % 2 == 0 else -0.5), -sin(f2 * PI) * 22.0), 3.0 + (i % 2), Color(0.8, 0.95, 1.0, 0.6 * (1.0 - f2)))
		_txt("q_out %s" % CbKit.fmt(q_out * 1000.0, 2, "L/s"), Vector2(minf(land.x + 6.0, tr_x1 - 150.0), floor_y - 0.5 * ppm), 16, Color("#8fd3ff") if dark else Color("#0b5d95"))
		_txt("range ∝ √h", Vector2(minf(land.x + 6.0, tr_x1 - 150.0), floor_y - 0.5 * ppm + 20), 14, CbKit.DIM)
	# --- supply pipe, valve wheel and the inflow stream ---
	var pipe_y := y_top - 0.30 * ppm
	var px := x0 + tw * 0.28
	var pipe_c := Color("#566a7e") if dark else Color("#91a6b9")
	var pr := 0.085 * ppm
	draw_rect(Rect2(-10, pipe_y - pr, px + 10, pr * 2.0), pipe_c)
	draw_rect(Rect2(px - pr, pipe_y - pr, pr * 2.0, 0.34 * ppm + pr), pipe_c)
	draw_rect(Rect2(px - pr - 5, pipe_y + 0.34 * ppm, pr * 2.0 + 10, 9), wall_c)
	if valve > 0.0:
		draw_rect(Rect2(-10, pipe_y - pr + 7, px + 4, pr * 2.0 - 14), Color(0.35, 0.72, 1.0, 0.55))
		var sx := px; var sy := pipe_y + 0.34 * ppm + 9.0
		var sw := 3.0 + 22.0 * valve
		var end_y := surf if h_now > 0.002 else y_b - 4.0
		draw_rect(Rect2(sx - sw * 0.5, sy, sw, end_y - sy), Color(0.4, 0.78, 1.0, 0.8))
		draw_rect(Rect2(sx - sw * 0.5 + sw * 0.2, sy, sw * 0.18, end_y - sy), Color(0.9, 0.98, 1.0, 0.55))
		if not CbSettings.reduced_motion:
			var yy := sy + fmod(t * 160.0, 36.0)
			while yy < end_y - 4.0:
				draw_line(Vector2(sx - sw * 0.2, yy), Vector2(sx - sw * 0.2, minf(yy + 14.0, end_y)), Color(1, 1, 1, 0.55), 2.0); yy += 36.0
		draw_circle(Vector2(sx, end_y), sw * 0.6 + 2.0, Color(0.8, 0.95, 1.0, 0.4))
		_txt("q_in %s" % CbKit.fmt(q_in * 1000.0, 2, "L/s"), Vector2(px + 26.0, pipe_y + 0.2 * ppm), 16, Color("#8fd3ff") if dark else Color("#0b5d95"))
	# valve wheel (turns with the opening)
	_wheel = Vector2(x0 - 0.5 * ppm, pipe_y); _wheel_r = 0.2 * ppm
	draw_rect(Rect2(_wheel.x - 7, pipe_y - pr - 0.12 * ppm, 14, 0.12 * ppm), wall_c)
	var ang := valve * TAU * 1.25
	var hot := CbKit.ACC
	draw_arc(_wheel + Vector2(0, -pr - 0.12 * ppm - 4), _wheel_r * 0.9, 0, TAU, 32, hot, 6.0)
	var hub := _wheel + Vector2(0, -pr - 0.12 * ppm - 4)
	for i in 4: draw_line(hub, hub + Vector2(cos(ang + i * PI / 2), sin(ang + i * PI / 2)) * _wheel_r * 0.9, hot, 5.0)
	draw_circle(hub, 8.0, wall_c)
	_wheel = hub
	_txt("VALVE %d %%" % int(round(valve * 100.0)), Vector2(hub.x, hub.y - _wheel_r - 14.0), 17, CbKit.TX, HORIZONTAL_ALIGNMENT_CENTER)
	# --- depth gauge (left of the tank) ---
	var gx0 := x0 - 0.42 * ppm
	draw_line(Vector2(gx0, y_o), Vector2(gx0, y_top), wall_c, 3.0)
	var hm := 0.0
	while hm <= float(rig.H) + 0.001:
		var yy2 := float(yd.call(hm)); var major := is_equal_approx(fmod(hm, 0.5), 0.0) or is_equal_approx(fmod(hm, 0.5), 0.5)
		draw_line(Vector2(gx0 - (16 if major else 8), yy2), Vector2(gx0, yy2), wall_c, 2.0 if major else 1.5)
		if major: _txt("%.1f" % hm, Vector2(gx0 - 22, yy2 + 5), 14, CbKit.DIM, HORIZONTAL_ALIGNMENT_RIGHT)
		hm += 0.1
	_txt("DEPTH m", Vector2(gx0 - 22, y_top - 14), 14, CbKit.DIM, HORIZONTAL_ALIGNMENT_RIGHT)
	if valve > 0.0 and steady > 0.0 and steady < float(rig.H) + 0.5:   # where the tank is heading: q_in = q_out
		var ys := float(yd.call(minf(steady, float(rig.H) + 0.3)))
		_dashed(Vector2(gx0 - 30, ys), Vector2(gx0 + 6, ys), CbKit.ACC2, 3.0, 5.0, 4.0)
		_txt("settles at %.2f m" % steady, Vector2(gx0 - 36, ys - 8), 14, CbKit.ACC2, HORIZONTAL_ALIGNMENT_RIGHT)
	var tip := Vector2(gx0, surf)
	draw_colored_polygon(PackedVector2Array([tip, tip + Vector2(-22, -11), tip + Vector2(-22, 11)]), CbKit.ACC)
	# --- band label and the hold counter ---
	_txt("TARGET %.1f–%.1f m" % [float(band[0]), float(band[1])], Vector2(x1 + 22.0, yb0 + 4.0), 17, bcol)
	var hp := Vector2(x1 + 22.0, yb0 + 28.0)
	for i in hold_ticks:
		var on := i < held
		draw_rect(Rect2(hp + Vector2(i * 16.0, 0), Vector2(12, 12)), CbKit.GR if on else Color(CbKit.DIM.r, CbKit.DIM.g, CbKit.DIM.b, 0.3))
	if not title_mode: _txt("held %d / %d" % [held, hold_ticks], hp + Vector2(0, 36), 15, CbKit.DIM)
	# --- depth read-out riding on the surface ---
	if not title_mode: _txt("h = %.2f m" % h_now, Vector2(cx, minf(surf, y_b - 30.0) - 14.0 - amp), 20, CbKit.TX, HORIZONTAL_ALIGNMENT_CENTER)
	if h_now >= float(rig.H) - 0.01:
		var pulse := 0.6 + 0.4 * sin(t * 8.0)
		_txt("OVERFLOW", Vector2(x1 + 22.0, y_top + 30.0), 26, Color(CbKit.RD.r, CbKit.RD.g, CbKit.RD.b, pulse))
		draw_line(Vector2(x1 + 6.0, y_top + 22.0), Vector2(x1 + 20.0, y_top + 22.0), CbKit.RD, 4.0)
