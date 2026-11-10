extends SceneTree
## Overlay truth (DESIGN 9.8 item 3): the world model's ribbon values equal what the engine's `overlay('loading')` / `branchInfo` say.
## Pulse direction = sign(P); speed, width and colour band are functions of the engine loading and nothing else.

func _initialize() -> void:
	var T := Truth.new()
	if not T.start(root): print("OVERLAY-TRUTH FAILED engine"); quit(1); return
	var bands_seen := {}
	var view := WorldView.new()
	# P0: close Line 7 and watch the loading climb and T4 overload (cyan -> red), every block compared with the raw queries
	T.level("P0"); T.b.act("tick", [1])
	_compare(T, view, bands_seen)
	T.check(T.b.act("switchBranch", ["T5", true]).get("ok", false), "close Line 7")
	for i in 3:
		T.b.act("tick", [1]); _compare(T, view, bands_seen)
	for lv in ["L07", "L01", "L02", "L03"]:
		T.level(lv); T.b.act("tick", [2]); _compare(T, view, bands_seen)
	T.level("L01"); T.b.act("placeHut", [120]); T.b.act("layCable", ["main", 25]); T.b.act("tick", [2]); _compare(T, view, bands_seen)
	T.check(bands_seen.has(WorldMath.BAND_CYAN), "a cyan ribbon was seen")
	T.check(bands_seen.has(WorldMath.BAND_RED), "a red (overloaded) ribbon was seen")
	# the mappings are monotone in loading (nothing else enters), and the band edges are the documented ones
	var prev_s := -1.0; var prev_w := -1.0; var prev_b := -1
	var l := 0.0
	while l <= 1.6:
		var s := WorldMath.pulse_speed(l); var w := WorldMath.ribbon_width(l); var bd := WorldMath.band(l)
		T.check(s >= prev_s and w >= prev_w and bd >= prev_b, "speed, width and band are monotone in loading at %.2f" % l)
		prev_s = s; prev_w = w; prev_b = bd; l += 0.01
	T.check(WorldMath.pulse_speed(0.0) == 0.0, "no flow, no pulses")
	T.check(WorldMath.band(0.69) == WorldMath.BAND_CYAN and WorldMath.band(0.70) == WorldMath.BAND_WHITE and WorldMath.band(0.90) == WorldMath.BAND_AMBER and WorldMath.band(1.0) == WorldMath.BAND_AMBER and WorldMath.band(1.01) == WorldMath.BAND_RED, "band edges 70 / 90 / 100 %")
	T.check(WorldMath.band_color(WorldMath.BAND_CYAN) == Color("#39E1FF") and WorldMath.band_color(WorldMath.BAND_AMBER) == Color("#FFB020") and WorldMath.band_color(WorldMath.BAND_RED) == Color("#FF3B3B"), "band colours are the palette")
	T.finish("OVERLAY-TRUTH", self)

func _compare(T: Truth, view: WorldView, seen: Dictionary) -> void:
	var m := WorldModel.build(T.b)
	view.set_model(m)
	T.check(view.model == m, "the view holds the model it was given")
	var loading: Dictionary = T.b.q("overlay", ["loading"]).values
	if m.kind == "bench":
		var ampf := float(T.b.q("world").bench.ampFracMax)
		for ln in m.lines:
			if ln.in_service: T.near(ln.loading, ampf, 1e-9, "bench ribbon %s loading = engine ampFracMax" % ln.id)
		for ln in m.lines: seen[ln.band] = true
		return
	T.check(m.lines.size() == loading.size(), "%s: one ribbon per engine branch" % m.level)
	for ln in m.lines:
		var raw := float(loading[ln.id])
		var info: Dictionary = T.b.q("branchInfo", [ln.id])
		T.near(ln.loading, raw, 1e-9, "%s %s: ribbon loading = overlay" % [m.level, ln.id])
		if not ln.in_service:
			T.check(ln.band == WorldMath.BAND_OFF and ln.speed == 0.0 and ln.color == WorldMath.GREY, "%s %s: an open branch is a grey, still ribbon" % [m.level, ln.id]); continue
		var p := float(info.pFromMW)
		T.check(ln.dir == (1 if p > 1e-6 else (-1 if p < -1e-6 else 0)), "%s %s: pulse direction = sign(P) (%f)" % [m.level, ln.id, p])
		T.near(ln.speed, 0.0 if (raw <= 0.0 or ln.dir == 0) else WorldMath.pulse_speed(raw), 1e-9, "%s %s: pulse speed from loading" % [m.level, ln.id])
		T.near(ln.width, WorldMath.ribbon_width(raw), 1e-9, "%s %s: ribbon width from loading" % [m.level, ln.id])
		var want := WorldMath.BAND_CYAN if raw < 0.7 else (WorldMath.BAND_WHITE if raw < 0.9 else (WorldMath.BAND_AMBER if raw <= 1.0 else WorldMath.BAND_RED))
		T.check(ln.band == want and ln.color == WorldMath.band_color(want), "%s %s: colour band %d for loading %.3f" % [m.level, ln.id, want, raw])
		seen[ln.band] = true
