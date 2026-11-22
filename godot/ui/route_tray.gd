class_name RouteTray
extends Control
## The route tray (chapter 2, levels whose world has a terrain; replaces the kit tray): a low ink shelf, left to right: Survey line, the support
## families (pole silhouettes), the river-crossing pair, the span knob, the conductor reels, the distribution transformers and the paper budget tag.
## Selected family / crossing / span / conductor are "the kit": they apply to the next survey AND re-string the lines already laid (demolish + buildRoute
## with the same waypoints). Survey: pick a yard, click the ground to bend the line (live ghost from the engine query `routePreview`, <= 10 Hz, with a
## chip "3.8 km · 46 poles · worst clearance +0.7 m · $96,400"), click a yard to finish (`buildRoute`). Transformers: pick a kVA, click a yard of a pair
## (`placeTransformer`). Every number is the engine's; every refusal is a SYS line on the radio. Display and input only: no physics here.
## World contract (builder C1, guarded with has_method): set_route_ghost(plan, pending_waypoints_m), map_metres_at(screen_p) -> Vector2 metres.
## Input: mouse / touch (tap = click, long-press = remove the last waypoint), pad (LB/RB cycle, A pick / drop, D-pad or left stick moves the survey cursor in
## 50 m steps, B removes the last waypoint or cancels), keyboard (1-9 cells, S survey, Enter finish at the nearest yard, Backspace, Esc).

signal mode_changed(mode: String)
const H := 96.0
const PAD := 12.0
const GAP := 6.0
const GGAP := 12.0                  ## extra space between the groups of cells
const WIDE := 900.0                 ## tray width from which the price tag sits inline at the right end
const TAG_W := 176.0
const MIN_CELL := 66.0                ## wide enough for "Concrete" at a readable size; a narrow screen scrolls the tray instead of crushing names
const CELL_W := 70.0
const SPANS := [60, 70, 90, 100, 120]
const FAMS := ["wood-9", "pcc-11", "tubular-13"]
const CROSS := ["none", "crossing-h", "tubular-13"]
## Display data of the parts. The engine does not expose its part catalogue to the front-end (only the allowed conductor and transformer ids), so the
## pole lengths, mechanical span limits (src/data/supports.ts) and conductor areas (src/data/conductors.ts) are written here as labels; the planner
## still checks every limit itself and its refusal is what the player reads.
const MAX_SPAN := {"wood-9": 70, "pcc-11": 100, "tubular-13": 130}
const COND_MM2 := {"weasel": 30, "rabbit": 50, "dog": 100}
const STEP_M := 50.0
## Insulator kit (L29): unit creepage of the whole string in mm (src/data/insulators.ts), display only; the planner computes the real numbers.
const INS_MM := {"pin": 320, "disc2": 590, "fog1": 430}
const INS_IDS := ["pin", "disc2", "fog1"]
## Sea cable and island battery (L30), display only (src/data/submarine.ts): capacitance in uF/km and ampacity in A. Prices are the engine's: `actionCost` runs the build on a copy of the state.
const SEA_IDS := ["sub-11-70", "sub-11-120", "sub-11-185"]
const SEA_UF := {"sub-11-70": 0.25, "sub-11-120": 0.30, "sub-11-185": 0.35}
const SEA_AMP := {"sub-11-70": 215, "sub-11-120": 290, "sub-11-185": 365}
const ISL_IDS := ["isl-25kw-50kwh", "isl-50kw-100kwh", "isl-50kw-125kwh", "isl-50kw-150kwh", "isl-100kw-200kwh"]
const ISL_MAX_KWH := 200.0
const ISL_MAX_KW := 100.0

var b                               ## CbBridge
var world: WorldView
var radio: RadioLog
var instruments: Instruments
var sfx := Callable()               ## (cue: String), optional
var tags                            ## TagView, optional
var slot := Callable()              ## () -> Rect2 the tray stands in (GridChrome.tray_rect)
var locked := Callable()            ## () -> bool: the night runs or the level is over, so nothing laid may change

var items: Array = []               ## {kind: survey|family|crossing|span|conductor|xfmr, id, rect (local)}
var mode := ""                      ## "" | "survey" | "xfmr" | "sea" | "isl"
var armed_xf := ""                  ## transformer catalogue id waiting for a yard pair
var armed_sea := ""                 ## L30: sea cable catalogue id waiting for its yards
var armed_isl := ""                 ## L30: island battery catalogue id waiting for the island yard
var sea_from := ""                  ## L30: the mainland yard picked first when the crossing is ambiguous
var _cost_cache := {}               ## actionCost answers of this engine state (cleared by refresh())
var kit := {"family": "wood-9", "crossing": "none", "span": 60, "conductor": "weasel", "kv": 0.42}   ## kv: the line voltage the survey connects (each site has a yard per voltage)
var yards: Array = []               ## {id, kv, tile: Vector2, pos: Vector2 (m), label}
var pairs: Array = []               ## {hv, lv}: the distribution transformer pairs
var tile_m := 50.0
var from_id := ""                   ## survey: the start yard
var waypoints: Array = []           ## survey: the ground clicks (metres)
var hover_m := Vector2(NAN, NAN)    ## survey: where the pointer / cursor is on the ground (metres)
var hover_yard := ""                ## survey: a yard under the pointer
var cursor_m := Vector2(NAN, NAN)   ## pad / keyboard survey cursor (metres)
var cursor_on := false
var target_hi := -1                 ## highlighted yard peg
var hover := -1                     ## tray cell under the pointer
var focus := -1                     ## pad / keyboard focus
var engaged := false
var level := ""
var preview := {}                   ## last routePreview result
var _district: Array = []           ## branch ids of lines the job started with (L29: the district's L05 line); the kit never re-strings them
var _note_of := {}                  ## {text, note}: the amber salt line of the chip that shows `text`
var chip_text := ""
var chip_dot := Color.TRANSPARENT   ## green / amber / red dot of the chip; transparent = none
var chip_at := Vector2.ZERO         ## tray-local anchor of the chip (bottom centre)
var chip_cell := -1                 ## the chip belongs to a tray cell (hover re-string what-if), else to the cursor
var ghost_calls := 0                ## how many times the world ghost was set (tests)
var last_ghost := {}
var last_refusal_key := ""
var _wq := {}                       ## world query at the last refresh (names)
var _scroll := 0.0
var _max_scroll := 0.0
var _press_idx := -1
var _press_x := 0.0
var _dragged := false
var _tag_inline := true
var _t := 0.0
var _dirty := false
var _last_prev_ms := 0
var _hover_screen := Vector2.ZERO   ## world-local pointer position
var _stick_t := 0.0
var _dpad_t := 0.0

func _init() -> void:
	name = "RouteTray"; mouse_filter = Control.MOUSE_FILTER_STOP; focus_mode = Control.FOCUS_NONE; visible = false
	mouse_exited.connect(func(): hover = -1; _cell_hover())
	TrayStrings.load_strings(); GridUi.load_strings()

func tx(key: String) -> String: return TranslationServer.translate(key)
func active() -> bool: return visible
func is_locked() -> bool: return locked.is_valid() and bool(locked.call())

# ---- state from the engine ------------------------------------------------------------------------------------------------------------
func refresh() -> void:
	if b == null: return
	var li = b.q("levelInfo"); var w = b.q("world")
	var on: bool = li is Dictionary and li.get("active", false) and w is Dictionary and w.get("terrain") != null
	if not on:
		if visible: _clear_all()
		visible = false; level = ""; return
	_wq = w; tile_m = float(w.terrain.tileM)
	if str(li.id) != level:
		_clear_all(); level = str(li.id); _scroll = 0.0; focus = -1; engaged = false
		kit = {"family": "wood-9", "crossing": "none", "span": 60, "conductor": "weasel", "kv": 0.42}
		_read_yards(w); kit.kv = kvs()[0] if not kvs().is_empty() else 0.42
		var rs: Array = b.g.get("routes", [])
		if not rs.is_empty(): kit.kv = float(rs[0].request.kv)   # a kept design (Retry): the cell shows the line's own voltage
		_district = []
		if ins_allowed(b) and int(b.g.get("tick", 0)) <= int(b.g.get("levelStart", 0)): for r in rs: _district.append(str(r.branchId))   # a fresh job: whatever stands already is the district's, not the player's
		if ins_allowed(b):   # insulators are a kit part only where the level allows them (L05 keeps its 7 args)
			kit.insulator = "pin"; kit.coast = "pin"
			var pr := player_routes()
			if not pr.is_empty() and pr[0].request.has("insulatorId"): kit.insulator = str(pr[0].request.insulatorId); kit.coast = str(pr[0].request.get("coastInsulatorId", kit.insulator))
	_cost_cache = {}
	_read_yards(w); _build_items()
	visible = true
	if mode != "": _show_pegs()
	layout(); _layout_items(); queue_redraw()

func _clear_all() -> void:
	mode = ""; armed_xf = ""; armed_sea = ""; armed_isl = ""; sea_from = ""; from_id = ""; waypoints = []; hover_m = Vector2(NAN, NAN); hover_yard = ""; cursor_on = false; target_hi = -1; hover = -1
	chip_text = ""; preview = {}; _ghost({}, []); if instruments != null: instruments.set_clear_ghost(NAN)
	if world != null: world.set_site_pegs([], -1)

func _read_yards(w: Dictionary) -> void:
	yards = []; pairs = []
	for bus in w.get("buses", []):
		var kv := float(bus.kv)
		yards.append({"id": str(bus.id), "kv": kv, "tile": Vector2(float(bus.x), float(bus.y)), "pos": Vector2((float(bus.x) + 0.5) * tile_m, (float(bus.y) + 0.5) * tile_m),
			"label": "%s %s" % [TagView.yard_name(w, str(bus.id)), _kv_text(kv)], "offshore": bool(bus.get("offshore", false))})
	for lv in yards:   # every low-voltage yard is joined to the nearest high-voltage one by a distribution transformer
		if float(lv.kv) >= 1.0: continue
		var best := ""; var bd := 1e18
		for hv in yards:
			if float(hv.kv) < 1.0: continue
			var d: float = (hv.tile as Vector2).distance_to(lv.tile)
			if d < bd: bd = d; best = str(hv.id)
		if best != "": pairs.append({"hv": best, "lv": str(lv.id)})

static func _kv_text(kv: float) -> String: return ("%.2f kV" % kv) if kv < 1.0 else ("%s kV" % (str(int(kv)) if is_equal_approx(kv, round(kv)) else str(kv)))

func _parts(action: String, fallback: Array) -> Array:
	var pal = b.q("palette")
	if pal is Dictionary and pal.get("active", false):
		for a in pal.actions: if str(a.action) == action and not (a.parts as Array).is_empty(): return a.parts
	return fallback

## The lines the player laid: every route except the ones the job started with.
func player_routes() -> Array:
	return (b.g.get("routes", []) as Array).filter(func(r): return not _district.has(str(r.branchId)))

## Does the running level let the player choose insulators? The palette lists them when the engine exposes `buildRoute.insulator`; until then the level's fog rule says so.
static func ins_allowed(bridge) -> bool:
	if bridge == null: return false
	var pal = bridge.q("palette")
	if pal is Dictionary and pal.get("active", false):
		for a in pal.actions: if str(a.action) == "buildRoute.insulator" and not (a.parts as Array).is_empty(): return true
	var li = bridge.q("levelInfo")
	return li is Dictionary and li.get("active", false) and li.get("fogBlock") != null

func ins_parts() -> Array:
	var pal = b.q("palette")
	if pal is Dictionary and pal.get("active", false):
		for a in pal.actions: if str(a.action) == "buildRoute.insulator" and not (a.parts as Array).is_empty(): return a.parts
	return INS_IDS

## Does the level list `action` in its palette? (L30 lists layCableRoute and placeStorage; a level without a palette lists nothing.)
static func palette_has(bridge, action: String) -> bool:
	if bridge == null: return false
	var pal = bridge.q("palette")
	if pal is Dictionary and pal.get("active", false):
		for a in pal.actions: if str(a.action) == action: return true
	return false

## The survey, support and conductor groups are there unless the level has a palette that leaves buildRoute out (L30 has no poles to choose).
static func route_allowed(bridge) -> bool:
	if bridge == null: return true
	var pal = bridge.q("palette")
	if pal is Dictionary and pal.get("active", false): return palette_has(bridge, "buildRoute")
	return true

static func sea_allowed(bridge) -> bool: return palette_has(bridge, "layCableRoute")
static func isl_allowed(bridge) -> bool: return palette_has(bridge, "placeStorage")

func _build_items() -> void:
	var out: Array = []
	var g := 0
	if route_allowed(b):
		out.append({"kind": "survey", "id": "survey", "group": 0})
		if kvs().size() > 1: out.append({"kind": "kv", "id": "kv", "group": 0})
		for f in FAMS: out.append({"kind": "family", "id": f, "group": 1})
		for c in CROSS: out.append({"kind": "crossing", "id": c, "group": 2})
		out.append({"kind": "span", "id": "span", "group": 3})
		for c in _parts("buildRoute", ["weasel", "rabbit", "dog"]): out.append({"kind": "conductor", "id": str(c), "group": 4})
		g = 5
		if ins_allowed(b):
			for k in ["insulator", "coast"]:
				for i in ins_parts(): out.append({"kind": k, "id": str(i), "group": g})
				g += 1
	var xf_done := false
	if sea_allowed(b):   # L30, in the order the job is built: the sea cable reels, the island transformers, then the island batteries
		for c in _parts("layCableRoute", SEA_IDS): out.append({"kind": "sea", "id": str(c), "mm2": str(c).get_slice("-", 2), "group": g, "wk": 1.25})
		g += 1
		for x in _parts("placeTransformer", ["dt-100", "dt-160", "dt-250"]): out.append({"kind": "xfmr", "id": str(x), "kva": str(x).get_slice("-", 1), "group": g})
		g += 1; xf_done = true
	if isl_allowed(b):
		for c in _parts("placeStorage", ISL_IDS): out.append({"kind": "isl", "id": str(c), "kw": str(c).get_slice("-", 1).trim_suffix("kw"), "kwh": str(c).get_slice("-", 2).trim_suffix("kwh"), "group": g})
		g += 1
	if not xf_done:
		for x in _parts("placeTransformer", ["dt-100", "dt-160", "dt-250", "dt-400"]): out.append({"kind": "xfmr", "id": str(x), "kva": str(x).get_slice("-", 1), "group": g})
	items = out

func item_index(kind: String, id := "") -> int:
	for i in items.size(): if items[i].kind == kind and (id == "" or str(items[i].id) == id): return i
	return -1

## Spans the family's mechanical limit allows (the knob only offers these).
func allowed_spans(family := "") -> Array:
	var mx: int = int(MAX_SPAN.get(family if family != "" else str(kit.family), 70))
	return SPANS.filter(func(s): return s <= mx)

func _crossing_arg(k := {}):
	var c: String = str((k if not k.is_empty() else kit).crossing)
	return null if c == "none" else c

func _args(from: String, to: String, wps: Array, k := {}) -> Array:
	var kk: Dictionary = k if not k.is_empty() else kit
	var pts: Array = []
	for p in wps: pts.append([float((p as Vector2).x), float((p as Vector2).y)])
	var out := [from, to, str(kk.conductor), str(kk.family), _crossing_arg(kk), float(kk.span), pts]
	if kk.has("insulator"): out.append_array([str(kk.insulator), str(kk.coast)])   # only where the level allows insulators
	return out

## The args that rebuild a recorded line exactly as it was (the put-back after a refused re-string).
static func _old_args(from: String, to: String, req: Dictionary) -> Array:
	var all: Array = req.waypoints
	var out := [from, to, str(req.conductorId).trim_prefix("acsr-"), str(req.familyId), req.crossingFamilyId, float(req.spanM), all.slice(1, all.size() - 1)]
	if req.has("insulatorId"): out.append_array([str(req.insulatorId), str(req.get("coastInsulatorId", req.insulatorId))])
	return out

func _branch(id: String) -> Dictionary:
	for br in b.g.get("branches", []): if str(br.id) == id: return br
	return {}

func _yard(id: String) -> Dictionary:
	for y in yards: if str(y.id) == id: return y
	return {}

func _kv_of(id: String) -> float: return float(_yard(id).get("kv", 0.0))

## The line voltages the yards offer, lowest first.
func kvs() -> Array:
	var out: Array = []
	for y in yards:
		var k := float(y.kv)
		if not out.any(func(x): return is_equal_approx(float(x), k)): out.append(k)
	out.sort()
	return out

## The yard at the same site as `id` that has the kit's line voltage (a site has a low-voltage yard and, across its transformer pair, a high-voltage one).
func site_bus(id: String) -> String:
	if is_equal_approx(_kv_of(id), float(kit.kv)): return id
	for p in pairs:
		var other := ""
		if str(p.hv) == id: other = str(p.lv)
		elif str(p.lv) == id: other = str(p.hv)
		if other != "" and is_equal_approx(_kv_of(other), float(kit.kv)): return other
	return id

## The site a yard belongs to (its low-voltage yard id stands for the pair), so lines of either voltage between the same two sites are one line.
func site_of(id: String) -> String:
	for p in pairs:
		if str(p.hv) == id or str(p.lv) == id: return str(p.lv)
	return id

## Does the survey use this yard (its voltage is the kit's)? In transformer mode the low-voltage yard stands for its pair.
func _peg_shown(y: Dictionary) -> bool:
	if mode == "survey": return is_equal_approx(float(y.kv), float(kit.kv))
	if mode == "xfmr": return float(y.kv) < 1.0 and pairs.any(func(p): return str(p.lv) == str(y.id))
	if mode == "sea": return sea_pairs().any(func(p): return str(p.from) == str(y.id) or str(p.to) == str(y.id))
	if mode == "isl": return bool(y.get("offshore", false)) and float(y.kv) < 1.0
	return true

## The default other end of a line from `from`: the yard of the same voltage that is not it.
func default_dest(from: String) -> String:
	for y in yards: if str(y.id) != from and is_equal_approx(float(y.kv), _kv_of(from)): return str(y.id)
	return ""

func _tile_of(m: Vector2) -> Vector2: return Vector2(m.x / tile_m - 0.5, m.y / tile_m - 0.5)

## World-local screen position of a map point in metres, `z_m` metres above the ground (the world's own height-aware conversion when it has one).
func _screen_of(m: Vector2, z_m := 0.0) -> Vector2:
	if world.has_method("metres_to_screen"): return world.metres_to_screen(m, z_m)
	return world.world_to_screen(_tile_of(m), z_m * 3.0)

# ---- layout ---------------------------------------------------------------------------------------------------------------------------
func layout() -> void:
	if not slot.is_valid(): return
	var r: Rect2 = slot.call()
	var w := minf(r.size.x, 1120.0)
	position = Vector2(r.position.x + (r.size.x - w) * 0.5, r.position.y); size = Vector2(w, H)
	_layout_items(); queue_redraw()

func hit_min() -> float: return maxf(48.0, CbLayout.tap()) if CbLayout.kind == "phone" else 0.0
func _avail_right() -> float: return size.x - PAD - (TAG_W + GAP if _tag_inline else 0.0)

func _layout_items() -> void:
	var w := size.x
	_tag_inline = w >= WIDE
	var avail := w - PAD * 2.0 - (TAG_W + GAP if _tag_inline else 0.0)
	var n := items.size(); var groups := 0; var lastg := -1; var wsum := 0.0
	for it in items:
		wsum += float(it.get("wk", 1.0))   # a cell with more to print (the sea cable's three lines) is wider than the rest
		if int(it.group) != lastg: lastg = int(it.group); groups += 1
	var fit := (avail - GGAP * maxf(groups - 1, 0) - GAP * maxf(n - groups, 0)) / maxf(wsum, 1.0)
	var cw := clampf(fit, maxf(MIN_CELL, hit_min()), CELL_W)
	var x := PAD - _scroll; var total := 0.0; lastg = -1
	for it in items:
		if lastg >= 0 and int(it.group) != lastg: x += GGAP; total += GGAP
		elif lastg >= 0: pass
		lastg = int(it.group)
		var iw := cw * float(it.get("wk", 1.0))
		it["rect"] = Rect2(Vector2(x, 5.0), Vector2(iw, H - 10.0)); x += iw + GAP; total += iw + GAP
	_max_scroll = maxf(0.0, total - GAP - avail)
	_scroll = clampf(_scroll, 0.0, _max_scroll)

## Scroll the tray by most of its width (the ‹ › marks).
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
	if _max_scroll > 0.0 and _scroll < _max_scroll - 1.0 and GridTray.on_more_tab(p, _avail_right(), PAD): return -1   # the tab takes the click
	for i in items.size(): if (items[i].rect as Rect2).has_point(p) and _visible_item(i): return i
	return -1

# ---- picking ----------------------------------------------------------------------------------------------------------------------------
func cancel() -> bool:
	if mode == "" and from_id == "": return false
	mode = ""; armed_xf = ""; armed_sea = ""; armed_isl = ""; sea_from = ""; from_id = ""; waypoints = []; hover_m = Vector2(NAN, NAN); hover_yard = ""; cursor_on = false; target_hi = -1
	chip_text = ""; preview = {}; _ghost({}, [])
	if instruments != null: instruments.set_clear_ghost(NAN)
	if world != null: world.set_site_pegs([], -1)
	mode_changed.emit(""); queue_redraw()
	return true

## Activate a tray cell (click, tap, pad A, a number key).
func activate(i: int) -> void:
	if i < 0 or i >= items.size(): return
	var it: Dictionary = items[i]
	if is_locked(): refuse_locked(); return
	if tags != null: tags.close()
	match str(it.kind):
		"survey":
			if mode == "survey": cancel(); return
			cancel(); mode = "survey"; _show_pegs(); mode_changed.emit(mode); _hint(tx("RT_HINT_START"))
		"family", "crossing", "conductor", "insulator", "coast": select_kit(str(it.kind), str(it.id))
		"span": step_span(1)
		"kv": step_kv(1)
		"xfmr":
			if mode == "xfmr" and armed_xf == str(it.id): cancel(); return
			cancel(); mode = "xfmr"; armed_xf = str(it.id); _show_pegs(); mode_changed.emit(mode); _hint(tx("RT_HINT_XF") % str(it.kva))
		"sea":
			if mode == "sea" and armed_sea == str(it.id): cancel(); return
			cancel(); mode = "sea"; armed_sea = str(it.id); _show_pegs(); _island_target(); mode_changed.emit(mode); _hint(tx("L30_HINT_SEA") % sea_km_text())
		"isl":
			if mode == "isl" and armed_isl == str(it.id): cancel(); return
			cancel(); mode = "isl"; armed_isl = str(it.id); _show_pegs(); _island_target(); mode_changed.emit(mode); _hint(tx("L30_HINT_BAT"))
	queue_redraw()

func _hint(s: String) -> void:
	if CbLayout.touch: s = s.replace("Click", "Tap").replace("click", "tap")   # a phone has no mouse
	chip_text = s; chip_dot = Color.TRANSPARENT; chip_cell = -1; chip_at = Vector2(size.x * 0.5, -10.0)

func refuse_locked() -> void:
	cancel()
	if radio != null: radio.say("SYS", tx("TRAY_LOCKED") if b == null or str(b.g.get("status", "playing")) == "playing" else tx("GT_LOCKED_ENDED"), "warn")   # after the job ends the way back is Retry, not a pause

## Change one part of the kit; it applies to the next survey and re-strings the lines laid. Returns the re-string result.
func select_kit(what: String, id: String) -> Dictionary:
	if is_locked(): refuse_locked(); return {"ok": false}
	var before := kit.duplicate()
	if what == "family":
		kit.family = id
		if not allowed_spans().has(int(kit.span)):   # the family cannot carry that span: the nearest span it can
			var ok: Array = allowed_spans(); kit.span = ok[ok.size() - 1]
	elif what == "crossing": kit.crossing = id
	elif what == "conductor": kit.conductor = id
	elif what == "insulator" and kit.has("insulator"): kit.insulator = id
	elif what == "coast" and kit.has("insulator"): kit.coast = id
	elif what == "span": kit.span = int(id)
	var r := {"ok": true}
	if before != kit: r = restring()
	_cell_hover(); _survey_dirty(); queue_redraw()
	return r

## Next line voltage. A survey under way moves its start to the same site's yard of the new voltage; lines already laid stay (a new voltage is a new line).
func step_kv(d: int) -> void:
	var a := kvs()
	if a.is_empty(): return
	var i := a.find(float(kit.kv))
	kit.kv = a[posmod((0 if i < 0 else i) + d, a.size())]
	if from_id != "": from_id = site_bus(from_id)
	if mode != "": _show_pegs()
	_survey_dirty()
	_restring_kv()
	_hint(tx("RT_HINT_KV_HI") if float(kit.kv) >= 1.0 else tx("RT_HINT_KV_LO"))
	if radio != null and float(kit.kv) >= 1.0 and not pairs.all(func(p): return _has_xfmr(str(p.hv), str(p.lv))): radio.say("TOBI", tx("RT_KV_NEEDS_XF"))
	queue_redraw()

func step_span(d: int) -> Dictionary:
	var a := allowed_spans(); var i := a.find(int(kit.span))
	return select_kit("span", str(a[posmod((0 if i < 0 else i) + d, a.size())]))

func _act(name: String, args: Array) -> Dictionary:
	var r: Dictionary = b.act(name, args)
	if r.get("ok", false):
		if sfx.is_valid(): sfx.call("reel" if name == "buildRoute" or name == "layCableRoute" else "place")
		if chip_dot == GridTheme.BAD: chip_text = ""; chip_dot = Color.TRANSPARENT; last_refusal_key = ""; queue_redraw()   # a refusal does not outlive the build that fixed it (L05: the river warning stayed under a built steel-tube line)
	elif radio != null: radio.say("SYS", str(r.get("message", "")), "warn")
	return r

func _xfmrs() -> Array:
	var out: Array = []
	for br in b.g.get("branches", []): if str(br.kind) == "xfmr": out.append({"hv": str(br.from), "lv": str(br.to), "cat": str(br.catalogId)})
	return out

func _has_xfmr(hv: String, lv: String) -> bool:
	for x in _xfmrs(): if x.hv == hv and x.lv == lv: return true
	return false

## Put back the transformers a demolish took with it (the planner removes what hangs off the line's ends).
func _restore_xfmrs(before: Array) -> void:
	for x in before: if not _has_xfmr(x.hv, x.lv): b.act("placeTransformer", [x.hv, x.lv, x.cat])

func _refuse(ref: Dictionary, say := true) -> void:
	var key := str(ref.get("key", "")); var msg := str(ref.get("message", ""))
	chip_text = msg; chip_dot = GridTheme.BAD
	if say and radio != null and key != last_refusal_key: radio.say("SYS", msg, "warn")
	last_refusal_key = key

## The line voltage changed: every surveyed line moves to the same sites' yards at the new voltage (same bends, same kit). A refusal leaves it as it was.
func _restring_kv() -> void:
	if is_locked(): return
	for r in player_routes().duplicate(true):
		var br := _branch(str(r.branchId))
		if br.is_empty(): continue
		var nf := site_bus(str(br.from)); var nt := site_bus(str(br.to))
		if nf == str(br.from) and nt == str(br.to): continue
		var all: Array = r.request.waypoints; var wps: Array = []
		for k in range(1, all.size() - 1): wps.append(Vector2(float(all[k][0]), float(all[k][1])))
		var args := _args(nf, nt, wps)
		var pv = b.q("routePreview", args)
		if not (pv is Dictionary) or not pv.get("ok", false): _refuse(pv.get("refusal", {}) if pv is Dictionary else {}); continue
		var xf := _xfmrs()
		if not _act("demolish", [str(r.branchId)]).get("ok", false): continue
		if not _act("buildRoute", args).get("ok", false):
			var req: Dictionary = r.request
			b.act("buildRoute", _old_args(str(br.from), str(br.to), req))
		_restore_xfmrs(xf)

## Re-string every line laid with the kit (same yards, same waypoints). A refusal leaves the line as it was.
func restring() -> Dictionary:
	var recs: Array = player_routes().duplicate(true)
	var n := 0
	for r in recs:
		var br := _branch(str(r.branchId))
		if br.is_empty(): continue
		var req: Dictionary = r.request
		var same: bool = str(req.conductorId) == "acsr-" + str(kit.conductor) and str(req.familyId) == str(kit.family) and str(req.crossingFamilyId if req.crossingFamilyId != null else "none") == str(kit.crossing) and float(req.spanM) == float(kit.span)
		if same and kit.has("insulator"): same = str(req.get("insulatorId", "pin")) == str(kit.insulator) and str(req.get("coastInsulatorId", req.get("insulatorId", "pin"))) == str(kit.coast)
		if same: continue
		var all: Array = req.waypoints
		var wps: Array = []
		for k in range(1, all.size() - 1): wps.append(Vector2(float(all[k][0]), float(all[k][1])))
		var args := _args(str(br.from), str(br.to), wps)
		var pv = b.q("routePreview", args)
		if not (pv is Dictionary) or not pv.get("ok", false):
			var ref: Dictionary = pv.get("refusal", {}) if pv is Dictionary else {}
			_refuse(ref); return {"ok": false, "refusal": ref, "restrung": n}
		var xf := _xfmrs()
		var dm := _act("demolish", [str(r.branchId)])
		if not dm.get("ok", false): return {"ok": false, "restrung": n}
		var res := _act("buildRoute", args)
		if not res.get("ok", false):   # cannot happen after a good preview; put the old line back
			b.act("buildRoute", _old_args(str(br.from), str(br.to), req))
		_restore_xfmrs(xf)
		if not res.get("ok", false): return {"ok": false, "restrung": n}
		n += 1
	last_refusal_key = ""
	return {"ok": true, "restrung": n}

# ---- yards, pegs and the survey -----------------------------------------------------------------------------------------------------
func _show_pegs() -> void:
	if world == null: return
	var pegs: Array = []; var at := {}
	for i in yards.size():
		if not _peg_shown(yards[i]): continue
		at[i] = pegs.size(); pegs.append({"tile": yards[i].tile, "label": tx("RT_PEG_XF") % TagView.yard_name(_wq, str(yards[i].id)) if mode == "xfmr" else (tx("L30_PEG_BAT") % TagView.yard_name(_wq, str(yards[i].id)) if mode == "isl" else yards[i].label)})
	var hi: int = at.get(target_hi, -1)
	if mode == "survey" and from_id != "":
		hi = -1
		for i in yards.size(): if str(yards[i].id) == from_id: hi = at.get(i, -1)
	world.set_site_pegs(pegs, hi)

## Tab / D-pad: the next yard the current mode uses (the survey only walks the yards at the kit's voltage).
func walk_target(d: int) -> void:
	var shown: Array = []
	for i in yards.size(): if _peg_shown(yards[i]): shown.append(i)
	if shown.is_empty(): return
	var k := shown.find(target_hi)
	set_target_hi(shown[(0 if d > 0 else shown.size() - 1) if k < 0 else posmod(k + d, shown.size())])

func set_target_hi(i: int) -> void:
	target_hi = i if i >= 0 and i < yards.size() else -1
	_show_pegs(); queue_redraw()

func _yard_at(pos: Vector2) -> int:
	if world == null: return -1
	var r := 30.0
	if CbLayout.touch or CbLayout.kind == "phone": r = maxf(24.0, maxf(48.0, CbLayout.tap()) * 0.5)
	var best := -1; var bd := 1e9
	for i in yards.size():
		var d := pos.distance_to(world.world_to_screen(yards[i].tile, 14.0))
		if d <= r and d < bd: bd = d; best = i
	return best

func _metres_at(pos: Vector2) -> Vector2:
	if world != null and world.has_method("map_metres_at"):
		var v = world.map_metres_at(pos)
		if v is Vector2: return v
	return Vector2(NAN, NAN)

func _ghost(plan: Dictionary, pending: Array) -> void:
	ghost_calls += 1; last_ghost = {"plan": plan, "pending": pending}
	if world != null and world.has_method("set_route_ghost"): world.set_route_ghost(plan, pending)

func _survey_dirty() -> void: _dirty = true

## A click / tap on a yard peg: start the line, finish it, or place the armed transformer.
func press_yard(id: String) -> Dictionary:
	if is_locked(): refuse_locked(); return {}
	if mode == "xfmr": return place_xfmr(id)
	if mode == "sea": return place_sea(id)
	if mode == "isl": return place_isl(id)
	if mode != "survey": return {}
	id = site_bus(id)   # a click on a site means its yard at the kit's line voltage
	if from_id == "":
		from_id = id; waypoints = []; cursor_m = (_yard(id).pos as Vector2); cursor_on = false; hover_m = Vector2(NAN, NAN); hover_yard = ""
		_show_pegs(); _hint(tx("RT_HINT_WP")); _update_survey_preview(); queue_redraw(); return {"ok": true, "started": id}
	if id == from_id and waypoints.is_empty(): return {}
	return finish(id)

## A click on the ground (metres): one more bend of the survey.
func press_ground(m: Vector2) -> bool:
	if mode != "survey" or from_id == "" or is_nan(m.x): return false
	if is_locked(): refuse_locked(); return false
	if not waypoints.is_empty() and (waypoints[waypoints.size() - 1] as Vector2).distance_to(m) < 1.0: return false
	waypoints.append(m); hover_m = Vector2(NAN, NAN)
	if sfx.is_valid(): sfx.call("place")
	_update_survey_preview(); queue_redraw()
	return true

## Backspace / right-click / long-press: the last waypoint goes; with none left the start yard is forgotten.
func remove_last() -> bool:
	if mode != "survey": return false
	if not waypoints.is_empty(): waypoints.pop_back()
	elif from_id != "": from_id = ""; chip_text = ""; _ghost({}, []); if instruments != null: instruments.set_clear_ghost(NAN)
	else: return false
	_show_pegs(); _update_survey_preview(); queue_redraw()
	return true

func _line_between(a: String, c: String) -> String:
	var sa := site_of(a); var sc := site_of(c)
	for br in b.g.get("branches", []):
		if str(br.kind) != "line": continue
		var f := site_of(str(br.from)); var t2 := site_of(str(br.to))
		if (f == sa and t2 == sc) or (f == sc and t2 == sa): return str(br.id)   # same two sites at either voltage: a new survey replaces it (never two lines, never two bills)
	return ""

## Close the survey at yard `to_id`: preview, replace a line between the same yards (after the radio says so), buildRoute.
func finish(to_id: String) -> Dictionary:
	if from_id == "": return {}
	if is_locked(): refuse_locked(); return {}
	var args := _args(from_id, to_id, waypoints)
	var pv = b.q("routePreview", args)
	if not (pv is Dictionary) or not pv.get("ok", false):
		var ref: Dictionary = pv.get("refusal", {}) if pv is Dictionary else {}
		_refuse(ref); queue_redraw(); return {"ok": false, "refusal": ref}
	var old := _line_between(from_id, to_id)
	var xf := _xfmrs()
	var prev := {}
	if old != "":
		for r in b.g.get("routes", []): if str(r.branchId) == old: prev = (r as Dictionary).duplicate(true)
		if radio != null: radio.say("SYS", tx("RT_REPLACE") % [from_id, to_id, old], "warn")
		_act("demolish", [old])
	var r := _act("buildRoute", args)
	if not r.get("ok", false):
		if not prev.is_empty():   # put the old line back
			var req: Dictionary = prev.request; var all: Array = req.waypoints
			b.act("buildRoute", _old_args(from_id, to_id, req))
		_restore_xfmrs(xf); return r
	_restore_xfmrs(xf)
	last_refusal_key = ""
	cancel()
	if float(kit.kv) >= 1.0 and radio != null and not pairs.all(func(p): return _has_xfmr(str(p.hv), str(p.lv))): radio.say("TOBI", tx("RT_KV_NEEDS_XF"))
	return r

## Place the armed transformer on the pair that has yard `yard_id` (an existing transformer there is replaced after the radio says so).
func place_xfmr(yard_id: String) -> Dictionary:
	if is_locked(): refuse_locked(); return {}
	for p in pairs:
		if p.hv != yard_id and p.lv != yard_id: continue
		if _has_xfmr(p.hv, p.lv):
			var old := ""
			for br in b.g.get("branches", []): if str(br.kind) == "xfmr" and str(br.from) == p.hv and str(br.to) == p.lv: old = str(br.id)
			if radio != null: radio.say("SYS", tx("RT_REPLACE") % [p.hv, p.lv, old], "warn")
			_act("demolish", [old])
		return _act("placeTransformer", [p.hv, p.lv, armed_xf])
	if radio != null: radio.say("SYS", tx("RT_NO_PAIR"), "warn")
	return {}

# ---- L30: the sea cable and the island battery ------------------------------------------------------------------------------------------
func _sea_kv() -> float: return float((armed_sea if armed_sea != "" else str(SEA_IDS[0])).get_slice("-", 1))

## The crossings the armed cable can make: {from: the mainland yard nearest the island, to: an offshore yard}, one per island yard of the cable's voltage.
func sea_pairs(kv_in := -1.0) -> Array:
	var out: Array = []; var kv := _sea_kv() if kv_in < 0.0 else kv_in
	for y in yards:
		if not bool(y.get("offshore", false)) or not is_equal_approx(float(y.kv), kv): continue
		var best := ""; var bd := 1e18
		for h in yards:
			if bool(h.get("offshore", false)) or not is_equal_approx(float(h.kv), kv): continue
			var d: float = (h.tile as Vector2).distance_to(y.tile)
			if d < bd: bd = d; best = str(h.id)
		if best != "": out.append({"from": best, "to": str(y.id)})
	return out

## The sea distance the level fixes for the cable, km ("" rules when the level has none).
func sea_km() -> float:
	var rules = b.g.get("rules", {})
	var km = rules.get("seaCableKm") if rules is Dictionary else null
	return float(km) if km != null else 4.0
func sea_km_text() -> String: return "%.1f" % sea_km()

## What a build would cost, from the engine (`actionCost` runs it on a copy of the state); -1 when it cannot be priced.
func cost_of(name: String, args: Array) -> float:
	var key := name + JSON.stringify(args)
	if _cost_cache.has(key): return float(_cost_cache[key])
	var r = b.q("actionCost", [name, args]); var c := -1.0
	if r is Dictionary and r.get("ok", false): c = float(r.cost)
	_cost_cache[key] = c
	return c

## Price per km as the tray prints it: the engine's cost of laying that cable over the sea crossing, divided by its length.
func sea_per_km(id: String) -> float:
	for c in b.g.get("cables", []): if str(c.cableId) == id and float(c.lengthKm) > 0.0: return float(c.cost) / float(c.lengthKm)
	var ps := sea_pairs(float(id.get_slice("-", 1)))
	if ps.is_empty(): return 0.0
	var c := cost_of("layCableRoute", [str(ps[0].from), str(ps[0].to), id])
	return c / sea_km() if c >= 0.0 else 0.0

## The island battery's price at the island's low-voltage yard, from the engine.
func isl_cost(id: String) -> float:
	for y in yards: if bool(y.get("offshore", false)) and float(y.kv) < 1.0: return cost_of("placeStorage", [str(y.id), id])
	return -1.0

## Q = V^2 w C l of a cable of this kind over the level's sea distance, kvar: the engine's number once laid, else the same formula from the table (the tip before the player commits).
func sea_kvar(id: String) -> float:
	for c in b.g.get("cables", []): if str(c.cableId) == id: return float(c.chargingKvar)
	var dq = b.q("dial"); var f0 := float(dq.f0) if dq is Dictionary and dq.has("f0") else 50.0
	var kv := float(id.get_slice("-", 1)) * 1000.0
	return kv * kv * TAU * f0 * float(SEA_UF.get(id, 0.0)) * 1e-6 * sea_km() / 1000.0

func _sea_laid(id: String) -> bool:
	for c in b.g.get("cables", []): if str(c.cableId) == id: return true
	return false

func _isl_placed(id: String) -> bool:
	for st in b.g.get("storage", []): if str(st.catalogId) == id: return true
	return false

## Highlight the island's yard (Enter / pad A then finish the pick on it).
func _island_target() -> void:
	for i in yards.size():
		if _peg_shown(yards[i]) and bool(yards[i].get("offshore", false)): set_target_hi(i); return

## A click on a yard peg with a sea cable armed: the crossing is one tap when it is the only one (either end), else the mainland yard first, then the island's.
func place_sea(yard_id: String) -> Dictionary:
	if is_locked(): refuse_locked(); return {}
	var ps := sea_pairs(); var pr := {}
	if ps.size() == 1 and (str(ps[0].from) == yard_id or str(ps[0].to) == yard_id): pr = ps[0]
	elif sea_from == "":
		for p in ps:
			if str(p.to) == yard_id: pr = p
		if pr.is_empty() and ps.any(func(p): return str(p.from) == yard_id):
			sea_from = yard_id; _hint(tx("L30_HINT_SEA_FROM")); _show_pegs(); queue_redraw(); return {"ok": true, "started": yard_id}
	elif ps.any(func(p): return str(p.to) == yard_id): pr = {"from": sea_from, "to": yard_id}
	if pr.is_empty():
		if radio != null: radio.say("SYS", tx("L30_NO_SEA_PAIR"), "warn")
		return {}
	var old := ""; var old_cat := ""
	for br in b.g.get("branches", []): if str(br.kind) == "cable" and str(br.from) == str(pr.from) and str(br.to) == str(pr.to): old = str(br.id)
	if old != "":
		for c in b.g.get("cables", []): if str(c.branchId) == old: old_cat = str(c.cableId)
		if old_cat == armed_sea:
			if radio != null: radio.say("SYS", tx("L30_SEA_SAME"))
			cancel(); return {"ok": true, "same": true}
		if radio != null: radio.say("SYS", tx("RT_REPLACE") % [pr.from, pr.to, old], "warn")
		_act("demolish", [old])
	var r := _act("layCableRoute", [str(pr.from), str(pr.to), armed_sea])
	if not r.get("ok", false) and old != "": b.act("layCableRoute", [str(pr.from), str(pr.to), old_cat])   # put the old cable back
	if r.get("ok", false): last_refusal_key = ""
	cancel()
	return r

## A click on the island's low-voltage yard with a battery armed: it stands there (an old battery of that yard is replaced after the radio says so).
func place_isl(yard_id: String) -> Dictionary:
	if is_locked(): refuse_locked(); return {}
	var y := _yard(yard_id)
	if y.is_empty() or not bool(y.get("offshore", false)) or float(y.kv) >= 1.0:
		if radio != null: radio.say("SYS", tx("L30_NO_ISL_BUS"), "warn")
		return {}
	var old := ""; var old_cat := ""
	for st in b.g.get("storage", []): if str(st.bus) == yard_id: old = str(st.id); old_cat = str(st.catalogId)
	if old != "":
		if old_cat == armed_isl:
			if radio != null: radio.say("SYS", tx("L30_BAT_SAME"))
			cancel(); return {"ok": true, "same": true}
		if radio != null: radio.say("SYS", tx("L30_REPLACE_BAT") % [yard_id, old], "warn")
		_act("demolish", [old])
	var r := _act("placeStorage", [yard_id, armed_isl])
	if not r.get("ok", false) and old != "": b.act("placeStorage", [yard_id, old_cat])
	cancel()
	return r

## The battery that stands at a yard ("" when none): a tap on that yard opens the battery's tag.
func battery_at(yard_id: String) -> String:
	for st in b.g.get("storage", []): if str(st.bus) == yard_id: return str(st.id)
	return ""

## The laid sea cable under a tap (screen-local), by distance to the straight run between its two yards ("" when none).
func sea_pick(pos: Vector2) -> String:
	if world == null: return ""
	var best := ""; var bd := 18.0
	if CbLayout.touch or CbLayout.kind == "phone": bd = maxf(24.0, maxf(48.0, CbLayout.tap()) * 0.5)
	for br in b.g.get("branches", []):
		if str(br.kind) != "cable": continue
		var fy := _yard(str(br.from)); var ty := _yard(str(br.to))
		if fy.is_empty() or ty.is_empty(): continue
		var a: Vector2 = world.world_to_screen(fy.tile, 6.0); var c: Vector2 = world.world_to_screen(ty.tile, 6.0)
		var d := Geometry2D.get_closest_point_to_segment(pos, a, c).distance_to(pos)
		if d <= bd: bd = d; best = str(br.id)
	return best

## A tap on the world (local coordinates). True when the tray used it.
func on_tap(pos: Vector2) -> bool:
	if world == null: return false
	var yi := _yard_at(pos)
	if mode == "":
		if yi >= 0 and tags != null:
			var bt := battery_at(str(yards[yi].id))
			if bt != "" and tags.open("battery", bt): return true
			tags.open("yard", str(yards[yi].id)); return true
		if tags != null and sea_allowed(b):
			var sc := sea_pick(pos)
			if sc != "" and tags.open("seacable", sc): return true
		return false
	if yi >= 0 and not (mode == "survey" and from_id != "" and site_bus(str(yards[yi].id)) == from_id): press_yard(str(yards[yi].id)); return true
	if mode == "survey" and from_id != "": press_ground(_metres_at(pos)); return true   # (a click near the start yard is a first bend, not a dropped click)
	cancel()
	return true

## The pointer is over the ground at `m` (metres); the ghost follows at <= 10 Hz, or at once with `now`.
func hover_ground(m: Vector2, now := false) -> void:
	hover_m = m; hover_yard = ""; cursor_on = false; _dirty = true
	if now: _update_survey_preview()

func on_long(_pos: Vector2) -> bool: return remove_last()

## Right button on the ground (world signal ground_pressed): the last waypoint goes.
func on_ground_pressed(m: Vector2, button: int) -> void:
	if button == MOUSE_BUTTON_RIGHT and mode == "survey": remove_last()

func on_hover(pos: Vector2) -> void:
	if world == null: return
	_hover_screen = pos
	if mode == "": return
	var yi := _yard_at(pos)
	if mode == "survey" and from_id != "":
		hover_yard = str(yards[yi].id) if yi >= 0 else ""
		hover_m = Vector2(NAN, NAN) if yi >= 0 else _metres_at(pos)
		cursor_on = false; _dirty = true
	elif yi != target_hi: set_target_hi(yi)

## Hover chip and what-if of the lines laid: the part under the pointer, applied to the first line's waypoints.
func _cell_hover() -> void:
	if mode == "survey" and from_id != "": return
	chip_cell = -1
	if hover >= 0 and hover < items.size():
		var it: Dictionary = items[hover]
		var k := kit.duplicate()
		match str(it.kind):
			"family": k.family = str(it.id)
			"crossing": k.crossing = str(it.id)
			"conductor": k.conductor = str(it.id)
			"insulator": k.insulator = str(it.id)
			"coast": k.coast = str(it.id)
			"span": k.span = int(allowed_spans()[(allowed_spans().find(int(kit.span)) + 1) % allowed_spans().size()])
			_: k = {}
		if not k.is_empty():
			var recs: Array = player_routes()
			if not recs.is_empty():
				var br := _branch(str(recs[0].branchId)); var all: Array = recs[0].request.waypoints; var wps: Array = []
				for j in range(1, all.size() - 1): wps.append(Vector2(float(all[j][0]), float(all[j][1])))
				if k.family != kit.family and not allowed_spans(str(k.family)).has(int(k.span)): var ok2: Array = allowed_spans(str(k.family)); k.span = ok2[ok2.size() - 1]
				_show_preview(_args(str(br.from), str(br.to), wps, k), "RT_CHIP_RESTRING", false)
				chip_cell = hover; chip_at = Vector2((items[hover].rect as Rect2).get_center().x, -8.0); queue_redraw(); return
	if mode == "": chip_text = ""; preview = {}; if instruments != null: instruments.set_clear_ghost(NAN)
	if hover >= 0 and hover < items.size() and chip_text == "": chip_text = tip(items[hover]); chip_dot = Color.TRANSPARENT; chip_cell = hover; chip_at = Vector2((items[hover].rect as Rect2).get_center().x, -8.0)
	queue_redraw()

## What a cell is, in a sentence (its hover chip when there is no line to re-string).
func tip(it: Dictionary) -> String:
	match str(it.kind):
		"family": return tx("RT_TIP_FAM") % [tx("RT_FAM_" + str(it.id)), str(it.id).get_slice("-", 1), str(MAX_SPAN[str(it.id)])]
		"crossing": return tx("RT_TIP_CROSS") % tx("RT_TIP_CROSS_" + str(it.id))
		"span": return tx("RT_TIP_SPAN") % [str(kit.span), " · ".join(allowed_spans().map(func(v): return str(v)))]
		"kv": return tx("RT_TIP_KV")
		"conductor": return tx("RT_TIP_COND") % [tx("RT_COND_" + str(it.id)), str(COND_MM2.get(str(it.id), 0))]
		"insulator": return tx("RT_TIP_INS") % [tx("RT_INS_" + str(it.id)), str(INS_MM.get(str(it.id), 0))]
		"coast": return tx("RT_TIP_COAST") % [tx("RT_INS_" + str(it.id)), str(INS_MM.get(str(it.id), 0))]
		"xfmr": return tx("RT_TIP_XF") % str(it.kva)
		"sea": return tx("L30_TIP_SEA") % [str(it.mm2), CbRegion.money(sea_per_km(str(it.id)), false, 0), "%.2f" % float(SEA_UF.get(str(it.id), 0.0)), _kvar_text(sea_kvar(str(it.id)))]
		"isl": return tx("L30_TIP_BAT") % [str(it.kw), str(it.kwh), str(it.kw), str(it.kwh), CbRegion.money(maxf(isl_cost(str(it.id)), 0.0), false, 0)]
	return ""

## routePreview of `args`: the chip text, its dot, the clearance gauge's ghost needle. Returns the engine result.
func _show_preview(args: Array, chip_key: String, say := true):
	var pv = b.q("routePreview", args)
	preview = pv if pv is Dictionary else {}
	if not (pv is Dictionary): return pv
	if pv.get("ok", false):
		last_refusal_key = ""
		var m := float(pv.worstMarginM)
		chip_text = tx(chip_key) % [tx("RT_KM") % (float(pv.lengthM) / 1000.0), (pv.supports as Array).size(), "%+.1f" % m, CbRegion.money(float(pv.cost.total), false, 0)]
		chip_dot = GridTheme.GOOD if m > 0.5 else (GridTheme.WARN if m >= 0.0 else GridTheme.BAD)
		var c: Dictionary = pv.cost   # where the money goes: the player can see which choice to change for a cheaper line
		var M := func(k: String) -> String: return CbRegion.money(float(c.get(k, 0.0)), false, 0)
		var parts: Array = [tx("RT_COST_POLES") % M.call("supports"), tx("RT_COST_FOOT") % M.call("foundations"), tx("RT_COST_WIRE") % M.call("conductor")]
		if float(c.get("clearing", 0.0)) > 0.0: parts.append(tx("RT_COST_CLEAR") % M.call("clearing"))
		if float(c.get("insulators", 0.0)) > 0.0: parts.append(tx("RT_COST_INS") % M.call("insulators"))
		chip_text += "\n" + " · ".join(parts)
		var note := salt_note(pv)
		if note != "": chip_text += "\n" + note; _note_of = {"text": chip_text, "note": note}
		if instruments != null: instruments.set_clear_ghost(m)
	else:
		_refuse(pv.get("refusal", {}), say)
		if instruments != null: instruments.set_clear_ghost(NAN)
	return pv

## "N supports short of their salt creepage (worst: pole K, X mm of Y)" from the preview's saltShort and per-support creepage / need; "" when none is short.
func salt_note(pv: Dictionary) -> String:
	var short: Array = pv.get("saltShort", [])
	if short.is_empty(): return ""
	var sups: Array = pv.supports; var wi := int(short[0]); var wgap := -1.0
	for i in short:
		var gap := float(sups[int(i)].needMm) - float(sups[int(i)].creepageMm)
		if gap > wgap + 1e-9: wgap = gap; wi = int(i)
	var sp: Dictionary = sups[wi]
	var at := [wi + 1, int(round(float(sp.creepageMm))), int(round(float(sp.needMm)))]
	return tx("RT_SALT_NOTE") % ([short.size()] + at) if short.size() > 1 else tx("RT_SALT_NOTE1") % at

func _update_survey_preview() -> void:
	_dirty = false; _last_prev_ms = Time.get_ticks_msec()
	if mode != "survey" or from_id == "":
		if mode == "": return
		_ghost({}, []); return
	var to := hover_yard if hover_yard != "" and hover_yard != from_id else default_dest(from_id)
	var wps := waypoints.duplicate()
	var pending: Array = [(_yard(from_id).pos as Vector2)] + waypoints
	var endm := hover_m if hover_yard == "" else Vector2(NAN, NAN)
	if cursor_on and not is_nan(cursor_m.x): endm = cursor_m
	if not is_nan(endm.x): wps.append(endm); pending.append(endm)
	elif hover_yard != "": pending.append((_yard(hover_yard).pos as Vector2))
	chip_cell = -1
	var pv = _show_preview(_args(from_id, to, wps), "RT_CHIP", false)   # hover previews speak in the chip only; the radio hears a refusal when the player commits (click / finish)
	var refused := {}
	if pv is Dictionary and not pv.get("ok", false):   # the world draws the pending path red and marks the offending tile
		refused = {"ok": false, "tile": int((pv.get("refusal", {}) as Dictionary).get("params", {}).get("tile", -1))}
	_ghost(pv if pv is Dictionary and pv.get("ok", false) else refused, pending)
	_chip_anchor(); queue_redraw()

## Where the chip of the survey stands, tray-local: above the pointer (or the pad cursor).
func _chip_anchor() -> void:
	if world == null or not is_inside_tree() or not world.is_inside_tree(): return
	var sp := _hover_screen
	if cursor_on and not is_nan(cursor_m.x): sp = _screen_of(cursor_m, 6.0)
	elif mode == "survey" and from_id != "" and is_nan(hover_m.x) and hover_yard == "" and not waypoints.is_empty(): sp = _screen_of(waypoints[waypoints.size() - 1], 6.0)
	chip_at = world.get_global_rect().position + sp + Vector2(0.0, -26.0) - global_position

## The nearest same-voltage yard (not the start) to the pointer / cursor / last waypoint: where Enter finishes.
func nearest_end() -> String:
	var ref := hover_m
	if cursor_on and not is_nan(cursor_m.x): ref = cursor_m
	if is_nan(ref.x) and not waypoints.is_empty(): ref = waypoints[waypoints.size() - 1]
	if is_nan(ref.x): return default_dest(from_id)
	var best := ""; var bd := 1e18
	for y in yards:
		if str(y.id) == from_id or not is_equal_approx(float(y.kv), _kv_of(from_id)): continue
		var d: float = (y.pos as Vector2).distance_to(ref)
		if d < bd: bd = d; best = str(y.id)
	return best

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
		if mb.button_index in [MOUSE_BUTTON_WHEEL_DOWN, MOUSE_BUTTON_WHEEL_UP] and mb.pressed:   # the wheel only scrolls the tray: it never changes a part (a built line would be re-strung and re-priced by accident)
			if _max_scroll > 0.0: _scroll = clampf(_scroll + (40.0 if mb.button_index == MOUSE_BUTTON_WHEEL_DOWN else -40.0), 0.0, _max_scroll); _layout_items(); queue_redraw()
		elif mb.button_index == MOUSE_BUTTON_LEFT:
			if mb.pressed: _press_idx = _item_at(mb.position); _press_x = mb.position.x; _dragged = false
			else:
				var i := _item_at(mb.position)
				if i >= 0 and i == _press_idx and not _dragged: hover = i; activate(i); accept_event()
				elif i < 0 and not _dragged and _max_scroll > 0.0:   # the ‹ › scroll marks are buttons too
					if mb.position.x < PAD + 8.0: page(-1)
					elif _scroll < _max_scroll - 1.0 and GridTray.on_more_tab(mb.position, _avail_right(), PAD): page(1)
				_press_idx = -1
		accept_event()

## Keys: 1..9 pick the n-th cell, S the survey, Enter finishes at the nearest yard, Backspace removes the last waypoint, Tab walks the yards. True when used.
func key(e: InputEventKey) -> bool:
	if not visible or not e.pressed: return false
	if e.keycode >= KEY_1 and e.keycode <= KEY_9:
		var n := e.keycode - KEY_1
		if n < items.size(): focus = n; hover = -1; _ensure_visible(n); activate(n)
		return n < items.size()
	match e.keycode:
		KEY_S:
			var s := item_index("survey")
			if s >= 0: activate(s); return true
		KEY_BACKSPACE: return remove_last()
		KEY_TAB:
			if mode != "" and not (mode == "survey" and from_id != ""): walk_target(-1 if e.shift_pressed else 1); return true
		KEY_ENTER, KEY_KP_ENTER:
			if mode == "survey" and from_id != "": finish(nearest_end()); return true
			if mode != "" and target_hi >= 0: press_yard(str(yards[target_hi].id)); return true
	return false

## Esc / pad B with nothing to take back: cancel the survey or the pick, else step the pad focus out. True when something was undone.
func cancel_key() -> bool:
	if cancel(): return true
	if engaged: engaged = false; queue_redraw(); return true
	return false

func _move_cursor(dx: int, dy: int) -> void:
	if is_nan(cursor_m.x): cursor_m = (_yard(from_id).pos as Vector2)
	# screen-aligned on the 2:1 map: right = +x -y, down = +x +y (50 m on each axis)
	var d := Vector2(float(dx + dy), float(dy - dx)) * STEP_M * float(cursor_step_tiles())
	var lim := Vector2(float(_wq.terrain.cols), float(_wq.terrain.nrows)) * tile_m
	cursor_m = Vector2(clampf(cursor_m.x + d.x, 0.0, lim.x), clampf(cursor_m.y + d.y, 0.0, lim.y)); cursor_on = true
	_update_survey_preview(); queue_redraw()

## Tiles per cursor step: one 50 m tile when zoomed in, more when the map is small on screen (a step is never less than ~22 px, so crossing the map is ~30 presses, not 100).
func cursor_step_tiles() -> int:
	if world == null or not world.has_method("world_to_screen"): return 1
	var px := world.world_to_screen(Vector2(0, 0), 0.0).distance_to(world.world_to_screen(Vector2(1, 0), 0.0))
	return clampi(int(ceil(22.0 / maxf(px, 1.0))), 1, 4)

## Pad: LB / RB cycle the cells, A picks / drops a waypoint / finishes near a yard, B removes the last waypoint (else cancels), D-pad moves the survey cursor or walks the yards.
func pad_button(idx: int) -> bool:
	if not visible: return false
	var surveying := mode == "survey" and from_id != ""
	match idx:
		JOY_BUTTON_LEFT_SHOULDER, JOY_BUTTON_RIGHT_SHOULDER:
			if items.is_empty(): return false
			var d := -1 if idx == JOY_BUTTON_LEFT_SHOULDER else 1
			engaged = true; hover = -1
			focus = (0 if d > 0 else items.size() - 1) if focus < 0 else posmod(focus + d, items.size())
			_ensure_visible(focus); _cell_hover(); queue_redraw(); return true
		JOY_BUTTON_A:
			if surveying:
				if is_nan(cursor_m.x): cursor_m = (_yard(from_id).pos as Vector2)
				cursor_on = true
				for y in yards:   # the cursor on (or within 1.5 tiles of) another yard of the line's voltage: finish there
					if str(y.id) != from_id and is_equal_approx(float(y.kv), _kv_of(from_id)) and (y.pos as Vector2).distance_to(cursor_m) <= 1.5 * tile_m: finish(str(y.id)); return true
				press_ground(cursor_m); return true
			if mode != "":
				if target_hi >= 0: press_yard(str(yards[target_hi].id)); return true
				walk_target(1); return true
			if engaged and focus >= 0: activate(focus); return true
		JOY_BUTTON_Y:
			if surveying:   # jump the cursor to the other end's yard (then A finishes there); bends are placed on the way with the D-pad
				var dest := default_dest(from_id)
				if dest == "": return false
				cursor_m = (_yard(dest).pos as Vector2); cursor_on = true; _update_survey_preview(); queue_redraw(); return true
		JOY_BUTTON_B:
			if surveying and not waypoints.is_empty(): return remove_last()
			return cancel_key()
		JOY_BUTTON_DPAD_LEFT, JOY_BUTTON_DPAD_UP, JOY_BUTTON_DPAD_RIGHT, JOY_BUTTON_DPAD_DOWN:
			if surveying:
				_move_cursor(1 if idx == JOY_BUTTON_DPAD_RIGHT else (-1 if idx == JOY_BUTTON_DPAD_LEFT else 0), 1 if idx == JOY_BUTTON_DPAD_DOWN else (-1 if idx == JOY_BUTTON_DPAD_UP else 0)); return true
			if mode == "" or yards.is_empty(): return false
			var d2 := -1 if idx == JOY_BUTTON_DPAD_LEFT or idx == JOY_BUTTON_DPAD_UP else 1
			walk_target(d2); return true
		JOY_BUTTON_Y:
			if tags != null: tags.pad_cycle(); return true
	return false

func _process(dt: float) -> void:
	if not visible: return
	_t += dt
	if _dirty and Time.get_ticks_msec() - _last_prev_ms >= 100: _update_survey_preview()   # the ghost is asked for at most 10 times a second
	if mode == "survey" and from_id != "" and CbKit.pad_mode:   # left stick: the survey cursor, one 50 m step per 0.14 s
		var ax := Input.get_joy_axis(0, JOY_AXIS_LEFT_X); var ay := Input.get_joy_axis(0, JOY_AXIS_LEFT_Y)
		_stick_t -= dt
		if (absf(ax) > 0.55 or absf(ay) > 0.55) and _stick_t <= 0.0:
			_stick_t = 0.14
			if absf(ax) >= absf(ay): _move_cursor(1 if ax > 0.0 else -1, 0)
			else: _move_cursor(0, 1 if ay > 0.0 else -1)
		var dx := int(Input.is_joy_button_pressed(0, JOY_BUTTON_DPAD_RIGHT)) - int(Input.is_joy_button_pressed(0, JOY_BUTTON_DPAD_LEFT))
		var dy := int(Input.is_joy_button_pressed(0, JOY_BUTTON_DPAD_DOWN)) - int(Input.is_joy_button_pressed(0, JOY_BUTTON_DPAD_UP))
		if dx != 0 or dy != 0:   # a held D-pad repeats after 0.35 s, every 0.09 s (the press itself moved once in pad_button)
			_dpad_t += dt
			if _dpad_t >= 0.35: _dpad_t -= 0.09; _move_cursor(dx, dy)
		else: _dpad_t = 0.0
	if mode != "" and not CbSettings.reduced_motion: queue_redraw()

# ---- drawing --------------------------------------------------------------------------------------------------------------------------
func _text(font: Font, fsz: int, at: Vector2, s: String, col: Color, centre_w := -1.0) -> void:
	var tw := font.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz).x
	while centre_w > 0.0 and tw > centre_w and s.length() > 2:   # still too wide at the smallest size: trim with an ellipsis rather than run into the next cell
		s = s.left(s.length() - 2) + "…"; tw = font.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz).x
	var x := at.x if centre_w < 0.0 else at.x + (centre_w - tw) * 0.5
	GridText.ds(self, font, Vector2(x, at.y), s, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz, col)

func _selected(it: Dictionary) -> bool:
	match str(it.kind):
		"family": return str(it.id) == str(kit.family)
		"crossing": return str(it.id) == str(kit.crossing)
		"conductor": return str(it.id) == str(kit.conductor)
		"insulator": return str(it.id) == str(kit.get("insulator", ""))
		"coast": return str(it.id) == str(kit.get("coast", ""))
		"survey": return mode == "survey"
		"xfmr": return mode == "xfmr" and armed_xf == str(it.id)
		"sea": return (mode == "sea" and armed_sea == str(it.id)) or _sea_laid(str(it.id))
		"isl": return (mode == "isl" and armed_isl == str(it.id)) or _isl_placed(str(it.id))
	return false

## Cell captions: [name, sub] from the engine's ids and the part labels.
func caption(it: Dictionary) -> Array:
	match str(it.kind):
		"survey": return [tx("RT_SURVEY"), tx("RT_SURVEY_ON") if mode == "survey" else tx("RT_SURVEY_SUB")]
		"family": return [tx("RT_FAM_" + str(it.id)), tx("RT_FAM_SUB") % str(it.id).get_slice("-", 1), tx("RT_FAM_SUB2") % str(MAX_SPAN[str(it.id)])]
		"crossing": return [tx("RT_CROSS_" + str(it.id)), tx("RT_CROSS_NONE_SUB") if str(it.id) == "none" else tx("RT_CROSS_SUB")]
		"span": return [tx("RT_SPAN"), tx("RT_SPAN_SUB")]
		"kv": return [_kv_text(float(kit.kv)), tx("RT_KV_SUB")]
		"conductor": return [tx("RT_COND_" + str(it.id)), tx("RT_COND_SUB") % str(COND_MM2.get(str(it.id), 0))]
		"insulator": return [tx("RT_INS_" + str(it.id)), tx("RT_INS_SUB") % str(INS_MM.get(str(it.id), 0))]
		"coast": return [tx("RT_INS_" + str(it.id)), tx("RT_COAST_SUB") % str(INS_MM.get(str(it.id), 0))]
		"xfmr": return [tx("RT_XF") % str(it.kva), tx("RT_XF_PLACED") if _xf_placed(str(it.id)) else tx("RT_XF_SUB")]
		"sea": return [tx("RT_COND_SUB") % str(it.mm2), tx("L30_SEA_PERKM") % _short_money(sea_per_km(str(it.id)))]   # two short lines; the µF/km and the charging power are in the hover chip
		"isl": return [tx("L30_BAT_KW") % str(it.kw), tx("L30_BAT_KWH") % str(it.kwh)]
	return ["", ""]

## "$150K" for a cell caption: the region's compact money without a trailing ".0".
static func _short_money(v: float) -> String:
	var m := CbRegion.money(v, true)
	for suf in ["K", "M", "B", " thousand", " lakh", " crore"]: m = m.replace(".0" + suf, suf)
	return m

## kvar as the tags print it: one decimal under 10, whole above.
static func _kvar_text(q: float) -> String: return ("%.1f" % q) if q < 10.0 else str(int(round(q)))

func _xf_placed(cat: String) -> bool:
	for x in _xfmrs(): if x.cat == cat: return true
	return false

func _draw() -> void:
	if not visible: return
	draw_style_box(GridTheme.ink_sb(0.94, 10, 0.0), Rect2(Vector2.ZERO, size))
	draw_line(Vector2(10, 2), Vector2(size.x - 10, 2), Color(GridTheme.SODIUM_DIM, 0.35), 1.0)
	var semi := GridTheme.font("semi"); var mono := GridTheme.font("mono")
	for i in items.size():
		if not _visible_item(i): continue
		var it: Dictionary = items[i]; var r: Rect2 = it.rect
		var sel := _selected(it)
		var fc := (engaged or (CbKit.pad_mode and mode == "")) and i == focus   # while surveying the pad drives the map cursor: no stale ring on a tray cell
		var hv := i == hover and not (engaged and focus >= 0 and focus != i)
		var fill := Color(GridTheme.NIGHT, 0.55)
		if hv: fill = Color(GridTheme.INK).lightened(0.14)
		if sel: fill = Color(GridTheme.SODIUM, 0.16 + (0.06 * sin(_t * 4.0) if str(it.kind) in ["survey", "xfmr"] else 0.04))
		var other_focus := engaged and focus >= 0 and focus != i
		draw_style_box(_cell_sb(fill, (sel and not other_focus) or hv), r)
		if fc: draw_style_box(GridTheme.focus_sb(), r)
		var c := r.position + Vector2(r.size.x * 0.5, 30.0)
		match str(it.kind):
			"survey": _icon_survey(c)
			"family": _icon_pole(c, str(it.id))
			"crossing": _icon_crossing(c, str(it.id))
			"span": _icon_span(c, int(kit.span))
			"kv": _icon_kv(c, float(kit.kv))
			"conductor": _icon_reel(c, float(COND_MM2.get(str(it.id), 30)))
			"insulator": _icon_insulator(c, str(it.id), false)
			"coast": _icon_insulator(c, str(it.id), true)
			"xfmr": _icon_xfmr(c, _xf_placed(str(it.id)))
			"sea": _icon_sea(c, float(str(it.mm2)))
			"isl": _icon_battery(c, float(str(it.kw)), float(str(it.kwh)))
		if sel and str(it.kind) in ["family", "crossing", "conductor", "insulator", "coast", "sea", "isl"]:
			var dp := r.position + Vector2(r.size.x - 9.0, 9.0)
			draw_circle(dp, 4.0, GridTheme.SODIUM); draw_arc(dp, 4.0, 0, TAU, 12, GridTheme.NIGHT, 1.0)
		var cap := caption(it)
		var tw := r.size.x - 4.0
		var use_n := 13
		while use_n > 8 and semi.get_string_size(str(cap[0]), HORIZONTAL_ALIGNMENT_LEFT, -1, GridTheme.fs(use_n)).x > tw: use_n -= 1
		var dy := 0.0; var dy1 := 0.0; var dy2 := 0.0
		_text(semi, GridTheme.fs(use_n), Vector2(r.position.x + 2.0, r.position.y + 62.0 + dy), str(cap[0]), GridTheme.TEXT if (hv or sel or fc) else Color(GridTheme.TEXT, 0.92), tw)
		var use_s := 11
		var wide_sub: String = str(cap[1]) if cap.size() < 3 or str(cap[1]).length() >= str(cap[2]).length() else str(cap[2])   # both sub lines share one size: the longer one decides
		while use_s > 7 and mono.get_string_size(wide_sub, HORIZONTAL_ALIGNMENT_LEFT, -1, GridTheme.fs(use_s)).x > tw: use_s -= 1
		var two: bool = cap.size() > 2
		_text(mono, GridTheme.fs(use_s), Vector2(r.position.x + 2.0, r.position.y + (72.0 if two else 76.0) + dy1), str(cap[1]), GridTheme.SODIUM if sel else GridTheme.DIM, tw)
		if two: _text(mono, GridTheme.fs(use_s), Vector2(r.position.x + 2.0, r.position.y + 84.0 + dy2), str(cap[2]), GridTheme.SODIUM if sel else GridTheme.DIM, tw)
	if _max_scroll > 0.0:
		if _scroll > 1.0: GridText.ds(self, semi, Vector2(2.0, H * 0.5 + 6.0), "‹", HORIZONTAL_ALIGNMENT_LEFT, -1, GridTheme.fs(22), GridTheme.SODIUM)
		if _scroll < _max_scroll - 1.0: GridTray.draw_more_tab(self, items, _avail_right(), PAD, H)   # the more-parts tab with its count
	_draw_price_tag()
	_draw_cursor()
	if chip_text != "" and not is_locked():
		if chip_cell < 0 and mode == "survey" and from_id != "": _chip_anchor()
		elif chip_cell < 0: chip_at = Vector2(size.x * 0.5, -10.0)
		_draw_chip(chip_at, chip_text, chip_dot)

func _cell_sb(fill: Color, lit: bool) -> StyleBoxFlat:
	var s := StyleBoxFlat.new(); s.bg_color = fill; s.set_corner_radius_all(7)
	s.border_color = GridTheme.SODIUM if lit else Color(GridTheme.SODIUM_DIM, 0.28); s.set_border_width_all(2 if lit else 1)
	return s

func _draw_cursor() -> void:
	if not cursor_on or is_nan(cursor_m.x) or world == null or not is_inside_tree() or not world.is_inside_tree(): return
	var p := world.get_global_rect().position + _screen_of(cursor_m, 0.0) - global_position
	var col := Color(GridTheme.SODIUM, 0.9)
	draw_arc(p, 14.0, 0.0, TAU, 24, col, 2.0)
	draw_line(p + Vector2(-20, 0), p + Vector2(-8, 0), col, 2.0); draw_line(p + Vector2(8, 0), p + Vector2(20, 0), col, 2.0)
	draw_line(p + Vector2(0, -20), p + Vector2(0, -8), col, 2.0); draw_line(p + Vector2(0, 8), p + Vector2(0, 20), col, 2.0)

func _draw_price_tag() -> void:
	var bud: Dictionary = b.g.get("budget", {}) if b != null else {}
	var spent := CbRegion.money(float(bud.get("spent", 0.0)), false, 0); var budget := CbRegion.money(float(bud.get("capexLimit", 0.0)), false, 0)
	var over: bool = float(bud.get("spent", 0.0)) > float(bud.get("capexLimit", 0.0))
	var txt := tx("TRAY_BUDGET") % [spent, budget]
	var mono := GridTheme.font("mono"); var semi := GridTheme.font("semi")
	var fsz := GridTheme.fs(15)
	var tw := mono.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz).x
	if mono.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, GridTheme.fs(12)).x > TAG_W - 30.0:   # millions do not fit at a readable size (L20: "$980,425,000 / $1,100,000,000"): $980.4M / $1.1B
		txt = tx("TRAY_BUDGET") % [CbRegion.money(float(bud.get("spent", 0.0)), true, 0), CbRegion.money(float(bud.get("capexLimit", 0.0)), true, 0)]; tw = mono.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz).x
	while tw > TAG_W - 30.0 and fsz > 10: fsz -= 1; tw = mono.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz).x
	var w := TAG_W; var h := 62.0
	var org := Vector2(size.x - PAD - w, 17.0) if _tag_inline else Vector2(size.x - PAD - w, -h - 6.0)
	draw_set_transform(org + Vector2(w, 0.0) * 0.5, deg_to_rad(-1.6), Vector2.ONE)
	draw_style_box(GridTheme.paper_sb(3, 0.0), Rect2(Vector2(-w * 0.5, 0.0), Vector2(w, h)))
	draw_circle(Vector2(-w * 0.5 + 13.0, 13.0), 4.0, GridTheme.INK)
	draw_circle(Vector2(-w * 0.5 + 13.0, 13.0), 4.0, Color(GridTheme.PAPER_INK, 0.6), false, 1.0)
	draw_arc(Vector2(-w * 0.5 + 13.0, 13.0), 8.0, PI * 0.9, PI * 2.4, 14, Color(GridTheme.SODIUM_DIM, 0.9), 1.6)
	GridText.ds(self, semi, Vector2(-w * 0.5 + 26.0, 20.0), tx("TRAY_BUDGET_CAP"), HORIZONTAL_ALIGNMENT_LEFT, -1, GridTheme.fs(11), Color(GridTheme.PAPER_INK, 0.7))
	GridText.ds(self, mono, Vector2(-tw * 0.5 + 4.0, 47.0), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz, GridTheme.BAD.darkened(0.15) if over else GridTheme.PAPER_INK)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

## The paper chip: one line, or wrapped (a refusal is a sentence) in a box at most 620 px wide; the dot says good / thin / bad.
func _draw_chip(at: Vector2, s: String, dot: Color) -> void:
	var f := GridTheme.font("mono"); var fsz := GridTheme.fs(14)
	var vw := get_viewport_rect().size.x
	var note := ""
	if str(_note_of.get("text", "")) == s and str(_note_of.get("note", "")) != "":   # the amber salt line is drawn under the chip's own text
		note = str(_note_of.note); s = s.left(s.length() - note.length() - 1)
	var one := f.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz)
	var maxw := minf(620.0, vw - 60.0)
	var tw := one.x; var lines := 1
	if one.x > maxw or s.contains("\n"):
		var ml := f.get_multiline_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, maxw, fsz); tw = minf(ml.x, maxw); lines = maxi(1, int(round(ml.y / f.get_height(fsz))))
	var nlines := 0
	if note != "":
		var nm := f.get_multiline_string_size(note, HORIZONTAL_ALIGNMENT_LEFT, maxw, fsz); nlines = maxi(1, int(round(nm.y / f.get_height(fsz)))); tw = maxf(tw, minf(nm.x, maxw))
	var dw := 18.0 if dot.a > 0.0 else 0.0
	var gx := clampf(global_position.x + at.x, tw * 0.5 + dw * 0.5 + 18.0, vw - tw * 0.5 - dw * 0.5 - 18.0)
	var x := gx - global_position.x
	var bh := f.get_height(fsz) * (lines + nlines) + 12.0
	var rect := Rect2(Vector2(x - (tw + dw) * 0.5 - 10.0, at.y - bh - 4.0), Vector2(tw + dw + 20.0, bh))
	draw_style_box(GridTheme.paper_sb(4, 0.0), rect)
	draw_colored_polygon(PackedVector2Array([Vector2(x - 6.0, rect.end.y - 1.0), Vector2(x + 6.0, rect.end.y - 1.0), Vector2(x, rect.end.y + 7.0)]), GridTheme.PAPER)
	var tx0 := rect.position.x + 10.0
	if dw > 0.0:
		draw_circle(Vector2(tx0 + 6.0, rect.position.y + 6.0 + f.get_height(fsz) * 0.5), 6.0, dot); draw_arc(Vector2(tx0 + 6.0, rect.position.y + 6.0 + f.get_height(fsz) * 0.5), 6.0, 0.0, TAU, 16, GridTheme.PAPER_INK, 1.3)
	tx0 += dw
	GridText.dm(self, f, Vector2(tx0, rect.position.y + 6.0 + f.get_ascent(fsz)), s, HORIZONTAL_ALIGNMENT_LEFT, tw + 2.0 if lines > 1 else -1.0, fsz, -1, GridTheme.PAPER_INK)
	if note != "": GridText.dm(self, f, Vector2(tx0, rect.position.y + 6.0 + f.get_ascent(fsz) + f.get_height(fsz) * lines), note, HORIZONTAL_ALIGNMENT_LEFT, tw + 2.0, fsz, -1, Color("#9A5200"))

# ---- icons ----------------------------------------------------------------------------------------------------------------------------
func _icon_survey(c: Vector2) -> void:
	# a pencil leaning on a map pin
	var pin := c + Vector2(-8.0, 2.0)
	draw_colored_polygon(PackedVector2Array([pin + Vector2(-9, -6), pin + Vector2(9, -6), pin + Vector2(0, 17)]), GridTheme.SODIUM)
	draw_circle(pin + Vector2(0, -8.0), 10.0, GridTheme.SODIUM); draw_circle(pin + Vector2(0, -8.0), 4.0, GridTheme.NIGHT)
	var a := c + Vector2(4.0, 14.0); var z := c + Vector2(22.0, -12.0)
	draw_line(a, z, Color("#E8C547"), 6.0); draw_line(a, a.lerp(z, 0.18), Color("#E9D6B0"), 6.0)
	draw_line(a + Vector2(-1.5, 2.5), a, Color("#2A2418"), 2.0)
	draw_line(z, z + Vector2(2.5, -3.5), Color("#C77B7B"), 6.0)

func _icon_pole(c: Vector2, fam: String) -> void:
	var ground := c.y + 18.0
	var hgt := {"wood-9": 34.0, "pcc-11": 40.0, "tubular-13": 46.0}.get(fam, 34.0) as float
	var top := ground - hgt
	draw_line(Vector2(c.x - 16.0, ground), Vector2(c.x + 16.0, ground), Color(GridTheme.SODIUM_DIM, 0.5), 1.5)
	match fam:
		"wood-9":
			draw_rect(Rect2(c.x - 2.2, top, 4.4, hgt), Color("#8A6A43")); draw_rect(Rect2(c.x - 2.2, top, 1.6, hgt), Color("#B08A58"))
			draw_line(Vector2(c.x - 12.0, top + 4.0), Vector2(c.x + 12.0, top + 4.0), Color("#6C5230"), 2.5)
		"pcc-11":
			draw_colored_polygon(PackedVector2Array([Vector2(c.x - 1.8, top), Vector2(c.x + 1.8, top), Vector2(c.x + 3.6, ground), Vector2(c.x - 3.6, ground)]), Color("#A9ADB3"))
			draw_line(Vector2(c.x - 2.0, top + 2.0), Vector2(c.x - 3.2, ground), Color("#D2D5DA"), 1.2)
			draw_line(Vector2(c.x - 13.0, top + 4.0), Vector2(c.x + 13.0, top + 4.0), Color("#7C8088"), 2.5)
		_:
			draw_colored_polygon(PackedVector2Array([Vector2(c.x - 1.4, top), Vector2(c.x + 1.4, top), Vector2(c.x + 3.0, ground), Vector2(c.x - 3.0, ground)]), Color("#C5CCD6"))
			draw_line(Vector2(c.x - 1.0, top + 1.0), Vector2(c.x - 2.4, ground), Color("#F1F4F8"), 1.4)
			draw_line(Vector2(c.x - 14.0, top + 3.0), Vector2(c.x + 14.0, top + 3.0), Color("#9AA3AF"), 2.5)
	for s in [-1.0, 0.0, 1.0]: draw_circle(Vector2(c.x + s * 10.0, top + 2.0), 1.6, GridTheme.COPPER)

func _icon_crossing(c: Vector2, id: String) -> void:
	var ground := c.y + 18.0
	if id == "none":
		draw_arc(c + Vector2(0, 2.0), 16.0, 0.0, TAU, 28, Color(GridTheme.DIM, 0.7), 2.0)
		draw_line(c + Vector2(-11.0, 13.0), c + Vector2(11.0, -9.0), Color(GridTheme.DIM, 0.7), 2.0)
		return
	draw_rect(Rect2(c.x - 22.0, ground - 3.0, 44.0, 5.0), Color(GridTheme.LIVE, 0.28))   # the river it crosses
	if id == "crossing-h":
		for s in [-1.0, 1.0]: draw_rect(Rect2(c.x + s * 9.0 - 2.0, ground - 36.0, 4.0, 36.0), Color("#8E99A8"))
		draw_line(Vector2(c.x - 14.0, ground - 33.0), Vector2(c.x + 14.0, ground - 33.0), Color("#6F7A8A"), 3.0)
		draw_line(Vector2(c.x - 9.0, ground - 6.0), Vector2(c.x + 9.0, ground - 26.0), Color("#6F7A8A"), 1.5); draw_line(Vector2(c.x + 9.0, ground - 6.0), Vector2(c.x - 9.0, ground - 26.0), Color("#6F7A8A"), 1.5)
	else:
		for s in [-1.0, 1.0]:
			draw_colored_polygon(PackedVector2Array([Vector2(c.x + s * 12.0 - 1.3, ground - 46.0), Vector2(c.x + s * 12.0 + 1.3, ground - 46.0), Vector2(c.x + s * 12.0 + 3.0, ground), Vector2(c.x + s * 12.0 - 3.0, ground)]), Color("#C5CCD6"))
		draw_line(Vector2(c.x - 12.0, ground - 44.0), Vector2(c.x + 12.0, ground - 44.0), Color("#9AA3AF"), 2.5)
	draw_polyline(PackedVector2Array([Vector2(c.x - 21.0, ground - 20.0), Vector2(c.x - 9.0, ground - 31.0), Vector2(c.x + 9.0, ground - 31.0), Vector2(c.x + 21.0, ground - 20.0)]), Color(GridTheme.COPPER, 0.8), 1.5)

func _icon_kv(c: Vector2, kv: float) -> void:   # a lightning bolt: one stroke at low voltage, a doubled one at high
	var col := GridTheme.SODIUM if kv >= 1.0 else GridTheme.TEXT
	var bolt := PackedVector2Array([c + Vector2(4, -16), c + Vector2(-6, 1), c + Vector2(1, 1), c + Vector2(-4, 16), c + Vector2(7, -3), c + Vector2(0, -3), c + Vector2(4, -16)])
	draw_colored_polygon(bolt, Color(col, 0.9))
	if kv >= 1.0: draw_polyline(PackedVector2Array([c + Vector2(13, -12), c + Vector2(9, -2), c + Vector2(14, -2), c + Vector2(10, 9)]), col, 2.0)

func _icon_span(c: Vector2, m: int) -> void:
	var mono := GridTheme.font("mono")
	var s := tx("RT_SPAN_M") % str(m); var fsz := GridTheme.fs(15)
	var tw := mono.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz).x
	GridText.ds(self, mono, Vector2(c.x - tw * 0.5, c.y + 1.0), s, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz, GridTheme.SODIUM)
	var y := c.y + 12.0
	for sx in [-1.0, 1.0]: draw_line(Vector2(c.x + sx * 21.0, y - 6.0), Vector2(c.x + sx * 21.0, y + 6.0), GridTheme.PAPER, 2.0)
	draw_line(Vector2(c.x - 21.0, y), Vector2(c.x + 21.0, y), GridTheme.PAPER, 1.5)
	for sx in [-1.0, 1.0]: draw_colored_polygon(PackedVector2Array([Vector2(c.x + sx * 21.0, y), Vector2(c.x + sx * 15.0, y - 3.0), Vector2(c.x + sx * 15.0, y + 3.0)]), GridTheme.PAPER)
	var a := allowed_spans(); var n := a.size()   # one dot per allowed span, the chosen one lit: the knob wraps, and now it shows where it is in the list
	for j in n:
		var on := int(a[j]) == m
		draw_circle(Vector2(c.x - 18.0 + 36.0 * j / maxf(n - 1, 1), y + 8.0), 2.6 if on else 1.6, GridTheme.SODIUM if on else Color(GridTheme.PAPER, 0.5))

func _icon_xfmr(c: Vector2, on: bool) -> void:
	draw_rect(Rect2(c.x - 2.2, c.y - 16.0, 4.4, 36.0), Color("#8A6A43"))
	draw_line(Vector2(c.x - 14.0, c.y - 14.0), Vector2(c.x + 14.0, c.y - 14.0), Color("#6C5230"), 2.5)
	var can := Rect2(c.x - 9.0, c.y - 8.0, 18.0, 22.0)
	draw_rect(can, Color("#7F8A98")); draw_rect(can, GridTheme.NIGHT, false, 1.5)
	for k in 3: draw_line(Vector2(can.position.x + 1.0, can.position.y + 6.0 + k * 5.0), Vector2(can.end.x - 1.0, can.position.y + 6.0 + k * 5.0), Color("#5E6874"), 1.0)
	draw_rect(Rect2(c.x - 9.0, c.y - 11.0, 18.0, 3.5), Color("#9AA6B2"))
	for s in [-1.0, 1.0]:
		draw_line(Vector2(c.x + s * 5.0, c.y - 11.0), Vector2(c.x + s * 5.0, c.y - 16.0), Color("#D8C9A0"), 2.0)
	draw_circle(Vector2(c.x, c.y + 4.0), 2.2, GridTheme.SODIUM if on else GridTheme.SODIUM_DIM)

## A conductor reel: wooden flanges, a coil of metal whose thickness is proportional to the square root of the area, and the wire's tail.
static func reel_core_px(mm2: float) -> float: return 0.95 * sqrt(mm2)

func _icon_reel(c: Vector2, mm2: float) -> void:
	var R := 22.0; var hub := 5.0
	var t := reel_core_px(mm2)
	draw_circle(c, R, Color("#4A3A28")); draw_arc(c, R - 1.0, 0.0, TAU, 40, Color("#7A5E3C"), 2.0)
	for k in 8: var a := TAU * k / 8.0; draw_line(c + Vector2(cos(a), sin(a)) * (hub + 1.0), c + Vector2(cos(a), sin(a)) * (R - 3.0), Color("#5C4930"), 1.0)
	draw_arc(c, hub + t * 0.5, 0.0, TAU, 48, Color("#B9C0C9"), t)
	draw_arc(c, hub + t * 0.5, 0.0, TAU, 48, Color("#F1F4F8", 0.5), maxf(1.0, t * 0.22))
	var rings := maxi(2, int(t / 3.0))
	for k in rings: draw_arc(c, hub + t * (float(k) + 0.5) / float(rings), 0.0, TAU, 48, Color("#6A727D", 0.6), 1.0)
	draw_arc(c, hub + t, 0.0, TAU, 48, Color("#6A727D"), 1.0)
	draw_circle(c, hub, GridTheme.NIGHT); draw_circle(c, 2.2, GridTheme.SODIUM_DIM)
	var tw := maxf(2.0, t * 0.5)
	var p0 := c + Vector2(hub + t - 1.0, 2.0); var p1 := c + Vector2(R + 3.0, R * 0.3); var p2 := c + Vector2(R + 3.0, R * 0.78)
	draw_polyline(PackedVector2Array([p0, p1, p2]), Color("#1C1712"), tw + 2.0, true)
	draw_polyline(PackedVector2Array([p0, p1, p2]), Color("#B9C0C9"), tw, true)
	draw_circle(p2, tw * 0.5 + 0.5, Color("#F1F4F8")); draw_arc(p2, tw * 0.5 + 0.5, 0.0, TAU, 12, Color("#1C1712"), 1.0)

## An insulator on a crossarm: a pin (one porcelain skirt stack on top of the arm), a two-disc string (hangs under the arm), a fog disc (one wide deep-skirted disc).
## `coast`: the same part with a wave under it, because that cell applies where the salt reaches.
func _icon_insulator(c: Vector2, id: String, coast: bool) -> void:
	var por := Color("#E9E2D0"); var por_d := Color("#9C9484"); var iron := Color("#7C8794")
	var arm_y := c.y - 12.0 if id != "pin" else c.y + 9.0
	draw_rect(Rect2(c.x - 19.0, arm_y - 2.0, 38.0, 4.0), Color("#6B5236"))   # the crossarm
	match id:
		"pin":
			draw_rect(Rect2(c.x - 1.5, arm_y - 6.0, 3.0, 5.0), iron)
			for k in 3:
				var w := 6.0 + 3.5 * (2 - k); var y := arm_y - 8.0 - 5.0 * k
				draw_rect(Rect2(c.x - w * 0.5, y - 4.0, w, 4.0), por); draw_rect(Rect2(c.x - w * 0.5, y - 1.0, w, 1.0), por_d)
			draw_line(Vector2(c.x, arm_y - 24.0), Vector2(c.x, arm_y - 27.0), Color("#B9C0C9"), 2.0)
		"disc2", "fog1":
			var n := 2 if id == "disc2" else 1
			var w := 17.0 if id == "disc2" else 30.0; var h := 5.0 if id == "disc2" else 9.0
			var y := arm_y + 2.0
			draw_line(Vector2(c.x, y), Vector2(c.x, y + 3.0), iron, 2.0); y += 3.0
			for k in n:
				draw_colored_polygon(PackedVector2Array([Vector2(c.x - w * 0.22, y), Vector2(c.x + w * 0.22, y), Vector2(c.x + w * 0.5, y + h), Vector2(c.x - w * 0.5, y + h)]), por)
				draw_line(Vector2(c.x - w * 0.5, y + h), Vector2(c.x + w * 0.5, y + h), por_d, 1.4)
				if id == "fog1":   # the deep skirt: ribs underneath, longer creepage
					for r in [-0.28, 0.0, 0.28]: draw_line(Vector2(c.x + w * r, y + h), Vector2(c.x + w * r, y + h + 4.0), por_d, 1.4)
				y += h + 1.5
			draw_line(Vector2(c.x, y), Vector2(c.x, y + 3.0), Color("#B9C0C9"), 2.0)
	if coast:
		for k in 2:
			var pts := PackedVector2Array(); var wy := c.y + 20.0 + 3.0 * k
			for i in 9: pts.append(Vector2(c.x - 20.0 + i * 5.0, wy + (2.0 if i % 2 == 0 else -2.0)))
			draw_polyline(pts, Color("#5FA8D3", 0.9 - 0.3 * k), 1.6)


## A sea cable cell: the reel (its copper coil thickens with the square root of the area, as on the overhead reels) lying on a few waves; the water line is what tells it from the poles' reels.
func _icon_sea(c: Vector2, mm2: float) -> void:
	draw_set_transform(c + Vector2(0.0, -7.0), 0.0, Vector2(0.74, 0.74))   # a smaller reel: this cell prints three lines under it
	_icon_reel(Vector2.ZERO, mm2)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	for k in 3:
		var pts := PackedVector2Array(); var wy := c.y + 8.0 + 4.0 * k
		for i in 11: pts.append(Vector2(c.x - 25.0 + i * 5.0, wy + (2.0 if i % 2 == 0 else -2.0)))
		draw_polyline(pts, Color("#5FA8D3", 0.95 - 0.25 * k), 2.0 if k == 0 else 1.5)

## An island battery cell: a cell stack whose fill is the kWh (against the largest pack) beside a small inverter box whose size is the kW (against the largest inverter).
func _icon_battery(c: Vector2, kw: float, kwh: float) -> void:
	var body := Rect2(c.x - 22.0, c.y - 16.0, 22.0, 34.0)
	draw_rect(Rect2(body.position.x + 7.0, body.position.y - 3.0, 8.0, 3.0), Color("#9AA6B2"))   # the terminal
	draw_rect(body, Color(GridTheme.NIGHT, 0.9)); draw_rect(body, Color("#9AA6B2"), false, 1.8)
	var f := clampf(kwh / ISL_MAX_KWH, 0.08, 1.0); var inner := Rect2(body.position + Vector2(3.0, 3.0), body.size - Vector2(6.0, 6.0))
	var fh := inner.size.y * f
	draw_rect(Rect2(inner.position.x, inner.end.y - fh, inner.size.x, fh), GridTheme.SODIUM.lerp(GridTheme.GOOD, 0.35))
	for k in range(1, 4): draw_line(Vector2(inner.position.x, inner.position.y + inner.size.y * k * 0.25), Vector2(inner.end.x, inner.position.y + inner.size.y * k * 0.25), Color(GridTheme.NIGHT, 0.55), 1.0)
	var side := 8.0 + 14.0 * clampf(kw / ISL_MAX_KW, 0.1, 1.0)   # the inverter: a box, bigger for more kW, with a sine on its face
	var inv := Rect2(c.x + 6.0, c.y + 18.0 - side, side, side)
	draw_rect(inv, Color("#7F8A98")); draw_rect(inv, Color(GridTheme.NIGHT, 0.9), false, 1.5)
	var pts := PackedVector2Array()
	for i in 9: pts.append(Vector2(inv.position.x + inv.size.x * (0.15 + 0.7 * float(i) / 8.0), inv.position.y + inv.size.y * (0.5 - 0.22 * sin(TAU * float(i) / 8.0))))
	draw_polyline(pts, GridTheme.SODIUM, 1.4)
	draw_line(Vector2(inv.position.x + side * 0.5, inv.position.y), Vector2(inv.position.x + side * 0.5, inv.position.y - 5.0), Color("#D8C9A0"), 2.0)   # the lead to the bus
