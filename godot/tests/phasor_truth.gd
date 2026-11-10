extends SceneTree
## Phasor truth (DESIGN 9.8 item 4): the drawn V and I arrows of the Inspector's PhasorView equal the engine's values. The angle of the V arrow is the
## engine's bus angle, the angle of I relative to V is -phi (I lags V by phi) within 0.5 degrees, and arrow lengths are vPu and I / I_rating times the
## documented scale, at several display rotations (the diagram turns, the angle between the arrows never does).

func _initialize() -> void:
	var T := Truth.new()
	if not T.start(root): print("PHASOR-TRUTH FAILED engine"); quit(1); return
	GridUi.load_strings()
	var seen := 0
	var lagging := false; var any_ratio := false
	for lv in ["L07", "P0"]:
		T.level(lv)
		for step in [2, 30, 24, 20]:   # L07: morning, lunch (13:00 wattless), evening
			T.b.act("tick", [step])
			var w: Dictionary = T.b.q("world")
			for br in w.branches:
				seen += _check(T, "branch", str(br.id)); 
			for bus in w.buses: seen += _check(T, "bus", str(bus.id))
	T.check(seen > 10, "enough phasors compared (%d)" % seen)
	# a synthetic leading and lagging case through the same geometry
	for phi in [-70.0, -30.0, 0.0, 25.0, 85.0]:
		var d := {"vPu": 1.0, "vAngDeg": -4.0, "iKA": 0.2, "iRefKA": 0.4, "iAngDeg": -4.0 - phi}
		var a := PhasorMath.arrows(d, 100.0, 53.0)
		T.near(-PhasorMath.angle_between(a), phi, 0.01, "phi %.0f drawn" % phi)
		T.near((a.i as Vector2).length() / (a.v as Vector2).length(), 0.5, 1e-6, "length ratio is I/I_rating over V")
		if phi > 0: lagging = true
	T.check(lagging, "a lagging case")
	# the widget in a scene: the inspector screen builds with its PhasorView on L07 and its arrows are the engine's
	T.level("L07"); T.b.act("tick", [52])
	var q: Dictionary = T.b.q("phasor", ["branch", "T1"])
	var pv := PhasorView.new(); pv.size = Vector2(220, 200); pv.spin = false; pv.set_data(q)
	var arr := pv.arrows(); var r := pv.radius()
	T.near(PhasorMath.angle_of(arr.v), float(q.vAngDeg), 0.5, "widget V angle = engine bus angle")
	T.near(-PhasorMath.angle_between(arr), float(q.phiDeg), 0.5, "widget phi = engine phi")
	T.near((arr.v as Vector2).length(), PhasorMath.SCALE * r * float(q.vPu), 1e-4, "widget V length = vPu")
	T.near((arr.i as Vector2).length(), PhasorMath.SCALE * r * float(q.iKA) / float(q.iRefKA), 1e-4, "widget I length = I / rating")
	T.check(str(q.lead) == "lagging" and float(q.phiDeg) > 0.0, "the lunch-break feeder current lags the voltage")
	T.finish("PHASOR-TRUTH", self)

func _check(T: Truth, kind: String, id: String) -> int:
	var q = T.b.q("phasor", [kind, id])
	if not (q is Dictionary) or q.get("error", false): return 0
	if kind == "bus" and float(q.sMVA) <= 0.0: return 0
	# engine consistency
	T.near(float(q.sMVA), sqrt(float(q.pMW) * float(q.pMW) + float(q.qMVAr) * float(q.qMVAr)), 0.002, "%s %s S = |P + jQ|" % [kind, id])
	for rot in [0.0, 37.0, 181.0]:
		var d: Dictionary = q
		var a := PhasorMath.arrows(d, 100.0, rot)
		T.near(fposmod(PhasorMath.angle_of(a.v) - rot - float(q.vAngDeg) + 180.0, 360.0) - 180.0, 0.0, 0.5, "%s %s V angle at rot %.0f" % [kind, id, rot])
		if (a.i as Vector2).length() > 1e-3: T.near(-PhasorMath.angle_between(a), float(q.phiDeg), 0.5, "%s %s drawn phi = engine phi at rot %.0f" % [kind, id, rot])   # a zero-current arrow has no direction
		T.near((a.v as Vector2).length(), minf(0.8 * 100.0 * float(q.vPu), 110.0), 1e-3, "%s %s V length" % [kind, id])
		if float(q.iRefKA) > 0.0:
			T.near((a.i as Vector2).length(), minf(0.8 * 100.0 * float(q.iKA) / float(q.iRefKA), 110.0), 1e-3, "%s %s I length" % [kind, id])
	# the same angle as the engine's own bus angle for a branch's from-end
	if kind == "branch":
		var info: Dictionary = T.b.q("branchInfo", [id]); var bi: Dictionary = T.b.q("busInfo", [str(info["from"])])
		T.near(float(q.vAngDeg), float(bi.thetaDeg), 0.01, "branch %s phasor V angle = busInfo theta of its from-bus" % id)
		T.near(float(q.iKA), float(info.currentKA), 0.001, "branch %s I = branchInfo kA" % id)
	return 1
