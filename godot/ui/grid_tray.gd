class_name GridTray
extends Control
## The grid tray (GRID levels without a terrain: chapters 3-7 and the finale; the kit tray keeps bench levels, the route tray keeps terrain levels).
## A low ink shelf, left to right: one cell per placeable part of the level (engine query `palette`), the knob cells of the parameters those parts take
## (steps, MW, circuits, km), the operate cells (breaker, remove, auto dispatch) and the paper budget tag. Pick a part: the buses (or lines, generators,
## banks) it can go on glow as pegs; click / tap / A on one and the action is sent with the part, the picks and the knobs as its arguments. Tapping a placed
## element in the world hangs an operate tag off it (breaker, bank steps, tap, droop, commit, dispatch, shed, remove). Every number and every refusal is
## the engine's (a refusal is a SYS line on the radio and the chip). Display and input only: no physics here.
##
## EXTENSION TABLES (a chapter adds a part or an action with ONE entry; no other edit in this file is needed):
##   PART_ICONS  [id prefix, icon]   how a catalogue id is drawn. A part whose id matches no prefix is drawn with its action's icon (ACTIONS[a].icon).
##   ICON_NAMES  icon -> string key  the cell caption of a part with no GT_PART_<id> string; units: UNITS (icon -> format of the id's last number).
##   ACTIONS     action -> {icon, pick: [kinds], args: [templates], knobs: [ids], cell: "place"|"op", live: bool}
##       pick kinds: bus | bus2 (a bus other than the first pick) | branch | line | xfmr | unit | thermal | shunt | load | storage | element
##       arg templates: "$0" "$1" the picks, "$part" the cell's catalogue id, "$name" a knob's value ("$steps"), "$flip:branch.inService" / "$flip:dispatch.auto"
##       (the opposite of the engine's current flag), anything else is passed as is. An action in the palette with parts but not in this table is a
##       generic part: pick one bus, args [bus, part]. An action without parts is a cell only when its ACTIONS entry says cell = "op".
##   KNOBS       id -> {min, max, step, def, int?, fmt?}   a knob is a stepper cell (left half -, right half +), shown when a visible cell lists it.
##   OPS         action -> {elem, row, ...}   rows of the operate tag of a placed element; row kinds: toggle, step, num, multi, once, pair.
## Input: mouse / touch (tap = click; the tray scrolls when it is wider than the screen), keyboard (1-9 cells, shift+digit steps a knob down, Tab / Enter walk
## and pick the pegs, Backspace undoes the last pick, Esc), pad (LB/RB cycle the cells, A pick / activate, D-pad left/right step a knob or walk the pegs,
## Y the next element's operate tag, B undo / cancel).

signal mode_changed(mode: String)
const H := 96.0
const PAD := 12.0
const GAP := 6.0
const GGAP := 12.0
const WIDE := 900.0
const TAG_W := 176.0
const MIN_CELL := 66.0
const CELL_W := 70.0

const PART_ICONS := [["cap", "capacitor"], ["react", "reactor"], ["shr", "reactor"], ["dt-", "transformer"], ["tx", "transformer"], ["xf", "transformer"], ["tr-", "transformer"],
	["ccgt", "gas"], ["ocgt", "gas"], ["gas", "gas"], ["coal", "coal"], ["diesel", "diesel"], ["hydro", "hydro"], ["microhydro", "hydro"], ["smallhydro", "hydro"], ["psp", "hydro"],
	["pv", "pv"], ["wind", "wind"], ["nuclear", "nuclear"], ["biomass", "biomass"], ["synccon", "synccon"], ["bess", "battery"]]
const ICON_NAMES := {"capacitor": "GT_ICON_capacitor", "reactor": "GT_ICON_reactor", "transformer": "GT_ICON_transformer", "gas": "GT_ICON_gas", "coal": "GT_ICON_coal", "diesel": "GT_ICON_diesel",
	"hydro": "GT_ICON_hydro", "pv": "GT_ICON_pv", "wind": "GT_ICON_wind", "nuclear": "GT_ICON_nuclear", "biomass": "GT_ICON_biomass", "synccon": "GT_ICON_synccon", "battery": "GT_ICON_battery",
	"line": "GT_ICON_line", "breaker": "GT_ICON_breaker", "demolish": "GT_ICON_demolish", "dispatch": "GT_ICON_dispatch", "part": "GT_ICON_part"}
const UNITS := {"capacitor": "GT_UNIT_kvar", "reactor": "GT_UNIT_kvar", "gas": "GT_UNIT_mw", "coal": "GT_UNIT_mw", "diesel": "GT_UNIT_mw", "hydro": "GT_UNIT_mw", "pv": "GT_UNIT_mw", "wind": "GT_UNIT_mw",
	"nuclear": "GT_UNIT_mw", "biomass": "GT_UNIT_mw", "synccon": "GT_UNIT_mw", "battery": "GT_UNIT_mw"}
const ACTIONS := {
	"placeShunt": {"icon": "capacitor", "pick": ["bus"], "args": ["$0", "$part", "$steps"], "knobs": ["steps"]},
	"placeUnit": {"icon": "gas", "pick": ["bus"], "args": ["$0", "$part", "$mw"], "knobs": ["mw"]},
	"placeStorage": {"icon": "battery", "pick": ["bus"], "args": ["$0", "$part"], "knobs": []},
	"placeTransformer": {"icon": "transformer", "pick": ["bus", "bus2"], "args": ["$0", "$1", "$part"], "knobs": []},
	"stringLine": {"icon": "line", "pick": ["bus", "bus2"], "args": ["$0", "$1", "$part", "$circuits", "$km"], "knobs": ["circuits", "km"]},
	"switchBranch": {"icon": "breaker", "pick": ["branch"], "args": ["$0", "$flip:branch.inService"], "knobs": [], "cell": "op", "live": true},
	"demolish": {"icon": "demolish", "pick": ["element"], "args": ["$0"], "knobs": [], "cell": "op"},
	"setAutoDispatch": {"icon": "dispatch", "pick": [], "args": ["$flip:dispatch.auto"], "knobs": [], "cell": "op", "live": true},
}
const KNOBS := {
	"steps": {"min": 1, "max": 4, "step": 1, "def": 1, "int": true}, "mw": {"min": 1, "max": 1000, "step": 5, "def": 20},
	"circuits": {"min": 1, "max": 4, "step": 1, "def": 1, "int": true}, "km": {"min": 0, "max": 200, "step": 0.5, "def": 0},
	"on": {"min": 0, "max": 4, "step": 1, "def": 1, "int": true}, "droop": {"min": 1, "max": 12, "step": 0.5, "def": 5},
	"vlow": {"min": 0.8, "max": 1.1, "step": 0.005, "def": 0.975, "fmt": "%.3f"}, "vhigh": {"min": 0.9, "max": 1.2, "step": 0.005, "def": 1.005, "fmt": "%.3f"},
	"delay": {"min": 1, "max": 8, "step": 1, "def": 1, "int": true}, "vset": {"min": 0.9, "max": 1.1, "step": 0.005, "def": 1.0, "fmt": "%.3f"},
	"band": {"min": 0.005, "max": 0.05, "step": 0.0025, "def": 0.0125, "fmt": "%.4f"}, "dmw": {"min": 0, "max": 1000, "step": 1, "def": 10},
	"shed": {"min": 0, "max": 1, "step": 0.1, "def": 0.5, "fmt": "%.1f"},
}
const OPS := {
	"switchBranch": {"elem": "branch", "row": "toggle", "field": "inService", "live": true},
	"setShuntSteps": {"elem": "shunt", "row": "step", "field": "on", "min": 0, "max_field": "steps", "live": true},
	"setShuntAuto": {"elem": "shunt", "row": "multi", "knobs": ["vlow", "vhigh", "delay"], "live": true},
	"setTap": {"elem": "branch", "row": "step", "field": "tap.pos", "min_field": "tapMin", "max_field": "tapMax", "needs": "tap", "live": true},
	"setTapAuto": {"elem": "branch", "row": "multi", "knobs": ["vset", "band", "delay"], "needs": "tap", "live": true},
	"setDroop": {"elem": "unit", "row": "num", "knob": "droop", "field": "droopPct", "live": true},
	"commit": {"elem": "unit", "row": "pair", "thermal": true, "live": true},
	"setDispatch": {"elem": "unit", "row": "num", "knob": "dmw", "field": "P", "live": true},
	"shedLoad": {"elem": "load", "row": "num", "knob": "shed", "field": "shedFrac", "live": true},
	"demolish": {"elem": "*", "row": "once"},
}
const OP_KINDS := ["shunt", "unit", "branch", "bus"]   ## the elements of the world that carry an operate tag, in the order a tie in the tap goes

var b                               ## CbBridge
var world: WorldView
var radio: RadioLog
var instruments: Instruments
var sfx := Callable()
var tags                            ## TagView, optional (closed when a pick starts)
var slot := Callable()
var locked := Callable()

var items: Array = []               ## {kind: place|op|knob, action, part, id, icon, group, rect}
var mode := ""                      ## "" | "pick"
var armed := -1                     ## the cell whose action waits for its picks
var picks: Array = []               ## ids picked so far
var knobs := {}
var target_hi := -1
var hover := -1
var focus := -1
var engaged := false
var level := ""
var chip_text := ""
var chip_dot := Color.TRANSPARENT
var chip_at := Vector2.ZERO
var chip_cell := -1
var last_refusal_key := ""
var pal: Dictionary = {}
var op_kind := ""                   ## the open operate tag
var op_id := ""
var op_panel: PanelContainer
var _over: Control
var _op_vb: VBoxContainer
var _targets: Array = []            ## [{id, tile, label}] of the armed pick
var _scroll := 0.0
var _max_scroll := 0.0
var _press_idx := -1
var _press_x := 0.0
var _dragged := false
var _tag_inline := true
var _t := 0.0
var _op_cycle := -1
var _op_anchor := Vector2.ZERO
var _op_cand := -1
var _chip_until := 0                ## when the "done" chip goes away (a refusal stays until the next pick)

func _init() -> void:
	name = "GridTray"; mouse_filter = Control.MOUSE_FILTER_STOP; focus_mode = Control.FOCUS_NONE; visible = false
	mouse_exited.connect(func(): hover = -1; _cell_hover())
	TrayStrings.load_strings(); GridUi.load_strings()
	for k in KNOBS: knobs[k] = KNOBS[k].def

func tx(key: String) -> String: return TranslationServer.translate(key)
func active() -> bool: return visible
func is_locked() -> bool: return locked.is_valid() and bool(locked.call())
func hit_min() -> float: return maxf(48.0, CbLayout.tap()) if CbLayout.kind == "phone" else 0.0
func _avail_right() -> float: return size.x - PAD - (TAG_W + GAP if _tag_inline else 0.0)

# ---- state from the engine ------------------------------------------------------------------------------------------------------------
func refresh() -> void:
	if b == null: return
	var li = b.q("levelInfo"); var w = b.q("world"); var p = b.q("palette")
	var on: bool = li is Dictionary and li.get("active", false) and str(li.get("kind", "")) == "grid" and w is Dictionary and w.get("terrain") == null and p is Dictionary and p.get("active", false)
	if not on:
		if visible: _clear_all(); close_op()
		visible = false; level = ""; return
	if str(li.id) != level:
		_clear_all(); close_op(); level = str(li.id); _scroll = 0.0; focus = -1; engaged = false
		for k in KNOBS: knobs[k] = KNOBS[k].def
	pal = p
	build_items(p)
	visible = true
	if mode == "pick": _show_pegs()
	_refresh_op()
	layout(); _layout_items(); queue_redraw()

func _clear_all() -> void:
	mode = ""; armed = -1; picks = []; target_hi = -1; hover = -1; chip_text = ""; _targets = []
	if world != null: world.set_site_pegs([], -1)

## The cells of a palette ({actions: [{action, parts}]}): the part cells and the op cells per action, then the knobs those cells use.
func build_items(p: Dictionary) -> void:
	var out: Array = []; var ops: Array = []; var g := 0; var used: Array = []   # the part cells in palette order, then the operate cells
	for a in p.get("actions", []):
		var act := str(a.action); var spec: Dictionary = ACTIONS.get(act, {}); var parts: Array = a.get("parts", [])
		if not parts.is_empty() and str(spec.get("cell", "")) == "op":   # an operate action whose parts are the ids it may be used on (P0: the breaker of T5)
			ops.append({"kind": "op", "action": act, "part": "", "id": act, "icon": str(spec.icon), "group": 90, "only": parts.map(func(x): return str(x))})
		elif not parts.is_empty():
			if spec.is_empty(): spec = {"icon": "part", "pick": ["bus"], "args": ["$0", "$part"], "knobs": []}
			for part in parts: out.append({"kind": "place", "action": act, "part": str(part), "id": str(part), "icon": part_icon(str(part), str(spec.icon)), "group": g})
			for k in spec.knobs: if not used.has(k): used.append(k); out.append({"kind": "knob", "action": act, "id": str(k), "icon": "knob", "group": g})
			g += 1
		elif str(spec.get("cell", "")) == "op": ops.append({"kind": "op", "action": act, "part": "", "id": act, "icon": str(spec.icon), "group": 90, "only": []})
	items = out + ops
	if armed >= items.size(): _cancel_quiet()

static func part_icon(part: String, fallback: String) -> String:
	for pi in PART_ICONS: if part.begins_with(str(pi[0])): return str(pi[1])
	return fallback

func item_index(kind: String, id := "") -> int:
	for i in items.size(): if items[i].kind == kind and (id == "" or str(items[i].id) == id): return i
	return -1

func place_index(action: String, part := "") -> int:
	for i in items.size(): if items[i].kind == "place" and items[i].action == action and (part == "" or items[i].part == part): return i
	return -1

func _spec(action: String) -> Dictionary: return ACTIONS.get(action, {"icon": "part", "pick": ["bus"], "args": ["$0", "$part"], "knobs": []})

func _live(action: String) -> bool: return bool(_spec(action).get("live", false))

func _wq() -> Dictionary:
	var w = b.q("world")
	return w if w is Dictionary else {}

# ---- layout ---------------------------------------------------------------------------------------------------------------------------
func layout() -> void:
	if not slot.is_valid(): return
	var r: Rect2 = slot.call()
	var w := minf(r.size.x, 1120.0)
	position = Vector2(r.position.x + (r.size.x - w) * 0.5, r.position.y); size = Vector2(w, H)
	_layout_items(); queue_redraw()

func _layout_items() -> void:
	var w := size.x
	_tag_inline = w >= WIDE
	var avail := w - PAD * 2.0 - (TAG_W + GAP if _tag_inline else 0.0)
	var n := items.size(); var groups := 0; var lastg := -1
	for it in items: if int(it.group) != lastg: lastg = int(it.group); groups += 1
	var fit := (avail - GGAP * maxf(groups - 1, 0) - GAP * maxf(n - groups, 0)) / maxf(n, 1)
	var cw := clampf(fit, maxf(MIN_CELL, hit_min()), CELL_W)
	var x := PAD - _scroll; var total := 0.0; lastg = -1
	for it in items:
		if lastg >= 0 and int(it.group) != lastg: x += GGAP; total += GGAP
		lastg = int(it.group)
		it["rect"] = Rect2(Vector2(x, 5.0), Vector2(cw, H - 10.0)); x += cw + GAP; total += cw + GAP
	_max_scroll = maxf(0.0, total - GAP - avail)
	_scroll = clampf(_scroll, 0.0, _max_scroll)

func page(d: int) -> void:
	_scroll = clampf(_scroll + d * maxf(120.0, (_avail_right() - PAD) * 0.7), 0.0, _max_scroll); _layout_items(); queue_redraw()

func _visible_item(i: int) -> bool:
	var r: Rect2 = items[i].rect
	return r.position.x >= PAD - 2.0 and r.end.x <= _avail_right() + 2.0

func _ensure_visible(i: int) -> void:
	if i < 0 or i >= items.size() or _max_scroll <= 0.0: return
	var r: Rect2 = items[i].rect
	if r.position.x < PAD: _scroll = maxf(0.0, _scroll - (PAD - r.position.x))
	elif r.end.x > _avail_right(): _scroll = minf(_max_scroll, _scroll + (r.end.x - _avail_right()))
	_layout_items()

func _item_at(p: Vector2) -> int:
	for i in items.size(): if (items[i].rect as Rect2).has_point(p) and _visible_item(i): return i
	return -1

# ---- knobs ----------------------------------------------------------------------------------------------------------------------------
func knob_text(id: String, v = null) -> String:
	var k: Dictionary = KNOBS.get(id, {}); var x := float(knobs.get(id, 0.0) if v == null else v)
	if id == "km" and x <= 0.0: return tx("GT_FROM_MAP")
	if k.get("int", false): return str(int(round(x)))
	if k.has("fmt"): return str(k.fmt) % x
	return str(snappedf(x, 0.01))

## Step a knob by `d` steps (clamped to its range). Returns the new value.
func step_knob(id: String, d: int) -> float:
	var k: Dictionary = KNOBS.get(id, {})
	if k.is_empty(): return 0.0
	var v := clampf(snappedf(float(knobs[id]) + d * float(k.step), float(k.step) * 0.01 if float(k.step) < 1.0 else 0.0001), float(k.min), float(k.max))
	knobs[id] = int(round(v)) if k.get("int", false) else v
	_cell_hover(); queue_redraw()
	return float(knobs[id])

# ---- picking ----------------------------------------------------------------------------------------------------------------------------
func _cancel_quiet() -> void:
	mode = ""; armed = -1; picks = []; target_hi = -1; chip_text = ""; _targets = []
	if world != null: world.set_site_pegs([], -1)

func cancel() -> bool:
	if mode == "": return false
	_cancel_quiet(); mode_changed.emit(""); queue_redraw()
	return true

func cancel_key() -> bool:
	if cancel(): return true
	if op_kind != "": close_op(); return true
	if engaged: engaged = false; queue_redraw(); return true
	return false

func refuse_locked() -> void:
	cancel()
	if radio != null: radio.say("SYS", tx("GT_LOCKED"), "warn")

## Activate a cell (click, tap, pad A, a number key). Knob cells step up; `down` steps them down.
func activate(i: int, down := false) -> void:
	if i < 0 or i >= items.size(): return
	var it: Dictionary = items[i]
	if str(it.kind) == "knob": step_knob(str(it.id), -1 if down else 1); return
	if is_locked() and not _live(str(it.action)): refuse_locked(); return
	close_op(); if tags != null: tags.close()
	if mode == "pick" and armed == i: cancel(); return
	_cancel_quiet()
	var sp := _spec(str(it.action))
	armed = i
	if (sp.pick as Array).is_empty(): var r := run_armed(); armed = -1; queue_redraw(); return   # a cell with nothing to pick acts at once
	mode = "pick"; picks = []; _show_pegs(); mode_changed.emit(mode); _hint(); queue_redraw()

func _kind_of_pick() -> String:
	if armed < 0: return ""
	var pk: Array = _spec(str(items[armed].action)).pick
	return str(pk[mini(picks.size(), pk.size() - 1)]) if not pk.is_empty() else ""

func _hint() -> void:
	var s := tx("GT_HINT_" + _kind_of_pick()) % tx_part(items[armed]) if tx("GT_HINT_" + _kind_of_pick()).contains("%s") else tx("GT_HINT_" + _kind_of_pick())
	if CbLayout.touch: s = s.replace("Click", "Tap").replace("click", "tap")
	chip_text = s; chip_dot = Color.TRANSPARENT; chip_cell = -1; chip_at = Vector2(size.x * 0.5, -10.0)

# ---- the elements of the world a pick can land on ------------------------------------------------------------------------------------
func _bus_tile(bus: String) -> Vector2:
	for x in _wq().get("buses", []): if str(x.id) == bus: return Vector2(float(x.x), float(x.y))
	return Vector2.ZERO

func _kv_of(bus: String) -> String:
	for x in _wq().get("buses", []): if str(x.id) == bus: return str(x.kv).trim_suffix(".0")
	return ""

func _branch_tile(br: Dictionary) -> Vector2:
	if world != null and world.has_method("run_mid_tile"):
		var pts: Array = world.run_pts(str(br.id))
		if not pts.is_empty(): return world.run_mid_tile(str(br.id))
	return (_bus_tile(str(br["from"])) + _bus_tile(str(br.to))) * 0.5

## Every element of `kind` as {id, tile, label, kind}: the buses of the world, branches at their middle, units at their bus, banks beside theirs.
func elements(kind: String) -> Array:
	var out: Array = []
	match kind:
		"bus", "bus2":
			for x in _wq().get("buses", []):
				if kind == "bus2" and not picks.is_empty() and str(x.id) == str(picks[0]): continue
				out.append({"id": str(x.id), "tile": Vector2(float(x.x), float(x.y)), "label": tx("GT_PEG_BUS") % [str(x.id), _kv_of(str(x.id))], "kind": "bus"})
		"branch", "line", "xfmr":
			for br in b.g.get("branches", []):
				var isx := br.get("tap") != null
				if kind == "xfmr" and not isx: continue
				if kind == "line" and isx: continue
				out.append({"id": str(br.id), "tile": _branch_tile(br), "label": tx("GT_PEG_XFMR" if isx else "GT_PEG_LINE") % str(br.id), "kind": "branch"})
		"unit", "thermal":
			for u in b.g.get("units", []):
				if kind == "thermal" and str(u.kind) in ["pv", "wind"]: continue
				out.append({"id": str(u.id), "tile": _bus_tile(str(u.bus)), "label": tx("GT_PEG_UNIT") % [str(u.id), str(u.kind)], "kind": "unit"})
		"shunt":
			for h in b.g.get("shunts", []): out.append({"id": str(h.id), "tile": _bus_tile(str(h.bus)) + Vector2(0.9, 0.4), "label": tx("GT_PEG_SHUNT") % [str(h.id), str(h.bus)], "kind": "shunt"})
		"load":
			for l in b.g.get("loads", []): out.append({"id": str(l.id), "tile": _bus_tile(str(l.bus)), "label": tx("GT_PEG_LOAD") % [str(l.id), str(l.bus)], "kind": "load"})
		"storage":
			for s in b.g.get("storage", []): out.append({"id": str(s.id), "tile": _bus_tile(str(s.bus)), "label": tx("GT_PEG_STORAGE") % [str(s.id), str(s.bus)], "kind": "storage"})
		"element":
			for k in ["shunt", "unit", "branch", "storage"]: out.append_array(elements(k))
	return out

func _show_pegs() -> void:
	_targets = elements(_kind_of_pick())
	var only: Array = items[armed].get("only", []) if armed >= 0 and armed < items.size() else []
	if not only.is_empty(): _targets = _targets.filter(func(t): return only.has(str(t.id)))
	if target_hi >= _targets.size(): target_hi = -1
	if world == null: return
	var pegs: Array = []
	for t in _targets: pegs.append({"tile": t.tile, "label": t.label})
	world.set_site_pegs(pegs, target_hi)

func walk_target(d: int) -> void:
	if _targets.is_empty(): return
	set_target_hi((0 if d > 0 else _targets.size() - 1) if target_hi < 0 else posmod(target_hi + d, _targets.size()))

func set_target_hi(i: int) -> void:
	target_hi = i if i >= 0 and i < _targets.size() else -1
	_show_pegs(); queue_redraw()

func _target_at(pos: Vector2, list: Array) -> int:
	if world == null: return -1
	var r := 30.0
	if CbLayout.touch or CbLayout.kind == "phone": r = maxf(24.0, maxf(48.0, CbLayout.tap()) * 0.5)
	var best := -1; var bd := 1e9
	for i in list.size():
		var d := pos.distance_to(world.world_to_screen(list[i].tile, 14.0))
		if d <= r and d < bd: bd = d; best = i
	return best

## The arguments of the armed action from its template: picks, the cell's part, the knobs, the flipped flags.
func args_of(it: Dictionary) -> Array:
	var out: Array = []
	for a in _spec(str(it.action)).args:
		var s := str(a)
		if s == "$part": out.append(_part_arg(str(it.part)))
		elif s.begins_with("$flip:"): out.append(not _flag(s.trim_prefix("$flip:")))
		elif s.length() == 2 and s.begins_with("$") and s[1].is_valid_int(): out.append(str(picks[int(s[1])]) if int(s[1]) < picks.size() else "")
		elif s.begins_with("$") and KNOBS.has(s.trim_prefix("$")): var k := s.trim_prefix("$"); out.append(int(knobs[k]) if KNOBS[k].get("int", false) else float(knobs[k]))
		else: out.append(a)
	return out

func _part_arg(part: String):
	return float(part) if part.is_valid_float() else part   # sizes (mm2) are numbers in the engine, catalogue ids are strings

func _flag(spec: String) -> bool:
	if spec == "dispatch.auto": return bool((b.g.get("dispatch", {}) as Dictionary).get("auto", false))
	if spec.begins_with("branch.") and not picks.is_empty():
		for br in b.g.get("branches", []): if str(br.id) == str(picks[0]): return bool(br.get(spec.trim_prefix("branch."), false))
	return false

func _act(name: String, args: Array) -> Dictionary:
	var r: Dictionary = b.act(name, args)
	if r.get("ok", false):
		if sfx.is_valid(): sfx.call("breaker_close" if name == "switchBranch" else ("bad" if name == "demolish" else "place"))
		last_refusal_key = ""
	else:
		var msg := str(r.get("message", ""))
		chip_text = msg; chip_dot = GridTheme.BAD; chip_cell = -1; chip_at = Vector2(size.x * 0.5, -10.0)
		if radio != null: radio.say("SYS", msg, "warn")
		if sfx.is_valid(): sfx.call("bad")
	return r

## Send the armed action with the picks made so far.
func run_armed() -> Dictionary:
	if armed < 0: return {}
	return _act(str(items[armed].action), args_of(items[armed]))

## A click / tap / A on the element `id` of the armed pick: the next pick, or the action itself when the last pick is in.
func press_target(id: String) -> Dictionary:
	if mode != "pick" or armed < 0: return {}
	if is_locked() and not _live(str(items[armed].action)): refuse_locked(); return {}
	picks.append(id)
	var need: int = (_spec(str(items[armed].action)).pick as Array).size()
	if picks.size() < need:
		target_hi = -1; _show_pegs(); _hint(); queue_redraw(); return {"ok": true, "picked": id}
	var it: Dictionary = items[armed]
	var r := run_armed()
	picks = []; target_hi = -1
	if r.get("ok", false):   # the part stays armed (place several), the chip says what the engine did
		chip_text = str(r.get("message", "")); chip_dot = GridTheme.GOOD; chip_cell = -1; chip_at = Vector2(size.x * 0.5, -10.0); _chip_until = Time.get_ticks_msec() + 4000
		_show_pegs()
		if str(it.action) == "demolish": cancel()
	else:
		picks = []
		if str(it.action) == "demolish": _show_pegs()
		else: _show_pegs()
	queue_redraw()
	return r

func remove_last() -> bool:
	if mode != "pick": return false
	if not picks.is_empty(): picks.pop_back(); _show_pegs(); _hint(); queue_redraw(); return true
	return cancel()

# ---- the tap on the world -----------------------------------------------------------------------------------------------------------
## A tap on the world (local coordinates). True when the tray used it.
func on_tap(pos: Vector2) -> bool:
	if world == null: return false
	if mode == "pick":
		var i := _target_at(pos, _targets)
		if i >= 0: press_target(str(_targets[i].id)); return true
		cancel(); return true
	var hit := op_target_at(pos)
	if not hit.is_empty(): open_op(str(hit.kind), str(hit.id)); return true
	if op_kind != "": close_op(); return true
	return false

func on_long(pos: Vector2) -> bool:
	if mode == "pick": return remove_last()
	var hit := op_target_at(pos)
	if not hit.is_empty(): open_op(str(hit.kind), str(hit.id)); return true
	return false

func on_hover(pos: Vector2) -> void:
	if world == null or mode != "pick": return
	var i := _target_at(pos, _targets)
	if i != target_hi: set_target_hi(i)

## The placed element under the pointer that has something to operate (banks, then generators, lines, towns with loads).
func op_target_at(pos: Vector2) -> Dictionary:
	var best := {}; var bd := 1e9
	for k in OP_KINDS:
		for e in op_elements(str(k)):
			if op_rows(str(e.kind), str(e.id)).is_empty(): continue
			var d := pos.distance_to(world.world_to_screen(e.tile, 14.0)) if world != null else 1e9
			if d <= (30.0 if not (CbLayout.touch or CbLayout.kind == "phone") else maxf(24.0, maxf(48.0, CbLayout.tap()) * 0.5)) and d < bd - 6.0: bd = d; best = e
	return best

func op_elements(kind: String) -> Array:
	if kind == "bus":
		var out: Array = []
		for x in _wq().get("buses", []): if _loads_at(str(x.id)).size() > 0: out.append({"id": str(x.id), "tile": Vector2(float(x.x), float(x.y)), "label": str(x.id), "kind": "bus"})
		return out
	return elements(kind)

func _loads_at(bus: String) -> Array:
	return (b.g.get("loads", []) as Array).filter(func(l): return str(l.bus) == bus)

func _elem(kind: String, id: String) -> Dictionary:
	var key: String = {"shunt": "shunts", "unit": "units", "branch": "branches", "load": "loads", "storage": "storage"}.get(kind, "")
	if key == "": return {}
	for e in b.g.get(key, []): if str(e.id) == id: return e
	return {}

func _field(e: Dictionary, path: String):
	var cur = e
	for k in path.split("."):
		if not (cur is Dictionary) or not (cur as Dictionary).has(k): return null
		cur = cur[k]
	return cur

# ---- the operate tag ----------------------------------------------------------------------------------------------------------------
## The rows of the operate tag of an element: [{action, op (OPS entry), elem: {kind, id}}], from the palette's actions that this element supports.
func op_rows(kind: String, id: String) -> Array:
	var out: Array = []
	if pal.is_empty(): return out
	var targets: Array = []
	if kind == "bus": for l in _loads_at(id): targets.append({"kind": "load", "id": str(l.id)})
	else: targets.append({"kind": kind, "id": id})
	for a in pal.get("actions", []):
		var act := str(a.action)
		if not OPS.has(act): continue
		var op: Dictionary = OPS[act]
		for t in targets:
			var e := _elem(str(t.kind), str(t.id))
			if e.is_empty() or (str(op.elem) != "*" and str(op.elem) != str(t.kind)): continue
			if op.has("needs") and e.get(str(op.needs)) == null: continue
			if op.get("thermal", false) and str(e.get("kind", "")) in ["pv", "wind"]: continue
			out.append({"action": act, "op": op, "elem": t})
	return out

func open_op(kind: String, id: String) -> bool:
	if op_rows(kind, id).is_empty(): return false
	_cancel_quiet(); mode_changed.emit("")
	if tags != null: tags.close()
	_ensure_over()
	op_kind = kind; op_id = id; _op_cand = -1
	_build_op(); op_panel.visible = true; op_panel.reset_size(); _place_op()
	_over.queue_redraw()
	return true

func close_op() -> void:
	if op_panel == null or op_kind == "": return
	op_kind = ""; op_id = ""; op_panel.visible = false; _over.queue_redraw()

func op_open() -> bool: return op_kind != ""

func _refresh_op() -> void:
	if op_kind == "": return
	if op_rows(op_kind, op_id).is_empty(): close_op(); return
	_build_op(); op_panel.reset_size(); _place_op()

func _ensure_over() -> void:
	if _over != null: return
	_over = _Over.new(); _over.tray = self
	op_panel = PanelContainer.new(); op_panel.visible = false; op_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	op_panel.add_theme_stylebox_override("panel", GridTheme.paper_sb(4, 14.0))
	_op_vb = VBoxContainer.new(); _op_vb.add_theme_constant_override("separation", 5); _op_vb.mouse_filter = Control.MOUSE_FILTER_IGNORE; op_panel.add_child(_op_vb)
	_over.add_child(op_panel)
	var par := get_parent()
	if par != null: par.add_child(_over)
	else: add_child(_over)

func _tbtn(text: String, cb: Callable, w := 0.0) -> Button:
	var bt := Button.new(); bt.text = text; bt.focus_mode = CbKit.focus_mode(); bt.mouse_filter = Control.MOUSE_FILTER_STOP
	var mh := maxf(34.0, hit_min()); bt.custom_minimum_size = Vector2(maxf(w, mh), mh)
	bt.add_theme_font_size_override("font_size", GridTheme.fs(16)); bt.add_theme_color_override("font_color", GridTheme.PAPER_INK); bt.add_theme_color_override("font_hover_color", GridTheme.PAPER_INK)
	bt.add_theme_color_override("font_pressed_color", GridTheme.PAPER_INK); bt.add_theme_color_override("font_disabled_color", Color(GridTheme.PAPER_INK, 0.35))
	for st in ["normal", "hover", "pressed", "disabled"]:
		var s := StyleBoxFlat.new(); s.set_corner_radius_all(4); s.set_border_width_all(1); s.border_color = Color(GridTheme.PAPER_INK, 0.45); s.content_margin_left = 8; s.content_margin_right = 8
		s.bg_color = Color(GridTheme.PAPER_INK, 0.10 if st == "normal" else (0.22 if st == "hover" else (0.32 if st == "pressed" else 0.04)))
		if st == "hover": s.border_color = GridTheme.SODIUM_DIM
		bt.add_theme_stylebox_override(st, s)
	bt.pressed.connect(cb)
	return bt

func _tlabel(text: String, size: int, col: Color, kind := "sans") -> Label: return GridTheme.label(text, size, col, kind)

func _row_h() -> HBoxContainer:
	var h := HBoxContainer.new(); h.add_theme_constant_override("separation", 6); h.mouse_filter = Control.MOUSE_FILTER_IGNORE; return h

func _stepper(h: HBoxContainer, val_text: String, on_minus: Callable, on_plus: Callable, name := "") -> Label:
	var m := _tbtn("−", on_minus); m.name = "m_" + name; h.add_child(m)
	var l := _tlabel(val_text, 17, GridTheme.PAPER_INK, "mono"); l.custom_minimum_size.x = 64; l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; h.add_child(l)
	var p := _tbtn("+", on_plus); p.name = "p_" + name; h.add_child(p)
	return l

func _op_title() -> String:
	var key := "GT_OPT_" + op_kind
	if op_kind == "branch" and _elem("branch", op_id).get("tap") != null: key = "GT_OPT_xfmr"
	return tx(key) % op_id

func _build_op() -> void:
	for c in _op_vb.get_children(): _op_vb.remove_child(c); c.queue_free()
	var head := HBoxContainer.new(); head.mouse_filter = Control.MOUSE_FILTER_IGNORE; head.add_theme_constant_override("separation", 14)
	var ti := _tlabel(_op_title(), 22, GridTheme.PAPER_INK, "title"); ti.size_flags_horizontal = Control.SIZE_EXPAND_FILL; head.add_child(ti)
	var cl := Button.new(); cl.text = "×"; cl.flat = true; cl.focus_mode = Control.FOCUS_NONE; cl.tooltip_text = tx("TAG_CLOSE"); cl.custom_minimum_size = Vector2(30, 30); cl.name = "close"
	cl.add_theme_font_size_override("font_size", GridTheme.fs(22)); cl.add_theme_color_override("font_color", GridTheme.PAPER_INK); cl.add_theme_color_override("font_hover_color", GridTheme.BAD)
	for st in ["normal", "hover", "pressed"]: cl.add_theme_stylebox_override(st, StyleBoxEmpty.new())
	cl.pressed.connect(func(): close_op()); head.add_child(cl); _op_vb.add_child(head)
	for r in op_rows(op_kind, op_id): _op_row(r)
	if CbKit.pad_mode:
		for c in _op_vb.find_children("*", "Button", true, false): if (c as Button).name != "close": (c as Button).call_deferred("grab_focus"); break

func _op_row(r: Dictionary) -> void:
	var act: String = r.action; var op: Dictionary = r.op; var el: Dictionary = r.elem; var e := _elem(str(el.kind), str(el.id)); var eid := str(el.id)
	var h := _row_h(); h.name = "row_" + act
	var lb := _tlabel(tx("GT_OPL_" + act), 15, Color(GridTheme.PAPER_INK, 0.8)); lb.custom_minimum_size.x = 96; h.add_child(lb)
	match str(op.row):
		"toggle":
			var on: bool = bool(e.get(str(op.field), false))
			h.add_child(_tlabel(tx("GT_OP_CLOSED") if on else tx("GT_OP_OPEN"), 16, GridTheme.PAPER_INK, "mono"))
			var bt := _tbtn(tx("GT_OP_OPEN_IT") if on else tx("GT_OP_CLOSE_IT"), func(): op_do(act, [eid, not on]), 90); bt.name = "go_" + act; h.add_child(bt)
		"step":
			var cur: int = int(_field(e, str(op.field)))
			var lo: int = int(op.get("min", _field(e, str(op.get("min_field", ""))) if op.has("min_field") else 0)); var hi: int = int(_field(e, str(op.max_field)))
			_stepper(h, "%d / %d" % [cur, hi] if str(op.field) == "on" else "%+d" % cur, func(): op_do(act, [eid, maxi(lo, cur - 1)]), func(): op_do(act, [eid, mini(hi, cur + 1)]), act)
		"num":
			var k := str(op.knob); var cur2 = _field(e, str(op.field))
			if cur2 != null and not _op_seen.has(act + eid): _op_seen[act + eid] = true; knobs[k] = clampf(float(cur2), float(KNOBS[k].min), float(KNOBS[k].max))
			var vl := _stepper(h, knob_text(k), func(): step_knob(k, -1); _build_op(), func(): step_knob(k, 1); _build_op(), act)
			var gb := _tbtn(tx("GT_OP_SET"), func(): op_do(act, [eid, int(knobs[k]) if KNOBS[k].get("int", false) else float(knobs[k])])); gb.name = "go_" + act; h.add_child(gb)
			if cur2 != null: h.add_child(_tlabel(tx("GT_OP_NOW") % knob_text(k, cur2), 13, Color(GridTheme.PAPER_INK, 0.65), "mono"))
			vl.name = "val_" + act
		"pair":
			var a1 := _tbtn(tx("GT_OP_START"), func(): op_do(act, [eid, true]), 70); a1.name = "on_" + act; h.add_child(a1)
			var a2 := _tbtn(tx("GT_OP_STOP"), func(): op_do(act, [eid, false]), 70); a2.name = "off_" + act; h.add_child(a2)
		"once":
			var bt2 := _tbtn(tx("GT_OP_REMOVE"), func(): op_do(act, [eid]), 90); bt2.name = "go_" + act; h.add_child(bt2)
		"multi":
			lb.custom_minimum_size.x = 0
			_op_vb.add_child(h); h = null
			var ks: Array = op.knobs
			for k in ks:
				var h2 := _row_h(); var l2 := _tlabel(tx("GT_K_" + str(k)), 14, Color(GridTheme.PAPER_INK, 0.8)); l2.custom_minimum_size.x = 150; h2.add_child(l2)
				_stepper(h2, knob_text(str(k)), func(): step_knob(str(k), -1); _build_op(), func(): step_knob(str(k), 1); _build_op(), str(k)); _op_vb.add_child(h2)
			var h3 := _row_h(); var sb := _tbtn(tx("GT_OP_SET"), func(): op_do(act, [eid] + ks.map(func(k): return int(knobs[k]) if KNOBS[k].get("int", false) else float(knobs[k])))); sb.name = "go_" + act; h3.add_child(sb)
			var cur3 = e.get("auto")
			if cur3 != null: h3.add_child(_tlabel(tx("GT_OP_AUTO_ON"), 13, Color(GridTheme.PAPER_INK, 0.65), "mono"))
			_op_vb.add_child(h3)
	if h != null: _op_vb.add_child(h)

var _op_seen := {}

## An operate action from the tag. Returns the engine result (refusals reach the radio like the tray's).
func op_do(action: String, args: Array) -> Dictionary:
	var live: bool = bool((OPS.get(action, {}) as Dictionary).get("live", false))
	if is_locked() and not live: refuse_locked(); return {"ok": false}
	var r := _act(action, args)
	if r.get("ok", false) and action == "demolish": close_op()
	return r

func _place_op() -> void:
	if op_panel == null or not op_panel.visible or world == null or not is_inside_tree() or not world.is_inside_tree(): return
	var tile := Vector2.ZERO; var found := false
	for k in OP_KINDS:
		for e in op_elements(str(k)): if str(e.kind) == op_kind and str(e.id) == op_id: tile = e.tile; found = true
	if not found: return
	var a := world.get_global_rect().position + world.world_to_screen(tile, 22.0) - _over.global_position
	_op_anchor = a
	var sz := op_panel.size; var vp := get_viewport_rect().size
	var avoid: Array = []
	if slot.is_valid(): avoid.append((slot.call() as Rect2).grow(6.0))
	if instruments != null and instruments.visible: avoid.append(Rect2(instruments.global_position - _over.global_position, instruments.size).grow(10.0))
	var cands: Array = []
	for dy in [64.0, 130.0]:
		for dx in [46.0, -46.0 - sz.x, -sz.x * 0.5]: cands.append(a + Vector2(dx, -sz.y - dy)); cands.append(a + Vector2(dx, dy))
	var best := Vector2.ZERO; var bs := INF; var costs: Array = []; var qs: Array = []
	for c in cands:
		var q := Vector2(clampf(c.x, 10.0, maxf(10.0, vp.x - sz.x - 10.0)), clampf(c.y, 10.0, maxf(10.0, vp.y - sz.y - 10.0)))
		var rr := Rect2(q, sz); var cost := q.distance_to(c) * 40.0 + rr.get_center().distance_to(a) * 12.0
		for r in avoid:
			var ov := rr.intersection(r as Rect2)
			cost += ov.size.x * ov.size.y if ov.has_area() else 0.0
		costs.append(cost); qs.append(q)
		if cost < bs - 1.0: bs = cost; best = q
	if _op_cand >= 0 and _op_cand < costs.size() and costs[_op_cand] <= bs + 600.0: best = qs[_op_cand]
	else: _op_cand = costs.find(bs) if costs.has(bs) else 0
	op_panel.position = best; _over.queue_redraw()

## Pad Y: the operate tag of the next element that has one (wraps; the last one closes it).
func pad_cycle() -> void:
	var all: Array = []
	for k in OP_KINDS: for e in op_elements(str(k)): if not op_rows(str(e.kind), str(e.id)).is_empty(): all.append(e)
	if all.is_empty(): return
	var cur := -1
	for i in all.size(): if str(all[i].kind) == op_kind and str(all[i].id) == op_id: cur = i
	if op_kind != "" and cur + 1 >= all.size(): close_op(); return
	open_op(str(all[cur + 1].kind), str(all[cur + 1].id))

# ---- input ----------------------------------------------------------------------------------------------------------------------------
func _gui_input(e: InputEvent) -> void:
	if e is InputEventMouseMotion:
		var mm := e as InputEventMouseMotion
		if Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT) and _max_scroll > 0.0:
			if absf(mm.position.x - _press_x) > 10.0: _dragged = true
			if _dragged: _scroll = clampf(_scroll - mm.relative.x, 0.0, _max_scroll); _layout_items(); queue_redraw(); return
		var i := _item_at(mm.position)
		if i != hover:
			hover = i
			if i >= 0: engaged = false
			_cell_hover()
	elif e is InputEventMouseButton:
		var mb := e as InputEventMouseButton
		if mb.button_index in [MOUSE_BUTTON_WHEEL_DOWN, MOUSE_BUTTON_WHEEL_UP] and mb.pressed:
			if _max_scroll > 0.0: _scroll = clampf(_scroll + (40.0 if mb.button_index == MOUSE_BUTTON_WHEEL_DOWN else -40.0), 0.0, _max_scroll); _layout_items(); queue_redraw()
		elif mb.button_index == MOUSE_BUTTON_LEFT:
			if mb.pressed: _press_idx = _item_at(mb.position); _press_x = mb.position.x; _dragged = false
			else:
				var i := _item_at(mb.position)
				if i >= 0 and i == _press_idx and not _dragged:
					hover = i
					var left := mb.position.x < (items[i].rect as Rect2).get_center().x
					activate(i, str(items[i].kind) == "knob" and left); accept_event()
				elif i < 0 and not _dragged and _max_scroll > 0.0:
					if mb.position.x < PAD + 8.0: page(-1)
					elif mb.position.x > _avail_right() - 6.0 and mb.position.x < _avail_right() + PAD + 10.0: page(1)
				_press_idx = -1
		elif mb.button_index == MOUSE_BUTTON_RIGHT and mb.pressed:
			var i2 := _item_at(mb.position)
			if i2 >= 0 and str(items[i2].kind) == "knob": step_knob(str(items[i2].id), -1)
		accept_event()

## Keys: 1..9 pick the n-th cell (shift + digit steps a knob down), Tab / Enter walk and pick the pegs, Backspace takes the last pick back. True when used.
func key(e: InputEventKey) -> bool:
	if not visible or not e.pressed: return false
	if e.keycode >= KEY_1 and e.keycode <= KEY_9:
		var n := e.keycode - KEY_1
		if n < items.size(): focus = n; hover = -1; _ensure_visible(n); activate(n, e.shift_pressed)
		return n < items.size()
	match e.keycode:
		KEY_BACKSPACE: return remove_last()
		KEY_TAB:
			if mode == "pick": walk_target(-1 if e.shift_pressed else 1); return true
		KEY_ENTER, KEY_KP_ENTER:
			if mode == "pick" and target_hi >= 0: press_target(str(_targets[target_hi].id)); return true
	return false

## Pad: LB / RB cycle the cells, A picks / activates, D-pad left / right step a focused knob or walk the pegs, Y the next operate tag, B undo / cancel.
func pad_button(idx: int) -> bool:
	if not visible: return false
	match idx:
		JOY_BUTTON_LEFT_SHOULDER, JOY_BUTTON_RIGHT_SHOULDER:
			if items.is_empty(): return false
			var d := -1 if idx == JOY_BUTTON_LEFT_SHOULDER else 1
			engaged = true; hover = -1
			focus = (0 if d > 0 else items.size() - 1) if focus < 0 else posmod(focus + d, items.size())
			_ensure_visible(focus); _cell_hover(); queue_redraw(); return true
		JOY_BUTTON_A:
			if mode == "pick":
				if target_hi >= 0: press_target(str(_targets[target_hi].id)); return true
				walk_target(1); return true
			if engaged and focus >= 0: activate(focus); return true
		JOY_BUTTON_B:
			if mode == "pick": return remove_last()
			return cancel_key()
		JOY_BUTTON_DPAD_LEFT, JOY_BUTTON_DPAD_RIGHT, JOY_BUTTON_DPAD_UP, JOY_BUTTON_DPAD_DOWN:
			var d2 := -1 if idx == JOY_BUTTON_DPAD_LEFT or idx == JOY_BUTTON_DPAD_UP else 1
			if mode == "pick": walk_target(d2); return true
			if engaged and focus >= 0 and str(items[focus].kind) == "knob" and (idx == JOY_BUTTON_DPAD_LEFT or idx == JOY_BUTTON_DPAD_RIGHT): step_knob(str(items[focus].id), d2); return true
			return false
		JOY_BUTTON_Y:
			pad_cycle(); return true
	return false

func _process(dt: float) -> void:
	if not visible: return
	_t += dt
	if op_kind != "": _place_op()
	if _chip_until > 0 and Time.get_ticks_msec() > _chip_until and mode == "pick": _chip_until = 0; _hint(); queue_redraw()
	if mode == "pick" and not CbSettings.reduced_motion: queue_redraw()

func _cell_hover() -> void:
	if mode == "pick": return
	chip_cell = -1; chip_text = ""
	if hover >= 0 and hover < items.size():
		chip_text = tip(items[hover]); chip_dot = Color.TRANSPARENT; chip_cell = hover; chip_at = Vector2((items[hover].rect as Rect2).get_center().x, -8.0)
	queue_redraw()

# ---- captions -------------------------------------------------------------------------------------------------------------------------
static func _tail_number(id: String) -> String:
	var t := id.get_slice("-", id.count("-"))
	return t if t.is_valid_float() else ""

func tx_part(it: Dictionary) -> String:
	var part := str(it.part); var key := "GT_PART_" + part
	if tx(key) != key: return tx(key)
	if str(it.icon) == "line" or str(it.action) == "stringLine": return part.get_slice("-", part.count("-")).capitalize()
	if ICON_NAMES.has(str(it.icon)): return tx(str(ICON_NAMES[str(it.icon)]))
	return part.replace("-", " ").capitalize()

func _unit_sub(it: Dictionary) -> String:
	var part := str(it.part); var n := _tail_number(part)
	if str(it.icon) == "line": return tx("GT_UNIT_kv") % part.get_slice("-", 0).trim_prefix("l")
	if str(it.icon) in UNITS and n != "": return tx(str(UNITS[str(it.icon)])) % n
	return part

## Cell captions: [name, sub].
func caption(it: Dictionary) -> Array:
	match str(it.kind):
		"place": return [tx_part(it), _unit_sub(it)]
		"knob": return [tx("GT_K_" + str(it.id)), tx("GT_KS_" + str(it.id))]
		"op":
			var on: bool = bool((b.g.get("dispatch", {}) as Dictionary).get("auto", false)) if str(it.action) == "setAutoDispatch" else (mode == "pick" and armed >= 0 and items[armed] == it)
			return [tx(str(ICON_NAMES.get(str(it.icon), "GT_ICON_part"))), tx("GT_SUB_ON") if on else tx("GT_SUB_" + str(it.action))]
	return ["", ""]

func tip(it: Dictionary) -> String:
	if str(it.kind) == "knob": return tx("GT_TIP_" + str(it.id))
	var k := "GT_TIP_" + str(it.action)
	var s := tx(k) if tx(k) != k else tx("GT_TIP_part")
	return s % tx_part(it) if s.contains("%s") else s

func _selected(it: Dictionary) -> bool:
	match str(it.kind):
		"place", "op":
			if str(it.action) == "setAutoDispatch": return bool((b.g.get("dispatch", {}) as Dictionary).get("auto", false))
			return mode == "pick" and armed >= 0 and items[armed] == it
	return false

# ---- drawing --------------------------------------------------------------------------------------------------------------------------
func _text(font: Font, fsz: int, at: Vector2, s: String, col: Color, centre_w := -1.0) -> void:
	var tw := font.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz).x
	while centre_w > 0.0 and tw > centre_w and s.length() > 2:
		s = s.left(s.length() - 2) + "…"; tw = font.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz).x
	var x := at.x if centre_w < 0.0 else at.x + (centre_w - tw) * 0.5
	draw_string(font, Vector2(x, at.y), s, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz, col)

func _cell_sb(fill: Color, lit: bool) -> StyleBoxFlat:
	var s := StyleBoxFlat.new(); s.bg_color = fill; s.set_corner_radius_all(7)
	s.border_color = GridTheme.SODIUM if lit else Color(GridTheme.SODIUM_DIM, 0.28); s.set_border_width_all(2 if lit else 1)
	return s

func _draw() -> void:
	if not visible: return
	draw_style_box(GridTheme.ink_sb(0.94, 10, 0.0), Rect2(Vector2.ZERO, size))
	draw_line(Vector2(10, 2), Vector2(size.x - 10, 2), Color(GridTheme.SODIUM_DIM, 0.35), 1.0)
	var semi := GridTheme.font("semi"); var mono := GridTheme.font("mono")
	for i in items.size():
		if not _visible_item(i): continue
		var it: Dictionary = items[i]; var r: Rect2 = it.rect
		var sel := _selected(it)
		var fc := (engaged or (CbKit.pad_mode and mode == "")) and i == focus
		var hv := i == hover and not (engaged and focus >= 0 and focus != i)
		var fill := Color(GridTheme.NIGHT, 0.55)
		if hv: fill = Color(GridTheme.INK).lightened(0.14)
		if sel: fill = Color(GridTheme.SODIUM, 0.16 + 0.06 * sin(_t * 4.0))
		var other_focus := engaged and focus >= 0 and focus != i
		draw_style_box(_cell_sb(fill, (sel and not other_focus) or hv), r)
		if fc: draw_style_box(GridTheme.focus_sb(), r)
		var c := r.position + Vector2(r.size.x * 0.5, 30.0)
		if str(it.kind) == "knob": _icon_knob(c, r, str(it.id))
		else: _draw_icon(str(it.icon), c, sel)
		var cap := caption(it); var tw := r.size.x - 4.0
		var use_n := 13
		while use_n > 8 and semi.get_string_size(str(cap[0]), HORIZONTAL_ALIGNMENT_LEFT, -1, GridTheme.fs(use_n)).x > tw: use_n -= 1
		_text(semi, GridTheme.fs(use_n), Vector2(r.position.x + 2.0, r.position.y + 62.0), str(cap[0]), GridTheme.TEXT if (hv or sel or fc) else Color(GridTheme.TEXT, 0.92), tw)
		var use_s := 11
		while use_s > 7 and mono.get_string_size(str(cap[1]), HORIZONTAL_ALIGNMENT_LEFT, -1, GridTheme.fs(use_s)).x > tw: use_s -= 1
		_text(mono, GridTheme.fs(use_s), Vector2(r.position.x + 2.0, r.position.y + 76.0), str(cap[1]), GridTheme.SODIUM if sel else GridTheme.DIM, tw)
	if _max_scroll > 0.0:
		if _scroll > 1.0: draw_string(semi, Vector2(2.0, H * 0.5 + 6.0), "‹", HORIZONTAL_ALIGNMENT_LEFT, -1, GridTheme.fs(22), GridTheme.SODIUM)
		if _scroll < _max_scroll - 1.0: draw_string(semi, Vector2(_avail_right() + 1.0, H * 0.5 + 6.0), "›", HORIZONTAL_ALIGNMENT_LEFT, -1, GridTheme.fs(22), GridTheme.SODIUM)
	_draw_price_tag()
	if chip_text != "" and not is_locked():
		if chip_cell < 0: chip_at = Vector2(size.x * 0.5, -10.0)
		_draw_chip(chip_at, chip_text, chip_dot)

func _draw_price_tag() -> void:
	var bud: Dictionary = b.g.get("budget", {}) if b != null else {}
	var spent := CbRegion.money(float(bud.get("spent", 0.0)), false, 0); var budget := CbRegion.money(float(bud.get("capexLimit", 0.0)), false, 0)
	var over: bool = float(bud.get("spent", 0.0)) > float(bud.get("capexLimit", 0.0))
	var txt := tx("TRAY_BUDGET") % [spent, budget]
	var mono := GridTheme.font("mono"); var semi := GridTheme.font("semi")
	var fsz := GridTheme.fs(15)
	var tw := mono.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz).x
	while tw > TAG_W - 30.0 and fsz > 10: fsz -= 1; tw = mono.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz).x
	var w := TAG_W; var h := 62.0
	var org := Vector2(size.x - PAD - w, 17.0) if _tag_inline else Vector2(size.x - PAD - w, -h - 6.0)
	draw_set_transform(org + Vector2(w, 0.0) * 0.5, deg_to_rad(-1.6), Vector2.ONE)
	draw_style_box(GridTheme.paper_sb(3, 0.0), Rect2(Vector2(-w * 0.5, 0.0), Vector2(w, h)))
	draw_circle(Vector2(-w * 0.5 + 13.0, 13.0), 4.0, GridTheme.INK)
	draw_circle(Vector2(-w * 0.5 + 13.0, 13.0), 4.0, Color(GridTheme.PAPER_INK, 0.6), false, 1.0)
	draw_arc(Vector2(-w * 0.5 + 13.0, 13.0), 8.0, PI * 0.9, PI * 2.4, 14, Color(GridTheme.SODIUM_DIM, 0.9), 1.6)
	draw_string(semi, Vector2(-w * 0.5 + 26.0, 20.0), tx("TRAY_BUDGET_CAP"), HORIZONTAL_ALIGNMENT_LEFT, -1, GridTheme.fs(11), Color(GridTheme.PAPER_INK, 0.7))
	draw_string(mono, Vector2(-tw * 0.5 + 4.0, 47.0), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz, GridTheme.BAD.darkened(0.15) if over else GridTheme.PAPER_INK)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

func _draw_chip(at: Vector2, s: String, dot: Color) -> void:
	var f := GridTheme.font("mono"); var fsz := GridTheme.fs(14)
	var vw := get_viewport_rect().size.x
	var maxw := minf(620.0, vw - 60.0)
	var one := f.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz)
	var tw := one.x; var lines := 1
	if one.x > maxw or s.contains("\n"):
		var ml := f.get_multiline_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, maxw, fsz); tw = minf(ml.x, maxw); lines = maxi(1, int(round(ml.y / f.get_height(fsz))))
	var dw := 18.0 if dot.a > 0.0 else 0.0
	var gx := clampf(global_position.x + at.x, tw * 0.5 + dw * 0.5 + 18.0, vw - tw * 0.5 - dw * 0.5 - 18.0)
	var x := gx - global_position.x
	var bh := f.get_height(fsz) * lines + 12.0
	var rect := Rect2(Vector2(x - (tw + dw) * 0.5 - 10.0, at.y - bh - 4.0), Vector2(tw + dw + 20.0, bh))
	draw_style_box(GridTheme.paper_sb(4, 0.0), rect)
	draw_colored_polygon(PackedVector2Array([Vector2(x - 6.0, rect.end.y - 1.0), Vector2(x + 6.0, rect.end.y - 1.0), Vector2(x, rect.end.y + 7.0)]), GridTheme.PAPER)
	var tx0 := rect.position.x + 10.0
	if dw > 0.0:
		draw_circle(Vector2(tx0 + 6.0, rect.position.y + 6.0 + f.get_height(fsz) * 0.5), 6.0, dot); draw_arc(Vector2(tx0 + 6.0, rect.position.y + 6.0 + f.get_height(fsz) * 0.5), 6.0, 0.0, TAU, 16, GridTheme.PAPER_INK, 1.3)
	tx0 += dw
	draw_multiline_string(f, Vector2(tx0, rect.position.y + 6.0 + f.get_ascent(fsz)), s, HORIZONTAL_ALIGNMENT_LEFT, tw + 2.0 if lines > 1 else -1.0, fsz, -1, GridTheme.PAPER_INK)

# ---- icons ----------------------------------------------------------------------------------------------------------------------------
func _draw_icon(icon: String, c: Vector2, on: bool) -> void:
	match icon:
		"capacitor": _icon_capacitor(c)
		"reactor": _icon_reactor(c)
		"transformer": _icon_xfmr(c)
		"battery": _icon_battery(c)
		"line": _icon_line(c)
		"breaker": _icon_breaker(c, on)
		"demolish": _icon_demolish(c)
		"dispatch": _icon_dispatch(c, on)
		"gas", "coal", "diesel", "hydro", "pv", "wind", "nuclear", "biomass", "synccon": _icon_gen(c, icon)
		_: _icon_part(c)

func _icon_knob(c: Vector2, r: Rect2, id: String) -> void:
	var mono := GridTheme.font("mono"); var s := knob_text(id); var fsz := GridTheme.fs(16)
	var tw := mono.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz).x
	while tw > r.size.x - 26.0 and fsz > 9: fsz -= 1; tw = mono.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz).x
	draw_string(mono, Vector2(c.x - tw * 0.5, c.y + 4.0), s, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz, GridTheme.SODIUM)
	var y := c.y + 16.0
	draw_colored_polygon(PackedVector2Array([Vector2(r.position.x + 9.0, y), Vector2(r.position.x + 17.0, y - 5.0), Vector2(r.position.x + 17.0, y + 5.0)]), Color(GridTheme.PAPER, 0.8))
	draw_colored_polygon(PackedVector2Array([Vector2(r.end.x - 9.0, y), Vector2(r.end.x - 17.0, y - 5.0), Vector2(r.end.x - 17.0, y + 5.0)]), Color(GridTheme.PAPER, 0.8))
	draw_line(Vector2(c.x - 14.0, y), Vector2(c.x + 14.0, y), Color(GridTheme.PAPER, 0.35), 1.5)
	for k in 5: draw_line(Vector2(c.x - 12.0 + k * 6.0, y - 3.0), Vector2(c.x - 12.0 + k * 6.0, y + 3.0), Color(GridTheme.PAPER, 0.5), 1.0)

func _icon_part(c: Vector2) -> void:
	draw_rect(Rect2(c.x - 14.0, c.y - 14.0, 28.0, 28.0), Color("#7F8A98")); draw_rect(Rect2(c.x - 14.0, c.y - 14.0, 28.0, 28.0), GridTheme.NIGHT, false, 1.5)
	draw_circle(c, 4.0, GridTheme.SODIUM)

func _icon_capacitor(c: Vector2) -> void:   # two plates on a wire, a bank of two
	for s in [-1.0, 1.0]:
		var x: float = c.x + s * 7.0
		draw_line(Vector2(x, c.y - 17.0), Vector2(x, c.y - 4.0), Color("#B9C0C9"), 2.0); draw_line(Vector2(x, c.y + 4.0), Vector2(x, c.y + 17.0), Color("#B9C0C9"), 2.0)
		draw_rect(Rect2(x - 9.0, c.y - 4.0, 18.0, 3.5), Color("#E8C547")); draw_rect(Rect2(x - 9.0, c.y + 1.0, 18.0, 3.5), Color("#E8C547"))
	draw_line(Vector2(c.x - 7.0, c.y - 17.0), Vector2(c.x + 7.0, c.y - 17.0), Color("#B9C0C9"), 2.0)
	draw_line(Vector2(c.x - 7.0, c.y + 17.0), Vector2(c.x + 7.0, c.y + 17.0), Color("#B9C0C9"), 2.0)

func _icon_reactor(c: Vector2) -> void:   # a coil
	draw_line(Vector2(c.x - 20.0, c.y), Vector2(c.x - 14.0, c.y), Color("#B9C0C9"), 2.0); draw_line(Vector2(c.x + 14.0, c.y), Vector2(c.x + 20.0, c.y), Color("#B9C0C9"), 2.0)
	for k in 3: draw_arc(Vector2(c.x - 9.0 + k * 9.0, c.y), 4.5, PI, TAU, 10, GridTheme.COPPER, 2.4)

func _icon_xfmr(c: Vector2) -> void:   # two coils on one core
	draw_rect(Rect2(c.x - 14.0, c.y - 15.0, 28.0, 30.0), Color("#5E6874"), false, 3.0)
	for s in [-1.0, 1.0]:
		for k in 3: draw_arc(Vector2(c.x + s * 14.0, c.y - 9.0 + k * 9.0), 4.5, -PI * 0.5 if s > 0 else PI * 0.5, PI * 0.5 if s > 0 else PI * 1.5, 10, GridTheme.COPPER, 2.4)

func _icon_battery(c: Vector2) -> void:
	var r := Rect2(c.x - 15.0, c.y - 10.0, 28.0, 22.0)
	draw_rect(r, Color("#3A4358")); draw_rect(r, Color("#B9C0C9"), false, 2.0); draw_rect(Rect2(r.end.x, c.y - 4.0, 4.0, 8.0), Color("#B9C0C9"))
	for k in 3: draw_rect(Rect2(r.position.x + 3.0 + k * 8.0, r.position.y + 3.0, 6.0, 16.0), GridTheme.GOOD if k < 2 else Color(GridTheme.GOOD, 0.35))

func _icon_line(c: Vector2) -> void:   # a lattice pylon with two spans of wire
	var g := c.y + 17.0
	draw_polyline(PackedVector2Array([Vector2(c.x - 7.0, g), Vector2(c.x, c.y - 14.0), Vector2(c.x + 7.0, g)]), Color("#9AA3AF"), 2.0)
	draw_line(Vector2(c.x - 4.0, c.y + 4.0), Vector2(c.x + 4.0, c.y + 4.0), Color("#9AA3AF"), 1.5)
	draw_line(Vector2(c.x - 12.0, c.y - 8.0), Vector2(c.x + 12.0, c.y - 8.0), Color("#9AA3AF"), 2.5)
	draw_polyline(PackedVector2Array([Vector2(c.x - 24.0, c.y - 2.0), Vector2(c.x - 12.0, c.y - 8.0)]), GridTheme.COPPER, 1.5); draw_polyline(PackedVector2Array([Vector2(c.x + 12.0, c.y - 8.0), Vector2(c.x + 24.0, c.y - 2.0)]), GridTheme.COPPER, 1.5)

func _icon_breaker(c: Vector2, closed: bool) -> void:
	draw_circle(c + Vector2(-13.0, 8.0), 3.0, Color("#B9C0C9")); draw_circle(c + Vector2(13.0, 8.0), 3.0, Color("#B9C0C9"))
	draw_line(c + Vector2(-13.0, 8.0), c + (Vector2(13.0, 8.0) if closed else Vector2(11.0, -12.0)), GridTheme.SODIUM if closed else Color("#9C9A93"), 3.0)
	draw_line(c + Vector2(-20.0, 8.0), c + Vector2(-13.0, 8.0), Color("#B9C0C9"), 2.0); draw_line(c + Vector2(13.0, 8.0), c + Vector2(20.0, 8.0), Color("#B9C0C9"), 2.0)

func _icon_demolish(c: Vector2) -> void:   # a crowbar across a crossed-out ring
	draw_arc(c, 15.0, 0.0, TAU, 24, Color(GridTheme.BAD, 0.85), 2.5)
	draw_line(c + Vector2(-9.0, -9.0), c + Vector2(9.0, 9.0), Color(GridTheme.BAD, 0.85), 3.0); draw_line(c + Vector2(9.0, -9.0), c + Vector2(-9.0, 9.0), Color(GridTheme.BAD, 0.85), 3.0)

func _icon_dispatch(c: Vector2, on: bool) -> void:   # a fader on a rail
	var col := GridTheme.SODIUM if on else Color("#9C9A93")
	draw_line(c + Vector2(-14.0, 12.0), c + Vector2(14.0, 12.0), Color("#5E6874"), 3.0)
	for k in 3:
		var x := c.x - 10.0 + k * 10.0
		draw_line(Vector2(x, c.y - 14.0), Vector2(x, c.y + 12.0), Color("#5E6874"), 2.0)
		var y := c.y - 6.0 + 7.0 * float((k * 2) % 3)
		draw_rect(Rect2(x - 4.5, y - 3.0, 9.0, 6.0), col)

## A generator: a ring with the kind's mark inside (flame, drop, panel, rotor, atom, stack, leaf, flywheel).
func _icon_gen(c: Vector2, kind: String) -> void:
	var cc := c + Vector2(0.0, 2.0)
	draw_circle(cc, 17.0, Color("#2C3550")); draw_arc(cc, 17.0, 0.0, TAU, 28, Color("#B9C0C9"), 2.0)
	match kind:
		"gas":
			draw_colored_polygon(PackedVector2Array([cc + Vector2(0, -11), cc + Vector2(7, 0), cc + Vector2(3, 9), cc + Vector2(-3, 9), cc + Vector2(-7, 0)]), Color("#FF9A3C")); draw_circle(cc + Vector2(0, 3), 3.5, Color("#FFE08A"))
		"coal":
			draw_rect(Rect2(cc.x - 4.0, cc.y - 4.0, 8.0, 14.0), Color("#8A8F99")); draw_rect(Rect2(cc.x - 4.0, cc.y - 4.0, 8.0, 3.0), Color("#3A3F4A")); draw_circle(cc + Vector2(5, -9), 3.0, Color("#6A6F7A", 0.8)); draw_circle(cc + Vector2(9, -13), 2.2, Color("#6A6F7A", 0.5))
		"diesel":
			draw_rect(Rect2(cc.x - 9.0, cc.y - 4.0, 18.0, 12.0), Color("#C77B7B")); draw_rect(Rect2(cc.x - 4.0, cc.y - 9.0, 8.0, 5.0), Color("#8A8F99"))
		"hydro":
			for k in 2: draw_polyline(PackedVector2Array([cc + Vector2(-10, -2 + 6 * k), cc + Vector2(-5, -6 + 6 * k), cc + Vector2(0, -2 + 6 * k), cc + Vector2(5, -6 + 6 * k), cc + Vector2(10, -2 + 6 * k)]), Color("#5FA8D3"), 2.2)
		"pv":
			draw_colored_polygon(PackedVector2Array([cc + Vector2(-9, 6), cc + Vector2(-5, -7), cc + Vector2(9, -7), cc + Vector2(5, 6)]), Color("#2F5E9E")); draw_line(cc + Vector2(-1, -7), cc + Vector2(-3, 6), Color("#9CC3F0"), 1.0); draw_line(cc + Vector2(-7, 0), cc + Vector2(7, 0), Color("#9CC3F0"), 1.0)
		"wind":
			draw_line(cc, cc + Vector2(0, 11), Color("#D2D5DA"), 2.0)
			for k in 3: var a := -PI * 0.5 + TAU * k / 3.0; draw_line(cc, cc + Vector2(cos(a), sin(a)) * 11.0, Color("#F1F4F8"), 2.0)
		"nuclear":
			draw_circle(cc, 2.5, GridTheme.SODIUM)
			for k in 3: draw_arc(cc, 9.0, TAU * k / 3.0 + 0.3, TAU * k / 3.0 + 1.5, 8, GridTheme.SODIUM, 2.0)
		"biomass":
			draw_colored_polygon(PackedVector2Array([cc + Vector2(-8, 6), cc + Vector2(-7, -4), cc + Vector2(3, -9), cc + Vector2(8, 4)]), GridTheme.GOOD); draw_line(cc + Vector2(-8, 8), cc + Vector2(4, -4), Color("#1C3A2A"), 1.5)
		_:   # synccon: a flywheel
			draw_arc(cc, 8.0, 0.0, TAU, 20, Color("#E8C547"), 3.0); draw_circle(cc, 2.5, Color("#E8C547"))

# ---- the paper layer of the operate tag ---------------------------------------------------------------------------------------------
class _Over extends Control:
	var tray
	func _init() -> void: name = "GridTrayOver"; mouse_filter = Control.MOUSE_FILTER_IGNORE; set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	func _draw() -> void:
		var p: PanelContainer = tray.op_panel
		if p == null or not p.visible: return
		var a: Vector2 = tray._op_anchor
		var eyelet := p.position + Vector2(18.0, 0.0)
		if p.position.y < a.y: eyelet = p.position + Vector2(18.0, p.size.y)
		var mid := (eyelet + a) * 0.5 + Vector2(0.0, 14.0)
		var pts := PackedVector2Array()
		for i in 17:
			var u := float(i) / 16.0
			pts.append(eyelet.lerp(mid, u).lerp(mid.lerp(a, u), u))
		draw_polyline(pts, Color(0, 0, 0, 0.35), 3.0, true)
		draw_polyline(pts, Color("#D8C9A0"), 1.8, true)
		draw_circle(a, 5.0, Color(GridTheme.NIGHT, 0.9)); draw_circle(a, 3.0, GridTheme.SODIUM)
		draw_circle(eyelet, 3.5, GridTheme.INK)
