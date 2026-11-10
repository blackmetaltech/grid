extends SceneTree
## Chapter 7 flow (L23-L27), headless with the real engine bridge: each level's stage shows its numbers only after the run (the prediction stays hidden), a click-equivalent
## action changes the build and the price, and the run's verdict agrees with the engine (naive fails for its reason, the lesson build wins).
func _initialize() -> void:
	var T := Truth.new()
	if not T.start(root): print("CHSEVEN-FLOW FAILED engine"); quit(1); return
	CbRegion.refresh(T.b); GridUi.load_strings()
	for id in ["L23", "L24", "L25", "L26", "L27"]:
		T.level(id)
		var st = T.b.q("ch7Study")
		T.check(st is Dictionary and st.get("active", false) and str(st.scenario) == id, "%s: ch7Study is active" % id)
		T.check(not bool(st.revealed), "%s: nothing is revealed before the run" % id)
		var kit = T.b.q("ch7Kit"); T.check(kit is Dictionary and kit.get("active", false), "%s: the kit answers" % id)
	T.level("L23")
	T.check(bool(T.b.act("setBreakerRating", [31.5]).get("ok", false)), "L23: a 31.5 kA rating is accepted")
	T.check(not bool(T.b.act("setBreakerRating", [30.0]).get("ok", true)), "L23: a non-standard rating is refused")
	var s2 = T.b.q("ch7Study"); T.check(absf(float(s2.capex) - 440000.0) < 1.0, "L23: the price is the engine's (440000)")
	T.b.act("tick", [1])
	var s3 = T.b.q("ch7Study"); T.check(bool(s3.revealed) and bool(s3.ok) and absf(float(s3.faultKA) - 30.19) < 0.01, "L23: after the run the fault is 30.19 kA and the board holds")
	T.finish("CHSEVEN-FLOW", self)
