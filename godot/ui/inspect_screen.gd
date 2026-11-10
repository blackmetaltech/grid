class_name GridInspectScreen
extends CbScreen
## Inspector drawer: the selected element's numbers from the engine (busInfo / branchInfo / unitInfo / phasor), the phasor mini-diagram,
## the settings the level allows (breaker, capacitor steps, remove) and the why-card entries that name the element. Bench levels show the circuit.

var phasor: PhasorView = null   ## the diagram of the current build (tests read it)
var last: Dictionary = {}       ## the engine `phasor` answer being drawn

func _items(w: Dictionary) -> Array:
	var out: Array = []
	for b in w.get("buses", []): out.append(["bus", str(b.id)])
	for b in w.get("branches", []): out.append(["branch", str(b.id)])
	for u in w.get("units", []): out.append(["unit", str(u.id)])
	for h in w.get("shunts", []): out.append(["shunt", str(h.id)])
	return out

func _kv(v: VBoxContainer, k: String, val: String, col: Color = CbKit.TX) -> void:
	var r := HFlowContainer.new(); r.add_theme_constant_override("h_separation", 12)
	var kl := CbKit.label(k, 14, CbKit.DIM); kl.custom_minimum_size.x = 120; r.add_child(kl)
	r.add_child(CbKit.label(val, 18, col, true)); v.add_child(r)

func build(b: VBoxContainer) -> void:
	GridUi.load_strings()
	phasor = null; last = {}
	CbKit.header(b, tr("INSP_TITLE"), tr("INSP_HINT"))
	var w = app.b.q("world")
	if not (w is Dictionary) or str(w.get("kind", "none")) == "none": b.add_child(CbKit.label(tr("INSP_NONE"), 16, CbKit.DIM, true)); return
	if str(w.kind) == "bench": _bench(b); return
	var items := _items(w)
	if items.is_empty(): b.add_child(CbKit.label(tr("INSP_NONE"), 16, CbKit.DIM, true)); return
	var sel: Dictionary = GridUi.selected
	var key := "%s/%s" % [sel.get("kind", ""), sel.get("id", "")]
	var keys: Array = items.map(func(x): return "%s/%s" % [x[0], x[1]])
	if not keys.has(key):   # default: the first line (its phasor is the interesting one), else the first element
		var first: Array = items[0]
		for x in items: if x[0] == "branch": first = x; break
		sel = {"kind": first[0], "id": first[1]}; GridUi.selected = sel; key = "%s/%s" % [first[0], first[1]]
	var opts: Array = items.map(func(x): return ["%s/%s" % [x[0], x[1]], tr("INSP_" + str(x[0]).to_upper()) % str(x[1])])
	var pr := HBoxContainer.new(); pr.add_theme_constant_override("separation", 8)
	var pl := CbKit.label(tr("INSP_PICK"), 14, CbKit.DIM); pr.add_child(pl)
	var ob := CbKit.option(opts, key, func(id): var p := str(id).split("/"); GridUi.select(p[0], p[1]); rebuild()); ob.name = "pick"; ob.size_flags_horizontal = Control.SIZE_EXPAND_FILL; pr.add_child(ob)
	b.add_child(pr)
	var id: String = str(sel.id)
	match str(sel.kind):
		"bus": _bus(b, id)
		"branch": _branch(b, id)
		"unit": _unit(b, id)
		"shunt": _shunt(b, id)
	_why(b, id)

func _phasor_panel(b: VBoxContainer, kind: String, id: String) -> void:
	var q = app.b.q("phasor", [kind, id])
	var pn := CbKit.panel(tr("PHASOR_TITLE"), true, b); var v: VBoxContainer = pn[1]
	if not (q is Dictionary) or q.get("error", false) or (kind == "bus" and float(q.sMVA) <= 0.0):
		v.add_child(CbKit.label(tr("PHASOR_NONE"), 14, CbKit.DIM, true))
		if q is Dictionary and not q.get("error", false) and kind == "bus": pass
		return
	last = q
	phasor = PhasorView.new(); phasor.set_data(q); phasor.size_flags_horizontal = Control.SIZE_SHRINK_CENTER; v.add_child(phasor)
	var ph := float(q.phiDeg); var word := ""
	if str(q.lead) == "unity": word = tr("PHASOR_UNITY")
	elif str(q.lead) == "lagging": word = tr("PHASOR_LAG") % ("%.1f" % absf(ph))
	else: word = tr("PHASOR_LEAD") % ("%.1f" % absf(ph))
	v.add_child(CbKit.label(word, 15, CbKit.AM, true))
	var st := CbKit.stats([
		[tr("INSP_P"), tr("INSP_MW_FMT") % ("%.2f" % float(q.pMW)), CbKit.TX], [tr("INSP_Q"), tr("INSP_MVAR_FMT") % ("%.2f" % float(q.qMVAr)), CbKit.TX],
		[tr("INSP_S"), tr("INSP_MVA_FMT") % ("%.2f" % float(q.sMVA)), CbKit.TX], [tr("INSP_PF"), "%.3f" % float(q.pf), CbKit.ACC]], 2)
	v.add_child(st)
	v.add_child(CbKit.label(tr("PHASOR_NOTE"), 12, CbKit.DIM, true))

func _bus(b: VBoxContainer, id: String) -> void:
	var q = app.b.q("busInfo", [id])
	if not (q is Dictionary) or q.get("error", false): return
	var pn := CbKit.panel(tr("INSP_BUS") % id, false, b); var v: VBoxContainer = pn[1]
	if q.energised:
		_kv(v, tr("INSP_V"), tr("INSP_V_FMT") % ["%.3f" % float(q.vPu), "%.2f" % (float(q.vPu) * float(q.kvNom))], CbKit.ACC)
		_kv(v, tr("INSP_THETA"), tr("INSP_THETA_FMT") % ("%.2f" % float(q.thetaDeg)))
		_kv(v, tr("INSP_BAND"), tr("INSP_BAND_FMT") % ["%.3f" % float(q.bandLo), "%.3f" % float(q.bandHi)])
	else: _kv(v, tr("INSP_STATE_LABEL"), tr("INSP_DEAD"), CbKit.RD)
	_kv(v, tr("INSP_LOAD_MW"), tr("INSP_MW_FMT") % ("%.2f" % float(q.loadMW)))
	_kv(v, tr("INSP_GEN_MW"), tr("INSP_MW_FMT") % ("%.2f" % float(q.genMW)))
	if q.energised: _phasor_panel(b, "bus", id)

func _branch(b: VBoxContainer, id: String) -> void:
	var q = app.b.q("branchInfo", [id])
	if not (q is Dictionary) or q.get("error", false): return
	var pn := CbKit.panel(tr("INSP_BRANCH") % id, false, b); var v: VBoxContainer = pn[1]
	var ld := float(q.loading)
	_kv(v, tr("INSP_LOAD"), tr("INSP_PCT_FMT") % ("%.0f" % (ld * 100.0)), CbKit.RD if ld > 1.0 else (CbKit.AM if ld > 0.9 else CbKit.GR))
	v.add_child(CbKit.bar(minf(ld, 1.2), 1.2, ld > 1.0))
	_kv(v, tr("INSP_I"), tr("INSP_I_FMT") % ("%.3f" % float(q.currentKA)))
	_kv(v, tr("INSP_LOSS"), tr("INSP_MW_FMT") % ("%.3f" % float(q.lossMW)))
	_kv(v, tr("INSP_STATE_LABEL"), tr("INSP_SERVICE") if q.inService else tr("INSP_OPEN"), CbKit.GR if q.inService else CbKit.AM)
	var go := CbKit.btn(tr("INSP_OPEN_IT") if q.inService else tr("INSP_CLOSE"), func(): _do("switchBranch", [id, not bool(q.inService)]), "", 15); go.name = "switch"; v.add_child(go)
	_phasor_panel(b, "branch", id)

func _unit(b: VBoxContainer, id: String) -> void:
	var q = app.b.q("unitInfo", [id])
	if not (q is Dictionary) or q.get("error", false): return
	var pn := CbKit.panel(tr("INSP_UNIT") % id, false, b); var v: VBoxContainer = pn[1]
	_kv(v, tr("INSP_GEN_MW"), tr("INSP_MW_FMT") % ("%.2f" % float(q.P)), CbKit.ACC)
	_kv(v, tr("INSP_LOAD"), tr("INSP_PCT_FMT") % ("%.0f" % float(q.loadingPct)))
	v.add_child(CbKit.bar(float(q.loadingPct), 100.0))

func _shunt(b: VBoxContainer, id: String) -> void:
	var pn := CbKit.panel(tr("INSP_SHUNT") % id, false, b); var v: VBoxContainer = pn[1]
	var w = app.b.q("world"); var h = null
	for s in w.shunts: if str(s.id) == id: h = s
	if h == null: return
	_kv(v, tr("INSP_STEPS"), "%d / %d" % [int(h.on), int(h.steps)], CbKit.ACC)
	var row := HBoxContainer.new(); row.add_theme_constant_override("separation", 8)
	var dn := CbKit.btn(tr("INSP_STEP_DOWN"), func(): _do("setShuntSteps", [id, maxi(int(h.on) - 1, 0)]), "", 15); dn.name = "step_down"; row.add_child(dn)
	var up := CbKit.btn(tr("INSP_STEP_UP"), func(): _do("setShuntSteps", [id, mini(int(h.on) + 1, int(h.steps))]), "go", 15); up.name = "step_up"; row.add_child(up)
	v.add_child(row)
	var rm := CbKit.btn(tr("INSP_DELETE"), func(): _do("demolish", [id]), "danger", 14); rm.name = "remove"; v.add_child(rm)

func _bench(b: VBoxContainer) -> void:
	var q = app.b.q("benchStatus")
	if not (q is Dictionary) or not q.get("active", false): b.add_child(CbKit.label(tr("INSP_NONE"), 16, CbKit.DIM, true)); return
	var pn := CbKit.panel(tr("BENCH_TITLE"), true, b); var v: VBoxContainer = pn[1]
	_kv(v, tr("INSP_STATE_LABEL"), tr("BENCH_POWERED") if q.powered else tr("BENCH_UNPOWERED"), CbKit.GR if q.powered else CbKit.RD)
	var vs: Array = (q.vLoadV as Array).map(func(x): return tr("BENCH_V_FMT") % ("%.1f" % float(x)))
	_kv(v, tr("BENCH_V"), ", ".join(vs), CbKit.ACC)
	_kv(v, tr("BENCH_LOSS"), tr("INSP_PCT_FMT") % ("%.1f" % float(q.lossPct)))
	var af := float(q.ampFracMax)
	_kv(v, tr("BENCH_AMPS"), tr("INSP_PCT_FMT") % ("%.0f" % (af * 100.0)), CbKit.RD if af > 1.0 else CbKit.TX)
	v.add_child(CbKit.bar(minf(af, 1.2), 1.2, af > 1.0))
	_kv(v, tr("BENCH_COST"), CbKit.num(float(q.cost), 0))
	if q.reason != null: v.add_child(CbKit.label(str(q.reason), 14, CbKit.AM, true))
	v.add_child(CbKit.label(tr("BENCH_DC"), 13, CbKit.DIM, true))

func _why(b: VBoxContainer, id: String) -> void:
	var wc = app.b.q("whyCard")
	if not (wc is Dictionary) or wc.get("empty", true): return
	var mine: Array = (wc.entries as Array).filter(func(e): return str(e.element) == id)
	if mine.is_empty(): return
	var pn := CbKit.panel(tr("INSP_WHY"), true, b); var v: VBoxContainer = pn[1]
	for e in mine.slice(0, 3): v.add_child(CbKit.label(str(e.message), 14, CbKit.AM, true))

func _do(act: String, args: Array) -> void:
	var r: Dictionary = app.b.act(act, args)
	app.sfx("confirm" if r.get("ok", false) else "bad")
	app.toast(str(r.get("message", "")), "good" if r.get("ok", false) else "bad")
