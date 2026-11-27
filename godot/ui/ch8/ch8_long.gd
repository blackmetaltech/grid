class_name Ch8Long
extends Ch8Base
## L31 The Long Feeder: the 16 km 11 kV feeder as a single-line diagram (customers per node, peak and minimum-load voltage per node against the band, current against the wire's
## ampacity) and the voltage profile. The panel: pick a trunk section (or all), then its wire and its transformer tap; a regulator at N2 or N3 with a set point.
## Cute mode: a node is a lit dot when its voltage is in band.
var vset := 1.0   ## the regulator set point the next placement uses

func _init() -> void:
	super._init(); scenario = "L31"; name = "Ch8Long"

func _node_ids() -> Array:
	var out := []
	for n in q.tree: out.append(str(n.id))
	return out

func _build_panel(ip: Rect2) -> void:
	var ids := _node_ids(); var cond_of := {}; var tap_of := {}
	for n in q.tree: cond_of[str(n.id)] = str(n.conductor); tap_of[str(n.id)] = float(n.tap)
	_cap(ip, 0, 10, T("C8_SECTION_CAP")); _cap(ip, 0, 68, T("C8_WIRE_CAP")); _cap(ip, 330, 10, T("C8_TAP_CAP")); _cap(ip, 330, 68, T("C8_REG_CAP") % str(kit.get("regulator", {}).get("price", "")))
	for i in ids.size(): _c(ip, 50.0 * i, 16, 46, 36, ids[i], "sect", ids[i], sel_node == ids[i])
	_c(ip, 50.0 * ids.size(), 16, 46, 36, T("C8_ALL"), "sect", "all", sel_node == "all")
	var cs: Array = kit.get("conductors", [])
	for k in cs.size():
		var cid := str(cs[k].id); var cur: bool = (cond_of[sel_node] == cid) if sel_node != "all" else _all_same(cond_of, cid)
		_c(ip, 80.0 * k, 74, 76, 38, cid, "wire", cid, cur, T("C8_PER_KM") % str(cs[k].perKm))
	var taps: Array = kit.get("taps", [])
	for k in taps.size():
		var tv := float(taps[k]); var cur2: bool = (tap_of[sel_node] == tv) if sel_node != "all" else _all_same(tap_of, tv)
		_c(ip, 330.0 + 62.0 * k, 16, 58, 36, ("+" if tv > 0.0 else "") + WorkOrder.num(tv), "tap", tv, cur2)
	var rg = q.get("regulator")
	_c(ip, 330, 74, 40, 38, T("C8_OFF"), "regoff", "", rg == null)
	var sites: Array = (kit.get("parts", {}) as Dictionary).get("placeRegulator", ["N2", "N3"])   # the level's regulator sites (ch8Kit.parts)
	for k in mini(sites.size(), 2): _c(ip, 374.0 + 44.0 * k, 74, 40, 38, str(sites[k]), "regat", str(sites[k]), rg != null and str(rg.nodeId) == str(sites[k]))
	var vs: Array = kit.get("regulator", {}).get("vSetOptions", [])
	var vcur := float(rg.vSetPu) if rg != null else vset
	for k in vs.size(): _c(ip, 468.0 + 42.0 * k, 74, 38, 38, WorkOrder.num(float(vs[k])), "vset", float(vs[k]), is_equal_approx(vcur, float(vs[k])))

func _all_same(d: Dictionary, v) -> bool:
	for k in d: if d[k] != v: return false
	return true

func _pressed(h: Dictionary, _p: Vector2) -> void:
	match str(h.id):
		"sect": sel_node = str(h.arg); layout(); queue_redraw()
		"wire": _act("setConductor", [sel_node, str(h.arg)])
		"tap": _act("setDtTap", [sel_node, float(h.arg)])
		"regoff": _act("removeRegulator", [])
		"regat": _act("placeRegulator", [str(h.arg), vset])
		"vset":
			vset = float(h.arg)
			var rg = q.get("regulator")
			if rg != null: _act("placeRegulator", [str(rg.nodeId), vset])
			else: layout(); queue_redraw()

func _body(ip: Rect2) -> void:
	var v: Dictionary = q.voltage; var ok := bool(v.ok)
	_status(ip, (T("C8_L31_OK") if ok else T("C8_L31_LOW") % [WorkOrder.num(float(v.minV)), str(v.minNode), WorkOrder.num(float(q.band.loV))]), _good(ok))

func _draw_stage() -> void:
	if _look3(): _draw_stage3(); return
	var sb := _sbox(420.0); var w := sb.size.x + 60.0; var top := sb.position.y; var bh := sb.size.y
	var r1 := Rect2(Vector2(30.0, top), Vector2(w - 60.0, minf(260.0, bh * 0.45)))
	var tree: Array = q.tree; var va := []; var vb := []
	for n in tree: va.append(float(n.vPeakV)); vb.append(float(n.vMinLoadV))
	_feeder_diagram(r1, tree, va, vb, T("C8_PEAK"), T("C8_LIGHT"), [], 0.0, false)
	var r2 := Rect2(Vector2(30.0, r1.end.y + 12.0), Vector2(maxf((w - 60.0) * 0.62, 400.0), maxf(bh - r1.size.y - 12.0, 160.0)))
	_profile(r2, tree, _cum_km(tree), [{"name": T("C8_PEAK_NAME"), "vals": va, "col": GridTheme.SODIUM}, {"name": T("C8_LIGHT_NAME") % int(q.minLoadPct), "vals": vb, "col": GridTheme.LIVE}])
	var r3 := Rect2(Vector2(r2.end.x + 12.0, r2.position.y), Vector2(maxf(w - 30.0 - r2.end.x - 12.0, 220.0), r2.size.y))
	_read_card(r3)

func _read_card(r3: Rect2) -> void:
	var v: Dictionary = q.voltage; var lines := []
	lines.append([T("C8_L31_MIN") % [WorkOrder.num(float(v.minV)), str(v.minNode), WorkOrder.num(float(q.band.loV)), WorkOrder.num(float(v.marginLoV))], _good(float(v.marginLoV) >= 0.0)])
	lines.append([T("C8_L31_MAX") % [WorkOrder.num(float(v.maxV)), str(v.maxNode), WorkOrder.num(float(q.band.hiV)), WorkOrder.num(float(v.marginHiV))], _good(float(v.marginHiV) >= 0.0)])
	lines.append([T("C8_L31_LOSS") % [WorkOrder.num(float(q.lossPct)), WorkOrder.num(float(q.lossKw))], Color(GridTheme.TEXT, 0.85)])
	lines.append([T("C8_L31_HAND") % [WorkOrder.num(float(q.handDropPct)), WorkOrder.num(float(q.sweepDropPct))], Color(GridTheme.TEXT, 0.85)])
	var rg = q.get("regulator")
	if rg != null: lines.append([T("C8_L31_REG") % [str(rg.nodeId), WorkOrder.num(float(rg.vSetPu)), int(rg.stepsPeak), int(rg.stepsMinLoad), int(rg.maxSteps)], GridTheme.COPPER])
	lines.append([T("C8_L31_GLOSS_TAP"), Color(GridTheme.TEXT, 0.6)]); lines.append([T("C8_L31_GLOSS_REG"), Color(GridTheme.TEXT, 0.6)])
	_lines(r3, T("C8_L31_TITLE"), lines)

## The 3D feeder: the profile and the readings stay as glass cards over the sky; the villages, the wire of each section and the regulator carry chips.
func _draw_stage3() -> void:
	var bh := _cards3_h(); var cs := _cards3(640.0, 520.0, bh)
	var tree: Array = q.tree; var va := []; var vb := []
	for n in tree: va.append(float(n.vPeakV)); vb.append(float(n.vMinLoadV))
	_profile(cs[0], tree, _cum_km(tree), [{"name": T("C8_PEAK_NAME"), "vals": va, "col": GridTheme.SODIUM}, {"name": T("C8_LIGHT_NAME") % int(q.minLoadPct), "vals": vb, "col": GridTheme.LIVE}])
	_read_card(cs[1])
	var lo := float(q.band.loV); var total := 0.0
	for n in tree: total += float(n.km)
	_pin("sub", [T("C8_SUB_PIN"), T("C8_SCALE") % WorkOrder.num(total)], [GridTheme.G_TEXT, GridTheme.G_DIM], 22.0)
	for n in tree:
		var v := float(n.vPeakV)
		var lines := ["%s  %s  %s" % [str(n.id), T("C8_KM") % WorkOrder.num(float(n.km)), str(n.conductor)], T("C8_PEAK") + " " + _vtxt(v)]; var cols := [GridTheme.G_TEXT, _good(v >= lo)]
		if float(n.tap) != 0.0: lines.append(T("C8_TAP_AT") % WorkOrder.num(float(n.tap))); cols.append(GridTheme.SODIUM)
		_pin(str(n.id), lines, cols, 20.0)
	var rg = q.get("regulator")
	if rg != null:
		for i in tree.size():
			if str(tree[i].id) == str(rg.nodeId): _pin("reg%d" % (i + 1), [T("C8_REG_PIN") % WorkOrder.num(float(rg.vSetPu)), T("C8_REG_STEPS") % int(rg.stepsPeak)], [GridTheme.COPPER, GridTheme.G_DIM], 16.0)
