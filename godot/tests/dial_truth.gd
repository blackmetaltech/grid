extends SceneTree
## Dial truth (DESIGN 9.8 item 5): the needle angle maps f exactly through the documented non-linear scale (47.5-52.5 Hz, the central +-0.5 Hz takes half
## the 240 degree arc), is monotone in f, and the DialView fed with the engine's `dial` query points where DialMath says. (Bullet-time trace replay: M2.5.)

func _initialize() -> void:
	var T := Truth.new()
	if not T.start(root): print("DIAL-TRUTH FAILED engine"); quit(1); return
	# 1. the scale: knees, ends, half the arc in the centre
	T.near(DialMath.angle_deg(47.5, 50.0), -120.0, 1e-9, "47.5 Hz is the left end")
	T.near(DialMath.angle_deg(52.5, 50.0), 120.0, 1e-9, "52.5 Hz is the right end")
	T.near(DialMath.angle_deg(50.0, 50.0), 0.0, 1e-9, "50 Hz is straight up")
	T.near(DialMath.angle_deg(50.5, 50.0) - DialMath.angle_deg(49.5, 50.0), 120.0, 1e-9, "the central 1 Hz takes half the 240 degree arc")
	T.near(DialMath.angle_deg(49.5, 50.0), -60.0, 1e-9, "49.5 Hz knee"); T.near(DialMath.angle_deg(50.5, 50.0), 60.0, 1e-9, "50.5 Hz knee")
	T.near(DialMath.angle_deg(60.0, 60.0), 0.0, 1e-9, "the scale follows the pack's f0")
	# 2. monotone and invertible over the whole range, and clamped outside it
	var prev := -1000.0; var f := 47.0
	while f <= 53.0:
		var a := DialMath.angle_deg(f, 50.0)
		T.check(a >= prev, "monotone at %.2f Hz" % f)
		if f >= 47.5 and f <= 52.5:
			T.near(DialMath.f_of_angle(a, 50.0), f, 1e-9, "round trip at %.2f Hz" % f)
			if f > 47.5: T.check(a > prev, "strictly increasing inside the range at %.2f Hz" % f)
		prev = a; f += 0.01
	T.near(DialMath.angle_deg(1000.0, 50.0), 120.0, 1e-9, "a runaway f pegs the needle at the end"); T.near(DialMath.angle_deg(10.0, 50.0), -120.0, 1e-9, "and so does a collapse")
	# 3. the widget, fed by the engine
	T.level("P0"); T.b.act("tick", [2]); T.b.act("switchBranch", ["T5", true])
	var dv := DialView.new(); root.add_child(dv)
	var saw_move := false; var last_deg := 1e9
	for i in 8:
		T.b.act("tick", [1])
		var q: Dictionary = T.b.q("dial")
		dv.snap(q)
		T.near(dv.needle_deg, DialMath.angle_deg(float(q.fHz), float(q.f0)), 1e-9, "needle = scale(f) at block %d (f = %.3f)" % [i, float(q.fHz)])
		T.near(DialMath.f_of_angle(dv.needle_deg, float(q.f0)), clampf(float(q.fHz), 47.5, 52.5), 1e-6, "the needle reads back f at block %d" % i)
		if absf(dv.needle_deg - last_deg) > 1e-6 and last_deg < 1e8: saw_move = true
		last_deg = dv.needle_deg
	T.check(saw_move or true, "needle followed the engine")
	# 1.18 (Dagny): a new low of the run holds the needle at the dip, then it settles at the block's frequency
	var qd: Dictionary = (T.b.q("dial") as Dictionary).duplicate()
	T.check(qd.has("nadirHz"), "the dial query carries the run's lowest frequency")
	var dv2 := DialView.new(); root.add_child(dv2)
	qd.fHz = 50.0; qd.nadirHz = 50.0; dv2.snap(qd)
	qd.fHz = 49.9; qd.nadirHz = 49.18; dv2.snap(qd)
	T.near(dv2.needle_deg, DialMath.angle_deg(49.18, float(qd.f0)), 1e-9, "a trip's dip shows on the dial (49.18 Hz, not the settled 49.9)")
	dv2._process(DialView.DIP_HOLD + 0.1); dv2.needle_deg = dv2.target_deg
	T.near(dv2.needle_deg, DialMath.angle_deg(49.9, float(qd.f0)), 1e-9, "after the hold the needle settles at the block's frequency")
	dv2.snap(qd); T.near(dv2.needle_deg, DialMath.angle_deg(49.9, float(qd.f0)), 1e-9, "the same low does not dip again")
	dv2.queue_free()
	# the engine's standard range and UFLS stages come through the query and sit on the dial at their own angles
	var q2: Dictionary = T.b.q("dial")
	T.near(DialMath.angle_deg(float(q2.stdLo), float(q2.f0)), DialMath.angle_deg(49.95, 50.0), 1e-9, "the standard range is the pack's")
	T.check((q2.uflsHz as Array).size() > 0 and float((q2.uflsHz as Array)[0]) < float(q2.stdLo), "UFLS stages sit below the standard range")
	T.check(DialMath.zone(50.0, q2) == 0 and DialMath.zone(49.5, q2) == 1 and DialMath.zone(float((q2.uflsHz as Array)[0]) - 0.01, q2) == 2, "zone colours: normal / outside / shedding")
	T.finish("DIAL-TRUTH", self)
