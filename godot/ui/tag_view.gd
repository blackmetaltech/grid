class_name TagView
extends Control
## In-world tags (UI.md 4): click a hamlet, a cable or the hut and a paper tag hangs off it on a string, following the camera. One at a time; the
## X, Esc, pad B or a click elsewhere closes it. Everything shown comes from the engine query `benchDetail` (plus `benchKit` for the lamp reference
## and home rating, `world.bench` for the limit and layout): this file formats numbers, it never computes physics. The cable tag prints the equation
## with the player's own numbers straight from runs[].eq.

signal opened(kind: String, id: String)
signal closed
var b                               ## CbBridge
var world: WorldView
var instruments: Instruments        ## cluster rect to keep clear, optional
var slot := Callable()              ## () -> Rect2 the tray stands in, optional
var kind := ""
var id := ""
var panel: PanelContainer
var eq_label: Label                 ## the equation line of a cable tag
var lines: Array = []               ## every Label text on the open tag (tests)
var desc := {}                      ## what is shown (describe())
var _vb: VBoxContainer
var _title: Label
var _close: Button
var _t := 0.0
var _anchor := Vector2.ZERO
var _cycle := -1
var _cand := -1

func _init() -> void:
	name = "TagView"; mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	TrayStrings.load_strings()
	panel = PanelContainer.new(); panel.mouse_filter = Control.MOUSE_FILTER_STOP; panel.visible = false
	panel.add_theme_stylebox_override("panel", GridTheme.paper_sb(4, 14.0))
	_vb = VBoxContainer.new(); _vb.add_theme_constant_override("separation", 3); _vb.mouse_filter = Control.MOUSE_FILTER_IGNORE; panel.add_child(_vb)
	add_child(panel)

func tx(key: String) -> String: return TranslationServer.translate(key)
func is_open() -> bool: return panel.visible

# ---- content: pure formatting of engine numbers --------------------------------------------------------------------------------------
static func fmt_i(x: float) -> String: return "%.2f" % x
static func fmt_r(x: float) -> String: return "%.3f" % x
static func fmt_v(x: float) -> String: return "%.1f" % x
static func fmt_v0(x: float) -> String: return str(int(round(x))) if absf(x - round(x)) < 1e-9 else "%.1f" % x
static func fmt_m(x: float) -> String: return str(int(round(x)))
static func fmt_mm2(x: float) -> String: return str(int(x)) if is_equal_approx(x, round(x)) else str(x)

## The equation of a run: "V = 48 − I·R = 48 − 5.19 × 4.446 = 24.9 V". `eq` = benchDetail runs[].eq {v0, i, r, v}.
static func eq_text(eq: Dictionary) -> String:
	return TranslationServer.translate("TAG_EQ") % [fmt_v0(float(eq.v0)), fmt_v0(float(eq.v0)), fmt_i(float(eq.i)), fmt_r(float(eq.r)), fmt_v(float(eq.v))]

func _bench_world() -> Dictionary:
	var w = b.q("world")
	return (w.bench as Dictionary) if w is Dictionary and w.get("bench") is Dictionary else {}

## Which run feeds hamlet `idx`: L01 / L03 main; L02 radial main, b; trunk b, b2.
static func run_of_hamlet(scenario: String, topology: String, idx: int) -> String:
	if scenario == "l02": return ("b" if idx == 0 else "b2") if topology == "trunk" else ("main" if idx == 0 else "b")
	return "main"

static func _run(det: Dictionary, run_id: String) -> Dictionary:
	for r in det.runs: if str(r.id) == run_id: return r
	return {}

## What the tag for (kind, id) shows, from the engine only. kind: hamlet | cable | hut. {} when there is nothing to show.
func describe(k: String, oid: String) -> Dictionary:
	if b == null: return {}
	var det = b.q("benchDetail"); var kt = b.q("benchKit"); var wb := _bench_world()
	var has: bool = det is Dictionary and det.get("active", false)
	if wb.is_empty() or not (kt is Dictionary): return {}
	var scen := str(wb.get("scenario", "")); var topo := str(wb.get("topology", ""))
	match k:
		"hamlet":
			var idx := 0; var town := {}
			for t in world.model.towns: if str(t.id) == oid: town = t; idx = int(t.idx)
			if town.is_empty(): return {}
			var d := {"kind": "hamlet", "id": oid, "title": tx("TAG_SCHOOL") if scen == "l03" else (tx("TAG_HAMLET_N") % str(idx + 1) if scen == "l02" else tx("TAG_HAMLET")), "powered": has}
			var homes: Array = wb.get("homes", [])
			if scen == "l03": d["homes_text"] = tx("TAG_LOAD") % (fmt_m(float(det.totals.deliveredW)) if has else "—")
			elif idx < homes.size(): d["homes_text"] = tx("TAG_HOMES") % [str(int(homes[idx])), fmt_m(float(kt.homeW))]
			else: d["homes_text"] = ""
			if not has: d["dark"] = tx("TAG_DARK"); d["v"] = 0.0; d["lamp"] = 0.0; return d
			var run := _run(det, run_of_hamlet(scen, topo, idx))
			if run.is_empty(): d["dark"] = tx("TAG_DARK"); d["v"] = 0.0; d["lamp"] = 0.0; return d
			var v := float(run.vRecvV); var lim = wb.get("vMinLimitV")
			d["v"] = v; d["i"] = float(run.iA); d["v_text"] = fmt_v(v) + " V"; d["i_text"] = fmt_i(float(run.iA)) + " A"
			d["limit"] = float(lim) if lim != null else NAN
			d["limit_text"] = tx("TAG_V_LIMIT") % fmt_v(float(lim)) if lim != null else ""
			d["good"] = lim == null or v >= float(lim)
			var ref := float(kt.homeV)
			d["lamp"] = clampf((v / ref) * (v / ref), 0.0, 1.0)   # the lamps burn as (V / 48)^2, the same law the windows use
			d["lamp_text"] = "%d %%" % int(round(float(d.lamp) * 100.0))
			return d
		"cable":
			if not has: return {"kind": "cable", "id": oid, "title": tx("TAG_NO_CABLE"), "none": true}
			var run2 := _run(det, oid)
			if run2.is_empty(): return {}
			var d2 := {"kind": "cable", "id": oid, "title": tx("TAG_CABLE") % [fmt_mm2(float(run2.mm2)), fmt_m(float(run2.lengthM))]}
			var rows: Array = [
				[tx("TAG_RLOOP"), fmt_r(float(run2.rLoopOhm)) + " Ω"],
				[tx("TAG_I"), fmt_i(float(run2.iA)) + " A"],
				[tx("TAG_DROP"), fmt_v(float(run2.dropV)) + " V"],
			]
			var loss := "%s W" % fmt_m(float(run2.lossW))
			if det.runs.size() == 1: loss += " (%s %%)" % ("%.1f" % float(det.totals.lossPct))
			rows.append([tx("TAG_LOSS"), loss])
			rows.append([tx("TAG_RATED"), "%s A" % fmt_m(float(run2.ampacityA))])
			if det.runs.size() > 1: rows.append([tx("TAG_CIRCUIT_LOSS"), "%.1f %%" % float(det.totals.lossPct)])
			d2["rows"] = rows; d2["eq"] = eq_text(run2.eq); d2["eq_raw"] = run2.eq
			return d2
		"hut":
			var d3 := {"kind": "hut", "id": oid, "title": tx("TAG_HUT")}
			var rows3: Array = []
			rows3.append([tx("TAG_SRC"), "%s V" % fmt_v0(float(det.totals.sourceV) if has else 48.0)])
			if has: rows3.append([tx("TAG_OUT"), "%s W" % fmt_m(float(det.totals.sourceW))])
			if wb.get("hutM") != null: rows3.append([tx("TAG_DIST"), "%s m" % fmt_m(float(wb.hutM))])
			d3["rows"] = rows3
			return d3
	return {}

# ---- open / close ---------------------------------------------------------------------------------------------------------------------
func open(k: String, oid: String) -> bool:
	if b == null or world == null: return false
	var d := describe(k, oid)
	if d.is_empty(): return false
	kind = k; id = oid; desc = d; _cand = -1
	_build(d); panel.visible = true; panel.reset_size()
	_place(true); opened.emit(k, oid); queue_redraw()
	return true

func close() -> bool:
	if not panel.visible: return false
	panel.visible = false; kind = ""; id = ""; desc = {}; lines = []; eq_label = null
	closed.emit(); queue_redraw()
	return true

## Engine state changed: the open tag shows the new numbers (or closes when its object is gone).
func refresh() -> void:
	if not panel.visible: return
	var d := describe(kind, id)
	if d.is_empty(): close(); return
	desc = d; _build(d); panel.reset_size(); _place(false)

func _lbl(text: String, size: int, col: Color, font := "sans") -> Label:
	var l := GridTheme.label(text, size, col, font); lines.append(l); _vb.add_child(l); return l

func _row(k: String, v: String, vcol: Color = GridTheme.PAPER_INK) -> HBoxContainer:
	var h := HBoxContainer.new(); h.add_theme_constant_override("separation", 10); h.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var a := GridTheme.label(k, 15, Color(GridTheme.PAPER_INK, 0.75), "sans"); a.custom_minimum_size.x = 92; h.add_child(a)
	var c := GridTheme.label(v, 16, vcol, "mono"); h.add_child(c); lines.append(a); lines.append(c)
	_vb.add_child(h); return h

func _build(d: Dictionary) -> void:
	for c in _vb.get_children(): _vb.remove_child(c); c.queue_free()
	lines = []; eq_label = null
	var head := HBoxContainer.new(); head.mouse_filter = Control.MOUSE_FILTER_IGNORE; head.add_theme_constant_override("separation", 14)
	_title = GridTheme.label(str(d.title), 22, GridTheme.PAPER_INK, "title"); _title.size_flags_horizontal = Control.SIZE_EXPAND_FILL; head.add_child(_title); lines.append(_title)
	_close = Button.new(); _close.text = "×"; _close.flat = true; _close.focus_mode = Control.FOCUS_NONE; _close.tooltip_text = tx("TAG_CLOSE"); _close.custom_minimum_size = Vector2(30, 30)
	_close.add_theme_font_size_override("font_size", GridTheme.fs(22)); _close.add_theme_color_override("font_color", GridTheme.PAPER_INK); _close.add_theme_color_override("font_hover_color", GridTheme.BAD)
	_close.add_theme_stylebox_override("normal", StyleBoxEmpty.new()); _close.add_theme_stylebox_override("hover", StyleBoxEmpty.new()); _close.add_theme_stylebox_override("pressed", StyleBoxEmpty.new())
	_close.pressed.connect(func(): close()); head.add_child(_close)
	_vb.add_child(head)
	match str(d.kind):
		"hamlet":
			if d.has("dark"):
				_lbl(str(d.dark), 15, GridTheme.PAPER_INK)
			else:
				var vr := HBoxContainer.new(); vr.add_theme_constant_override("separation", 8); vr.mouse_filter = Control.MOUSE_FILTER_IGNORE
				var dot := _Dot.new(); dot.col = GridTheme.GOOD if bool(d.good) else GridTheme.BAD; vr.add_child(dot)
				var vl := GridTheme.label("%s = %s" % [tx("TAG_V"), d.v_text], 20, GridTheme.PAPER_INK, "mono"); vr.add_child(vl); lines.append(vl)
				if str(d.limit_text) != "":
					var ll := GridTheme.label(str(d.limit_text), 13, Color(GridTheme.PAPER_INK, 0.7), "sans"); vr.add_child(ll); lines.append(ll)
				_vb.add_child(vr)
				_lbl("%s = %s" % [tx("TAG_I"), d.i_text], 17, GridTheme.PAPER_INK, "mono")
				var br := HBoxContainer.new(); br.add_theme_constant_override("separation", 8); br.mouse_filter = Control.MOUSE_FILTER_IGNORE
				var bl := GridTheme.label(tx("TAG_LAMPS"), 14, Color(GridTheme.PAPER_INK, 0.75), "sans"); br.add_child(bl); lines.append(bl)
				var bar := _Bar.new(); bar.value = float(d.lamp); br.add_child(bar)
				var bt := GridTheme.label(str(d.lamp_text), 14, GridTheme.PAPER_INK, "mono"); br.add_child(bt); lines.append(bt)
				_vb.add_child(br)
			if str(d.homes_text) != "": _lbl(str(d.homes_text), 14, Color(GridTheme.PAPER_INK, 0.85), "sans")
		"cable":
			if not d.has("none"):
				for r in d.rows: _row(str(r[0]), str(r[1]))
				var box := PanelContainer.new(); box.mouse_filter = Control.MOUSE_FILTER_IGNORE
				var sb := StyleBoxFlat.new(); sb.bg_color = Color(GridTheme.PAPER_INK, 0.09); sb.set_corner_radius_all(3); sb.content_margin_left = 8; sb.content_margin_right = 8; sb.content_margin_top = 5; sb.content_margin_bottom = 5
				box.add_theme_stylebox_override("panel", sb)
				eq_label = GridTheme.label(str(d.eq), 15, GridTheme.PAPER_INK, "mono"); eq_label.autowrap_mode = TextServer.AUTOWRAP_OFF; box.add_child(eq_label); lines.append(eq_label)
				_vb.add_child(box)
		"hut":
			for r in d.rows: _row(str(r[0]), str(r[1]))

# ---- placement: the tag hangs off its object and follows the camera ---------------------------------------------------------------------
func _chrome_pos(local_world: Vector2) -> Vector2:
	return world.get_global_rect().position + local_world - global_position

func _clear_rects() -> Array:
	var out: Array = []
	if instruments != null and instruments.visible: out.append(Rect2(instruments.global_position - global_position, instruments.size).grow(10.0))
	if slot.is_valid(): out.append((slot.call() as Rect2).grow(6.0))
	return out

func _place(_snap: bool) -> void:
	if not panel.visible or world == null or not is_inside_tree() or not world.is_inside_tree(): return
	var a := world.anchor(kind, id)
	if is_nan(a.x): return
	a = _chrome_pos(a); _anchor = a
	var sz := panel.size; var vp := get_viewport_rect().size
	var gap := Vector2(46.0, 64.0)
	var avoid: Array = _clear_rects()
	var org := world.get_global_rect().position - global_position
	for r in world.object_rects(): avoid.append(Rect2(org + (r as Rect2).position, (r as Rect2).size))
	# four ways to hang the tag off its object (up-right first); take the one that covers the least of the hamlets, the hut, the cluster and the tray
	var cands: Array = []
	for dy in [64.0, 130.0, 200.0]:
		for dx in [gap.x, -gap.x - sz.x, -sz.x * 0.5, -sz.x * 0.85, -sz.x * 0.15]:
			cands.append(a + Vector2(dx, -sz.y - dy)); cands.append(a + Vector2(dx, dy))
	var best := Vector2.ZERO; var bs := INF; var costs: Array = []; var qs: Array = []
	for c in cands:
		var q := Vector2(clampf(c.x, 10.0, maxf(10.0, vp.x - sz.x - 10.0)), clampf(c.y, 10.0, maxf(10.0, vp.y - sz.y - 10.0)))
		var rr := Rect2(q, sz)
		var cost := q.distance_to(c) * 40.0 + (rr.get_center().distance_to(a)) * 12.0   # near its object, and inside the screen
		for r in avoid:
			var ov := rr.intersection(r as Rect2)
			cost += ov.size.x * ov.size.y if ov.has_area() else 0.0
		costs.append(cost); qs.append(q)
		if cost < bs - 1.0: bs = cost; best = q
	if _cand >= 0 and _cand < costs.size() and costs[_cand] <= bs + 600.0: best = qs[_cand]   # hysteresis: do not flip while the camera pans
	else: _cand = costs.find(bs) if costs.has(bs) else 0
	var p := best
	panel.position = p
	queue_redraw()

func _process(dt: float) -> void:
	if not panel.visible: return
	_t += dt
	_place(false)

func _draw() -> void:
	if not panel.visible: return
	var sway := 0.0 if CbSettings.reduced_motion else sin(_t * 1.6) * 1.5
	var eyelet := panel.position + Vector2(18.0 + sway, 0.0)
	if panel.position.y < _anchor.y: eyelet = panel.position + Vector2(18.0 + sway, panel.size.y)
	var mid := (eyelet + _anchor) * 0.5 + Vector2(0.0, 14.0)
	var pts := PackedVector2Array()
	for i in 17:
		var u := float(i) / 16.0
		pts.append(eyelet.lerp(mid, u).lerp(mid.lerp(_anchor, u), u))
	draw_polyline(pts, Color(0, 0, 0, 0.35), 3.0, true)
	draw_polyline(pts, Color("#D8C9A0"), 1.8, true)
	draw_circle(_anchor, 5.0, Color(GridTheme.NIGHT, 0.9)); draw_circle(_anchor, 3.0, GridTheme.SODIUM)
	draw_circle(eyelet, 3.5, GridTheme.INK)

# ---- picking and input -----------------------------------------------------------------------------------------------------------------
## A tap on the world (local coordinates). Returns true when it was used (a tag opened, switched or closed).
func on_tap(pos: Vector2) -> bool:
	if world == null: return false
	var p: Dictionary = world.pick(pos)
	var k := str(p.get("kind", ""))
	if k == "route" or k == "peg" or k == "junction": k = ""
	if k == "":
		return close()
	if panel.visible and kind == k and id == str(p.id): return close()
	return open(k, str(p.id))

func on_long_press(pos: Vector2) -> bool:
	if world == null: return false
	var p: Dictionary = world.pick(pos)
	var k := str(p.get("kind", ""))
	if k == "hamlet" or k == "cable" or k == "hut": return open(k, str(p.id))
	return false

## The objects with a tag, in the order Y walks them: hamlets, the hut, cables.
func objects() -> Array:
	var out: Array = []
	if world == null: return out
	for t in world.model.towns: if t.kind == "hamlet" or t.kind == "school": out.append(["hamlet", str(t.id)])
	for u in world.model.units: if str(u.kind) == "hut": out.append(["hut", str(u.id)])
	for l in world.model.lines: if str(l.kind) == "cable": out.append(["cable", str(l.id)])
	return out

## Pad Y: open the tag of the next object (wraps); on the last one it closes.
func pad_cycle() -> void:
	var o := objects()
	if o.is_empty(): return
	var cur := -1
	for i in o.size(): if o[i][0] == kind and o[i][1] == id: cur = i
	var nxt := cur + 1
	if panel.visible and nxt >= o.size(): close(); return
	open(o[nxt][0], o[nxt][1])

# ---- two tiny paper widgets --------------------------------------------------------------------------------------------------------------
class _Dot extends Control:
	var col := GridTheme.GOOD
	func _init() -> void: custom_minimum_size = Vector2(16, 16); mouse_filter = Control.MOUSE_FILTER_IGNORE
	func _draw() -> void:
		draw_circle(size * 0.5, 7.0, col); draw_arc(size * 0.5, 7.0, 0.0, TAU, 20, GridTheme.PAPER_INK, 1.5)

class _Bar extends Control:
	var value := 0.0
	func _init() -> void: custom_minimum_size = Vector2(96, 14); mouse_filter = Control.MOUSE_FILTER_IGNORE
	func _draw() -> void:
		var r := Rect2(Vector2(0, 2), Vector2(size.x, size.y - 4))
		draw_rect(r, Color(GridTheme.PAPER_INK, 0.85))
		draw_rect(Rect2(r.position + Vector2(1, 1), Vector2((r.size.x - 2.0) * clampf(value, 0.0, 1.0), r.size.y - 2.0)), GridTheme.SODIUM.lerp(GridTheme.SODIUM_DIM, 1.0 - clampf(value, 0.0, 1.0)))
		for k in range(1, 4): draw_line(Vector2(r.size.x * k * 0.25, r.position.y), Vector2(r.size.x * k * 0.25, r.end.y), Color(GridTheme.PAPER, 0.35), 1.0)
