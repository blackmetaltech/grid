class_name Ch8Sun
extends Ch8Base
## L35 Sun on the Roofs: the feeder at noon (30 % load, full sun, power flowing back up the line, the voltage climbing toward the roofs) and in the evening (peak load, no sun), the two
## voltage profiles against the band, the hosting capacity. The panel: the PV queue's connection limit, the tap changer's set point with line-drop compensation, volt-var inverters,
## the head conductor. Cute mode: a roof's sun is bright while its voltage is in band.
func _init() -> void:
	super._init(); scenario = "L35"; name = "Ch8Sun"

func _head_wire() -> String:
	var t: Array = q.tree
	return str(t[0].conductor) if str(t[0].conductor) == str(t[1].conductor) else ""

func _build_panel(ip: Rect2) -> void:
	var d: Dictionary = q.design
	_cap(ip, 0, 28, T("C8_PV_CAP")); _cap(ip, 0, 72, T("C8_OLTC_CAP")); _cap(ip, 0, 116, T("C8_INV_CAP")); _cap(ip, 188, 116, T("C8_HEAD_CAP"))
	var pvs: Array = kit.get("pvLimitsKw", [])
	for k in pvs.size(): _c(ip, 84.0 + 56.0 * k, 4, 52, 38, WorkOrder.num(float(pvs[k])), "pv", float(pvs[k]), is_equal_approx(float(d.pvLimitKw), float(pvs[k])))
	var sets: Array = kit.get("oltcSetOptions", [])
	for k in sets.size(): _c(ip, 84.0 + 56.0 * k, 48, 52, 38, "%.2f" % float(sets[k]), "oltc", float(sets[k]), is_equal_approx(float(d.oltcSetPu), float(sets[k])))
	_c(ip, 270, 48, 130, 38, T("C8_LDC"), "ldc", "", bool(d.ldc), str(kit.get("ldcPrice", "")))
	_c(ip, 84, 92, 100, 38, T("C8_VOLTVAR"), "vv", "", bool(d.voltVar), str(kit.get("voltVarPrice", "")))
	var cs: Array = kit.get("conductors", [])
	var x := 0
	for c in cs:
		if str(c.id) in (kit.get("parts", {}) as Dictionary).get("setConductor", ["Rabbit", "Hyena"]):   # the level's conductors (ch8Kit.parts)
			_c(ip, 298.0 + 80.0 * x, 92, 76, 38, str(c.id), "head", str(c.id), _head_wire() == str(c.id), T("C8_PER_KM") % str(c.perKm)); x += 1

func _pressed(h: Dictionary, _p: Vector2) -> void:
	match str(h.id):
		"pv": _act("setPvLimit", [float(h.arg)])
		"oltc": _act("setOltc", [float(h.arg), bool(q.design.ldc)])
		"ldc": _act("setOltc", [float(q.design.oltcSetPu), not bool(q.design.ldc)])
		"vv": _act("setVoltVar", [not bool(q.design.voltVar)])
		"head":
			if _act("setConductor", ["N1", str(h.arg)]): _act("setConductor", ["N2", str(h.arg)])

func _body(ip: Rect2) -> void:
	draw_multiline_string(_mono(), ip.position + Vector2(420.0, 70.0), T("C8_HOST_LINE") % [WorkOrder.num(float(q.design.pvLimitKw)), WorkOrder.num(float(q.hostingKw))], HORIZONTAL_ALIGNMENT_LEFT, 210.0, GridTheme.fs(11), 4, _good(float(q.design.pvLimitKw) <= float(q.hostingKw) + 0.5))

func _draw_stage() -> void:
	var sb := _sbox(420.0); var w := sb.size.x + 60.0; var top := sb.position.y; var bh := sb.size.y
	var r1 := Rect2(Vector2(30.0, top), Vector2(w - 60.0, minf(280.0, bh * 0.45)))
	var tree: Array = q.tree; var noon: Dictionary = q.noon; var eve: Dictionary = q.evening
	var pv_each := float(q.design.pvLimitKw) / maxf(float((q.pvNodes as Array).size()), 1.0)
	_feeder_diagram(r1, tree, noon.vV, eve.vV, T("C8_NOON"), T("C8_EVENING"), q.pvNodes, pv_each, bool(noon.reverseFlow))
	var r2 := Rect2(Vector2(30.0, r1.end.y + 12.0), Vector2(maxf((w - 60.0) * 0.62, 400.0), maxf(bh - r1.size.y - 12.0, 160.0)))
	_profile(r2, tree, _cum_km(tree), [{"name": T("C8_NOON_NAME"), "vals": noon.vV, "col": GridTheme.WARN}, {"name": T("C8_EVE_NAME"), "vals": eve.vV, "col": GridTheme.LIVE}])
	var r3 := Rect2(Vector2(r2.end.x + 12.0, r2.position.y), Vector2(maxf(w - 30.0 - r2.end.x - 12.0, 220.0), r2.size.y))
	var lines := []; var band: Dictionary = q.band
	lines.append([T("C8_L35_NOON") % [WorkOrder.num(float(noon.maxV)), str(noon.maxNode), WorkOrder.num(float(band.hiV)), WorkOrder.num(float(q.marginHiV))], _good(float(q.marginHiV) >= 0.0)])
	lines.append([(T("C8_L35_BACK") % WorkOrder.num(absf(float(noon.headKw)))) if bool(noon.reverseFlow) else T("C8_L35_FWD") % WorkOrder.num(absf(float(noon.headKw))), Color(GridTheme.TEXT, 0.85)])
	lines.append([T("C8_L35_EVE") % [WorkOrder.num(float(eve.minV)), str(eve.minNode), WorkOrder.num(float(band.loV)), WorkOrder.num(float(q.marginLoV))], _good(float(q.marginLoV) >= 0.0)])
	lines.append([T("C8_L35_HOST") % [WorkOrder.num(float(q.hostingKw)), T("C8_LIMBY_" + str(q.hostingLimitedBy)), WorkOrder.num(float(q.design.pvLimitKw)), WorkOrder.num(float(q.minPvKw))], _good(float(q.design.pvLimitKw) >= float(q.minPvKw))])
	lines.append([T("C8_L35_OLTC") % [int(noon.oltcStep), WorkOrder.num(float(noon.sourcePu)), int(eve.oltcStep), WorkOrder.num(float(eve.sourcePu))], Color(GridTheme.TEXT, 0.85)])
	var qs := 0.0
	for k in noon.qKvar: qs += absf(float(noon.qKvar[k]))
	if bool(q.design.voltVar): lines.append([T("C8_L35_VV") % WorkOrder.num(snappedf(qs, 1.0)), GridTheme.REACTIVE])
	lines.append([T("C8_L35_GLOSS1"), Color(GridTheme.TEXT, 0.6)]); lines.append([T("C8_L35_GLOSS2"), Color(GridTheme.TEXT, 0.6)])
	_lines(r3, T("C8_L35_TITLE"), lines)
