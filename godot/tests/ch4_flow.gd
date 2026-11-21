extends SceneTree
## Chapter 4 flow (L10-L13), headless with the real engine bridge: each stage reads the engine's ch4Status and its taps and chips send the engine's actions; the work
## order carries the pass lines; the reference designs played through the stages' own presses win with the engine's stars; a locked build refuses.

func _stage(T: Truth, cls) -> Ch4Base:
	var fake := CbApp.new(); fake.b = T.b
	var s: Ch4Base = cls.new(); s.app = fake; s.quiet = true; s.size = Vector2(1366, 768); root.add_child(s)
	return s

func _sync(T: Truth, s: Ch4Base) -> void:
	var st = T.b.q("ch4Status"); var kit = T.b.q("ch4Kit")
	s.refresh(st, kit)
	s.panel = Rect2(Vector2(492, 585), Vector2(671, 168)); s.hits.clear(); s._layout_panel()

func _chip(s: Ch4Base, id: String, arg) -> Dictionary:
	for h in s.hits: if str(h.id) == id and str(h.get("arg", "")) == str(arg): return h
	return {}

func _initialize() -> void:
	var T := Truth.new()
	if not T.start(root): print("CH4-FLOW FAILED engine"); quit(1); return
	CbRegion.refresh(T.b); GridUi.load_strings(); TrayStrings.load_strings()
	var fake := CbApp.new(); fake.b = T.b
	# ---- other levels have no chapter-4 state ----
	T.level("L01"); T.check(not bool(T.b.q("ch4Status").get("active", true)), "L01 has no ch4 state")
	# ---- L10: tap the houses to the reference assignment ----
	T.level("L10")
	var st := _stage(T, Ch4Street); _sync(T, st)
	T.check(st.visible and st.hits.size() == 18 + 3, "L10 stage: 18 houses and 3 neutral chips (%d)" % st.hits.size())
	var conds: Array = WorkOrder.conditions(fake, T.b.q("levelInfo"))
	T.check(conds.any(func(c): return str(c).begins_with("Neutral current ≤")), "work order names the neutral limit (%s)" % str(conds))
	var ref := "cabacacaaabacaabaa"; var PH := ["a", "b", "c"]
	for i in 18:
		var n: int = PH.find(ref[i])
		for k in n:
			var h: Dictionary = {}
			for x in st.hits: if str(x.id) == "house" and int(x.arg) == i: h = x
			st._press(h, Vector2.ZERO); _sync(T, st)
	var s10: Dictionary = T.b.q("ch4Status")
	T.check(int(s10.moved) == 7 and float(s10.iNpct) < 5.0, "7 taps balanced the street: moved %s, iN %s %%" % [str(s10.moved), str(s10.iNpct)])
	st._press(_chip(st, "neutral", 70.0), Vector2.ZERO); T.check(float(T.b.q("ch4Status").neutral.mm2) == 70.0, "the 70 mm2 chip sends setNeutral")
	st._press(_chip(st, "neutral", 54.6), Vector2.ZERO)
	T.b.act("tick", [16]); T.check(str(T.b.g.get("status")) == "won" and int(T.b.g.get("stars", 0)) == 3, "L10 reference through the stage: won with %s lamps" % str(T.b.g.get("stars")))
	T.check(str(T.b.q("levelInfo").lesson).contains("phasor sum"), "L10 shift report carries the phasor sum")
	# ---- L11: bank by chips, count by drag, starter chip ----
	T.level("L11"); var es := _stage(T, Ch4Estate); _sync(T, es)
	es._press(_chip(es, "unit", 100.0), Vector2.ZERO)
	var sl: Dictionary = {}; for x in es.hits: if str(x.kind) == "slider": sl = x
	var tr: Rect2 = es.stepper_parts(sl.rect).track
	es._drag(sl, Vector2(tr.position.x + tr.size.x * 72.0 / 140.0, tr.position.y)); _sync(T, es)
	var s11: Dictionary = T.b.q("ch4Status")
	T.check(s11.bank != null and int(s11.bank.count) == 72 and float(s11.bank.qKvar) > 345.0, "dragging the count to 72 cans: %s kVAr" % str((s11.bank as Dictionary).get("qKvar") if s11.bank != null else "none"))
	es._press(_chip(es, "conn", "D"), Vector2.ZERO); _sync(T, es)
	T.check(bool(T.b.q("ch4Status").bank.burst), "250 V cans in delta show burst")
	es._press(_chip(es, "conn", "Y"), Vector2.ZERO); es._press(_chip(es, "starter", "yd"), Vector2.ZERO)
	T.b.act("tick", [12]); T.check(str(T.b.g.get("status")) == "won", "L11 reference through the stage wins")
	# ---- L12: chips ----
	T.level("L12"); var hy := _stage(T, Ch4Hydro); _sync(T, hy)
	hy._press(_chip(hy, "vref", 1.05), Vector2.ZERO); hy._press(_chip(hy, "redispatch", 20), Vector2.ZERO); _sync(T, hy)
	var s12: Dictionary = T.b.q("ch4Status")
	T.check(float(s12.build.vref) == 1.05 and int(s12.build.reduceMW) == 20 and bool(s12.swing.stable), "L12 chips: V_ref 1.05 and -20 MW hold the swing (peak %s)" % str(s12.swing.peak))
	T.b.act("tick", [10]); T.check(str(T.b.g.get("status")) == "won" and int(T.b.g.get("stars", 0)) == 3, "L12 reference: 3 lamps")
	# ---- L13: text predictions and the slider ----
	T.level("L13"); var ex := _stage(T, Ch4Exam); _sync(T, ex)
	T.check(T.b.q("ch4Status").answers == null, "the answers are hidden before the exam")
	ex.edits.E.text = "1.97"; ex._submit("E"); ex.edits.delta.text = "29.17"; ex._submit("delta"); ex.edits.pmax.text = "1.642"; ex._submit("pmax")
	var sl13: Dictionary = {}; for x in ex.hits: if str(x.kind) == "slider": sl13 = x
	var tr13: Rect2 = ex.stepper_parts(sl13.rect).track
	ex._drag(sl13, Vector2(tr13.position.x + tr13.size.x * (1.047 - 0.5) / 1.5, tr13.position.y)); _sync(T, ex)
	T.check(bool(T.b.q("ch4Status").night.taskDone), "the slider at 1.047 pu absorbs 0.2 pu: Q %s" % str(T.b.q("ch4Status").night.q))
	var e0: float = ex._exc(); var sp: Dictionary = ex.stepper_parts(sl13.rect); var hr := sl13.duplicate(); hr["right"] = true
	ex._press(sl13, (sp.plus as Rect2).get_center()); _sync(T, ex); T.check(absf(ex._exc() - (e0 + 0.01)) < 1e-6, "+ steps E by 0.01 (%s)" % str(ex._exc()))
	ex._press(hr, (sp.minus as Rect2).get_center()); _sync(T, ex); T.check(absf(ex._exc() - (e0 + 0.009)) < 1e-6, "right-click − steps 0.001 (%s)" % str(ex._exc()))
	ex._press(sl13, (sp.minus as Rect2).get_center()); _sync(T, ex); ex._press(hr, (sp.plus as Rect2).get_center()); _sync(T, ex); T.check(absf(ex._exc() - e0) < 1e-6, "and back to %s" % str(e0))
	T.b.act("tick", [6]); T.check(str(T.b.g.get("status")) == "won" and int(T.b.g.get("stars", 0)) == 3, "L13: 3 lamps through the stage")
	T.check(T.b.q("ch4Status").answers != null, "the answers show once the exam is marked")
	T.finish("CH4-FLOW", self)
