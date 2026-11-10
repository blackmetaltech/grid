extends SceneTree
## Meter truth (UI.md 1): the voltmeter's needle, once settled, maps back to the engine's worst-home voltage within 0.1 % of scale; the digital
## readout is the engine value; the red zone starts at the engine's limit; the spring settles in about 0.4 s and rests exactly on the target.

func _initialize() -> void:
	var T := Truth.new()
	if not T.start(root): print("METER-TRUTH FAILED engine"); quit(1); return
	var designs := [[300, 2.5], [300, 10], [300, 25], [300, 50], [120, 10]]
	T.level("L01")
	for d in designs:
		T.b.act("placeHut", [d[0]]); var r: Dictionary = T.b.act("layCable", ["main", d[1]]); T.check(r.get("ok", false), "layCable %s" % str(d))
		var bs: Dictionary = T.b.q("benchStatus"); var det: Dictionary = T.b.q("benchDetail"); var w: Dictionary = T.b.q("world")
		var m := MeterView.new(); m.set_range(0.0, 60.0, 20.0, 5.0); m.decimals = 1; m.units = "V"; root.add_child(m)
		var lim := float(bs.bench.limits.vMinV)
		m.zones = [[0.0, lim, GridTheme.BAD], [lim, 60.0, GridTheme.GOOD]]
		m.set_target(float(bs.vMinV))          # from a standing start: the needle moves, then settles
		var steps := 0
		while not m.settled() and steps < 600: m.step(1.0 / 60.0); steps += 1
		T.check(steps < 60, "%s: settles within 1 s (%d frames)" % [str(d), steps])
		T.near(m.needle_value(), float(bs.vMinV), 0.001 * 60.0, "%s: needle = benchStatus.vMinV" % str(d))
		T.near(m.value_of_angle(m.needle_deg()), float(bs.vMinV), 0.06, "%s: angle maps back to the engine value" % str(d))
		T.check(m.needle_value() == clampf(float(bs.vMinV), 0.0, 60.0), "%s: rest position is exactly the target" % str(d))
		# detail: the worst home is the lowest run receiving end (one hamlet in L01)
		var vmin_detail := 1e9
		for run in det.runs: vmin_detail = minf(vmin_detail, float(run.vRecvV))
		T.near(float(bs.vMinV), vmin_detail, 0.001, "%s: benchStatus.vMinV = benchDetail vRecvV" % str(d))
		T.near(m.needle_value(), vmin_detail, 0.06 + 0.001, "%s: needle = benchDetail vRecvV" % str(d))
		T.near(float(m.zones[0][1]), float(w.bench.vMinLimitV), 1e-9, "%s: red zone ends at world.bench.vMinLimitV" % str(d))
		T.near(float(m.zones[1][0]), 43.2, 1e-9, "%s: green starts at the 43.2 V level limit" % str(d))
		T.check(m.readout_text() == "%.1f V" % float(bs.vMinV), "%s: readout %s" % [str(d), m.readout_text()])
		# a mid-flight needle is NOT at rest: it lags the target (inertia)
		m.snap(0.0); m.set_target(float(bs.vMinV)); m.step(0.05)
		T.check(absf(m.needle_value() - float(bs.vMinV)) > 0.5 or float(bs.vMinV) < 1.0, "%s: needle has inertia" % str(d))
		m.queue_free()
	# spring: 0.4 s to within 2-3 % of a full-scale step, no overshoot (critical damping)
	var s := MeterView.new(); s.snap(0.0); s.set_target(60.0)
	var mx := 0.0; var t := 0.0
	while t < 0.4: s.step(1.0 / 120.0); t += 1.0 / 120.0; mx = maxf(mx, s._x)
	T.check(absf(s._x - 60.0) < 60.0 * 0.05 and mx <= 60.0 + 1e-6, "spring: within 5 %% after 0.4 s, no overshoot (x=%.2f)" % s._x)
	s.free()
	# clock dial maths: noon on top, window arc from levelStart/horizon
	var c: Dictionary = T.b.q("clock"); var cv := Clock24View.new()
	T.level("L01"); c = T.b.q("clock"); cv.set_state(c, T.b.g.get("levelStart"), T.b.q("levelInfo").horizonBlocks, true)
	T.check(cv.win_start == 1080.0 and cv.win_len == 300.0 and cv.time_text() == "18:00", "L01 shift window 18:00 + 300 min, clock 18:00 (%s %s %s)" % [cv.win_start, cv.win_len, cv.time_text()])
	T.b.act("tick", [3]); cv.set_state(T.b.q("clock"), T.b.g.get("levelStart"), T.b.q("levelInfo").horizonBlocks, true)
	T.check(cv.time_text() == "18:45" and cv.elapsed == 45.0, "after 3 blocks: 18:45, 45 min elapsed (%s %s)" % [cv.time_text(), cv.elapsed])
	T.check(absf(Clock24View.deg_of(720.0)) < 1e-9 and absf(Clock24View.deg_of(0.0) + 180.0) < 1e-9, "noon at the top, midnight at the bottom")
	cv.free()
	T.finish("METER-TRUTH", self)
