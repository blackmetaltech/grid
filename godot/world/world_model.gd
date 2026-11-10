class_name WorldModel
extends RefCounted
## Builds the diorama's model from the engine: `world` (geometry, flow sign, shed share), `overlay('voltage')` (bus V, pu), `overlay('loading')`
## (branch loading, fraction of rating), `benchStatus`-style numbers inside `world.bench`, and `clock`. Every visual quantity (window energy,
## pulse speed, ribbon width and colour band) is computed here by WorldMath from those engine values; the drawing only reads this model, and the
## truth tests (godot/tests) read it back and compare it with the raw queries. Pure data out: Dictionaries, Arrays, Vector2, no nodes.

const BENCH_HUT := Vector2(3, 8)
# L01 geometry, 1 tile = 10 m so the drawn cable is as long as the engine's run: beach row y = 12, hamlet 70 m up the rise.
const L01_MAP := Vector2(36, 17)
const L01_HAMLET := Vector2(29, 5)
const L01_BEACH_Y := 12.0
const L01_MANGROVE := Rect2(7, 6, 19, 4)   # tiles; blocked for cables (DESIGN L01), the reason the cable follows the beach

## Where the battery hut stands for a cable run of `d` metres: along the beach west of the corner below the hamlet.
static func l01_hut_pos(d: float) -> Vector2:
	var vertical := (L01_BEACH_Y - L01_HAMLET.y) * 10.0
	return Vector2(L01_HAMLET.x - (d - vertical) / 10.0, L01_BEACH_Y)

static func empty() -> Dictionary:
	return {"kind": "none", "level": "", "map": Vector2(26, 16), "minute": 0.0, "night": 1.0, "towns": [], "subs": [], "lines": [], "units": [], "shunts": [], "blackout": false}

static func build(b) -> Dictionary:
	var m := empty()
	var clk = b.q("clock")
	if clk is Dictionary and not clk.is_empty():
		m.minute = float(clk.minuteOfDay); m.night = WorldMath.night(m.minute)
	var w = b.q("world")
	if not (w is Dictionary) or w.is_empty(): return m
	m.kind = str(w.kind); m.level = str(w.get("level", "")); m.blackout = bool(w.get("blackout", false))
	if w.kind == "bench": _bench(m, w)
	elif w.kind == "grid": _grid(m, w, b)
	return m

static func _grid(m: Dictionary, w: Dictionary, b) -> void:
	m.map = Vector2(float(w.map.w), float(w.map.h))
	var vv: Dictionary = (b.q("overlay", ["voltage"]) as Dictionary).get("values", {})
	var ll: Dictionary = (b.q("overlay", ["loading"]) as Dictionary).get("values", {})
	var pos := {}; var kvs := {}
	for bus in w.buses:
		var p := Vector2(float(bus.x), float(bus.y)); pos[bus.id] = p; kvs[bus.id] = float(bus.kv)
		var v: float = float(vv[bus.id]) if vv.has(bus.id) else 0.0
		if float(bus.demandMW) > 0.0 or float(bus.peakMW) > 0.0 or bus.kind == "load":
			var n := clampi(6 + int(maxf(float(bus.peakMW), float(bus.demandMW)) / 4.0), 6, 40)
			m.towns.append(_town(str(bus.id), str(bus.name), p, n, v, float(bus.shed), "town", 0))
		else:
			m.subs.append({"id": str(bus.id), "pos": p, "kv": float(bus.kv), "v": v, "energised": v > 0.0})
	for br in w.branches:
		var a: Vector2 = pos.get(br["from"], Vector2.ZERO); var c: Vector2 = pos.get(br.to, Vector2.ZERO)
		var pts: Array = [a]
		for wp in br.waypoints: pts.append(Vector2(float(wp[0]), float(wp[1])))
		pts.append(c)
		var load_f: float = float(ll.get(br.id, 0.0))
		m.lines.append(_line(str(br.id), pts, load_f, WorldMath.flow_dir(float(br.pFromMW)), bool(br.inService), int(br.circuits), float(kvs.get(br["from"], 11.0)), float(br.overloadFrac), str(br.kind)))
	for u in w.units:
		m.units.append({"id": str(u.id), "pos": pos.get(u.bus, Vector2.ZERO), "kind": str(u.kind), "online": bool(u.online), "level": 0.0 if float(u.pMax) <= 0.0 else clampf(float(u.P) / float(u.pMax), 0.0, 1.0), "rotor": WorldMath.rotor_speed(float(u.availMW), float(u.pMax))})
	for h in w.shunts: m.shunts.append({"id": str(h.id), "pos": pos.get(h.bus, Vector2.ZERO), "on": int(h.on), "steps": int(h.steps), "kind": str(h.kind)})

static func _bench(m: Dictionary, w: Dictionary) -> void:
	var bn: Dictionary = w.bench
	m.map = Vector2(26, 16)
	var sc := str(bn.scenario)
	var hut = bn.hutM
	var vs: Array = bn.vLoadV
	var vsrc := float(bn.sourceV)
	var amp := float(bn.ampFracMax)
	var powered := bool(bn.powered)
	var hut_p := BENCH_HUT
	var targets: Array = []   # [pos, count, label kind]
	if sc == "l01":   # Saltmarsh Island at 10 m per tile: the hamlet sits on the rise, the hut on the south beach, the cable runs along the beach
		m.map = L01_MAP
		hut_p = l01_hut_pos(float(hut) if hut != null else 300.0); targets.append([L01_HAMLET, 10, "hamlet"])
		m["island"] = {"beach_y": L01_BEACH_Y, "mangrove": L01_MANGROVE}
	elif sc == "l02":
		targets.append([Vector2(22, 5), 10, "hamlet"]); targets.append([Vector2(22, 11), 14, "hamlet"])
	else:
		targets.append([Vector2(22, 8), 2, "school"])
	m.units.append({"id": "hut", "pos": hut_p, "kind": "hut" if sc != "l03" else "bench", "online": powered, "level": 1.0 if powered else 0.0, "rotor": 0.0})
	if sc == "l01" and hut == null: m.units.clear()
	for i in targets.size():
		var t: Array = targets[i]
		var v := 0.0
		if powered and i < vs.size(): v = float(vs[i]) / vsrc
		var tw := _town("h%d" % (i + 1), "", t[0], int(t[1]), v, 0.0, str(t[2]), i); tw["volts"] = v * vsrc
		var lim = bn.get("vMinLimitV")
		tw["limit"] = float(lim) if lim != null else 0.0
		tw["mood"] = WorldMath.mood(v * vsrc, tw.limit, powered)
		m.towns.append(tw)
	var laid: bool = bn.mainMm2 != null and not (sc == "l01" and hut == null)
	if not laid: return
	var dirp := 1 if powered else 0
	if sc == "l02" and str(bn.topology) == "trunk":
		var j := Vector2(12, 8)
		m.subs.append({"id": "j", "pos": j, "kv": 0.048, "v": 1.0, "energised": powered})
		m.lines.append(_line("main", [hut_p, j], amp, dirp, true, 1, 0.048, 0.0, "cable")); m.lines[-1]["mm2"] = bn.mainMm2
		for i in targets.size(): m.lines.append(_line("b%d" % (i + 1), [j, targets[i][0]], amp, dirp, bn.branchMm2 != null, 1, 0.048, 0.0, "cable")); m.lines[-1]["mm2"] = bn.branchMm2
	else:
		for i in targets.size():
			var mm = bn.mainMm2 if i == 0 else bn.branchMm2
			var pts: Array = [hut_p, targets[i][0]]
			if sc == "l01": pts = [hut_p, Vector2(L01_HAMLET.x, L01_BEACH_Y), L01_HAMLET]
			if sc == "l03" and bool(bn.converters):
				m.subs.append({"id": "c%d" % i, "pos": hut_p if i == 0 else targets[0][0], "kv": 0.38, "v": 1.0, "energised": powered})
			m.lines.append(_line("main" if i == 0 else "b", pts, amp, dirp, mm != null, 1, 0.048, 0.0, "cable")); m.lines[-1]["mm2"] = mm

static func _town(id: String, nm: String, p: Vector2, count: int, v: float, shed: float, kind: String, idx: int) -> Dictionary:
	var en := PackedFloat32Array(); var sum := 0.0
	for i in count:
		var e := WorldMath.building_energy(v, shed, i, count); en.append(e); sum += e
	return {"id": id, "name": nm, "pos": p, "count": count, "v": v, "shed": shed, "kind": kind, "idx": idx, "energies": en, "energy": sum / float(maxi(count, 1))}

static func _line(id: String, pts: Array, loading: float, dir: int, in_service: bool, circuits: int, kv: float, overload: float, kind: String) -> Dictionary:
	var bd := WorldMath.BAND_OFF
	var spd := 0.0; var wd := 2.0; var col := WorldMath.GREY
	if in_service:
		bd = WorldMath.band(loading); col = WorldMath.band_color(bd)
		spd = WorldMath.pulse_speed(loading) if dir != 0 else 0.0; wd = WorldMath.ribbon_width(loading)
	return {"id": id, "pts": pts, "loading": loading, "dir": dir, "speed": spd, "width": wd, "band": bd, "color": col, "in_service": in_service, "circuits": circuits, "kv": kv, "overload": overload, "kind": kind}
