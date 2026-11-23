extends SceneTree
## The finale's world is built in parallel rows (1.18, load time). The result must not depend on it: on L28's generated province the height
## grid, the near terrain mesh and the forest list built on the worker pool equal the ones built in order, value for value.

func _initialize() -> void:
	var T := Truth.new()
	if not T.start(root): print("PAR-ROWS-TRUTH FAILED engine"); quit(1); return
	T.level("L28")
	var m := WorldModel.build(T.b)
	var gf := GenField.new(m, clampf(30000.0 / maxf(1.0, float(m.map.x)), 200.0, 600.0))
	var r := Rect2(-600, -600, gf.size_m.x * 0.3, gf.size_m.y * 0.3)
	TerrainField.serial = true
	var a := gf.height_grid(r.position.x, r.position.y, 60.0, int(r.size.x / 60.0), int(r.size.y / 60.0))
	var ma := gf.grid_mesh(r, 80.0).surface_get_arrays(0)
	TerrainField.serial = false
	var b := gf.height_grid(r.position.x, r.position.y, 60.0, int(r.size.x / 60.0), int(r.size.y / 60.0))
	var mb := gf.grid_mesh(r, 80.0).surface_get_arrays(0)
	T.check(a.size() > 1000 and a == b, "height grid: threaded equals serial (%d values)" % a.size())
	T.check(ma[Mesh.ARRAY_VERTEX] == mb[Mesh.ARRAY_VERTEX], "terrain mesh vertices equal (%d)" % (ma[Mesh.ARRAY_VERTEX] as PackedVector3Array).size())
	T.check(ma[Mesh.ARRAY_COLOR] == mb[Mesh.ARRAY_COLOR] and ma[Mesh.ARRAY_TEX_UV2] == mb[Mesh.ARRAY_TEX_UV2], "terrain splat weights equal")
	T.check(ma[Mesh.ARRAY_INDEX] == mb[Mesh.ARRAY_INDEX], "terrain indices equal")
	T.finish("PAR-ROWS-TRUTH", self)
