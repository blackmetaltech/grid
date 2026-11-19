extends SceneTree
## Grid tray flow (generic tray of the grid levels without a terrain), headless with the real engine bridge on L07 "The Lagging Mill": the cells are the engine's palette;
## placing the capacitor bank through the tray is the engine's state (and budget); a refusal shows the engine's message on the radio; the operate tag steps the bank and
## switches the line; the locked tray changes nothing; keyboard, pad and world taps drive the same flow; a new action in a palette is one more cell without an edit.

func _initialize() -> void:
	var T := Truth.new()
	if not T.start(root): print("GRID-TRAY-FLOW FAILED engine"); quit(1); return
	CbRegion.refresh(T.b); GridUi.load_strings(); TrayStrings.load_strings()
	var world := WorldView.new(); world.size = Vector2(1400, 800); root.add_child(world)
	var radio := RadioLog.new(); root.add_child(radio)
	var ins := Instruments.new(); root.add_child(ins)
	var tray := GridTray.new(); tray.b = T.b; tray.world = world; tray.radio = radio; tray.instruments = ins
	var cues: Array = []; tray.sfx = func(c): cues.append(c)
	var lock := [false]; tray.locked = func() -> bool: return lock[0]
	root.add_child(tray); tray.size = Vector2(1100.0, 96.0)
	var sync := func():
		world.refresh(T.b); tray.refresh()
	var sys := func() -> Array: return radio.lines.filter(func(l): return l.speaker == "SYS")
	# ---- cells = palette ----
	T.level("L07"); sync.call()
	T.check(tray.visible, "the grid tray shows on a grid level without a terrain")
	var pal: Array = T.b.q("palette").actions
	var place: Array = tray.items.filter(func(i): return i.kind == "place")
	var want: Array = []
	for a in pal: for p in a.parts: want.append("%s/%s" % [a.action, p])
	T.check(place.map(func(i): return "%s/%s" % [i.action, i.part]) == want, "one cell per part of the palette (%s)" % str(want))
	T.check(tray.items.filter(func(i): return i.kind == "knob").map(func(i): return i.id) == ["steps", "circuits", "km"], "knob cells: bank steps, line circuits and length")
	T.check(tray.items.filter(func(i): return i.kind == "op").map(func(i): return i.action) == ["demolish"], "operate cells: remove (the level has no breaker action)")
	T.check(tray.items[tray.place_index("placeShunt", "cap-11-900")].icon == "capacitor" and tray.items[tray.place_index("stringLine", "l11-rabbit")].icon == "line", "icons by part kind")
	var cap: Dictionary = tray.items[tray.place_index("placeShunt", "cap-11-900")]
	T.check(tray.caption(cap) == ["Cap bank", "900kVAr"] and tray.caption(tray.items[tray.place_index("stringLine", "l11-rabbit")]) == ["Rabbit", "11kV"], "captions: %s" % str(tray.caption(cap)))
	for i in tray.items.size():   # every caption fits its cell at 1100 wide: names shrink or trim, never run over
		var cp: Array = tray.caption(tray.items[i]); T.check(str(cp[0]) != "" and str(cp[1]) != "", "cell %d has both captions" % i)
	# ---- place: pick the part, the buses glow, click one ----
	var spent0 := float(T.b.g.budget.spent)
	tray.activate(tray.place_index("placeShunt", "cap-11-900"))
	T.check(tray.mode == "pick" and world.peg_count() == 2, "the capacitor bank lights both buses (%d pegs)" % world.peg_count())
	T.check(tray.chip_text.begins_with("Click a bus"), "the chip tells what to click: '%s'" % tray.chip_text)
	# ---- refusal on a wrong bus: the engine's message on the radio and the chip ----
	var nsys: int = sys.call().size()
	var bad: Dictionary = tray.press_target("B9")
	T.check(not bad.get("ok", true) and (T.b.g.shunts as Array).is_empty(), "a wrong bus is refused and nothing is placed")
	T.check(sys.call().size() == nsys + 1 and str(sys.call()[-1].text) == str(bad.message) and tray.chip_text == str(bad.message) and str(bad.message) != "", "the refusal is the engine's message on the radio and the chip: '%s'" % str(bad.get("message", "")))
	T.check(cues.has("bad"), "refusal cue")
	# ---- the placement through the tray is the engine's state ----
	tray.knobs.steps = 1
	var good: Dictionary = tray.press_target("B2"); sync.call()
	T.check(good.get("ok", false), "press B2 places the bank: %s" % str(good.get("message", good)))
	var shunts: Array = T.b.g.shunts
	T.check(shunts.size() == 1 and str(shunts[0].bus) == "B2" and str(shunts[0].catalogId) == "cap-11-900" and int(shunts[0].steps) == 1, "the engine has C1 of cap-11-900 at B2: %s" % str(shunts))
	var ref := Truth.new(); ref.start(root); ref.level("L07"); ref.b.act("placeShunt", ["B2", "cap-11-900", 1])
	T.near(float(T.b.g.budget.spent) - spent0, float(ref.b.g.budget.spent), 0.011, "the budget spent is the engine's price of the bank")
	T.check(cues.has("place") and tray.mode == "pick", "place cue; the part stays armed")
	tray.cancel_key(); T.check(tray.mode == "" and world.peg_count() == 0, "Esc puts the part away and the pegs go")
	ref.b.queue_free()
	# ---- operate tag: steps and the breaker ----
	T.check(tray.open_op("shunt", "C1") and tray.op_open() and tray.op_panel.visible, "the bank's operate tag opens")
	var rows: Array = tray.op_rows("shunt", "C1").map(func(r): return r.action)
	T.check(rows == ["setShuntSteps", "setShuntAuto", "demolish"], "operate rows come from the palette: %s" % str(rows))
	var r1: Dictionary = tray.op_do("setShuntSteps", ["C1", 1]); sync.call()
	T.check(r1.get("ok", false) and int(T.b.g.shunts[0].on) == 1, "steps in 1 through the tag: engine on=%d" % int(T.b.g.shunts[0].on))
	var plus: Button = tray.op_panel.find_child("p_setShuntSteps", true, false)
	T.check(plus != null and plus.disabled == false, "the + button exists")
	var nsys2: int = sys.call().size()
	var r2: Dictionary = tray.op_do("setShuntSteps", ["C1", 3]); sync.call()
	T.check(not r2.get("ok", true) and sys.call().size() == nsys2 + 1 and int(T.b.g.shunts[0].on) == 1, "more steps than the bank has is refused on the radio")
	tray.op_do("setShuntSteps", ["C1", 0]); sync.call()
	T.check(int(T.b.g.shunts[0].on) == 0, "the - button side: steps back to 0")
	tray.close_op(); T.check(not tray.op_open(), "the tag closes")
	# ---- generic: a new action / part in a palette is one more cell and works through the same flow ----
	var fake := {"active": true, "level": "X", "actions": [{"action": "placeShunt", "parts": ["cap-11-300"]}, {"action": "placeStorage", "parts": ["bess-4h-50"]}, {"action": "setTap", "parts": []}, {"action": "switchBranch", "parts": []}, {"action": "placeFoo", "parts": ["foo-7"]}]}
	tray.build_items(fake)
	T.check(tray.items.map(func(i): return i.kind + ":" + i.id) == ["place:cap-11-300", "knob:steps", "place:bess-4h-50", "place:foo-7", "op:switchBranch"], "a palette with a new part and action makes cells: %s" % str(tray.items.map(func(i): return i.kind + ":" + i.id)))
	T.check(tray.items[2].icon == "battery" and tray.items[3].icon == "part", "the unknown part gets the generic icon")
	T.check(tray.args_of(tray.items[3]) == ["", "foo-7"], "a generic part's args are [bus, part]")
	sync.call()
	# ---- breaker cell (no grid level without a terrain allows switchBranch yet: a palette of our own, so the engine's "not allowed" is the refusal) ----
	tray.build_items({"active": true, "actions": [{"action": "switchBranch", "parts": ["T1"]}, {"action": "demolish", "parts": []}]})
	var bi: int = tray.item_index("op", "switchBranch")
	T.check(bi == 0 and tray.items[bi].only == ["T1"] and tray.item_index("op", "demolish") == 1, "the breaker is an operate cell limited to the palette's T1")
	tray.activate(bi)
	T.check(tray.mode == "pick" and world.peg_count() == 1 and tray.chip_text.begins_with("Click a line"), "the breaker cell lights only the allowed line (%d)" % world.peg_count())
	tray.picks = ["T1"]
	T.check(tray.args_of(tray.items[bi]) == ["T1", false], "a closed line's breaker args are [T1, open]: %s" % str(tray.args_of(tray.items[bi])))
	tray.picks = []
	var nsb: int = sys.call().size()
	var rb: Dictionary = tray.press_target("T1"); sync.call()
	T.check(not rb.get("ok", true) and sys.call().size() == nsb + 1 and bool(T.b.g.branches[0].inService), "the engine does not allow it in L07: refusal on the radio, line unchanged")
	tray.cancel()
	tray.build_items({"active": true, "actions": [{"action": "demolish", "parts": []}]}); tray.activate(0)
	T.check(tray.mode == "pick" and world.peg_count() == 3, "remove lights every element: the line, the generator and the bank (%d)" % world.peg_count())
	tray.cancel(); tray.build_items(T.b.q("palette"))
	# ---- locked: the night runs ----
	lock[0] = true
	var n0: int = (T.b.g.shunts as Array).size(); var nsys3: int = sys.call().size()
	tray.activate(tray.place_index("placeShunt", "cap-11-900"))
	T.check(tray.mode == "" and sys.call().size() == nsys3 + 1 and (T.b.g.shunts as Array).size() == n0, "a build cell does nothing while the night runs and the radio says why")
	T.check(not tray.op_do("demolish", ["C1"]).get("ok", false) and (T.b.g.shunts as Array).size() == n0, "removing is locked too")
	lock[0] = false
	# ---- world tap, keyboard and pad ----
	tray.activate(tray.place_index("placeShunt", "cap-11-300")); tray.knobs.steps = 2
	var sp: Vector2 = world.world_to_screen(Vector2(12, 2), 14.0)
	T.check(tray.on_tap(sp + Vector2(4, 3)), "a tap on the B2 peg is used by the tray")
	sync.call()
	T.check((T.b.g.shunts as Array).size() == 2 and str(T.b.g.shunts[1].bus) == "B2" and int(T.b.g.shunts[1].steps) == 2, "the tap placed a 2-step 300 kVAr bank at B2")
	tray.cancel()
	var ev := InputEventKey.new(); ev.pressed = true; ev.keycode = KEY_1
	tray.build_items(T.b.q("palette"))
	T.check(tray.key(ev) and tray.mode == "pick" and str(tray.items[tray.armed].part) == "cap-11-300", "key 1 arms the first cell")
	var tb := InputEventKey.new(); tb.pressed = true; tb.keycode = KEY_TAB
	T.check(tray.key(tb) and tray.target_hi == 0, "Tab walks to the first peg")
	var en := InputEventKey.new(); en.pressed = true; en.keycode = KEY_ENTER
	var cnt: int = (T.b.g.shunts as Array).size()
	T.check(tray.key(en), "Enter picks the highlighted peg"); sync.call()
	T.check((T.b.g.shunts as Array).size() == cnt + 1 and str(T.b.g.shunts[cnt].bus) == "B1", "Enter placed a bank at the first bus (B1)")
	var bs := InputEventKey.new(); bs.pressed = true; bs.keycode = KEY_BACKSPACE
	T.check(tray.key(bs) and tray.mode == "", "Backspace with no pick steps out of the part")
	var sh := InputEventKey.new(); sh.pressed = true; sh.keycode = KEY_4; sh.shift_pressed = false
	var ki: int = tray.item_index("knob", "steps")
	var before: int = int(tray.knobs.steps); tray.activate(ki); T.check(int(tray.knobs.steps) == mini(4, before + 1), "a knob cell steps up (%d)" % int(tray.knobs.steps))
	tray.activate(ki, true); T.check(int(tray.knobs.steps) == before, "and down")
	# pad: RB cycles cells, A arms, D-pad walks the pegs, A picks, B takes back
	tray.cancel(); tray.focus = -1; tray.engaged = false
	T.check(tray.pad_button(JOY_BUTTON_RIGHT_SHOULDER) and tray.engaged and tray.focus == 0, "RB engages the cells on the first one")
	T.check(tray.pad_button(JOY_BUTTON_A) and tray.mode == "pick", "A arms the focused cell")
	T.check(tray.pad_button(JOY_BUTTON_DPAD_RIGHT) and tray.target_hi == 0 and tray.pad_button(JOY_BUTTON_DPAD_RIGHT) and tray.target_hi == 1, "the D-pad walks the pegs")
	var cnt2: int = (T.b.g.shunts as Array).size()
	T.check(tray.pad_button(JOY_BUTTON_A), "A picks the peg"); sync.call()
	T.check((T.b.g.shunts as Array).size() == cnt2 + 1, "the pad placed a bank")
	T.check(tray.pad_button(JOY_BUTTON_B) and tray.mode == "", "B puts the part away")
	tray.focus = tray.item_index("knob", "steps") - 1
	T.check(tray.pad_button(JOY_BUTTON_RIGHT_SHOULDER) and tray.items[tray.focus].kind == "knob", "RB walks on to a knob cell")
	var kv0: float = float(tray.knobs[tray.items[tray.focus].id])
	T.check(tray.pad_button(JOY_BUTTON_DPAD_RIGHT) and float(tray.knobs[tray.items[tray.focus].id]) != kv0, "the D-pad steps the focused knob")
	T.check(tray.pad_button(JOY_BUTTON_Y) and tray.op_open(), "Y hangs the operate tag of the next element")
	tray.close_op()
	# ---- level change clears the tray ----
	T.level("L01"); sync.call()
	T.check(not tray.visible and world.peg_count() == 0 and not tray.op_open(), "a bench level hides the grid tray")
	# every place cell sends its arguments in the engine's order: a gas unit picked on L20's bus is built (the tray once sent the bus as the part)
	tray.cancel(); T.level("L20"); sync.call()
	var gi := tray.place_index("placeUnit", "ocgt-105"); T.check(gi >= 0, "L20 offers the gas unit")
	if gi >= 0:
		var nu := (T.b.g.units as Array).size()
		tray.activate(gi); sync.call(); var r := tray.press_target("B1"); sync.call()
		T.check(bool(r.get("ok", false)) and (T.b.g.units as Array).size() == nu + 1 and str(T.b.g.units.back().catalogId) == "ocgt-105", "a gas unit placed from the tray is built on B1 (%s)" % str(r.get("message", "")))
	# L16: Start / Stop on a generator's tag show the order at once (the tag looked unchanged) and a bus tag has no anonymous Remove rows
	tray.cancel(); T.level("L16"); sync.call()
	T.check(tray.open_op("unit", "U1"), "L16: the generator tag opens")
	var stl := tray.op_panel.find_child("state_commit", true, false) as Label
	T.check(stl != null and stl.text == "running", "the unit reads running (%s)" % (stl.text if stl != null else "none"))
	tray.op_do("commit", ["U1", false]); sync.call()
	stl = tray.op_panel.find_child("state_commit", true, false) as Label
	T.check(stl != null and stl.text == "stopped", "Stop reads stopped at once (%s)" % (stl.text if stl != null else "none"))
	tray.close_op()
	T.check(tray.op_rows("bus", "B2").all(func(r): return str(r.action) != "demolish"), "a bus tag offers no Remove for the town's loads")
	T.finish("GRID-TRAY-FLOW", self)
