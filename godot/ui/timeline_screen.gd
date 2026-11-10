class_name GridTimelineScreen
extends CbScreen
## Timeline drawer: demand, frequency trace and worst voltage per block from the engine's `timeline` query, event markers from `whyCard`, and a
## scrubber that reads one block's numbers. (The replay controls belong to M2.5.)

var cursor := -1   ## -1 = latest
var _charts: Array = []
var _info: Label = null
var _t: Dictionary = {}

func build(b: VBoxContainer) -> void:
	GridUi.load_strings()
	CbKit.header(b, tr("TL_TITLE"), tr("TL_HINT"))
	var t = app.b.q("timeline")
	if not (t is Dictionary) or (t.block as Array).size() < 2: b.add_child(CbKit.label(tr("TL_EMPTY"), 16, CbKit.DIM, true)); return
	_t = t; _charts = []
	var n := (t.block as Array).size()
	var cur := n - 1 if cursor < 0 or cursor >= n else cursor
	var wc = app.b.q("whyCard"); var marks: Array = []
	var evs: Array = [] if not (wc is Dictionary) else wc.entries
	for e in evs:
		for i in n:
			if int(t.day[i]) == int(e.day) and int(t.block[i]) == int(e.block): marks.append(i); break
	var dq = app.b.q("dial")
	var guide: Array = []
	if dq is Dictionary and not dq.get("error", false): guide = [dq.stdLo, dq.stdHi]
	var pn := CbKit.panel("", false, b); var v: VBoxContainer = pn[1]
	for spec in [[tr("TL_DEMAND"), "demandMW", Color("#FFB020"), [], 1], [tr("TL_FREQ"), "fHz", Color("#39E1FF"), guide, 2], [tr("TL_VOLT"), "worstVPu", Color("#7CFFB2"), [], 3]]:
		var ch := GridChart.new(); ch.title = spec[0]; ch.ys = t[spec[1]]; ch.col = spec[2]; ch.guide = spec[3]; ch.dec = spec[4]
		if spec[1] == "fHz" and dq is Dictionary and not dq.get("error", false): ch.lo_fixed = float(dq.f0) - DialMath.HALF_SPAN; ch.hi_fixed = float(dq.f0) + DialMath.HALF_SPAN; ch.peg = true
		ch.marks = marks; ch.cursor = cur; ch.name = "chart_" + str(spec[1])
		v.add_child(ch); _charts.append(ch)
	_info = CbKit.label("", 15, CbKit.TX, true); v.add_child(_info); _show(cur)
	var sl := CbKit.slider(float(cur), 0.0, float(n - 1), 1.0, func(x): cursor = int(x); _show(int(x)))
	sl.name = "scrub"; v.add_child(sl)
	v.add_child(CbKit.label(tr("TL_SCRUB"), 12, CbKit.DIM))
	var ep := CbKit.panel(tr("TL_EVENTS"), false, b); var ev: VBoxContainer = ep[1]
	if evs.is_empty(): ev.add_child(CbKit.label(tr("TL_NO_EVENTS"), 14, CbKit.DIM, true))
	for e in evs.slice(0, 8):
		var hr := int(e.block) / 4; var mn := (int(e.block) % 4) * 15
		ev.add_child(CbKit.label(tr("TL_EVENT_FMT") % [int(e.day) + 1, hr, mn, str(e.message)], 14, CbKit.AM, true))

func _show(i: int) -> void:
	var t := _t
	var hh := int(t.block[i]) / 4; var mm := (int(t.block[i]) % 4) * 15
	_info.text = "%s   %s  %s  %s" % [tr("TL_AT_FMT") % [int(t.day[i]) + 1, hh, mm], tr("INSP_MW_FMT") % ("%.1f" % float(t.demandMW[i])), tr("HUD_HZ") % ("%.2f" % float(t.fHz[i])), tr("TL_V_FMT") % ("%.3f" % float(t.worstVPu[i]))]
	for c in _charts: (c as GridChart).cursor = i; (c as GridChart).queue_redraw()
