class_name Ch8Reliab
extends Ch8Base
## L32 Count the Outages: the feeder as a tree of sections (trunk T1-T4, spurs P1-P3) coloured by how much of the year's customer-minutes each section is to blame for, the devices
## on it (sectionalisers, spur fuses, the tie), a heat strip of the expected outages per section and the four IEEE 1366 indices against the targets. The panel: a switch per site,
## a fuse per spur, the tie. Cute mode: a section's lamp is lit while its customers are on.
const SITES := ["T2", "T3", "T4"]
const SPURS := ["P1", "P2", "P3"]

func _init() -> void:
	super._init(); scenario = "L32"; name = "Ch8Reliab"

var sel_kind := "manual"   ## the switch type the next site tap places

func _build_panel(ip: Rect2) -> void:
	var d: Dictionary = q.design
	_cap(ip, 0, 10, T("C8_KIND_CAP")); _cap(ip, 0, 68, T("C8_SITE_CAP") % int(q.maxSectionalisers)); _cap(ip, 296, 10, T("C8_TIE_CAP")); _cap(ip, 296, 68, T("C8_FUSE_CAP") % str(kit.get("fuse", "")))
	var kinds := ["none", "manual", "remote"]; var labs := [T("C8_NONE"), T("C8_MANUAL"), T("C8_REMOTE")]
	var subs := [T("C8_FREE"), str(kit.get("manual", {}).get("price", "")), str(kit.get("remote", {}).get("price", ""))]
	for j in 3: _c(ip, 94.0 * j, 16, 90, 38, labs[j], "kind", kinds[j], sel_kind == kinds[j], subs[j])
	for k in SITES.size(): _c(ip, 94.0 * k, 74, 90, 38, SITES[k], "site", SITES[k], str(d.sect[SITES[k]]) != "none", labs[kinds.find(str(d.sect[SITES[k]]))])
	for k in SPURS.size(): _c(ip, 296.0 + 50.0 * k, 74, 46, 38, SPURS[k], "fuse", SPURS[k], bool(d.fuse[SPURS[k]]))
	_c(ip, 296, 16, 142, 38, T("C8_TIE"), "tie", "", bool(d.tie), str(kit.get("tie", {}).get("price", "")))

func _pressed(h: Dictionary, _p: Vector2) -> void:
	match str(h.id):
		"kind": sel_kind = str(h.arg); layout(); queue_redraw()
		"site": _act("placeSwitch", [str(h.arg), sel_kind])
		"fuse": _act("setFuse", [str(h.arg), not bool(q.design.fuse[str(h.arg)])])
		"tie": _act("setTie", [not bool(q.design.tie)])

func _body(ip: Rect2) -> void:
	var ix: Dictionary = q.indices; var tg: Dictionary = q.targets
	var cells := [[T("C8_SAIFI"), WorkOrder.num(float(ix.saifi)), float(ix.saifi) <= float(tg.saifiMax)], [T("C8_SAIDI"), WorkOrder.num(float(ix.saidi)), float(ix.saidi) <= float(tg.saidiMax)],
		[T("C8_CAIDI"), WorkOrder.num(float(ix.caidi)), true], [T("C8_ENS"), WorkOrder.num(float(ix.ensMWh)), float(ix.ensMWh) <= float(tg.ensStar)]]
	for k in 4:
		var r := Rect2(ip.position + Vector2(462.0 + 90.0 * (k % 2), 8.0 + 52.0 * (k / 2)), Vector2(86, 48)); draw_style_box(_cell_sb(Color(GridTheme.NIGHT, 0.55), false), r)
		_text(_semi(), 10, r.position + Vector2(6, 14), str(cells[k][0]), Color(GridTheme.TEXT, 0.7)); _text(_mono(), 15, Vector2(r.position.x, r.position.y + 38.0), str(cells[k][1]), _good(bool(cells[k][2])), r.size.x - 6.0, 2)
	_status(ip, T("C8_L32_USED") % [int(q.used), int(q.maxSectionalisers)], Color(GridTheme.TEXT, 0.7))

## Each section's place on the drawing: trunk segments along a line, spurs hanging below the downstream end of their parent.
func _layout_tree(r: Rect2) -> Dictionary:
	var secs: Array = q.sections; var by := {}
	for s in secs: by[str(s.id)] = s
	var km_total := 0.0
	for id in ["T1", "T2", "T3", "T4"]: km_total += float(by[id].km)
	var x0 := r.position.x + 90.0; var span := r.size.x - 90.0 - 230.0; var ty := r.position.y + 96.0
	var pos := {}; var x := x0
	for id in ["T1", "T2", "T3", "T4"]:
		var l: float = span * float(by[id].km) / km_total; pos[id] = {"a": Vector2(x, ty), "b": Vector2(x + l, ty)}; x += l
	for id in SPURS:
		var par := str(by[id].parent); var ax: float = pos[par].b.x; var l2 := 34.0 + 22.0 * float(by[id].km)
		pos[id] = {"a": Vector2(ax, ty), "b": Vector2(ax, ty + l2)}
	return pos

func _draw_stage() -> void:
	if _look3(): _draw_stage3(); return
	var sb := _sbox(420.0); var w := sb.size.x + 60.0; var top := sb.position.y; var bh := sb.size.y
	var r1 := Rect2(Vector2(30.0, top), Vector2(w - 60.0, minf(340.0, bh * 0.5)))
	_card(r1)
	var secs: Array = q.sections; var by := {}; var hmax := 1.0
	for s in secs: by[str(s.id)] = s; hmax = maxf(hmax, float(s.saidiMin))
	var pos := _layout_tree(r1); var d: Dictionary = q.design
	draw_rect(Rect2(Vector2(r1.position.x + 18.0, pos.T1.a.y - 16.0), Vector2(32, 32)), Color(GridTheme.INK).lightened(0.15)); draw_rect(Rect2(Vector2(r1.position.x + 18.0, pos.T1.a.y - 16.0), Vector2(32, 32)), GridTheme.SODIUM_DIM, false, 1.5)
	draw_line(Vector2(r1.position.x + 50.0, pos.T1.a.y), pos.T1.a, GridTheme.LIVE, 4.0)
	_text(_mono(), 11, Vector2(r1.position.x + 12.0, pos.T1.a.y + 36.0), T("C8_SUBSTATION"), Color(GridTheme.TEXT, 0.8), 44.0, 1)
	for id in pos:
		var s: Dictionary = by[id]; var a: Vector2 = pos[id].a; var b: Vector2 = pos[id].b; var hc := _heat(float(s.saidiMin) / hmax)
		draw_line(a, b, hc, 5.0)
		var mid := (a + b) * 0.5
		if id.begins_with("T"):
			_text(_semi(), 11, mid + Vector2(-60, -24), "%s  %s" % [id, T("C8_KM") % WorkOrder.num(float(s.km))], GridTheme.TEXT, 120.0, 1)
			_houses(Vector2(mid.x - 30.0, b.y + 14.0 + 18.0), int(s.customers), Color(GridTheme.TEXT, 0.5))
		else:
			_text(_semi(), 11, mid + Vector2(8, 0), "%s  %s" % [id, T("C8_KM") % WorkOrder.num(float(s.km))], GridTheme.TEXT)
			_houses(Vector2(b.x - 14.0, b.y + 12.0), int(s.customers), Color(GridTheme.TEXT, 0.5))
			var fused := bool(d.fuse[id]); var fp := a + Vector2(0, 22)
			draw_rect(Rect2(fp - Vector2(5, 8), Vector2(10, 16)), Color(GridTheme.GOOD, 0.85) if fused else Color(GridTheme.DIM, 0.35)); draw_rect(Rect2(fp - Vector2(5, 8), Vector2(10, 16)), GridTheme.INK, false, 1.5)
			_text(_mono(), 10, fp + Vector2(10, 4), T("C8_FUSE_SHORT") if fused else T("C8_BARE"), Color(GridTheme.TEXT, 0.7))
	for id in SITES:   # a sectionaliser at the upstream end of the section
		var kind := str(d.sect[id]); var a: Vector2 = pos[id].a
		var col := GridTheme.DIM if kind == "none" else (GridTheme.COPPER if kind == "manual" else GridTheme.LIVE)
		draw_rect(Rect2(a - Vector2(9, 9), Vector2(18, 18)), Color(GridTheme.INK)); draw_rect(Rect2(a - Vector2(9, 9), Vector2(18, 18)), col, false, 2.5)
		if kind != "none": draw_rect(Rect2(a - Vector2(4, 4), Vector2(8, 8)), col)
		_text(_mono(), 10, a + Vector2(-40, -26), T("C8_NONE") if kind == "none" else (T("C8_MANUAL") if kind == "manual" else T("C8_REMOTE")), col, 80.0, 1)
	var te: Vector2 = pos.T4.b   # the tie to the next feeder
	var ex := Vector2(r1.end.x - 150.0, te.y)
	draw_line(te, te + Vector2(40, 0), GridTheme.LIVE if bool(d.tie) else Color(GridTheme.DIM, 0.4), 4.0)
	_dashed(te + Vector2(40, 0), ex, GridTheme.WARN if bool(d.tie) else Color(GridTheme.DIM, 0.4), 2.0)
	draw_rect(Rect2(ex, Vector2(100, 34)).grow(0), Color(GridTheme.NIGHT, 0.6)); draw_rect(Rect2(ex, Vector2(100, 34)), Color(GridTheme.DIM, 0.6), false, 1.5)
	ex.y -= 17.0
	_text(_semi(), 10, Vector2(ex.x, te.y + 4.0), T("C8_NEXT_FEEDER"), Color(GridTheme.TEXT, 0.75), 100.0, 1)
	_text(_mono(), 10, Vector2(ex.x - 90.0, te.y + 52.0), (T("C8_TIE_INFO") % [int(kit.get("tie", {}).get("kw", 0)), int(kit.get("tie", {}).get("minutes", 0))]) if bool(d.tie) else T("C8_NO_TIE"), Color(GridTheme.TEXT, 0.6), 280.0, 1)
	_text(_semi(), 10, r1.position + Vector2(12.0, r1.size.y - 10.0), T("C8_L32_NOTE") % [WorkOrder.num(float(q.repairH)), int(q.switching.manualH), int(round(float(q.switching.remoteH) * 60.0))], Color(GridTheme.TEXT, 0.5))
	var r2 := Rect2(Vector2(30.0, r1.end.y + 12.0), Vector2(w - 60.0, 110.0)); _heat_strip(r2)
	# the indices against the targets
	var r3 := Rect2(Vector2(30.0, r2.end.y + 12.0), Vector2(w - 60.0, bh - r1.size.y - r2.size.y - 24.0))
	if r3.size.y < 90.0: return   # the phone's canvas has no room for it: the panel shows the four numbers
	_indices_card(r3)

## The heat strip: expected customer minutes lost per year, section by section.
func _heat_strip(r2: Rect2) -> void:
	var by := {}; var hmax := 1.0
	for s in q.sections: by[str(s.id)] = s; hmax = maxf(hmax, float(s.saidiMin))
	_card(r2)
	var cap := T("C8_HEAT_CAP")
	if _look3() and _semi().get_string_size(cap, HORIZONTAL_ALIGNMENT_LEFT, -1, GridText.floor_size(self, GridTheme.fs(11))).x > r2.size.x - 24.0: cap = cap.split(":")[0]   # 11-28b: the long caption ran past the card into the clock
	_text(_semi(), 11, r2.position + Vector2(12.0, 18.0), cap, GridTheme.SODIUM)
	var order := ["T1", "T2", "T3", "T4", "P1", "P2", "P3"]; var cw2 := (r2.size.x - 24.0) / 7.0
	for k in 7:
		var s: Dictionary = by[order[k]]; var cr := Rect2(r2.position + Vector2(12.0 + cw2 * k, 28.0), Vector2(cw2 - 6.0, 72.0))
		draw_rect(cr, Color(_heat(float(s.saidiMin) / hmax), 0.30)); draw_rect(cr, _heat(float(s.saidiMin) / hmax), false, 1.5)
		_text(_semi(), 12, cr.position + Vector2(8, 18), order[k], GridTheme.TEXT); _text(_mono(), 13, cr.position + Vector2(0, 40), T("C8_MIN_YR") % WorkOrder.num(float(s.saidiMin)), GridTheme.TEXT, cr.size.x - 8.0, 2)
		_text(_mono(), 10, cr.position + Vector2(8, 62), (T("C8_FAULTS_YR3") if _look3() else T("C8_FAULTS_YR")) % WorkOrder.num(float(s.faultsPerYear)), Color(GridTheme.TEXT, 0.7))

func _indices_card(r3: Rect2) -> void:
	_card(r3)
	var ix: Dictionary = q.indices; var tg: Dictionary = q.targets
	var cells := [[T("C8_SAIFI"), WorkOrder.num(float(ix.saifi)), T("C8_TARGET_MAX") % WorkOrder.num(float(tg.saifiMax)), float(ix.saifi) <= float(tg.saifiMax), T("C8_G_SAIFI")],
		[T("C8_SAIDI"), WorkOrder.num(float(ix.saidi)), T("C8_TARGET_MAX") % WorkOrder.num(float(tg.saidiMax)), float(ix.saidi) <= float(tg.saidiMax), T("C8_G_SAIDI")],
		[T("C8_CAIDI"), WorkOrder.num(float(ix.caidi)), T("C8_CAIDI_EQ"), true, T("C8_G_CAIDI")], [T("C8_ENS"), WorkOrder.num(float(ix.ensMWh)), T("C8_STAR_MAX") % WorkOrder.num(float(tg.ensStar)), float(ix.ensMWh) <= float(tg.ensStar), T("C8_G_ENS")]]
	var iw := (r3.size.x - 24.0) / 4.0
	if _look3():   # 11-28b audit: rows from the sizes actually drawn (the 16 px floor): at 1280x800 the lines printed over each other and past the card
		var ft := GridText.floor_size(self, GridTheme.fs(11)); var fn := GridText.floor_size(self, GridTheme.fs(26)); var fg := GridText.floor_size(self, GridTheme.fs(10))
		var y1 := 10.0 + ft; var y2 := y1 + fn + 2.0; var y3 := y2 + fg + 6.0; var room := r3.end.y - 8.0 - (r3.position.y + y3 + 6.0)
		var gl := int(floor(room / (float(fg) * 1.25)))
		for k in 4:
			var c: Array = cells[k]; var o := r3.position + Vector2(12.0 + iw * k, 0.0); var mf := _mono()
			_text(_semi(), 11, o + Vector2(0, y1), str(c[0]), Color(GridTheme.TEXT, 0.75)); _text(mf, 26, o + Vector2(0, y2), str(c[1]), _good(bool(c[3])))
			var tg_s := str(c[2])
			if mf.get_string_size(tg_s, HORIZONTAL_ALIGNMENT_LEFT, -1, fg).x > iw - 10.0: tg_s = tg_s.replace("target: at most ", "≤ ").replace("lamp 3: at most ", "lamp 3 ≤ ").replace("= SAIDI / SAIFI", "SAIDI/SAIFI")
			_text(mf, 10, o + Vector2(0, y3), tg_s, Color(GridTheme.TEXT, 0.65))
			if not _phone() and gl >= 1: GridText.dm(self, mf, o + Vector2(0, y3 + 6.0 + fg), str(c[4]), HORIZONTAL_ALIGNMENT_LEFT, iw - 14.0, GridTheme.fs(10), gl, Color(GridTheme.TEXT, 0.5))
		return
	for k in 4:
		var c: Array = cells[k]; var o := r3.position + Vector2(12.0 + iw * k, 14.0)
		_text(_semi(), 11, o + Vector2(0, 8), str(c[0]), Color(GridTheme.TEXT, 0.75)); _text(_mono(), 26, o + Vector2(0, 42), str(c[1]), _good(bool(c[3])))
		_text(_mono(), 10, o + Vector2(0, 60), str(c[2]), Color(GridTheme.TEXT, 0.65))
		if not _phone(): GridText.dm(self, _mono(), o + Vector2(0, 78), str(c[4]), HORIZONTAL_ALIGNMENT_LEFT, iw - 14.0, GridTheme.fs(10), 4, Color(GridTheme.TEXT, 0.5))

## The 3D feeder: the heat strip and the four indices stay as glass cards over the sky; each section's village carries what it costs a year, the devices and the tie their own chip.
func _draw_stage3() -> void:
	var w := _right(); var cw := minf(w * 0.46, 880.0)
	var r2 := Rect2(Vector2(M, TOP), Vector2(cw, 112.0)); _heat_strip(r2)
	var r3 := Rect2(Vector2(M, r2.end.y + 8.0), Vector2(cw, clampf(_stage_bottom() - r2.end.y - 20.0, 120.0, 178.0))); _indices_card(r3)
	_pins.append(r2); _pins.append(r3)
	var d: Dictionary = q.design; var hmax := 1.0
	for s in q.sections: hmax = maxf(hmax, float(s.saidiMin))
	_pin("sub", [T("C8_SUB_PIN")], [GridTheme.G_TEXT], 22.0)
	for s in q.sections:
		var id := str(s.id); var lines := ["%s  %s" % [id, T("C8_KM") % WorkOrder.num(float(s.km))], T("C8_HOMES_PIN") % int(s.customers)]; var cols := [GridTheme.G_TEXT, GridTheme.G_DIM]
		if _revealed():
			lines.append(T("C8_PIN_YR") % WorkOrder.num(float(s.saidiMin))); cols.append(_heat(float(s.saidiMin) / hmax))
		if id.begins_with("T") and str(d.sect.get(id, "none")) != "none":
			lines.append(T("C8_SW_PIN") % (T("C8_MANUAL") if str(d.sect[id]) == "manual" else T("C8_REMOTE"))); cols.append(GridTheme.COPPER if str(d.sect[id]) == "manual" else GridTheme.LIVE)
		if id.begins_with("P") and bool(d.fuse[id]): lines.append(T("C8_FUSE_PIN")); cols.append(GridTheme.GOOD)
		_pin(id, lines, cols, 20.0)
	_pin("tie", [T("C8_NEXT_FEEDER"), (T("C8_TIE_INFO") % [int(kit.get("tie", {}).get("kw", 0)), int(kit.get("tie", {}).get("minutes", 0))]) if bool(d.tie) else T("C8_NO_TIE")], [GridTheme.G_TEXT, GridTheme.WARN if bool(d.tie) else GridTheme.G_DIM], 18.0)
	if _revealed():
		var worst := ""; var wm := -1.0
		for s in q.sections: if float(s.saidiMin) > wm: wm = float(s.saidiMin); worst = str(s.id)
		_pin("blame", [T("C8_BLAME_PIN") % worst], [GridTheme.BAD], 18.0)
