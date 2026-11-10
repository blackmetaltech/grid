class_name GridBuildScreen
extends CbScreen
## Build drawer: the parts the running level allows (engine query `palette`, from the level spec's allowed actions and parts) and a form per action.
## "Place" sends the action through the bridge exactly as the player's click would; a refusal comes back as the engine's teaching message.

## argument schemas: [kind, label key, extra]. kinds: part (the level's allowed parts), bus, branch, shunt, element, int [min, max, default], num [min, max, step, default], bool, run
const SCHEMA := {
	"placeHut": [["num", "ARG_DIST", [120.0, 300.0, 10.0, 200.0]]],
	"layCable": [["run", "ARG_RUN", null], ["part", "ARG_SIZE", null]],
	"placeJunction": [],
	"placeConverters": [["bool", "ARG_ON", true]],
	"switchBranch": [["part", "ARG_BRANCH", null], ["bool", "ARG_CLOSED", true]],
	"placeShunt": [["bus", "ARG_BUS", null], ["part", "ARG_PART", null], ["int", "ARG_STEPS", [1, 4, 4]]],
	"setShuntSteps": [["shunt", "ARG_SHUNT", null], ["int", "ARG_STEPS", [0, 4, 1]]],
	"setShuntAuto": [["shunt", "ARG_SHUNT", null], ["num", "ARG_VLOW", [0.8, 1.1, 0.005, 0.975]], ["num", "ARG_VHIGH", [0.9, 1.2, 0.005, 1.005]], ["int", "ARG_DELAY", [0, 8, 1]]],
	"demolish": [["element", "ARG_ELEMENT", null]],
	"stringLine": [["bus", "ARG_FROM", null], ["bus", "ARG_TO", null], ["part", "ARG_PART", null], ["int", "ARG_CIRCUITS", [1, 4, 1]], ["num", "ARG_LEN", [0.0, 200.0, 0.5, 0.0]]],
}

static var values := {}   ## action -> Array of chosen argument values (kept across rebuilds)

func build(b: VBoxContainer) -> void:
	GridUi.load_strings()
	CbKit.header(b, tr("BUILD_TITLE"), tr("BUILD_HINT"))
	var p = app.b.q("palette")
	if not (p is Dictionary) or not p.get("active", false):
		b.add_child(CbKit.label(tr("BUILD_NO_LEVEL"), 16, CbKit.DIM, true)); return
	var w = app.b.q("world")
	for a in p.actions:
		_tile(b, a, w if w is Dictionary else {})
	b.add_child(CbKit.label(tr("BUILD_NOTE"), 13, CbKit.DIM, true))

func _part_label(x) -> String: return tr("PART_MM2") % str(x) if (x is float or x is int) else str(x)

func _ids(w: Dictionary, key: String) -> Array:
	var out: Array = []
	for e in w.get(key, []): out.append(str(e.id))
	return out

func _tile(b: VBoxContainer, a: Dictionary, w: Dictionary) -> void:
	var act: String = str(a.action)
	var title: String = tr("ACT_" + act) if tr("ACT_" + act) != "ACT_" + act else act
	var desc: String = tr("ACT_" + act + "_D") if tr("ACT_" + act + "_D") != "ACT_" + act + "_D" else tr("ACT_UNKNOWN_D")
	var pn := CbKit.panel(title, false, b); var v: VBoxContainer = pn[1]
	v.add_child(CbKit.label(desc, 14, CbKit.DIM, true))
	var schema: Array = SCHEMA.get(act, [])
	if not values.has(act): values[act] = []
	var vals: Array = values[act]
	var parts: Array = a.parts
	if not parts.is_empty():
		var shown: Array = parts.map(func(x): return _part_label(x))
		v.add_child(CbKit.label(tr("BUILD_PARTS") % ", ".join(shown), 13, CbKit.DIM, true))
	var scen := str(w.get("bench", {}).get("scenario", "")) if w.get("bench") is Dictionary else ""
	var grid := CbKit.cols_row(10)
	var flow := VBoxContainer.new(); flow.add_theme_constant_override("separation", 6); v.add_child(flow)
	for i in schema.size():
		var sp: Array = schema[i]
		while vals.size() <= i: vals.append(null)
		var kind: String = sp[0]
		var row := HBoxContainer.new(); row.add_theme_constant_override("separation", 8)
		var lb := CbKit.label(tr(sp[1]), 14, CbKit.DIM, true); lb.size_flags_horizontal = Control.SIZE_EXPAND_FILL; row.add_child(lb)
		var idx := i
		match kind:
			"part", "bus", "branch", "shunt", "element", "run":
				var opts: Array = []
				if kind == "part":
					for x in parts: opts.append([str(x), _part_label(x)])
				elif kind == "bus": for id in _ids(w, "buses"): opts.append([id, id])
				elif kind == "shunt": for id in _ids(w, "shunts"): opts.append([id, id])
				elif kind == "element":
					for key in ["units", "shunts", "branches"]: for id in _ids(w, key): opts.append([id, id])
				elif kind == "run":
					opts.append(["main", tr("ARG_RUN_MAIN")])
					if scen == "l02": opts.append(["b", tr("ARG_RUN_B")])
				if opts.is_empty(): row.add_child(CbKit.label(tr("BUILD_NONE"), 13, CbKit.DIM)); vals[i] = null
				else:
					var cur = vals[i]
					var ids: Array = opts.map(func(o): return o[0])
					if cur == null or not ids.has(str(cur)): cur = ids[0]; vals[i] = cur
					row.add_child(CbKit.option(opts, str(cur), func(id): values[act][idx] = id))
			"num":
				var d: Array = sp[2]
				if vals[i] == null: vals[i] = d[3]
				row.add_child(CbKit.spin(float(vals[i]), d[0], d[1], d[2], func(x): values[act][idx] = x))
			"int":
				var d2: Array = sp[2]
				if vals[i] == null: vals[i] = d2[2]
				row.add_child(CbKit.spin(float(vals[i]), d2[0], d2[1], 1.0, func(x): values[act][idx] = int(x)))
			"bool":
				if vals[i] == null: vals[i] = sp[2]
				row.add_child(CbKit.check("", bool(vals[i]), func(on): values[act][idx] = on))
		flow.add_child(row)
	var go := CbKit.btn(tr("BUILD_PLACE"), func(): _place(act, schema), "go", 16); go.name = "place_" + act
	v.add_child(go)

func _place(act: String, schema: Array) -> void:
	var args: Array = []
	var vals: Array = values.get(act, [])
	for i in schema.size():
		var x = vals[i] if i < vals.size() else null
		var kind: String = schema[i][0]
		if kind == "part" and x != null and str(x).is_valid_float(): x = float(str(x))   # sizes are numbers in the engine
		args.append(x)
	var r: Dictionary = app.b.act(act, args)
	app.sfx("confirm" if r.get("ok", false) else "bad")
	app.toast("%s: %s" % [tr("ACT_OK") if r.get("ok", false) else tr("ACT_REFUSED"), str(r.get("message", ""))], "good" if r.get("ok", false) else "bad")
