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

signal tapped(pos: Vector2)         ## a click / tap that did not drag (local coordinates)
signal long_pressed(pos: Vector2)   ## a press held in place for LONG_S (touch: opens a tag)
signal hovered(pos: Vector2)        ## mouse moved over the world with no button held
signal ground_pressed(m: Vector2, button: int)   ## a tap / left or right click on the map (no drag): the map point in metres (terrain maps), button = MOUSE_BUTTON_*
signal route_item_pressed(kind: String, branch_id: String, index: int)   ## a tap on a support ("support") or a span ("span") of a BUILT route (within ROUTE_HIT_PX)
const ROUTE_HIT_PX := 12.0
const PXM := RouteDraw.PX_PER_M
const TAP_PX := 10.0
const LONG_S := 0.55
var _pegs: Array = []               # [{tile: Vector2, label: String}] glowing site pegs (the kit tray's legal sites)
var _peg_hi := -1
var _press := false
var _press_pos := Vector2.ZERO
var _press_moved := 0.0
var _press_t := 0.0
var _press_long := false
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
var _ga := 1.0                # alpha multiplier of _c(): 0.55 while the ghost route is drawn
var _zmax := 0.0              # highest terrain z (px): the camera frame leaves room above it
var _route_poly := {}         # built route (branch id) -> PackedVector2Array: the middle phase wire in world px, raised a little (flow pulses ride on it)
var _objs_s: Array = []       # _objs split by layer (static / animated), same depth order
var _objs_d: Array = []
var _ghost := {}              # the not-yet-built plan being previewed (RouteDraw record) or {}
var _ghost_refused := false   # the engine refused the pending path: it is drawn red, the offending tile gets an X
var _ghost_bad_tile := -1
var _ghost_pending: Array = []   # waypoints (metres) the player has already clicked
var _town_rect := Rect2()     # tiles of the terrain's town area (the market's roofs stand on it)
var _town_areas: Array = []   # each connected block of town tiles: {rect: Rect2, tiles: Array[Vector2i]} (the market, the harbour, ...)
var _known_routes := {}       # branch id -> true: a route that was not here before makes a lineman climb
var _known_level := ""
var _lineman := {"t0": -100.0, "rid": "", "i": 0}
var _rpress := false
var _rpress_moved := 0.0

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_PASS
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	resized.connect(_refit)
	set_process(true)
	_make_layers()

func set_cover(px: float) -> void: cover = px; _refit(); queue_redraw()
func set_blocked(b: bool) -> void: blocked = b
func set_title(on: bool) -> void: title_mode = on; repaint_static(); queue_redraw()

# --------------------------------------------------------------------------------------------------------------------
# Model
# --------------------------------------------------------------------------------------------------------------------
func refresh(b) -> void:
	var t0 := Time.get_ticks_usec()
	set_model(WorldModel.build(b))
	perf.model_us += Time.get_ticks_usec() - t0; perf.models += 1

func set_model(m: Dictionary) -> void:
	model = m
	var sg := JSON.stringify([m.kind, m.level, m.map, m.towns.map(func(t): return [t.id, t.pos, t.count, t.kind]), m.subs.map(func(s): return [s.id, s.pos]), m.units.map(func(u): return [u.id, u.pos, u.kind]), m.lines.map(func(l): return [l.id, l.pts, l.kind]), m.get("ghosts", []), m.shunts.map(func(h): return [h.id, h.pos]), m.get("terrain", {}).get("id", ""), m.routes.map(func(r): return [r.id, r.supports.size(), r.spans.map(func(sp): return sp.band)])])
	_track_new_routes(m)
	if sg != _sig:
		var first := _sig == ""
		_sig = sg
		_rebuild(); _refit()
		if not first: _zoom = 1.0; _pan = Vector2.ZERO
	_night = float(m.night); _gain = WorldMath.lights_gain(_night); _nl = WorldMath.ground_light(_night)
	var key := JSON.stringify([_sig, snappedf(_night, 0.01), cute, m.lines.map(func(l): return [l.band, l.in_service, l.get("mm2")])])
	if key != _static_key: _static_key = key; repaint_static()
	_sync_layers()
	queue_redraw()

func _tc(p: Vector2) -> Vector2: return p + Vector2(0.5, 0.5)

## Cute: a lineman climbs the newest support for 2 s when a route appears that was not in the previous model (not on a level's first model).
func _track_new_routes(m: Dictionary) -> void:
	var lv := str(m.level)
	var fresh := lv != _known_level or _sig == ""
	_known_level = lv
	var ids := {}
	for r in m.routes:
		ids[r.id] = true
		if not fresh and not _known_routes.has(r.id) and r.supports.size() > 0:
			_lineman = {"t0": _t, "rid": str(r.id), "i": r.supports.size() - 1}
	_known_routes = ids

func _infra_points() -> Array:
	var pts: Array = []
	for t in model.towns: pts.append(_tc(t.pos))
	for s in model.subs: pts.append(_tc(s.pos))
	for u in model.units: pts.append(_tc(u.pos))
	return pts

func _has_terrain() -> bool: return model.has("terrain") and not (model.terrain as Dictionary).is_empty()

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
	elif _has_terrain(): _rebuild_terrain()
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
	var infra: Array = []   # towns only: the lighthouse is a landmark and must not jump when the player moves the hut or re-lays the cable
	for tw in model.towns: infra.append(_tc(tw.pos))
	for t in _tiles:   # a headland: sand next to the sea, as far as possible from the towns
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

## Terrain maps (grid levels with world.terrain, e.g. L05): one iso tile per terrain tile at z = elevation m x 0.9, so the ridge reads as a ridge and rivers
## and sea sit low. Forest tiles carry trees except where a built route's spans over forest clear the right of way; swamp carries mangrove, rock boulders.
func _rebuild_terrain() -> void:
	var T: Dictionary = model.terrain
	var W := int(T.cols); var H := int(T.rows)
	var kinds: PackedStringArray = T.kinds; var elev: PackedFloat32Array = T.elev
	var cleared := {}
	for r in model.routes:   # the right of way a line has paid for: tiles under its spans over forest
		for sp in r.spans:
			if not (sp.over as Array).has("forest"): continue
			var a: Vector2 = r.supports[sp.a].p; var c: Vector2 = r.supports[sp.b].p
			var n := int(maxf(2.0, a.distance_to(c) * 4.0))
			for q in n + 1: cleared[Vector2i(a.lerp(c, float(q) / float(n)).floor())] = true
	_zmax = 0.0
	var tx0 := 1e9; var ty0 := 1e9; var tx1 := -1.0; var ty1 := -1.0
	for j in H:
		for i in W:
			var idx := j * W + i
			var kind := kinds[idx]
			var z := elev[idx] * PXM
			_zgrid[Vector2i(i, j)] = z
			_zmax = maxf(_zmax, z)
			_tiles.append({"i": i, "j": j, "kind": kind, "var": WorldMath.hash2(i, j, 1)})
			match kind:
				"forest":
					if cleared.has(Vector2i(i, j)): continue
					var nt := 2 + (1 if WorldMath.hash2(i, j, 6) > 0.55 else 0)
					for k in nt: _objs.append({"t": "tree", "p": Vector2(i + 0.2 + 0.6 * WorldMath.hash2(i, j, 10 + k), j + 0.2 + 0.6 * WorldMath.hash2(i, j, 20 + k)), "h": 17.0 + 11.0 * WorldMath.hash2(i, j, 30 + k), "v": WorldMath.hash2(i, j, 40 + k)})
				"swamp":
					if WorldMath.hash2(i, j, 7) > 0.3: _objs.append({"t": "mangrove", "p": Vector2(i + 0.2 + 0.6 * WorldMath.hash2(i, j, 10), j + 0.2 + 0.6 * WorldMath.hash2(i, j, 20)), "h": 9.0 + 6.0 * WorldMath.hash2(i, j, 30), "v": WorldMath.hash2(i, j, 40)})
				"rock":
					for k in 2: _objs.append({"t": "boulder", "p": Vector2(i + 0.2 + 0.6 * WorldMath.hash2(i, j, 50 + k), j + 0.2 + 0.6 * WorldMath.hash2(i, j, 60 + k)), "w": 0.14 + 0.12 * WorldMath.hash2(i, j, 70 + k), "h": 3.0 + 4.0 * WorldMath.hash2(i, j, 80 + k), "v": WorldMath.hash2(i, j, 90 + k)})
				"town":
					tx0 = minf(tx0, i); ty0 = minf(ty0, j); tx1 = maxf(tx1, i + 1); ty1 = maxf(ty1, j + 1)
	_town_rect = Rect2(tx0, ty0, tx1 - tx0, ty1 - ty0) if tx1 > 0.0 else Rect2()
	_town_areas = []
	var seen := {}
	for j in H:   # flood fill: separate towns stay separate (one bounding box over the market and the harbour would put the market's square in the fields)
		for i in W:
			if kinds[j * W + i] != "t" and kinds[j * W + i] != "town": continue
			if seen.has(Vector2i(i, j)): continue
			var q: Array = [Vector2i(i, j)]; seen[Vector2i(i, j)] = true; var tiles: Array = []; var r := Rect2(i, j, 1, 1)
			while not q.is_empty():
				var c: Vector2i = q.pop_back(); tiles.append(c); r = r.merge(Rect2(c.x, c.y, 1, 1))
				for d in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
					var n: Vector2i = c + d
					if n.x < 0 or n.y < 0 or n.x >= W or n.y >= H or seen.has(n): continue
					var kn := kinds[n.y * W + n.x]
					if kn == "t" or kn == "town": seen[n] = true; q.append(n)
			_town_areas.append({"rect": r, "tiles": tiles})
	_rebuild_terrain_cute()

## The block of town tiles a town stands in (or next to, within 14 tiles of its centre); {} when none.
func _area_near(p: Vector2) -> Dictionary:
	var best := {}; var bd := 14.0
	for a in _town_areas:
		var d := ((a.rect as Rect2).get_center()).distance_to(p)
		if d < bd: bd = d; best = a
	return best

## Cute mode on a terrain map: crocodiles by the pile foundations in the swamp, market stalls on the town square (lamps follow the town's energies).
func _rebuild_terrain_cute() -> void:
	for r in model.routes:
		var last := -99
		for i in r.supports.size():
			var s: Dictionary = r.supports[i]
			if str(s.foundation) != "pile": continue
			if i - last >= 3:   # one crocodile per three piled supports, lazing on the nearest swamp tile beside the line
				var d: Vector2 = s.dir
				var side := Vector2(-d.y, d.x) * (0.55 if (i % 2) == 0 else -0.55)
				_objs.append({"t": "croc", "p": (s.p as Vector2) + side, "rid": str(r.id), "i": i, "v": WorldMath.hash2(i, 3, 95)})
				last = i
	var sw: Array = []; var sc := Vector2.ZERO   # the swamp's resident crocodile: sulks until a line stands on piles
	for t in _tiles: if t.kind == "swamp": sw.append(Vector2(t.i + 0.5, t.j + 0.5)); sc += Vector2(t.i + 0.5, t.j + 0.5)
	if not sw.is_empty():
		sc /= float(sw.size()); var best: Vector2 = sw[0]
		for q in sw: if q.distance_to(sc) < best.distance_to(sc) and WorldMath.hash2(int(q.x), int(q.y), 97) > 0.5: best = q
		_objs.append({"t": "croc", "p": best, "res": true, "rid": "", "i": 0, "v": 0.37})
	for ti in model.towns.size():
		var ar := _area_near(_tc(model.towns[ti].pos))
		if ar.is_empty(): continue
		var c := (ar.rect as Rect2).get_center()
		if true:
			for k in 5:
				var a := TAU * (float(k) / 5.0) + 0.4
				_objs.append({"t": "stall", "ti": ti, "k": k, "p": c + Vector2(cos(a) * 2.6, sin(a) * 2.6), "v": WorldMath.hash2(ti, k, 96)})

func _rebuild_objects() -> void:
	for ti in model.towns.size():
		var t: Dictionary = model.towns[ti]
		var cols := int(ceil(sqrt(float(t.count) * 1.3)))
		var rows := int(ceil(float(t.count) / float(cols)))
		var kinds_big: bool = t.kind != "hamlet"
		var ctr := _tc(t.pos); var tstep := 0.0; var tw_scale := 1.0
		if _has_terrain() and t.kind == "town":   # a market town on the 50 m map: houses on its own block of town tiles, the stalls' square left open in the middle
			var ar := _area_near(ctr)
			if not ar.is_empty():
				var c0 := (ar.rect as Rect2).get_center(); var n := 0
				var sq := 3.4 if minf((ar.rect as Rect2).size.x, (ar.rect as Rect2).size.y) >= 7.0 else 0.0   # only a big town keeps an open market square
				for tl in ar.tiles:
					var tp := Vector2(tl.x + 0.5, tl.y + 0.5)
					if tp.distance_to(c0) < sq or WorldMath.hash2(tl.x, tl.y, 77) < 0.42: continue
					var off := Vector2(WorldMath.hash2(tl.x, tl.y, 78) - 0.5, WorldMath.hash2(tl.x, tl.y, 79) - 0.5) * 0.3
					_objs.append({"t": "bld", "ti": ti, "k": n % int(t.count), "p": tp + off, "h": 12.0 + 18.0 * WorldMath.hash2(tl.x, tl.y, 80), "w": 0.55 + 0.2 * WorldMath.hash2(tl.x, tl.y, 81), "role": "", "hamlet": false, "v": WorldMath.hash2(tl.x, tl.y, 82)})
					n += 1
				continue
			tstep = 1.3; tw_scale = 2.0
		for k in int(t.count):
			var cx := k % cols; var cy := k / cols
			var step := tstep if tstep > 0.0 else 0.5 if t.kind == "town" else ((1.7 if t.kind == "school" else 1.05) if model.kind == "bench" else 0.46)   # bench: 10 m tiles, homes ~10 m apart
			var p := ctr + Vector2((float(cx) - float(cols - 1) * 0.5) * step, (float(cy) - float(rows - 1) * 0.5) * step)
			var cdist := Vector2(float(cx) - float(cols - 1) * 0.5, float(cy) - float(rows - 1) * 0.5).length()
			var h := (12.0 + 18.0 * WorldMath.hash2(cx, cy, 50 + ti)) * (1.4 - 0.1 * cdist) if t.kind == "town" else (9.0 + 4.0 * WorldMath.hash2(cx, cy, 60)) * (2.0 if t.kind == "school" else 1.0)
			var role := ""; var bw := ((0.3 * tw_scale) if model.kind != "bench" else 0.55) if t.kind != "school" else 0.6
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
		if not _route_of(str(l.id)).is_empty(): continue   # a routed line stands on its planned supports, not on the generic tower rhythm
		for tp in _tower_points(l): _objs.append({"t": "tower", "p": tp, "kv": l.kv})
	_route_poly.clear()
	for r in model.routes:
		for i in r.supports.size(): _objs.append({"t": "support", "p": r.supports[i].p, "s": r.supports[i]})
		for sp in r.spans: _objs.append({"t": "span", "p": ((r.supports[sp.a].p as Vector2) + (r.supports[sp.b].p as Vector2)) * 0.5, "dd": maxf((r.supports[sp.a].p as Vector2).x + (r.supports[sp.a].p as Vector2).y, (r.supports[sp.b].p as Vector2).x + (r.supports[sp.b].p as Vector2).y) + 0.02, "r": r, "sp": sp})
		_route_poly[str(r.id)] = _route_line(r)
	for o in _objs: o["d"] = float(o.get("dd", o.p.x + o.p.y + (0.2 if o.t == "bld" else 0.0)))
	_objs.sort_custom(func(a, b): return a.d < b.d)
	_objs_s.clear(); _objs_d.clear()
	for o in _objs: (_objs_s if STATIC_T.has(o.t) else _objs_d).append(o)

func _route_of(id: String) -> Dictionary:
	for r in model.routes: if str(r.id) == id: return r
	return {}

## The middle phase wire of a whole route as one polyline in world px (flow pulses ride on it, 5 px above the copper).
func _route_line(r: Dictionary) -> PackedVector2Array:
	var out := PackedVector2Array()
	for sp in r.spans:
		var w := _span_wire(r, sp, 0)
		for q in w.size(): out.append(w[q] + Vector2(0.0, -5.0))
	return out

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
		l = 14.0 + ins.x + (app.RAIL_W if CbLayout.phone else 0.0); t = app._bar_h + 12.0 + ins.y   # the world itself is full-bleed; only the framed island keeps clear of the notch
		bt = size.y - (6.0 if CbLayout.phone else app._dock_h + 12.0) - ins.w
		if CbLayout.phone and _has_terrain(): bt = minf(bt, size.y * 0.74)   # a long terrain map on a phone: keep both ends above the tray and the budget tag (the market sat under them)
		r = size.x - cover - 14.0 - ins.z
	return Rect2(l, t, maxf(60.0, r - l), maxf(60.0, bt - t))

func _bounds() -> Rect2:
	var W: float = model.map.x; var H: float = model.map.y
	var x0 := _iso(0, H).x; var x1 := _iso(W, 0).x
	return Rect2(x0, -60.0 - _zmax, x1 - x0, (W + H) * TH * 0.5 + 60.0 + _zmax + SLAB + 20.0)

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
	if blocked or (app != null and app.modal() != null): _press = false; return
	if e is InputEventMouseButton:
		var mb := e as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_WHEEL_UP and mb.pressed: _zoom_at(mb.position, 1.12 * mb.factor if mb.factor > 0.0 else 1.12)
		elif mb.button_index == MOUSE_BUTTON_WHEEL_DOWN and mb.pressed: _zoom_at(mb.position, 1.0 / 1.12)
		elif mb.button_index in [MOUSE_BUTTON_LEFT, MOUSE_BUTTON_MIDDLE, MOUSE_BUTTON_RIGHT]:
			_drag = mb.pressed and _touches.size() < 2
			if mb.button_index == MOUSE_BUTTON_LEFT:
				if mb.pressed: _press = true; _press_pos = mb.position; _press_moved = 0.0; _press_t = 0.0; _press_long = false
				else:
					if _press and not _press_long and _press_moved < TAP_PX and _touches.size() < 2:
						tapped.emit(mb.position); _tap_extras(mb.position, MOUSE_BUTTON_LEFT)
					_press = false
			elif mb.button_index == MOUSE_BUTTON_RIGHT:   # a right click that did not pan is a tap too (the route tool: finish / undo)
				if mb.pressed: _rpress = true; _rpress_moved = 0.0
				else:
					if _rpress and _rpress_moved < TAP_PX: _tap_extras(mb.position, MOUSE_BUTTON_RIGHT)
					_rpress = false
	elif e is InputEventMouseMotion:
		var mm := e as InputEventMouseMotion
		if _drag: _pan += mm.relative; _clamp_pan(); queue_redraw()
		if _rpress: _rpress_moved += mm.relative.length()
		if _press: _press_moved += mm.relative.length()
		else: hovered.emit(mm.position)
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

## A tap: a built route's support or span under it (route_item_pressed, left only) and the map point (ground_pressed). Both fire when both apply.
func _tap_extras(pos: Vector2, button: int) -> void:
	if button == MOUSE_BUTTON_LEFT:
		var h := route_hit(pos)
		if not h.is_empty(): route_item_pressed.emit(str(h.kind), str(h.branch), int(h.index))
	var m := map_metres_at(pos)
	if not is_nan(m.x): ground_pressed.emit(m, button)

func _process(dt: float) -> void:
	if not is_visible_in_tree() or size.x < 4.0: return
	_t += dt; _rot += dt
	if _press and not _press_long and _press_moved < TAP_PX:
		_press_t += dt
		if _press_t >= LONG_S: _press_long = true; long_pressed.emit(_press_pos)
	for l in model.lines:
		var ph: float = _phase.get(l.id, 0.0)
		_phase[l.id] = fposmod(ph + float(l.dir) * float(l.speed) * dt, 1.0)
	_sync_layers()
	queue_redraw()
	if _dyn_layer != null: _dyn_layer.queue_redraw(); _top_layer.queue_redraw()

# --------------------------------------------------------------------------------------------------------------------
# Drawing helpers
# --------------------------------------------------------------------------------------------------------------------
func _c(col: Color) -> Color: return Color(col.r * _nl.r, col.g * _nl.g, col.b * _nl.b, col.a * _ga)
func _shade(col: Color, k: float) -> Color: return Color(col.r * k, col.g * k, col.b * k, col.a)

func _ell(c: Vector2, rx: float, ry: float, col: Color) -> void:
	var pts := PackedVector2Array()
	for k in 18: var a := TAU * float(k) / 18.0; pts.append(c + Vector2(cos(a) * rx, sin(a) * ry))
	_ci.draw_colored_polygon(pts, col)

func _box(p: Vector2, w: float, d: float, h: float, col: Color, base_add: float = 0.0) -> float:
	var x0 := p.x - w * 0.5; var y0 := p.y - d * 0.5; var x1 := x0 + w; var y1 := y0 + d
	var base := _zat(p) + base_add; var top := base + h
	_ci.draw_colored_polygon(PackedVector2Array([_iso(x0, y1, base), _iso(x1, y1, base), _iso(x1, y1, top), _iso(x0, y1, top)]), _c(_shade(col, 0.82)))
	_ci.draw_colored_polygon(PackedVector2Array([_iso(x1, y1, base), _iso(x1, y0, base), _iso(x1, y0, top), _iso(x1, y1, top)]), _c(_shade(col, 0.6)))
	_ci.draw_colored_polygon(PackedVector2Array([_iso(x0, y0, top), _iso(x1, y0, top), _iso(x1, y1, top), _iso(x0, y1, top)]), _c(col))
	return base

func _cyl(c: Vector2, r: float, h: float, col: Color, taper: float = 1.0) -> void:
	var rt := r * taper
	_ci.draw_colored_polygon(PackedVector2Array([c + Vector2(-r, 0), c + Vector2(r, 0), c + Vector2(rt, -h), c + Vector2(-rt, -h)]), _c(_shade(col, 0.78)))
	_ell(c, r, r * 0.5, _c(_shade(col, 0.7)))
	_ci.draw_colored_polygon(PackedVector2Array([c + Vector2(-r, 0), c + Vector2(r, 0), c + Vector2(rt, -h), c + Vector2(-rt, -h)]), _c(_shade(col, 0.82)))
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
			_ci.draw_colored_polygon(q, lit_col if on else UNLIT)

## Window quads of one wall, split into lit / dark sets (same layout and hash as before; the draw is cached as meshes, see _building).
func _window_quads(a: Vector2, dir: Vector2, h: float, cols: int, rows: int, seed_v: float, on_v: PackedVector2Array, off_v: PackedVector2Array) -> void:
	var up := Vector2(0, -h)
	for r in rows:
		for c in cols:
			var on := WorldMath.hash2(c * 31 + int(seed_v * 1000.0), r, 9) > 0.22
			var u0 := (float(c) + 0.2) / float(cols); var u1 := (float(c) + 0.8) / float(cols)
			var v0 := (float(r) + 0.25) / float(rows) * 0.8 + 0.1; var v1 := (float(r) + 0.75) / float(rows) * 0.8 + 0.1
			var q0 := a + dir * u0 + up * v0; var q1 := a + dir * u1 + up * v0; var q2 := a + dir * u1 + up * v1; var q3 := a + dir * u0 + up * v1
			var dst := on_v if on else off_v
			dst.append_array(PackedVector2Array([q0, q1, q2, q0, q2, q3]))

func _quad_mesh(tris: PackedVector2Array) -> ArrayMesh:
	var m := ArrayMesh.new()
	if tris.is_empty(): return m
	var cols := PackedColorArray(); cols.resize(tris.size()); cols.fill(Color.WHITE)
	var arr := []; arr.resize(Mesh.ARRAY_MAX)
	arr[Mesh.ARRAY_VERTEX] = tris; arr[Mesh.ARRAY_COLOR] = cols
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	return m

func _glow(p: Vector2, r: float, col: Color, a: float) -> void:
	if a <= 0.01: return
	for k in 3: _ci.draw_circle(p, r * (1.0 - float(k) * 0.28), Color(col.r, col.g, col.b, a * (0.35 + 0.3 * float(k))))

# --------------------------------------------------------------------------------------------------------------------
# Draw
# --------------------------------------------------------------------------------------------------------------------
## Layers (perf, Pixel 9a): the sky is drawn here; the static island (slab, tiles, wires, trees, palms, mangrove, towers) is painted once
## into `_static_layer` and only re-painted when the model or the light changes; pan/zoom just move the layer's transform. Animated things
## (buildings, units, villagers, pulses, fireflies) go in `_dyn_layer` every frame; screen-space labels and pegs in `_top_layer`.
const STATIC_T := ["tree", "palm", "mangrove", "tower", "boulder", "support", "span"]
var _ci: CanvasItem = self
var _static_layer: Node2D
var _dyn_layer: Node2D
var _top_layer: Node2D
var _static_key := ""
var static_paints := 0
var perf := {"static_us": 0, "dyn_us": 0, "top_us": 0, "model_us": 0, "models": 0}   # accumulated since the last CB_FPS line        # how many times the static island was painted (perf test reads it)

func _make_layers() -> void:
	_static_layer = Node2D.new(); _static_layer.name = "StaticIsland"; add_child(_static_layer)
	_dyn_layer = Node2D.new(); _dyn_layer.name = "Animated"; add_child(_dyn_layer)
	_top_layer = Node2D.new(); _top_layer.name = "Labels"; add_child(_top_layer)
	_static_layer.draw.connect(func(): _ci = _static_layer; _paint_static(); _ci = self)
	_dyn_layer.draw.connect(func(): _ci = _dyn_layer; _paint_dynamic(); _ci = self)
	_top_layer.draw.connect(func(): _ci = _top_layer; _paint_top(); _ci = self)

func _sync_layers() -> void:
	if _static_layer == null: return
	var s := _scale(); var o := to_screen(Vector2.ZERO)
	for l in [_static_layer, _dyn_layer]: l.position = o; l.scale = Vector2(s, s)

func repaint_static() -> void:
	if _static_layer != null: _static_layer.queue_redraw()

func _paint_static() -> void:
	if _tiles.is_empty() or size.x < 4.0: return
	static_paints += 1
	var t0 := Time.get_ticks_usec()
	_draw_slab()
	for t in _tiles: _draw_tile(t)
	_draw_wires()
	for ob in _objs_s: _draw_obj(ob)
	perf.static_us += Time.get_ticks_usec() - t0

func _paint_dynamic() -> void:
	if _tiles.is_empty() or size.x < 4.0: return
	var t0 := Time.get_ticks_usec()
	for ob in _objs_d: _draw_obj(ob)
	_draw_pulses()
	_draw_route_markers()
	_draw_lineman()
	_draw_ghost()
	if cute and _night > 0.35: _draw_fireflies()
	_draw_fog()
	perf.dyn_us += Time.get_ticks_usec() - t0

## How thick the sea fog is now (0..1): it gathers over two hours before the job's fog hour, holds an hour, thins over the next.
func fog_level() -> float:
	if not model.has("fog_min"): return 0.0
	var d := fposmod(float(model.minute) - float(model.fog_min) + 720.0, 1440.0) - 720.0
	if d < -120.0 or d > 120.0: return 0.0
	if d < 0.0: return clampf((d + 120.0) / 120.0, 0.0, 1.0)
	return 1.0 if d <= 60.0 else clampf(1.0 - (d - 60.0) / 60.0, 0.0, 1.0)

## Sea fog banks drifting along the coast (a few dozen soft ellipses; they carry the salt that the insulators must shed).
func _draw_fog() -> void:
	var f := fog_level()
	if f <= 0.01: return
	var W := float(model.map.x); var H := float(model.map.y)
	for k in 34:
		var depth := 7.0 * WorldMath.hash2(k, 1, 140) * (0.5 + 0.5 * f)   # thicker fog reaches further inland
		var x := fposmod(W * WorldMath.hash2(k, 2, 140) + _t * (0.25 + 0.2 * WorldMath.hash2(k, 3, 140)), W + 8.0) - 4.0
		var c := _iso(x, H - 1.0 - depth, 8.0 + 10.0 * WorldMath.hash2(k, 4, 140))
		var rx := (60.0 + 70.0 * WorldMath.hash2(k, 5, 140)) ; var ry := rx * 0.32
		for layer in 3:   # three nested veils: a soft edge without a shader
			var kk := 1.0 - 0.28 * float(layer)
			var pts := PackedVector2Array()
			for q in 18: pts.append(c + Vector2(cos(TAU * q / 18.0) * rx * kk, sin(TAU * q / 18.0) * ry * kk))
			_ci.draw_colored_polygon(pts, Color(0.86, 0.9, 0.95, 0.07 * f))

func _paint_top() -> void:
	if _tiles.is_empty() or size.x < 4.0: return
	var t0 := Time.get_ticks_usec()
	_draw_labels()
	_draw_pegs()
	_draw_breakers()
	perf.top_us += Time.get_ticks_usec() - t0

func _draw() -> void:
	if size.x < 4.0: return
	_nl = WorldMath.ground_light(_night)
	_draw_sky(float(model.minute))

func _draw_sky(mn: float) -> void:
	var top := WorldMath.sky_top(mn); var bot := WorldMath.sky_bottom(mn)
	_ci.draw_polygon(PackedVector2Array([Vector2.ZERO, Vector2(size.x, 0), size, Vector2(0, size.y)]), PackedColorArray([top, top, bot, bot]))
	if _night > 0.3:
		for k in 70:
			var p := Vector2(WorldMath.hash2(k, 1, 77) * size.x, WorldMath.hash2(k, 2, 77) * size.y * 0.7)
			_ci.draw_circle(p, 0.8 + 1.2 * WorldMath.hash2(k, 3, 77), Color(1, 1, 1, (_night - 0.3) * (0.4 + 0.5 * WorldMath.hash2(k, 4, 77))))
	var a := (mn - 360.0) / 720.0 * PI      # sun: east at 06:00, west at 18:00
	var sun := Vector2(size.x * 0.5 - cos(a) * size.x * 0.42, size.y * 0.68 - sin(a) * size.y * 0.6)   # horizon low: the sun sets behind the sea, not mid-sky
	if sin(a) > -0.1 and sin(a) < 1.01: _ci.draw_circle(sun, 26.0, Color(1.0, 0.86, 0.55, 0.9)); _ci.draw_circle(sun, 44.0, Color(1.0, 0.8, 0.5, 0.18))
	else:
		var mo := Vector2(size.x * 0.5 + cos(a) * size.x * 0.42, size.y * 0.5 + sin(a) * size.y * 0.42)
		_ci.draw_circle(mo, 18.0, Color(0.9, 0.93, 1.0, 0.85 * _night)); _ci.draw_circle(mo, 32.0, Color(0.8, 0.85, 1.0, 0.12 * _night))

func _draw_slab() -> void:
	if model.kind == "bench" or _has_terrain(): return   # islands sit in the sea, terrain maps run into it: no tabletop shadow
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
		"river": return Color("#6AB0D0").lerp(Color("#4A93BC"), v)
		"sea": return Color("#3C7FAA").lerp(Color("#2F6E9A"), v)
		"swamp": return Color("#4E5A34").lerp(Color("#434E2D"), v)
		"rock": return Color("#8C8174").lerp(Color("#7A7064"), v)
		"town": return Color("#B7B2A6").lerp(Color("#A9A498"), v)
	return Color("#86AE6C").lerp(Color("#76A064"), v)

func _is_water(kind: String) -> bool: return kind == "water" or kind == "river" or kind == "sea"

func _draw_tile(t: Dictionary) -> void:
	var i: int = t.i; var j: int = t.j
	var z: float = _zgrid[Vector2i(i, j)]
	var col := _tile_col(t)
	if t.kind == "grass" and z > 8.0: col = col.lerp(Color("#B8CC8A"), clampf((z - 8.0) / 90.0, 0.0, 0.55))   # the hilltop catches the light
	elif (t.kind == "field" or t.kind == "forest" or t.kind == "road") and z > 4.0: col = col.lerp(Color("#C2D294"), clampf((z - 4.0) / 120.0, 0.0, 0.45))
	elif t.kind == "rock" and z > 4.0: col = col.lerp(Color("#B4AA9C"), clampf((z - 4.0) / 100.0, 0.0, 0.4))
	var water := _is_water(t.kind)
	var cc := _c(col)
	if water: cc = Color(col.r * _nl.r * 0.8, col.g * _nl.g * 0.85, col.b * _nl.b * 0.95)
	var W := int(model.map.x); var H := int(model.map.y)
	# side faces: down to the slab base on the front borders, otherwise to a lower neighbour
	var zr: float = _zgrid.get(Vector2i(i + 1, j), -SLAB) if i + 1 < W else -SLAB
	var zb: float = _zgrid.get(Vector2i(i, j + 1), -SLAB) if j + 1 < H else -SLAB
	var side := Color("#7A6A58") if not water else Color("#2E6F94")
	var kb := 0.82; var kr := 0.62   # side-face shading is gentler on terrain turf: terraces read as a slope, not as stripes
	if _has_terrain() and not water and t.kind != "rock" and t.kind != "swamp": side = col.lerp(Color("#6A5A48"), 0.3); kb = 0.94; kr = 0.86
	if t.kind == "rock": side = Color("#6A6258")
	elif t.kind == "swamp": side = Color("#4A4A32")
	if zb < z: _ci.draw_colored_polygon(PackedVector2Array([_iso(i, j + 1, z), _iso(i + 1, j + 1, z), _iso(i + 1, j + 1, zb), _iso(i, j + 1, zb)]), _c(_shade(side, kb)))
	if zr < z: _ci.draw_colored_polygon(PackedVector2Array([_iso(i + 1, j + 1, z), _iso(i + 1, j, z), _iso(i + 1, j, zr), _iso(i + 1, j + 1, zr)]), _c(_shade(side, kr)))
	_ci.draw_colored_polygon(PackedVector2Array([_iso(i, j, z), _iso(i + 1, j, z), _iso(i + 1, j + 1, z), _iso(i, j + 1, z)]), cc)
	if model.has("fog_min") and not water:   # a sea-fog job: the salt the wind lays on the coast, whiter by pollution class (II faint, IV crusted)
		var pc := int((model.terrain.poll as PackedByteArray)[j * W + i]) if model.terrain.has("poll") else 1
		if pc >= 2:
			_ci.draw_colored_polygon(PackedVector2Array([_iso(i, j, z), _iso(i + 1, j, z), _iso(i + 1, j + 1, z), _iso(i, j + 1, z)]), _c(Color(0.93, 0.96, 1.0, 0.1 * float(pc - 1))))
			for k in pc - 1: _ci.draw_circle(_iso(i + 0.2 + 0.6 * WorldMath.hash2(i, j, 120 + k), j + 0.2 + 0.6 * WorldMath.hash2(i, j, 130 + k), z), 1.1, _c(Color(1, 1, 1, 0.55)))
	if water:
		var sh := 0.5 + 0.5 * sin(_t * 1.3 + float(i) * 0.9 + float(j) * 0.6)
		_ci.draw_line(_iso(i + 0.25, j + 0.5, z), _iso(i + 0.7, j + 0.5, z), Color(1, 1, 1, 0.16 * sh * (1.0 - _night * 0.7)), 1.5)
		if t.kind == "river" and WorldMath.hash2(i, j, 14) > 0.4:   # a lighter ripple line along the current
			_ci.draw_line(_iso(i + 0.15, j + 0.3, z), _iso(i + 0.55, j + 0.7, z), _c(Color("#CFE8F4", 0.5)), 1.2)
	elif t.kind == "road": _draw_road(i, j, z)
	elif t.kind == "town":
		var lc := _c(Color("#8F8A80"))
		_ci.draw_line(_iso(i, j + 0.5, z), _iso(i + 1, j + 0.5, z), lc, 0.8); _ci.draw_line(_iso(i + 0.5, j, z), _iso(i + 0.5, j + 1, z), lc, 0.8)

## A tan strip across a road tile, running along whichever neighbours are road too (a crossing draws both).
func _draw_road(i: int, j: int, z: float) -> void:
	var tan_c := _c(Color("#C9AA78"))
	var hx := _tile_kind(i - 1, j) == "road" or _tile_kind(i + 1, j) == "road"
	var hy := _tile_kind(i, j - 1) == "road" or _tile_kind(i, j + 1) == "road"
	if hx or not hy:
		_ci.draw_colored_polygon(PackedVector2Array([_iso(i, j + 0.3, z), _iso(i + 1, j + 0.3, z), _iso(i + 1, j + 0.7, z), _iso(i, j + 0.7, z)]), tan_c)
	if hy:
		_ci.draw_colored_polygon(PackedVector2Array([_iso(i + 0.3, j, z), _iso(i + 0.7, j, z), _iso(i + 0.7, j + 1, z), _iso(i + 0.3, j + 1, z)]), tan_c)

func _tile_kind(i: int, j: int) -> String:
	var T: Dictionary = model.get("terrain", {})
	if T.is_empty() or i < 0 or j < 0 or i >= int(T.cols) or j >= int(T.rows): return ""
	return str((T.kinds as PackedStringArray)[j * int(T.cols) + i])

func _boulder(o: Dictionary) -> void:
	var p: Vector2 = o.p; var w: float = o.w
	_box(p, w, w * 0.8, float(o.h), Color("#8E8578").lerp(Color("#6F675C"), o.v))

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
		"boulder": _boulder(o)
		"support": _support(o.s)
		"span": _span(o.r, o.sp)
		"croc": _croc(o)
		"stall": _stall(o)
		"sub": _substation(o)
		"unit": _unit(o)
		"shunt": _shunt(o)

func _tree(o: Dictionary) -> void:
	var p: Vector2 = o.p; var base := _iso(p.x, p.y, _zat(p)); var h: float = o.h
	_ci.draw_line(base, base + Vector2(0, -h * 0.35), _c(Color("#5A4632")), 2.0)
	var g := Color("#3F7A44").lerp(Color("#5E9A4A"), o.v)
	_ci.draw_colored_polygon(PackedVector2Array([base + Vector2(-h * 0.3, -h * 0.25), base + Vector2(h * 0.3, -h * 0.25), base + Vector2(0, -h * 0.75)]), _c(_shade(g, 0.8)))
	_ci.draw_colored_polygon(PackedVector2Array([base + Vector2(-h * 0.24, -h * 0.5), base + Vector2(h * 0.24, -h * 0.5), base + Vector2(0, -h)]), _c(g))

func _palm(o: Dictionary) -> void:
	var p: Vector2 = o.p; var base := _iso(p.x, p.y, _zat(p)); var h: float = o.h
	var lean := (float(o.v) - 0.5) * 10.0
	var top := base + Vector2(lean, -h)
	_ci.draw_line(base, base + Vector2(lean * 0.4, -h * 0.5), _c(Color("#7A5E3E")), 2.5); _ci.draw_line(base + Vector2(lean * 0.4, -h * 0.5), top, _c(Color("#7A5E3E")), 2.0)
	var g := Color("#4F8A4A").lerp(Color("#6AA25A"), o.v)
	for k in 5:
		var a := -PI * 0.5 + (float(k) - 2.0) * 0.62 + float(o.v) * 0.4
		var tip := top + Vector2(cos(a) * h * 0.55, sin(a) * h * 0.25 + h * 0.18)
		_ci.draw_colored_polygon(PackedVector2Array([top, top.lerp(tip, 0.5) + Vector2(0, -3), tip, top.lerp(tip, 0.5) + Vector2(0, 2)]), _c(_shade(g, 0.85 + 0.15 * float(k % 2))))

func _lighthouse(o: Dictionary) -> void:
	var p: Vector2 = o.p; var base := _iso(p.x, p.y, _zat(p)); var h := 46.0
	for k in 5:
		var y0 := -h * float(k) / 5.0; var y1 := -h * float(k + 1) / 5.0; var w0 := 7.0 - float(k) * 0.7; var w1 := 7.0 - float(k + 1) * 0.7
		_ci.draw_colored_polygon(PackedVector2Array([base + Vector2(-w0, y0), base + Vector2(w0, y0), base + Vector2(w1, y1), base + Vector2(-w1, y1)]), _c(Color("#F2EEE6") if k % 2 == 0 else Color("#E5484D")))
	var lamp := base + Vector2(0, -h - 5.0)
	_ci.draw_rect(Rect2(lamp + Vector2(-4, -4), Vector2(8, 8)), _c(Color("#3A3F52")))
	_ci.draw_colored_polygon(PackedVector2Array([lamp + Vector2(-5, -4), lamp + Vector2(5, -4), lamp + Vector2(0, -10)]), _c(Color("#E5484D")))
	if _night > 0.3:
		var a := _t * 1.1
		var d := Vector2(cos(a), sin(a) * 0.5)
		var beam := PackedVector2Array([lamp, lamp + d * 170.0 + d.orthogonal() * 22.0, lamp + d * 170.0 - d.orthogonal() * 22.0])
		_ci.draw_colored_polygon(beam, Color(1.0, 0.92, 0.65, 0.10 * _night))
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
	_ci.draw_colored_polygon(PackedVector2Array([b + Vector2(-4.48, 0), b + Vector2(4.48, 0), b + Vector2(3.36, -9.8), b + Vector2(-3.36, -9.8)]), _c(shirt))
	_ci.draw_circle(b + Vector2(0, -14), 5.04, _c(Color("#C8956A").lerp(Color("#8A5A3A"), o.v)))
	_ci.draw_circle(b + Vector2(-1.68, -14.56), 0.84, Color("#2A2418")); _ci.draw_circle(b + Vector2(1.68, -14.56), 0.84, Color("#2A2418"))
	if md == "happy" and fposmod(_t * 5.0 + float(o.v) * 6.0, PI) < 1.2: _ci.draw_line(b + Vector2(4.2, -8.4), b + Vector2(8.4, -16.8), _c(Color("#C8956A")), 2.1)   # wave
	if md == "sad" or md == "worried":
		var cd := b + Vector2(5.6, -7)
		_ci.draw_line(cd, cd + Vector2(0, -5.6), Color("#F3EEDF"), 2.24); _glow(cd + Vector2(0, -8.4), 8.4, Color("#FF9A3C"), 0.35 * _night + 0.1)

func _draw_fireflies() -> void:
	for k in _flies.size():
		var a: Vector2 = _flies[k]
		var ph := _t * (0.6 + 0.3 * WorldMath.hash2(k, 1, 94)) + float(k)
		var p := _iso(a.x + 0.4 * sin(ph * 1.3), a.y + 0.4 * cos(ph), 14.0 + 6.0 * sin(ph * 2.1))
		var on := 0.5 + 0.5 * sin(ph * 3.7)
		_glow(p, 4.0, Color("#D8FF7A"), 0.5 * on * _night)
		_ci.draw_circle(p, 1.2, Color(0.9, 1.0, 0.6, on * _night))

func _mangrove(o: Dictionary) -> void:
	var p: Vector2 = o.p; var base := _iso(p.x, p.y, _zat(p)); var h: float = o.h
	var root := _c(Color("#4A3A2A"))
	for k in 3: _ci.draw_line(base + Vector2(-5 + float(k) * 5.0, 0), base + Vector2(-1 + float(k) * 1.0, -h * 0.4), root, 1.2)
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
	if not o.has("wm"):   # window quads of both walls, built once per rebuild into two meshes (lit / dark): 2 draw calls instead of ~cols*rows*2
		var on_v := PackedVector2Array(); var off_v := PackedVector2Array()
		_window_quads(_iso(x0, y1, base), _iso(x1, y1, base) - _iso(x0, y1, base), h, cols, rows, o.v, on_v, off_v)
		_window_quads(_iso(x1, y1, base), _iso(x1, y0, base) - _iso(x1, y1, base), h, cols, rows, o.v + 0.37, on_v, off_v)
		o["wm"] = [_quad_mesh(on_v), _quad_mesh(off_v)]
	var lit_col := UNLIT.lerp(WorldMath.SODIUM, clampf(e * _gain * flick, 0.0, 1.0))
	_ci.draw_mesh(o.wm[1], null, Transform2D.IDENTITY, UNLIT)
	_ci.draw_mesh(o.wm[0], null, Transform2D.IDENTITY, lit_col)
	if o.role != "":   # hipped roof; the health post carries a red cross on its front wall
		var rc := Color("#7E3B32") if o.role == "school" else Color("#4E8C6A")
		var ap2 := _iso(p.x, p.y, base + h + 8.0)
		_ci.draw_colored_polygon(PackedVector2Array([_iso(x0, y1, base + h), _iso(x1, y1, base + h), ap2]), _c(_shade(rc, 1.1)))
		_ci.draw_colored_polygon(PackedVector2Array([_iso(x1, y1, base + h), _iso(x1, y0, base + h), ap2]), _c(_shade(rc, 0.8)))
		if o.role == "health":
			var zc := base + h * 0.5; var cr := Color("#E5484D")
			_ci.draw_colored_polygon(PackedVector2Array([_iso(p.x - 0.2, y1, zc + 2.0), _iso(p.x + 0.2, y1, zc + 2.0), _iso(p.x + 0.2, y1, zc - 2.0), _iso(p.x - 0.2, y1, zc - 2.0)]), _c(cr))
			_ci.draw_colored_polygon(PackedVector2Array([_iso(p.x - 0.07, y1, zc + 6.5), _iso(p.x + 0.07, y1, zc + 6.5), _iso(p.x + 0.07, y1, zc - 6.5), _iso(p.x - 0.07, y1, zc - 6.5)]), _c(cr))
	if o.hamlet:   # thatch roof
		var ap := _iso(p.x, p.y, base + h + 6.0)
		_ci.draw_colored_polygon(PackedVector2Array([_iso(x0, y1, base + h), _iso(x1, y1, base + h), ap]), _c(Color("#A07D3C")))
		_ci.draw_colored_polygon(PackedVector2Array([_iso(x1, y1, base + h), _iso(x1, y0, base + h), ap]), _c(Color("#7E5F2A")))
	if e > 0.0 and _night > 0.25: _glow(_iso(p.x, p.y, base + h * 0.5), 15.0 * w * 3.0, WorldMath.SODIUM, 0.035 * clampf(e, 0.0, 1.0) * _night)

## Flag pole by the school: a red pennant that ripples.
func _flag(o: Dictionary) -> void:
	var p: Vector2 = o.p; var base := _iso(p.x, p.y, _zat(p)); var top := base + Vector2(0, -52)
	_ci.draw_line(base, top, _c(Color("#D8D4CA")), 2.2)
	var wv := sin(_t * 3.0) * 3.0
	_ci.draw_colored_polygon(PackedVector2Array([top, top + Vector2(18, 3 + wv), top + Vector2(17, 9 + wv * 0.6), top + Vector2(0, 12)]), _c(Color("#E5484D")))
	_ci.draw_circle(top, 2.2, _c(Color("#F2C14E")))

func _tower(o: Dictionary) -> void:
	var p: Vector2 = o.p; var kv: float = o.kv; var h := _tower_h(kv); var base := _iso(p.x, p.y, _zat(p))
	var col := Color("#8A6A45") if kv < 1.0 else (Color("#B8B8B0") if kv <= 11.0 else Color("#9AA3B0"))
	if kv <= 11.0:
		_ci.draw_line(base, base + Vector2(0, -h), _c(col), 2.0); _ci.draw_line(base + Vector2(-6, -h + 3), base + Vector2(6, -h + 3), _c(col), 2.0)
	else:
		var w := 7.0 if kv <= 220.0 else 10.0
		_ci.draw_line(base + Vector2(-w * 0.6, 0), base + Vector2(0, -h), _c(col), 1.6); _ci.draw_line(base + Vector2(w * 0.6, 0), base + Vector2(0, -h), _c(col), 1.6)
		_ci.draw_line(base + Vector2(-w * 0.35, -h * 0.45), base + Vector2(w * 0.35, -h * 0.45), _c(col), 1.2)
		_ci.draw_line(base + Vector2(-w, -h * 0.85), base + Vector2(w, -h * 0.85), _c(col), 1.8)

func _substation(o: Dictionary) -> void:
	var p: Vector2 = o.p; var s: Dictionary = o.s
	var base := _iso(p.x, p.y, _zat(p))
	_ci.draw_colored_polygon(PackedVector2Array([_iso(p.x - 0.7, p.y - 0.7, _zat(p) + 0.5), _iso(p.x + 0.7, p.y - 0.7, _zat(p) + 0.5), _iso(p.x + 0.7, p.y + 0.7, _zat(p) + 0.5), _iso(p.x - 0.7, p.y + 0.7, _zat(p) + 0.5)]), _c(Color("#8F959E")))
	_box(p + Vector2(-0.2, 0.0), 0.35, 0.35, 9.0, Color("#6C7A8C"))
	_box(p + Vector2(0.25, 0.1), 0.25, 0.25, 6.0, Color("#7C8A9C"))
	var lamp := Color("#39D98A") if s.energised else Color("#FF3B3B")
	_ci.draw_circle(base + Vector2(0, -26), 2.5, lamp if _night > 0.2 else _c(lamp))
	if s.energised: _glow(base + Vector2(0, -26), 9.0, lamp, 0.2 * _night)

func _unit(o: Dictionary) -> void:
	var u: Dictionary = o.u; var p: Vector2 = o.p; var z0 := _zat(p); var base := _iso(p.x, p.y, z0)
	var lvl: float = u.level if u.online else 0.0
	match str(u.kind):
		"coal":
			_box(p + Vector2(0.45, 0.15), 0.8, 0.5, 12.0, Color("#8C8F96"))
			_cyl(base + Vector2(-26, 8), 17.0, 42.0, Color("#B9B4A8"), 0.72)
			_ci.draw_line(base + Vector2(18, 0), base + Vector2(18, -54), _c(Color("#7E7A74")), 5.0)
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
			_ci.draw_colored_polygon(dome, _c(Color("#DADFE6")))
		"hydro", "psp":
			var wa := Color("#5FA8C8")
			_ci.draw_colored_polygon(PackedVector2Array([base + Vector2(-34, -2), base + Vector2(34, -2), base + Vector2(34, -26), base + Vector2(-34, -26)]), _c(Color("#A7A39A")))
			for k in 4: _ci.draw_line(base + Vector2(-30 + float(k) * 18.0, -24 + fposmod(_t * 14.0 * (0.2 + lvl) + float(k) * 5.0, 22.0)), base + Vector2(-30 + float(k) * 18.0, -22 + fposmod(_t * 14.0 * (0.2 + lvl) + float(k) * 5.0, 22.0)), _c(wa), 2.0)
		"pv":
			for r in 3:
				var rb := base + Vector2(float(r) * 16.0 - 16.0, float(r) * 8.0 - 8.0)
				_ci.draw_colored_polygon(PackedVector2Array([rb + Vector2(-22, 0), rb + Vector2(18, -6), rb + Vector2(18, -16), rb + Vector2(-22, -10)]), _c(Color("#2E4B8F").lerp(Color("#5F8FE0"), (1.0 - _night) * 0.8)))
		"wind":
			var hub := base + Vector2(0, -50)
			_ci.draw_line(base, hub, _c(Color("#E0E4EA")), 3.0)
			var ang: float = _rot * (0.4 + 5.0 * float(u.rotor))
			for k in 3:
				var a: float = ang + TAU * float(k) / 3.0
				_ci.draw_line(hub, hub + Vector2(cos(a), sin(a)) * 24.0, _c(Color("#F0F3F7")), 2.5)
		"hut", "bench":
			var top := _box(p, 0.9, 0.7, 13.0, Color("#D9CBA6"))   # little hut: plank walls, tin roof, solar panel, a battery sign
			var ap := _iso(p.x, p.y, top + 13.0 + 7.0)
			_ci.draw_colored_polygon(PackedVector2Array([_iso(p.x - 0.45, p.y + 0.35, top + 13.0), _iso(p.x + 0.45, p.y + 0.35, top + 13.0), ap]), _c(Color("#8E99A8")))
			_ci.draw_colored_polygon(PackedVector2Array([_iso(p.x + 0.45, p.y + 0.35, top + 13.0), _iso(p.x + 0.45, p.y - 0.35, top + 13.0), ap]), _c(Color("#6E7988")))
			_ci.draw_colored_polygon(PackedVector2Array([_iso(p.x - 0.4, p.y - 0.3, top + 17.0), _iso(p.x + 0.1, p.y - 0.3, top + 21.0), _iso(p.x + 0.1, p.y + 0.2, top + 21.0), _iso(p.x - 0.4, p.y + 0.2, top + 17.0)]), _c(Color("#2E4B8F").lerp(Color("#5F8FE0"), (1.0 - _night) * 0.7)))
			var sg := _iso(p.x + 0.45, p.y + 0.1, top + 7.0)   # battery sign on the wall: lit cells when it is feeding the cable
			_ci.draw_rect(Rect2(sg + Vector2(-7, -4), Vector2(12, 8)), Color("#2A2418")); _ci.draw_rect(Rect2(sg + Vector2(5, -2), Vector2(2, 4)), Color("#2A2418"))
			for k in 3: _ci.draw_rect(Rect2(sg + Vector2(-6 + k * 4, -3), Vector2(3, 6)), Color("#5BD69A") if u.online else Color("#46506A"))
			if u.online: _glow(sg, 10.0, Color("#5BD69A"), 0.25)
		_:
			_cyl(base + Vector2(-8, 6), 14.0, 20.0, Color("#B0B6C0"))
	if u.online and str(u.kind) in ["coal", "gas", "nuclear", "hydro", "diesel", "biomass", "psp"]:
		_ci.draw_rect(Rect2(base + Vector2(-20, 12), Vector2(40.0 * lvl, 4.0)), _c(WorldMath.CYAN))
		_ci.draw_rect(Rect2(base + Vector2(-20, 12), Vector2(40.0, 4.0)), Color(1, 1, 1, 0.15), false, 1.0)

func _smoke(top: Vector2, lvl: float, col: Color) -> void:
	if lvl <= 0.02: return
	for k in 5:
		var ph := fposmod(_t * 0.28 + float(k) / 5.0, 1.0)
		_ci.draw_circle(top + Vector2(ph * 16.0, -ph * 46.0), 4.0 + ph * 9.0 * (0.5 + lvl), Color(col.r * _nl.r, col.g * _nl.g, col.b * _nl.b, (1.0 - ph) * 0.5 * clampf(lvl, 0.0, 1.0)))

func _shunt(o: Dictionary) -> void:
	var h: Dictionary = o.h; var p: Vector2 = o.p; var base := _iso(p.x, p.y, _zat(p))
	for k in maxi(1, int(h.steps)):
		var on := k < int(h.on)
		var c := base + Vector2(float(k) * 9.0 - 4.0, float(k) * 4.0)
		_cyl(c, 4.5, 14.0, Color("#E0B050") if on else Color("#7A7F88"))
		if on: _glow(c + Vector2(0, -8), 8.0, WorldMath.REACTIVE, 0.22)

func _line_poly(l: Dictionary, off: float) -> PackedVector2Array:
	var rid := str(l.get("id", ""))
	if rid != "" and _route_poly.has(rid): return _route_poly[rid]
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
			_ci.draw_line(gp[k], gp[k + 3], Color(0.96, 0.92, 0.78, 0.55), 2.0, true); k += 8
	for l in model.lines:
		if _route_poly.has(str(l.id)): continue   # a planned route is drawn span by span (copper, amber, red) with its supports
		for off in _offsets(l):
			var poly := _line_poly(l, off)
			if poly.size() < 2: continue
			if str(l.kind) == "cable" and l.get("mm2") != null:   # bench cables: copper you can see; width ∝ conductor diameter ∝ sqrt(area)
				var cw := (1.2 + 1.1 * sqrt(float(l.mm2))) / maxf(_scale(), 0.01) * clampf(_scale(), 0.6, 2.0)
				_ci.draw_polyline(poly, _c(Color("#1C1712")), cw + 2.5, true)
				_ci.draw_polyline(poly, _c(Color("#C8794A")), cw, true)
				_ci.draw_polyline(poly, _c(Color("#F0B58A")), maxf(0.8, cw * 0.3), true)
				continue
			_ci.draw_polyline(poly, _c(Color("#1A1F30")) if l.in_service else Color(0.35, 0.37, 0.45, 0.8), float(l.width) + 2.0 if l.in_service else 1.5, true)
			if l.in_service: _ci.draw_polyline(poly, Color(l.color.r, l.color.g, l.color.b, 0.9), float(l.width) * 0.75, true)

func _poly_at(poly: PackedVector2Array, cum: PackedFloat32Array, f: float) -> Vector2:
	var tot: float = cum[cum.size() - 1]
	var d := f * tot
	for k in range(1, cum.size()):
		if cum[k] >= d:
			var seg: float = maxf(cum[k] - cum[k - 1], 0.0001)
			return poly[k - 1].lerp(poly[k], (d - cum[k - 1]) / seg)
	return poly[poly.size() - 1]

func _draw_pulses() -> void:
	if bool(model.get("blackout", false)): return   # a dark province shows no flow
	for l in model.lines:
		if not l.in_service or l.dir == 0 or l.speed <= 0.0: continue
		if _route_poly.has(str(l.id)): _route_pulses(l); continue
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
				_ci.draw_circle(p, r * 2.3, Color(col.r, col.g, col.b, 0.22)); _ci.draw_circle(p, r, col.lerp(Color.WHITE, 0.35))
		if float(l.loading) > 1.0:   # countdown ring on the hot span: the heat used before the relay trips
			var poly2 := _line_poly(l, 0.0)
			var mid := poly2[poly2.size() / 2]
			_ci.draw_arc(mid, 17.0, -PI * 0.5, -PI * 0.5 + TAU * clampf(float(l.overload), 0.03, 1.0), 28, WorldMath.RED, 3.0, true)
			_ci.draw_arc(mid, 17.0, 0.0, TAU, 28, Color(1, 0.23, 0.23, 0.25), 1.5, true)

## Thin sodium-white pulses riding above the wires of a built route (only on an energised, in-service line with flow: the model zeroes dir otherwise).
func _route_pulses(l: Dictionary) -> void:
	var poly: PackedVector2Array = _route_poly[str(l.id)]
	if poly.size() < 2: return
	var cum := PackedFloat32Array([0.0])
	for k in range(1, poly.size()): cum.append(cum[k - 1] + poly[k].distance_to(poly[k - 1]))
	var n := clampi(int(cum[cum.size() - 1] / 90.0), 4, 40)
	var ph: float = _phase.get(l.id, 0.0)
	var col: Color = l.color
	for k in n:
		var p := _poly_at(poly, cum, fposmod(ph + float(k) / float(n), 1.0))
		_ci.draw_circle(p, 4.2, Color(col.r, col.g, col.b, 0.2)); _ci.draw_circle(p, 1.7, col.lerp(Color.WHITE, 0.4))

func _draw_labels() -> void:
	var font := CbKit.font_regular()
	var fs := 13 if size.x < 1400.0 else 15
	var taken: Array[Vector2] = []   # town label anchors: a short service line's loading % must not sit on the market's name
	for t in model.towns:
		if t.kind == "school" or t.kind == "hamlet" or t.get("mascot", false):
			if not t.has("volts"): continue
			var sp := to_screen(_iso(_tc(t.pos).x, _tc(t.pos).y, 0.0)) + Vector2(0, -78.0 * clampf(_scale(), 0.6, 1.6))   # above the roofs
			var txt := tr("WORLD_DARK") if float(t.v) <= 0.0 else tr("WORLD_VOLTS_FMT") % float(t.volts)
			if t.get("mascot", false) and float(t.v) > 0.0: txt = "%s · %d V" % [str(t.name), roundi(float(t.volts))]
			if t.has("loss") and float(t.v) > 0.0: txt = tr("WORLD_LOSS_FMT") % float(t.loss)
			var glow := clampf(float(t.v) * float(t.v), 0.0, 1.0)
			if t.has("loss"): glow = 1.0 if float(t.v) > 0.0 else 0.0   # the school's lamps run off the far converter at full voltage
			if cute and t.has("mood"):
				var r := 15.0 * (fs / 15.0) * clampf(_scale() * 1.4, 0.8, 1.6)
				_bulb_mascot(sp + Vector2(0, -r - fs - 10.0), r, str(t.mood), glow)
			_label(font, fs, sp, txt, WorldMath.SODIUM if float(t.v) > 0.0 else WorldMath.GREY)
			taken.append(sp)
			continue
		var sp2 := to_screen(_iso(_tc(t.pos).x, _tc(t.pos).y, 70.0))
		var v: float = t.v
		var arrow := "▼ " if v < 0.95 else ("▲ " if v > 1.05 else "")
		var txt2 := tr("WORLD_DARK") if v <= 0.0 else tr("WORLD_BUS_FMT") % [arrow, v]
		var col := WorldMath.GREY if v <= 0.0 else (WorldMath.AMBER if (v < 0.95 or v > 1.05) else WorldMath.WHITE)
		_label(font, fs, sp2, "%s  %s" % [str(t.name), txt2], col)
	var yards_quiet: bool = model.get("terrain", {}) is Dictionary and not (model.get("terrain", {}) as Dictionary).is_empty() and _scale() < 1.2   # chapter 2 overview: the yards' pu labels crowd the market mascot; zoom in (or tap a yard) to read them
	for s in model.subs:
		if yards_quiet: break
		if s.has("v") and float(s.v) > 0.0 and s.id != "j" and not str(s.id).begins_with("c"):
			var sp3 := to_screen(_iso(_tc(s.pos).x, _tc(s.pos).y, 40.0))
			var vs: float = s.v; var ar := "▼ " if vs < 0.95 else ("▲ " if vs > 1.05 else "")
			_label(font, fs, sp3, tr("WORLD_BUS_FMT") % [ar, vs], WorldMath.AMBER if (vs < 0.95 or vs > 1.05) else WorldMath.WHITE)
	for l in model.lines:
		if l.in_service and float(l.loading) >= 0.9 and str(l.kind) != "cable":
			var poly := _line_poly(l, 0.0)
			var lp := to_screen(poly[poly.size() / 2]) + Vector2(0, -26)
			for q in taken:
				if absf(lp.y - q.y) < fs * 1.8 and absf(lp.x - q.x) < 160.0: lp.y = q.y + fs * 2.0   # drop below the town's name
			_label(font, fs, lp, tr("WORLD_LOAD_FMT") % int(round(float(l.loading) * 100.0)), l.color)

## A round bulb with a face. `glow` = (V/V0)^2 (brightness of the homes); the face is WorldMath.mood (band vs the level's limit).
func _bulb_mascot(c: Vector2, r: float, md: String, glow: float) -> void:
	var lit := md != "asleep"
	var glass := Color("#7A6A4E").lerp(Color("#FFF3C4"), glow) if lit else Color("#5B6178")
	if lit: _glow(c, r * (1.6 + glow), WorldMath.SODIUM, 0.10 + 0.25 * glow)
	var bob := sin(_t * 4.0) * 2.0 if md == "happy" else (sin(_t * 30.0) * 0.8 if md == "sad" else 0.0)
	c += Vector2(bob if md == "sad" else 0.0, -absf(bob) if md == "happy" else 0.0)
	_ci.draw_rect(Rect2(c + Vector2(-r * 0.38, r * 0.72), Vector2(r * 0.76, r * 0.42)), Color("#8D93A6"))           # screw base
	_ci.draw_line(c + Vector2(-r * 0.38, r * 0.86), c + Vector2(r * 0.38, r * 0.86), Color("#6C7286"), 1.5)
	_ci.draw_circle(c, r, glass)
	_ci.draw_arc(c, r, 0.0, TAU, 32, Color("#2A2418", 0.55), 1.5)
	var ink := Color("#2A2418")
	var ey := c + Vector2(0, -r * 0.12); var ex := r * 0.34
	match md:
		"asleep":
			_ci.draw_arc(ey + Vector2(-ex, 0), r * 0.13, 0.2, PI - 0.2, 8, ink, 1.6); _ci.draw_arc(ey + Vector2(ex, 0), r * 0.13, 0.2, PI - 0.2, 8, ink, 1.6)
			var font := CbKit.font_regular(); var zf := int(r * 0.7)
			_ci.draw_string(font, c + Vector2(r * 0.8, -r * 0.6 - fposmod(_t * 6.0, 6.0)), "z", HORIZONTAL_ALIGNMENT_LEFT, -1, zf, Color(1, 1, 1, 0.7))
		_:
			var blink := fposmod(_t + float(int(c.x) % 7) * 0.3, 3.6) < 0.12
			for sx in [-1.0, 1.0]:
				var e: Vector2 = ey + Vector2(sx * ex, 0)
				if blink: _ci.draw_line(e + Vector2(-r * 0.1, 0), e + Vector2(r * 0.1, 0), ink, 1.6)
				else: _ci.draw_circle(e, r * 0.1, ink)
				if md == "worried": _ci.draw_line(e + Vector2(-sx * r * 0.14, -r * 0.26), e + Vector2(sx * r * 0.12, -r * 0.18), ink, 1.4)
				if md == "sad": _ci.draw_line(e + Vector2(-sx * r * 0.14, -r * 0.18), e + Vector2(sx * r * 0.12, -r * 0.27), ink, 1.4)
			var m := c + Vector2(0, r * 0.3)
			match md:
				"happy": _ci.draw_arc(m + Vector2(0, -r * 0.12), r * 0.3, 0.35, PI - 0.35, 12, ink, 1.8); _ci.draw_circle(c + Vector2(-r * 0.55, r * 0.15), r * 0.12, Color(1.0, 0.55, 0.5, 0.45)); _ci.draw_circle(c + Vector2(r * 0.55, r * 0.15), r * 0.12, Color(1.0, 0.55, 0.5, 0.45))
				"worried": _ci.draw_line(m + Vector2(-r * 0.2, 0), m + Vector2(r * 0.2, -r * 0.04), ink, 1.6); _ci.draw_circle(c + Vector2(r * 0.72, -r * 0.45), r * 0.1, Color("#7FC8FF"))
				"sad": _ci.draw_arc(m + Vector2(0, r * 0.18), r * 0.24, PI + 0.4, TAU - 0.4, 12, ink, 1.8); _ci.draw_circle(ey + Vector2(ex, r * 0.25 + fposmod(_t * 8.0, r * 0.5)), r * 0.07, Color("#7FC8FF"))

func _label(font: Font, fs: int, at: Vector2, txt: String, col: Color) -> void:
	var w := font.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	var p := at - Vector2(w * 0.5, 0.0)
	_ci.draw_rect(Rect2(p + Vector2(-5, -fs - 1), Vector2(w + 10, fs + 8)), Color(0.04, 0.06, 0.14, 0.72))
	_ci.draw_string(font, p, txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, col)

# --------------------------------------------------------------------------------------------------------------------
# Read-only helpers for the kit tray and the tags (godot/ui/kit_tray.gd, tag_view.gd): screen positions, picking, site pegs
# --------------------------------------------------------------------------------------------------------------------
## Screen position (this control's local coordinates) of a tile centre, `z` px above the ground.
func world_to_screen(tile: Vector2, z := 0.0) -> Vector2:
	var c := _tc(tile)
	return to_screen(_iso(c.x, c.y, _zat(c) + z))

## Glowing wooden pegs on the ground: pegs = [{tile: Vector2, label: String}], `highlight` = index drawn bright (-1 none). [] clears.
func set_site_pegs(pegs: Array, highlight := -1) -> void:
	_pegs = pegs; _peg_hi = highlight; queue_redraw()

func peg_count() -> int: return _pegs.size()

func _poly_screen(pts: Array) -> PackedVector2Array:
	var out := PackedVector2Array()
	var poly := _line_poly({"pts": pts, "kv": 0.048, "in_service": true, "loading": 0.0}, 0.0)
	for q in poly: out.append(to_screen(q))
	return out

func _dist_poly(p: Vector2, poly: PackedVector2Array) -> float:
	var best := 1e9
	for k in range(poly.size() - 1):
		var a := poly[k]; var c := poly[k + 1]
		var ab := c - a; var l2 := ab.length_squared()
		var t := 0.0 if l2 < 1e-6 else clampf((p - a).dot(ab) / l2, 0.0, 1.0)
		best = minf(best, p.distance_to(a + ab * t))
	return best

## What is under a screen point: {kind: "peg"|"hamlet"|"hut"|"junction"|"cable"|"route", id: String or int (peg index)} or {} (nothing).
## "route" is a surveyed run with no cable yet (id main / b / b2).
func pick(sp: Vector2) -> Dictionary:
	var s := _scale()
	var best := -1; var bd := 1e9
	for i in _pegs.size():
		var d := sp.distance_to(world_to_screen(_pegs[i].tile) + Vector2(0, -10.0 * s))
		if d < maxf(26.0, 18.0 * s) and d < bd: bd = d; best = i
	if best >= 0: return {"kind": "peg", "id": best}
	for t in model.towns:
		if t.kind != "hamlet" and t.kind != "school": continue
		var d := sp - world_to_screen(t.pos)
		if absf(d.x) <= 95.0 * s and d.y >= -100.0 * s and d.y <= 48.0 * s: return {"kind": "hamlet", "id": str(t.id)}
	for u in model.units:
		if str(u.kind) != "hut": continue
		var d := sp - world_to_screen(u.pos)
		if absf(d.x) <= 40.0 * s and d.y >= -64.0 * s and d.y <= 22.0 * s: return {"kind": "hut", "id": str(u.id)}
	for sb in model.subs:
		if str(sb.id) != "j": continue
		var d := sp - world_to_screen(sb.pos)
		if absf(d.x) <= 28.0 * s and d.y >= -56.0 * s and d.y <= 22.0 * s: return {"kind": "junction", "id": "j"}
	var cb := ""; var cd := 1e9
	for l in model.lines:
		if str(l.kind) != "cable": continue
		var d := _dist_poly(sp, _poly_screen(l.pts))
		if d < cd: cd = d; cb = str(l.id)
	if cb != "" and cd <= 14.0: return {"kind": "cable", "id": cb}
	var gids: Array = model.get("ghost_ids", []); var gb := ""; var gd := 1e9
	for k in model.get("ghosts", []).size():
		var d := _dist_poly(sp, _poly_screen(model.ghosts[k]))
		if d < gd: gd = d; gb = str(gids[k]) if k < gids.size() else ""
	if gb != "" and gd <= 14.0: return {"kind": "route", "id": gb}
	return {}

## Screen rectangles of the things a tag should not cover: hamlets and the hut (local coordinates, same boxes pick() uses).
func object_rects() -> Array:
	var s := _scale(); var out: Array = []
	for t in model.towns:
		if t.kind != "hamlet" and t.kind != "school": continue
		var c := world_to_screen(t.pos); out.append(Rect2(c + Vector2(-95.0, -100.0) * s, Vector2(190.0, 148.0) * s))
	for u in model.units:
		if str(u.kind) != "hut": continue
		var c2 := world_to_screen(u.pos); out.append(Rect2(c2 + Vector2(-40.0, -64.0) * s, Vector2(80.0, 86.0) * s))
	return out

## Polyline (tiles) of a run: the laid cable or its surveyed route. [] when unknown.
func run_pts(id: String) -> Array:
	for l in model.lines: if str(l.id) == id: return l.pts
	var gids: Array = model.get("ghost_ids", [])
	for k in model.get("ghosts", []).size(): if k < gids.size() and str(gids[k]) == id: return model.ghosts[k]
	return []

## Tile at half the length of a run (where its pad handle stands).
func run_mid_tile(id: String) -> Vector2:
	var pts := run_pts(id)
	if pts.is_empty(): return Vector2.ZERO
	var tot := 0.0
	for k in range(pts.size() - 1): tot += (pts[k + 1] as Vector2).distance_to(pts[k])
	var d := tot * 0.5
	for k in range(pts.size() - 1):
		var seg := (pts[k + 1] as Vector2).distance_to(pts[k])
		if d <= seg: return (pts[k] as Vector2).lerp(pts[k + 1], d / maxf(seg, 1e-6))
		d -= seg
	return pts[pts.size() - 1]

## Where a tag's string ties on an object: kind "hamlet" (id h1/h2), "hut", "cable" (id main/b/b2). Local coordinates; Vector2(NAN, NAN) when absent.
func anchor(kind: String, id: String) -> Vector2:
	match kind:
		"hamlet":
			for t in model.towns: if str(t.id) == id: return world_to_screen(t.pos, 20.0)
		"hut":
			for u in model.units: if str(u.id) == id: return world_to_screen(u.pos, 16.0)
		"cable":
			var pts := run_pts(id)
			if not pts.is_empty():
				var poly := _line_poly({"pts": pts, "kv": 0.048, "in_service": true, "loading": 0.0}, 0.0)
				return to_screen(poly[poly.size() / 2])
	return Vector2(NAN, NAN)

func _draw_pegs() -> void:
	if _pegs.is_empty(): return
	var sc := clampf(_scale() * 1.15, 0.8, 1.7)
	var font := GridTheme.font("mono"); var fsz := GridTheme.fs(13)
	for i in _pegs.size():
		var p := world_to_screen(_pegs[i].tile); var hi := i == _peg_hi
		var pulse := 0.5 + 0.5 * sin(_t * 3.2 + float(i) * 0.9)
		var ring := PackedVector2Array()
		for k in 25: ring.append(p + Vector2(cos(TAU * k / 24.0) * 22.0 * sc, sin(TAU * k / 24.0) * 11.0 * sc))
		_ci.draw_polyline(ring, Color(GridTheme.SODIUM, 0.35 + 0.4 * pulse + (0.25 if hi else 0.0)), 2.0, true)
		_ci.draw_circle(p + Vector2(0, -16.0 * sc), (26.0 + 8.0 * pulse + (8.0 if hi else 0.0)) * sc, Color(GridTheme.SODIUM, 0.07 + 0.08 * pulse + (0.14 if hi else 0.0)))
		_ci.draw_rect(Rect2(p + Vector2(-3.5 * sc, -26.0 * sc), Vector2(7.0 * sc, 28.0 * sc)), Color("#8A6A43"))
		_ci.draw_rect(Rect2(p + Vector2(-3.5 * sc, -26.0 * sc), Vector2(2.5 * sc, 28.0 * sc)), Color("#B08A58"))
		_ci.draw_circle(p + Vector2(0, -28.0 * sc), 5.5 * sc, GridTheme.SODIUM if hi else GridTheme.SODIUM.lerp(Color.WHITE, 0.25 * pulse))
		_ci.draw_arc(p + Vector2(0, -28.0 * sc), 5.5 * sc, 0.0, TAU, 14, GridTheme.NIGHT, 1.5)
		var lb := str(_pegs[i].label)
		if lb != "":
			var tw := font.get_string_size(lb, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz).x
			var at := p + Vector2(-tw * 0.5, 22.0 * sc + fsz)
			_ci.draw_rect(Rect2(at + Vector2(-5, -fsz - 1), Vector2(tw + 10, fsz + 8)), Color(GridTheme.INK, 0.9))
			_ci.draw_string(font, at, lb, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz, GridTheme.SODIUM if hi else GridTheme.TEXT)


## Prologue: the open line's breaker glows at the middle of the line (the only legal action). Tap it to close the line.
func _breaker_points() -> Array:
	var out: Array = []
	if str(model.level) != "P0" or float(model.minute) > 120.0: return out   # only before the night starts (P0 opens at 02:00)
	for l in model.lines:
		if bool(l.in_service) or str(l.get("kind", "")) == "xfmr": continue
		var pts: Array = l.pts
		if pts.size() < 2: continue
		out.append({"id": str(l.id), "tile": (Vector2(pts[0]) + Vector2(pts[pts.size() - 1])) * 0.5})   # tile coords; world_to_screen adds the centre offset
	return out

func breaker_at(p: Vector2) -> String:
	for bp in _breaker_points():
		if world_to_screen(bp.tile).distance_to(p) < 46.0 * clampf(_scale() * 1.15, 0.8, 1.7): return str(bp.id)
	return ""

func _draw_breakers() -> void:
	var sc := clampf(_scale() * 1.15, 0.8, 1.7)
	for bp in _breaker_points():
		var p := world_to_screen(bp.tile) + Vector2(0, -18.0 * sc)
		var pulse := 0.5 + 0.5 * sin(_t * 4.0)
		_ci.draw_circle(p, (34.0 + 10.0 * pulse) * sc, Color(GridTheme.SODIUM, 0.10 + 0.12 * pulse))
		_ci.draw_circle(p, 20.0 * sc, Color(GridTheme.SODIUM, 0.35 + 0.3 * pulse))
		var box := Rect2(p - Vector2(12, 15) * sc, Vector2(24, 30) * sc)
		_ci.draw_rect(box, GridTheme.INK)
		_ci.draw_rect(box, GridTheme.SODIUM, false, 2.0)
		_ci.draw_line(p + Vector2(0, 9) * sc, p + Vector2(7, -9) * sc, GridTheme.SODIUM, 3.0 * sc)   # the open knife: tap to close
		_ci.draw_circle(p + Vector2(0, 9) * sc, 2.5 * sc, GridTheme.SODIUM)


# --------------------------------------------------------------------------------------------------------------------
# Overhead-line routes: supports, spans, ghost preview, picking (DEPTH 4.2-4.3; every number comes from the engine plan, see RouteDraw)
# --------------------------------------------------------------------------------------------------------------------
func _tile_m() -> float:
	if _has_terrain(): return float(model.terrain.tile_m)
	return float(model.get("tile_m", 50.0))

## Metres on the map at a screen point (the ground under it, terrain heights included); Vector2(NAN, NAN) off the map.
func map_metres_at(screen_p: Vector2) -> Vector2:
	if model.kind == "none" or _tiles.is_empty(): return Vector2(NAN, NAN)
	var w := (screen_p - _view_rect().get_center() - _pan) / _scale() + _bounds_center()
	var q := Vector2.ZERO; var z := 0.0
	for it in 6:
		var u := w.x / (TW * 0.5); var v := (w.y + z) / (TH * 0.5)
		q = Vector2((u + v) * 0.5, (v - u) * 0.5)
		z = _zat(q) if q.x >= 0.0 and q.y >= 0.0 else 0.0
	if q.x < 0.0 or q.y < 0.0 or q.x >= model.map.x or q.y >= model.map.y: return Vector2(NAN, NAN)
	return q * _tile_m()

## Screen position (local coordinates) of a map point in metres, on the ground (`z_m` metres above it).
func metres_to_screen(m: Vector2, z_m := 0.0) -> Vector2:
	var q := m / _tile_m()
	return to_screen(_iso(q.x, q.y, _zat(q) + z_m * PXM))

## Preview of a not-yet-built line: `plan` = the routePreview result ({} or a refusal clears it), `pending` = waypoints (metres, Vector2 or [x, y]) already clicked.
func set_route_ghost(plan: Dictionary, pending: Array) -> void:
	_ghost = RouteDraw.plan_to_route(plan, "ghost", _tile_m()) if (not plan.is_empty() and bool(plan.get("ok", true)) and plan.has("supports")) else {}
	_ghost_refused = not plan.is_empty() and not bool(plan.get("ok", true))
	_ghost_bad_tile = int(plan.get("tile", -1)) if _ghost_refused else -1
	_ghost_pending = []
	for q in pending: _ghost_pending.append(Vector2(float(q[0]), float(q[1])) if (q is Array) else Vector2(q))
	queue_redraw()
	if _dyn_layer != null: _dyn_layer.queue_redraw()

func _phase_pt(s: Dictionary, k: int) -> Vector2:
	var p: Vector2 = s.p; var d: Vector2 = s.dir
	var arm := 0.1 if str(s.family) == "crossing-h" else 0.075
	return _iso(p.x - d.y * arm * float(k), p.y + d.x * arm * float(k), _zat(p) + float(s.attach_m) * PXM)

## The wire of phase `k` (-1, 0, 1) of a span: a parabola of the engine's sag (m x PXM px) under the chord between the two attachment points.
func _span_wire(r: Dictionary, sp: Dictionary, k: int) -> PackedVector2Array:
	return RouteDraw.wire_points(_phase_pt(r.supports[sp.a], k), _phase_pt(r.supports[sp.b], k), float(sp.sag_m) * PXM)

func _span_at(r: Dictionary, sp: Dictionary) -> Array:   # [wire point px, ground point px] at the span's tightest clearance (atM)
	var a: Dictionary = r.supports[sp.a]; var b: Dictionary = r.supports[sp.b]
	var t := clampf(float(sp.at_m) / maxf(float(sp.length_m), 0.001), 0.0, 1.0)
	var pa := _phase_pt(a, 0); var pb := _phase_pt(b, 0)
	var wire := pa.lerp(pb, t) + Vector2(0.0, 4.0 * float(sp.sag_m) * PXM * t * (1.0 - t))
	var gp: Vector2 = (a.p as Vector2).lerp(b.p, t)
	return [wire, _iso(gp.x, gp.y, _zat(gp))]

func _dashed(a: Vector2, b: Vector2, col: Color, w: float, on := 3.0, off := 3.0) -> void:
	var n := maxi(1, int(a.distance_to(b) / (on + off)))
	for k in n:
		var t0 := float(k) / float(n); var t1 := t0 + (on / (on + off)) / float(n)
		_ci.draw_line(a.lerp(b, t0), a.lerp(b, t1), col, w)

func _span(r: Dictionary, sp: Dictionary, dashed := false) -> void:
	var col := _c(RouteDraw.band_color(str(sp.band)))
	for k in [-1, 0, 1]:
		var w := _span_wire(r, sp, k)
		if dashed:
			for q in range(0, w.size() - 1, 2): _ci.draw_line(w[q], w[q + 1], col, 1.3, true)
		else: _ci.draw_polyline(w, col, 1.3, true)
	if str(sp.band) == RouteDraw.BAND_BAD:   # the clearance: a dashed drop from the wire to the ground at the tightest point
		var wg := _span_at(r, sp)
		_dashed(wg[0], wg[1], _c(RouteDraw.RED), 1.2)
		_ci.draw_circle(wg[1], 1.6, _c(RouteDraw.RED))

func _bad_marker(r: Dictionary, sp: Dictionary) -> void:
	var wg := _span_at(r, sp); var at: Vector2 = wg[0] + Vector2(0, -9)
	var pulse := 0.5 + 0.5 * sin(_t * 5.0)
	_ci.draw_circle(at, 9.0 + 3.0 * pulse, Color(RouteDraw.RED.r, RouteDraw.RED.g, RouteDraw.RED.b, (0.18 + 0.2 * pulse) * _ga))
	_ci.draw_circle(at, 6.0, Color(RouteDraw.RED.r, RouteDraw.RED.g, RouteDraw.RED.b, _ga))
	var font := CbKit.font_regular()
	_ci.draw_string(font, at + Vector2(-2.2, 4.2), "!", HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(1, 1, 1, _ga))

func _draw_route_markers() -> void:
	var sc := _scale()
	if sc < 0.7:   # overview: the real wires are sub-pixel, so a scale-compensated halo along the supports keeps every line readable
		var inv := 1.0 / maxf(sc, 0.05)
		for r in model.routes:
			var pts := PackedVector2Array()
			for sd in r.supports: pts.append(_phase_pt(sd, 0))
			if pts.size() < 2: continue
			var bad := false
			for sp in r.spans: if str(sp.band) == RouteDraw.BAND_BAD: bad = true
			var col := RouteDraw.RED if bad else Color("#C8794A")
			_ci.draw_polyline(pts, Color(0.05, 0.06, 0.12, 0.45), 5.0 * inv, true)
			_ci.draw_polyline(pts, Color(col.r, col.g, col.b, 0.95), 2.6 * inv, true)
			for q in pts: _ci.draw_circle(q, 1.7 * inv, Color("#ECE7DA"))
	for r in model.routes:
		for sp in r.spans: if str(sp.band) == RouteDraw.BAND_BAD: _bad_marker(r, sp)

func _draw_ghost() -> void:
	if not _ghost.is_empty():
		_ga = 0.55
		for sp in _ghost.spans: _span(_ghost, sp, true)
		for sd in _ghost.supports: _support(sd)
		for sp in _ghost.spans: if str(sp.band) == RouteDraw.BAND_BAD: _bad_marker(_ghost, sp)
		_ga = 1.0
	if _ghost_pending.is_empty(): return
	if _ghost_bad_tile >= 0 and model.has("terrain") and model.terrain is Dictionary:
		var cols := int(model.terrain.get("cols", 0))
		if cols > 0:
			var tq := Vector2(float(_ghost_bad_tile % cols) + 0.5, float(_ghost_bad_tile / cols) + 0.5)
			var gx := _iso(tq.x, tq.y, _zat(tq)); var r := 12.0 / maxf(_scale(), 0.05)
			_ci.draw_circle(gx, r * 1.8, Color("#E5484D", 0.22))
			_ci.draw_line(gx + Vector2(-r, -r * 0.5), gx + Vector2(r, r * 0.5), Color("#E5484D"), r * 0.3)
			_ci.draw_line(gx + Vector2(-r, r * 0.5), gx + Vector2(r, -r * 0.5), Color("#E5484D"), r * 0.3)
	var tm := _tile_m(); var prev := Vector2(NAN, NAN)
	for k in _ghost_pending.size():
		var q: Vector2 = (_ghost_pending[k] as Vector2) / tm
		var g := _iso(q.x, q.y, _zat(q))
		var inv := 1.0 / maxf(_scale(), 0.05)   # this layer is scaled with the map: keep the survey line >= 3 screen px at the overview
		if not is_nan(prev.x): _dashed(prev, g, Color("#E5484D", 0.9) if _ghost_refused else Color(WorldMath.SODIUM, 0.85), 3.0 * inv, 8.0 * inv, 5.0 * inv)
		prev = g
		_ci.draw_line(g, g + Vector2(0, -9), Color("#8A6A43"), 2.0)
		_glow(g + Vector2(0, -10), 7.0, WorldMath.SODIUM, 0.5)
		_ci.draw_circle(g + Vector2(0, -10), 2.4, WorldMath.SODIUM)

func _pole_col(fam: String) -> Color:
	match fam:
		"wood-9": return Color("#8A6A45")
		"pcc-11": return Color("#B9B8B0")
	return Color("#9AA3B0")

func _taper(base: Vector2, h: float, wb: float, wt: float, col: Color) -> void:
	_ci.draw_colored_polygon(PackedVector2Array([base + Vector2(-wb, 0), base + Vector2(wb, 0), base + Vector2(wt, -h), base + Vector2(-wt, -h)]), col)

func _support(s: Dictionary) -> void:
	var p: Vector2 = s.p; var z0 := _zat(p); var base := _iso(p.x, p.y, z0)
	var fam := str(s.family); var cls := str(s.angle_class)
	var big := cls == "large" or cls == "terminal"
	var d: Vector2 = s.dir; var perp := Vector2(-d.y, d.x)
	var top_h := float(s.pole_m) * PXM; var att_h := float(s.attach_m) * PXM
	var col := _c(_pole_col(fam)); var dark := _c(Color("#2A2418"))
	match str(s.foundation):   # piles in soft ground: a ring of dark pile heads; rock: a pale concrete anchor block
		"pile":
			for k in 4:
				var a := TAU * float(k) / 4.0 + 0.78
				var q := _iso(p.x + cos(a) * 0.1, p.y + sin(a) * 0.1, z0)
				_ci.draw_line(q, q + Vector2(0, -2.6), _c(Color("#3A2E22")), 2.2); _ci.draw_circle(q + Vector2(0, -2.6), 1.3, _c(Color("#5A4632")))
		"rock": _box(p, 0.12, 0.12, 3.2, Color("#D6D0C2"))
	for g in s.guys:   # stays: one for small / medium angles, two for large angles and dead ends
		var an: Vector2 = p + (g as Vector2) * 0.13
		_ci.draw_line(base + Vector2(0, -att_h * 0.9), _iso(an.x, an.y, _zat(an)), _c(Color("#CFC9BA")), 0.9, true)
		_ci.draw_circle(_iso(an.x, an.y, _zat(an)), 1.1, _c(Color("#CFC9BA")))
	if fam == "crossing-h":   # H-frame: two tall steel poles joined by a beam, X-braced, with stays along the line
		var o := perp * 0.11
		var b1 := _iso(p.x + o.x, p.y + o.y, z0); var b2 := _iso(p.x - o.x, p.y - o.y, z0)
		var t1 := b1 + Vector2(0, -top_h); var t2 := b2 + Vector2(0, -top_h)
		var m1 := b1 + Vector2(0, -att_h * 0.8); var m2 := b2 + Vector2(0, -att_h * 0.8)
		_ci.draw_line(b1, m2, col, 0.9); _ci.draw_line(b2, m1, col, 0.9)
		_taper(b1, top_h, 2.0, 1.1, col); _taper(b2, top_h, 2.0, 1.1, col)
		_ci.draw_line(b1 + Vector2(0, -att_h), b2 + Vector2(0, -att_h), col, 2.6)
		for sd in [-1.0, 1.0]:
			for pt in [[t1, p + o], [t2, p - o]]:
				var an2: Vector2 = (pt[1] as Vector2) + d * 0.16 * sd
				_ci.draw_line(pt[0], _iso(an2.x, an2.y, _zat(an2)), _c(Color("#CFC9BA")), 0.8, true)
	else:
		match fam:
			"wood-9": _ci.draw_line(base, base + Vector2(0, -top_h), col, 2.2)
			"pcc-11": _ci.draw_line(base, base + Vector2(0, -top_h), col, 3.0); _ci.draw_line(base + Vector2(-0.8, 0), base + Vector2(-0.8, -top_h), _c(_shade(_pole_col(fam), 1.12)), 0.8)
			_: _taper(base, top_h, 2.3, 1.0, col)
		var a0 := _phase_pt(s, -1); var a1 := _phase_pt(s, 1); var ctr := (a0 + a1) * 0.5
		_ci.draw_line(ctr + (a0 - ctr) * 1.3, ctr + (a1 - ctr) * 1.3, dark if fam != "wood-9" else _c(Color("#6A4E30")), 3.4 if big else 1.9)
	for k in [-1, 0, 1]:   # insulators: a short string under the arm on heavy structures (they hold the wire's full tension)
		var ap := _phase_pt(s, k)
		if big or fam == "crossing-h": _ci.draw_line(ap + Vector2(0, -2.2), ap, _c(Color("#C9D6DE")), 1.4)
		else: _ci.draw_circle(ap + Vector2(0, 0.6), 1.0, _c(Color("#C9D6DE")))

# ---- Cute mode: crocodiles in the swamp, the lineman, market stalls ----------------------------------------------------
func _croc_state(o: Dictionary) -> String:
	if bool(o.get("res", false)):
		for r in model.routes:
			for sd in r.supports: if str(sd.foundation) == "pile": return "happy"
		return "sulk"
	var r := _route_of(str(o.rid))
	return "worried" if not r.is_empty() and bool(r.any_bad) else "happy"

func _croc(o: Dictionary) -> void:
	if not cute: return
	var st := _croc_state(o)
	var p: Vector2 = o.p; var base := _iso(p.x, p.y, _zat(p))
	var wag := sin(_t * (3.0 if st == "happy" else 1.2) + float(o.v) * 6.0)
	var body := _c(Color("#4F9157")); var belly := _c(Color("#A9D08A")); var ink := Color("#2A2418")
	_ell(base + Vector2(0, 1), 11.0, 3.6, Color(0, 0, 0, 0.22))
	var tail := PackedVector2Array([base + Vector2(-5, -3.5), base + Vector2(-17, -2.0 + wag * 2.6), base + Vector2(-5, -0.5)])
	_ci.draw_colored_polygon(tail, _shade(body, 0.85))
	_ell(base + Vector2(0, -3.2), 8.2, 3.6, body)
	_ell(base + Vector2(0, -2.4), 6.0, 2.0, belly)
	for k in 3: _ci.draw_circle(base + Vector2(-4.0 + float(k) * 3.4, -6.4), 0.9, _shade(body, 0.8))   # back ridges
	var head := base + Vector2(8.0, -4.6)
	_ell(head, 4.6, 3.2, body)
	_ci.draw_colored_polygon(PackedVector2Array([head + Vector2(2, -1.8), head + Vector2(9.0, -0.6), head + Vector2(9.0, 1.6), head + Vector2(2, 2.4)]), _shade(body, 1.05))
	_ci.draw_line(head + Vector2(3.0, 1.4), head + Vector2(9.0, 1.0), ink, 0.8)
	_ci.draw_circle(head + Vector2(8.2, -0.3), 0.5, ink)
	var eye := head + Vector2(1.0, -3.6)
	match st:
		"happy":   # eyes closed, a little smile: it stands on piles
			_ci.draw_arc(eye, 1.5, PI + 0.3, TAU - 0.3, 8, ink, 1.1); _ci.draw_arc(eye + Vector2(-3.2, 0.4), 1.2, PI + 0.3, TAU - 0.3, 8, ink, 1.0)
			_ci.draw_arc(head + Vector2(5.5, 0.2), 2.4, 0.3, PI - 0.5, 8, ink, 0.9)
		"worried":   # peeks at the red span: eyes wide, pupils looking up the line, a sweat drop
			var look := Vector2(1.0, -0.6)
			for ex in [eye, eye + Vector2(-3.2, 0.4)]:
				_ci.draw_circle(ex, 1.9, Color.WHITE); _ci.draw_circle(ex + look * 0.6, 0.9, ink)
				_ci.draw_line(ex + Vector2(-1.6, -2.4), ex + Vector2(1.4, -1.8), ink, 0.9)
			_ci.draw_circle(head + Vector2(-3.4, -4.0 + fposmod(_t * 6.0, 3.0)), 0.9, Color("#7FC8FF"))
		_:   # sulk: no piles yet, eyes half shut, a frown
			for ex in [eye, eye + Vector2(-3.2, 0.4)]:
				_ci.draw_circle(ex, 1.5, Color.WHITE); _ci.draw_circle(ex + Vector2(0, 0.4), 0.8, ink); _ci.draw_line(ex + Vector2(-1.6, -0.9), ex + Vector2(1.6, -0.9), ink, 1.2)
			_ci.draw_arc(head + Vector2(5.5, 3.0), 2.2, PI + 0.5, TAU - 0.5, 8, ink, 0.9)

func _draw_lineman() -> void:
	if not cute: return
	var dt := _t - float(_lineman.t0)
	if dt < 0.0 or dt > 2.0: return
	var r := _route_of(str(_lineman.rid))
	if r.is_empty(): return
	var i := clampi(int(_lineman.i), 0, r.supports.size() - 1)
	var s: Dictionary = r.supports[i]
	var p: Vector2 = s.p; var base := _iso(p.x, p.y, _zat(p))
	var top_h := float(s.attach_m) * PXM
	var f := clampf(dt / 1.5, 0.0, 1.0); f = f * f * (3.0 - 2.0 * f)
	var at := base + Vector2(3.6, -top_h * f - 3.0)
	var ink := Color("#2A2418"); var step := sin(dt * 14.0)
	_ci.draw_line(at + Vector2(0, 2.0), at + Vector2(-1.4 + step, 6.5), Color("#3D4A6B"), 1.6); _ci.draw_line(at + Vector2(0, 2.0), at + Vector2(1.4 - step, 6.5), Color("#3D4A6B"), 1.6)   # legs
	_ci.draw_colored_polygon(PackedVector2Array([at + Vector2(-2.2, 2.6), at + Vector2(2.2, 2.6), at + Vector2(1.8, -3.4), at + Vector2(-1.8, -3.4)]), Color("#FF8A3C"))   # hi-vis vest
	var wave := f >= 1.0
	_ci.draw_line(at + Vector2(-1.6, -2.6), at + Vector2(-3.0, -5.2 - step * 0.8), Color("#C8956A"), 1.3)
	_ci.draw_line(at + Vector2(1.6, -2.6), at + Vector2(3.6, (-6.4 + sin(dt * 12.0) * 1.4) if wave else (-5.2 + step * 0.8)), Color("#C8956A"), 1.3)
	_ci.draw_circle(at + Vector2(0, -5.6), 2.1, Color("#C8956A"))
	_ci.draw_arc(at + Vector2(0, -5.8), 2.3, PI, TAU, 8, Color("#FFD23C"), 1.8)   # hard hat
	_ci.draw_circle(at + Vector2(-0.8, -5.6), 0.35, ink); _ci.draw_circle(at + Vector2(0.8, -5.6), 0.35, ink)

func _stall(o: Dictionary) -> void:
	if not cute: return
	var t: Dictionary = model.towns[o.ti]
	var e := float(t.energy)   # the stalls' lamps follow the town's lit share
	var p: Vector2 = o.p; var base := _box(p, 0.26, 0.18, 4.0, Color("#9A7A4E"))
	var a := _iso(p.x - 0.18, p.y + 0.12, base + 9.0); var b := _iso(p.x + 0.18, p.y + 0.12, base + 9.0)
	var c := _iso(p.x + 0.18, p.y - 0.12, base + 11.0); var dd := _iso(p.x - 0.18, p.y - 0.12, base + 11.0)
	var s1 := Color("#E5484D") if int(o.k) % 2 == 0 else Color("#5B8CE0")
	_ci.draw_colored_polygon(PackedVector2Array([a, b, c, dd]), _c(s1))
	for q in 3: _ci.draw_line(a.lerp(b, (float(q) + 0.5) / 3.0), dd.lerp(c, (float(q) + 0.5) / 3.0), _c(Color("#F3EEDF")), 1.2)
	var lamp := a.lerp(b, 0.5) + Vector2(0, 2.5)
	var lit := clampf(e * _gain, 0.0, 1.0)
	_ci.draw_circle(lamp, 1.3, UNLIT.lerp(WorldMath.SODIUM, lit))
	if lit > 0.05 and _night > 0.2: _glow(lamp, 8.0, WorldMath.SODIUM, 0.3 * lit * _night)

## What a built route has under a screen point: {kind: "support"|"span", branch, index} or {} (nothing within ROUTE_HIT_PX).
func route_hit(sp: Vector2) -> Dictionary:
	var best := {}; var bd := 1e9
	for r in model.routes:
		for i in r.supports.size():
			var s: Dictionary = r.supports[i]; var p: Vector2 = s.p
			var b := to_screen(_iso(p.x, p.y, _zat(p))); var t := to_screen(_iso(p.x, p.y, _zat(p) + float(s.pole_m) * PXM))
			var d := _dist_poly(sp, PackedVector2Array([b, t]))
			if d <= ROUTE_HIT_PX and d < bd: bd = d; best = {"kind": "support", "branch": str(r.id), "index": i}
	if not best.is_empty(): return best
	for r in model.routes:
		for sp2 in r.spans:
			var w := _span_wire(r, sp2, 0); var scr := PackedVector2Array()
			for q in w: scr.append(to_screen(q))
			var d2 := _dist_poly(sp, scr)
			if d2 <= ROUTE_HIT_PX and d2 < bd: bd = d2; best = {"kind": "span", "branch": str(r.id), "index": int(sp2.i)}
	return best

## Screen position (local) of a built route's support `index` (top of the pole) or span `index` (its middle wire point); NAN when unknown. For tags.
func route_anchor(kind: String, branch_id: String, index: int) -> Vector2:
	var r := _route_of(branch_id)
	if r.is_empty(): return Vector2(NAN, NAN)
	if kind == "support" and index >= 0 and index < r.supports.size():
		var s: Dictionary = r.supports[index]; var p: Vector2 = s.p
		return to_screen(_iso(p.x, p.y, _zat(p) + float(s.pole_m) * PXM))
	if kind == "span" and index >= 0 and index < r.spans.size():
		var w := _span_wire(r, r.spans[index], 0)
		return to_screen(w[w.size() / 2])
	return Vector2(NAN, NAN)
