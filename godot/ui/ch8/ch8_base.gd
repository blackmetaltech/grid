class_name Ch8Base
extends Ch7Base
## Chapter 8's stages (L31-L36) share this base: it reuses chapter 7's plot frame, prediction boxes and phone fold, and adds labelled chip rows with prices, the single-line
## feeder diagram and a few small drawing helpers. Display and input only: every number is the engine's `ch8Study`, every change an engine action (app.b.act).
const INK_CARD := 0.82
var cw: Array = []     ## chips recorded by _build_panel: {r, label, sub, on, id, arg}
var caps: Array = []   ## captions recorded by _build_panel: {at, text}
var sel_node := "all"  ## L31 / L35: the trunk section the wire and tap chips act on
var _pin_low := true   ## phone: stay at the bottom of the pan (the limit grows once the coach card is laid out) until the player pans

func _init() -> void:
	super._init()

## The phone's canvas is as wide as the screen (no sideways pan) and 446 tall above the panel (drag to pan up and down); the desktop's is everything between the HUD and the panel.
func _vs() -> Vector2: return Vector2(size.x, 768.0) if _phone() else size

func _draw() -> void:
	super._draw()
	if not visible or q.is_empty() or not _phone(): return
	var lim := _pan_limits()
	if _pan.y > lim.position.y + 4.0:   # more of the stage below: say so where the eye is (a tester never found the pan), on a dark tab above the panel
		var at := Vector2(_p0.x + 8.0, _p0.y - 30.0)
		draw_style_box(GridTheme.ink_sb(0.92, 6, 0.0), Rect2(at, Vector2(230.0, 24.0)))
		_text(_semi(), 12, at + Vector2(10.0, 17.0), T("C8_PAN_MORE"), GridTheme.SODIUM)
	if _pan.y < -4.0:   # panned down (the default on the phone): the title and the top cards are above, say so at the top edge
		var at2 := Vector2(_p0.x + 8.0, 6.0)
		draw_style_box(GridTheme.ink_sb(0.92, 6, 0.0), Rect2(at2, Vector2(230.0, 24.0)))
		_text(_semi(), 12, at2 + Vector2(10.0, 17.0), T("C8_PAN_UP"), GridTheme.SODIUM)

func layout() -> void:
	if _phone() and _pin_low: _pan.y = -10000.0   # clamped to the current limit in super.layout()
	super.layout()

func _gui_input(e: InputEvent) -> void:
	if (e is InputEventMouseMotion and e.button_mask != 0) or (e is InputEventMouseButton and (e.button_index == MOUSE_BUTTON_WHEEL_UP or e.button_index == MOUSE_BUTTON_WHEEL_DOWN)) or e is InputEventScreenDrag: _pin_low = false
	if visible and _phone() and e is InputEventMouseButton and e.pressed and (e.button_index == MOUSE_BUTTON_WHEEL_DOWN or e.button_index == MOUSE_BUTTON_WHEEL_UP) and e.position.y < _p0.y:
		_pan.y += -48.0 if e.button_index == MOUSE_BUTTON_WHEEL_DOWN else 48.0; _clamp_pan(); layout(); queue_redraw(); accept_event(); return   # the wheel pans the stage too
	super._gui_input(e)

## Phone: chapter 8 opens at the bottom of the pan, where the charts are clear of the coach card and the panel (a tester read
## the lower chart under them at the top of the pan); the title card and clock fade while it is panned (grid_chrome).
func _start_low() -> bool: return true

## Phone: the whole 768-tall canvas pans, until its bottom clears both the panel and the coach card (the radio sits over the stage's lower left;
## chapter 4's limit stopped at 612 and left the profile and the reading card under them).
func _pan_limits() -> Rect2:
	if not _phone(): return super._pan_limits()
	var top := _p0.y
	var ch = app.get("chrome") if app != null else null
	if ch != null and ch.radio != null and ch.radio.visible: top = minf(top, ch.radio.position.y - 8.0)
	var lo := Vector2(0.0, minf(0.0, top - (_vs().y - PANEL_H)))   # the stage's cards end PANEL_H above the canvas bottom (_stage_rect)
	return Rect2(lo, -lo)
func _sbox(minh: float) -> Rect2:
	if _phone(): return Rect2(Vector2(30.0, 128.0), Vector2(size.x - 60.0, 768.0 - PANEL_H - 128.0 - 10.0))
	return Rect2(Vector2(30.0, _stage_top()), Vector2(size.x - 60.0, _stage_h(minh)))

## Wrapped lines in a card, no scrolling (the phone pans the whole stage instead): a line that would cross the card's bottom edge is left out.
func _card_lines(r: Rect2, lines: Array, fsz: int, gap: float, top_pad: float) -> void:
	scroll = 0.0; scroll_max = 0.0
	var f := _mono(); var fs := GridTheme.fs(fsz); var y := r.position.y + top_pad
	for ln in lines:
		var h: float = f.get_multiline_string_size(str(ln[0]), HORIZONTAL_ALIGNMENT_LEFT, r.size.x - 24.0, fs).y
		if y + h <= r.end.y - 6.0: GridText.dm(self, f, Vector2(r.position.x + 12.0, y + fs), str(ln[0]), HORIZONTAL_ALIGNMENT_LEFT, r.size.x - 24.0, fs, -1, ln[1])
		y += h + gap

func _inner() -> Rect2: return Rect2(panel.position + Vector2(12.0, 8.0), panel.size - Vector2(24.0, 16.0))

func _layout_panel() -> void:
	cw.clear(); caps.clear(); _build_panel(_inner())

func _build_panel(_ip: Rect2) -> void: pass
func _pressed(_h: Dictionary, _p: Vector2) -> void: pass
func _body(_ip: Rect2) -> void: pass
func _over(_ip: Rect2) -> void: pass   ## drawn after the chips (text on a chip that has no label of its own)

## One chip of the panel: label (and a second line, usually the price), lit when `on`.
func _c(ip: Rect2, x: float, y: float, w: float, h: float, label: String, id: String, arg, on: bool, sub := "") -> void:
	var r := Rect2(ip.position + Vector2(x, y), Vector2(w, h)); _add_chip(r, id, arg)
	cw.append({"r": r, "label": label, "sub": sub, "on": on, "id": id, "arg": arg})

func _cap(ip: Rect2, x: float, y: float, text: String) -> void: caps.append({"at": ip.position + Vector2(x, y), "text": text})

func _press(h: Dictionary, p: Vector2) -> void:
	if str(h.id) == "fold": folded = not folded; layout(); queue_redraw(); return
	_pressed(h, p)

func _draw_panel_body() -> void:
	var ip := _inner()
	for c in caps: _text(_semi(), 10, c.at, str(c.text), Color(GridTheme.TEXT, 0.65))
	_body(ip)
	var lock := _locked()
	for c in cw: _chip8(c.r, str(c.label), str(c.sub), bool(c.on), str(c.id), c.arg, not lock)
	_over(ip)

func _draw_panel() -> void:
	if _phone() and folded:
		draw_style_box(GridTheme.ink_sb(0.94, 10, 0.0), panel); _text(_semi(), 12, panel.position + Vector2(12.0, 22.0), T("C8_PANEL") + "  (%s)" % scenario, Color(GridTheme.TEXT, 0.85)); _text(_semi(), 14, panel.position + Vector2(panel.size.x - 40.0, 23.0), "▸", GridTheme.SODIUM)
		return
	super._draw_panel()

func _chip8(r: Rect2, label: String, sub: String, on: bool, id: String, arg, enabled: bool) -> void:
	var hv := hover == "%s/%s" % [id, str(arg)] and enabled
	var fill := Color(GridTheme.SODIUM, 0.22) if on else (Color(GridTheme.INK).lightened(0.12) if hv else Color(GridTheme.NIGHT, 0.55))
	draw_style_box(_cell_sb(fill, on or hv), r)
	var col := GridTheme.SODIUM if on else (GridTheme.TEXT if enabled else GridTheme.DIM)
	if sub == "": _text(_mono(), 12, Vector2(r.position.x, r.position.y + r.size.y * 0.5 + 4.0), label, col, r.size.x, 1)
	else:
		_text(_mono(), 12, Vector2(r.position.x, r.position.y + r.size.y * 0.5 - 4.0), label, col, r.size.x, 1)
		_text(_mono(), 9, Vector2(r.position.x, r.position.y + r.size.y * 0.5 + 12.0), sub, Color(GridTheme.TEXT, 0.6), r.size.x, 1)

## A status line in the panel's lower-left corner (the bottom-right belongs to the price tag).
func _status(ip: Rect2, text: String, col: Color, y := 124.0, w := 440.0) -> void:
	GridText.dm(self, _mono(), ip.position + Vector2(0.0, y + 10.0), text, HORIZONTAL_ALIGNMENT_LEFT, w, GridTheme.fs(11), 3, col)

# ---- stage helpers -----------------------------------------------------------------------------------------------------------------
func _card(r: Rect2) -> void: draw_style_box(_box_sb(INK_CARD), r)   # glass over the 3D place, navy ink on the classic stage

func _lines(r: Rect2, title: String, lines: Array, fsz := 11, gap := 6.0) -> void:
	_card(r); _text(_semi(), 11, r.position + Vector2(12.0, 20.0), title, GridTheme.SODIUM)
	_card_lines(r, lines, fsz, gap, 30.0)

func _heat(f: float) -> Color:
	f = clampf(f, 0.0, 1.0)
	return GridTheme.GOOD.lerp(GridTheme.WARN, f * 2.0) if f < 0.5 else GridTheme.WARN.lerp(GridTheme.BAD, f * 2.0 - 1.0)

func _in_band(v: float, lo: float, hi: float) -> bool: return v >= lo and v <= hi

func _vtxt(v: float) -> String: return T("C8_V") % WorkOrder.num(snappedf(v, 0.1))

## A row of small house glyphs for a node's customers (one house = 100 customers, at least one), with the count beside it.
func _houses(at: Vector2, customers: int, col: Color) -> void:
	var n := clampi(int(ceil(float(customers) / 100.0)), 1, 5)
	for i in n:
		var p := at + Vector2(i * 13.0, 0.0)
		draw_rect(Rect2(p + Vector2(0, 5), Vector2(9, 7)), col)
		draw_colored_polygon(PackedVector2Array([p + Vector2(-1.5, 5.0), p + Vector2(4.5, -1.0), p + Vector2(10.5, 5.0)]), col)
	_text(_mono(), 10, at + Vector2(n * 13.0 + 3.0, 11.0), T("C8_HOMES") % customers, Color(GridTheme.TEXT, 0.75))

func _sun(c: Vector2, r: float, col: Color) -> void:
	draw_circle(c, r, col)
	for i in 8:
		var a := float(i) * TAU / 8.0 + _t * 0.4
		draw_line(c + Vector2(cos(a), sin(a)) * (r + 3.0), c + Vector2(cos(a), sin(a)) * (r + 7.0), col, 2.0)

func _dashed(a: Vector2, b: Vector2, col: Color, wd := 1.5, dash := 6.0) -> void:
	var d := b - a; var n := int(d.length() / (dash * 2.0))
	if n < 1: draw_line(a, b, col, wd); return
	for i in n + 1:
		var s := a + d * (float(i) / float(n + 1)); var e := a + d * ((float(i) + 0.5) / float(n + 1)); draw_line(s, e, col, wd)

## A polyline of [x, y] pairs where y may be null (curve undefined): drawn in runs, in the frame's coordinates and clipped to it.
func _poly_n(pts: Array, col: Color, wd := 2.0, dashed := false) -> void:
	var run := []
	for p in pts:
		if p[1] == null:
			if run.size() >= 2: _poly_run(run, col, wd, dashed)
			run = []
		else: run.append(p)
	if run.size() >= 2: _poly_run(run, col, wd, dashed)

func _poly_run(run: Array, col: Color, wd: float, dashed: bool) -> void:
	if not dashed: _poly(run, col, wd); return
	var pr: Rect2 = plot.r
	for i in run.size() - 1:
		if i % 2 == 1: continue
		var a := _pt(float(run[i][0]), float(run[i][1])); var b := _pt(float(run[i + 1][0]), float(run[i + 1][1]))
		var seg := _clip(a, b, pr)
		if seg.size() == 2: draw_line(seg[0], seg[1], col, wd, true)

## Value of a curve [[x, y|null]] at x (log-log interpolation between its samples); null outside its defined range.
func _interp(pts: Array, x: float):
	for i in pts.size() - 1:
		var a = pts[i]; var b = pts[i + 1]
		if a[1] == null or b[1] == null: continue
		if x >= float(a[0]) and x <= float(b[0]):
			var f := (log(x) - log(float(a[0]))) / (log(float(b[0])) - log(float(a[0])))
			return exp(lerpf(log(float(a[1])), log(float(b[1])), f))
	return null

# ---- the single-line feeder (L31, L35) -----------------------------------------------------------------------------------------------
## The trunk as a line of sections from the substation: wire and current per section, customers per node, two voltage rows coloured against the band. Returns the node x positions.
func _feeder_diagram(r: Rect2, tree: Array, rowa: Array, rowb: Array, laba: String, labb: String, pvs: Array, pv_kw: float, reverse: bool) -> Array:
	_card(r)
	var total := 0.0
	for n in tree: total += float(n.km)
	var x0 := r.position.x + 74.0; var span := r.size.x - 74.0 - 70.0; var ly := r.position.y + 100.0
	var xs := []; var cum := 0.0
	for n in tree: cum += float(n.km); xs.append(x0 + span * cum / total)
	var band: Dictionary = q.band; var lo := float(band.loV); var hi := float(band.hiV)
	# the substation
	draw_rect(Rect2(Vector2(r.position.x + 18.0, ly - 16.0), Vector2(32, 32)), Color(GridTheme.INK).lightened(0.15)); draw_rect(Rect2(Vector2(r.position.x + 18.0, ly - 16.0), Vector2(32, 32)), GridTheme.SODIUM_DIM, false, 1.5)
	_text(_mono(), 11, Vector2(r.position.x + 12.0, ly + 36.0), T("C8_SUBSTATION"), Color(GridTheme.TEXT, 0.8), 44.0, 1)
	var px := x0 - 24.0
	for i in tree.size():
		var n: Dictionary = tree[i]; var nx: float = xs[i]
		var seg_a := Vector2(px if i > 0 else r.position.x + 50.0, ly); var seg_b := Vector2(nx, ly)
		var load := float(n.loading); var wc := _heat(maxf(0.0, load - 0.3) / 0.7) if load < 1.0 else GridTheme.BAD
		draw_line(seg_a, seg_b, Color(GridTheme.LIVE, 0.9), 4.0)
		var mid := (seg_a + seg_b) * 0.5
		_text(_semi(), 11, mid + Vector2(-70, -44), "%s  %s" % [str(n.conductor), T("C8_KM") % WorkOrder.num(float(n.km))], GridTheme.TEXT, 140.0, 1)
		# the current against the conductor's ampacity
		var bw := 96.0; var bp := mid + Vector2(-bw * 0.5, -36.0)
		draw_rect(Rect2(bp, Vector2(bw, 7)), Color(GridTheme.TEXT, 0.12)); draw_rect(Rect2(bp, Vector2(bw * clampf(load, 0.0, 1.0), 7)), wc)
		_text(_mono(), 10, mid + Vector2(-70, -8), T("C8_AMPS") % [WorkOrder.num(float(n.currentA)), WorkOrder.num(float(n.ampacityA))], wc, 140.0, 1)
		if n.get("regulator") != null:   # the step regulator in this section
			var rp := mid + Vector2(0, 22); draw_line(mid, rp, GridTheme.COPPER, 2.0); draw_rect(Rect2(rp - Vector2(15, 11), Vector2(30, 22)), Color(GridTheme.INK)); draw_rect(Rect2(rp - Vector2(15, 11), Vector2(30, 22)), GridTheme.COPPER, false, 2.0)
			_text(_semi(), 10, rp + Vector2(-15, 4), T("C8_REG_SHORT"), GridTheme.COPPER, 30.0, 1); _text(_mono(), 10, rp + Vector2(-40, 30), T("C8_REG_AT") % WorkOrder.num(float(n.regulator)), GridTheme.COPPER, 80.0, 1)
		# the node: a dot filled by its voltage against the band, the customers and the two voltages
		var va: float = float(rowa[i]); var vb: float = float(rowb[i])
		var good := _in_band(va, lo, hi) and _in_band(vb, lo, hi)
		draw_circle(Vector2(nx, ly), 13.0, Color(GridTheme.INK)); draw_circle(Vector2(nx, ly), 10.0, _good(good))
		_text(_semi(), 10, Vector2(nx - 12, ly + 4), str(n.id), GridTheme.NIGHT, 24.0, 1)
		_houses(Vector2(nx - 36.0, ly + 24.0), int(n.customers), Color(GridTheme.TEXT, 0.55))
		_text(_mono(), 11, Vector2(nx - 62, ly + 58.0), laba + " " + _vtxt(va), _good(_in_band(va, lo, hi)), 124.0, 1)
		_text(_mono(), 11, Vector2(nx - 62, ly + 74.0), labb + " " + _vtxt(vb), _good(_in_band(vb, lo, hi)), 124.0, 1)
		if float(n.tap) != 0.0: _text(_mono(), 10, Vector2(nx - 40, ly + 90.0), T("C8_TAP_AT") % WorkOrder.num(float(n.tap)), GridTheme.SODIUM, 80.0, 1)
		if pvs.has(str(n.id)):
			var sp := Vector2(nx, ly - 60.0); _sun(sp, 8.0, GridTheme.WARN); draw_line(sp + Vector2(0, 14), Vector2(nx, ly - 14.0), Color(GridTheme.WARN, 0.7), 2.0)
			_text(_mono(), 10, sp + Vector2(-30, -16), T("C8_KW") % WorkOrder.num(snappedf(pv_kw, 1.0)), GridTheme.WARN, 60.0, 1)
		px = nx
	if reverse:   # the flow at noon runs back toward the substation
		var ay := ly + 6.0; _arrow(Vector2(xs[xs.size() - 1] - 30.0, ay - 14.0), Vector2(x0 + 30.0, ay - 14.0), Color(GridTheme.WARN, 0.8), 3.0)
	_text(_semi(), 10, r.position + Vector2(12.0, r.size.y - 10.0), T("C8_DIAG_NOTE"), Color(GridTheme.TEXT, 0.5))
	return xs

## The voltage profile card: customers' voltage along the feeder, two series, the band shaded.
func _profile(r: Rect2, tree: Array, xs_km: Array, series: Array) -> void:
	var band: Dictionary = q.band; var lo := float(band.loV); var hi := float(band.hiV)
	var ymin := lo; var ymax := hi
	for s in series:
		for v in s.vals: ymin = minf(ymin, float(v)); ymax = maxf(ymax, float(v))
	ymin = floorf((ymin - 6.0) / 10.0) * 10.0; ymax = ceilf((ymax + 6.0) / 10.0) * 10.0
	var total := float(xs_km[xs_km.size() - 1])
	_frame(r, 0.0, total, ymin, ymax, false, false, T("C8_X_KM"), T("C8_Y_V"))
	var pr: Rect2 = plot.r
	draw_rect(Rect2(_pt(0.0, hi), Vector2(pr.size.x, _pt(0.0, lo).y - _pt(0.0, hi).y)), Color(GridTheme.GOOD, 0.10))
	draw_line(_pt(0.0, lo), _pt(total, lo), Color(GridTheme.BAD, 0.7), 1.5); draw_line(_pt(0.0, hi), _pt(total, hi), Color(GridTheme.BAD, 0.7), 1.5)
	_text(_mono(), 10, _pt(total, lo) + Vector2(-190, 12), T("C8_BAND_LO") % WorkOrder.num(float(band.loV)), Color(GridTheme.BAD, 0.9))
	_text(_mono(), 10, _pt(total, hi) + Vector2(-190, -4), T("C8_BAND_HI") % WorkOrder.num(float(band.hiV)), Color(GridTheme.BAD, 0.9))
	var lgx := 0.0
	for s in series:
		var pts := [[0.0, float(band.nominalV)]]
		for i in range(1, xs_km.size()): pts.append([xs_km[i], s.vals[i - 1]])
		_poly(pts, s.col, 2.5)
		for i in range(1, xs_km.size()):
			var p := _pt(float(xs_km[i]), float(s.vals[i - 1])); var good := _in_band(float(s.vals[i - 1]), lo, hi)
			draw_circle(p, 5.0, _good(good)); draw_circle(p, 3.0, s.col)
		draw_line(Vector2(pr.position.x + 10.0 + lgx, pr.position.y + 12.0), Vector2(pr.position.x + 30.0 + lgx, pr.position.y + 12.0), s.col, 3.0)
		_text(_mono(), 10, Vector2(pr.position.x + 36.0 + lgx, pr.position.y + 16.0), str(s.name), GridTheme.TEXT)
		lgx += 56.0 + _mono().get_string_size(str(s.name), HORIZONTAL_ALIGNMENT_LEFT, -1, GridTheme.fs(10)).x

func _cum_km(tree: Array) -> Array:
	var out := [0.0]; var c := 0.0
	for n in tree: c += float(n.km); out.append(c)
	return out

# ---- the 3D countryside (world3d/stage3d_ch8.gd): the charts stay as glass cards over the sky, the places carry chips -----------------------------------
## The height the glass cards take at the top of the 3D view: they stay clear of the panel, and a chip hung on the place never rises into them.
func _cards3_h(maxh := 340.0) -> float: return clampf(_stage_bottom() - TOP - 12.0, 200.0, maxh)

## A card on the left and one on the right of the top of the view, as wide as the screen allows; returns [left, right].
func _cards3(lw: float, rw: float, h: float) -> Array:
	var w := _right()
	var l := Rect2(Vector2(M, TOP), Vector2(minf(lw, w * 0.44), h))
	var r := Rect2(Vector2(w - M - minf(rw, w * 0.34), TOP), Vector2(minf(rw, w * 0.34), h))
	_pins.append(l); _pins.append(r)   # the chips on the place step round the cards
	return [l, r]
