extends CbScreen
## The valve drawer: the opening slider with ±1 % / ±10 % buttons, live readouts (q_in, q_out, steady depth), the "Why" line with the
## equation, and the "work out the opening" helper (engine query valveFor). Values refresh in place (update_live) so the slider stays
## usable while the clock ticks.
var refs := {}
var target_h := 1.1
var _drag := false

func _rig() -> Dictionary: return app.b.init_data.get("catalogues", {}).get("rig", {"g": 9.80665, "Cd": 0.61, "a": 0.002, "A": 0.5, "H": 2.0, "qMax": 0.009})
func _valve_pct() -> float: return float(app.b.g.get("valve", 0.0)) * 100.0
func _lps(q: float) -> String: return CbKit.fmt(q * 1000.0, 2, "L/s")

func _apply_valve(p: float) -> void:
	var r: Dictionary = app.b.act("setValve", [clampf(snappedf(p, 0.1), 0.0, 100.0)])
	if not r.get("ok", false): app.toast(str(r.get("message", "")), "bad")

func build(b: VBoxContainer) -> void:
	refs.clear()
	var rig := _rig()
	var f: Dictionary = app.b.q("flows")
	var band: Array = app.b.g.get("band", [1.0, 1.2])
	CbKit.header(b, "Valve control", "Open it more and the tank fills; the hole at the bottom drains faster the deeper it gets.")
	var pv := CbKit.panel("Opening", true, b); var v: VBoxContainer = pv[1]
	var top := HBoxContainer.new(); v.add_child(top)
	top.add_child(CbKit.label("VALVE", 13, CbKit.DIM)); var sp := Control.new(); sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL; top.add_child(sp)
	refs.pct = CbKit.label("%.1f %%" % _valve_pct(), 36, CbKit.ACC); top.add_child(refs.pct)
	var sl := CbKit.slider(_valve_pct(), 0.0, 100.0, 0.5, func(x: float): refs.pct.text = "%.1f %%" % x)
	sl.custom_minimum_size.y = maxf(30.0, CbLayout.tap()); sl.drag_started.connect(func(): _drag = true); sl.drag_ended.connect(func(_c): _drag = false)
	CbKit.on_set(sl, func(x: float): _apply_valve(x)); v.add_child(sl); refs.slider = sl
	var fl := HFlowContainer.new(); fl.add_theme_constant_override("h_separation", 8); fl.add_theme_constant_override("v_separation", 8); v.add_child(fl)
	fl.add_child(CbKit.btn("Shut", func(): _apply_valve(0.0), "", 15))
	for d in [-10.0, -1.0, 1.0, 10.0]:
		var dd: float = d
		fl.add_child(CbKit.btn(("%+d %%" % int(dd)), func(): _apply_valve(_valve_pct() + dd), "pri" if absf(dd) == 1.0 else "", 15))
	fl.add_child(CbKit.btn("Full", func(): _apply_valve(100.0), "", 15))
	# --- readouts ---
	var pf := CbKit.panel("Flows right now", false, b); var fv: VBoxContainer = pf[1]
	var g := GridContainer.new(); g.columns = 2 if CbLayout.phone else 3; g.add_theme_constant_override("h_separation", 12); g.add_theme_constant_override("v_separation", 10); g.size_flags_horizontal = Control.SIZE_EXPAND_FILL; fv.add_child(g)
	for it in [["q_in", "in"], ["q_out", "out"], ["net", "net"], ["depth h", "h"], ["steady h*", "steady"], ["held", "held"]]:
		var s := CbKit.stat(str(it[0]), "", CbKit.TX); g.add_child(s); refs[it[1]] = s.get_child(1)
	fv.add_child(CbKit.bar(float(f.get("held", 0)), float(f.get("holdTicks", 10)))); refs.heldbar = fv.get_child(fv.get_child_count() - 1)
	# --- why ---
	var eq := CbKit.equation("q_in = q_out   ⇒   h* = (q_in / (Cd·a))² / 2g", "")
	b.add_child(eq); refs.eq = eq
	var wl := CbKit.label("", 15, CbKit.DIM, true); (eq.get_child(0) as VBoxContainer).add_child(wl); refs.why = wl
	# --- the helper ---
	var ph := CbKit.panel("Work out the opening", false, b); var hv: VBoxContainer = ph[1]
	hv.add_child(CbKit.label("Which opening holds a depth? Pick a depth and follow the arithmetic.", 14, CbKit.DIM, true))
	var row := HBoxContainer.new(); row.add_theme_constant_override("separation", 12); hv.add_child(row)
	row.add_child(CbKit.label("DEPTH", 13, CbKit.DIM)); refs.th = CbKit.label("%.2f m" % target_h, 22, CbKit.TX); row.add_child(refs.th)
	var ts := CbKit.slider(target_h, 0.2, float(rig.H) - 0.1, 0.05, func(x: float): target_h = x; refs.th.text = "%.2f m" % x; _helper())
	row.add_child(ts); refs.ts = ts
	refs.steps = CbKit.label("", 15, CbKit.TX, true); hv.add_child(refs.steps)
	refs.apply = CbKit.btn("", func(): _apply_helper(), "go", 16); hv.add_child(refs.apply)
	refs.mid = CbKit.btn("Use the band's middle (%.2f m)" % ((float(band[0]) + float(band[1])) / 2.0), func(): target_h = (float(band[0]) + float(band[1])) / 2.0; (refs.ts as HSlider).value = target_h, "", 14); hv.add_child(refs.mid)
	_helper(); update_live()

func _helper() -> void:
	if refs.is_empty(): return
	var rig := _rig(); var h := target_h
	var qo := float(rig.Cd) * float(rig.a) * sqrt(2.0 * float(rig.g) * h)
	var pct = app.b.q("valveFor", [snappedf(h, 0.001)])
	var p: float = float(pct) if pct != null else qo / float(rig.qMax) * 100.0
	(refs.steps as Label).text = "1. Outflow at h = %.2f m:  q_out = Cd·a·√(2gh) = %.2f × %.4f × √(2 × %.2f × %.2f) = %s\n2. Inflow must match it:  valve = q_out / q_max = %s / %s = %.1f %%" % [h, float(rig.Cd), float(rig.a), float(rig.g), h, _lps(qo), _lps(qo), _lps(float(rig.qMax)), p]
	var ab := refs.apply as Button
	ab.disabled = p > 100.0
	ab.text = ("Set the valve to %.1f %%" % p) if p <= 100.0 else "More than the supply can give (%.0f %%)" % p
	ab.set_meta("pct", p)

func _apply_helper() -> void:
	var p: float = float((refs.apply as Button).get_meta("pct", 0.0))
	var r: Dictionary = app.b.act("setValve", [clampf(snappedf(p, 0.1), 0.0, 100.0)])
	app.toast(str(r.get("message", "")), "good" if r.get("ok", false) else "bad")

func update_live() -> bool:
	if refs.is_empty() or not refs.has("why") or not is_instance_valid(refs.why): return false
	var f: Dictionary = app.b.q("flows")
	var qi := float(f.get("qIn", 0.0)); var qo := float(f.get("qOut", 0.0)); var h := float(f.get("h", 0.0)); var hs := float(f.get("steady", 0.0)); var held := int(f.get("held", 0)); var need := int(f.get("holdTicks", 10))
	var band: Array = f.get("band", [1.0, 1.2])
	var inb := h >= float(band[0]) and h <= float(band[1])
	if not _drag:
		(refs.slider as HSlider).set_value_no_signal(_valve_pct()); (refs.pct as Label).text = "%.1f %%" % _valve_pct()
	(refs["in"] as Label).text = _lps(qi); (refs["out"] as Label).text = _lps(qo)
	var net := qi - qo
	(refs["net"] as Label).text = ("%+.2f L/s" % (net * 1000.0)); (refs["net"] as Label).label_settings = CbKit.ls(20, CbKit.GR if absf(net) < 2e-5 else (CbKit.ACC if net > 0.0 else CbKit.AM))
	(refs["h"] as Label).text = "%.2f m" % h; (refs["h"] as Label).label_settings = CbKit.ls(20, CbKit.GR if inb else CbKit.TX)
	var rig := _rig()
	(refs["steady"] as Label).text = ("%.2f m" % hs) if hs <= float(rig.H) + 0.5 else "overflow"
	(refs["steady"] as Label).label_settings = CbKit.ls(20, CbKit.RD if hs > float(rig.H) else CbKit.TX)
	(refs["held"] as Label).text = "%d / %d" % [held, need]
	(refs.heldbar as ProgressBar).value = clampf(float(held) / maxf(1.0, float(need)), 0.0, 1.0)
	var trend := "filling" if net > 2e-5 else ("draining" if net < -2e-5 else "balanced")
	(refs.why as Label).text = "Now: %s in, %s out, so the tank is %s (%+.2f L/s). %s" % [_lps(qi), _lps(qo), trend, net * 1000.0, ("It settles at h* = %.2f m." % hs) if hs <= float(rig.H) else "Even the brim cannot balance this inflow: it will overflow."]
	_helper()
	return true
