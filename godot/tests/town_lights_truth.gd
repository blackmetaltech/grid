extends SceneTree
## Town-lights truth (DESIGN 9.8 item 6): window energy of every building is (V/Vnom)^2 of its bus, read from the engine's `overlay('voltage')`
## (or the bench's home voltage); monotone in V; zero for a dead bus and for shed streets. Toggling a load shed in the engine changes the lights.

func _initialize() -> void:
	var T := Truth.new()
	if not T.start(root): print("TOWN-LIGHTS-TRUTH FAILED engine"); quit(1); return
	# LOOK2 quality tier: an integrated GPU never gets medium (118 ms a frame on a Radeon iGPU), a discrete NVIDIA gets high
	T.check(Province3D.quality_for("forward_plus", "AMD Ryzen 9 9900X (RADV RAPHAEL_MENDOCINO)", RenderingDevice.DEVICE_TYPE_INTEGRATED_GPU) == "low", "an iGPU under Forward+ gets low")
	T.check(Province3D.quality_for("forward_plus", "llvmpipe", RenderingDevice.DEVICE_TYPE_CPU) == "low", "a software renderer gets low")
	T.check(Province3D.quality_for("gl_compatibility", "NVIDIA GeForce RTX 4090", RenderingDevice.DEVICE_TYPE_DISCRETE_GPU) == "low", "Compatibility is always low")
	T.check(Province3D.quality_for("forward_plus", "NVIDIA GeForce RTX 4090", RenderingDevice.DEVICE_TYPE_DISCRETE_GPU) == "high", "a discrete NVIDIA gets high")
	var pairs: Array = []   # [v, mean energy] over every town seen
	# 1. grid levels: building energy = V^2 of the bus in overlay('voltage'); a dead bus is dark
	T.level("P0"); T.b.act("tick", [1]); _grid(T, pairs)
	T.b.act("switchBranch", ["T5", true]); T.b.act("tick", [1]); _grid(T, pairs)
	T.b.act("tick", [3]); _grid(T, pairs)   # blackout: the load bus is dead
	var dead := WorldModel.build(T.b)
	for t in dead.towns: T.check(t.v == 0.0 and t.energy == 0.0, "a blacked-out town is dark")
	for i in 40: if str(T.b.g.status) == "playing": T.b.act("tick", [1])
	T.check(str(T.b.g.status) == "won" and GridChrome.done_pin_key(T.b.g) == "PIN_DONE_DARK", "P0 passes in a dark city: the pin says dark, not lit (1.19, Dagny) (%s, %s)" % [str(T.b.g.status), GridChrome.done_pin_key(T.b.g)])
	T.check(GridChrome.done_pin_key({"metrics": {"ensMWh": 0.0}}) == "PIN_DONE", "a job passed with every home served says lit")
	T.level("L07"); T.b.act("tick", [3]); _grid(T, pairs)
	# 2. bench levels: homes are lit by (V_home / 48)^2; an unpowered bench is dark; a better cable is brighter
	T.level("L01")
	var m0 := WorldModel.build(T.b)
	for t in m0.towns: T.check(t.energy == 0.0, "L01 before the hut and cable: dark homes")
	var last_e := -1.0
	T.b.act("placeHut", [300])
	for mm2 in [4, 10, 25, 50]:
		T.check(T.b.act("layCable", ["main", mm2]).get("ok", false), "lay %d mm2" % mm2)   # no tick: a brownout block would end the level
		var bs: Dictionary = T.b.q("benchStatus"); var m := WorldModel.build(T.b)
		var vh := float(bs.vLoadV[0]) / 48.0
		for e in m.towns[0].energies: T.near(e, vh * vh, 1e-6, "L01 %d mm2: home window energy = (V/48)^2" % mm2)
		pairs.append([vh, m.towns[0].energy])
		T.check(m.towns[0].energy >= last_e - 1e-9, "L01: a thicker cable never darkens the homes"); last_e = m.towns[0].energy
		var vv := float(bs.vLoadV[0]); var want := "sad" if vv < 43.2 else ("worried" if vv < 45.2 else "happy")
		T.check(str(m.towns[0].mood) == want and is_equal_approx(float(m.towns[0].limit), 43.2), "L01 %d mm2: cute bulb face '%s' = voltage band of %.2f V vs the engine limit (got '%s', limit %s)" % [mm2, want, vv, m.towns[0].mood, m.towns[0].limit])
	# 3. shedding: free-play grid, shed half the load in the engine and the far streets go dark in order
	T.sandbox(); T.b.act("tick", [8]); T.b.act("shedLoad", ["L1", 0.0])   # the shed actions change the engine state at once; no tick in between
	var base := WorldModel.build(T.b); var tw0: Dictionary = base.towns[0]
	T.check(tw0.v > 0.8 and tw0.energy > 0.5, "free-play town is lit (v=%f)" % tw0.v)
	var lit0 := 0
	for e in tw0.energies: if e > 0.0: lit0 += 1
	T.check(lit0 == tw0.count, "no shed: every building lit")
	T.check(T.b.act("shedLoad", ["L1", 0.5]).get("ok", false), "shedLoad 50 %")
	var shed := WorldModel.build(T.b); var tw1: Dictionary = shed.towns[0]
	var lit1 := 0
	for e in tw1.energies: if e > 0.0: lit1 += 1
	T.check(T.b.q("world").buses[1].shed > 0.4, "the engine reports the shed share")
	T.check(lit1 < lit0 and lit1 > 0, "shed 50 %%: part of the town is dark (%d of %d lit)" % [lit1, lit0])
	T.check(tw1.energy < tw0.energy, "shedding lowers the town's light")
	T.b.act("shedLoad", ["L1", 1.0]); T.check(WorldModel.build(T.b).towns[0].energy == 0.0, "shed 100 %: dark")
	T.b.act("shedLoad", ["L1", 0.0]); T.check(WorldModel.build(T.b).towns[0].energy > 0.5, "shed 0: lit again")
	# 4. monotone in V over everything seen, and over a sweep of the pure mapping
	pairs.sort_custom(func(a, c): return a[0] < c[0])
	for i in range(1, pairs.size()): T.check(pairs[i][1] >= pairs[i - 1][1] - 1e-9, "energy monotone in V over observed towns (%f -> %f)" % [pairs[i - 1][0], pairs[i][0]])
	var prev := -1.0; var v := 0.0
	while v <= 1.25:
		var e := WorldMath.building_energy(v, 0.0, 0, 10); T.check(e >= prev, "building_energy monotone at V=%.2f" % v); prev = e; v += 0.01
	T.check(WorldMath.building_energy(0.0, 0.0, 0, 10) == 0.0 and WorldMath.building_energy(1.0, 0.0, 3, 10) == 1.0, "dead bus dark, nominal bus full")
	# 5. the day-night cycle follows the clock: dark at midnight, bright at noon; windows shine most at night
	T.check(WorldMath.night(0.0) > 0.99 and WorldMath.night(720.0) < 0.01 and WorldMath.night(360.0) > 0.4 and WorldMath.night(360.0) < 0.6, "night factor from the clock")
	T.check(WorldMath.lights_gain(1.0) > WorldMath.lights_gain(0.0), "lights shine most at night")
	T.finish("TOWN-LIGHTS-TRUTH", self)

func _grid(T: Truth, pairs: Array) -> void:
	var m := WorldModel.build(T.b)
	var vv: Dictionary = T.b.q("overlay", ["voltage"]).values
	for t in m.towns:
		var raw := float(vv.get(t.id, 0.0))
		T.near(t.v, raw, 1e-9, "%s %s: town V = overlay" % [m.level, t.id])
		for i in t.count:
			var want := 0.0 if raw <= 0.0 else raw * raw * (1.0 if (float(i) + 0.5) / float(t.count) > t.shed else 0.0)
			T.near(t.energies[i], want, 1e-6, "%s %s building %d: window energy = V^2" % [m.level, t.id, i])
		pairs.append([t.v, t.energy * 1.0 if t.shed == 0.0 else t.v * t.v])
