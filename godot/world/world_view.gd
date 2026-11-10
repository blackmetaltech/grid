class_name WorldView
extends Control
## The diorama: a raised slab of low-poly terrain tiles seen in 2:1 isometric projection (drawn, not a 3D scene: see docs/STATUS), with towns whose
## windows are lit by (V/Vnom)^2, plants, substations, towers and ribbons whose pulses show the flow, and a sky that follows the operator clock.
## All numbers come from WorldModel (engine queries through WorldMath); this file only draws and moves the camera.
const TW := 64.0              # tile width in world px (2:1)
const TH := 32.0
const Z_MIN := 0.45
const Z_MAX := 4.5
const SLAB := 16.0            # thickness of the diorama slab, px
const UNLIT := Color("#1B2238")

var app                       # the CbApp (for modal(), world_cover(), insets); null in tests
var cover := 0.0
var blocked := false
var title_mode := false
var cute := true              # Cute mode (Settings): bulb mascots, villagers, lighthouse, fireflies; charm encodes state, never hides numbers
var model: Dictionary = WorldModel.empty()

var _sig := ""
var _flies: Array = []        # cute: firefly anchors (tile centres)
var _tiles: Array = []        # {i, j, z, kind}
var _zgrid := {}              # Vector2i -> z px
var _objs: Array = []         # depth-sorted static objects
var _phase := {}              # line id -> pulse phase (fraction of the ribbon)
var _t := 0.0
var _rot := 0.0
var _zoom := 1.0              # user zoom on top of the fit
var _pan := Vector2.ZERO      # screen px
var _fit_s := 1.0
var _fit_o := Vector2.ZERO
var _drag := false
var _touches := {}
var _pinch_d := 0.0
var _nl := Color.WHITE        # night multiplier for colours
var _night := 1.0
var _gain := 1.0

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_PASS
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	resized.connect(_refit)
	set_process(true)

func set_cover(px: float) -> void: cover = px; _refit(); queue_redraw()
func set_blocked(b: bool) -> void: blocked = b
func set_title(on: bool) -> void: title_mode = on; queue_redraw()

# --------------------------------------------------------------------------------------------------------------------
# Model
# --------------------------------------------------------------------------------------------------------------------
func refresh(b) -> void:
	set_model(WorldModel.build(b))

func set_model(m: Dictionary) -> void:
	model = m
	var sg := JSON.stringify([m.kind, m.level, m.map, m.towns.map(func(t): return [t.id, t.pos, t.count, t.kind]), m.subs.map(func(s): return [s.id, s.pos]), m.units.map(func(u): return [u.id, u.pos, u.kind]), m.lines.map(func(l): return [l.id, l.pts, l.kind]), m.get("ghosts", []), m.shunts.map(func(h): return [h.id, h.pos])])
	if sg != _sig:
		var first := _sig == ""
		_sig = sg
		_rebuild(); _refit()
		if not first: _zoom = 1.0; _pan = Vector2.ZERO
	_night = float(m.night); _gain = WorldMath.lights_gain(_night)
	queue_redraw()

func _tc(p: Vector2) -> Vector2: return p + Vector2(0.5, 0.5)

func _infra_points() -> Array:
	var pts: Array = []
	for t in model.towns: pts.append(_tc(t.pos))
	for s in model.subs: pts.append(_tc(s.pos))
	for u in model.units: pts.append(_tc(u.pos))
	return pts

func _rebuild() -> void:
	var W := int(model.map.x); var H := int(model.map.y)
	var infra := _infra_points()
	_tiles.clear(); _zgrid.clear(); _objs.clear()
	var line_tiles := {}
	for l in model.lines:
		var pts: Array = l.pts
		for k in range(pts.size() - 1):
			var a := _tc(pts[k]); var c := _tc(pts[k + 1]); var n := int(maxf(1.0, a.distance_to(c) * 2.0))
			for q in n + 1: line_tiles[Vector2i((a.lerp(c, float(q) / float(n))).floor())] = true
	for gh in model.get("ghosts", []) + model.get("island", {}).get("routes", []):   # un-laid and alternative routes keep their ground dry too
		for k in range(gh.size() - 1):
			var a := _tc(gh[k]); var c := _tc(gh[k + 1]); var n := int(maxf(1.0, a.distance_to(c) * 2.0))
			for q in n + 1: line_tiles[Vector2i((a.lerp(c, float(q) / float(n))).floor())] = true
	if model.kind == "bench":
		_rebuild_island(W, H, infra, line_tiles)
		if cute: _rebuild_cute(W, H)
	else: _rebuild_land(W, H, infra, line_tiles)
	_rebuild_objects()

## Bench levels: one small island at 10 m a tile. Sea all round, a sand ring, the south beach strip (hut sites), mangrove in the
## middle (L01: the cable may not cross it), palms on the sand, a low rise under the hamlet.
func _rebuild_island(W: int, H: int, infra: Array, line_tiles: Dictionary) -> void:
	var isl: Dictionary = model.get("island", {})
	var beach_y: float = float(isl.get("beach_y", -1.0))
	var mang: Rect2 = isl.get("mangrove", Rect2())
	var lagoon: Rect2 = isl.get("lagoon", Rect2())
	var hill: Dictionary = isl.get("hill", {})
	var c := Vector2(W, H) * 0.5; var r := Vector2(W, H) * 0.5 - Vector2(1.5, 1.0)
	for j in H:
		for i in W:
			var q := Vector2(i + 0.5, j + 0.5)
			var dx := absf(q.x - c.x) / r.x; var dy := absf(q.y - c.y) / r.y
			var f := (dx * dx + dy * dy) * 1.18 + (WorldMath.hash2(i, j, 9) - 0.5) * 0.16 + 0.22 * sin(float(i) * 0.31 + 1.7) * cos(float(j) * 0.47 + 0.4) + 0.1 * sin(float(i) * 0.83 + float(j) * 0.61)
			var near := 99.0
			for p in infra: near = minf(near, q.distance_to(p))
			var kind := "grass"
			var keep := near < 1.5 or line_tiles.has(Vector2i(i, j))
			var on_beach := beach_y >= 0.0 and q.y > beach_y - 0.6 and q.y < beach_y + 1.6 and f < 1.3
			if (i < 1 or j < 1 or i > W - 2 or j > H - 2) and not keep: kind = "water"
			elif beach_y >= 0.0 and q.y >= beach_y + 1.6 and f > 0.45 and not keep: kind = "water"
			elif f > 1.0 and not keep and not on_beach: kind = "water"
			elif lagoon.has_point(q) and not keep: kind = "water"   # an inland lagoon: shallow water, sandy shore
			elif f > 0.86 or on_beach: kind = "sand"
			elif mang.has_point(q) and not keep: kind = "mangrove"
			elif lagoon.size.x > 0.0 and lagoon.grow(1.0).has_point(q): kind = "sand"
			var z := 0.0
			if kind == "grass": z = clampf((1.0 - f) * 9.0 - 1.5, 0.0, 8.0) + WorldMath.hash2(i, j, 5) * 1.5
			if kind == "grass" and not hill.is_empty():   # a hill: the cable climbs it
				var hd := q.distance_to(hill.pos + Vector2(0.5, 0.5)) / float(hill.r)
				if hd < 1.0: z += floorf(float(hill.h) * pow(1.0 - hd, 1.2) * clampf((0.8 - f) / 0.3, 0.0, 1.0) / 8.0) * 8.0   # terraces, 8 px a step (paddy-like); eases to the shore
			if kind == "water": z = -6.0 if not lagoon.has_point(q) else -2.5
			elif kind == "mangrove": z = 0.5
			elif kind == "sand": z = 1.0
			_zgrid[Vector2i(i, j)] = z
			_tiles.append({"i": i, "j": j, "kind": kind, "var": WorldMath.hash2(i, j, 1)})
			var free := near > 1.4 and not line_tiles.has(Vector2i(i, j))
			if kind == "mangrove":
				for k in 2: _objs.append({"t": "mangrove", "p": Vector2(i + 0.15 + 0.7 * WorldMath.hash2(i, j, 10 + k), j + 0.15 + 0.7 * WorldMath.hash2(i, j, 20 + k)), "h": 9.0 + 6.0 * WorldMath.hash2(i, j, 30 + k), "v": WorldMath.hash2(i, j, 40 + k)})
			elif kind == "sand" and free and WorldMath.hash2(i, j, 7) > 0.84:
				_objs.append({"t": "palm", "p": Vector2(i + 0.5, j + 0.5), "h": 20.0 + 10.0 * WorldMath.hash2(i, j, 8), "v": WorldMath.hash2(i, j, 11)})
			elif kind == "grass" and free and near > 2.2 and WorldMath.hash2(i, j, 7) > 0.8:
				_objs.append({"t": "tree", "p": Vector2(i + 0.5, j + 0.5), "h": 13.0 + 6.0 * WorldMath.hash2(i, j, 8), "v": WorldMath.hash2(i, j, 12)})

## Cute mode props: a lighthouse on the far point, villagers around each hamlet, firefly anchors over the mangrove.
func _rebuild_cute(W: int, H: int) -> void:
	var best := Vector2i(-1, -1); var bs := -1e9
	var infra := _infra_points()
	for l in model.lines: for q in l.pts: infra.append(_tc(q))
	for t in _tiles:   # a headland: sand next to the sea, as far as possible from the hamlet, the hut and the cable
		if t.kind != "sand" or _zgrid.get(Vector2i(t.i - 1, t.j), 0.0) > -1.0 and _zgrid.get(Vector2i(t.i, t.j - 1), 0.0) > -1.0: continue
		var sc := 99.0
		for q in infra: sc = minf(sc, Vector2(t.i + 0.5, t.j + 0.5).distance_to(q))
		if sc > bs: bs = sc; best = Vector2i(t.i, t.j)
	if best.x >= 0: _objs.append({"t": "lighthouse", "p": Vector2(best.x + 0.5, best.y + 0.5)})
	for ti in model.towns.size():
		var tw: Dictionary = model.towns[ti]
		if tw.kind != "hamlet": continue
		for k in 3:
			var a := TAU * (float(k) / 3.0 + WorldMath.hash2(ti, k, 91) * 0.2)
			_objs.append({"t": "villager", "ti": ti, "k": k, "p": _tc(tw.pos) + Vector2(cos(a), sin(a)) * 2.2, "v": WorldMath.hash2(ti, k, 92)})
	_flies.clear()
	for t in _tiles:
		if t.kind == "mangrove" and WorldMath.hash2(t.i, t.j, 93) > 0.7: _flies.append(Vector2(t.i + 0.5, t.j + 0.5))

func _rebuild_land(W: int, H: int, infra: Array, line_tiles: Dictionary) -> void:
	for j in H:
		for i in W:
			var near := 99.0
			for p in infra: near = minf(near, Vector2(i + 0.5, j + 0.5).distance_to(p))
			var river := absf(float(j) + 0.5 - (float(H) * 0.52 + sin(float(i) * 0.33 + 0.7) * 2.3 + float(i) * 0.05)) < 0.85
			var kind := "grass"
			if river and near > 1.9 and not line_tiles.has(Vector2i(i, j)): kind = "water"
			elif river or absf(float(j) + 0.5 - (float(H) * 0.52 + sin(float(i) * 0.33 + 0.7) * 2.3 + float(i) * 0.05)) < 1.5: kind = "sand" if near > 1.2 else "grass"
			elif near > 2.2 and not line_tiles.has(Vector2i(i, j)) and (sin(float(i) * 0.7 + 0.4) * sin(float(j) * 0.8 + 1.1) + WorldMath.hash2(i, j, 3) * 0.7) > 0.62: kind = "forest"
			var z := maxf(0.0, 0.5 * sin(float(i) * 0.42 + 1.3) * cos(float(j) * 0.37) + WorldMath.hash2(i, j, 5) * 0.35 - 0.05) * 14.0
			if near < 2.6: z = 0.0
			elif near < 4.0: z *= 0.35
			if kind == "water": z = -5.0
			elif kind == "sand": z = minf(z, 2.0)
			_zgrid[Vector2i(i, j)] = z
			_tiles.append({"i": i, "j": j, "kind": kind, "var": WorldMath.hash2(i, j, 1)})
			if kind == "forest":
				for k in 3: _objs.append({"t": "tree", "p": Vector2(i + 0.2 + 0.6 * WorldMath.hash2(i, j, 10 + k), j + 0.2 + 0.6 * WorldMath.hash2(i, j, 20 + k)), "h": 16.0 + 14.0 * WorldMath.hash2(i, j, 30 + k), "v": WorldMath.hash2(i, j, 40 + k)})
			elif kind == "grass" and near > 2.4 and WorldMath.hash2(i, j, 7) > 0.93:
				_objs.append({"t": "tree", "p": Vector2(i + 0.5, j + 0.5), "h": 14.0, "v": WorldMath.hash2(i, j, 8)})

func _rebuild_objects() -> void:
	for ti in model.towns.size():
		var t: Dictionary = model.towns[ti]
		var cols := int(ceil(sqrt(float(t.count) * 1.3)))
		var rows := int(ceil(float(t.count) / float(cols)))
		var kinds_big: bool = t.kind != "hamlet"
		for k in int(t.count):
			var cx := k % cols; var cy := k / cols
			var step := 0.5 if t.kind == "town" else ((1.7 if t.kind == "school" else 1.05) if model.kind == "bench" else 0.46)   # bench: 10 m tiles, homes ~10 m apart
			var p := _tc(t.pos) + Vector2((float(cx) - float(cols - 1) * 0.5) * step, (float(cy) - float(rows - 1) * 0.5) * step)
			var cdist := Vector2(float(cx) - float(cols - 1) * 0.5, float(cy) - float(rows - 1) * 0.5).length()
			var h := (12.0 + 18.0 * WorldMath.hash2(cx, cy, 50 + ti)) * (1.4 - 0.1 * cdist) if t.kind == "town" else (9.0 + 4.0 * WorldMath.hash2(cx, cy, 60)) * (2.0 if t.kind == "school" else 1.0)
			var role := ""; var bw := (0.3 if model.kind != "bench" else 0.55) if t.kind != "school" else 0.6
			if t.kind == "school" and model.kind == "bench":   # L03: the school (tall, brick) and the health post (low, white, red cross)
				role = "school" if k == 0 else "health"; h = 28.0 if k == 0 else 15.0; bw = 0.95 if k == 0 else 0.72
			_objs.append({"t": "bld", "ti": ti, "k": k, "p": p, "h": maxf(8.0, h), "w": bw, "role": role, "hamlet": t.kind == "hamlet", "v": WorldMath.hash2(cx, cy, 70 + ti)})
		if t.kind == "school" and model.kind == "bench": _objs.append({"t": "flag", "p": _tc(t.pos) + Vector2(0.0, -1.3)})
	for s in model.subs: _objs.append({"t": "sub", "p": _tc(s.pos), "s": s})
	var at_bus := {}
	for u in model.units:
		var key := Vector2i(_tc(u.pos).floor()); var n: int = at_bus.get(key, 0); at_bus[key] = n + 1
		_objs.append({"t": "unit", "p": _tc(u.pos) + Vector2(0.0, -float(n) * 1.4 + (0.0 if n == 0 else 0.0)), "u": u})
	for h in model.shunts: _objs.append({"t": "shunt", "p": _tc(h.pos) + Vector2(0.9, 0.4), "h": h})
	for li in model.lines.size():
		var l: Dictionary = model.lines[li]
		for tp in _tower_points(l): _objs.append({"t": "tower", "p": tp, "kv": l.kv})
	for o in _objs: o["d"] = o.p.x + o.p.y + (0.2 if o.t == "bld" else 0.0)
	_objs.sort_custom(func(a, b): return a.d < b.d)

func _tower_points(l: Dictionary) -> Array:
	var out: Array = []
	var pts: Array = l.pts
	for k in range(pts.size() - 1):
		var a := _tc(pts[k]); var c := _tc(pts[k + 1])
		var n := maxi(1, int(round(a.distance_to(c) / (40.0 / float(model.get("tile_m", 10.0)) if model.kind == "bench" else 1.8))))   # bench: a pole every 40 m
		for q in range(1, n): out.append(a.lerp(c, float(q) / float(n)))
	return out

func _tower_h(kv: float) -> float:
	if kv < 1.0: return 13.0
	if kv <= 11.0: return 19.0
	if kv <= 220.0: return 28.0
	return 36.0

# --------------------------------------------------------------------------------------------------------------------
# Camera
# --------------------------------------------------------------------------------------------------------------------
func _iso(x: float, y: float, z: float = 0.0) -> Vector2: return Vector2((x - y) * TW * 0.5, (x + y) * TH * 0.5 - z)

func _zat(p: Vector2) -> float: return float(_zgrid.get(Vector2i(p.floor()), 0.0))

func _view_rect() -> Rect2:
	var l := 8.0; var t := 8.0; var r := size.x - cover - 8.0; var bt := size.y - 8.0
	if app != null:
		var ins: Vector4 = app.inset
		l = 14.0 + (app.RAIL_W if CbLayout.phone else 0.0); t = app._bar_h + 12.0
		bt = size.y - (6.0 if CbLayout.phone else app._dock_h + 12.0) - ins.w
		r = size.x - cover - 14.0 - ins.z
	return Rect2(l, t, maxf(60.0, r - l), maxf(60.0, bt - t))

func _bounds() -> Rect2:
	var W: float = model.map.x; var H: float = model.map.y
	var x0 := _iso(0, H).x; var x1 := _iso(W, 0).x
	return Rect2(x0, -60.0, x1 - x0, (W + H) * TH * 0.5 + 60.0 + SLAB + 20.0)

func _refit() -> void:
	var v := _view_rect(); var b := _bounds()
	_fit_s = minf(v.size.x / b.size.x, v.size.y / b.size.y)
	_fit_o = v.get_center() - (b.position + b.size * 0.5) * _fit_s
	queue_redraw()

func _scale() -> float: return _fit_s * _zoom
## World px -> screen px.
func to_screen(p: Vector2) -> Vector2:
	var c := _view_rect().get_center()
	return c + _pan + ((p - _bounds_center()) * _scale())

func _bounds_center() -> Vector2:
	var b := _bounds(); return b.position + b.size * 0.5

func _zoom_at(screen_p: Vector2, f: float) -> void:
	var nz := clampf(_zoom * f, Z_MIN, Z_MAX); f = nz / _zoom
	var c := _view_rect().get_center() + _pan
	_pan += (screen_p - c) * (1.0 - f)   # the point under the cursor stays put
	_zoom = nz; _clamp_pan(); queue_redraw()

func _clamp_pan() -> void:
	var v := _view_rect(); var lim := Vector2(v.size.x, v.size.y) * 0.9 * maxf(1.0, _zoom * 0.8)
	_pan = _pan.clamp(-lim, lim)

## CB_CAM spec: "zoom=2,tx=12,ty=7" (tile to centre on), "reset".
func set_camera(spec: String) -> void:
	var z := 1.0; var tx := NAN; var ty := NAN
	for part in spec.split(","):
		var kv := part.strip_edges().split("=")
		if kv.size() < 2: continue
		match kv[0]:
			"zoom": z = float(kv[1])
			"tx": tx = float(kv[1])
			"ty": ty = float(kv[1])
	_zoom = clampf(z, Z_MIN, Z_MAX); _pan = Vector2.ZERO
	if not is_nan(tx) and not is_nan(ty):
		var w := _iso(tx + 0.5, ty + 0.5, 0.0)
		_pan = -(w - _bounds_center()) * _scale()
	_clamp_pan(); queue_redraw()

func pad_move(left: Vector2, right: Vector2, _trigger: float, dt: float) -> void:
	if blocked: return
	if left.length() > 0.0: _pan -= left * 520.0 * dt; _clamp_pan()
	if absf(right.y) > 0.0: _zoom_at(_view_rect().get_center() + _pan, pow(1.9, -right.y * dt))
	queue_redraw()

## Keyboard camera (arrows pan, + / - zoom, 0 resets). Returns true when handled.
func key(e: InputEventKey) -> bool:
	if not e.pressed or blocked: return false
	match e.keycode:
		KEY_EQUAL, KEY_PLUS, KEY_KP_ADD: _zoom_at(_view_rect().get_center() + _pan, 1.2)
		KEY_MINUS, KEY_KP_SUBTRACT: _zoom_at(_view_rect().get_center() + _pan, 1.0 / 1.2)
		KEY_0: _zoom = 1.0; _pan = Vector2.ZERO
		KEY_LEFT: _pan.x += 60.0
		KEY_RIGHT: _pan.x -= 60.0
		KEY_UP: _pan.y += 60.0
		KEY_DOWN: _pan.y -= 60.0
		_: return false
	_clamp_pan(); queue_redraw(); return true

func _gui_input(e: InputEvent) -> void:
	if blocked or (app != null and app.modal() != null): return
	if e is InputEventMouseButton:
		var mb := e as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_WHEEL_UP and mb.pressed: _zoom_at(mb.position, 1.12 * mb.factor if mb.factor > 0.0 else 1.12)
		elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN and mb.pressed: _zoom_at(mb.position, 1.0 / 1.12)
		elif mb.button_index in [MOUSE_BUTTON_LEFT, MOUSE_BUTTON_MIDDLE, MOUSE_BUTTON_RIGHT]: _drag = mb.pressed and _touches.size() < 2
	elif e is InputEventMouseMotion and _drag:
		_pan += (e as InputEventMouseMotion).relative; _clamp_pan(); queue_redraw()
	elif e is InputEventMagnifyGesture:
		_zoom_at((e as InputEventMagnifyGesture).position, (e as InputEventMagnifyGesture).factor)
	elif e is InputEventPanGesture:
		_pan -= (e as InputEventPanGesture).delta * 12.0; _clamp_pan(); queue_redraw()
	elif e is InputEventScreenTouch:
		var st := e as InputEventScreenTouch
		if st.pressed: _touches[st.index] = st.position
		else: _touches.erase(st.index)
		_pinch_d = 0.0
		if _touches.size() >= 2: _drag = false
	elif e is InputEventScreenDrag:
		var sd := e as InputEventScreenDrag
		_touches[sd.index] = sd.position
		if _touches.size() == 2:
			var ks := _touches.keys(); var a: Vector2 = _touches[ks[0]]; var c: Vector2 = _touches[ks[1]]
			var d := a.distance_to(c)
			if _pinch_d > 0.0 and d > 4.0: _zoom_at((a + c) * 0.5, d / _pinch_d)
			_pinch_d = d
			_pan += sd.relative * 0.5; _clamp_pan(); queue_redraw()

func _process(dt: float) -> void:
	if not is_visible_in_tree() or size.x < 4.0: return
	_t += dt; _rot += dt
	for l in model.lines:
		var ph: float = _phase.get(l.id, 0.0)
		_phase[l.id] = fposmod(ph + float(l.dir) * float(l.speed) * dt, 1.0)
	queue_redraw()

# --------------------------------------------------------------------------------------------------------------------
# Drawing helpers
# --------------------------------------------------------------------------------------------------------------------
func _c(col: Color) -> Color: return Color(col.r * _nl.r, col.g * _nl.g, col.b * _nl.b, col.a)
func _shade(col: Color, k: float) -> Color: return Color(col.r * k, col.g * k, col.b * k, col.a)

func _ell(c: Vector2, rx: float, ry: float, col: Color) -> void:
	var pts := PackedVector2Array()
	for k in 18: var a := TAU * float(k) / 18.0; pts.append(c + Vector2(cos(a) * rx, sin(a) * ry))
	draw_colored_polygon(pts, col)

func _box(p: Vector2, w: float, d: float, h: float, col: Color, base_add: float = 0.0) -> float:
	var x0 := p.x - w * 0.5; var y0 := p.y - d * 0.5; var x1 := x0 + w; var y1 := y0 + d
	var base := _zat(p) + base_add; var top := base + h
	draw_colored_polygon(PackedVector2Array([_iso(x0, y1, base), _iso(x1, y1, base), _iso(x1, y1, top), _iso(x0, y1, top)]), _c(_shade(col, 0.82)))
	draw_colored_polygon(PackedVector2Array([_iso(x1, y1, base), _iso(x1, y0, base), _iso(x1, y0, top), _iso(x1, y1, top)]), _c(_shade(col, 0.6)))
	draw_colored_polygon(PackedVector2Array([_iso(x0, y0, top), _iso(x1, y0, top), _iso(x1, y1, top), _iso(x0, y1, top)]), _c(col))
	return base

func _cyl(c: Vector2, r: float, h: float, col: Color, taper: float = 1.0) -> void:
	var rt := r * taper
	draw_colored_polygon(PackedVector2Array([c + Vector2(-r, 0), c + Vector2(r, 0), c + Vector2(rt, -h), c + Vector2(-rt, -h)]), _c(_shade(col, 0.78)))
	_ell(c, r, r * 0.5, _c(_shade(col, 0.7)))
	draw_colored_polygon(PackedVector2Array([c + Vector2(-r, 0), c + Vector2(r, 0), c + Vector2(rt, -h), c + Vector2(-rt, -h)]), _c(_shade(col, 0.82)))
	_ell(c + Vector2(0, -h), rt, rt * 0.5, _c(col))

func _windows(a: Vector2, dir: Vector2, h: float, cols: int, rows: int, energy: float, seed_v: float, flick: float) -> void:
	var b := clampf(energy * _gain * flick, 0.0, 1.0)
	var lit_col := UNLIT.lerp(WorldMath.SODIUM, b)
	for r in rows:
		for c in cols:
			var on := WorldMath.hash2(c * 31 + int(seed_v * 1000.0), r, 9) > 0.22
			var u0 := (float(c) + 0.2) / float(cols); var u1 := (float(c) + 0.8) / float(cols)
			var v0 := (float(r) + 0.25) / float(rows) * 0.8 + 0.1; var v1 := (float(r) + 0.75) / float(rows) * 0.8 + 0.1
			var up := Vector2(0, -h)
			var q := PackedVector2Array([a + dir * u0 + up * v0, a + dir * u1 + up * v0, a + dir * u1 + up * v1, a + dir * u0 + up * v1])
			draw_colored_polygon(q, lit_col if on else UNLIT)

func _glow(p: Vector2, r: float, col: Color, a: float) -> void:
	if a <= 0.01: return
	for k in 3: draw_circle(p, r * (1.0 - float(k) * 0.28), Color(col.r, col.g, col.b, a * (0.35 + 0.3 * float(k))))

# --------------------------------------------------------------------------------------------------------------------
# Draw
# --------------------------------------------------------------------------------------------------------------------
func _draw() -> void:
	if size.x < 4.0: return
	var mn: float = float(model.minute)
	_nl = WorldMath.ground_light(_night)
	_draw_sky(mn)
	if _tiles.is_empty(): return
	var s := _scale()
	var o := to_screen(Vector2.ZERO)
	draw_set_transform(o, 0.0, Vector2(s, s))
	_draw_slab()
	for t in _tiles: _draw_tile(t)
	_draw_wires()
	for ob in _objs: _draw_obj(ob)
	_draw_pulses()
	if cute and _night > 0.35: _draw_fireflies()
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	_draw_labels()

func _draw_sky(mn: float) -> void:
	var top := WorldMath.sky_top(mn); var bot := WorldMath.sky_bottom(mn)
	draw_polygon(PackedVector2Array([Vector2.ZERO, Vector2(size.x, 0), size, Vector2(0, size.y)]), PackedColorArray([top, top, bot, bot]))
	if _night > 0.3:
		for k in 70:
			var p := Vector2(WorldMath.hash2(k, 1, 77) * size.x, WorldMath.hash2(k, 2, 77) * size.y * 0.7)
			draw_circle(p, 0.8 + 1.2 * WorldMath.hash2(k, 3, 77), Color(1, 1, 1, (_night - 0.3) * (0.4 + 0.5 * WorldMath.hash2(k, 4, 77))))
	var a := (mn - 360.0) / 720.0 * PI      # sun: east at 06:00, west at 18:00
	var sun := Vector2(size.x * 0.5 - cos(a) * size.x * 0.42, size.y * 0.5 - sin(a) * size.y * 0.42)
	if sin(a) > -0.1 and sin(a) < 1.01: draw_circle(sun, 26.0, Color(1.0, 0.86, 0.55, 0.9)); draw_circle(sun, 44.0, Color(1.0, 0.8, 0.5, 0.18))
	else:
		var mo := Vector2(size.x * 0.5 + cos(a) * size.x * 0.42, size.y * 0.5 + sin(a) * size.y * 0.42)
		draw_circle(mo, 18.0, Color(0.9, 0.93, 1.0, 0.85 * _night)); draw_circle(mo, 32.0, Color(0.8, 0.85, 1.0, 0.12 * _night))

func _draw_slab() -> void:
	var W: float = model.map.x; var H: float = model.map.y
	var shadow := _iso(W * 0.5, H * 0.5, -SLAB - 6.0)
	_ell(shadow + Vector2(0, 26), (W + H) * TW * 0.27, (W + H) * TH * 0.2, Color(0, 0, 0, 0.12))

func _tile_col(t: Dictionary) -> Color:
	var v: float = t["var"]
	match t.kind:
		"water": return Color("#5FA8C8").lerp(Color("#3E86B0"), v) 
		"sand": return Color("#D8C690").lerp(Color("#C9B87F"), v)
		"forest": return Color("#5E8F58").lerp(Color("#4E7F4E"), v)
		"mangrove": return Color("#3E5E46").lerp(Color("#35523D"), v)
	return Color("#86AE6C").lerp(Color("#76A064"), v)

func _draw_tile(t: Dictionary) -> void:
	var i: int = t.i; var j: int = t.j
	var z: float = _zgrid[Vector2i(i, j)]
	var col := _tile_col(t)
	if t.kind == "grass" and z > 8.0: col = col.lerp(Color("#B8CC8A"), clampf((z - 8.0) / 90.0, 0.0, 0.55))   # the hilltop catches the light
	if t.kind == "water": col = col.lerp(Color("#0A1A2E"), 0.0)
	var cc := _c(col)
	if t.kind == "water": cc = Color(col.r * _nl.r * 0.8, col.g * _nl.g * 0.85, col.b * _nl.b * 0.95)
	var W := int(model.map.x); var H := int(model.map.y)
	# side faces: down to the slab base on the front borders, otherwise to a lower neighbour
	var zr: float = _zgrid.get(Vector2i(i + 1, j), -SLAB) if i + 1 < W else -SLAB
	var zb: float = _zgrid.get(Vector2i(i, j + 1), -SLAB) if j + 1 < H else -SLAB
	var side := Color("#7A6A58") if t.kind != "water" else Color("#2E6F94")
	if zb < z: draw_colored_polygon(PackedVector2Array([_iso(i, j + 1, z), _iso(i + 1, j + 1, z), _iso(i + 1, j + 1, zb), _iso(i, j + 1, zb)]), _c(_shade(side, 0.82)))
	if zr < z: draw_colored_polygon(PackedVector2Array([_iso(i + 1, j + 1, z), _iso(i + 1, j, z), _iso(i + 1, j, zr), _iso(i + 1, j + 1, zr)]), _c(_shade(side, 0.62)))
	draw_colored_polygon(PackedVector2Array([_iso(i, j, z), _iso(i + 1, j, z), _iso(i + 1, j + 1, z), _iso(i, j + 1, z)]), cc)
	if t.kind == "water":
		var sh := 0.5 + 0.5 * sin(_t * 1.3 + float(i) * 0.9 + float(j) * 0.6)
		draw_line(_iso(i + 0.25, j + 0.5, z), _iso(i + 0.7, j + 0.5, z), Color(1, 1, 1, 0.16 * sh * (1.0 - _night * 0.7)), 1.5)

func _draw_obj(o: Dictionary) -> void:
	match o.t:
		"tree": _tree(o)
		"palm": _palm(o)
		"lighthouse": _lighthouse(o)
		"villager": _villager(o)
		"mangrove": _mangrove(o)
		"bld": _building(o)
		"flag": _flag(o)
		"tower": _tower(o)
		"sub": _substation(o)
		"unit": _unit(o)
		"shunt": _shunt(o)

func _tree(o: Dictionary) -> void:
	var p: Vector2 = o.p; var base := _iso(p.x, p.y, _zat(p)); var h: float = o.h
	draw_line(base, base + Vector2(0, -h * 0.35), _c(Color("#5A4632")), 2.0)
	var g := Color("#3F7A44").lerp(Color("#5E9A4A"), o.v)
	draw_colored_polygon(PackedVector2Array([base + Vector2(-h * 0.3, -h * 0.25), base + Vector2(h * 0.3, -h * 0.25), base + Vector2(0, -h * 0.75)]), _c(_shade(g, 0.8)))
	draw_colored_polygon(PackedVector2Array([base + Vector2(-h * 0.24, -h * 0.5), base + Vector2(h * 0.24, -h * 0.5), base + Vector2(0, -h)]), _c(g))

func _palm(o: Dictionary) -> void:
	var p: Vector2 = o.p; var base := _iso(p.x, p.y, _zat(p)); var h: float = o.h
	var lean := (float(o.v) - 0.5) * 10.0
	var top := base + Vector2(lean, -h)
	draw_line(base, base + Vector2(lean * 0.4, -h * 0.5), _c(Color("#7A5E3E")), 2.5); draw_line(base + Vector2(lean * 0.4, -h * 0.5), top, _c(Color("#7A5E3E")), 2.0)
	var g := Color("#4F8A4A").lerp(Color("#6AA25A"), o.v)
	for k in 5:
		var a := -PI * 0.5 + (float(k) - 2.0) * 0.62 + float(o.v) * 0.4
		var tip := top + Vector2(cos(a) * h * 0.55, sin(a) * h * 0.25 + h * 0.18)
		draw_colored_polygon(PackedVector2Array([top, top.lerp(tip, 0.5) + Vector2(0, -3), tip, top.lerp(tip, 0.5) + Vector2(0, 2)]), _c(_shade(g, 0.85 + 0.15 * float(k % 2))))

func _lighthouse(o: Dictionary) -> void:
	var p: Vector2 = o.p; var base := _iso(p.x, p.y, _zat(p)); var h := 46.0
	for k in 5:
		var y0 := -h * float(k) / 5.0; var y1 := -h * float(k + 1) / 5.0; var w0 := 7.0 - float(k) * 0.7; var w1 := 7.0 - float(k + 1) * 0.7
		draw_colored_polygon(PackedVector2Array([base + Vector2(-w0, y0), base + Vector2(w0, y0), base + Vector2(w1, y1), base + Vector2(-w1, y1)]), _c(Color("#F2EEE6") if k % 2 == 0 else Color("#E5484D")))
	var lamp := base + Vector2(0, -h - 5.0)
	draw_rect(Rect2(lamp + Vector2(-4, -4), Vector2(8, 8)), _c(Color("#3A3F52")))
	draw_colored_polygon(PackedVector2Array([lamp + Vector2(-5, -4), lamp + Vector2(5, -4), lamp + Vector2(0, -10)]), _c(Color("#E5484D")))
	if _night > 0.3:
		var a := _t * 1.1
		var d := Vector2(cos(a), sin(a) * 0.5)
		var beam := PackedVector2Array([lamp, lamp + d * 170.0 + d.orthogonal() * 22.0, lamp + d * 170.0 - d.orthogonal() * 22.0])
		draw_colored_polygon(beam, Color(1.0, 0.92, 0.65, 0.10 * _night))
		_glow(lamp, 10.0, WorldMath.SODIUM, 0.5 * _night)

## A tiny round villager. Happy homes: they hop; browned out: they hold a candle; dark: they stay indoors.
func _villager(o: Dictionary) -> void:
	var t: Dictionary = model.towns[o.ti]
	var md := str(t.get("mood", "asleep"))
	if md == "asleep" and _night > 0.4: return
	var p: Vector2 = o.p; var base := _iso(p.x, p.y, _zat(p))
	var hop := absf(sin(_t * 5.0 + float(o.v) * 6.0)) * 5.0 if md == "happy" else 0.0
	var b := base + Vector2(0, -hop)
	var shirt: Color = [Color("#E5484D"), Color("#5BD69A"), Color("#6C8CFF")][int(o.k) % 3]
	_ell(base + Vector2(0, 1.4), 5.6, 2.24, Color(0, 0, 0, 0.25))
	draw_colored_polygon(PackedVector2Array([b + Vector2(-4.48, 0), b + Vector2(4.48, 0), b + Vector2(3.36, -9.8), b + Vector2(-3.36, -9.8)]), _c(shirt))
	draw_circle(b + Vector2(0, -14), 5.04, _c(Color("#C8956A").lerp(Color("#8A5A3A"), o.v)))
	draw_circle(b + Vector2(-1.68, -14.56), 0.84, Color("#2A2418")); draw_circle(b + Vector2(1.68, -14.56), 0.84, Color("#2A2418"))
	if md == "happy" and fposmod(_t * 5.0 + float(o.v) * 6.0, PI) < 1.2: draw_line(b + Vector2(4.2, -8.4), b + Vector2(8.4, -16.8), _c(Color("#C8956A")), 2.1)   # wave
	if md == "sad" or md == "worried":
		var cd := b + Vector2(5.6, -7)
		draw_line(cd, cd + Vector2(0, -5.6), Color("#F3EEDF"), 2.24); _glow(cd + Vector2(0, -8.4), 8.4, Color("#FF9A3C"), 0.35 * _night + 0.1)

func _draw_fireflies() -> void:
	for k in _flies.size():
		var a: Vector2 = _flies[k]
		var ph := _t * (0.6 + 0.3 * WorldMath.hash2(k, 1, 94)) + float(k)
		var p := _iso(a.x + 0.4 * sin(ph * 1.3), a.y + 0.4 * cos(ph), 14.0 + 6.0 * sin(ph * 2.1))
		var on := 0.5 + 0.5 * sin(ph * 3.7)
		_glow(p, 4.0, Color("#D8FF7A"), 0.5 * on * _night)
		draw_circle(p, 1.2, Color(0.9, 1.0, 0.6, on * _night))

func _mangrove(o: Dictionary) -> void:
	var p: Vector2 = o.p; var base := _iso(p.x, p.y, _zat(p)); var h: float = o.h
	var root := _c(Color("#4A3A2A"))
	for k in 3: draw_line(base + Vector2(-5 + float(k) * 5.0, 0), base + Vector2(-1 + float(k) * 1.0, -h * 0.4), root, 1.2)
	var g := Color("#2F5536").lerp(Color("#3D6B44"), o.v)
	_ell(base + Vector2(0, -h * 0.65), h * 0.75, h * 0.45, _c(_shade(g, 0.8)))
	_ell(base + Vector2(-1, -h * 0.8), h * 0.55, h * 0.33, _c(g))

func _building(o: Dictionary) -> void:
	var t: Dictionary = model.towns[o.ti]
	var e: float = t.energies[o.k]
	var p: Vector2 = o.p; var w: float = o.w; var h: float = o.h
	var wall := Color("#C9C2B0") if not o.hamlet else Color("#B89A72")
	if t.kind == "school": wall = Color("#C98C6E")
	if o.role == "health": wall = Color("#EFEBE2")
	var base := _box(p, w, w, h, wall)
	var flick := 1.0
	if float(t.v) > 0.0 and float(t.v) < 0.92: flick = 0.72 + 0.28 * sin(_t * 17.0 + float(o.k) * 2.7)
	var x0 := p.x - w * 0.5; var y1 := p.y + w * 0.5; var x1 := p.x + w * 0.5; var y0 := p.y - w * 0.5
	var cols := maxi(1, int(round(w * 8.0))); var rows := maxi(1, int(h / 9.0))
	_windows(_iso(x0, y1, base), _iso(x1, y1, base) - _iso(x0, y1, base), h, cols, rows, e, o.v, flick)
	_windows(_iso(x1, y1, base), _iso(x1, y0, base) - _iso(x1, y1, base), h, cols, rows, e, o.v + 0.37, flick)
	if o.role != "":   # hipped roof; the health post carries a red cross on its front wall
		var rc := Color("#7E3B32") if o.role == "school" else Color("#4E8C6A")
		var ap2 := _iso(p.x, p.y, base + h + 8.0)
		draw_colored_polygon(PackedVector2Array([_iso(x0, y1, base + h), _iso(x1, y1, base + h), ap2]), _c(_shade(rc, 1.1)))
		draw_colored_polygon(PackedVector2Array([_iso(x1, y1, base + h), _iso(x1, y0, base + h), ap2]), _c(_shade(rc, 0.8)))
		if o.role == "health":
			var zc := base + h * 0.5; var cr := Color("#E5484D")
			draw_colored_polygon(PackedVector2Array([_iso(p.x - 0.2, y1, zc + 2.0), _iso(p.x + 0.2, y1, zc + 2.0), _iso(p.x + 0.2, y1, zc - 2.0), _iso(p.x - 0.2, y1, zc - 2.0)]), _c(cr))
			draw_colored_polygon(PackedVector2Array([_iso(p.x - 0.07, y1, zc + 6.5), _iso(p.x + 0.07, y1, zc + 6.5), _iso(p.x + 0.07, y1, zc - 6.5), _iso(p.x - 0.07, y1, zc - 6.5)]), _c(cr))
	if o.hamlet:   # thatch roof
		var ap := _iso(p.x, p.y, base + h + 6.0)
		draw_colored_polygon(PackedVector2Array([_iso(x0, y1, base + h), _iso(x1, y1, base + h), ap]), _c(Color("#A07D3C")))
		draw_colored_polygon(PackedVector2Array([_iso(x1, y1, base + h), _iso(x1, y0, base + h), ap]), _c(Color("#7E5F2A")))
	if e > 0.0 and _night > 0.25: _glow(_iso(p.x, p.y, base + h * 0.5), 15.0 * w * 3.0, WorldMath.SODIUM, 0.035 * clampf(e, 0.0, 1.0) * _night)

## Flag pole by the school: a red pennant that ripples.
func _flag(o: Dictionary) -> void:
	var p: Vector2 = o.p; var base := _iso(p.x, p.y, _zat(p)); var top := base + Vector2(0, -52)
	draw_line(base, top, _c(Color("#D8D4CA")), 2.2)
	var wv := sin(_t * 3.0) * 3.0
	draw_colored_polygon(PackedVector2Array([top, top + Vector2(18, 3 + wv), top + Vector2(17, 9 + wv * 0.6), top + Vector2(0, 12)]), _c(Color("#E5484D")))
	draw_circle(top, 2.2, _c(Color("#F2C14E")))

func _tower(o: Dictionary) -> void:
	var p: Vector2 = o.p; var kv: float = o.kv; var h := _tower_h(kv); var base := _iso(p.x, p.y, _zat(p))
	var col := Color("#8A6A45") if kv < 1.0 else (Color("#B8B8B0") if kv <= 11.0 else Color("#9AA3B0"))
	if kv <= 11.0:
		draw_line(base, base + Vector2(0, -h), _c(col), 2.0); draw_line(base + Vector2(-6, -h + 3), base + Vector2(6, -h + 3), _c(col), 2.0)
	else:
		var w := 7.0 if kv <= 220.0 else 10.0
		draw_line(base + Vector2(-w * 0.6, 0), base + Vector2(0, -h), _c(col), 1.6); draw_line(base + Vector2(w * 0.6, 0), base + Vector2(0, -h), _c(col), 1.6)
		draw_line(base + Vector2(-w * 0.35, -h * 0.45), base + Vector2(w * 0.35, -h * 0.45), _c(col), 1.2)
		draw_line(base + Vector2(-w, -h * 0.85), base + Vector2(w, -h * 0.85), _c(col), 1.8)

func _substation(o: Dictionary) -> void:
	var p: Vector2 = o.p; var s: Dictionary = o.s
	var base := _iso(p.x, p.y, _zat(p))
	draw_colored_polygon(PackedVector2Array([_iso(p.x - 0.7, p.y - 0.7, _zat(p) + 0.5), _iso(p.x + 0.7, p.y - 0.7, _zat(p) + 0.5), _iso(p.x + 0.7, p.y + 0.7, _zat(p) + 0.5), _iso(p.x - 0.7, p.y + 0.7, _zat(p) + 0.5)]), _c(Color("#8F959E")))
	_box(p + Vector2(-0.2, 0.0), 0.35, 0.35, 9.0, Color("#6C7A8C"))
	_box(p + Vector2(0.25, 0.1), 0.25, 0.25, 6.0, Color("#7C8A9C"))
	var lamp := Color("#39D98A") if s.energised else Color("#FF3B3B")
	draw_circle(base + Vector2(0, -26), 2.5, lamp if _night > 0.2 else _c(lamp))
	if s.energised: _glow(base + Vector2(0, -26), 9.0, lamp, 0.2 * _night)

func _unit(o: Dictionary) -> void:
	var u: Dictionary = o.u; var p: Vector2 = o.p; var z0 := _zat(p); var base := _iso(p.x, p.y, z0)
	var lvl: float = u.level if u.online else 0.0
	match str(u.kind):
		"coal":
			_box(p + Vector2(0.45, 0.15), 0.8, 0.5, 12.0, Color("#8C8F96"))
			_cyl(base + Vector2(-26, 8), 17.0, 42.0, Color("#B9B4A8"), 0.72)
			draw_line(base + Vector2(18, 0), base + Vector2(18, -54), _c(Color("#7E7A74")), 5.0)
			_smoke(base + Vector2(18, -54), lvl, Color(0.55, 0.55, 0.58))
			_smoke(base + Vector2(-26, -34), lvl * 0.7, Color(0.9, 0.9, 0.95))
		"gas", "diesel", "biomass":
			_box(p, 0.8, 0.5, 14.0, Color("#9AA6B2")); _box(p + Vector2(0.55, 0.0), 0.3, 0.3, 24.0, Color("#7D8791"))
			_smoke(base + Vector2(28, -38), lvl * (0.6 if u.kind == "gas" else 1.0), Color(0.6, 0.6, 0.64))
		"nuclear":
			_box(p + Vector2(0.4, 0.3), 0.7, 0.4, 12.0, Color("#B4BAC4"))
			_ell(base + Vector2(-14, 0), 24.0, 12.0, _c(Color("#C9CED6")))
			var dome := PackedVector2Array()
			for k in 13: var a := PI * float(k) / 12.0; dome.append(base + Vector2(-14, 0) + Vector2(-cos(a) * 24.0, -sin(a) * 30.0))
			draw_colored_polygon(dome, _c(Color("#DADFE6")))
		"hydro", "psp":
			var wa := Color("#5FA8C8")
			draw_colored_polygon(PackedVector2Array([base + Vector2(-34, -2), base + Vector2(34, -2), base + Vector2(34, -26), base + Vector2(-34, -26)]), _c(Color("#A7A39A")))
			for k in 4: draw_line(base + Vector2(-30 + float(k) * 18.0, -24 + fposmod(_t * 14.0 * (0.2 + lvl) + float(k) * 5.0, 22.0)), base + Vector2(-30 + float(k) * 18.0, -22 + fposmod(_t * 14.0 * (0.2 + lvl) + float(k) * 5.0, 22.0)), _c(wa), 2.0)
		"pv":
			for r in 3:
				var rb := base + Vector2(float(r) * 16.0 - 16.0, float(r) * 8.0 - 8.0)
				draw_colored_polygon(PackedVector2Array([rb + Vector2(-22, 0), rb + Vector2(18, -6), rb + Vector2(18, -16), rb + Vector2(-22, -10)]), _c(Color("#2E4B8F").lerp(Color("#5F8FE0"), (1.0 - _night) * 0.8)))
		"wind":
			var hub := base + Vector2(0, -50)
			draw_line(base, hub, _c(Color("#E0E4EA")), 3.0)
			var ang: float = _rot * (0.4 + 5.0 * float(u.rotor))
			for k in 3:
				var a: float = ang + TAU * float(k) / 3.0
				draw_line(hub, hub + Vector2(cos(a), sin(a)) * 24.0, _c(Color("#F0F3F7")), 2.5)
		"hut", "bench":
			var top := _box(p, 0.9, 0.7, 13.0, Color("#D9CBA6"))   # little hut: plank walls, tin roof, solar panel, a battery sign
			var ap := _iso(p.x, p.y, top + 13.0 + 7.0)
			draw_colored_polygon(PackedVector2Array([_iso(p.x - 0.45, p.y + 0.35, top + 13.0), _iso(p.x + 0.45, p.y + 0.35, top + 13.0), ap]), _c(Color("#8E99A8")))
			draw_colored_polygon(PackedVector2Array([_iso(p.x + 0.45, p.y + 0.35, top + 13.0), _iso(p.x + 0.45, p.y - 0.35, top + 13.0), ap]), _c(Color("#6E7988")))
			draw_colored_polygon(PackedVector2Array([_iso(p.x - 0.4, p.y - 0.3, top + 17.0), _iso(p.x + 0.1, p.y - 0.3, top + 21.0), _iso(p.x + 0.1, p.y + 0.2, top + 21.0), _iso(p.x - 0.4, p.y + 0.2, top + 17.0)]), _c(Color("#2E4B8F").lerp(Color("#5F8FE0"), (1.0 - _night) * 0.7)))
			var sg := _iso(p.x + 0.45, p.y + 0.1, top + 7.0)   # battery sign on the wall: lit cells when it is feeding the cable
			draw_rect(Rect2(sg + Vector2(-7, -4), Vector2(12, 8)), Color("#2A2418")); draw_rect(Rect2(sg + Vector2(5, -2), Vector2(2, 4)), Color("#2A2418"))
			for k in 3: draw_rect(Rect2(sg + Vector2(-6 + k * 4, -3), Vector2(3, 6)), Color("#5BD69A") if u.online else Color("#46506A"))
			if u.online: _glow(sg, 10.0, Color("#5BD69A"), 0.25)
		_:
			_cyl(base + Vector2(-8, 6), 14.0, 20.0, Color("#B0B6C0"))
	if u.online and str(u.kind) in ["coal", "gas", "nuclear", "hydro", "diesel", "biomass", "psp"]:
		draw_rect(Rect2(base + Vector2(-20, 12), Vector2(40.0 * lvl, 4.0)), _c(WorldMath.CYAN))
		draw_rect(Rect2(base + Vector2(-20, 12), Vector2(40.0, 4.0)), Color(1, 1, 1, 0.15), false, 1.0)

func _smoke(top: Vector2, lvl: float, col: Color) -> void:
	if lvl <= 0.02: return
	for k in 5:
		var ph := fposmod(_t * 0.28 + float(k) / 5.0, 1.0)
		draw_circle(top + Vector2(ph * 16.0, -ph * 46.0), 4.0 + ph * 9.0 * (0.5 + lvl), Color(col.r * _nl.r, col.g * _nl.g, col.b * _nl.b, (1.0 - ph) * 0.5 * clampf(lvl, 0.0, 1.0)))

func _shunt(o: Dictionary) -> void:
	var h: Dictionary = o.h; var p: Vector2 = o.p; var base := _iso(p.x, p.y, _zat(p))
	for k in maxi(1, int(h.steps)):
		var on := k < int(h.on)
		var c := base + Vector2(float(k) * 9.0 - 4.0, float(k) * 4.0)
		_cyl(c, 4.5, 14.0, Color("#E0B050") if on else Color("#7A7F88"))
		if on: _glow(c + Vector2(0, -8), 8.0, WorldMath.REACTIVE, 0.22)

func _line_poly(l: Dictionary, off: float) -> PackedVector2Array:
	var out := PackedVector2Array()
	var pts: Array = []
	var raw: Array = l.pts
	for k in raw.size(): pts.append(_tc(raw[k]))
	var th := _tower_h(float(l.kv))
	var slack := 1.0 if l.in_service else 2.4
	var sag := (2.0 + 5.0 * clampf(float(l.loading), 0.0, 1.5)) * slack
	for k in range(pts.size() - 1):
		var a: Vector2 = pts[k]; var c: Vector2 = pts[k + 1]
		var spans := maxi(1, int(round(a.distance_to(c) / 1.8)))
		for sidx in spans:
			for q in 5:
				var u := (float(sidx) + float(q) / 5.0) / float(spans)
				var w := a.lerp(c, u); var su := fposmod(u * float(spans), 1.0)
				var z := _zat(w) + th - sag * 4.0 * su * (1.0 - su)
				out.append(_iso(w.x, w.y, z) + Vector2(off, 0))
	var e: Vector2 = pts[pts.size() - 1]
	out.append(_iso(e.x, e.y, _zat(e) + th) + Vector2(off, 0))
	return out

func _offsets(l: Dictionary) -> Array:
	return [0.0] if int(l.circuits) <= 1 else [-4.0, 4.0]

func _draw_wires() -> void:
	for gh in model.get("ghosts", []):   # surveyed route, cable not yet laid: faint dashes
		var gl := {"pts": gh, "kv": 0.048, "in_service": true, "loading": 0.0}
		var gp := _line_poly(gl, 0.0)
		var k := 0
		while k + 3 < gp.size():
			draw_line(gp[k], gp[k + 3], Color(0.96, 0.92, 0.78, 0.55), 2.0, true); k += 8
	for l in model.lines:
		for off in _offsets(l):
			var poly := _line_poly(l, off)
			if poly.size() < 2: continue
			if str(l.kind) == "cable" and l.get("mm2") != null:   # bench cables: copper you can see; width ∝ conductor diameter ∝ sqrt(area)
				var cw := (1.2 + 1.1 * sqrt(float(l.mm2))) / maxf(_scale(), 0.01) * clampf(_scale(), 0.6, 2.0)
				draw_polyline(poly, _c(Color("#1C1712")), cw + 2.5, true)
				draw_polyline(poly, _c(Color("#C8794A")), cw, true)
				draw_polyline(poly, _c(Color("#F0B58A")), maxf(0.8, cw * 0.3), true)
				continue
			draw_polyline(poly, _c(Color("#1A1F30")) if l.in_service else Color(0.35, 0.37, 0.45, 0.8), float(l.width) + 2.0 if l.in_service else 1.5, true)
			if l.in_service: draw_polyline(poly, Color(l.color.r, l.color.g, l.color.b, 0.9), float(l.width) * 0.75, true)

func _poly_at(poly: PackedVector2Array, cum: PackedFloat32Array, f: float) -> Vector2:
	var tot: float = cum[cum.size() - 1]
	var d := f * tot
	for k in range(1, cum.size()):
		if cum[k] >= d:
			var seg: float = maxf(cum[k] - cum[k - 1], 0.0001)
			return poly[k - 1].lerp(poly[k], (d - cum[k - 1]) / seg)
	return poly[poly.size() - 1]

func _draw_pulses() -> void:
	for l in model.lines:
		if not l.in_service or l.dir == 0 or l.speed <= 0.0: continue
		for off in _offsets(l):
			var poly := _line_poly(l, off)
			if poly.size() < 2: continue
			var cum := PackedFloat32Array([0.0])
			for k in range(1, poly.size()): cum.append(cum[k - 1] + poly[k].distance_to(poly[k - 1]))
			var tot: float = cum[cum.size() - 1]
			var n := clampi(int(tot / 55.0), 3, 16)
			var ph: float = _phase.get(l.id, 0.0)
			var col: Color = l.color
			for k in n:
				var f := fposmod(ph + float(k) / float(n), 1.0)
				var p := _poly_at(poly, cum, f)
				var r: float = float(l.width) * 0.5 + 1.8
				draw_circle(p, r * 2.3, Color(col.r, col.g, col.b, 0.22)); draw_circle(p, r, col.lerp(Color.WHITE, 0.35))
		if float(l.loading) > 1.0:   # countdown ring on the hot span: the heat used before the relay trips
			var poly2 := _line_poly(l, 0.0)
			var mid := poly2[poly2.size() / 2]
			draw_arc(mid, 17.0, -PI * 0.5, -PI * 0.5 + TAU * clampf(float(l.overload), 0.03, 1.0), 28, WorldMath.RED, 3.0, true)
			draw_arc(mid, 17.0, 0.0, TAU, 28, Color(1, 0.23, 0.23, 0.25), 1.5, true)

func _draw_labels() -> void:
	var font := CbKit.font_regular()
	var fs := 13 if size.x < 1400.0 else 15
	for t in model.towns:
		if t.kind == "school" or t.kind == "hamlet":
			if not t.has("volts"): continue
			var sp := to_screen(_iso(_tc(t.pos).x, _tc(t.pos).y, 56.0))
			var txt := tr("WORLD_DARK") if float(t.v) <= 0.0 else tr("WORLD_VOLTS_FMT") % float(t.volts)
			if cute and t.has("mood"):
				var r := 15.0 * (fs / 15.0) * clampf(_scale() * 1.4, 0.8, 1.6)
				_bulb_mascot(sp + Vector2(0, -r - 6.0), r, str(t.mood), clampf(float(t.v) * float(t.v), 0.0, 1.0))
			_label(font, fs, sp + Vector2(0, fs + 4.0) if cute else sp, txt, WorldMath.SODIUM if float(t.v) > 0.0 else WorldMath.GREY)
			continue
		var sp2 := to_screen(_iso(_tc(t.pos).x, _tc(t.pos).y, 70.0))
		var v: float = t.v
		var arrow := "▼ " if v < 0.95 else ("▲ " if v > 1.05 else "")
		var txt2 := tr("WORLD_DARK") if v <= 0.0 else tr("WORLD_BUS_FMT") % [arrow, v]
		var col := WorldMath.GREY if v <= 0.0 else (WorldMath.AMBER if (v < 0.95 or v > 1.05) else WorldMath.WHITE)
		_label(font, fs, sp2, "%s  %s" % [str(t.name), txt2], col)
	for s in model.subs:
		if s.has("v") and float(s.v) > 0.0 and s.id != "j" and not str(s.id).begins_with("c"):
			var sp3 := to_screen(_iso(_tc(s.pos).x, _tc(s.pos).y, 40.0))
			var vs: float = s.v; var ar := "▼ " if vs < 0.95 else ("▲ " if vs > 1.05 else "")
			_label(font, fs, sp3, tr("WORLD_BUS_FMT") % [ar, vs], WorldMath.AMBER if (vs < 0.95 or vs > 1.05) else WorldMath.WHITE)
	for l in model.lines:
		if l.in_service and float(l.loading) >= 0.9 and str(l.kind) != "cable":
			var poly := _line_poly(l, 0.0)
			_label(font, fs, to_screen(poly[poly.size() / 2]) + Vector2(0, -26), tr("WORLD_LOAD_FMT") % int(round(float(l.loading) * 100.0)), l.color)

## A round bulb with a face. `glow` = (V/V0)^2 (brightness of the homes); the face is WorldMath.mood (band vs the level's limit).
func _bulb_mascot(c: Vector2, r: float, md: String, glow: float) -> void:
	var lit := md != "asleep"
	var glass := Color("#7A6A4E").lerp(Color("#FFF3C4"), glow) if lit else Color("#5B6178")
	if lit: _glow(c, r * (1.6 + glow), WorldMath.SODIUM, 0.10 + 0.25 * glow)
	var bob := sin(_t * 4.0) * 2.0 if md == "happy" else (sin(_t * 30.0) * 0.8 if md == "sad" else 0.0)
	c += Vector2(bob if md == "sad" else 0.0, -absf(bob) if md == "happy" else 0.0)
	draw_rect(Rect2(c + Vector2(-r * 0.38, r * 0.72), Vector2(r * 0.76, r * 0.42)), Color("#8D93A6"))           # screw base
	draw_line(c + Vector2(-r * 0.38, r * 0.86), c + Vector2(r * 0.38, r * 0.86), Color("#6C7286"), 1.5)
	draw_circle(c, r, glass)
	draw_arc(c, r, 0.0, TAU, 32, Color("#2A2418", 0.55), 1.5)
	var ink := Color("#2A2418")
	var ey := c + Vector2(0, -r * 0.12); var ex := r * 0.34
	match md:
		"asleep":
			draw_arc(ey + Vector2(-ex, 0), r * 0.13, 0.2, PI - 0.2, 8, ink, 1.6); draw_arc(ey + Vector2(ex, 0), r * 0.13, 0.2, PI - 0.2, 8, ink, 1.6)
			var font := CbKit.font_regular(); var zf := int(r * 0.7)
			draw_string(font, c + Vector2(r * 0.8, -r * 0.6 - fposmod(_t * 6.0, 6.0)), "z", HORIZONTAL_ALIGNMENT_LEFT, -1, zf, Color(1, 1, 1, 0.7))
		_:
			var blink := fposmod(_t + float(int(c.x) % 7) * 0.3, 3.6) < 0.12
			for sx in [-1.0, 1.0]:
				var e: Vector2 = ey + Vector2(sx * ex, 0)
				if blink: draw_line(e + Vector2(-r * 0.1, 0), e + Vector2(r * 0.1, 0), ink, 1.6)
				else: draw_circle(e, r * 0.1, ink)
				if md == "worried": draw_line(e + Vector2(-sx * r * 0.14, -r * 0.26), e + Vector2(sx * r * 0.12, -r * 0.18), ink, 1.4)
				if md == "sad": draw_line(e + Vector2(-sx * r * 0.14, -r * 0.18), e + Vector2(sx * r * 0.12, -r * 0.27), ink, 1.4)
			var m := c + Vector2(0, r * 0.3)
			match md:
				"happy": draw_arc(m + Vector2(0, -r * 0.12), r * 0.3, 0.35, PI - 0.35, 12, ink, 1.8); draw_circle(c + Vector2(-r * 0.55, r * 0.15), r * 0.12, Color(1.0, 0.55, 0.5, 0.45)); draw_circle(c + Vector2(r * 0.55, r * 0.15), r * 0.12, Color(1.0, 0.55, 0.5, 0.45))
				"worried": draw_line(m + Vector2(-r * 0.2, 0), m + Vector2(r * 0.2, -r * 0.04), ink, 1.6); draw_circle(c + Vector2(r * 0.72, -r * 0.45), r * 0.1, Color("#7FC8FF"))
				"sad": draw_arc(m + Vector2(0, r * 0.18), r * 0.24, PI + 0.4, TAU - 0.4, 12, ink, 1.8); draw_circle(ey + Vector2(ex, r * 0.25 + fposmod(_t * 8.0, r * 0.5)), r * 0.07, Color("#7FC8FF"))

func _label(font: Font, fs: int, at: Vector2, txt: String, col: Color) -> void:
	var w := font.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	var p := at - Vector2(w * 0.5, 0.0)
	draw_rect(Rect2(p + Vector2(-5, -fs - 1), Vector2(w + 10, fs + 8)), Color(0.04, 0.06, 0.14, 0.72))
	draw_string(font, p, txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, col)
