extends SceneTree
## Chapter 8 flow (L31-L36), headless with the real engine bridge: each level's stage and panel build from the engine's ch8Study / ch8Kit, the panel's chips send the engine's actions
## (the reference design of the level file is pressed chip by chip), stepping the clock wins the level, L36's why card sends answerWhy and its boxes send the predictions, and the
## panel fits the phone layout rect.
func _stage(T: Truth, cls) -> Ch8Base:
	var fake := CbApp.new(); fake.b = T.b
	var s: Ch8Base = cls.new(); s.app = fake; s.quiet = true; s.size = Vector2(1920, 1080); root.add_child(s)
	return s

func _sync(T: Truth, s: Ch8Base) -> void:
	s.refresh(T.b.q("ch8Study"), T.b.q("ch8Kit"))
	s.panel = Rect2(Vector2(588, 882), Vector2(1112, 184)); s.hits.clear(); s._layout_panel()

func _press(T: Truth, s: Ch8Base, id: String, arg) -> bool:
	for h in s.hits:
		if str(h.id) == id and str(h.get("arg", "")) == str(arg):
			s._press(h, Vector2.ZERO); _sync(T, s); return true
	T.check(false, "%s: no chip %s/%s" % [s.scenario, id, str(arg)]); return false

func _won(T: Truth, id: String, label: String) -> void:
	T.b.act("tick", [2])
	T.check(str(T.b.g.get("status")) == "won", "%s: %s wins (status %s)" % [id, label, str(T.b.g.get("status"))])

## The phone: a 2424 x 1080 screen; every chip and box of the panel sits inside the panel rect, and the scaled panel sits inside the slot width.
func _phone_fit(T: Truth, s: Ch8Base) -> void:
	CbLayout.kind = "phone"; s.size = Vector2(2424, 1080); s.layout(); s.queue_redraw()
	var pr := Rect2(s.panel.position, Vector2(Ch4Base.PANEL_VW, Ch4Base.PANEL_H))
	var bad := 0
	for h in s.hits:
		if str(h.id) == "fold": continue
		if not pr.grow(0.5).encloses(h.rect): bad += 1; print("  outside: ", s.scenario, " ", h.id, " ", h.rect, " in ", pr)
	T.check(bad == 0 and s.hits.size() > 0, "%s phone: all %d chips inside the 660 x 184 panel (%d outside)" % [s.scenario, s.hits.size(), bad])
	for k in s.edits:
		var e: LineEdit = s.edits[k]
		if e.visible: T.check(Rect2(e.position, e.size * e.scale).size.x > 0.0 and s._unscr(e.position).x >= pr.position.x - 0.5 and s._unscr(e.position + e.size * e.scale).x <= pr.end.x + 0.5 and s._unscr(e.position + e.size * e.scale).y <= pr.end.y + 0.5, "%s phone: box %s inside the panel" % [s.scenario, k])
	T.check(s._sc >= 0.5 and s._sc <= 1.0, "%s phone: the panel scale is %s" % [s.scenario, str(s._sc)])
	CbLayout.kind = "desktop"; s.size = Vector2(1920, 1080); s.layout()

func _initialize() -> void:
	var T := Truth.new()
	if not T.start(root): print("CH8-FLOW FAILED engine"); quit(1); return
	CbRegion.refresh(T.b); GridUi.load_strings()
	T.check(TranslationServer.translate("C8_LAMP_PCT").begins_with("Worst"), "L36 lamp names the worst error, which the engine scores (11-28b B19)")
	T.level("L01"); T.check(not bool(T.b.q("ch8Study").get("active", true)), "L01 has no ch8 state")
	# the host hides itself on a level that is not chapter 8 and picks the stage by scenario
	var host := Ch8Host.new(); var happ := CbApp.new(); happ.b = T.b; host.app = happ; host.build(); root.add_child(host)
	T.check(host.stages.size() == 6 and host.stages.has("L31") and host.stages.has("L36"), "the host holds the six stages")
	# ---- L31: Dog on N1-N2, Rabbit on N3, taps 0 / 2.5 / 2.5 / 5 / 5 ----
	T.level("L31"); var s := _stage(T, Ch8Long); _sync(T, s)
	T.check(s.visible and s.hits.size() == 22, "L31 stage: 22 chips (%d)" % s.hits.size())
	T.check(str(T.b.q("ch8Study").voltage.ok) == "false", "L31: the idle design is out of band")
	for n in ["N1", "N2"]: _press(T, s, "sect", n); _press(T, s, "wire", "Dog")
	_press(T, s, "sect", "N3"); _press(T, s, "wire", "Rabbit")
	for p in [["N2", 2.5], ["N3", 2.5], ["N4", 5.0], ["N5", 5.0]]: _press(T, s, "sect", p[0]); _press(T, s, "tap", p[1])
	var s31: Dictionary = T.b.q("ch8Study"); T.check(str(s31.design.cond) == '["Dog", "Dog", "Rabbit", "Weasel", "Weasel"]' and bool(s31.voltage.ok), "L31: the chips built the reference (%s, ok %s)" % [str(s31.design.cond), str(s31.voltage.ok)])
	T.check(not s._act("placeRegulator", ["N5", 1.0]) and s.last_msg != "", "L31: a refused action leaves the engine's message for the radio (%s)" % s.last_msg)
	_press(T, s, "sect", "N2"); _press(T, s, "regat", "N2"); T.check(s.last_msg != "" and T.b.q("ch8Study").regulator != null, "L31: the regulator chip places a regulator")
	_press(T, s, "regoff", ""); T.check(T.b.q("ch8Study").regulator == null, "L31: the off chip removes it")
	await process_frame; await process_frame
	_phone_fit(T, s)
	_won(T, "L31", "the reference design")
	# ---- L32: fuses, tie, T2 manual, T3 remote ----
	T.level("L32"); s = _stage(T, Ch8Reliab); _sync(T, s)
	T.check(s.visible and s.hits.size() == 10, "L32 stage: 10 chips (%d)" % s.hits.size())
	_press(T, s, "kind", "manual"); _press(T, s, "site", "T2"); _press(T, s, "kind", "remote"); _press(T, s, "site", "T3")
	for p in ["P1", "P2", "P3"]: _press(T, s, "fuse", p)
	_press(T, s, "tie", "")
	var s32: Dictionary = T.b.q("ch8Study"); T.check(str(s32.design.sect.T2) == "manual" and str(s32.design.sect.T3) == "remote" and bool(s32.design.tie) and float(s32.indices.saidi) < float(s32.targets.saidiMax), "L32: the chips built the reference (SAIDI %s)" % str(s32.indices.saidi))
	_press(T, s, "kind", "none"); _press(T, s, "site", "T4")
	await process_frame; await process_frame
	_phone_fit(T, s)
	_won(T, "L32", "the reference design")
	# ---- L33: recloser fast 0.05, links 65 / 65 / 40 ----
	T.level("L33"); s = _stage(T, Ch8Tcc); _sync(T, s)
	T.check(s.visible and s.hits.size() == 36, "L33 stage: 36 chips (%d)" % s.hits.size())
	T.check(str(T.b.q("ch8Study").kind) == "miscoordination", "L33: the idle design miscoordinates")
	_press(T, s, "pu", 200.0); _press(T, s, "ft", 0.05); _press(T, s, "st", 3.0); _press(T, s, "sh", 2.0)
	_press(T, s, "link:S1", 65.0); _press(T, s, "link:S2", 65.0); _press(T, s, "link:S3", 40.0)
	var s33: Dictionary = T.b.q("ch8Study"); T.check(s33.kind == null and float(s33.marginS) > 0.2, "L33: the chips coordinate the curves (margin %s)" % str(s33.marginS))
	await process_frame; await process_frame
	_phone_fit(T, s)
	_won(T, "L33", "the reference design")
	# ---- L34: 24 MVA units, remote tie, large demand response ----
	T.level("L34"); s = _stage(T, Ch8Subst); _sync(T, s)
	T.check(s.visible and s.hits.size() == 10, "L34 stage: 10 chips (%d)" % s.hits.size())
	T.check(bool(T.b.q("ch8Study").overheat), "L34: the idle design overheats")
	_press(T, s, "size", 24.0); _press(T, s, "tie", "remote"); _press(T, s, "dr", "large")
	var s34: Dictionary = T.b.q("ch8Study"); T.check(not bool(s34.overheat) and not bool(s34.notRestored), "L34: the chips keep the survivor under 140 C (%s C)" % str(s34.hotPeakC))
	await process_frame; await process_frame
	_phone_fit(T, s)
	_won(T, "L34", "the reference design")
	# ---- L35: 3000 kW, set point 1.04, volt-var ----
	T.level("L35"); s = _stage(T, Ch8Sun); _sync(T, s)
	T.check(s.visible and s.hits.size() == 14, "L35 stage: 14 chips (%d)" % s.hits.size())
	_press(T, s, "pv", 3000.0); _press(T, s, "oltc", 1.04); _press(T, s, "vv", "")
	var s35: Dictionary = T.b.q("ch8Study"); T.check(bool(s35.design.voltVar) and is_equal_approx(float(s35.design.oltcSetPu), 1.04), "L35: the chips set the tap changer and volt-var")
	if not bool(s35.ok): _press(T, s, "head", "Hyena")
	await process_frame; await process_frame
	_phone_fit(T, s)
	_won(T, "L35", "the reference design")
	# ---- L36: three boxes and the why card ----
	T.level("L36"); s = _stage(T, Ch8Exam); _sync(T, s)
	T.check(s.visible and s.hits.size() == 3 and not bool(T.b.q("ch8Study").revealed), "L36 stage: the why card has 3 choices, nothing revealed")
	_press(T, s, "why", "dv-ir-only"); T.check(str(T.b.q("ch8Study").why.chosen) == "dv-ir-only", "L36: a why chip sends answerWhy")
	_press(T, s, "why", "dv-rp-xq"); T.check(str(T.b.q("ch8Study").why.chosen) == "dv-rp-xq", "L36: the right equation is chosen")
	var ans := {"dropPct": "3.85", "saifi": "1.425", "saidi": "274.5"}
	for k in ans: (s.edits[k] as LineEdit).text = ans[k]; s._submit(k)
	var s36: Dictionary = T.b.q("ch8Study")
	T.check(float(s36.predictions.dropPct) == 3.85 and float(s36.predictions.saifi) == 1.425 and float(s36.predictions.saidi) == 274.5, "L36: the boxes send the three predictions (%s)" % str(s36.predictions))
	await process_frame; await process_frame
	_phone_fit(T, s)
	_won(T, "L36", "all three predictions and the why card")
	T.check(T.b.q("ch8Study").answers != null and bool(T.b.q("ch8Study").whyOk), "L36: after the run the answers show and the why card is right")
	T.finish("CH8-FLOW", self)
