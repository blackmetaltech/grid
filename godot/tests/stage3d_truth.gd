extends SceneTree
## Chapter 4's 3D places show the engine's numbers (world3d/stage3d.gd), read back from the scene each builds and from the raw `ch4Status` query:
## L10: each house's service drop starts on the insulator of the phase the engine says it is on, the drop's tag carries that phase's colour, the windows
## are (V / 230)^2 of the voltage at the house's pole (a lower voltage is never brighter), the neutral glows with the neutral current.
## L11: the bank has the engine's can count on each of its three racks, a star bar for star and a ring for delta, red cans and a flare when it bursts,
## the yard lamps follow the bus voltage. L12: one row of towers per circuit (two, three with the third built), a series platform on each only when the
## build has series capacitors, the circuit the trip takes goes dark, the city's windows go out with an unstable swing. L13: the field glows follow E
## (dark with no excitation set). Both: the land reaches 3x the play area past it. Then the input: in 3D only the panel and the houses take the mouse, and
## a click on a house's pixels sends the same assignPhase a tap on the 2D stage did.

class Fake extends CbApp:
	var grid_world = null
	func game_on_changed() -> void: pass
	func toast(_text: String, _level := "info") -> void: pass
	func sfx(_k: String) -> void: pass

const PH := ["a", "b", "c"]

func _initialize() -> void:
	var T := Truth.new()
	if not T.start(root): print("STAGE3D-TRUTH FAILED engine"); quit(1); return
	CbRegion.refresh(T.b); GridUi.load_strings(); TrayStrings.load_strings()
	_l10(T)
	_l11(T)
	_l12(T)
	_l13(T)
	_l23(T)
	_l24(T)
	_l25(T)
	_l26(T)
	_l27(T)
	await _input_pass(T)
	for id in ["L10", "L11", "L12", "L13", "L23", "L24", "L25", "L26", "L27"]: T.check(Stage3D.STAGES.has(id) and not Jobs.is_classic(id), "%s is drawn by the 3D stage: no Classic chip" % id)
	for id in ["L04", "L06"]: T.check(Bench3D.LEVELS.has(id) and not Stage3D.STAGES.has(id), "%s stays with the chapter 2 bench" % id)
	T.finish("STAGE3D-TRUTH", self)

func _status(T: Truth, sg: Stage3D) -> Dictionary:
	var q: Dictionary = T.b.q("ch4Status")
	sg.set_stage(q, 1110.0)
	return q

## Chapter 7: the scene is fed ch7Study, at the minute `mn` (L26 reads its hour from the clock).
func _s7(T: Truth, sg: Stage3D, mn := 1110.0) -> Dictionary:
	var q: Dictionary = T.b.q("ch7Study")
	sg.set_stage(q, mn)
	return q

func _a7(T: Truth, sg: Stage3D, act: String, args: Array, mn := 1110.0) -> Dictionary:
	var r: Dictionary = T.b.act(act, args)
	T.check(bool(r.get("ok", false)), "%s %s accepted: %s" % [act, str(args), str(r.get("message", ""))])
	return _s7(T, sg, mn)

func _run7(T: Truth, sg: Stage3D, mn := 1110.0) -> Dictionary:
	T.b.act("tick", [1])
	return _s7(T, sg, mn)

func _act(T: Truth, sg: Stage3D, act: String, args: Array) -> Dictionary:
	var r: Dictionary = T.b.act(act, args)
	T.check(bool(r.get("ok", false)), "%s %s accepted: %s" % [act, str(args), str(r.get("message", ""))])
	return _status(T, sg)

func _ground(T: Truth, sg: Stage3D, tag: String) -> void:
	var p := sg.play_rect(); var g := sg.ground_rect()
	var m := 3.0 * maxf(p.size.x, p.size.y)
	T.check(p.size.x > 0.0 and g.encloses(p.grow(m)), "%s: the land %s reaches 3x the play area %s past it on every side" % [tag, str(g), str(p)])
	for c in [p.position - Vector2(m, m), p.end + Vector2(m, m), Vector2(p.position.x - m, p.end.y + m), Vector2(p.end.x + m, p.position.y - m)]:
		var h := sg.ground(c.x, c.y)
		T.check(not is_nan(h) and h > -2.0, "%s: ground at %s is land (%f m)" % [tag, str(c), h])

func _l10(T: Truth) -> void:
	T.level("L10")
	var sg := Stage3D.new(); root.add_child(sg)
	var q := _status(T, sg)
	T.check(sg.field != null and sg.scn == "l10", "L10: the street is built")
	for k in ["tx", "neutral", "street"]: T.check(sg.anchors.has(k), "L10: chip anchor %s" % k)
	var rep := sg.report()
	T.check(int(rep.poles) == 6 and int(rep.homes) == 18, "L10: six poles and 18 houses (%d, %d)" % [int(rep.poles), int(rep.homes)])
	# every drop starts on the insulator of the phase the engine says: the start of the wire is that phase's attach point on that house's pole
	var moves := [[0, "b"], [1, "c"], [5, "b"], [8, "c"], [11, "b"], [17, "c"], [3, "a"], [0, "c"], [0, "a"]]
	for mv in moves:
		q = _act(T, sg, "assignPhase", ["H%d" % (int(mv[0]) + 1), str(mv[1])])
		rep = sg.report()
		for i in 18: T.check(str(rep.drop_phase[i]) == str(q.houses[i].phase), "L10: house %d's drop starts on phase %s's insulator (engine %s)" % [i + 1, str(rep.drop_phase[i]), str(q.houses[i].phase)])
		T.check((rep.tags as Array).all(func(x): return x), "L10: every drop's tag carries its phase colour")
	# the windows: (V / 230)^2 of the voltage at the house's pole; lower voltage is never brighter
	for i in 18:
		var ph := str(q.houses[i].phase); var v := float((q.vLevels[ph] as Array)[2 + i / 3])
		T.near(float(rep.window_e[i]), Bench3D.bulb_brightness(v, float(q.nominalV)) * Bench3D.WINDOW_E, 1e-5, "L10: house %d's window is (V/230)^2 at %.1f V" % [i + 1, v])
	var vs: Array = []; for i in 18: vs.append(float((q.vLevels[str(q.houses[i].phase)] as Array)[2 + i / 3]))
	var order_ok := true
	for i in 18: for j in 18: if vs[i] < vs[j] - 1e-6 and float(rep.window_e[i]) > float(rep.window_e[j]) + 1e-6: order_ok = false
	T.check(order_ok, "L10: a house at a lower voltage is never brighter")
	# the neutral: all on one phase heats it, the reference spread leaves it cool
	T.level("L10"); q = _status(T, sg)
	var naive := float(sg.report().neutral_glow); var in_naive := float(q.iNpct)
	T.near(naive, 7.0 * pow(Stage3D.neutral_heat(float(q.iNpct), float(q.neutral.loadPct)), 1.3), 1e-5, "L10: the neutral's glow is the mapped heat at %.1f %% (naive)" % in_naive)
	var ref := "cabacacaaabacaabaa"
	for i in 18:
		if ref[i] != "a": q = _act(T, sg, "assignPhase", ["H%d" % (i + 1), str(ref[i])])
	var balanced := float(sg.report().neutral_glow)
	T.check(float(q.iNpct) < in_naive and balanced < naive, "L10: balancing cools the neutral (%.1f -> %.1f %%, glow %.2f -> %.2f)" % [in_naive, float(q.iNpct), naive, balanced])
	T.check(Stage3D.neutral_heat(0.0, 0.0) == 0.0 and Stage3D.neutral_heat(10.0, 50.0) < Stage3D.neutral_heat(40.0, 50.0) and Stage3D.neutral_heat(5.0, 120.0) == 1.0, "L10: neutral heat is 0 at 0 %, rising, full past the rating")
	_ground(T, sg, "L10")
	sg.free()

func _l11(T: Truth) -> void:
	T.level("L11")
	var sg := Stage3D.new(); root.add_child(sg)
	var q := _status(T, sg)
	for k in ["motors", "bank", "pump", "bus"]: T.check(sg.anchors.has(k), "L11: chip anchor %s" % k)
	T.check(Array(sg.report().cans) == [0, 0, 0], "L11: no bank, no cans")
	for n in [1, 20, 72, 140]:
		q = _act(T, sg, "setBank", [100.0, n, "Y", 440.0])
		var rep := sg.report()
		T.check(Array(rep.cans) == [int(q.bank.count), int(q.bank.count), int(q.bank.count)] and int(q.bank.count) == n, "L11: %d cans on each of the three racks (engine %d)" % [n, int(q.bank.count)])
		T.check(bool(rep.star), "L11: star wiring at %d cans" % n)
	q = _act(T, sg, "setBank", [100.0, 72, "D", 440.0])
	T.check(not bool(sg.report().star) and str(q.bank.conn) == "D", "L11: delta is a ring, no star bar")
	T.check(not bool(sg.report().burst), "L11: 440 V cans in delta do not burst")
	q = _act(T, sg, "setBank", [100.0, 72, "D", 250.0])
	var rep2 := sg.report()
	T.check(bool(q.bank.burst) and bool(rep2.burst) and (rep2.can_col as Color).r > (rep2.can_col as Color).b + 0.2, "L11: 250 V cans in delta burst: red cans and a flare (%s, %s, %s)" % [str(q.bank.burst), str(rep2.burst), str(rep2.can_col)])
	q = _act(T, sg, "setBank", [100.0, 72, "Y", 250.0])
	T.check(not bool(q.bank.burst) and not bool(sg.report().burst), "L11: in star the same cans hold")
	T.near(float(sg.report().lamp_e), Bench3D.bulb_brightness(float(q.vBusPu), 1.0) * Stage3D.LAMP_E, 1e-5, "L11: the yard lamps follow the bus (%.3f pu)" % float(q.vBusPu))
	_ground(T, sg, "L11")
	sg.free()

func _l12(T: Truth) -> void:
	T.level("L12")
	var sg := Stage3D.new(); root.add_child(sg)
	var q := _status(T, sg)
	for k in ["plant", "line", "city", "dam"]: T.check(sg.anchors.has(k), "L12: chip anchor %s" % k)
	var rep := sg.report()
	T.check(int(rep.circuits) == int(q.circuits) and int(q.circuits) == 2, "L12: two circuits over the ridge (engine %d)" % int(q.circuits))
	T.check(int(q.build.seriesPct) == 0 and int(rep.platforms) == 0, "L12: no series capacitors, no platforms")
	q = _act(T, sg, "setSeriesComp", [30.0]); rep = sg.report()
	T.check(int(rep.platforms) == int(q.circuits) and sg.anchors.has("series"), "L12: a series platform on each circuit at 30 %% (%d)" % int(rep.platforms))
	q = _act(T, sg, "addCircuit", [true]); rep = sg.report()
	T.check(int(q.circuits) == 3 and int(rep.circuits) == 3 and int(rep.platforms) == 3, "L12: the third circuit adds a row of towers and a platform (%d, %d)" % [int(rep.circuits), int(rep.platforms)])
	T.check(not (rep.dark as Array).any(func(x): return x) and float(rep.city_e) > 1.0, "L12: nothing tripped: every circuit lit, the city lit")
	q = _act(T, sg, "addCircuit", [false]); q = _act(T, sg, "setSeriesComp", [0.0])
	# run the clock to the trip
	var guard := 0
	while not bool(q.fired) and guard < 40: T.b.act("tick", [1]); q = _status(T, sg); guard += 1
	rep = sg.report()
	T.check(bool(q.fired), "L12: the engine's trip happened")
	var n := int(q.circuits)
	var dk: Array = rep.dark
	T.check(bool(dk[n - 1]) and not bool(dk[0]), "L12: the tripped circuit is dark, the other is not (%s)" % str(dk))
	var gl: Array = rep.glows
	T.check(float(gl[n - 1]) == 0.0 and float(gl[0]) > 0.0, "L12: the dark circuit does not glow, the other does (%s)" % str(gl))
	var blackout: bool = bool(q.fired) and not bool(q.swing.stable)
	T.check((float(rep.city_e) < 1.0) == blackout, "L12: the city's windows are dark exactly when the swing is unstable (%s, %.2f)" % [str(q.swing.stable), float(rep.city_e)])
	_ground(T, sg, "L12")
	sg.free()

func _l13(T: Truth) -> void:
	T.level("L13")
	var sg := Stage3D.new(); root.add_child(sg)
	var q := _status(T, sg)
	for k in ["gen", "exciter"]: T.check(sg.anchors.has(k), "L13: chip anchor %s" % k)
	T.check(q.night.excitation == null and float(sg.report().field) == 0.0, "L13: no excitation set, a dark field")
	var prev := -1.0; var prev_x := -1.0
	for e in [0.6, 1.0, 1.25, 1.5, 2.0]:
		q = _act(T, sg, "setExcitation", [e])
		var rep := sg.report()
		T.near(float(rep.field), Stage3D.field_glow(float(q.night.excitation), true), 1e-9, "L13: the field glow is the mapped E at %.2f pu" % e)
		T.check(float(rep.gap_glow) > prev and float(rep.exciter_glow) > prev_x and float(rep.shoe_e) > 0.0, "L13: the air gap and the exciter glow more at E = %.2f" % e)
		prev = float(rep.gap_glow); prev_x = float(rep.exciter_glow)
	T.check(Stage3D.field_glow(0.5, true) == 0.0 and Stage3D.field_glow(2.0, true) == 1.0 and Stage3D.field_glow(1.0, false) == 0.0, "L13: field glow is 0 at 0.5 pu, 1 at 2.0 pu, 0 with no E")
	_ground(T, sg, "L13")
	sg.free()

func _l23(T: Truth) -> void:
	T.level("L23")
	var sg := Stage3D.new(); root.add_child(sg)
	var q := _s7(T, sg)
	T.check(sg.field != null and sg.scn == "l23", "L23: the substation is built")
	for k in ["incomer", "xfmr", "board", "coupler", "gens", "feeder", "estate"]: T.check(sg.anchors.has(k), "L23: chip anchor %s" % k)
	var rep := sg.report()
	T.check(int(rep.kiosks) == 6 and not bool(rep.coupler_open) and int(rep.reactor_rings) == 0, "L23: six breakers, the coupler closed, no reactor")
	T.check(float(rep.estate_e) > 1.0 and (rep.smoke as Array).is_empty(), "L23: before the run the estate is lit and no breaker smokes")
	q = _a7(T, sg, "setBusCoupler", [true]); rep = sg.report()
	T.check(bool(rep.coupler_open) == (str(q.design.coupler) == "open") and bool(rep.coupler_open), "L23: an open coupler shows its gap")
	q = _a7(T, sg, "setBusCoupler", [false])
	for rx in [0.1, 0.2, 0.0]:
		q = _a7(T, sg, "setSeriesReactor", [rx]); rep = sg.report()
		var want := 0 if rx == 0.0 else 2 + int(roundf(rx * 20.0))
		T.check(int(rep.reactor_rings) == want and not bool(rep.coupler_open), "L23: a reactor of %.1f pu is a coil of %d rings (%d)" % [rx, want, int(rep.reactor_rings)])
	q = _a7(T, sg, "setSeriesReactor", [0.2]); q = _a7(T, sg, "setBusCoupler", [true]); rep = sg.report()
	T.check(int(rep.reactor_rings) == 0, "L23: an open coupler carries no reactor")
	q = _a7(T, sg, "setBusCoupler", [false]); q = _a7(T, sg, "setSeriesReactor", [0.0])
	q = _run7(T, sg); rep = sg.report()
	var n_over := 0
	for dd in q.duty:
		T.check(bool(rep.over[str(dd.id)]) == bool(dd.over), "L23: breaker %s is red exactly when it is over its duty (%.1f kA)" % [str(dd.id), float(dd.kA)])
		if bool(dd.over): n_over += 1
	T.check(n_over > 0 and (rep.smoke as Array).size() == n_over, "L23: the naive board has %d breakers over their duty and they smoke (%s)" % [n_over, str(rep.smoke)])
	T.check(not bool(q.ok) and float(rep.estate_e) == 0.0, "L23: the estate's windows are dark when the engine says the board fails")
	T.level("L23"); sg.set_stage(T.b.q("ch7Study"), 1110.0)
	q = _a7(T, sg, "setBreakerRating", [40.0]); q = _run7(T, sg); rep = sg.report()
	T.check(bool(q.ok) and (rep.smoke as Array).is_empty() and float(rep.estate_e) > 1.0, "L23: a 40 kA board holds: no smoke, the estate lit")
	_ground(T, sg, "L23")
	sg.free()

func _l24(T: Truth) -> void:
	T.level("L24")
	var sg := Stage3D.new(); root.add_child(sg)
	var q := _s7(T, sg)
	for k in ["R1", "R2", "R3", "R4", "fault"]: T.check(sg.anchors.has(k), "L24: chip anchor %s" % k)
	var rep := sg.report()
	T.check(int(rep.relays) == 4 and int(rep.posts) == (q.faults as Array).size(), "L24: four relay kiosks and a post for each of the %d faults" % (q.faults as Array).size())
	for k in 4: T.check((rep.cols[k] as Color).is_equal_approx(Stage7.RELAY_COL[k]), "L24: kiosk R%d is the chart's colour for R%d" % [k + 1, k + 1])
	q = _run7(T, sg); rep = sg.report()
	for i in (q.faults as Array).size():
		var f: Dictionary = q.faults[i]; var best := 1e9; var op := -1
		for j in (f.times as Array).size(): if f.times[j] != null and float(f.times[j]) < best: best = float(f.times[j]); op = j
		T.check(int(rep.opener[i]) == op, "L24: for %s the breaker that opens is R%d (the engine's quickest, %.3f s)" % [str(f.id), op + 1, best])
	var burnt := [false, false, false, false]
	for f in q.faults: if bool(f.burnt): burnt[int(f.section) - 1] = true
	T.check(Array(rep.burnt) == burnt, "L24: a section glows exactly when a fault burns its conductor (%s)" % str(burnt))
	_ground(T, sg, "L24")
	sg.free()

func _l25(T: Truth) -> void:
	T.level("L25")
	var sg := Stage3D.new(); root.add_child(sg)
	var q := _s7(T, sg)
	for k in ["gen", "breaker", "fault", "line"]: T.check(sg.anchors.has(k), "L25: chip anchor %s" % k)
	T.check(int(sg.report().clear_ms) == int(q.clearMs), "L25: the breaker bay clears at the engine's %d ms" % int(q.clearMs))
	for cy in [2, 5, 3]:
		q = _a7(T, sg, "setBreakerCycles", [cy])
		T.check(int(sg.report().clear_ms) == int(q.clearMs), "L25: with %d-cycle breakers it clears at %d ms (scene %d)" % [cy, int(q.clearMs), int(sg.report().clear_ms)])
	sg._t = 0.1; Stage7.process(sg, 0.0)
	T.check(not bool(sg.report().breaker_open) and absf(float(sg.report().marker)) < 1e-6, "L25: before the run the breaker is closed and the rotor marker at rest")
	q = _run7(T, sg)
	var cs := float(q.clearMs) / 1000.0
	sg._t = maxf(cs * 0.5, 0.001); Stage7.process(sg, 0.0)
	T.check(not bool(sg.report().breaker_open), "L25: before the clearing time (%.0f ms) the breaker is still closed" % (cs * 1000.0))
	var m_half := float(sg.report().marker)
	T.check(m_half > float(q.delta0Deg) - 1e-6 and m_half < float(q.clearAtDeg) + 1e-6, "L25: the rotor marker runs ahead between the engine's start angle %.1f and its angle at clearing %.1f (%.1f)" % [float(q.delta0Deg), float(q.clearAtDeg), m_half])
	sg._t = cs + 0.05; Stage7.process(sg, 0.0)
	T.check(bool(sg.report().breaker_open), "L25: after the clearing time the breaker has opened")
	sg._t = cs + 1.0; Stage7.process(sg, 0.0)
	T.near(float(sg.report().marker), float(q.peakDeg), 1e-6, "L25: a second after clearing the marker is at the engine's peak %.1f deg" % float(q.peakDeg))
	_ground(T, sg, "L25")
	sg.free()

func _l26(T: Truth) -> void:
	T.level("L26")
	var sg := Stage3D.new(); root.add_child(sg)
	var q := _s7(T, sg, 720.0)
	for k in ["control", "coalsub", "coalsc", "ccgt", "ocgt", "hydro", "solar", "corridor"]: T.check(sg.anchors.has(k), "L26: chip anchor %s" % k)
	var rep := sg.report()
	T.check(int(rep.hour) == 12, "L26: the scene reads hour 12 from the clock")
	var smax := 1.0; for v in q.solarMW: smax = maxf(smax, float(v))
	T.near(float(rep.share.solar), clampf(float((q.solarMW as Array)[12]) / smax, 0.0, 1.0), 1e-6, "L26: the solar field glows with the engine's solar MW at noon")
	T.near(float(rep.share.hydro), clampf(float((q.hydroMW as Array)[12]) / 200.0, 0.0, 1.0), 1e-6, "L26: the hydro plant follows the engine's hydro MW")
	for id in Stage7.PLANTS: T.check(float(rep.share[id]) == 0.0, "L26: before the run the %s plant is cold" % id)
	var dmax := 1.0; for v in q.demandMW: dmax = maxf(dmax, float(v))
	T.near(float(rep.dem), clampf(float((q.demandMW as Array)[12]) / dmax, 0.0, 1.0), 1e-6, "L26: the city's windows follow demand")
	q = _run7(T, sg, 720.0); rep = sg.report()
	var any_on := false
	for p in q.plants:
		var id := str(p.id); var want := clampf(float(q.hourly.p[id][12]) / float(p.pMax), 0.0, 1.0)
		T.near(float(rep.share[id]), want, 1e-6, "L26: %s runs at %.2f of its rating at noon (engine %.0f MW)" % [id, want, float(q.hourly.p[id][12])])
		if want > 0.0: any_on = true
	T.check(any_on, "L26: some thermal plant is running at noon")
	q = _s7(T, sg, 1200.0); rep = sg.report()
	for p in q.plants: T.near(float(rep.share[str(p.id)]), clampf(float(q.hourly.p[str(p.id)][20]) / float(p.pMax), 0.0, 1.0), 1e-6, "L26: at 20:00 %s follows the engine's hour 20" % str(p.id))
	T.near(float(rep.flow), 0.0 if bool(rep.tripped) else clampf(absf(float(q.hourly.flow[20])) / float(q.corridorMW), 0.0, 1.2), 1e-6, "L26: the corridor glows with the hour's flow (dark if tripped)")
	_ground(T, sg, "L26")
	sg.free()

func _l27(T: Truth) -> void:
	T.level("L27")
	var sg := Stage3D.new(); root.add_child(sg)
	var q := _s7(T, sg)
	for k in ["board", "coupler", "feeder", "units"]: T.check(sg.anchors.has(k), "L27: chip anchor %s" % k)
	var rep := sg.report()
	for k in 3: T.near(float(rep.unit_share[k]), clampf(float(q.design.dispatch[k]) / float(q.units[k].pMax), 0.0, 1.0), 1e-6, "L27: unit %d's steam follows its dispatch" % (k + 1))
	var a := float(q.units[0].pMax) * 0.5; var b := float(q.units[1].pMax) * 0.5; var c := float(q.units[2].pMax) * 0.5
	q = _a7(T, sg, "setDispatch3", [a, b, c]); rep = sg.report()
	for k in 3: T.near(float(rep.unit_share[k]), 0.5, 1e-6, "L27: unit %d at half its rating shows half" % (k + 1))
	q = _run7(T, sg); rep = sg.report()
	T.check((rep.smoke as Array).is_empty() == bool(q.ratingOk), "L27: the breakers smoke exactly when the rating is short (ratingOk %s)" % str(q.ratingOk))
	_ground(T, sg, "L27")
	sg.free()

## In 3D the stage lets the mouse through to the world and only the panel and the houses keep it; a click on a house sends the 2D tap's action; with no 3D place the whole stage keeps it.
func _input_pass(T: Truth) -> void:
	T.level("L10")
	var app := Fake.new(); app.b = T.b; app.started = true
	var st := Ch4Street.new(); st.app = app; st.quiet = true; root.add_child(st); st.size = Vector2(1366, 768)
	await process_frame
	st.refresh(T.b.q("ch4Status"), T.b.q("ch4Kit"))
	st.panel = Rect2(Vector2(492, 585), Vector2(671, 168)); st.hits.clear(); st._layout_panel()
	var stage := Vector2(683, 300); var chip: Vector2 = Vector2(520, 640)
	T.check(st._has_point(stage) and st._has_point(chip), "classic: the opaque stage takes the mouse everywhere")
	var wv := WorldView.new(); root.add_child(wv); wv.size = Vector2(1366, 768)
	var sg := Stage3D.new(); root.add_child(sg)
	sg.set_stage(T.b.q("ch4Status"), 1110.0); sg.visible = true; sg.canvas_size = Vector2(1366, 768)
	sg.set_camera_spec("yaw=-30,pitch=13,dist=130,x=10,z=6")
	wv.look3d = sg; app.grid_world = wv
	st._process(0.016)
	T.check(not st._has_point(stage), "3D: a press on the open stage goes to the world")
	T.check(st._has_point(chip), "3D: a press on the panel stays with the panel")
	var r: Rect2 = sg.house_rect(4)
	T.check(r.size.x > 4.0 and r.size.y > 4.0, "3D: house 5 projects to a rect on the screen %s" % str(r))
	var c := st._to_local(r.get_center())
	T.check(st._has_point(c), "3D: a press on a house stays with the stage (%s)" % str(c))
	T.check(str(st.hit_at(c).get("id", "")) == "house" and int(st.hit_at(c).get("arg", -1)) == 4, "3D: the press lands on house 5's tap (%s)" % str(st.hit_at(c)))
	var before := str(T.b.q("ch4Status").houses[4].phase)
	var ev := InputEventMouseButton.new(); ev.button_index = MOUSE_BUTTON_LEFT; ev.pressed = true; ev.position = c
	st._gui_input(ev)
	var after := str(T.b.q("ch4Status").houses[4].phase)
	T.check(before == "a" and after == "b", "3D: clicking the house moves its drop a -> b, as the 2D tap did (%s -> %s)" % [before, after])
	st.refresh(T.b.q("ch4Status"), T.b.q("ch4Kit"))   # the host's refresh after every action
	var right := InputEventMouseButton.new(); right.button_index = MOUSE_BUTTON_RIGHT; right.pressed = true; right.position = c
	st._gui_input(right)
	T.check(str(T.b.q("ch4Status").houses[4].phase) == "a", "3D: right-click moves it back")
	st.free(); wv.free(); sg.free()
