class_name CareerMap
extends Control
## The district map: two primaries at the top, every feeder a coloured line of its sections running down the screen (colour = the feeder's loading or each section's health), badges for
## tie / recloser / regulator / battery / demand response, switch marks at section heads, incident halos. A tap picks the nearest section (or a primary): `picked` carries
## {type: "section", id, feeder} or {type: "primary", id}. Display and picking only: every number is the engine's `career` query.

signal picked(sel: Dictionary)

var d: Dictionary = {}
var mode := "load"                ## "load" | "health"
var sel: Dictionary = {}          ## the picked target: {type, id, feeder?}
var hot: Array = []               ## feeder ids with an open incident
var compact := false

var _prim: Dictionary = {}        ## primary id -> centre
var _pts: Dictionary = {}         ## feeder id -> PackedVector2Array (head ... tip, one point per section boundary)
var _order: Array = []            ## feeder ids left to right
var _tip_of: Dictionary = {}      ## feeder id -> position of its label
var _key := ""

func _init() -> void:
	name = "CareerMap"; clip_contents = true; mouse_filter = Control.MOUSE_FILTER_STOP; mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	custom_minimum_size = Vector2(200, 160)

func set_data(data: Dictionary) -> void:
	d = data; _layout(true); queue_redraw()

func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED: _layout(true); queue_redraw()

func _sc() -> float: return 0.8 if compact else 1.0

## Feeders left to right grouped by primary; each feeder runs from its primary to a column at the bottom, one point per section boundary (spaced by km), with a gentle bend.
func _layout(force := false) -> void:
	if d.is_empty() or size.x < 40.0: return
	var feeders: Array = d.get("feeders", []); var prims: Array = d.get("primaries", [])
	var key := "%s|%d|%d|%d" % [str(size), feeders.size(), prims.size(), (feeders.map(func(f): return (f.sections as Array).size()) as Array).reduce(func(a, b): return a + b, 0)]
	if not force and key == _key: return
	_key = key; _prim.clear(); _pts.clear(); _order.clear(); _tip_of.clear()
	var by: Dictionary = {}
	for p in prims: by[str(p.id)] = []
	for f in feeders:
		if not by.has(str(f.primaryId)): by[str(f.primaryId)] = []
		(by[str(f.primaryId)] as Array).append(f)
	var n := feeders.size()
	var mx := 46.0 * _sc(); var top := (62.0 if compact else 84.0); var bot := size.y - (52.0 if compact else 66.0)
	var i := 0
	for pid in by:
		var grp: Array = by[pid]
		var sx := 0.0
		for f in grp:
			var ex := mx + (float(i) + 0.5) / float(maxi(n, 1)) * (size.x - 2.0 * mx)
			sx += ex; _order.append(str(f.id)); i += 1
		var px := sx / float(maxi(grp.size(), 1)) if not grp.is_empty() else size.x * 0.5
		_prim[pid] = Vector2(px, top)
	for f in feeders:
		var fid := str(f.id)
		var idx := _order.find(fid)
		var ex := mx + (float(idx) + 0.5) / float(maxi(n, 1)) * (size.x - 2.0 * mx)
		var p0: Vector2 = _prim.get(str(f.primaryId), Vector2(size.x * 0.5, top))
		var p1 := Vector2(ex, bot)
		var secs: Array = f.sections; var tot := 0.0
		for s in secs: tot += float(s.km)
		var gi := _grp_idx(f, feeders); var gn := _grp_n(f, feeders)
		var head := p0 + Vector2((float(gi) - float(gn - 1) * 0.5) * 24.0 * _sc(), 20.0 * _sc())   # the feeders leave the primary side by side, like breakers on a busbar
		var pts := PackedVector2Array([head]); var acc := 0.0
		var perp := Vector2(1, 0)
		for k in secs.size():
			acc += float(secs[k].km); var t := acc / maxf(tot, 0.01)
			var base := head.lerp(p1, t)
			var bend := sin(t * PI) * (12.0 if k < secs.size() - 1 else 0.0) * _sc() * (1.0 if idx % 2 == 0 else -1.0)
			pts.append(base + perp * bend)
		_pts[fid] = pts; _tip_of[fid] = pts[pts.size() - 1]

func _conductor_w(c: String) -> float:
	var w := 3.5
	match c:
		"Weasel": w = 2.5
		"Rabbit": w = 3.5
		"Dog": w = 5.0
		_: w = 4.0
	return w * _sc()

const GROUND_TOP := Color("#16241F"); const GROUND_BOT := Color("#0F1A22"); const RIVER := Color("#1B3A55"); const ROAD := Color("#2A2F38")
const ROOF := Color("#2C3346"); const WALL := Color("#3A4258"); const WIN_LIT := Color("#FFC46B"); const WIN_DARK := Color("#20263A")

## 1.9: the district as a place at night (the owner: "not a table"): fields, a river, a road under every feeder with its poles, and the
## houses each section serves beside it, windows lit while the section is in service and dark while it is out. Stable per seed of the ids.
func _draw_place(feeders: Array) -> void:
	draw_polygon(PackedVector2Array([Vector2.ZERO, Vector2(size.x, 0), size, Vector2(0, size.y)]), PackedColorArray([GROUND_TOP, GROUND_TOP, GROUND_BOT, GROUND_BOT]))
	for k in 90:   # fields and copses: faint patches
		var p := Vector2(WorldMath.hash2(k, 3, 17) * size.x, WorldMath.hash2(k, 5, 17) * size.y)
		var r := (14.0 + 30.0 * WorldMath.hash2(k, 7, 17)) * _sc()
		draw_circle(p, r, Color(0.2, 0.32, 0.24, 0.10 + 0.08 * WorldMath.hash2(k, 9, 17)))
	var rv := PackedVector2Array()   # the river, across the district below the substations
	for k in 41:
		var x := size.x * float(k) / 40.0
		rv.append(Vector2(x, size.y * 0.42 + sin(float(k) * 0.35) * 26.0 * _sc() + float(k) * 0.9))
	draw_polyline(rv, Color(RIVER, 0.55), 26.0 * _sc(), true); draw_polyline(rv, Color(RIVER.lightened(0.15), 0.5), 12.0 * _sc(), true)
	for f in feeders:
		var pts: PackedVector2Array = _pts.get(str(f.id), PackedVector2Array())
		if pts.size() < 2: continue
		draw_polyline(pts, ROAD, 15.0 * _sc(), true)
		var secs: Array = f.sections
		var per := maxi(2, int(float(f.get("customers", 4000)) / 1200.0 / maxf(1.0, float(secs.size()))))
		for k in secs.size():
			var a := pts[k]; var b := pts[k + 1]; var dirv := (b - a).normalized(); var nrm := dirv.orthogonal()
			var lit := not (bool(secs[k].failed) and float(secs[k].outQ) > 0.0)
			for h in per:
				var t := (float(h) + 0.5) / float(per)
				var side := 1.0 if (h + k) % 2 == 0 else -1.0
				var hp := a.lerp(b, t) + nrm * side * (20.0 + 8.0 * WorldMath.hash2(h, k + int(str(f.id).hash() % 97), 23)) * _sc()
				_house(hp, lit, h + k * 7)
			var pole := pts[k + 1]
			draw_line(pole, pole + Vector2(0, -9.0) * _sc(), Color("#5B4A38"), 2.0)

func _house(p: Vector2, lit: bool, seed_i: int) -> void:
	var w := (13.0 + 4.0 * WorldMath.hash2(seed_i, 1, 31)) * _sc(); var h := w * 0.7
	draw_rect(Rect2(p - Vector2(w * 0.5, h * 0.5), Vector2(w, h)), WALL)
	draw_colored_polygon(PackedVector2Array([p + Vector2(-w * 0.6, -h * 0.5), p + Vector2(w * 0.6, -h * 0.5), p + Vector2(0, -h * 1.15)]), ROOF)
	var wc := WIN_LIT if lit else WIN_DARK
	if lit and WorldMath.hash2(seed_i, 2, 31) < 0.2: wc = Color(WIN_LIT, 0.5)
	draw_rect(Rect2(p + Vector2(-w * 0.3, -h * 0.15), Vector2(w * 0.22, h * 0.3)), wc)
	draw_rect(Rect2(p + Vector2(w * 0.08, -h * 0.15), Vector2(w * 0.22, h * 0.3)), wc)

func _draw() -> void:
	if d.is_empty() or _pts.is_empty(): draw_rect(Rect2(Vector2.ZERO, size), GROUND_BOT); return
	_draw_place(d.get("feeders", []))
	var f_bold := GridTheme.font("semi"); var f_mono := GridTheme.font("mono")
	var fs_l := GridTheme.fs(13 if compact else 15)
	var feeders: Array = d.get("feeders", [])
	# ties first (under the lines)
	var done := {}
	for f in feeders:
		if not bool(f.tie): continue
		var i := _order.find(str(f.id)); var j := i + 1 if i + 1 < _order.size() else i - 1
		if j < 0: continue
		var a: Vector2 = _tip_of[_order[i]]; var b: Vector2 = _tip_of[_order[j]]
		var ky := "%d-%d" % [mini(i, j), maxi(i, j)]
		if done.has(ky): continue
		done[ky] = true
		_dashed(a, b, Color(GridTheme.TEXT, 0.85), 2.0 * _sc())
	for f in feeders:
		var fid := str(f.id); var pts: PackedVector2Array = _pts.get(fid, PackedVector2Array())
		if pts.size() < 2: continue
		var secs: Array = f.sections
		if hot.has(fid):
			var pulse := 0.5 + 0.5 * sin(Time.get_ticks_msec() * 0.006)
			draw_polyline(pts, Color(GridTheme.BAD, 0.2 + 0.2 * pulse), 16.0 * _sc(), true)
		var lc := CareerKit.load_col(float(f.loadingPct))
		for k in secs.size():
			var sec: Dictionary = secs[k]
			var col: Color = lc if mode == "load" else CareerKit.health_col(float(sec.health))
			var w := _conductor_w(str(sec.conductor))
			var selected := str(sel.get("type", "")) == "section" and str(sel.get("id", "")) == str(sec.id)
			var same_feeder := str(sel.get("feeder", "")) == fid and str(sel.get("type", "")) == "section"
			if selected: draw_line(pts[k], pts[k + 1], Color(1, 1, 1, 0.5), w + 9.0 * _sc(), true)
			elif same_feeder: draw_line(pts[k], pts[k + 1], Color(1, 1, 1, 0.14), w + 6.0 * _sc(), true)
			draw_line(pts[k], pts[k + 1], col, w, true)
			var mid := (pts[k] + pts[k + 1]) * 0.5
			if bool(sec.failed):   # a patch: the section is in service but wearing; replacing it is the proper fix (red when it is out of service)
				var pc: Color = GridTheme.BAD if float(sec.outQ) > 0.0 else GridTheme.WARN
				draw_circle(mid, 7.0 * _sc(), CareerKit.INKBG); draw_arc(mid, 7.0 * _sc(), 0, TAU, 14, pc, 2.0, true)
				draw_line(mid + Vector2(-4, -4) * _sc(), mid + Vector2(4, 4) * _sc(), pc, 2.5); draw_line(mid + Vector2(-4, 4) * _sc(), mid + Vector2(4, -4) * _sc(), pc, 2.5)
			if selected: GridText.ds(self, f_mono, mid + Vector2(10, -8) * _sc(), str(sec.id), HORIZONTAL_ALIGNMENT_LEFT, -1, fs_l, Color.WHITE)
			# the switch at the section's head (the first section hangs on the feeder breaker)
			var dev := str(sec.device)
			if k > 0 and dev != "none":
				var hp := pts[k]; var r := 5.5 * _sc()
				match dev:
					"manual": draw_circle(hp, r + 1.5, CareerKit.INKBG); draw_arc(hp, r, 0, TAU, 14, GridTheme.TEXT, 2.0, true)
					"remote": draw_circle(hp, r + 2.0, CareerKit.INKBG); draw_circle(hp, r, GridTheme.SODIUM); draw_arc(hp, r + 2.0, 0, TAU, 16, GridTheme.TEXT, 1.5, true)
					"fuse": draw_rect(Rect2(hp - Vector2(r, r * 0.7), Vector2(r * 2.0, r * 1.4)), GridTheme.TEXT)
		# label at the tip, badges under it
		var tip: Vector2 = _tip_of[fid]
		var txt := (T("CAR_FEEDER_LABEL") % [fid, int(round(float(f.loadingPct)))]) if mode == "load" else (T("CAR_FEEDER_LABEL_H") % fid)
		var ts := f_bold.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs_l)
		var ly := tip.y + 20.0 * _sc() + (0.0 if _order.find(fid) % 2 == 0 else 0.0)
		GridText.ds(self, f_bold, Vector2(tip.x - ts.x * 0.5, ly), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs_l, lc if mode == "load" else GridTheme.TEXT)
		var badges := _badges(f)
		var bw := 20.0 * _sc()
		var bx := tip.x - (badges.size() * bw) * 0.5
		for bd in badges:
			_badge(Vector2(bx + bw * 0.5, ly + 14.0 * _sc()), str(bd[0]), bd[1], f_bold)
			bx += bw
	# primaries
	for pid in _prim:
		var c: Vector2 = _prim[pid]
		var pi := CareerKit.find_id(d.primaries, str(pid))
		var nm := str(pid) if compact or pi < 0 else "%s  %s" % [str(pid), str(d.primaries[pi].name)]
		var ts2 := f_bold.get_string_size(nm, HORIZONTAL_ALIGNMENT_LEFT, -1, fs_l)
		var two := pi >= 0 and not compact   # 1.9: the firm margin is a second line inside the plate (beside it, it ran into the next substation at 1280)
		var rect := Rect2(c - Vector2(ts2.x * 0.5 + 12.0, 17.0 * _sc()), Vector2(ts2.x + 24.0, 34.0 * _sc() + (fs_l + 4.0 if two else 0.0)))
		var chosen := str(sel.get("type", "")) == "primary" and str(sel.get("id", "")) == str(pid)
		var yard := Rect2(c + Vector2(-60.0, -6.0) * _sc(), Vector2(120.0, 40.0) * _sc() + Vector2(0, fs_l + 4.0))   # the substation yard behind its name plate: fence, two transformers
		draw_rect(yard, Color("#1E2A2A")); draw_rect(yard, Color("#6E7A86", 0.8), false, 1.5)
		for tx in [-28.0, 28.0]: draw_rect(Rect2(c + Vector2(tx - 10.0, 14.0) * _sc() + Vector2(0, fs_l + 4.0), Vector2(20.0, 14.0) * _sc()), Color("#55606E"))
		draw_rect(rect, Color("#1C2547")); draw_rect(rect, GridTheme.SODIUM if chosen else Color(GridTheme.SODIUM_DIM, 0.8), false, 3.0 if chosen else 2.0)
		GridText.ds(self, f_bold, Vector2(rect.position.x + 12.0, rect.position.y + 17.0 * _sc() + fs_l * 0.35), nm, HORIZONTAL_ALIGNMENT_LEFT, -1, fs_l, GridTheme.SODIUM if chosen else GridTheme.TEXT)
		if pi >= 0 and not compact:
			var mp := float(d.primaries[pi].firmMarginPct)
			var s2 := T("CAR_FIRM_TAG") % CareerKit.num(mp, 0)
			GridText.ds(self, f_mono, Vector2(rect.position.x + 12.0, rect.end.y - 8.0), s2, HORIZONTAL_ALIGNMENT_LEFT, -1, GridTheme.fs(13), CareerKit.load_col(100.0 - mp) if mp < 100.0 else GridTheme.GOOD)

func _badges(f: Dictionary) -> Array:
	var out: Array = []
	if bool(f.tie): out.append(["T", GridTheme.TEXT])
	if bool(f.recloser): out.append(["R", GridTheme.SODIUM])
	if bool(f.get("hardened", false)): out.append(["H", GridTheme.SODIUM])
	if bool(f.regulator): out.append(["V", Color("#8FD3FF")])
	if float(f.batteryKw) > 0.0: out.append(["B", GridTheme.GOOD])
	if float(f.drKw) > 0.0: out.append(["D", Color("#E6A0FF")])
	return out

func _badge(c: Vector2, letter: String, col: Color, font: Font) -> void:
	var r := 8.5 * _sc()
	draw_circle(c, r, Color(col, 0.2)); draw_arc(c, r, 0, TAU, 16, col, 1.6, true)
	var fz := GridTheme.fs(12)
	var ts := font.get_string_size(letter, HORIZONTAL_ALIGNMENT_LEFT, -1, fz)
	GridText.ds(self, font, Vector2(c.x - ts.x * 0.5, c.y + fz * 0.35), letter, HORIZONTAL_ALIGNMENT_LEFT, -1, fz, col)

func _dashed(a: Vector2, b: Vector2, col: Color, w: float) -> void:
	var mid := (a + b) * 0.5 + Vector2(0, 26.0 * _sc())
	var prev := a
	for i in range(1, 21):
		var t := float(i) / 20.0
		var q := a.lerp(mid, t).lerp(mid.lerp(b, t), t)
		if i % 2 == 1: draw_line(prev, q, col, w, true)
		prev = q

func T(key: String) -> String: return TranslationServer.translate(key)

## Nearest pickable thing to a point: {type, id, ...} or {}.
func pick_at(p: Vector2) -> Dictionary:
	var best := {}; var bd := (24.0 if CbLayout.touch else 16.0) * _sc() + 4.0
	for pid in _prim:
		var c: Vector2 = _prim[pid]
		if Rect2(c - Vector2(70, 22), Vector2(140, 44)).has_point(p): return {"type": "primary", "id": str(pid)}
	for f in d.get("feeders", []):
		var pts: PackedVector2Array = _pts.get(str(f.id), PackedVector2Array())
		for k in (f.sections as Array).size():
			if k + 1 >= pts.size(): break
			var q := Geometry2D.get_closest_point_to_segment(p, pts[k], pts[k + 1])
			var dist := p.distance_to(q)
			if dist < bd: bd = dist; best = {"type": "section", "id": str(f.sections[k].id), "feeder": str(f.id)}
	return best

## A point on the screen for a section / primary (the centre of its segment), in this control's coordinates; (-1, -1) when unknown. Tests click here.
func point_of(s: Dictionary) -> Vector2:
	if str(s.get("type", "")) == "primary": return _prim.get(str(s.id), Vector2(-1, -1))
	for f in d.get("feeders", []):
		for k in (f.sections as Array).size():
			if str(f.sections[k].id) == str(s.id):
				var pts: PackedVector2Array = _pts.get(str(f.id), PackedVector2Array())
				if k + 1 < pts.size(): return (pts[k] + pts[k + 1]) * 0.5
	return Vector2(-1, -1)

func _gui_input(e: InputEvent) -> void:
	if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT:
		var s := pick_at(e.position)
		if not s.is_empty(): picked.emit(s)
		accept_event()

func _process(_dt: float) -> void:
	if not hot.is_empty() and visible and PaperKit.animate(): queue_redraw()

func _grp_n(f: Dictionary, feeders: Array) -> int:
	var n := 0
	for g in feeders:
		if str(g.primaryId) == str(f.primaryId): n += 1
	return n

func _grp_idx(f: Dictionary, feeders: Array) -> int:
	var n := 0
	for g in feeders:
		if str(g.id) == str(f.id): return n
		if str(g.primaryId) == str(f.primaryId): n += 1
	return n
