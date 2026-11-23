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
	if _geo() == "city": _layout_city(feeders, mx, top, bot); return
	if _geo() == "moor": _layout_moor(feeders, mx, top, bot); return
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

## 1.12 Harbour City: a street grid running down to the waterfront. Each feeder is a cable route under the streets: down from the
## primary, across along its own street, down again and a short jog toward its ring partner, all on the street lines.
func _street() -> Vector2: return Vector2(46.0, 34.5) * _sc()
func _snap(p: Vector2) -> Vector2:
	var st := _street()
	return Vector2(round(p.x / st.x) * st.x, round(p.y / st.y) * st.y)

func _layout_city(feeders: Array, mx: float, top: float, bot: float) -> void:
	var n := feeders.size(); var st := _street()
	var pids: Array = _prim.keys()
	for k in pids.size(): _prim[pids[k]] = _snap(Vector2(size.x * (0.27 if k == 0 else 0.73), top))
	for f in feeders:
		var fid := str(f.id); var idx := _order.find(fid)
		var gi := _grp_idx(f, feeders); var gn := _grp_n(f, feeders)
		var p0: Vector2 = _prim.get(str(f.primaryId), Vector2(size.x * 0.5, top))
		var head := _snap(p0 + Vector2((float(gi) - float(gn - 1) * 0.5) * st.x, st.y * 2.0))
		var ex := _snap(Vector2(mx + (float(idx) + 0.5) / float(maxi(n, 1)) * (size.x - 2.0 * mx), 0)).x
		var ya := head.y + st.y * float(1 + gi)   # each feeder crosses on its own street, so no two routes share a block
		var yb := _snap(Vector2(0, bot - st.y * (1.0 + float(idx % 2)))).y
		var jog := st.x * (1.0 if idx % 2 == 0 else -1.0)
		var pts := PackedVector2Array([head, Vector2(head.x, ya), Vector2(ex, ya), Vector2(ex, yb), Vector2(ex + jog * 0.5, yb)])
		while pts.size() > (f.sections as Array).size() + 1: pts.remove_at(pts.size() - 1)
		_pts[fid] = pts; _tip_of[fid] = pts[pts.size() - 1]

## 1.12 High Moor: one primary (the market town's) sits by the villages; the other is far off at the top of the moor, and its feeders
## run long trunks down their own valleys before they reach the scattered farms.
func _layout_moor(feeders: Array, mx: float, top: float, bot: float) -> void:
	var pids: Array = _prim.keys()
	for k in pids.size(): _prim[pids[k]] = Vector2(size.x * 0.62, size.y * 0.30) if k == 0 else Vector2(size.x * 0.14, top)
	for f in feeders:
		var fid := str(f.id)
		var gi := _grp_idx(f, feeders); var gn := _grp_n(f, feeders)
		var far := pids.size() > 1 and str(f.primaryId) == str(pids[1])
		var p0: Vector2 = _prim.get(str(f.primaryId), Vector2(size.x * 0.5, top))
		var secs: Array = f.sections; var tot := 0.0
		for sct in secs: tot += float(sct.km)
		var pts := PackedVector2Array()
		var u := (float(gi) + 0.5) / float(maxi(gn, 1))
		if far:   # a long valley: down and across the moor, bending as the ground does
			var a := p0 + Vector2(0, 28.0 * _sc()); var tip := Vector2(mx + u * size.x * 0.42, bot)
			var ctrl := Vector2(size.x * (0.10 + 0.30 * u), size.y * 0.55)
			pts.append(a)
			var acc := 0.0
			for k in secs.size():
				acc += float(secs[k].km); var t := acc / maxf(tot, 0.01)
				pts.append(a.lerp(ctrl, t).lerp(ctrl.lerp(tip, t), t))
		else:   # radial from the market town, out to the farms around it
			var ang := lerpf(0.15 * PI, 0.85 * PI, u)
			var reach := Vector2(size.x * 0.34, (bot - p0.y) * 0.95)
			pts.append(p0 + Vector2(0, 28.0 * _sc()))
			var acc2 := 0.0
			for k in secs.size():
				acc2 += float(secs[k].km); var t2 := acc2 / maxf(tot, 0.01)
				var wob := sin(t2 * 5.0 + float(gi)) * 10.0 * _sc()
				pts.append(pts[0] + Vector2(cos(ang) * reach.x * t2 + wob, sin(ang) * reach.y * t2))
		_pts[fid] = pts; _tip_of[fid] = pts[pts.size() - 1]

## 1.12 A section as what it is on the ground: an overhead line is poles along the road with sagging spans between them; a cable
## is a trench under the street (a dark reinstatement strip with the cable route dashed in its colour).
func _span(a: Vector2, b: Vector2, col: Color, w: float, cable: bool) -> void:
	if cable:
		draw_line(a, b, Color("#11141B"), w + 6.0 * _sc(), true)
		draw_dashed_line(a, b, col, maxf(2.5, w * 0.9), 8.0 * _sc(), true)
		return
	var len := a.distance_to(b); var n := maxi(1, int(len / (30.0 * _sc())))
	var dir := (b - a) / float(n); var off := dir.normalized().orthogonal() * 7.0 * _sc()
	if off.y > 0.0: off = -off   # the poles stand on the upper side of the road
	var ww := maxf(1.8, w * 0.6)
	for i in n:
		var p0 := a + dir * float(i) + off; var p1 := a + dir * float(i + 1) + off
		draw_polyline(PackedVector2Array([p0, (p0 + p1) * 0.5 + Vector2(0, 3.5 * _sc()), p1]), col, ww, true)
	for i in n + 1:
		var pp := a + dir * float(i) + off
		draw_line(pp, pp + Vector2(0, 9.0 * _sc()), Color("#9A8262"), 2.0)
		draw_line(pp + Vector2(-4.0, 0) * _sc(), pp + Vector2(4.0, 0) * _sc(), Color("#9A8262"), 1.5)

func _conductor_w(c: String) -> float:
	var w := 3.5
	match c:
		"Weasel": w = 2.5
		"Rabbit": w = 3.5
		"Dog": w = 5.0
		"70 Al XLPE": w = 2.5
		"95 Al XLPE": w = 3.5
		"185 Al XLPE": w = 5.0
		_: w = 4.0
	return w * _sc()

const RIVER := Color("#2B5E86"); const ROAD := Color("#3A3F4A")
const ROOF := Color("#4A5068"); const WALL := Color("#6A7290"); const WIN_LIT := Color("#FFC46B"); const WIN_DARK := Color("#1A1F30")
const PAPER_LBL := Color("#EFE6CF"); const INK_LBL := Color("#2A2418")
## glass: name plates are dark glass with a hairline and light text (the paper plates stay when the 3D look is off)
func _lbl_fill() -> Color: return Color(GridTheme.GLASS, 0.9) if CareerKit.glass() else PAPER_LBL
func _lbl_edge() -> Color: return GridTheme.HAIR if CareerKit.glass() else Color(INK_LBL, 0.5)
func _lbl_ink() -> Color: return GridTheme.G_TEXT if CareerKit.glass() else INK_LBL

## 1.10: the district as a place (coordinator: "a letter about F1 points at something you can see"). Ground by district: Home Counties
## patchwork fields, Harbour City streets and a harbour, High Moor hills with snow in winter. Each feeder runs down a road through its
## villages (a named village per feeder, houses clustered per section, windows dark while the section or the feeder is out). The
## story's places (the hospital, the villages, the charging hub, the turbine) stand on their feeders with a paper label.
var _name_rects: Array = []
var _late: Array = []   ## 1.12 labels drawn after the lines (village and place names were hidden under the routes)
## 1.14 map labels go through one collision pass (coordinator: Harbour City's loading labels ran into each other, the poles and the tie line; High Moor's
## village names sat on lines and houses). Everything drawn records what a label must not cover; each label offers candidate spots; feeder labels are placed
## first, then the story's places, then village names (left out when no spot is clear). Every label sits on a paper chip.
var _obst: Array = []        ## Rect2: houses, joint bays, buildings, the substation yards
var _segs: Array = []        ## [Vector2, Vector2]: the routes and tie lines
var _req: Array = []         ## {kind, text, cands: Array[Rect2], must: bool, pri: int, draw: Callable(Rect2)}
var label_info: Array = []   ## the placed labels after a draw: {kind, text, rect, hits (obstacle area), crossings} (tests read this)

func _geo() -> String:
	var c := str(d.get("charter", "standard"))
	return c if c == "city" or c == "moor" else ""

func _draw_ground() -> void:
	var g := _geo()
	var winter := int(d.get("quarter", 1)) == 1
	if g == "city":
		draw_rect(Rect2(Vector2.ZERO, size), Color("#4A5468"))   # 1.14 the streets: light enough that the grid reads against the blocks (it was #1C2230 on #262E40)
		var st := _street(); var step := st.x
		var y := 0.0; var row := 0
		while y < size.y * 0.86:   # blocks between the streets the cable routes follow (streets on the grid lines), a few windows lit
			var x := 0.0; var col := 0
			while x < size.x:
				var bw := step - 10.0; var bh := st.y - 10.0
				draw_rect(Rect2(Vector2(x + 5.0, y + 5.0), Vector2(bw, bh)), Color("#252B38"))
				draw_line(Vector2(x + 5.0, y + 5.5), Vector2(x + 5.0 + bw, y + 5.5), Color("#5C6680", 0.8), 1.0)   # a lit roof edge, so each block is a shape
				for k in 3:
					if WorldMath.hash2(row * 31 + col, k, 41) < 0.35: draw_rect(Rect2(Vector2(x + 8.0 + k * bw * 0.3, y + 10.0), Vector2(5, 5) * _sc()), Color(WIN_LIT, 0.55))
				x += step; col += 1
			y += st.y; row += 1
		draw_rect(Rect2(Vector2(0, size.y * 0.88), Vector2(size.x, size.y * 0.12)), Color("#1F5F92"))   # the harbour
		draw_line(Vector2(0, size.y * 0.88), Vector2(size.x, size.y * 0.88), Color("#C9D2DE"), 3.0)   # 1.14 the quay edge, so the waterfront reads at a glance
		for k in 18: draw_line(Vector2(size.x * WorldMath.hash2(k, 1, 71), size.y * (0.91 + 0.07 * WorldMath.hash2(k, 2, 71))), Vector2(size.x * WorldMath.hash2(k, 1, 71) + 26.0 * _sc(), size.y * (0.91 + 0.07 * WorldMath.hash2(k, 2, 71))), Color("#7FB4DE", 0.5), 1.5)   # ripples
		for k in 6: draw_rect(Rect2(Vector2(size.x * (0.08 + k * 0.16), size.y * 0.86), Vector2(60, 10) * _sc()), Color("#4A4F5C"))   # quays
		for k in 3:   # 1.12 dockside cranes on the quays: a tower, a jib out over the water, a hook
			var cb := Vector2(size.x * (0.14 + k * 0.32), size.y * 0.87)
			var col := Color("#C98A3A", 0.85)
			draw_line(cb, cb + Vector2(0, -54) * _sc(), col, 3.0); draw_line(cb + Vector2(-14, -54) * _sc(), cb + Vector2(46, -54) * _sc(), col, 3.0)
			draw_line(cb + Vector2(0, -66) * _sc(), cb + Vector2(46, -54) * _sc(), col, 1.5); draw_line(cb + Vector2(0, -66) * _sc(), cb + Vector2(-14, -54) * _sc(), col, 1.5)
			draw_line(cb + Vector2(36, -54) * _sc(), cb + Vector2(36, -28) * _sc(), Color(col, 0.7), 1.0)
		# 1.12 the high street with the tram: two rails along one street line, a tram on them; the spare ducts (if laid) beside them
		var hy: float = roundf(size.y * 0.5 / st.y) * st.y
		draw_line(Vector2(0, hy - 3.0), Vector2(size.x, hy - 3.0), Color("#8C94A6", 0.7), 1.5); draw_line(Vector2(0, hy + 3.0), Vector2(size.x, hy + 3.0), Color("#8C94A6", 0.7), 1.5)
		var tx := size.x * 0.18
		draw_rect(Rect2(Vector2(tx, hy - 8.0 * _sc()), Vector2(70, 16) * _sc()), Color("#D8B23A")); draw_rect(Rect2(Vector2(tx, hy - 8.0 * _sc()), Vector2(70, 16) * _sc()), Color("#3A3020"), false, 1.5)
		for k in 5: draw_rect(Rect2(Vector2(tx + (6.0 + k * 12.5) * _sc(), hy - 5.0 * _sc()), Vector2(8, 6) * _sc()), WIN_LIT)
		for pl in d.get("places", []):
			if str(pl.kind) != "ducts": continue
			draw_dashed_line(Vector2(0, hy + 9.0), Vector2(size.x, hy + 9.0), Color("#E07B39"), 2.5, 10.0)
			var fz := GridTheme.fs(14); var fnt := GridTheme.font("semi"); var tw := fnt.get_string_size(str(pl.name), HORIZONTAL_ALIGNMENT_LEFT, -1, GridText.floor_size(self, fz)).x
			var lr := Rect2(Vector2(size.x * 0.62, hy + 14.0), Vector2(tw + 16.0, GridText.floor_size(self, fz) + 8.0))
			draw_rect(lr, _lbl_fill()); draw_rect(lr, _lbl_edge(), false, 1.0)
			GridText.ds(self, fnt, lr.position + Vector2(8.0, lr.size.y - 6.0), str(pl.name), HORIZONTAL_ALIGNMENT_LEFT, -1, fz, _lbl_ink())
		return
	if g == "moor":
		draw_rect(Rect2(Vector2.ZERO, size), Color("#22281F"))
		for k in 14:   # hills as soft contour bands
			var c := Vector2(WorldMath.hash2(k, 1, 51) * size.x, WorldMath.hash2(k, 2, 51) * size.y)
			var r := (90.0 + 120.0 * WorldMath.hash2(k, 3, 51)) * _sc()
			for ring in 3: draw_arc(c, r - ring * 26.0 * _sc(), 0, TAU, 40, Color("#3A4632", 0.5 - ring * 0.12), 2.0, true)
			if winter:   # snow lying on the tops: flecks inside the inner contour
				for j in 26: draw_circle(c + Vector2.from_angle(WorldMath.hash2(k, j, 53) * TAU) * r * 0.5 * sqrt(WorldMath.hash2(j, k, 54)), 2.2 * _sc(), Color("#E8EEF6", 0.55))
		for k in 24:   # dry-stone walls
			var a0 := Vector2(WorldMath.hash2(k, 4, 51) * size.x, WorldMath.hash2(k, 5, 51) * size.y)
			draw_line(a0, a0 + Vector2(60.0 + 60.0 * WorldMath.hash2(k, 6, 51), 18.0 - 36.0 * WorldMath.hash2(k, 7, 51)) * _sc(), Color("#5A5A50", 0.6), 1.5)
		return
	draw_rect(Rect2(Vector2.ZERO, size), Color("#1A2A22"))
	var cell := 70.0 * _sc()
	var yy := 0.0; var r2 := 0
	while yy < size.y:   # patchwork fields, each a slightly different green or stubble
		var xx := 0.0; var c2 := 0
		while xx < size.x:
			var h := WorldMath.hash2(r2, c2, 61)
			var fc := Color("#24402C") if h < 0.4 else (Color("#2E4A2A") if h < 0.7 else (Color("#3E4A2C") if h < 0.88 else Color("#46402A")))
			draw_rect(Rect2(Vector2(xx + 1.5, yy + 1.5), Vector2(cell - 3.0, cell * 0.8 - 3.0)), fc)
			xx += cell; c2 += 1
		yy += cell * 0.8; r2 += 1

func _draw_place(feeders: Array) -> void:
	_draw_ground()
	var rv := PackedVector2Array()   # the river (an estuary in the city, a beck on the moor)
	for k in 41:
		var x := size.x * float(k) / 40.0
		rv.append(Vector2(x, size.y * 0.42 + sin(float(k) * 0.35) * 26.0 * _sc() + float(k) * 0.9))
	var rw := 14.0 if _geo() == "moor" else 22.0
	if _geo() != "city":   # the city's water is the harbour along the bottom
		draw_polyline(rv, RIVER, rw * _sc(), true); draw_polyline(rv, RIVER.lightened(0.2), rw * 0.35 * _sc(), true)
	if _geo() == "moor":   # each long feeder runs down its own valley floor
		for f in feeders:
			var vp: PackedVector2Array = _pts.get(str(f.id), PackedVector2Array())
			if vp.size() > 1: draw_polyline(vp, Color("#2E3A28", 0.85), 46.0 * _sc(), true)
	var names: Array = d.get("villageNames", [])
	_name_rects.clear()
	for fi in feeders.size():
		var f: Dictionary = feeders[fi]
		var pts: PackedVector2Array = _pts.get(str(f.id), PackedVector2Array())
		if pts.size() < 2: continue
		draw_polyline(pts, ROAD, 16.0 * _sc(), true)
		for k in pts.size() - 1: _segs.append([pts[k], pts[k + 1]])
		var secs: Array = f.sections
		var out_feeder := hot.has(str(f.id))
		var per := clampi(int(float(f.get("customers", 4000)) / 900.0 / maxf(1.0, float(secs.size()))), 2, 7)
		for k in secs.size():
			var a := pts[k]; var b := pts[k + 1]; var nrm := (b - a).normalized().orthogonal()
			var lit := not out_feeder and not (bool(secs[k].failed) and float(secs[k].get("outQ", 0)) > 0.0)
			var mid := a.lerp(b, 0.55)
			for h in per:   # a cluster: a village street either side of the road
				var side := 1.0 if h % 2 == 0 else -1.0
				var along := (float(h / 2) - float(per) * 0.25) * 15.0 * _sc()
				var hp := mid + (b - a).normalized() * along + nrm * side * (22.0 + 6.0 * WorldMath.hash2(h, k + fi * 7, 23)) * _sc()
				_house(hp, lit, h + k * 7 + fi * 31)
			if str(f.get("kind", "")) == "cable":   # underground: a joint-bay cover at each section end, no pole
				var jb := 5.0 * _sc(); _obst.append(Rect2(pts[k + 1] - Vector2(jb, jb), Vector2(jb, jb) * 2.0)); draw_rect(Rect2(pts[k + 1] - Vector2(jb, jb), Vector2(jb, jb) * 2.0), Color("#5A6170")); draw_rect(Rect2(pts[k + 1] - Vector2(jb, jb), Vector2(jb, jb) * 2.0), Color("#2A2F3A"), false, 1.5)
		if fi < names.size() and not compact:   # the feeder's village, named beside its road (1.14: the collision pass picks the spot)
			var nf := GridTheme.font("semi"); var nfz := GridText.floor_size(self, GridTheme.fs(13))
			var nm_txt := str(names[fi])
			var ntw := nf.get_string_size(nm_txt, HORIZONTAL_ALIGNMENT_LEFT, -1, nfz).x
			var sz := Vector2(ntw + 12.0, nfz + 8.0)
			var cands: Array = []
			for k in range(pts.size() - 2, -1, -1):   # low on the feeder first, where the feeders have spread apart
				var dirv := (pts[k + 1] - pts[k]).normalized(); var nrm := dirv.orthogonal()
				for t in [0.5, 0.2, 0.8, 0.05, 0.95]:
					var c: Vector2 = pts[k].lerp(pts[k + 1], t)
					for off in [0.0, 34.0, -34.0, 52.0, -52.0]:
						var cc: Vector2 = c + nrm * float(off) * _sc()
						cands.append(Rect2(cc - sz * 0.5, sz))
			_req.append({"kind": "village", "text": nm_txt, "cands": cands, "must": false, "pri": 2, "draw": func(r: Rect2): _chip(r, nm_txt, nf, nfz)})
	for pl in d.get("places", []):
		_place(pl)

func _place(pl: Dictionary) -> void:
	var pts: PackedVector2Array = _pts.get(str(pl.feeder), PackedVector2Array())
	if pts.size() < 3: return
	var kind := str(pl.kind)
	if kind == "ducts": return   # drawn along the high street with the ground
	var at: Vector2 = pts[2] if kind == "hospital" else (pts[pts.size() - 1] if kind == "villages" else pts[3])
	var lit := not hot.has(str(pl.feeder))
	var p := at + Vector2(-58.0, -30.0) * _sc() if kind != "villages" else pts[pts.size() - 3] + Vector2(64.0, -10.0) * _sc()
	p.x = clampf(p.x, 40.0 * _sc(), size.x - 40.0 * _sc()); p.y = clampf(p.y, 30.0 * _sc(), size.y - 60.0 * _sc())   # 1.12 the street layouts put a feeder at the edge: keep the building on the map
	match kind:
		"hospital":
			draw_rect(Rect2(p - Vector2(22, 14) * _sc(), Vector2(44, 28) * _sc()), Color("#C9CCD6"))
			for k in 4: draw_rect(Rect2(p + Vector2(-18.0 + k * 10.0, -8.0) * _sc(), Vector2(6, 6) * _sc()), WIN_LIT if lit else WIN_DARK)
			draw_rect(Rect2(p + Vector2(-4, 4) * _sc(), Vector2(8, 8) * _sc()), Color("#C0392B"))
		"hub":
			for k in 4: draw_rect(Rect2(p + Vector2(-16.0 + k * 9.0, -6.0) * _sc(), Vector2(6, 12) * _sc()), Color("#3FA9F5") if lit else WIN_DARK)
		"turbine":
			draw_line(p + Vector2(0, 14) * _sc(), p + Vector2(0, -14) * _sc(), Color("#D8DCE4"), 2.5)
			for k in 3: draw_line(p + Vector2(0, -14) * _sc(), p + Vector2(0, -14) * _sc() + Vector2.from_angle(Time.get_ticks_msec() * 0.002 + k * TAU / 3.0) * 13.0 * _sc(), Color("#D8DCE4"), 2.0)
		_: pass
	var fz := GridTheme.fs(14)
	var f := GridTheme.font("semi"); var tw := f.get_string_size(str(pl.name), HORIZONTAL_ALIGNMENT_LEFT, -1, GridText.floor_size(self, fz)).x
	_obst.append(Rect2(p - Vector2(24, 16) * _sc(), Vector2(48, 32) * _sc()))   # the building itself
	var lsz := Vector2(tw + 16.0, GridText.floor_size(self, fz) + 8.0)
	var cands: Array = []
	for o in [Vector2(0, 18), Vector2(0, -44), Vector2(40, -8), Vector2(-40, -8), Vector2(0, 40), Vector2(0, -66), Vector2(70, -8), Vector2(-70, -8)]:
		var cc: Vector2 = p + (o as Vector2) * _sc()
		var off := Vector2(0.0 if absf(o.x) < 1.0 else signf(o.x) * lsz.x * 0.5, 0.0)
		cands.append(Rect2(cc + off - Vector2(lsz.x * 0.5, 0.0 if o.y > 0.0 else lsz.y), lsz))
	var pl_name := str(pl.name)
	_req.append({"kind": "place", "text": pl_name, "cands": cands, "must": true, "pri": 1, "draw": func(r: Rect2): _chip(r, pl_name, f, GridText.floor_size(self, fz))})

func _house(p: Vector2, lit: bool, seed_i: int) -> void:
	var w := (16.0 + 5.0 * WorldMath.hash2(seed_i, 1, 31)) * _sc(); var h := w * 0.72
	if _geo() == "city": h *= 1.6
	draw_rect(Rect2(p - Vector2(w * 0.5, h * 0.5), Vector2(w, h)), WALL)
	_obst.append(Rect2(p - Vector2(w * 0.62, h * 1.15), Vector2(w * 1.24, h * 1.65)))
	if _geo() != "city": draw_colored_polygon(PackedVector2Array([p + Vector2(-w * 0.62, -h * 0.5), p + Vector2(w * 0.62, -h * 0.5), p + Vector2(0, -h * 1.15)]), Color("#E8EEF4") if _geo() == "moor" and int(d.get("quarter", 1)) == 1 else ROOF)
	var wc := WIN_LIT if lit else WIN_DARK
	if lit and WorldMath.hash2(seed_i, 2, 31) < 0.2: wc = Color(WIN_LIT, 0.55)
	draw_rect(Rect2(p + Vector2(-w * 0.32, -h * 0.18), Vector2(w * 0.24, h * 0.32)), wc)
	draw_rect(Rect2(p + Vector2(w * 0.08, -h * 0.18), Vector2(w * 0.24, h * 0.32)), wc)
	if lit: draw_circle(p, w * 1.1, Color(WIN_LIT, 0.035))   # the glow of a lit street at night

func _draw() -> void:
	if d.is_empty() or _pts.is_empty(): draw_rect(Rect2(Vector2.ZERO, size), Color("#0F1A22")); return
	_late.clear(); _obst.clear(); _segs.clear(); _req.clear()
	_draw_place(d.get("feeders", []))
	if CareerKit.glass(): draw_rect(Rect2(Vector2.ZERO, size), Color(GridTheme.GLASS, 0.6))   # glass: the ground sits back, dark, so the lines and light labels carry
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
		var tm := (a + b) * 0.5 + Vector2(0, 26.0 * _sc()); var tp := a
		for ti in range(1, 11):
			var tt := float(ti) / 10.0; var tq := a.lerp(tm, tt).lerp(tm.lerp(b, tt), tt)
			_segs.append([tp, tq]); tp = tq
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
			_span(pts[k], pts[k + 1], col, w, str(f.get("kind", "")) == "cable")
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
		# 1.14 the feeder's label: a paper chip with a loading swatch, the name and load, and its badges; placed by the collision pass near the tip
		var tip: Vector2 = _tip_of[fid]
		var txt := (T("CAR_FEEDER_LABEL") % [fid, int(round(float(f.loadingPct)))]) if mode == "load" else (T("CAR_FEEDER_LABEL_H") % fid)
		var ts := f_bold.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fs_l)
		var badges := _badges(f)
		var bw := 19.0 * _sc()
		var csz := Vector2(ts.x + 22.0 + badges.size() * bw, fs_l + 10.0)
		var cands: Array = []
		for o in [Vector2(0, 14), Vector2(0, 34), Vector2(0, 54), Vector2(0, -14), Vector2(0, -34), Vector2(1, 0), Vector2(-1, 0), Vector2(0, 74), Vector2(0, -54), Vector2(0, -74), Vector2(1, 30), Vector2(-1, 30), Vector2(1, -30), Vector2(-1, -30)]:
			var cx: float = tip.x - csz.x * 0.5 + (o.x * (csz.x * 0.5 + 14.0 * _sc()))
			var cy: float = tip.y + o.y * _sc() - (csz.y if o.y < 0.0 else (csz.y * 0.5 if o.y == 0.0 else 0.0))
			cands.append(Rect2(Vector2(cx, cy), csz))
		var lc2 := lc if mode == "load" else GridTheme.TEXT
		var tx2 := txt
		_req.append({"kind": "feeder", "text": txt, "cands": cands, "must": true, "pri": 0, "draw": func(r: Rect2): _feeder_chip(r, tx2, lc2, badges, f_bold, fs_l)})
	_resolve_labels()
	for cb in _late: (cb as Callable).call()
	_late.clear()
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
		draw_rect(rect, Color(GridTheme.GLASS, 0.92) if CareerKit.glass() else Color("#1C2547")); draw_rect(rect, GridTheme.SODIUM if chosen else (GridTheme.HAIR if CareerKit.glass() else Color(GridTheme.SODIUM_DIM, 0.8)), false, 3.0 if chosen else (1.0 if CareerKit.glass() else 2.0))
		GridText.ds(self, f_bold, Vector2(rect.position.x + 12.0, rect.position.y + 17.0 * _sc() + fs_l * 0.35), nm, HORIZONTAL_ALIGNMENT_LEFT, -1, fs_l, GridTheme.SODIUM if chosen else GridTheme.TEXT)
		if pi >= 0 and not compact:
			var mp := float(d.primaries[pi].firmMarginPct)
			var s2 := T("CAR_FIRM_TAG") % CareerKit.num(0.0 if absf(mp) < 0.5 else mp, 0)
			GridText.ds(self, f_mono, Vector2(rect.position.x + 12.0, rect.end.y - 8.0), s2, HORIZONTAL_ALIGNMENT_LEFT, -1, GridTheme.fs(13), CareerKit.load_col(100.0 - mp) if mp < 100.0 else GridTheme.GOOD)
	if CareerKit.glass(): draw_rect(Rect2(Vector2.ZERO, size), GridTheme.HAIR, false, 1.0)   # the hairline frame

## 1.14 the primary's name plate, where _draw puts it (labels keep clear of it)
func _prim_rect(pid: String) -> Rect2:
	var c: Vector2 = _prim[pid]
	var f_bold := GridTheme.font("semi"); var fs_l := GridTheme.fs(13 if compact else 15)
	var pi := CareerKit.find_id(d.primaries, pid)
	var nm := pid if compact or pi < 0 else "%s  %s" % [pid, str(d.primaries[pi].name)]
	var ts2 := f_bold.get_string_size(nm, HORIZONTAL_ALIGNMENT_LEFT, -1, fs_l)
	var two := pi >= 0 and not compact
	var rect := Rect2(c - Vector2(ts2.x * 0.5 + 12.0, 17.0 * _sc()), Vector2(ts2.x + 24.0, 34.0 * _sc() + (fs_l + 4.0 if two else 0.0)))
	var yard := Rect2(c + Vector2(-60.0, -6.0) * _sc(), Vector2(120.0, 40.0) * _sc() + Vector2(0, fs_l + 4.0))
	return rect.merge(yard)

func _seg_hits(r: Rect2, a: Vector2, b: Vector2) -> bool:
	if r.has_point(a) or r.has_point(b): return true
	var c := [r.position, Vector2(r.end.x, r.position.y), r.end, Vector2(r.position.x, r.end.y)]
	for i in 4:
		if Geometry2D.segment_intersects_segment(a, b, c[i], c[(i + 1) % 4]) != null: return true
	return false

## Places every requested label: for each, the candidate spot that touches no placed label and stays on the map, and covers the least (houses and buildings
## by area, each route or tie line it crosses counts as a house). A label that must show takes its least-bad spot; a village name with no clear spot is left out.
func _resolve_labels() -> void:
	label_info.clear()
	var placed: Array = []
	for pid in _prim: placed.append(_prim_rect(str(pid)))
	var bounds := Rect2(Vector2(2, 2), size - Vector2(4, 4))
	var reqs := _req.duplicate(); reqs.sort_custom(func(x, y): return int(x.pri) < int(y.pri))
	for rq in reqs:
		var best := Rect2(); var best_cost := INF; var best_hits := 0.0; var best_x := 0
		for r0 in rq.cands:
			var r: Rect2 = r0
			if not bounds.encloses(r):
				if not bool(rq.must): continue
				r.position = r.position.clamp(bounds.position, bounds.end - r.size)
			if placed.any(func(q): return (q as Rect2).grow(3.0).intersects(r)): continue
			var hits := 0.0
			for o in _obst:
				var ir := (o as Rect2).intersection(r)
				if ir.has_area(): hits += ir.get_area()
			var xs := 0
			for sg in _segs:
				if _seg_hits(r, sg[0], sg[1]): xs += 1
			var cost := hits + xs * 300.0
			if not bool(rq.must) and cost > 0.0: continue   # a village name goes only where it covers nothing
			if cost < best_cost: best_cost = cost; best = r; best_hits = hits; best_x = xs
			if cost <= 0.0: break
		if best_cost == INF: continue   # nowhere clear of the other labels: left out (a village name; a feeder always has its first spot on an uncrowded map)
		placed.append(best)
		label_info.append({"kind": str(rq.kind), "text": str(rq.text), "rect": best, "hits": best_hits, "crossings": best_x})
		(rq.draw as Callable).call(best)

func _chip(r: Rect2, txt: String, font: Font, fz: int) -> void:
	draw_rect(r, _lbl_fill()); draw_rect(r, _lbl_edge(), false, 1.0)
	GridText.ds(self, font, Vector2(r.position.x + 6.0 + (r.size.x - 12.0 - font.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fz).x) * 0.5, r.end.y - 6.0), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fz, _lbl_ink())

func _feeder_chip(r: Rect2, txt: String, col: Color, badges: Array, font: Font, fz: int) -> void:
	draw_rect(r, _lbl_fill()); draw_rect(r, _lbl_edge(), false, 1.0)
	draw_rect(Rect2(r.position + Vector2(3, 3), Vector2(6.0, r.size.y - 6.0)), col)   # the loading colour as a swatch (text on paper stays ink)
	GridText.ds(self, font, Vector2(r.position.x + 14.0, r.end.y - 6.0), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fz, _lbl_ink())
	var bw := 19.0 * _sc()
	var bx := r.end.x - badges.size() * bw - 2.0
	for bd in badges:
		_badge(Vector2(bx + bw * 0.5, r.get_center().y), str(bd[0]), (bd[1] as Color) if CareerKit.glass() else (bd[1] as Color).darkened(0.45), font)
		bx += bw

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
