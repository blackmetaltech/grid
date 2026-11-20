class_name CareerScreen
extends Control
## Career "The Utility": the full-screen district view. Top: the year / quarter, the forty-quarter timeline, the End quarter button and the cash and SAIDI / SAIFI readouts.
## Left: the district map and, under it, the picked section / feeder / primary. Right: the drawer with the project board (cards with cost, lead time and the engine's
## "why this helps"), the running projects and the connection requests. Sheets (incidents, quarter report, annual review, ending) are paper dockets (career_sheets.gd).
## Display and input only: every number is the engine's `career`, `careerBoard` and `careerQuote` queries, every change an engine action through app.b.act.

const KIND_TARGET := {"reconductor": "section", "remoteSwitch": "section", "newFeeder": "feeder", "newTransformer": "primary", "tieSwitch": "feeder", "recloser": "feeder",
	"vegetation": "feeder", "regulator": "feeder", "battery": "feeder", "demandResponse": "feeder", "replaceAssets": "asset"}

var app: CbApp
var d: Dictionary = {}
var board: Dictionary = {}
var sel: Dictionary = {}
var tab := "board"
var colour := "load"
var msg := ""
var msg_good := true
var compact := false
var map: CareerMap
var timeline: CareerTimeline
var bar_saidi: CareerBar
var bar_saifi: CareerBar
var year_lbl: Label
var charter_lbl: Label   ## the district's charter (DESIGN-1.3) under the year, and 'this week' for the weekly district
var end_btn: Button
var info_box: VBoxContainer
var tab_row: HBoxContainer
var drawer_body: VBoxContainer
var drawer_sc: ScrollContainer
var drawer: PanelContainer
var tool_row: HBoxContainer
var stat_box: HBoxContainer
var stats := {}
var _bg: ColorRect
var _busy := false

func T(key: String) -> String: return TranslationServer.translate(key)

func _init() -> void:
	name = "career"; set_meta("cb_modal", true); mouse_filter = Control.MOUSE_FILTER_STOP
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED and app != null and is_instance_valid(app) and _bg != null: _bleed()

func _bleed() -> void:
	var ins: Vector4 = app.inset
	_bg.offset_left = -ins.x; _bg.offset_top = -ins.y; _bg.offset_right = ins.z; _bg.offset_bottom = ins.w

func close() -> void:
	Career.save(app)
	queue_free()

# ---- build ----------------------------------------------------------------------------------------------------------------------
func build() -> void:
	GridUi.load_strings()
	theme = GridTheme.theme()
	compact = PaperKit.compact(app)
	_bg = ColorRect.new(); _bg.color = GridTheme.NIGHT; _bg.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); _bg.mouse_filter = Control.MOUSE_FILTER_STOP; add_child(_bg); _bleed()
	var m := MarginContainer.new(); m.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for k in ["left", "right", "top", "bottom"]: m.add_theme_constant_override("margin_" + k, 6 if compact else 12)
	add_child(m)
	var col := VBoxContainer.new(); col.add_theme_constant_override("separation", 5 if compact else 9); m.add_child(col)
	col.add_child(_build_strip())
	var body := HBoxContainer.new(); body.add_theme_constant_override("separation", 6 if compact else 10); body.size_flags_vertical = Control.SIZE_EXPAND_FILL; col.add_child(body)
	var left := VBoxContainer.new(); left.add_theme_constant_override("separation", 4 if compact else 8); left.size_flags_horizontal = Control.SIZE_EXPAND_FILL; body.add_child(left)
	tool_row = _build_tools(); left.add_child(tool_row)
	map = CareerMap.new(); map.compact = compact; map.size_flags_vertical = Control.SIZE_EXPAND_FILL; map.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	map.picked.connect(_on_pick); left.add_child(map)
	var ip := PanelContainer.new(); ip.name = "InfoPanel"; ip.add_theme_stylebox_override("panel", CareerKit.sb(Color(GridTheme.INK, 0.95), Color(GridTheme.SODIUM_DIM, 0.4), 1, 8, 10.0, 5.0)); ip.custom_minimum_size.y = 72.0 if compact else 104.0; left.add_child(ip)   # a fixed height: the map must not jump when a pick changes the text
	info_box = VBoxContainer.new(); info_box.add_theme_constant_override("separation", 2); ip.add_child(info_box)
	drawer = PanelContainer.new(); drawer.name = "Drawer"; drawer.add_theme_stylebox_override("panel", CareerKit.sb(Color(GridTheme.INK, 0.97), Color(GridTheme.SODIUM_DIM, 0.5), 1, 8, 8.0, 8.0))
	drawer.custom_minimum_size.x = clampf(app.vw() * 0.34, 380.0, 420.0) if compact else clampf(app.vw() * 0.29, 480.0, 600.0)
	body.add_child(drawer)
	var dv := VBoxContainer.new(); dv.add_theme_constant_override("separation", 6); drawer.add_child(dv)
	tab_row = HBoxContainer.new(); tab_row.add_theme_constant_override("separation", 6); dv.add_child(tab_row)
	drawer_sc = ScrollContainer.new(); drawer_sc.size_flags_vertical = Control.SIZE_EXPAND_FILL; drawer_sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; dv.add_child(drawer_sc)
	drawer_body = VBoxContainer.new(); drawer_body.add_theme_constant_override("separation", 6); drawer_body.size_flags_horizontal = Control.SIZE_EXPAND_FILL; drawer_sc.add_child(drawer_body)
	refresh()

func _build_strip() -> Control:
	var pc := PanelContainer.new(); pc.name = "Strip"; pc.add_theme_stylebox_override("panel", CareerKit.sb(Color(GridTheme.INK, 0.97), Color(GridTheme.SODIUM_DIM, 0.5), 1, 8, 10.0, 4.0 if compact else 7.0))
	var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 2 if compact else 4); pc.add_child(v)
	var r1 := HBoxContainer.new(); r1.add_theme_constant_override("separation", 12); v.add_child(r1)
	var yv := VBoxContainer.new(); yv.add_theme_constant_override("separation", 0); yv.alignment = BoxContainer.ALIGNMENT_CENTER; r1.add_child(yv)
	year_lbl = CareerKit.lbl("", 22 if compact else 30, GridTheme.SODIUM, "title"); year_lbl.name = "YearLabel"; year_lbl.custom_minimum_size.x = 190 if compact else 300; yv.add_child(year_lbl)
	charter_lbl = CareerKit.lbl("", 12 if compact else 15, Color(GridTheme.SODIUM, 0.7), "semi"); charter_lbl.name = "CharterLabel"; yv.add_child(charter_lbl)
	timeline = CareerTimeline.new(); timeline.compact = compact; timeline.size_flags_horizontal = Control.SIZE_EXPAND_FILL; timeline.custom_minimum_size.y = 30 if compact else 40; r1.add_child(timeline)
	end_btn = CareerKit.btn(T("CAR_END_Q"), true, _on_end, 17 if compact else 20); end_btn.name = "EndQuarter"; r1.add_child(end_btn)
	stat_box = HBoxContainer.new(); stat_box.add_theme_constant_override("separation", 16 if compact else 26); v.add_child(stat_box)
	stats["cash"] = _stat(T("CAR_CASH"), 150 if compact else 200)
	stats["owed"] = CareerKit.lbl("", 11 if compact else 13, Color(GridTheme.TEXT, 0.62), "mono"); (stats.cash as Label).get_parent().add_child(stats.owed)   # what the projects building still owe, and the cash after
	bar_saidi = CareerBar.new(); bar_saidi.compact = compact; bar_saidi.name = "BarSaidi"; bar_saidi.size_flags_horizontal = Control.SIZE_EXPAND_FILL; stat_box.add_child(bar_saidi)
	bar_saifi = CareerBar.new(); bar_saifi.compact = compact; bar_saifi.name = "BarSaifi"; bar_saifi.size_flags_horizontal = Control.SIZE_EXPAND_FILL; stat_box.add_child(bar_saifi)
	stats["health"] = _stat(T("CAR_HEALTH"), 150 if compact else 200)
	stats["crews"] = _stat(T("CAR_CREWS"), 90 if compact else 120)
	stats["met"] = _stat(T("CAR_MET"), 60 if compact else 90)
	stats["score"] = _stat(T("CAR_SCORE"), 60 if compact else 80)
	return pc

func _stat(cap: String, minw: float) -> Label:
	var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 0); v.custom_minimum_size.x = minw; stat_box.add_child(v)
	v.add_child(CareerKit.lbl(cap, 13, Color(GridTheme.TEXT, 0.62), "mono"))
	var l := CareerKit.lbl("", 16 if compact else 19, GridTheme.TEXT, "semi"); v.add_child(l)
	return l

func _build_tools() -> HBoxContainer:
	var hb := HBoxContainer.new(); hb.name = "Tools"; hb.add_theme_constant_override("separation", 6 if compact else 10)
	hb.add_child(CareerKit.lbl(T("CAR_COLOUR_BY"), 14, Color(GridTheme.TEXT, 0.7), "mono"))
	hb.set_meta("chips", HBoxContainer.new())
	var chips: HBoxContainer = hb.get_meta("chips"); chips.add_theme_constant_override("separation", 4); hb.add_child(chips)
	var leg := CareerKit.lbl("", 13, Color(GridTheme.TEXT, 0.6), "sans", true); leg.name = "Legend"; leg.clip_text = true; leg.autowrap_mode = TextServer.AUTOWRAP_OFF; leg.size_flags_horizontal = Control.SIZE_EXPAND_FILL; hb.add_child(leg)
	var cp := CareerKit.btn(T("CAR_COPY_CODE"), false, _copy_code, 14); cp.name = "CopyCode"; hb.add_child(cp)
	var lv := CareerKit.btn(T("CAR_LEAVE"), false, func(): close(), 14); lv.name = "Leave"; hb.add_child(lv)
	return hb

func _tools_refresh() -> void:
	var chips: HBoxContainer = tool_row.get_meta("chips")
	_clear(chips)
	for o in [["load", T("CAR_BY_LOAD")], ["health", T("CAR_BY_HEALTH")]]:
		var c := CareerKit.chip(str(o[1]), colour == str(o[0]), func(): colour = str(o[0]); map.mode = colour; _tools_refresh(); map.queue_redraw(), 14); c.name = "Colour_" + str(o[0]); chips.add_child(c)
	var leg: Label = tool_row.get_node("Legend")
	leg.text = T("CAR_LEG_LOAD") if colour == "load" else T("CAR_LEG_HEALTH")
	leg.text += "  " + T("CAR_LEG_BADGES")
	if compact: leg.visible = false; tool_row.tooltip_text = leg.text   # the phone has no room for the key: it is the row's tooltip

func _copy_code() -> void:
	DisplayServer.clipboard_set(str(d.get("code", ""))); _say(T("CAR_CODE_COPIED"), true)

static func _clear(n: Node) -> void:
	for c in n.get_children():
		n.remove_child(c); c.queue_free()

# ---- state ----------------------------------------------------------------------------------------------------------------------
func _say(text: String, good: bool) -> void:
	msg = text; msg_good = good; _build_info()

## One engine action; the result sentence goes under the map, the career code is saved, every panel refreshes.
func act(name_: String, args: Array) -> Dictionary:
	var r: Dictionary = app.b.act(name_, args)
	msg = str(r.get("message", "")); msg_good = bool(r.get("ok", false))
	app.sfx("confirm" if msg_good else "bad")
	Career.save(app)
	refresh()
	return r

func refresh() -> void:
	var q = app.b.q("career")
	if not (q is Dictionary) or not q.get("active", false): queue_free(); return
	d = q
	var bq = app.b.q("careerBoard"); board = bq if bq is Dictionary else {}
	var ended: bool = d.get("ending") != null
	year_lbl.text = T("CAR_ED_TITLE") if ended else T("CAR_YEAR_Q") % [int(d.year), int(d.quarter)]
	charter_lbl.text = (T("CAR_WEEKLY_TAG") % [str(d.get("charterName", "")), str(d.get("weekly", ""))]) if str(d.get("weekly", "")) != "" else str(d.get("charterName", ""))
	charter_lbl.tooltip_text = str(d.get("charterText", ""))
	timeline.set_data(d)
	var inc := str(d.phase) == "incident"
	end_btn.text = T("CAR_END_Q_INC") if inc else T("CAR_END_Q"); end_btn.disabled = ended
	(stats.cash as Label).text = str(d.cashText); (stats.cash as Label).add_theme_color_override("font_color", GridTheme.TEXT if float(d.cash) >= 0.0 else GridTheme.BAD)
	(stats.cash as Label).tooltip_text = T("CAR_CASH_LIM") % str(d.creditText)
	if bool(d.get("borrowing", false)): (stats.cash as Label).text = T("CAR_CASH_DEBT") % str(d.cashText)
	(stats.owed as Label).text = T("CAR_CASH_OWED") % [str(d.get("owedText", "")), str(d.get("cashAfterText", ""))] if str(d.get("owedText", "")) != "" and float(d.get("committedQ", 0.0)) > 0.0 else ""
	(stats.owed as Label).add_theme_color_override("font_color", Color(GridTheme.TEXT, 0.62) if not str(d.get("cashAfterText", "")).begins_with("-") else GridTheme.BAD)
	bar_saidi.set_vals(T("CAR_SAIDI"), float(d.ytd.saidi), float(d.targets.saidi), float(d.expected.saidi), 1)
	bar_saifi.set_vals(T("CAR_SAIFI"), float(d.ytd.saifi), float(d.targets.saifi), float(d.expected.saifi), 2)
	(stats.health as Label).text = T("CAR_HEALTH_VAL") % [CareerKit.num(float(d.health), 1), CareerKit.num(float(d.startHealth), 1)]
	(stats.crews as Label).text = T("CAR_CREWS_VAL") % [int(d.crewsFree), int(d.crews)]
	(stats.met as Label).text = T("CAR_MET_VAL") % int(d.yearsMet)
	(stats.score as Label).text = CareerKit.num(float(d.score), 0)
	map.mode = colour; map.sel = sel; map.hot = (d.incidents as Array).map(func(x): return str(x.feederId)) if inc else []
	map.set_data(d)
	_tools_refresh(); _build_info(); _build_tabs(); _build_drawer()

func _on_pick(s: Dictionary) -> void:
	sel = s; msg = ""
	app.sfx("click")
	map.sel = sel; map.queue_redraw(); _build_info(); _build_drawer(true)

func _on_end() -> void:
	if _busy: return
	if str(d.phase) == "incident": CareerSheets.incidents(self); return
	var before := (d.reviews as Array).size()
	var r := act("careerEndQuarter", [true])
	if not bool(r.get("ok", false)): return
	if str(d.phase) == "incident": CareerSheets.incidents(self); return
	CareerSheets.after_quarter(self, before)

## Called by the incident sheet's Done button: settle the quarter, then the report chain.
func settle() -> void:
	var before := (d.reviews as Array).size()
	var r := act("careerEndQuarter", [true])
	if bool(r.get("ok", false)): CareerSheets.after_quarter(self, before)

# ---- the picked thing -----------------------------------------------------------------------------------------------------------
func feeder_of(fid: String) -> Dictionary:
	var i := CareerKit.find_id(d.get("feeders", []), fid)
	return d.feeders[i] if i >= 0 else {}

func section_of(sid: String) -> Dictionary:
	for f in d.get("feeders", []):
		for s in f.sections:
			if str(s.id) == sid: return s
	return {}

func primary_of(pid: String) -> Dictionary:
	var i := CareerKit.find_id(d.get("primaries", []), pid)
	return d.primaries[i] if i >= 0 else {}

func _asset_line(a: Dictionary, label: String) -> String:
	var st := T("CAR_INSPECTED") if bool(a.inspected) else T("CAR_ESTIMATE")
	if bool(a.failed): st = (T("CAR_FAILED") % int(a.outQ)) if float(a.outQ) > 0.0 else T("CAR_PATCHED")   # a failed transformer is out; a failed line section was patched and awaits a proper fix
	return T("CAR_ASSET_HEALTH") % [label, CareerKit.num(float(a.health), 1), st]

func _build_info() -> void:
	if info_box == null: return
	_clear(info_box)
	var sz := 14 if compact else 16
	if msg != "":
		var ml := CareerKit.lbl(msg, sz, GridTheme.GOOD if msg_good else GridTheme.BAD, "semi", true); ml.name = "Message"; ml.max_lines_visible = 2 if compact else 3; ml.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS; info_box.add_child(ml)
	var t := str(sel.get("type", ""))
	if t == "section":
		var sec := section_of(str(sel.id)); var f := feeder_of(str(sel.get("feeder", "")))
		if sec.is_empty() or f.is_empty(): sel = {}; _build_info(); return
		var hb := HBoxContainer.new(); hb.add_theme_constant_override("separation", 10); info_box.add_child(hb)
		var tv := VBoxContainer.new(); tv.add_theme_constant_override("separation", 1); tv.size_flags_horizontal = Control.SIZE_EXPAND_FILL; hb.add_child(tv)
		tv.add_child(CareerKit.lbl(T("CAR_SEC_TITLE") % str(sec.id), sz + 3, GridTheme.SODIUM, "semi"))
		tv.add_child(CareerKit.lbl(T("CAR_SEC_INFO") % [CareerKit.num(float(sec.km), 1), str(sec.conductor), T("CAR_DEV_" + str(sec.device))] + "  " + _asset_line(sec, str(sec.assetId)), sz - 1, GridTheme.TEXT, "sans", true))
		if not compact: tv.add_child(CareerKit.lbl(_feeder_text(f), sz - 1, Color(GridTheme.TEXT, 0.8), "sans", true))
		var ib := CareerKit.btn(T("CAR_INSPECT") % str(sec.assetId), false, func(): act("careerInspect", [str(sec.assetId)]), 14); ib.name = "Inspect"; ib.size_flags_vertical = Control.SIZE_SHRINK_CENTER; hb.add_child(ib)
	elif t == "primary":
		var p := primary_of(str(sel.id))
		if p.is_empty(): sel = {}; _build_info(); return
		info_box.add_child(CareerKit.lbl(T("CAR_PRIMARY_INFO") % [str(p.name), CareerKit.num(float(p.peakMva), 1), CareerKit.num(float(p.firmMva), 1), CareerKit.num(float(p.firmMarginPct), 0)], sz, GridTheme.TEXT, "sans", true))
		var row := HBoxContainer.new(); row.add_theme_constant_override("separation", 6); info_box.add_child(row)
		var assets: Array = []
		for u in p.units: assets.append([str(u.id), T("CAR_UNIT") % [str(u.id), CareerKit.num(float(u.ratingMva), 0)], u])
		assets.append([str(p.switchgear.id), T("CAR_SWGEAR") % str(p.id), p.switchgear])
		if str(sel.get("asset", "")) == "": sel["asset"] = str(assets[0][0])
		for a in assets:
			var aid := str(a[0])
			var c := CareerKit.chip("%s  %s" % [str(a[1]), CareerKit.num(float(a[2].health), 1)], str(sel.get("asset", "")) == aid, func(): sel["asset"] = aid; _build_info(); _build_drawer(), 13 if compact else 14); c.name = "Asset_" + aid; row.add_child(c)
		for a in assets:
			if str(a[0]) == str(sel.get("asset", "")):
				var rr := HBoxContainer.new(); rr.add_theme_constant_override("separation", 10); info_box.add_child(rr)
				var al := CareerKit.lbl(_asset_line(a[2], str(a[0])), sz - 1, GridTheme.TEXT, "sans", true); rr.add_child(al)
				var ib2 := CareerKit.btn(T("CAR_INSPECT") % str(a[0]), false, func(): act("careerInspect", [str(a[0])]), 14); ib2.name = "Inspect"; rr.add_child(ib2)
	else:
		if msg == "": info_box.add_child(CareerKit.lbl(T("CAR_SEL_NONE"), sz, Color(GridTheme.TEXT, 0.75), "sans", true))

func _feeder_text(f: Dictionary) -> String:
	var s: String = T("CAR_FDR_INFO") % [str(f.id), str(primary_of(str(f.primaryId)).get("name", f.primaryId)), int(f.customers), int(f.peakKw), CareerKit.num(float(f.loadingPct), 0), CareerKit.num(float(f.minV), 2), CareerKit.num(float(f.saidi), 0), CareerKit.num(float(f.saifi), 2)]
	var has: Array = []
	if bool(f.tie): has.append(T("CAR_B_tie"))
	if bool(f.recloser): has.append(T("CAR_B_recloser"))
	if bool(f.regulator): has.append(T("CAR_B_regulator"))
	if float(f.batteryKw) > 0.0: has.append(T("CAR_B_battery") % int(f.batteryKw))
	if float(f.drKw) > 0.0: has.append(T("CAR_B_dr") % int(f.drKw))
	s += "  " + (T("CAR_HAS") % ", ".join(has) if not has.is_empty() else T("CAR_HAS_NONE"))
	if bool(f.vViolation): s += "  " + T("CAR_VVIOL")
	return s

# ---- the drawer -----------------------------------------------------------------------------------------------------------------
func _build_tabs() -> void:
	_clear(tab_row)
	var nrun := (d.projects as Array).filter(func(p): return str(p.status) == "building" or str(p.status) == "active").size()
	var nreq := (d.requests as Array).size()
	for o in [["board", T("CAR_TAB_BOARD")], ["run", T("CAR_TAB_RUN") % nrun], ["req", T("CAR_TAB_REQ") % nreq]]:
		var c := CareerKit.chip(str(o[1]), tab == str(o[0]), func(): tab = str(o[0]); _build_tabs(); _build_drawer(true), 14 if compact else 16); c.name = "Tab_" + str(o[0]); tab_row.add_child(c)

func _build_drawer(to_top := false) -> void:
	var keep := 0 if to_top else drawer_sc.scroll_vertical
	_clear(drawer_body)
	match tab:
		"run": _run_tab()
		"req": _req_tab()
		_: _board_tab()
	drawer_sc.set_deferred("scroll_vertical", keep)

## The target string a project kind takes for what is picked on the map ("" when the pick is the wrong sort of thing).
func target_for(kind: String) -> String:
	var need: String = KIND_TARGET.get(kind, "section"); var t := str(sel.get("type", ""))
	if t == "section":
		match need:
			"section": return str(sel.id)
			"feeder": return str(sel.get("feeder", ""))
			"asset": return str(section_of(str(sel.id)).get("assetId", sel.id))
	elif t == "primary":
		match need:
			"primary": return str(sel.id)
			"asset": return str(sel.get("asset", ""))
	return ""

## The assets whose replacement buys the most SAIDI: the board's own quotes for the worn and patched ones, best first.
func worst_assets(limit := 4) -> Array:
	var cand: Array = []
	for f in d.feeders:
		for s in f.sections:
			if bool(s.failed) or float(s.health) < 6.0: cand.append([str(s.id), float(s.health) - (2.0 if bool(s.failed) else 0.0)])
	for p in d.primaries:
		for u in p.units: if bool(u.failed) or float(u.health) < 6.0: cand.append([str(u.id), float(u.health)])
		if float(p.switchgear.health) < 6.0: cand.append([str(p.switchgear.id), float(p.switchgear.health)])
	cand.sort_custom(func(a, b): return float(a[1]) < float(b[1]))
	var out: Array = []
	for c in cand.slice(0, 16):
		var q = app.b.q("careerQuote", ["replaceAssets", str(c[0])])
		if q is Dictionary and bool(q.get("ok", false)) and float(q.dSaidi) <= -1.0: out.append({"id": str(c[0]), "dSaidi": float(q.dSaidi), "capexText": str(q.capexText), "capex": float(q.capex)})
	out.sort_custom(func(a, b): return float(a.dSaidi) < float(b.dSaidi))
	return out.slice(0, limit)

func _asset_pick(id: String) -> Dictionary:
	if id.contains("."): return {"type": "section", "id": id, "feeder": id.split(".")[0]}
	return {"type": "primary", "id": id.split("-")[0], "asset": id}

func _worst_card(sz: int) -> void:
	var v := CareerKit.card(drawer_body); v.get_parent().name = "WorstCard"
	v.add_child(CareerKit.lbl(T("CAR_WORST"), sz + 1, GridTheme.SODIUM, "semi", true))
	var rows := worst_assets(3 if compact else 4)
	if rows.is_empty(): v.add_child(CareerKit.lbl(T("CAR_WORST_NONE"), sz - 1, Color(GridTheme.TEXT, 0.6), "sans", true)); return
	for r in rows:
		var id := str(r.id); var a := _asset_of(id)
		var hb := HBoxContainer.new(); hb.add_theme_constant_override("separation", 6); v.add_child(hb)
		var pick := CareerKit.btn(T("CAR_WORST_ROW") % [id, CareerKit.num(float(a.get("health", 0.0)), 1), T("CAR_WORST_PATCH") if bool(a.get("failed", false)) and float(a.get("outQ", 0.0)) <= 0.0 else ""], false, func(): _on_pick(_asset_pick(id)), sz - 1)
		pick.name = "WorstPick_" + id; pick.size_flags_horizontal = Control.SIZE_EXPAND_FILL; pick.alignment = HORIZONTAL_ALIGNMENT_LEFT; pick.clip_text = true; hb.add_child(pick)
		var gain := CareerKit.lbl("%s  %s" % [T("CAR_WORST_GAIN") % CareerKit.num(float(r.dSaidi), 1), str(r.capexText)], sz - 2, GridTheme.GOOD, "mono")
		if compact: v.add_child(gain)   # the phone drawer is narrow: the gain goes on a line of its own
		else: hb.add_child(gain)
		var fix := CareerKit.btn(T("CAR_START"), true, func(): act("careerProject", ["replaceAssets", id]), sz - 1); fix.name = "Fix_" + id; hb.add_child(fix)

func _asset_of(id: String) -> Dictionary:
	for f in d.feeders:
		for s in f.sections: if str(s.id) == id: return s
	for p in d.primaries:
		for u in p.units: if str(u.id) == id: return u
		if str(p.switchgear.id) == id: return p.switchgear
	return {}

func _board_tab() -> void:
	var sz := 14 if compact else 15
	_veg_card()
	_worst_card(sz)
	var t := str(sel.get("type", ""))
	var head := T("CAR_BOARD_NONE")
	if t == "section": head = T("CAR_TARGET_IS") % (T("CAR_SEC_TITLE") % str(sel.id))
	elif t == "primary": head = T("CAR_TARGET_IS") % str(primary_of(str(sel.id)).get("name", sel.id))
	var hl := CareerKit.lbl(head, sz, GridTheme.SODIUM if t != "" else Color(GridTheme.TEXT, 0.7), "semi", true); hl.name = "TargetLine"; drawer_body.add_child(hl)
	var cards: Array = []
	for k in board.get("kinds", []):
		var kind := str(k.kind); var tg := target_for(kind)
		var opt: Dictionary = {}
		for o in k.options:
			if str(o.target) == tg and tg != "": opt = o
		cards.append({"k": k, "target": tg, "opt": opt, "rank": 0 if not opt.is_empty() else (1 if tg != "" else 2)})
	cards.sort_custom(func(a, b): return int(a.rank) < int(b.rank))
	for c in cards: _kind_card(c, sz)

func _kind_card(c: Dictionary, sz: int) -> void:
	var k: Dictionary = c.k; var kind := str(k.kind); var tg := str(c.target); var opt: Dictionary = c.opt
	var v := CareerKit.card(drawer_body, GridTheme.SODIUM if not opt.is_empty() else Color(0, 0, 0, 0)); v.get_parent().name = "Card_" + kind
	var top := HBoxContainer.new(); top.add_theme_constant_override("separation", 8); v.add_child(top)
	var nm := CareerKit.lbl(str(k.name), sz + 3, GridTheme.TEXT if not opt.is_empty() or tg == "" else Color(GridTheme.TEXT, 0.6), "semi"); nm.size_flags_horizontal = Control.SIZE_EXPAND_FILL; top.add_child(nm)
	if not opt.is_empty():
		top.add_child(CareerKit.lbl(T("CAR_COST_LINE") % [str(opt.capexText), int(opt.leadQ), int(opt.crew)], sz - 1, GridTheme.SODIUM, "mono"))
	elif tg == "":
		var best := 0.0; var cnt := 0
		for o in k.options:
			cnt += 1
			if best == 0.0 or float(o.capex) < best: best = float(o.capex); top.set_meta("bt", str(o.capexText))
		if cnt > 0 and top.has_meta("bt"): top.add_child(CareerKit.lbl(T("CAR_FROM") % str(top.get_meta("bt")), sz - 1, Color(GridTheme.TEXT, 0.6), "mono"))
	if not compact or not opt.is_empty() or tg == "": v.add_child(CareerKit.lbl(str(k.blurb), sz - 1, Color(GridTheme.TEXT, 0.72), "sans", true))
	if tg == "":
		var need: String = KIND_TARGET.get(kind, "section")
		v.add_child(CareerKit.lbl(T("CAR_NEEDS") % T("CAR_TGT_" + need), sz - 1, Color(GridTheme.TEXT, 0.5), "mono", true))
		return
	var q = app.b.q("careerQuote", [kind, tg])
	if not opt.is_empty():
		var why := str(q.get("why", "")) if q is Dictionary else ""
		var wl := CareerKit.lbl(T("CAR_ON") % tg + ": " + why, sz, GridTheme.GOOD, "sans", true); wl.name = "Why"; v.add_child(wl)
		var od := str(q.get("overdrawText", "")) if q is Dictionary else ""
		if od != "":   # warn before the money goes, not at the review
			var ol := CareerKit.lbl(od, sz - 1, GridTheme.BAD, "sans", true); ol.name = "Overdraw"; v.add_child(ol)
		var sb := CareerKit.btn(T("CAR_START"), true, func(): act("careerProject", [kind, tg]), 15); sb.name = "Start_" + kind; sb.size_flags_horizontal = Control.SIZE_SHRINK_END; v.add_child(sb)
	else:
		var rl := CareerKit.lbl(str(q.get("text", "")) if q is Dictionary else T("CAR_CANT"), sz - 1, Color(GridTheme.WARN, 0.9), "sans", true); rl.name = "Why"; v.add_child(rl)

func _veg_card() -> void:
	var sz := 14 if compact else 15
	var v := CareerKit.card(drawer_body); v.get_parent().name = "VegCard"
	var lvl := int(d.vegLevel)
	var top := HBoxContainer.new(); top.add_theme_constant_override("separation", 8); v.add_child(top)
	var nm := CareerKit.lbl(T("CAR_VEG"), sz + 3, GridTheme.TEXT, "semi"); nm.size_flags_horizontal = Control.SIZE_EXPAND_FILL; top.add_child(nm)
	var mi := CareerKit.btn(T("CAR_MINUS"), false, func(): act("careerVegetation", [maxi(0, lvl - 1)]), 18); mi.name = "VegMinus"; mi.disabled = lvl <= 0; mi.custom_minimum_size.x = 44; top.add_child(mi)
	top.add_child(CareerKit.lbl("%d" % lvl, sz + 5, GridTheme.SODIUM, "title"))
	var pl := CareerKit.btn(T("CAR_PLUS"), false, func(): act("careerVegetation", [mini(3, lvl + 1)]), 18); pl.name = "VegPlus"; pl.disabled = lvl >= 3; pl.custom_minimum_size.x = 44; top.add_child(pl)
	v.add_child(CareerKit.lbl("%s. %s" % [T("CAR_VEG_LVL") % [lvl, T("CAR_VEG_" + str(lvl))], T("CAR_VEG_COST") % str(d.vegCostQText)], sz - 1, Color(GridTheme.TEXT, 0.72), "sans", true))

func _run_tab() -> void:
	var sz := 14 if compact else 15
	drawer_body.add_child(CareerKit.lbl(T("CAR_CREWS_LEFT") % int(d.crewsFree), sz, Color(GridTheme.TEXT, 0.7), "mono"))
	var n := 0
	for p in d.projects:
		if not (str(p.status) == "building" or str(p.status) == "active"): continue
		n += 1
		var v := CareerKit.card(drawer_body); v.get_parent().name = "Run_" + str(p.id)
		var top := HBoxContainer.new(); top.add_theme_constant_override("separation", 8); v.add_child(top)
		var nl := CareerKit.lbl(T("CAR_RUN_LINE") % [str(p.kindName), str(p.target)], sz + 2, GridTheme.TEXT, "semi", true); top.add_child(nl)
		top.add_child(CareerKit.lbl(T("CAR_RUN_" + str(p.status)), sz - 1, GridTheme.SODIUM, "mono"))
		v.add_child(CareerKit.lbl(T("CAR_RUN_STATE") % [int(p.left), int(p.leadQ), str(p.spentText), str(p.capexText)], sz - 1, Color(GridTheme.TEXT, 0.75), "sans", true))
		var pid := str(p.id)
		var cb := CareerKit.btn(T("CAR_CANCEL"), false, func(): act("careerCancel", [pid]), 14); cb.name = "Cancel_" + pid; cb.size_flags_horizontal = Control.SIZE_SHRINK_END; v.add_child(cb)
	if n == 0: drawer_body.add_child(CareerKit.lbl(T("CAR_RUN_NONE"), sz, Color(GridTheme.TEXT, 0.6), "sans", true))

func _req_tab() -> void:
	var sz := 14 if compact else 15
	if (d.requests as Array).is_empty(): drawer_body.add_child(CareerKit.lbl(T("CAR_REQ_NONE"), sz, Color(GridTheme.TEXT, 0.6), "sans", true)); return
	drawer_body.add_child(CareerKit.lbl(T("CAR_REQ_HINT"), sz - 1, Color(GridTheme.TEXT, 0.6), "sans", true))
	for r in d.requests:
		var v := CareerKit.card(drawer_body, GridTheme.SODIUM if int(r.quartersLeft) <= 1 else Color(0, 0, 0, 0)); v.get_parent().name = "Req_" + str(r.id)
		v.add_child(CareerKit.lbl(T("CAR_REQ_LINE") % [str(r.kindName), str(r.feederId)], sz + 3, GridTheme.TEXT, "semi", true))
		var det: String = T("CAR_REQ_DETAIL") % [CareerKit.num(float(r.kw), 0), int(r.customers), str(r.chargeText)]
		if bool(r.critical): det += ", " + T("CAR_REQ_CRIT")
		if float(r.solarKw) > 0.0: det += ", " + T("CAR_REQ_PV") % CareerKit.num(float(r.solarKw), 0)
		v.add_child(CareerKit.lbl(det, sz - 1, Color(GridTheme.TEXT, 0.8), "sans", true))
		var f := feeder_of(str(r.feederId))
		if not f.is_empty(): v.add_child(CareerKit.lbl(T("CAR_REQ_LOAD") % [str(r.feederId), CareerKit.num(float(r.get("loadingWinterPct", f.loadingPct)), 0), CareerKit.num(float(r.get("loadingAfterPct", f.loadingPct)), 0)], sz - 1, CareerKit.load_col(float(r.get("loadingAfterPct", f.loadingPct))), "sans", true))
		var due := T("CAR_REQ_LAST") if int(r.quartersLeft) <= 0 else T("CAR_REQ_DUE") % int(r.quartersLeft)
		var row := HBoxContainer.new(); row.add_theme_constant_override("separation", 8); v.add_child(row)
		var dl := CareerKit.lbl(due, sz - 1, GridTheme.WARN if int(r.quartersLeft) <= 1 else Color(GridTheme.TEXT, 0.7), "mono"); dl.size_flags_horizontal = Control.SIZE_EXPAND_FILL; row.add_child(dl)
		var rid := str(r.id)
		var ab := CareerKit.btn(T("CAR_ACCEPT"), true, func(): act("careerAccept", [rid]), 15); ab.name = "Accept_" + rid; row.add_child(ab)
		var fid := str(r.feederId)
		var show := CareerKit.btn(str(r.feederId), false, func():
			var f2 := feeder_of(fid)
			if not f2.is_empty() and not (f2.sections as Array).is_empty(): _on_pick({"type": "section", "id": str(f2.sections[0].id), "feeder": fid}), 14); show.name = "Show_" + rid; row.add_child(show)
