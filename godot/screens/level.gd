extends CbScreen
## The level drawer: the brief, progress (held / holdTicks, ticks used / max), the concepts behind it, and the level list for free play.

func build(b: VBoxContainer) -> void:
	var lv = app.b.q("level")
	var f: Dictionary = app.b.q("flows")
	CbKit.header(b, "Level", "A short challenge with one idea in it.")
	if lv == null:
		var p := CbKit.panel("Free play", true, b); var v: VBoxContainer = p[1]
		v.add_child(CbKit.label("You are playing without a goal. The target band is on the tank; hold the depth inside it for %d ticks to see how a level plays." % int(f.get("holdTicks", 10)), 16, CbKit.TX, true))
		for l in app.b.levels():
			var id: String = str(l.id)
			var bt := CbKit.btn("%s\n%s" % [str(l.title).to_upper(), str(l.get("brief", ""))], func(): app.start_level(id), "pri", 16)
			bt.alignment = HORIZONTAL_ALIGNMENT_LEFT; bt.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; bt.custom_minimum_size = Vector2(0, 84); bt.size_flags_horizontal = Control.SIZE_EXPAND_FILL; v.add_child(bt)
		return
	var st := str(lv.status)
	var col: Color = CbKit.GR if st == "won" else (CbKit.RD if st == "lost" else CbKit.ACC)
	var p2 := CbKit.panel(str(lv.title), true, b); var v2: VBoxContainer = p2[1]
	v2.add_child(CbKit.label(str(lv.brief), 17, CbKit.TX, true))
	var band: Array = f.get("band", [1.0, 1.2])
	v2.add_child(CbKit.label("Target: depth between %.1f and %.1f m." % [float(band[0]), float(band[1])], 16, CbKit.ACC2, true))
	var held := int(f.get("held", 0)); var need := int(f.get("holdTicks", 10))
	v2.add_child(CbKit.label("HELD IN THE BAND", 12, CbKit.DIM))
	var hb := HBoxContainer.new(); hb.add_theme_constant_override("separation", 12); v2.add_child(hb)
	var bar := CbKit.bar(float(held), float(need)); bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL; bar.size_flags_vertical = Control.SIZE_SHRINK_CENTER; hb.add_child(bar)
	hb.add_child(CbKit.label("%d / %d" % [held, need], 22, CbKit.GR if held > 0 else CbKit.TX))
	if lv.get("maxTicks") != null:
		var used := int(lv.ticksUsed); var mx := int(lv.maxTicks)
		v2.add_child(CbKit.label("TIME USED", 12, CbKit.DIM))
		var tb := HBoxContainer.new(); tb.add_theme_constant_override("separation", 12); v2.add_child(tb)
		var bar2 := CbKit.bar(float(used), float(mx), used > mx * 0.7); bar2.size_flags_horizontal = Control.SIZE_EXPAND_FILL; bar2.size_flags_vertical = Control.SIZE_SHRINK_CENTER; tb.add_child(bar2)
		tb.add_child(CbKit.label("%d / %d ticks" % [used, mx], 18, CbKit.TX))
	v2.add_child(CbKit.chip(("PASSED" if st == "won" else ("FAILED" if st == "lost" else "IN PROGRESS")), col, 14))
	if str(lv.get("reason", "")) != "": v2.add_child(CbKit.label(str(lv.reason), 16, col, true))
	var fl := HFlowContainer.new(); fl.add_theme_constant_override("h_separation", 8); fl.add_theme_constant_override("v_separation", 8); v2.add_child(fl)
	fl.add_child(CbKit.btn("Restart level", func(): app.start_level(str(lv.id), true), "", 15))
	var cids: Array = []
	for l in app.b.levels():
		if str(l.id) == str(lv.id): cids = l.get("concepts", [])
	if not cids.is_empty():
		var pc := CbKit.panel("The ideas in this level", false, b); var cv: VBoxContainer = pc[1]
		var cf := HFlowContainer.new(); cf.add_theme_constant_override("h_separation", 8); cf.add_theme_constant_override("v_separation", 8); cv.add_child(cf)
		for c in app.b.concepts():
			if cids.has(c.id):
				var cid: String = str(c.id)
				cf.add_child(CbKit.btn("%s  %s" % [str(c.get("icon", "")), c.name], func(): app.learn(cid), "", 15))
