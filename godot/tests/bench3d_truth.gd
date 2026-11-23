extends SceneTree
## Chapter 2's 3D benches show the engine's numbers (world3d/bench3d.gd), read back from the scene it builds and from the raw `ch2Bench` query:
## L04: the rotor has exactly the engine's pole count and the stator one coil bundle per pole; the bundles thicken with the turns; the air gap glows
## more with more field; the village's bulbs are (V / 230)^2 of the rms voltage (0 at 0 V), rising with the voltage, amber below the band, and
## flicker only far below 50 Hz. L06: the line glows more the larger the share it loses (plain metal at the 2 % limit and under), the transformer
## pads stand only when the ratio is above 1, the town's windows are (V_town / V_nominal)^2. Both: the land reaches at least 3x the play area's
## size past it on every side, so no camera sees an edge.

class Fake extends CbApp:
	var grid_world = null
	func game_on_changed() -> void: pass
	func toast(_text: String, _level := "info") -> void: pass
	func sfx(_k: String) -> void: pass

func _initialize() -> void:
	var T := Truth.new()
	if not T.start(root): print("BENCH3D-TRUTH FAILED engine"); quit(1); return
	_l04(T)
	_l06(T)
	await _input_pass(T)
	T.check(Bench3D.LEVELS.has("L04") and Bench3D.LEVELS.has("L06"), "L04 and L06 are drawn by the 3D bench")
	T.finish("BENCH3D-TRUTH", self)

func _act(T: Truth, bn: Bench3D, act: String, arg) -> Dictionary:
	var r: Dictionary = T.b.act(act, [arg])
	T.check(bool(r.get("ok", false)), "%s %s accepted: %s" % [act, str(arg), str(r.get("message", ""))])
	var q: Dictionary = T.b.q("ch2Bench")
	bn.set_bench(q, 1080.0)
	return q

func _ground(T: Truth, bn: Bench3D, tag: String) -> void:
	var p := bn.play_rect(); var g := bn.ground_rect()
	var m := 3.0 * maxf(p.size.x, p.size.y)
	T.check(p.size.x > 0.0 and g.encloses(p.grow(m)), "%s: the land %s reaches 3x the play area %s past it on every side" % [tag, str(g), str(p)])
	for c in [p.position - Vector2(m, m), p.end + Vector2(m, m), Vector2(p.position.x - m, p.end.y + m), Vector2(p.end.x + m, p.position.y - m)]:
		var h := bn.ground(c.x, c.y)
		T.check(not is_nan(h) and h > -2.0, "%s: ground at %s is land (%f m)" % [tag, str(c), h])

func _l04(T: Truth) -> void:
	T.level("L04")
	var bn := Bench3D.new(); root.add_child(bn)
	var q: Dictionary = T.b.q("ch2Bench")
	T.check(bool(q.get("active", false)) and str(q.kind) == "machine", "L04: ch2Bench is the machine")
	bn.set_bench(q, 1080.0)
	T.check(bn.field != null, "L04: the scene is built")
	for k in ["alternator", "village"]: T.check(bn.anchors.has(k), "L04: chip anchor %s" % k)
	for p in [2, 4, 6, 10, 12, 24]:
		q = _act(T, bn, "setPoles", p)
		var rep := bn.report()
		T.check(int(rep.get("poles", -1)) == int(q.machine.poles), "L04: %d poles on the rotor (engine %d)" % [int(rep.get("poles", -1)), int(q.machine.poles)])
		T.check(int(rep.get("coils", -1)) == p, "L04: one coil bundle per pole at %d" % p)
	# the frequency: 12 poles at 500 rpm is 50 Hz, no flicker; 4 poles is 16.7 Hz, a deep one
	q = _act(T, bn, "setPoles", 12)
	T.near(float(q.fHz), 50.0, 0.01, "L04: 12 poles give 50 Hz")
	T.check(float(bn.report().flicker) == 0.0, "L04: no flicker at 50 Hz")
	q = _act(T, bn, "setPoles", 4)
	T.check(float(bn.report().flicker) > 0.5, "L04: deep flicker at %.1f Hz" % float(q.fHz))
	q = _act(T, bn, "setPoles", 12)
	# the voltage: more turns, more volts, brighter bulbs, exactly (V / 230)^2
	var pv := -1.0; var pb := -1.0; var pd := -1.0
	for turns in [10, 20, 30, 40, 50]:   # 12 poles, 0.5 T, 0.05 m2: about 5.5 V a turn, so 50 turns stays under the 1.6 cap
		q = _act(T, bn, "setTurns", turns)
		var v := float(q.eRmsV); var rep := bn.report()
		var want := clampf((v / float(q.machine.vTargetRms)) * (v / float(q.machine.vTargetRms)), 0.0, 1.6)
		T.near(float(rep.brightness), want, 1e-6, "L04: bulb brightness is (V/230)^2 at %d turns" % turns)
		T.check(v > pv and float(rep.brightness) > pb, "L04: more turns, more volts (%.1f V), brighter bulbs" % v)
		T.check(float(rep.coil_depth) > pd, "L04: coil bundles thicken with the turns (%d)" % turns)
		T.check(bool(rep.amber) == (v < float(q.vLoV)), "L04: amber exactly below the band at %.1f V" % v)
		T.check(float(rep.window_e) > 0.0, "L04: the windows glow at %.1f V" % v)
		pv = v; pb = float(rep.brightness); pd = float(rep.coil_depth)
	T.check(Bench3D.bulb_brightness(0.0, 230.0) == 0.0, "L04: 0 V is dark")
	T.check(Bench3D.bulb_brightness(230.0, 230.0) == 1.0, "L04: 230 V is full brightness")
	T.check(Bench3D.bulb_brightness(115.0, 230.0) < Bench3D.bulb_brightness(170.0, 230.0), "L04: brightness rises with voltage")
	# the field: the air gap glows more with more flux
	var pg := -1.0
	for b in [0.3, 0.5, 0.7, 0.9]:
		_act(T, bn, "setField", b)
		var g := float(bn.report().gap_glow)
		T.check(g > pg, "L04: the air gap glows more at %.1f T" % b); pg = g
	_ground(T, bn, "L04")
	bn.free()

func _l06(T: Truth) -> void:
	T.level("L06")
	var bn := Bench3D.new(); root.add_child(bn)
	var q: Dictionary = T.b.q("ch2Bench")
	T.check(bool(q.get("active", false)) and str(q.kind) == "town", "L06: ch2Bench is the town line")
	bn.set_bench(q, 1080.0)
	for k in ["gen", "up", "down", "line", "town"]: T.check(bn.anchors.has(k), "L06: chip anchor %s" % k)
	T.near(float(q.lossPct), 75.0, 0.01, "L06: 4 kV loses 75 %")
	T.check(float(bn.report().wire_glow) > 3.0, "L06: the wire glows hot at 75 %% lost (%f)" % float(bn.report().wire_glow))
	T.check(not bool(bn.report().transformers), "L06: ratio 1, no transformers drawn")
	var prev := 1e9
	for ratio in [1, 2, 4, 5, 8, 10, 20]:
		q = _act(T, bn, "setLineRatio", ratio)
		var rep := bn.report()
		var g := float(rep.wire_glow)
		T.check(g < prev or (g == 0.0 and prev == 0.0), "L06: less loss, less glow at ratio %d (%.2f %%: %f)" % [ratio, float(q.lossPct), g])
		if float(q.lossPct) <= 2.0: T.check(g == 0.0, "L06: plain metal at %.2f %% lost" % float(q.lossPct))
		T.check(bool(rep.transformers) == (ratio > 1), "L06: transformer pads drawn exactly when the ratio is above 1 (%d)" % ratio)
		var first: Vector3 = bn.line_path[0][1]; var last: Vector3 = bn.line_path[bn.line_path.size() - 1][1]
		if ratio > 1:   # the heated run lands on the high-voltage bushings of both transformers
			T.check(first.distance_to(bn.line_end(0, true)[1]) < 0.01 and first.distance_to((bn._xf_nodes[0] as Node3D).position) < 6.0, "L06: the line starts on the step-up's bushing at ratio %d" % ratio)
			T.check(last.distance_to(bn.line_end(1, true)[1]) < 0.01 and last.distance_to((bn._xf_nodes[1] as Node3D).position) < 6.0, "L06: the line ends on the step-down's bushing at ratio %d" % ratio)
		else:   # no transformers: the 4 kV run goes from the powerhouse wall to the town's first pole
			T.check(Vector2(first.x, first.z).distance_to(Vector2(bn._ph.x, bn._ph.z)) < 14.0, "L06: at ratio 1 the heated run starts at the powerhouse (%s)" % str(first))
			T.check(bn._town_rect().grow(6.0).has_point(Vector2(last.x, last.z)), "L06: at ratio 1 it ends at the town (%s)" % str(last))
		for k in bn.line_path.size() - 1:
			T.check((bn.line_path[k][1] as Vector3).distance_to(bn.line_path[k + 1][1]) < 70.0, "L06: no span longer than 70 m (a wire to nowhere) at ratio %d, span %d" % [ratio, k])
		var vt := float(q.vTownPu)
		T.near(float(rep.brightness), clampf(vt * vt, 0.0, 1.6), 1e-6, "L06: town windows are (V_town / V_nom)^2 at ratio %d" % ratio)
		T.near(float(rep.window_e), clampf(vt * vt, 0.0, 1.6) * Bench3D.WINDOW_E, 1e-5, "L06: the window glow is in proportion to that brightness at ratio %d" % ratio)
		T.check(bool(rep.amber) == (vt < Bench3D.TOWN_V_OK), "L06: amber exactly below %.2f of the voltage" % Bench3D.TOWN_V_OK)
		prev = g
	T.check(Bench3D.line_heat(2.0) == 0.0 and Bench3D.line_heat(75.0) == 1.0 and Bench3D.line_heat(20.0) > Bench3D.line_heat(5.0), "L06: heat is 0 at 2 %, full at 75 %, rising between")
	for kva in [630, 1600]:   # the pads resize; the line follows the bushings
		_act(T, bn, "setTransformerKva", kva)
		var first: Vector3 = bn.line_path[0][1]
		T.check(first.distance_to(bn.line_end(0, true)[1]) < 0.01, "L06: at %d kVA the line still lands on the step-up's bushing" % kva)
	_ground(T, bn, "L06")
	bn.free()

## In 3D the stage lets the mouse through to the world (drags turn the camera) and only the panel keeps it; with no 3D bench the whole stage keeps it.
func _input_pass(T: Truth) -> void:
	CbRegion.refresh(T.b); GridUi.load_strings(); TrayStrings.load_strings()
	T.level("L04")
	var app := Fake.new(); app.b = T.b; app.started = true
	var bench := Ch2Bench.new(); bench.app = app; root.add_child(bench); bench.size = Vector2(1366, 768)
	await process_frame
	bench.refresh()
	var stage := Vector2(683, 300); var knob: Vector2 = (bench.hits[0].rect as Rect2).get_center()
	T.check(bench._has_point(stage) and bench._has_point(knob), "classic: the opaque stage takes the mouse everywhere")
	var wv := WorldView.new(); var bn := Bench3D.new(); root.add_child(bn)
	bn.set_bench(T.b.q("ch2Bench"), 1080.0); bn.visible = true
	wv.look3d = bn; app.grid_world = wv
	bench._process(0.016)
	T.check(not bench._has_point(stage), "3D: a press on the open stage goes to the world")
	T.check(bench._has_point(knob), "3D: a press on a knob stays with the panel")
	T.check(bench._has_point(bench.predict_btn.position + Vector2(4, 4)), "3D: the predict row stays with the panel (button %s, panel %s, tag %.0f)" % [str(bench.predict_btn.position), str(bench.panel), bench._tag_w()])
	bench.free(); bn.free(); wv.free()
