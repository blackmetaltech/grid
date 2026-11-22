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

const RIVER := Color("#2B5E86"); const ROAD := Color("#3A3F4A")
const ROOF := Color("#4A5068"); const WALL := Color("#6A7290"); const WIN_LIT := Color("#FFC46B"); const WIN_DARK := Color("#1A1F30")
const PAPER_LBL := Color("#EFE6CF"); const INK_LBL := Color("#2A2418")

## 1.10: the district as a place (coordinator: "a letter about F1 points at something you can see"). Ground by district: Home Counties
## patchwork fields, Harbour City streets and a harbour, High Moor hills with snow in winter. Each feeder runs down a road through its
## villages (a named village per feeder, houses clustered per section, windows dark while the section or the feeder is out). The
## story's places (the hospital, the villages, the charging hub, the turbine) stand on their feeders with a paper label.
var _name_rects: Array = []

func _geo() -> String:
	var c := str(d.get("charter", "standard"))
	return c if c == "city" or c == "moor" else ""

func _draw_ground() -> void:
	var g := _geo()
	var winter := int(d.get("quarter", 1)) == 1
	if g == "city":
		draw_rect(Rect2(Vector2.ZERO, size), Color("#1C2230"))
		var step := 46.0 * _sc()
		var y := 0.0; var row := 0
		while y < size.y * 0.86:   # blocks between streets, a few windows lit
			var x := fmod(float(row) * 17.0, step); var col := 0
			while x < size.x:
				var bw := step - 8.0; var bh := step * 0.62
				draw_rect(Rect2(Vector2(x + 4.0, y + 4.0), Vector2(bw, bh)), Color("#262E40"))
				for k in 3:
					if WorldMath.hash2(row * 31 + col, k, 41) < 0.35: draw_rect(Rect2(Vector2(x + 8.0 + k * bw * 0.3, y + 10.0), Vector2(5, 5) * _sc()), Color(WIN_LIT, 0.55))
				x += step; col += 1
			y += step * 0.75; row += 1
		draw_rect(Rect2(Vector2(0, size.y * 0.88), Vector2(size.x, size.y * 0.12)), Color("#183A5A"))   # the harbour
		for k in 6: draw_rect(Rect2(Vector2(size.x * (0.08 + k * 0.16), size.y * 0.86), Vector2(60, 10) * _sc()), Color("#4A4F5C"))   # quays
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
	var rw := 30.0 if _geo() == "city" else (14.0 if _geo() == "moor" else 22.0)
	draw_polyline(rv, RIVER, rw * _sc(), true); draw_polyline(rv, RIVER.lightened(0.2), rw * 0.35 * _sc(), true)
	var names: Array = d.get("villageNames", [])
	_name_rects.clear()
	for fi in feeders.size():
		var f: Dictionary = feeders[fi]
		var pts: PackedVector2Array = _pts.get(str(f.id), PackedVector2Array())
		if pts.size() < 2: continue
		draw_polyline(pts, ROAD, 16.0 * _sc(), true)
		if str(f.get("kind", "")) == "cable":   # the cable trench under the street: a dashed reinstatement line down the road
			for k2 in pts.size() - 1: draw_dashed_line(pts[k2], pts[k2 + 1], Color("#3A3F4C"), 3.0 * _sc(), 7.0 * _sc())
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
				var jb := 5.0 * _sc(); draw_rect(Rect2(pts[k + 1] - Vector2(jb, jb), Vector2(jb, jb) * 2.0), Color("#5A6170")); draw_rect(Rect2(pts[k + 1] - Vector2(jb, jb), Vector2(jb, jb) * 2.0), Color("#2A2F3A"), false, 1.5)
			else: draw_line(pts[k + 1], pts[k + 1] + Vector2(0, -11.0) * _sc(), Color("#8A7458"), 2.5)   # a pole at each section end
		if fi < names.size() and not compact:   # the feeder's village, named beside its middle
			# low on the feeder, where the feeders have spread apart, centred on the road (they ran into each other near the primaries)
			var nf := GridTheme.font("semi"); var nfz := GridText.floor_size(self, GridTheme.fs(13))
			var np := pts[pts.size() - 2].lerp(pts[pts.size() - 1], 0.35)
			var ntw := nf.get_string_size(str(names[fi]), HORIZONTAL_ALIGNMENT_LEFT, -1, nfz).x
			var nr := Rect2(np + Vector2(-ntw * 0.5 - 5.0, -nfz - 1.0), Vector2(ntw + 10.0, nfz + 7.0))
			if _name_rects.any(func(r): return (r as Rect2).grow(3.0).intersects(nr)): continue   # narrow screens: a name that would touch its neighbour is left out
			_name_rects.append(nr)
			draw_rect(nr, Color(0.06, 0.08, 0.1, 0.72))
			GridText.ds(self, nf, np + Vector2(-ntw * 0.5, 3.0), str(names[fi]), HORIZONTAL_ALIGNMENT_LEFT, -1, nfz, Color(PAPER_LBL, 0.92))
	for pl in d.get("places", []):
		_place(pl)

func _place(pl: Dictionary) -> void:
	var pts: PackedVector2Array = _pts.get(str(pl.feeder), PackedVector2Array())
	if pts.size() < 3: return
	var kind := str(pl.kind)
	var at: Vector2 = pts[2] if kind == "hospital" else (pts[pts.size() - 1] if kind == "villages" else pts[3])
	var lit := not hot.has(str(pl.feeder))
	var p := at + Vector2(-58.0, -30.0) * _sc() if kind != "villages" else pts[pts.size() - 3] + Vector2(64.0, -10.0) * _sc()
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
	var lr := Rect2(p + Vector2(-tw * 0.5 - 8.0, 18.0 * _sc()), Vector2(tw + 16.0, GridText.floor_size(self, fz) + 8.0))
	lr.position.x = clampf(lr.position.x, 2.0, size.x - lr.size.x - 2.0)   # keep the label on the map
	draw_rect(lr, PAPER_LBL); draw_rect(lr, Color(INK_LBL, 0.5), false, 1.0)
	GridText.ds(self, f, lr.position + Vector2(8.0, lr.size.y - 6.0), str(pl.name), HORIZONTAL_ALIGNMENT_LEFT, -1, fz, INK_LBL)

func _house(p: Vector2, lit: bool, seed_i: int) -> void:
	var w := (16.0 + 5.0 * WorldMath.hash2(seed_i, 1, 31)) * _sc(); var h := w * 0.72
	if _geo() == "city": h *= 1.6
	draw_rect(Rect2(p - Vector2(w * 0.5, h * 0.5), Vector2(w, h)), WALL)
	if _geo() != "city": draw_colored_polygon(PackedVector2Array([p + Vector2(-w * 0.62, -h * 0.5), p + Vector2(w * 0.62, -h * 0.5), p + Vector2(0, -h * 1.15)]), Color("#E8EEF4") if _geo() == "moor" and int(d.get("quarter", 1)) == 1 else ROOF)
	var wc := WIN_LIT if lit else WIN_DARK
	if lit and WorldMath.hash2(seed_i, 2, 31) < 0.2: wc = Color(WIN_LIT, 0.55)
	draw_rect(Rect2(p + Vector2(-w * 0.32, -h * 0.18), Vector2(w * 0.24, h * 0.32)), wc)
	draw_rect(Rect2(p + Vector2(w * 0.08, -h * 0.18), Vector2(w * 0.24, h * 0.32)), wc)
	if lit: draw_circle(p, w * 1.1, Color(WIN_LIT, 0.035))   # the glow of a lit street at night

func _draw() -> void:
	if d.is_empty() or _pts.is_empty(): draw_rect(Rect2(Vector2.ZERO, size), Color("#0F1A22")); return
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
			var s2 := T("CAR_FIRM_TAG") % CareerKit.num(0.0 if absf(mp) < 0.5 else mp, 0)
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
