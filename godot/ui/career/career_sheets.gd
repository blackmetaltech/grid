class_name CareerSheets
extends RefCounted
## The Career's paper dockets, in the style of the shift report: incident cards, the quarter report, the annual review (three verdicts) and the ending sheet. Each one is a PaperKit sheet
## over the career screen. Text is the engine's (verdicts, results) or career_strings.gd; numbers come from the `career` query.

static func T(key: String) -> String: return TranslationServer.translate(key)
const GREEN := Color("#2A7A52")

static func _open(sc: CareerScreen, nm: String, w0: float, h0 := 820.0) -> Dictionary:
	var app: CbApp = sc.app
	var compact := PaperKit.compact(app)
	var h := minf(app.vs_h() - 14.0, h0)
	var d := PaperKit.sheet(app, nm, minf(w0, app.vw() - 20.0), h, 0.72, 14.0 if compact else 26.0)
	app.sfx("page")
	(d.vb as VBoxContainer).add_theme_constant_override("separation", 6 if compact else 10)
	return d

## Title block: big paper title, a sub line, a dashed rule.
static func _head(vb: Control, title: String, sub: String, compact: bool, col: Color = PaperKit.INK) -> void:
	vb.add_child(PaperKit.lbl(title, 30 if compact else 42, "title", col))
	if sub != "": vb.add_child(PaperKit.lbl(sub, 15 if compact else 18, "mono", Color(PaperKit.INK, 0.72)))
	vb.add_child(PaperKit.rule())

## A body scroller and a button row; returns {body, row, host}.
static func _frame(d: Dictionary) -> Dictionary:
	var vb: VBoxContainer = d.vb
	var body := VBoxContainer.new(); body.add_theme_constant_override("separation", 6); body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return {"body": body, "host": d.host}

static func _close(d: Dictionary, next: Callable) -> void:
	var host: Control = d.host
	if is_instance_valid(host): host.queue_free()
	if next.is_valid(): next.call()

static func _finish(sc: CareerScreen, d: Dictionary, body: Control, buttons: Array, primary: Button) -> void:
	var vb: VBoxContainer = d.vb
	vb.add_child(PaperKit.scroll_box(body))
	vb.add_child(PaperKit.rule())
	var row := HFlowContainer.new(); row.add_theme_constant_override("h_separation", 12); row.add_theme_constant_override("v_separation", 6); vb.add_child(row)
	for b in buttons: row.add_child(b)
	(d.host as PaperHost).primary = primary
	PaperKit.slide_in(d, 50.0)
	sc.app.focus_dialog()
	if primary != null: CareerKit.focus_later(primary)

static func _para(text: String, compact: bool, col: Color = PaperKit.INK) -> Label:
	return PaperKit.lbl(text, 15 if compact else 18, "sans", col, true)

# ---- chain -----------------------------------------------------------------------------------------------------------------------
## After a quarter settles: the quarter report, then each new annual review, then the ending.
static func after_quarter(sc: CareerScreen, reviews_before: int) -> void:
	var steps: Array = [func(nx): quarter(sc, nx)]
	var n := (sc.d.reviews as Array).size()
	for i in range(reviews_before, n): steps.append(func(nx): review(sc, i, nx))
	if sc.d.get("ending") != null: steps.append(func(nx): ending(sc))
	_run(steps, 0)

static func _run(steps: Array, i: int) -> void:
	if i >= steps.size(): return
	(steps[i] as Callable).call(func(): _run(steps, i + 1))

# ---- incidents -------------------------------------------------------------------------------------------------------------------
static func incidents(sc: CareerScreen) -> void:
	var compact := PaperKit.compact(sc.app)
	var d := _open(sc, "career_incidents", 760.0, 700.0)
	var host: Control = d.host
	_head(d.vb, T("CAR_INC_TITLE"), T("CAR_INC_SUB"), compact, PaperKit.RED)
	var body := VBoxContainer.new(); body.add_theme_constant_override("separation", 8)
	var res := PaperKit.lbl("", 15 if compact else 17, "semi", GREEN, true); res.name = "Result"
	var fh: Array = [Callable()]   # the lambda refers to itself through this holder (a lambda captures plain variables by value)
	var fill := func():
		for c in body.get_children():
			body.remove_child(c)
			if c != res: c.queue_free()
		for inc in sc.d.incidents:
			var iid := str(inc.id)
			var card := PanelContainer.new(); card.name = "Inc_" + iid
			var sbx := GridTheme._sb(Color(PaperKit.INK, 0.05), Color(PaperKit.RED, 0.7), 4, 2, 10.0); card.add_theme_stylebox_override("panel", sbx)
			var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 4); card.add_child(v); body.add_child(card)
			var where := str(inc.feederId) if inc.feederId != null else T("CAR_INC_NOFEEDER")
			v.add_child(PaperKit.lbl(T("CAR_INC_LINE") % [str(inc.kindName), where], 20 if compact else 24, "title", PaperKit.RED))
			v.add_child(_para(T("CAR_INC_FACTS") % [int(inc.faults), CareerKit.num(float(inc.custInt), 0), CareerKit.num(float(inc.saidiMin), 1)], compact))
			if bool(inc.exceptional): v.add_child(PaperKit.lbl(T("CAR_INC_EXC"), 14 if compact else 16, "mono", PaperKit.AMBER, true))
			if float(inc.custInt) <= 0.0:   # nobody was interrupted (the twin carried the load): nothing to decide, say so instead of offering buttons
				v.add_child(_para(T("CAR_INC_NOONE"), compact, Color(PaperKit.INK, 0.7))); continue
			var row := HFlowContainer.new(); row.add_theme_constant_override("h_separation", 10); v.add_child(row)
			var tie_txt := T("CAR_INC_TIED") if bool(inc.tied) else (T("CAR_INC_TIE") % int(sc.d.get("tieSavingPct", 35)) if bool(inc.hasTie) else T("CAR_INC_NOTIE"))
			var tb := PaperKit.btn(tie_txt, false, func():
				var r := sc.act("careerTie", [iid]); res.text = str(r.get("message", "")); res.add_theme_color_override("font_color", GREEN if bool(r.get("ok", false)) else PaperKit.RED); (fh[0] as Callable).call(), 17 if compact else 19)
			tb.name = "Tie_" + iid; tb.disabled = bool(inc.tied) or not bool(inc.hasTie); row.add_child(tb)
			var cb := PaperKit.btn(T("CAR_INC_CREWED") if bool(inc.crewed) else T("CAR_INC_CREW") % [int(sc.d.get("crewSavingPct", 20)), str(sc.d.get("crewCostText", ""))], false, func():
				var r := sc.act("careerCrew", [iid]); res.text = str(r.get("message", "")); res.add_theme_color_override("font_color", GREEN if bool(r.get("ok", false)) else PaperKit.RED); (fh[0] as Callable).call(), 17 if compact else 19)
			cb.name = "Crew_" + iid; cb.disabled = bool(inc.crewed); row.add_child(cb)
		body.add_child(res)
	fh[0] = fill
	fill.call()
	var done := PaperKit.btn(T("CAR_INC_DONE"), true, func():
		_close(d, Callable()); sc.settle(), 19 if compact else 21)
	done.name = "Done"
	(host as PaperHost).closer = func(): pass   # an incident must be answered: Esc does not skip it
	_finish(sc, d, body, [done], done)

# ---- quarter report --------------------------------------------------------------------------------------------------------------
static func quarter(sc: CareerScreen, next: Callable) -> void:
	var compact := PaperKit.compact(sc.app)
	var hist: Array = sc.d.history
	if hist.is_empty(): if next.is_valid(): next.call(); return
	var h: Dictionary = hist[hist.size() - 1]
	var d := _open(sc, "career_quarter", 760.0, 640.0)
	_head(d.vb, T("CAR_QR_TITLE"), T("CAR_QR_SUB") % [int(h.year), int(h.quarter)], compact)
	var body := VBoxContainer.new(); body.add_theme_constant_override("separation", 8)
	var bars := HBoxContainer.new(); bars.add_theme_constant_override("separation", 24); body.add_child(bars)
	var bs := CareerBar.new(); bs.ink = PaperKit.INK; bs.compact = compact; bs.size_flags_horizontal = Control.SIZE_EXPAND_FILL; bs.set_vals(T("CAR_SAIDI"), float(h.saidiYtd), float(sc.d.targets.saidi), float(sc.d.expected.saidi), 1); bars.add_child(bs)
	var bf := CareerBar.new(); bf.ink = PaperKit.INK; bf.compact = compact; bf.size_flags_horizontal = Control.SIZE_EXPAND_FILL; bf.set_vals(T("CAR_SAIFI"), float(h.saifiYtd), float(sc.d.targets.saifi), float(sc.d.expected.saifi), 2); bars.add_child(bf)
	var n1 := CareerKit.num
	body.add_child(_para(T("CAR_QR_SAIDI") % [n1.call(float(h.saidiReal), 1), n1.call(float(h.saidiExp), 1), n1.call(float(h.saidiYtd), 1), n1.call(float(sc.d.targets.saidi), 1)], compact))
	body.add_child(_para(T("CAR_QR_SAIFI") % [n1.call(float(h.saifiReal), 2), n1.call(float(h.saifiExp), 2), n1.call(float(h.saifiYtd), 2), n1.call(float(sc.d.targets.saifi), 2)], compact))
	body.add_child(PaperKit.rule())
	body.add_child(_para(T("CAR_QR_MONEY") % [str(h.revenueText), str(h.capexText), str(h.opexText), str(h.incentiveText), str(h.cashText)], compact))
	if str(h.get("opexPartsText", "")) != "": body.add_child(_para(str(h.opexPartsText), compact, Color(PaperKit.INK, 0.8)))   # what the running costs are made of
	if str(h.get("emergencyText", "")) != "": body.add_child(_para(str(h.emergencyText), compact, PaperKit.RED))   # why capex jumped after a plant failure
	if str(sc.d.get("rollingText", "")) != "": body.add_child(_para(str(sc.d.rollingText), compact, Color(PaperKit.INK, 0.8) if bool(sc.d.get("rollingOk", true)) else PaperKit.AMBER))   # the 3-year rule, before the review
	if str(sc.d.get("resetWarnText", "")) != "": body.add_child(_para(str(sc.d.resetWarnText), compact, PaperKit.AMBER))   # the period's last year: the reset is coming
	# 1.6 Storm Coast: what readiness is costing, an offer to stand it down after a settled forecast, and a nudge when cash sits idle while SAIDI heads for a strike
	if str(sc.d.get("readyRunText", "")) != "": body.add_child(_para(str(sc.d.readyRunText), compact, Color(PaperKit.INK, 0.8)))
	if str(sc.d.get("standDownText", "")) != "":
		var sdl := _para(str(sc.d.standDownText), compact, GREEN); body.add_child(sdl)
		var sdb := PaperKit.btn(T("CAR_QR_STANDDOWN"), false, func():
			var r := sc.act("careerReadiness", [0]); sdl.text = str(r.get("message", "")), 17 if compact else 18)
		sdb.name = "StandDown"; sdb.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN; body.add_child(sdb)
	if str(sc.d.get("stormNudgeText", "")) != "":
		var nl := _para(str(sc.d.stormNudgeText), compact, PaperKit.AMBER); nl.name = "StormNudge"; body.add_child(nl)
	for po in sc.d.get("plantOut", []): body.add_child(_para(str(po), compact, PaperKit.AMBER))
	for r in sc.d.get("plantRisk", []):   # substation plant likely to fail this year: warned before the emergency bill, not after (Old Iron tester)
		if float(r.pFail) >= 10.0: body.add_child(_para(T("CAR_RISK") % str(r.text), compact, PaperKit.RED))
	body.add_child(_para(T("CAR_QR_HEALTH") % [n1.call(float(h.avgHealth), 1), n1.call(float(h.worstHealth), 1), n1.call(float(h.lossesMWh), 0)], compact))
	body.add_child(_para(T("CAR_QR_NET") % [int(h.faults), int(h.vViolations), n1.call(float(h.firmMarginPct), 0), n1.call(float(h.maxLoadingPct), 0)], compact))
	body.add_child(_para(T("CAR_QR_CONN") % [int(h.delivered), int(h.missed)], compact))
	body.add_child(PaperKit.lbl(T("CAR_QR_NOTE"), 13 if compact else 15, "sans", Color(PaperKit.INK, 0.6), true))
	var go := PaperKit.btn(T("CAR_QR_CONT"), true, func(): _close(d, next), 19 if compact else 21); go.name = "Continue"
	(d.host as PaperHost).closer = func(): _close(d, next)
	_finish(sc, d, body, [go], go)

# ---- annual review ---------------------------------------------------------------------------------------------------------------
static func review(sc: CareerScreen, i: int, next: Callable) -> void:
	var compact := PaperKit.compact(sc.app)
	var rv: Dictionary = sc.d.reviews[i]
	var d := _open(sc, "career_review", 800.0)
	var met := bool(rv.met)
	_head(d.vb, T("CAR_RV_TITLE"), T("CAR_RV_YEAR") % int(rv.year), compact)
	var body := VBoxContainer.new(); body.add_theme_constant_override("separation", 8)
	var top := HBoxContainer.new(); top.add_theme_constant_override("separation", 14); body.add_child(top)
	var st := PanelContainer.new(); st.name = "Stamp"; st.add_theme_stylebox_override("panel", GridTheme._sb(Color(0, 0, 0, 0), GREEN if met else PaperKit.RED, 6, 4, 8.0)); st.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	st.add_child(PaperKit.lbl(T("CAR_RV_MET") if met else T("CAR_RV_MISSED"), 22 if compact else 30, "title", GREEN if met else PaperKit.RED)); top.add_child(st)
	var tv := VBoxContainer.new(); tv.add_theme_constant_override("separation", 2); tv.size_flags_horizontal = Control.SIZE_EXPAND_FILL; top.add_child(tv)
	var n1 := CareerKit.num
	tv.add_child(_para(T("CAR_RV_NUMS") % [n1.call(float(rv.get("saidiRolling", rv.saidi)), 1), n1.call(float(rv.saidiTarget), 1), n1.call(float(rv.get("saifiRolling", rv.saifi)), 2), n1.call(float(rv.saifiTarget), 2), n1.call(float(rv.saidi), 1)], compact))
	tv.add_child(PaperKit.lbl(T("CAR_RV_INCENTIVE") % str(rv.incentiveText), 17 if compact else 22, "semi", GREEN if float(rv.incentive) >= 0.0 else PaperKit.RED))
	# next year's targets, at the top where they are seen (a tester found the five-year reset below the fold): the reset in amber, the yearly step plainly
	if str(rv.get("resetText", "")) != "": tv.add_child(_para(str(rv.resetText), compact, PaperKit.AMBER))
	elif str(rv.get("nextText", "")) != "": tv.add_child(_para(str(rv.nextText), compact, Color(PaperKit.INK, 0.8)))
	body.add_child(PaperKit.rule())
	var k := 0
	for v in rv.verdicts:
		k += 1
		var card := PanelContainer.new(); card.name = "Verdict_" + str(v.axis)
		var grade := str(v.grade); var gcol := GREEN if grade == "good" else (PaperKit.AMBER if grade == "ok" else PaperKit.RED)
		card.add_theme_stylebox_override("panel", GridTheme._sb(Color(PaperKit.INK, 0.04), Color(gcol, 0.8), 4, 2, 10.0)); body.add_child(card)
		var hb := HBoxContainer.new(); hb.add_theme_constant_override("separation", 12); card.add_child(hb)
		var vv := VBoxContainer.new(); vv.add_theme_constant_override("separation", 2); vv.size_flags_horizontal = Control.SIZE_EXPAND_FILL; hb.add_child(vv)
		vv.add_child(PaperKit.lbl(str(v.who), 17 if compact else 20, "semi", PaperKit.INK))
		vv.add_child(_para(str(v.text), compact))
		var gp := PanelContainer.new(); gp.name = "Grade"; gp.add_theme_stylebox_override("panel", GridTheme._sb(Color(0, 0, 0, 0), gcol, 5, 3, 6.0)); gp.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
		gp.add_child(PaperKit.lbl(T("CAR_GRADE_" + grade), 18 if compact else 22, "title", gcol)); hb.add_child(gp)
	body.add_child(_para(T("CAR_RV_STATE") % [str(rv.cashText), str(rv.rabText), n1.call(float(rv.avgHealth), 1)], compact, Color(PaperKit.INK, 0.8)))
	var ov := int(rv.get("overloaded", 0)); var fs := int(rv.get("firmShort", 0))   # the load index: feeders over their rating at peak, primaries short of firm capacity
	body.add_child(_para(T("CAR_RV_LOAD") % [ov, fs] if ov + fs > 0 else T("CAR_RV_LOAD_OK"), compact, PaperKit.RED if ov + fs > 0 else Color(PaperKit.INK, 0.8)))
	body.add_child(PaperKit.lbl(T("CAR_RV_NOTE"), 13 if compact else 15, "sans", Color(PaperKit.INK, 0.6), true))
	var go := PaperKit.btn(T("CAR_RV_CONT"), true, func(): _close(d, next), 19 if compact else 21); go.name = "Continue"
	(d.host as PaperHost).closer = func(): _close(d, next)
	_finish(sc, d, body, [go], go)

# ---- ending ----------------------------------------------------------------------------------------------------------------------
static func ending(sc: CareerScreen) -> void:
	var compact := PaperKit.compact(sc.app)
	var c: Dictionary = sc.d
	var d := _open(sc, "career_ending", 800.0)
	var good := str(c.ending) == "chiefEngineer" or str(c.ending) == "steady"
	_head(d.vb, T("CAR_ED_TITLE"), "", compact, GREEN if good else PaperKit.RED)
	var body := VBoxContainer.new(); body.add_theme_constant_override("separation", 8)
	body.add_child(PaperKit.lbl(str(c.endingText), 34 if compact else 52, "title", GREEN if good else PaperKit.RED, true))
	body.add_child(PaperKit.lbl(T("CAR_ED_SCORE") % roundi(float(c.score)), 28 if compact else 40, "semi", PaperKit.INK))
	var parts := VBoxContainer.new(); parts.name = "ScoreParts"; parts.add_theme_constant_override("separation", 0); body.add_child(parts)   # where the score came from (both 1.4 testers asked)
	for sp in c.get("scoreParts", []):
		if int(sp.points) != 0: parts.add_child(PaperKit.lbl(str(sp.text), 13 if compact else 15, "mono", PaperKit.RED if int(sp.points) < 0 else Color(PaperKit.INK, 0.75), true))
	body.add_child(_para(T("CAR_ED_CHARTER") % str(c.get("charterName", "")), compact))
	if str(c.get("weekly", "")) != "":   # the weekly district: keep this device's best for the week
		body.add_child(_para(T("CAR_ED_WEEKLY") % [str(c.weekly), Career.weekly_record(str(c.weekly), int(c.boardScore))], compact))
		var bl := _para("", compact, Color(PaperKit.INK, 0.8)); bl.name = "BoardLine"; body.add_child(bl)
		Career.board_submit(sc.app, c, bl)
	var n1 := CareerKit.num
	body.add_child(_para(T("CAR_ED_YEARS") % [int(c.yearsMet), (c.reviews as Array).size()], compact))
	var missed: Array = []
	for rv in c.reviews:
		if not bool(rv.met): missed.append(str(int(rv.year)))
	if not missed.is_empty(): body.add_child(_para(T("CAR_ED_MISSED") % ", ".join(missed), compact, Color(PaperKit.INK, 0.8)))   # which years, not only how many (Old Iron tester)
	body.add_child(_para(T("CAR_ED_HEALTH") % [n1.call(float(c.health), 1), n1.call(float(c.startHealth), 1)], compact))
	body.add_child(_para(T("CAR_ED_CASH") % [str(c.cashText), str(c.netIncentiveText)], compact))
	var sf: Array = c.get("shortfalls", [])
	if str(c.ending) != "chiefEngineer" and not sf.is_empty():   # what kept this career from Chief Engineer, in the engine's words
		body.add_child(PaperKit.lbl(T("CAR_ED_SHORT"), 15 if compact else 17, "semi", PaperKit.RED, true))
		for line in sf: body.add_child(_para("· " + str(line), compact, PaperKit.RED))
	body.add_child(PaperKit.rule())
	body.add_child(PaperKit.lbl(T("CAR_ED_CODE"), 14 if compact else 16, "mono", Color(PaperKit.INK, 0.72), true))
	var le := LineEdit.new(); le.name = "Code"; le.text = str(c.code); le.editable = false; le.select_all_on_focus = true; le.add_theme_font_override("font", GridTheme.font("mono")); le.add_theme_font_size_override("font_size", GridTheme.fs(14))
	le.add_theme_color_override("font_uneditable_color", PaperKit.INK); le.add_theme_color_override("font_color", PaperKit.INK)
	le.add_theme_stylebox_override("normal", GridTheme._sb(Color(PaperKit.INK, 0.06), Color(PaperKit.INK, 0.5), 4, 1, 8.0)); le.add_theme_stylebox_override("read_only", GridTheme._sb(Color(PaperKit.INK, 0.06), Color(PaperKit.INK, 0.5), 4, 1, 8.0)); body.add_child(le)
	var again := PaperKit.btn(T("CAR_ED_AGAIN"), true, func(): _close(d, Callable()); sc.close(); Career.start(sc.app), 19 if compact else 21); again.name = "Again"
	var cp := PaperKit.btn(T("CAR_ED_COPY"), false, func(): DisplayServer.clipboard_set(str(c.code)), 19 if compact else 21); cp.name = "Copy"
	var look := PaperKit.btn(T("CAR_ED_LOOK"), false, func(): _close(d, Callable()), 19 if compact else 21); look.name = "Look"
	var leave := PaperKit.btn(T("CAR_ED_LEAVE"), false, func(): _close(d, Callable()); sc.close(), 19 if compact else 21); leave.name = "Leave"
	(d.host as PaperHost).closer = func(): _close(d, Callable())
	_finish(sc, d, body, [again, cp, look, leave], again)
