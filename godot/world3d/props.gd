class_name Props3D
extends RefCounted
## LOOK2 procedural meshes: trees, houses, poles and lattice towers, yard equipment, the trawler, the lighthouse. Real sizes in metres.
## Built once with SurfaceTool; vertex colours carry the base colour (the shaders vary it per instance).

static func _cyl(st: SurfaceTool, a: Vector3, b: Vector3, ra: float, rb: float, seg: int, col: Color, cap := false) -> void:
	var ax := (b - a).normalized()
	var up := Vector3.UP if absf(ax.dot(Vector3.UP)) < 0.95 else Vector3.RIGHT
	var u := ax.cross(up).normalized(); var v := ax.cross(u).normalized()
	st.set_color(col)
	for s in seg:
		var t0 := TAU * s / seg; var t1 := TAU * (s + 1) / seg
		var d0 := u * cos(t0) + v * sin(t0); var d1 := u * cos(t1) + v * sin(t1)
		var p0 := a + d0 * ra; var p1 := a + d1 * ra; var p2 := b + d1 * rb; var p3 := b + d0 * rb
		# 1128c (owner roof bug, same fault): clockwise from outside, so the front faces out (was inside out: every pole,
		# bushing and chimney showed its far inner wall). tests/mesh_winding_truth.gd guards it.
		st.set_normal(d0); st.add_vertex(p0); st.set_normal(d1); st.add_vertex(p2); st.set_normal(d1); st.add_vertex(p1)
		st.set_normal(d0); st.add_vertex(p0); st.set_normal(d0); st.add_vertex(p3); st.set_normal(d1); st.add_vertex(p2)
		if cap and rb > 0.0:
			st.set_normal(ax); st.add_vertex(b); st.add_vertex(p2); st.add_vertex(p3)

static func _box(st: SurfaceTool, c: Vector3, s: Vector3, col: Color, uvx := 0.0) -> void:
	var h := s * 0.5
	var faces := [[Vector3.UP, Vector3(1, 0, 0), Vector3(0, 0, 1)], [Vector3.DOWN, Vector3(0, 0, 1), Vector3(1, 0, 0)],
		[Vector3.RIGHT, Vector3(0, 0, 1), Vector3(0, 1, 0)], [Vector3.LEFT, Vector3(0, 1, 0), Vector3(0, 0, 1)],
		[Vector3.BACK, Vector3(0, 1, 0), Vector3(1, 0, 0)], [Vector3.FORWARD, Vector3(1, 0, 0), Vector3(0, 1, 0)]]
	st.set_color(col)
	for f in faces:
		var n: Vector3 = f[0]; var a: Vector3 = f[1]; var b: Vector3 = f[2]
		var o := c + n * h
		var ea := a * h; var eb := b * h
		var p := [o - ea - eb, o + ea - eb, o + ea + eb, o - ea + eb]
		st.set_normal(n)
		for k in [0, 1, 2, 0, 2, 3]:
			var pv: Vector3 = p[k]
			st.set_uv(Vector2(uvx, (pv.y - (c.y - h.y)) / 100.0)); st.add_vertex(pv)

## A triangle whose outward normal is (b - a) x (c - a). Godot draws clockwise faces as the front, and that cross product points
## the other way, so the vertices go out as a, c, b. 1128c (owner: "the roofs look like the house is slashed from the top"):
## they went out as a, b, c, so every roof slope and gable was a back face from outside; with back-face culling the near slope
## and the gables vanished and the dark inside of the far slope showed down to the windows. tests/mesh_winding_truth.gd guards it.
static func _tri(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, uvx := 0.0) -> void:
	var n := (b - a).cross(c - a).normalized()
	st.set_normal(n)
	for p in [a, c, b]: st.set_uv(Vector2(uvx, 0)); st.add_vertex(p)

static func _commit(st: SurfaceTool) -> ArrayMesh:
	st.index(); return st.commit()

## A conifer 1 m tall (instances scale it): a trunk and six drooping tiers of branches with ragged tips. Audit 1128c: the three
## smooth cones read as toy cut-outs; normals point out and up from the trunk (not per facet) so a crown shades round, and the
## vertex colour is darker inside and toward the foot of each tier, which reads as self-shadow between the branch layers.
static func conifer() -> ArrayMesh:
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	_cyl(st, Vector3.ZERO, Vector3(0, 0.3, 0), 0.03, 0.02, 6, Color(0.22, 0.15, 0.10))
	var tiers := 6; var seg := 12
	for t in tiers:
		var f := float(t) / float(tiers - 1)             # 0 bottom .. 1 top
		var y0 := lerpf(0.12, 0.70, f)                   # tier skirt height
		var y1 := y0 + lerpf(0.30, 0.30, f)              # tier top (on the trunk)
		var r := lerpf(0.30, 0.08, f)
		var droop := lerpf(0.06, 0.03, f)
		var g := Color(0.11, 0.21, 0.11).lerp(Color(0.15, 0.27, 0.13), f)
		var top := Vector3(0, y1, 0)
		var ring := []
		for k in seg:
			var th := TAU * (float(k) + 0.37 * float(t)) / float(seg)
			var rr := r * (1.0 if k % 2 == 0 else 0.72) * (1.0 + 0.08 * sin(float(k * 7 + t * 3)))
			ring.append(Vector3(cos(th) * rr, y0 - (droop if k % 2 == 0 else droop * 0.3), sin(th) * rr))
		var inner := Vector3(0, y0 + 0.02, 0)
		for k in seg:
			var p0: Vector3 = ring[k]; var p1: Vector3 = ring[(k + 1) % seg]
			var n0 := (Vector3(p0.x, 0, p0.z).normalized() + Vector3(0, 0.9, 0)).normalized()
			var n1 := (Vector3(p1.x, 0, p1.z).normalized() + Vector3(0, 0.9, 0)).normalized()
			st.set_color(g * 1.12); st.set_normal(Vector3.UP); st.add_vertex(top)
			st.set_color(g); st.set_normal(n1); st.add_vertex(p1)
			st.set_color(g); st.set_normal(n0); st.add_vertex(p0)
			# underside: dark, faces down and out
			st.set_color(g * 0.35); st.set_normal(Vector3.DOWN); st.add_vertex(inner)
			st.set_color(g * 0.55); st.set_normal((n0 - Vector3(0, 1.4, 0)).normalized()); st.add_vertex(p0)
			st.set_color(g * 0.55); st.set_normal((n1 - Vector3(0, 1.4, 0)).normalized()); st.add_vertex(p1)
	st.set_color(Color(0.16, 0.28, 0.14)); st.set_normal(Vector3.UP)
	return st.commit()

## A broadleaf tree 1 m tall: a forked trunk and a crown of seven lumpy clumps. Normals blend each clump's own with the whole
## crown's (out from its centre), so the crown shades as one round mass with lumps, the way a tree reads from 100 m.
static func broadleaf() -> ArrayMesh:
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	_cyl(st, Vector3.ZERO, Vector3(0, 0.42, 0), 0.04, 0.028, 6, Color(0.26, 0.19, 0.12))
	_cyl(st, Vector3(0, 0.36, 0), Vector3(0.12, 0.6, 0.04), 0.022, 0.012, 5, Color(0.26, 0.19, 0.12))
	_cyl(st, Vector3(0, 0.36, 0), Vector3(-0.1, 0.58, -0.06), 0.022, 0.012, 5, Color(0.26, 0.19, 0.12))
	var cc := Vector3(0, 0.68, 0)
	var clumps := [[Vector3(0, 0.66, 0), 0.27], [Vector3(0.16, 0.62, 0.05), 0.19], [Vector3(-0.15, 0.64, -0.06), 0.2], [Vector3(0.02, 0.62, 0.17), 0.18],
		[Vector3(-0.03, 0.63, -0.17), 0.18], [Vector3(0.07, 0.84, 0.03), 0.2], [Vector3(-0.08, 0.80, -0.04), 0.17]]
	var sm := SphereMesh.new(); sm.radial_segments = 9; sm.rings = 5
	for c in clumps:
		sm.radius = c[1]; sm.height = c[1] * 1.7
		var a := sm.get_mesh_arrays()
		var vs: PackedVector3Array = a[Mesh.ARRAY_VERTEX]; var ns: PackedVector3Array = a[Mesh.ARRAY_NORMAL]; var ix: PackedInt32Array = a[Mesh.ARRAY_INDEX]
		for k in ix:
			var jit := 1.0 + 0.16 * sin(vs[k].x * 41.0 + vs[k].y * 29.0 + vs[k].z * 17.0) * cos(vs[k].z * 31.0 - vs[k].x * 13.0)
			var p: Vector3 = c[0] + vs[k] * jit
			var nn := (ns[k] * 0.45 + (p - cc).normalized() * 0.55).normalized()
			var shade := clampf(0.55 + 0.6 * (p.y - 0.45) + 0.5 * (p - cc).length(), 0.45, 1.15)
			st.set_color(Color(0.20, 0.33, 0.12) * shade); st.set_normal(nn); st.add_vertex(p)
	return st.commit()

## A house of unit footprint (1 x 1 m, walls 1 m), gable roof (UV.x = 2 marks the roof for house.gdshader). Instances scale it.
static func house() -> ArrayMesh:
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	_box(st, Vector3(0, 0.5, 0), Vector3(1, 1, 1), Color.WHITE, 0.0)
	var r := 0.55; var top := 1.45
	var a := Vector3(-r, 1.0, -0.56); var b := Vector3(r, 1.0, -0.56); var c := Vector3(r, 1.0, 0.56); var d := Vector3(-r, 1.0, 0.56)
	var t0 := Vector3(-r, top, 0); var t1 := Vector3(r, top, 0)
	st.set_color(Color.WHITE)
	_tri(st, a, t1, b, 2.0); _tri(st, a, t0, t1, 2.0)    # north slope
	_tri(st, d, c, t1, 2.0); _tri(st, d, t1, t0, 2.0)    # south slope
	_tri(st, Vector3(-0.5, 1.0, -0.5), Vector3(-0.5, 1.0, 0.5), Vector3(-0.5, top - 0.05, 0), 0.0)   # gables (wall)
	_tri(st, Vector3(0.5, 1.0, 0.5), Vector3(0.5, 1.0, -0.5), Vector3(0.5, top - 0.05, 0), 0.0)
	return _commit(st)

## A flat-roofed block (school hall, harbour sheds): roof flagged as roof.
static func block() -> ArrayMesh:
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	_box(st, Vector3(0, 0.5, 0), Vector3(1, 1, 1), Color.WHITE, 0.0)
	_box(st, Vector3(0, 1.02, 0), Vector3(1.04, 0.04, 1.04), Color.WHITE, 2.0)
	return _commit(st)

## A boulder about 1 m across.
static func boulder() -> ArrayMesh:
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var sm := SphereMesh.new(); sm.radius = 0.5; sm.height = 0.7; sm.radial_segments = 7; sm.rings = 4
	var a := sm.get_mesh_arrays()
	var vs: PackedVector3Array = a[Mesh.ARRAY_VERTEX]; var ix: PackedInt32Array = a[Mesh.ARRAY_INDEX]
	st.set_color(Color(0.42, 0.4, 0.37))
	for k in ix: st.add_vertex(vs[k] * (1.0 + 0.25 * sin(vs[k].x * 9.0 + vs[k].z * 7.0)) + Vector3(0, 0.15, 0))
	st.generate_normals()
	return st.commit()

## A line support of a family (RouteDraw.FAMILY): wood / concrete / tubular poles with a crossarm and three insulators, or a lattice tower.
## Returns [mesh, phase attachment offsets (local, the line runs along +X)].
static func support(family: String, pole_m: float, attach_m: float) -> Array:
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var att: Array = []
	if family.begins_with("lattice") or family.begins_with("crossing"):
		var steel := Color(0.55, 0.57, 0.6)
		var w0 := 2.2 if family.begins_with("lattice") else 2.8; var w1 := 0.6
		var legs := [Vector3(-1, 0, -1), Vector3(1, 0, -1), Vector3(1, 0, 1), Vector3(-1, 0, 1)]
		for l in legs:
			_cyl(st, l * w0 * 0.5, l * w1 * 0.5 + Vector3(0, pole_m, 0), 0.07, 0.05, 4, steel)
		var n := int(pole_m / 2.5)
		for k in n:   # cross bracing between the legs
			var y0 := pole_m * k / n; var y1 := pole_m * (k + 1) / n
			for q in 4:
				var la: Vector3 = legs[q]; var lb: Vector3 = legs[(q + 1) % 4]
				var wa := lerpf(w0, w1, y0 / pole_m) * 0.5; var wb := lerpf(w0, w1, y1 / pole_m) * 0.5
				_cyl(st, la * wa + Vector3(0, y0, 0), lb * wb + Vector3(0, y1, 0), 0.03, 0.03, 3, steel)
		var arm_y := attach_m + 0.9
		_cyl(st, Vector3(0, arm_y, -2.6), Vector3(0, arm_y, 2.6), 0.08, 0.08, 4, steel)
		for z in [-2.3, 0.0, 2.3]:
			_cyl(st, Vector3(0, arm_y, z), Vector3(0, arm_y - 0.9, z), 0.07, 0.07, 5, Color(0.75, 0.78, 0.8))
			att.append(Vector3(0, arm_y - 0.9, z))
	else:
		var col := Color(0.36, 0.27, 0.18) if family.begins_with("wood") else Color(0.62, 0.62, 0.6)
		var r0 := 0.16 if family.begins_with("wood") else 0.2
		_cyl(st, Vector3.ZERO, Vector3(0, pole_m, 0), r0, r0 * 0.7, 6, col, true)
		var arm_y := attach_m
		_cyl(st, Vector3(0, arm_y - 0.25, -1.1), Vector3(0, arm_y - 0.25, 1.1), 0.06, 0.06, 4, Color(0.4, 0.42, 0.45))
		for z in [-0.95, 0.95]:
			_cyl(st, Vector3(0, arm_y - 0.2, z), Vector3(0, arm_y + 0.15, z), 0.05, 0.05, 5, Color(0.8, 0.82, 0.85))
			att.append(Vector3(0, arm_y + 0.15, z))
		_cyl(st, Vector3(0, pole_m, 0), Vector3(0, pole_m + 0.35, 0), 0.05, 0.05, 5, Color(0.8, 0.82, 0.85))
		att.insert(1, Vector3(0, pole_m + 0.35, 0))
	st.generate_normals()
	return [st.commit(), att]

## A double-circuit lattice tower `h` metres tall with three crossarms a side (half-spans `arm` m at the middle level) and an earth-wire peak.
## Returns [mesh, attachment offsets: 6 phase points (left top..bottom, right top..bottom), then the earth-wire peak, red light point].
static func tower(h: float, arm: float) -> Array:
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var steel := Color(0.6, 0.62, 0.65)
	var w0 := h * 0.17; var wm := h * 0.055; var waist := h * 0.6
	var legs := [Vector3(-1, 0, -1), Vector3(1, 0, -1), Vector3(1, 0, 1), Vector3(-1, 0, 1)]
	var lr := maxf(0.09, h * 0.0028)
	for l in legs:
		_cyl(st, l * w0 * 0.5, l * wm * 0.5 + Vector3(0, waist, 0), lr, lr * 0.8, 4, steel)
		_cyl(st, l * wm * 0.5 + Vector3(0, waist, 0), l * wm * 0.35 + Vector3(0, h, 0), lr * 0.8, lr * 0.6, 4, steel)
	var n := int(h / 3.2)
	for k in n:   # X bracing on the four faces
		var y0 := h * k / n; var y1 := h * (k + 1) / n
		var f0 := lerpf(w0, wm, minf(1.0, y0 / waist)) * 0.5 if y0 < waist else lerpf(wm, wm * 0.7, (y0 - waist) / (h - waist)) * 0.5
		var f1 := lerpf(w0, wm, minf(1.0, y1 / waist)) * 0.5 if y1 < waist else lerpf(wm, wm * 0.7, (y1 - waist) / (h - waist)) * 0.5
		for q in 4:
			var la: Vector3 = legs[q]; var lb: Vector3 = legs[(q + 1) % 4]
			_cyl(st, la * f0 + Vector3(0, y0, 0), lb * f1 + Vector3(0, y1, 0), lr * 0.4, lr * 0.4, 3, steel)
			_cyl(st, lb * f0 + Vector3(0, y0, 0), la * f1 + Vector3(0, y1, 0), lr * 0.4, lr * 0.4, 3, steel)
	var att: Array = []
	var levels := [[0.93, arm * 0.8], [0.79, arm], [0.65, arm * 0.88]]
	for side in [-1.0, 1.0]:
		for lv in levels:
			var y: float = h * lv[0]; var a: float = lv[1]
			var root := Vector3(0, y, side * wm * 0.4)
			var tip := Vector3(0, y, side * a)
			_cyl(st, root + Vector3(-wm * 0.3, 0, 0), tip, lr * 0.7, lr * 0.5, 3, steel)
			_cyl(st, root + Vector3(wm * 0.3, 0, 0), tip, lr * 0.7, lr * 0.5, 3, steel)
			_cyl(st, root + Vector3(0, h * 0.05, 0), tip, lr * 0.5, lr * 0.4, 3, steel)
			var ins := h * 0.075   # the insulator string
			_cyl(st, tip, tip - Vector3(0, ins, 0), 0.16, 0.16, 6, Color(0.82, 0.84, 0.86))
			att.append(tip - Vector3(0, ins, 0))
	_cyl(st, Vector3(0, h, 0), Vector3(0, h + h * 0.07, 0), lr * 0.6, lr * 0.3, 4, steel)
	att.append(Vector3(0, h + h * 0.07, 0))
	att.append(Vector3(0, h + h * 0.07 + 0.6, 0))
	st.generate_normals()
	return [st.commit(), att]

## A substation bay set: a circuit breaker (tank on legs with three bushings), current transformers and a disconnector post.
static func breaker() -> ArrayMesh:
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var g := Color(0.62, 0.64, 0.66); var por := Color(0.72, 0.42, 0.3)
	_box(st, Vector3(0, 2.6, 0), Vector3(2.2, 0.8, 1.3), g)
	for l in [Vector3(-0.8, 0, -0.5), Vector3(0.8, 0, -0.5), Vector3(-0.8, 0, 0.5), Vector3(0.8, 0, 0.5)]: _cyl(st, l, l + Vector3(0, 2.2, 0), 0.06, 0.06, 4, g)
	for z in [-0.9, 0.0, 0.9]:
		_cyl(st, Vector3(-0.6, 3.0, z * 0.5), Vector3(-0.6, 5.0, z * 0.5), 0.14, 0.1, 6, por)
		_cyl(st, Vector3(0.6, 3.0, z * 0.5), Vector3(0.6, 5.0, z * 0.5), 0.14, 0.1, 6, por)
	st.generate_normals()
	return st.commit()

## A distribution transformer on a plinth (about 2 x 1.6 x 2.2 m) with cooling fins.
static func transformer() -> ArrayMesh:
	# 1128c (art review: "the transformer is a toy"): same envelope (plinth 2.6 x 2.0, tank 1.8 x 1.8 x 1.3, bushings to 2.9 m),
	# now with stiffener ribs, two radiator banks of thin fins with headers, HV bushings with porcelain sheds, LV bushings,
	# a conservator on brackets and a dark cable box. Every call site scales it.
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var g := Color(0.36, 0.41, 0.39); var fin := Color(0.31, 0.35, 0.33); var por := Color(0.45, 0.27, 0.19); var conc := Color(0.52, 0.51, 0.48)
	_box(st, Vector3(0, 0.15, 0), Vector3(2.6, 0.3, 2.0), conc)
	_box(st, Vector3(0, 1.2, 0), Vector3(1.8, 1.8, 1.3), g)
	_box(st, Vector3(0, 2.13, 0), Vector3(1.9, 0.06, 1.4), g * 0.9)
	for k in 5:
		var x := -0.72 + 0.36 * k
		_box(st, Vector3(x, 1.2, 0.66), Vector3(0.05, 1.6, 0.04), g * 0.85)
		_box(st, Vector3(x, 1.2, -0.66), Vector3(0.05, 1.6, 0.04), g * 0.85)
	for side in [-1.0, 1.0]:
		for k in 9: _box(st, Vector3(-0.72 + 0.18 * k, 1.1, side * 0.86), Vector3(0.025, 1.3, 0.38), fin)
		_box(st, Vector3(0, 1.78, side * 0.72), Vector3(1.6, 0.06, 0.06), fin)
		_box(st, Vector3(0, 0.45, side * 0.72), Vector3(1.6, 0.06, 0.06), fin)
	for z in [-0.4, 0.0, 0.4]:
		_cyl(st, Vector3(0.35, 2.16, z), Vector3(0.35, 2.95, z), 0.05, 0.04, 8, por)
		for j in 5:
			var y := 2.3 + 0.13 * j
			_cyl(st, Vector3(0.35, y, z), Vector3(0.35, y + 0.04, z), 0.11, 0.11, 10, por, true)
		_cyl(st, Vector3(0.35, 2.95, z), Vector3(0.35, 3.0, z), 0.06, 0.06, 6, Color(0.55, 0.56, 0.58), true)
	for z in [-0.35, 0.0, 0.35]: _cyl(st, Vector3(-0.45, 2.16, z), Vector3(-0.45, 2.5, z), 0.05, 0.04, 6, por, true)
	_cyl(st, Vector3(-0.85, 2.55, -0.3), Vector3(-0.85, 2.55, 0.5), 0.17, 0.17, 12, g, true)
	for z in [-0.2, 0.4]: _box(st, Vector3(-0.85, 2.3, z), Vector3(0.06, 0.4, 0.06), g)
	_box(st, Vector3(-0.92, 0.9, 0), Vector3(0.18, 0.6, 0.6), Color(0.2, 0.21, 0.22))
	return st.commit()

## A busbar gantry 8 m wide, 7 m tall.
static func gantry() -> ArrayMesh:
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var s := Color(0.6, 0.62, 0.65)
	for x in [-4.0, 4.0]: _cyl(st, Vector3(x, 0, 0), Vector3(x, 7, 0), 0.12, 0.1, 4, s)
	_cyl(st, Vector3(-4.2, 7, 0), Vector3(4.2, 7, 0), 0.1, 0.1, 4, s)
	for x in [-2.5, 0.0, 2.5]: _cyl(st, Vector3(x, 7, 0), Vector3(x, 6.0, 0), 0.06, 0.06, 5, Color(0.8, 0.8, 0.82))
	for z in [-0.0]: _cyl(st, Vector3(-4.2, 5.6, z), Vector3(4.2, 5.6, z), 0.05, 0.05, 4, Color(0.75, 0.6, 0.4))
	st.generate_normals()
	return st.commit()

## A small fishing trawler, bow along +X, about 22 m long.
static func trawler() -> ArrayMesh:
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var hull := Color(0.45, 0.14, 0.12)
	_box(st, Vector3(0, 0.6, 0), Vector3(18, 2.2, 5.5), hull)
	st.set_color(hull)
	_tri(st, Vector3(9, -0.5, -2.75), Vector3(12.5, 1.7, 0), Vector3(9, 1.7, -2.75)); _tri(st, Vector3(9, -0.5, 2.75), Vector3(9, 1.7, 2.75), Vector3(12.5, 1.7, 0))
	_tri(st, Vector3(9, 1.7, -2.75), Vector3(12.5, 1.7, 0), Vector3(9, 1.7, 2.75))
	_box(st, Vector3(-3, 3.0, 0), Vector3(5, 2.8, 4), Color(0.88, 0.86, 0.8))
	_cyl(st, Vector3(1, 1.7, 0), Vector3(1, 11, 0), 0.12, 0.08, 5, Color(0.25, 0.22, 0.2))
	_cyl(st, Vector3(-7, 1.7, 0), Vector3(-9, 8, 0), 0.08, 0.06, 4, Color(0.25, 0.22, 0.2))
	st.generate_normals()
	return st.commit()

## The island lighthouse, 18 m, red bands.
static func lighthouse() -> ArrayMesh:
	var st := SurfaceTool.new(); st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for k in 6:
		var y0 := 2.6 * k; var y1 := 2.6 * (k + 1)
		_cyl(st, Vector3(0, y0, 0), Vector3(0, y1, 0), lerpf(2.0, 1.2, y0 / 15.6), lerpf(2.0, 1.2, y1 / 15.6), 12, Color(0.92, 0.9, 0.85) if k % 2 == 0 else Color(0.7, 0.18, 0.14))
	_cyl(st, Vector3(0, 15.6, 0), Vector3(0, 17.2, 0), 1.0, 1.0, 10, Color(0.15, 0.15, 0.17))
	_cyl(st, Vector3(0, 17.2, 0), Vector3(0, 18.4, 0), 1.3, 0.0, 10, Color(0.15, 0.15, 0.17), true)
	st.generate_normals()
	return st.commit()

## A conductor between two attachment points with the engine's mid-span sag (a parabola below the chord), as a thin tube. uv0 = metres from the route start.
static func add_wire(st: SurfaceTool, a: Vector3, b: Vector3, sag_m: float, r: float, uv0: float, n := 14) -> void:
	var prev := a; var len := a.distance_to(b)
	for k in range(1, n + 1):
		var t := float(k) / n
		var p := a.lerp(b, t) - Vector3(0, 4.0 * sag_m * t * (1.0 - t), 0)
		_tube_seg(st, prev, p, r, uv0 + len * (t - 1.0 / n), uv0 + len * t)
		prev = p

static func _tube_seg(st: SurfaceTool, a: Vector3, b: Vector3, r: float, u0: float, u1: float) -> void:
	var ax := (b - a).normalized()
	var u := ax.cross(Vector3.UP).normalized() * r; var v := Vector3.UP * r
	var ring := [u, v, -u, -v]
	for s in 4:
		var d0: Vector3 = ring[s]; var d1: Vector3 = ring[(s + 1) % 4]
		st.set_normal(d0.normalized()); st.set_uv(Vector2(u0 / 60.0, 0)); st.add_vertex(a + d0)
		st.set_normal(d1.normalized()); st.set_uv(Vector2(u0 / 60.0, 1)); st.add_vertex(a + d1)
		st.set_normal(d1.normalized()); st.set_uv(Vector2(u1 / 60.0, 1)); st.add_vertex(b + d1)
		st.set_normal(d0.normalized()); st.set_uv(Vector2(u0 / 60.0, 0)); st.add_vertex(a + d0)
		st.set_normal(d1.normalized()); st.set_uv(Vector2(u1 / 60.0, 1)); st.add_vertex(b + d1)
		st.set_normal(d0.normalized()); st.set_uv(Vector2(u1 / 60.0, 0)); st.add_vertex(b + d0)
