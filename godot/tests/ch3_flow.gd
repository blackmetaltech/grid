extends SceneTree
## Chapter 3 flow (headless, real engine bridge): L08 the bank's reactor knob steps along the engine's allowed shares and the tray places a detuned bank; the instrument card reads the engine's
## `harmonics` what-if (spectrum, resonance peak, bank current); L09 the series-capacitor cells are the palette's shares and a pick on the line lands in the engine; the card reads `seriesInfo`;
## L07 the card shows the feeder phasor; the work order lists the chapter's pass conditions.

func _initialize() -> void:
	var T := Truth.new()
	if not T.start(root): print("CH3-FLOW FAILED engine"); quit(1); return
	CbRegion.refresh(T.b); GridUi.load_strings(); TrayStrings.load_strings()
	var world := WorldView.new(); world.size = Vector2(1400, 800); root.add_child(world)
	var radio := RadioLog.new(); root.add_child(radio)
	var ins := Instruments.new(); root.add_child(ins)
	var tray := GridTray.new(); tray.b = T.b; tray.world = world; tray.radio = radio; tray.instruments = ins
	root.add_child(tray); tray.size = Vector2(1100.0, 96.0)
	var sync := func(): world.refresh(T.b); tray.refresh()
	# ---- L08 ----
	T.level("L08"); sync.call()
	T.check(tray.visible, "the grid tray shows on L08")
	var cell: int = tray.place_index("placeBank", "cap-11-300")
	T.check(cell >= 0 and tray.items[cell].icon == "capacitor", "a cell for the 300 kVAr bank part")
	T.check(tray.items.filter(func(i): return i.kind == "knob").map(func(i): return i.id) == ["steps", "detune"], "knob cells: steps and the reactor share")
	var seen: Array = [tray.knob_text("detune")]
	for k in 3: tray.step_knob("detune", 1); seen.append(tray.knob_text("detune"))
	T.check(seen == ["plain", "filter 4.7", "7 %", "14 %"], "the reactor knob steps along the allowed shares: %s" % str(seen))
	tray.step_knob("detune", 1); T.check(tray.knob_text("detune") == "7 %", "and turns back at the end (a click is never dead)")
	tray.step_knob("detune", -1)
	tray.knobs.steps = 3
	tray.activate(cell); var r: Dictionary = tray.press_target("B2"); sync.call()
	T.check(r.get("ok", false), "press B2 places the detuned bank: %s" % str(r.get("message", r)))
	var sh: Array = T.b.g.shunts
	T.check(sh.size() == 1 and int(sh[0].steps) == 3 and absf(float(sh[0].detunePct) - 4.53) < 1e-9 and str(sh[0].bus) == "B2", "the engine has C1: 900 kVAr with a 4.53 %% reactor at B2: %s" % str(sh))
	var h = T.b.q("harmonics")
	T.check(h is Dictionary and bool(h.get("ready", false)) and (h.bars as Array).size() == 4 and (h.sweep as Array).size() > 50, "the harmonics query has four bars and the impedance sweep")
	T.check(not bool(h.asIf) and (h.banks as Array).size() == 1 and float(h.banks[0].ratio) < 1.3 and float(h.thdPct) < 5.0, "the filter bank (switched in as if) passes the what-if: THD %.2f, ratio %.2f" % [float(h.thdPct), float(h.banks[0].ratio)])
	var panel := Ch3Panel.new(); panel.app = null; root.add_child(panel)
	panel.mode = "harm"; panel.d = h; panel.size = Vector2(300, 392); panel.visible = true
	T.check(Ch3Panel.mode_of("L07") == "pf" and Ch3Panel.mode_of("L08") == "harm" and Ch3Panel.mode_of("L09") == "series" and Ch3Panel.mode_of("L05") == "", "the card's mode follows the level")
	tray.cancel_key()
	# ---- L09 ----
	T.level("L09"); sync.call()
	var parts: Array = T.b.q("palette").actions.filter(func(a): return a.action == "placeSeriesCap")[0].parts
	T.check(tray.items.filter(func(i): return i.kind == "place").map(func(i): return i.action) == ["placeSeriesCap", "placeSeriesCap", "placeSeriesCap", "placeSeriesCap", "placeSeriesCap"] and parts.size() == 5, "five series-capacitor cells, the palette's shares")
	var c55: int = tray.place_index("placeSeriesCap", "55.0")
	T.check(c55 >= 0 and tray.caption(tray.items[c55]) == ["Series cap", "55 %"], "caption of the 55 %% cell: %s" % str(tray.caption(tray.items[c55]) if c55 >= 0 else []))
	tray.activate(c55); T.check(tray.mode == "pick" and world.peg_count() == 1, "the line is the only peg (%d)" % world.peg_count())
	var r2: Dictionary = tray.press_target("T1"); sync.call()
	T.check(r2.get("ok", false), "pick the line: %s" % str(r2.get("message", r2)))
	var si = T.b.q("seriesInfo")
	T.check(si is Dictionary and int(si.pct) == 55 and absf(float(si.xcOhm) - 0.55 * float(si.xlOhm)) < 0.02 and not bool(si.faultDone), "seriesInfo: 55 %% of X_L, fault not yet: %s" % str(si))
	# ---- L07 ----
	T.level("L07"); sync.call()
	var ph = T.b.q("feederPeak")
	T.check(ph is Dictionary and bool(ph.get("active", false)) and int(ph.iA) > 100 and int(ph.ratedA) == 115 and float(ph.pf) < 0.8, "feederPeak reads before Run: %s" % str(ph))
	# ---- a bank beside the generator's building wins the tap ----
	T.level("L07"); sync.call()
	tray.activate(tray.place_index("placeShunt", "cap-11-900")); tray.press_target("B1"); sync.call(); tray.cancel_key()
	var btile: Vector2 = Vector2.ZERO; var utile: Vector2 = Vector2.ZERO
	for e in tray.elements("shunt"): btile = e.tile
	for e in tray.elements("unit"): utile = e.tile
	var bp: Vector2 = world.world_to_screen(btile, 14.0); var up: Vector2 = world.world_to_screen(utile, 14.0)
	var hit: Dictionary = tray.op_target_at(bp.lerp(up, 0.6))
	T.check(str(hit.get("kind", "")) == "shunt", "a tap closer to the generator under it than to the bank opens the bank's tag: %s" % str(hit))
	# ---- work order lines ----
	T.level("L08")
	var li = T.b.q("levelInfo"); var th: Dictionary = li.thresholds
	T.check(th.has("thdMaxPct") and GridStrings.S.has("TH_thdMaxPct") and GridStrings.S.has("TH_capRmsMax") and GridStrings.S.has("TH_pfPeakMin") and GridStrings.S.has("TH_farVMinPu"), "every chapter 3 threshold has its TH_ string")
	T.finish("CH3-FLOW", self)
