extends SceneTree
## Tray flow (UI.md 3), headless with the real engine bridge: pick the hut -> its sites light up as pegs -> pick a peg -> engine state has hutM; pick a
## reel -> engine state has cableMm2.main; hover shows the engine preview as a ghost needle and a chip; a refusal is a SYS radio line; L02 takes the
## junction and a reel on each run; L03 takes the converter pair; taps on the world pick pegs and hamlets.

func _initialize() -> void:
	var T := Truth.new()
	if not T.start(root): print("TRAY-FLOW FAILED engine"); quit(1); return
	CbRegion.refresh(T.b)
	var world := WorldView.new(); world.size = Vector2(1400, 800); root.add_child(world)
	var radio := RadioLog.new(); root.add_child(radio)
	var ins := Instruments.new(); root.add_child(ins)
	var tags := TagView.new(); tags.b = T.b; tags.world = world; root.add_child(tags)
	var tray := KitTray.new(); tray.b = T.b; tray.world = world; tray.radio = radio; tray.instruments = ins; tray.tags = tags
	var cues: Array = []; tray.sfx = func(c): cues.append(c)
	root.add_child(tray); tray.size = Vector2(1100.0, 96.0)
	var sync := func():
		world.refresh(T.b); ins.volt.visible = true; tray.refresh()
	# ---- L01 ----
	T.level("L01"); sync.call()
	T.check(tray.visible, "tray shows on a bench level")
	var kinds: Array = tray.items.map(func(i): return i.kind)
	T.check(kinds.count("hut") == 1 and kinds.count("reel") == 8 and not kinds.has("junction") and not kinds.has("converters"), "L01 tray: the hut and 8 reels only (%s)" % str(kinds))
	var kit: Dictionary = T.b.q("benchKit")
	for i in tray.items.size():
		var it: Dictionary = tray.items[i]
		if it.kind != "reel": continue
		var c = kit.cables.filter(func(x): return is_equal_approx(float(x.mm2), float(it.mm2)))
		T.check(c.size() == 1 and str(c[0].perMText) == str(it.price), "reel %s: price per metre is the engine's (%s)" % [it.mm2, it.price])
	T.check(TrayStrings.S.has("TRAY_PER_M"), "strings")
	# a reel before the hut: the engine refuses, the radio says so
	var r25 := tray.item_index("reel", 25.0)
	tray.activate(r25); sync.call()
	var last: Dictionary = radio.lines.back() if not radio.lines.is_empty() else {}
	T.check(not radio.lines.is_empty() and last.speaker == "SYS" and last.kind == "warn" and str(last.text) != "", "refusal (reel before hut) is a SYS warning on the radio: '%s'" % str(last.get("text", "")))
	T.check(T.b.q("benchStatus").bench.cableMm2.main == null, "nothing was laid")
	# hover a reel with no hut: needs-hut chip, no ghost
	tray.hover = r25; tray._after_hover()
	T.check(tray.chip_text == tray.tx("CHIP_NEEDS_HUT") and is_nan(ins.volt.ghost), "hover before the hut: 'place the hut first', no ghost needle (%s)" % tray.chip_text)
	tray.hover = -1; tray._after_hover()
	T.check(is_nan(ins.volt.ghost) and tray.chip_text == "", "no hover: no ghost")
	# the hut and its pegs
	var sites: Array = []
	for s in T.b.q("levelInfo").sites: if s.id == "hut": sites = s.options
	tray.activate(tray.item_index("hut")); sync.call()
	T.check(tray.mode == "hut" and tray.targets.size() == sites.size() and world.peg_count() == sites.size(), "hut picked: %d pegs on the map (%d)" % [sites.size(), world.peg_count()])
	for i in tray.targets.size():
		var want := float(str(sites[i]).get_slice("-", 1))
		T.check(float(tray.targets[i].key) == want and tray.targets[i].tile == WorldModel.l01_hut_pos(want), "peg %d is the %d m site on the beach" % [i, int(want)])
	# a tap on a peg places the hut
	var tile: Vector2 = tray.targets[3].tile
	var sp := world.world_to_screen(tile, 0.0)
	var pk := world.pick(sp + Vector2(0, -8))
	T.check(pk.get("kind") == "peg" and int(pk.id) == 3, "pick() finds the peg under the pointer (%s)" % str(pk))
	tray.on_hover(sp + Vector2(0, -8))
	T.check(tray.target_hi == 3 and tray.chip_text.begins_with("%d m" % int(tray.targets[3].key)), "hovering a peg previews the site: '%s'" % tray.chip_text)
	T.check(tray.on_tap(sp + Vector2(0, -8)), "tap on the peg is used by the tray")
	sync.call()
	var bn: Dictionary = T.b.q("benchStatus").bench
	T.check(bn.hutM != null and int(bn.hutM) == 210, "engine state has hutM 210 (%s)" % str(bn.hutM))
	T.check(tray.mode == "" and world.peg_count() == 0, "pegs go away after placing")
	T.check(cues.has("place"), "place cue requested")
	# hover reels: engine preview as ghost + chip
	for mm2 in [2.5, 10.0, 25.0, 50.0]:
		var i := tray.item_index("reel", mm2)
		tray.hover = i; tray._after_hover()
		var pv: Dictionary = T.b.q("benchPreview", [{"mm2": mm2, "run": "main"}])
		T.check(pv.ok and absf(ins.volt.ghost - float(pv.vMinV)) < 1e-9, "%s mm2: ghost needle at the preview voltage (%.2f)" % [mm2, float(pv.vMinV)])
		T.check(absf(ins.volt.ghost_value() - float(pv.vMinV)) < 0.06, "%s mm2: the drawn ghost angle maps back to it" % mm2)
		T.check(tray.chip_text.begins_with("→ %.1f V" % float(pv.vMinV)), "%s mm2: chip '%s'" % [mm2, tray.chip_text])
		T.check(tray.chip_text.ends_with(CbRegion.money(float(pv.capexUSD))), "%s mm2: chip shows the engine cost" % mm2)
	tray.hover = tray.item_index("reel", 25.0); tray._after_hover()
	var promised: float = T.b.q("benchPreview", [{"mm2": 25.0, "run": "main"}]).vMinV
	tray.hover = -1; tray._after_hover()
	tray.activate(tray.item_index("reel", 25.0)); sync.call()
	T.check(T.b.q("benchStatus").bench.cableMm2.main == 25.0, "engine state has cableMm2.main = 25")
	T.near(float(T.b.q("benchStatus").vMinV), promised, 1e-3, "what the ghost promised is what the engine delivers")
	T.check(cues.has("reel"), "reel cue requested")
	# hut preview with the laid cable
	tray.activate(tray.item_index("hut")); sync.call(); tray.set_target_hi(0)
	var hp: Dictionary = T.b.q("benchPreview", [{"hutM": 120.0, "mm2": 25.0}])
	T.check(absf(ins.volt.ghost - float(hp.vMinV)) < 1e-9 and tray.chip_text.begins_with("120 m → %.1f V" % float(hp.vMinV)), "hut peg hover with a laid cable: ghost + chip (%s)" % tray.chip_text)
	T.check(tray.cancel() and world.peg_count() == 0 and is_nan(ins.volt.ghost), "cancel clears pegs and ghost")
	# the price tag numbers come from the engine
	T.check(str(kit.budgetText) != "" and str(T.b.q("benchKit").spentText) != "", "budget and spent come formatted from the engine")
	# a tap on a hamlet / cable opens a tag (tags are non-modal and need no tray mode)
	var h1: Dictionary = {}
	for t in world.model.towns: h1 = t
	var hp2 := world.world_to_screen(h1.pos, 10.0)
	T.check(world.pick(hp2).get("kind") == "hamlet", "pick finds the hamlet")
	T.check(tags.on_tap(hp2) and tags.is_open() and tags.kind == "hamlet", "tap on the hamlet opens its tag")
	T.check(tags.on_tap(Vector2(5, 5)) == true and not tags.is_open(), "tap on empty ground closes it")
	var cpts: Array = world.run_pts("main"); var mid := world.world_to_screen(world.run_mid_tile("main"), 0.0)
	var cp := world.anchor("cable", "main")
	T.check(not is_nan(cp.x) and world.pick(cp).get("kind") == "cable", "pick finds the cable at its anchor (%s)" % str(world.pick(cp)))
	tags.on_tap(cp); T.check(tags.is_open() and tags.kind == "cable", "tap on the cable opens its tag")
	tags.pad_cycle(); T.check(not tags.is_open(), "pad Y on the last object closes")
	tags.pad_cycle(); T.check(tags.is_open() and tags.kind == "hamlet", "pad Y again starts at the first object")
	tags.pad_cycle(); T.check(tags.is_open() and tags.kind == "hut", "pad Y walks to the next object")
	T.check(tags.close() and not tags.is_open(), "close")
	# ---- L02 ----
	T.level("L02"); sync.call()
	kinds = tray.items.map(func(i): return i.kind)
	T.check(kinds.has("junction") and kinds.count("reel") == 8 and not kinds.has("hut"), "L02 tray: junction box and reels (%s)" % str(kinds))
	tray.activate(tray.item_index("junction")); sync.call()
	T.check(T.b.q("benchStatus").bench.topology == "trunk", "junction box -> trunk topology")
	tray.activate(tray.item_index("reel", 16.0)); sync.call()
	T.check(tray.mode == "reel" and tray.targets.size() == 2 and world.peg_count() == 2, "L02: a reel waits for a run (2 handles)")
	tray.set_target_hi(0)
	var p2: Dictionary = T.b.q("benchPreview", [{"mm2": 16.0, "run": "main"}])
	T.check(tray.chip_text.contains(CbRegion.money(float(p2.capexUSD))), "run hover shows the engine cost (%s)" % tray.chip_text)
	T.check(tray.place_target(0).get("ok", false), "reel on the trunk")
	sync.call()
	T.check(tray.mode == "reel", "the reel stays armed for the other run")
	T.check(tray.place_target(1).get("ok", false), "same reel on the branches")
	sync.call()
	var cm: Dictionary = T.b.q("benchStatus").bench.cableMm2
	T.check(cm.main == 16.0 and cm.b == 16.0, "engine state has both runs at 16 mm2 (%s)" % str(cm))
	T.check(tray.cancel() and tray.mode == "", "cancel disarms")
	# ---- L03 ----
	T.level("L03"); sync.call()
	kinds = tray.items.map(func(i): return i.kind)
	T.check(kinds.has("converters") and kinds.count("reel") == 8, "L03 tray: converter pair and reels (%s)" % str(kinds))
	tray.activate(tray.item_index("converters")); sync.call()
	T.check(T.b.q("benchStatus").bench.converters == true, "converter pair fitted")
	tray.activate(tray.item_index("reel", 10.0)); sync.call()
	T.check(T.b.q("benchStatus").bench.cableMm2.main == 10.0, "L03 reel lays the long run")
	tray.activate(tray.item_index("converters")); sync.call()
	T.check(T.b.q("benchStatus").bench.converters == false, "second pick removes the pair")
	# ---- keys / pad ----
	T.level("L01"); sync.call()
	var ev := InputEventKey.new(); ev.pressed = true; ev.keycode = KEY_H
	T.check(tray.key(ev) and tray.mode == "hut", "H picks the hut")
	ev.keycode = KEY_TAB; tray.key(ev); T.check(tray.target_hi == 0, "Tab walks the pegs")
	ev.keycode = KEY_ENTER; tray.key(ev); sync.call(); T.check(int(T.b.q("benchStatus").bench.hutM) == 120, "Enter places the highlighted peg")
	ev.keycode = KEY_2; T.check(tray.key(ev), "number key picks the item")
	T.check(tray.pad_button(JOY_BUTTON_RIGHT_SHOULDER) and tray.engaged, "RB engages the tray")
	T.check(tray.pad_button(JOY_BUTTON_B) and not tray.engaged, "B leaves it")
	tray.activate(tray.item_index("hut")); sync.call()
	T.check(tray.pad_button(JOY_BUTTON_DPAD_RIGHT) and tray.target_hi == 0 and tray.pad_button(JOY_BUTTON_DPAD_RIGHT) and tray.target_hi == 1, "D-pad walks pegs")
	T.check(tray.pad_button(JOY_BUTTON_A), "A places"); sync.call()
	T.check(int(T.b.q("benchStatus").bench.hutM) == 150, "pad placed the 150 m site")
	T.check(tray.pad_button(JOY_BUTTON_Y), "Y opens a tag"); T.check(tags.is_open(), "a tag is open")
	T.check(tray.mode == "" and not tray.cancel(), "nothing armed")
	T.finish("TRAY-FLOW", self)
