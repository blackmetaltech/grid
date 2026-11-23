class_name KitTray
extends Control
## The kit tray (UI.md 3): a low ink shelf bottom-centre with physical items, only what the level allows: the battery hut, a junction box or
## converter pair, one copper reel per cable size (core thickness ∝ √area), and a paper price tag "spent / budget" at the right end.
## Pick the hut and its legal sites light up as pegs on the beach; pick a reel and the cable is laid (L02: then pick the run). Hovering a reel or a
## peg asks the engine (`benchPreview`) and shows a ghost needle on the voltmeter and a paper chip "→ 44.0 V · US$ 1 650". Every action goes through
## the bridge; a refusal is a SYS line on the radio. Display and input only: no physics here.
## Input: mouse / touch (tap item, tap peg), pad (LB/RB cycle, A pick or place, B cancel, D-pad moves along pegs, Y opens a tag), keyboard
## (1..9 items, H hut, Tab / Enter along pegs, Esc cancel).

signal mode_changed(mode: String)
const H := 96.0
const PAD := 12.0
const BIG_W := 116.0   # 1.9: prices at the 16 px floor (was 92)
const GAP := 6.0
const WIDE := 900.0                 ## tray width from which the price tag sits inline at the right end
const TAG_W := 176.0

var b                               ## CbBridge
var world: WorldView
var radio: RadioLog
var instruments: Instruments
var sfx := Callable()               ## (cue: String), optional
var tags                            ## TagView (so Y can open one), optional
var slot := Callable()              ## () -> Rect2 the tray stands in (GridChrome.tray_rect)
var locked := Callable()            ## () -> bool: the night runs or the level is over, so the cable cannot change

var items: Array = []               ## {kind: hut|junction|converters|reel, mm2, label, sub, rect (local)}
var mode := ""                      ## "" | "hut" | "reel"
var armed_mm2 := 0.0                ## reel mode (L02): the size waiting for a run
var targets: Array = []             ## pegs on the map: {tile, label, args (action args or run id), key}
var target_hi := -1
var hover := -1                     ## tray item under the pointer
var focus := -1                     ## pad / keyboard focus
var engaged := false                ## pad cycling started (A then picks the focused item)
var level := ""
var scenario := ""
var info := {}                      ## levelInfo
var kit := {}                       ## benchKit
var bench := {}                     ## benchStatus.bench (hutM, cableMm2, topology, converters)
var preview := {}                   ## last benchPreview result
var chip_text := ""
var chip_at := Vector2.ZERO         ## chip anchor, tray-local (bottom centre of the chip)
var ghost_v := NAN
var _scroll := 0.0
var _max_scroll := 0.0
var _press_idx := -1
var _press_x := 0.0
var _dragged := false
var _tag_inline := true
var _t := 0.0

func _init() -> void:
	name = "KitTray"; mouse_filter = Control.MOUSE_FILTER_STOP; focus_mode = Control.FOCUS_NONE; visible = false
	mouse_exited.connect(func(): hover = -1; _after_hover())
	TrayStrings.load_strings()

func tx(key: String) -> String: return TranslationServer.translate(key)

# ---- state from the engine ------------------------------------------------------------------------------------------------------------
func active() -> bool: return visible

## Engine state changed: re-read what the level allows and the prices; rebuild the items.
func refresh() -> void:
	if b == null: return
	var li = b.q("levelInfo")
	var kt = b.q("benchKit")
	var on: bool = li is Dictionary and li.get("active", false) and str(li.get("kind", "")) == "bench" and kt is Dictionary and kt.get("active", false)
	if not on:
		if visible: _clear_all()
		visible = false; level = ""; return
	info = li; kit = kt
	var bs = b.q("benchStatus")
	bench = (bs.bench as Dictionary) if bs is Dictionary and bs.get("active", false) else {}
	scenario = str(bench.get("scenario", ""))
	if str(info.id) != level:
		_clear_all(); level = str(info.id); _scroll = 0.0; focus = -1; engaged = false
	visible = true
	_build_items()
	if mode == "reel": _show_targets()   # topology may have changed the runs
	elif mode == "hut": _show_targets()
	layout(); _layout_items(); _update_preview(); queue_redraw()

func _clear_all() -> void:
	mode = ""; targets = []; target_hi = -1; hover = -1; chip_text = ""; _set_ghost(NAN)
	if world != null: world.set_site_pegs([], -1)

func _parts_for(action: String) -> Array:
	var pal = b.q("palette")
	if pal is Dictionary and pal.get("active", false):
		for a in pal.actions: if str(a.action) == action: return a.parts
	return []

func _build_items() -> void:
	var acts: Array = info.allowedActions
	var out: Array = []
	if acts.has("placeHut"): out.append({"kind": "hut"})
	if acts.has("placeJunction"): out.append({"kind": "junction"})
	if acts.has("placeConverters"): out.append({"kind": "converters"})
	if acts.has("layCable"):
		var parts := _parts_for("layCable")
		for c in kit.cables:
			var ok := parts.is_empty()
			for p in parts: if is_equal_approx(float(p), float(c.mm2)): ok = true
			if ok: out.append({"kind": "reel", "mm2": float(c.mm2), "price": str(c.perMText), "amps": float(c.ampacityA)})
	items = out

func _pole_text() -> String: return CbRegion.money(float(kit.polePrice), false, 0)
func _pair_text() -> String: return CbRegion.money(2.0 * float(kit.converterPrice), false, 0)   # whole dollars: it has to fit under an 80 px cell
func mm2_text(v: float) -> String: return str(int(v)) if is_equal_approx(v, round(v)) else str(v)

func _laid_sizes() -> Array:
	var a: Array = []
	var cm: Dictionary = bench.get("cableMm2", {})
	for k in cm: if cm[k] != null: a.append(float(cm[k]))
	return a

func item_index(kind: String, mm2 := 0.0) -> int:
	for i in items.size():
		if items[i].kind == kind and (kind != "reel" or is_equal_approx(float(items[i].mm2), mm2)): return i
	return -1

# ---- layout ---------------------------------------------------------------------------------------------------------------------------
func layout() -> void:
	if not slot.is_valid(): return
	var r: Rect2 = slot.call()
	var w := minf(r.size.x, 1120.0)   # a wide screen does not stretch the shelf: it stays centred in its slot
	position = Vector2(r.position.x + (r.size.x - w) * 0.5, r.position.y); size = Vector2(w, H)
	_layout_items(); queue_redraw()

func _layout_items() -> void:
	var w := size.x
	_tag_inline = w >= WIDE
	var avail := w - PAD * 2.0 - (TAG_W + GAP if _tag_inline else 0.0)
	var n_big := 0; var n_reel := 0
	for it in items:
		if it.kind == "reel": n_reel += 1
		else: n_big += 1
	var reel_w := 78.0
	var fit := (avail - n_big * (BIG_W + GAP)) / maxf(n_reel, 1) - GAP
	# 1.18 (Sigrid r7-i): a reel is never narrower than its price at the 16 px floor, so prices never run together; the strip scrolls instead
	var price_w := 54.0; var mono := GridTheme.font("mono")
	for it in items:
		if it.kind == "reel": price_w = maxf(price_w, mono.get_string_size(tx("TRAY_PER_M") % str(it.price).trim_suffix(".00"), HORIZONTAL_ALIGNMENT_LEFT, -1, GridTheme.fs(11)).x + 8.0)
	reel_w = clampf(fit, maxf(price_w, hit_min()), maxf(78.0, price_w))
	var x := PAD - _scroll
	var total := 0.0
	for it in items:
		var cw: float = reel_w if it.kind == "reel" else BIG_W
		it["rect"] = Rect2(Vector2(x, 5.0), Vector2(cw, H - 10.0)); x += cw + GAP; total += cw + GAP
	_max_scroll = maxf(0.0, total - GAP - avail)
	_scroll = clampf(_scroll, 0.0, _max_scroll)

## Smallest tap target in logical px: 48 dp at least on a phone (CbLayout.tap() is the core's 7 mm figure, already in logical px).
func hit_min() -> float: return maxf(48.0, CbLayout.tap()) if CbLayout.kind == "phone" else 0.0

func _avail_right() -> float: return size.x - PAD - (TAG_W + GAP if _tag_inline else 0.0)

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
	for i in items.size():
		if (items[i].rect as Rect2).has_point(p) and _visible_item(i): return i
	return -1

# ---- picking ----------------------------------------------------------------------------------------------------------------------------
func cancel() -> bool:
	if mode == "": return false
	mode = ""; armed_mm2 = 0.0; targets = []; target_hi = -1; chip_text = ""
	if world != null: world.set_site_pegs([], -1)
	_set_ghost(NAN); mode_changed.emit(""); queue_redraw()
	return true

## Activate a tray item (click, tap, pad A, a number key).
func activate(i: int) -> void:
	if i < 0 or i >= items.size(): return
	var it: Dictionary = items[i]
	if is_locked(): refuse_locked(); return
	if tags != null: tags.close()
	match str(it.kind):
		"hut":
			if mode == "hut": cancel(); return
			cancel(); mode = "hut"; _show_targets(); mode_changed.emit(mode)
		"junction": cancel(); _act("placeJunction", [])
		"converters": cancel(); _act("placeConverters", [not bool(bench.get("converters", false))])
		"reel":
			var mm2 := float(it.mm2)
			var runs := run_choices()
			if runs.size() <= 1:
				cancel(); _act("layCable", [runs[0] if not runs.is_empty() else "main", mm2])
			else:
				if mode == "reel" and is_equal_approx(armed_mm2, mm2): queue_redraw(); return   # a second tap keeps the reel selected
				cancel(); mode = "reel"; armed_mm2 = mm2; _show_targets(); mode_changed.emit(mode)
	queue_redraw()

func is_locked() -> bool: return locked.is_valid() and bool(locked.call())

## While the night runs (or the level is over) nothing laid may change: say so on the radio and keep the cable.
func refuse_locked() -> void:
	cancel()
	if radio != null: radio.say("SYS", tx("TRAY_LOCKED") if b == null or str(b.g.get("status", "playing")) == "playing" else tx("GT_LOCKED_ENDED"), "warn")   # after the job ends the way back is Retry, not a pause

## The cable runs the player chooses between: L02 radial or trunk -> two (main, b); L01 and L03 one.
func run_choices() -> Array:
	return ["main", "b"] if scenario == "l02" else ["main"]

func _run_label(id: String) -> String:
	var trunk := str(bench.get("topology", "")) == "trunk"
	if id == "main": return tx("RUN_TRUNK" if trunk else "RUN_H1")
	return tx("RUN_BRANCHES" if trunk else "RUN_H2")

## Build the pegs of the current mode on the map.
func _show_targets() -> void:
	targets = []
	if mode == "hut":
		for o in _site_options("hut"):
			var d := int(str(o).get_slice("-", 1))
			targets.append({"tile": WorldModel.l01_hut_pos(float(d)), "label": tx("PEG_M") % str(d), "key": d})
	elif mode == "reel":
		for id in ["main", "b"]:
			var vis: String = "b" if str(bench.get("topology", "")) == "trunk" and id == "b" else id
			targets.append({"tile": world.run_mid_tile(vis), "label": _run_label(id), "key": id})
	if target_hi >= targets.size(): target_hi = -1
	if world != null: world.set_site_pegs(targets, target_hi)

func _site_options(site_id: String) -> Array:
	for s in info.get("sites", []): if str(s.id) == site_id: return s.options
	return []

## Hover / pad highlight of a peg (and its preview).
func set_target_hi(i: int) -> void:
	target_hi = i if i >= 0 and i < targets.size() else -1
	if world != null: world.set_site_pegs(targets, target_hi)
	_update_preview(); queue_redraw()

func place_target(i: int) -> Dictionary:
	if i < 0 or i >= targets.size(): return {}
	if is_locked(): refuse_locked(); return {}
	var t: Dictionary = targets[i]
	if mode == "hut":
		var r := _act("placeHut", [float(t.key)])
		if r.get("ok", false): cancel()
		return r
	if mode == "reel":
		return _act("layCable", [str(t.key), armed_mm2])   # stays armed: the other run takes the same reel
	return {}

func _act(name: String, args: Array) -> Dictionary:
	var r: Dictionary = b.act(name, args)
	if r.get("ok", false):
		if sfx.is_valid(): sfx.call("reel" if name == "layCable" else "place")
	elif radio != null: radio.say("SYS", str(r.get("message", "")), "warn")
	return r

## A tap on the world (local coordinates). Returns true when the tray used it.
func on_tap(pos: Vector2) -> bool:
	if mode == "" or world == null: return false
	var p: Dictionary = _pick(pos)
	var k := str(p.get("kind", ""))
	if k == "peg": place_target(int(p.id)); return true
	if mode == "reel" and (k == "cable" or k == "route"):
		var id := str(p.id); var run := "main" if id == "main" else "b"
		for i in targets.size(): if str(targets[i].key) == run: place_target(i); return true
	cancel()
	return p.is_empty()

## world.pick, with pegs given a >= 48 dp circle on a phone / touch screen.
func _pick(pos: Vector2) -> Dictionary:
	var p: Dictionary = world.pick(pos)
	if not p.is_empty() and str(p.get("kind", "")) == "peg": return p
	if CbLayout.touch or CbLayout.kind == "phone":
		var r := maxf(24.0, maxf(48.0, CbLayout.tap()) * 0.5); var best := -1; var bd := 1e9
		for i in targets.size():
			var d := pos.distance_to(world.world_to_screen(targets[i].tile, 10.0))
			if d <= r and d < bd: bd = d; best = i
		if best >= 0: return {"kind": "peg", "id": best}
	return p

func on_hover(pos: Vector2) -> void:
	if mode == "" or world == null: return
	var p: Dictionary = _pick(pos)
	var k := str(p.get("kind", "")); var hi := -1
	if k == "peg": hi = int(p.id)
	elif mode == "reel" and (k == "cable" or k == "route"):
		var run := "main" if str(p.id) == "main" else "b"
		for i in targets.size(): if str(targets[i].key) == run: hi = i
	if hi != target_hi: set_target_hi(hi)

# ---- preview (engine what-if) ----------------------------------------------------------------------------------------------------------
func _preview_args() -> Dictionary:
	if mode != "" and target_hi >= 0:
		var t: Dictionary = targets[target_hi]
		if mode == "hut":
			var a := {"hutM": float(t.key)}
			var cur = bench.get("cableMm2", {}).get("main")
			if cur != null: a["mm2"] = float(cur)
			return a
		return {"mm2": armed_mm2, "run": str(t.key)}
	var i := preview_item()
	if i >= 0 and items[i].kind == "reel":
		var cm: Dictionary = bench.get("cableMm2", {})
		var run := "main" if scenario != "l02" or cm.get("main") == null else "b"
		return {"mm2": float(items[i].mm2), "run": run}
	return {}

## The item whose what-if shows: the one under the mouse, else the pad / keyboard focus.
func preview_item() -> int:
	if hover >= 0: return hover
	if engaged and focus >= 0: return focus
	return -1

func _set_ghost(v: float) -> void:
	ghost_v = v
	if instruments != null: instruments.set_ghost(v)

func _update_preview() -> void:
	chip_text = ""; preview = {}
	var a := _preview_args()
	if a.is_empty() or b == null: _set_ghost(NAN); queue_redraw(); return
	var r = b.q("benchPreview", [a])
	if not (r is Dictionary): _set_ghost(NAN); return
	preview = r
	var loss: bool = instruments != null and instruments.mode == "loss"
	var money := CbRegion.money(float(r.get("capexUSD", 0.0)))
	var ok: bool = r.get("ok", false)
	var site := a.has("hutM")
	var dist := str(int(a.get("hutM", 0.0)))
	if ok:
		var val := "%.1f" % (float(r.lossPct) if loss else float(r.vMinV))
		if site: chip_text = tx("CHIP_SITE_LOSS" if loss else "CHIP_SITE_V") % [dist, val, money]
		else: chip_text = tx("CHIP_LOSS" if loss else "CHIP_V") % [val, money]
		_set_ghost(float(r.lossPct) if loss else float(r.vMinV))
	else:
		_set_ghost(NAN)
		if str(r.get("reason", "")) == "bench.hutFirst": chip_text = tx("CHIP_NEEDS_HUT")
		elif site: chip_text = tx("CHIP_SITE") % dist
		elif float(r.get("capexUSD", 0.0)) > 0.0: chip_text = tx("CHIP_COST") % money
	_chip_anchor()
	queue_redraw()

## Anchor of the chip, tray-local: above the reel, or above the peg on the map (follows the camera).
func _chip_anchor() -> void:
	if mode != "" and target_hi >= 0 and world != null and is_inside_tree() and world.is_inside_tree():
		var wp: Vector2 = world.world_to_screen((targets[target_hi] as Dictionary).tile, 14.0 if world.get("look3d") != null else 70.0)   # 1.17: in 3D the height is metres; 70 put the tag in the sky
		chip_at = world.get_global_rect().position + wp - global_position
	else:
		var i := preview_item()
		if i >= 0: chip_at = Vector2((items[i].rect as Rect2).get_center().x, -8.0)

func _after_hover() -> void:
	_update_preview(); queue_redraw()

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
			if i >= 0: engaged = false   # the pointer takes over: one ring, under the pointer
			_after_hover()
	elif e is InputEventMouseButton:
		var mb := e as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_WHEEL_DOWN and mb.pressed and _max_scroll > 0.0: _scroll = minf(_max_scroll, _scroll + 40.0); _layout_items(); queue_redraw()
		elif mb.button_index == MOUSE_BUTTON_WHEEL_UP and mb.pressed and _max_scroll > 0.0: _scroll = maxf(0.0, _scroll - 40.0); _layout_items(); queue_redraw()
		elif mb.button_index == MOUSE_BUTTON_LEFT:
			if mb.pressed: _press_idx = _item_at(mb.position); _press_x = mb.position.x; _dragged = false
			else:
				var i := _item_at(mb.position)
				if i >= 0 and i == _press_idx and not _dragged: hover = i; activate(i); accept_event()
				elif i < 0 and not _dragged and _scroll < _max_scroll - 1.0 and GridTray.on_more_tab(mb.position, _avail_right(), PAD):   # the more-parts tab pages right
					_scroll = minf(_max_scroll, _scroll + maxf(120.0, (_avail_right() - PAD) * 0.7)); _layout_items(); queue_redraw()
				_press_idx = -1
		accept_event()

## Keys: 1..9 pick the n-th item, H the hut, Tab / Enter walk and place along the pegs. Returns true when used.
func key(e: InputEventKey) -> bool:
	if not visible or not e.pressed: return false
	if e.keycode >= KEY_1 and e.keycode <= KEY_9:
		var n := e.keycode - KEY_1
		if n < items.size(): focus = n; hover = -1; _ensure_visible(n); activate(n); _update_preview()
		return n < items.size()
	match e.keycode:
		KEY_H:
			var h := item_index("hut")
			if h >= 0: activate(h); return true
		KEY_TAB:
			if not targets.is_empty(): set_target_hi(0 if target_hi < 0 else posmod(target_hi + (-1 if e.shift_pressed else 1), targets.size())); return true
		KEY_ENTER, KEY_KP_ENTER:
			if not targets.is_empty() and target_hi >= 0: place_target(target_hi); return true
	return false

## Esc / pad B: cancel the pick, else step the pad focus out. Returns true when something was undone.
func cancel_key() -> bool:
	if cancel(): return true
	if engaged: engaged = false; queue_redraw(); return true
	return false

## Pad: LB / RB cycle the items, A picks or places, B cancels, D-pad walks the pegs, Y opens a tag. Returns true when used.
func pad_button(idx: int) -> bool:
	if not visible: return false
	match idx:
		JOY_BUTTON_LEFT_SHOULDER, JOY_BUTTON_RIGHT_SHOULDER:
			if items.is_empty(): return false
			var d := -1 if idx == JOY_BUTTON_LEFT_SHOULDER else 1
			engaged = true; hover = -1   # the ring follows the pad; a stale pointer hover must not keep a second one
			focus = (0 if d > 0 else items.size() - 1) if focus < 0 else posmod(focus + d, items.size())
			_ensure_visible(focus); _update_preview(); queue_redraw(); return true
		JOY_BUTTON_A:
			# 1.18 (hand play, Ravi on L02): the ring moved to another reel while a reel was armed; A went to the runs and laid the old reel.
			# A on a part other than the armed one picks that part first.
			if engaged and focus >= 0 and _focus_not_armed(): activate(focus); return true
			if not targets.is_empty() and target_hi >= 0: place_target(target_hi); return true
			if not targets.is_empty(): set_target_hi(0); return true
			if engaged and focus >= 0: activate(focus); return true
		JOY_BUTTON_B: return cancel_key()
		JOY_BUTTON_Y:
			if tags != null: tags.pad_cycle(); return true
		JOY_BUTTON_DPAD_LEFT, JOY_BUTTON_DPAD_UP, JOY_BUTTON_DPAD_RIGHT, JOY_BUTTON_DPAD_DOWN:
			if targets.is_empty(): return false
			var d2 := -1 if idx == JOY_BUTTON_DPAD_LEFT or idx == JOY_BUTTON_DPAD_UP else 1
			# 1.17 (hand play): walk the pegs in screen order, left to right, so RIGHT moves right whatever way the 3D camera faces
			var order: Array = range(targets.size())
			if world != null and world.has_method("world_to_screen"):
				order.sort_custom(func(a, b2): return world.world_to_screen(targets[a].tile, 10.0).x < world.world_to_screen(targets[b2].tile, 10.0).x)
			var k := order.find(target_hi)
			set_target_hi(order[(0 if d2 > 0 else order.size() - 1) if k < 0 else posmod(k + d2, order.size())]); return true
	return false

## True when the pad's ring sits on a part that is not the armed one (another reel, or anything while nothing is armed).
func _focus_not_armed() -> bool:
	var it: Dictionary = items[focus]
	match str(it.kind):
		"reel": return not (mode == "reel" and is_equal_approx(armed_mm2, float(it.mm2)))
		"hut": return mode != "hut"
	return true

func _process(dt: float) -> void:
	if not visible: return
	_t += dt
	if mode != "" and not CbSettings.reduced_motion: queue_redraw()   # the armed item breathes

# ---- drawing --------------------------------------------------------------------------------------------------------------------------
func _text(font: Font, fsz: int, at: Vector2, s: String, col: Color, centre_w := -1.0) -> void:
	var tw := font.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz).x
	var x := at.x if centre_w < 0.0 else at.x + (centre_w - tw) * 0.5
	GridText.ds(self, font, Vector2(x, at.y), s, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz, col)

func _draw() -> void:
	if not visible: return
	var shelf := Rect2(Vector2.ZERO, size)
	draw_style_box(GridTheme.ink_sb(0.94, 10, 0.0), shelf)
	draw_line(Vector2(10, 2), Vector2(size.x - 10, 2), Color(GridTheme.SODIUM_DIM, 0.35), 1.0)
	var semi := GridTheme.font("semi"); var mono := GridTheme.font("mono")
	var laid := _laid_sizes()
	for i in items.size():
		if not _visible_item(i): continue
		var it: Dictionary = items[i]; var r: Rect2 = it.rect
		var armed: bool = (str(it.kind) == "hut" and mode == "hut") or (str(it.kind) == "reel" and mode == "reel" and is_equal_approx(armed_mm2, float(it.mm2)))
		var fc := (engaged or CbKit.pad_mode) and i == focus
		var hv := i == hover and not (engaged and focus >= 0 and focus != i)
		var fill := Color(GridTheme.NIGHT, 0.55)
		if hv: fill = Color(GridTheme.INK).lightened(0.14)
		if armed: fill = Color(GridTheme.SODIUM, 0.16 + 0.06 * sin(_t * 4.0))
		var other_focus := engaged and focus >= 0 and focus != i
		draw_style_box(_cell_sb(fill, (armed and not other_focus) or hv), r)
		if fc: draw_style_box(GridTheme.focus_sb(), r)
		var c := r.position + Vector2(r.size.x * 0.5, 28.0)
		var name_s := ""; var sub_s := ""; var sub_col: Color = GridTheme.DIM
		match str(it.kind):
			"hut":
				_icon_hut(c); name_s = tx("TRAY_HUT")
				var hm = bench.get("hutM")
				sub_s = tx("TRAY_HUT_SUB_AT") % str(int(hm)) if hm != null else tx("TRAY_HUT_SUB_PICK")
				if hm != null: sub_col = GridTheme.SODIUM
			"junction":
				var on: bool = str(bench.get("topology", "")) == "trunk"
				_icon_junction(c, on); name_s = tx("TRAY_JUNCTION"); sub_s = tx("TRAY_PLACED") if on else _pole_text(); sub_col = GridTheme.SODIUM if on else GridTheme.DIM
			"converters":
				var on2: bool = bool(bench.get("converters", false))
				_icon_converters(c, on2); name_s = tx("TRAY_CONVERTERS"); sub_s = tx("TRAY_CONVERTERS_ON") if on2 else tx("TRAY_PAIR") % _pair_text(); sub_col = GridTheme.SODIUM if on2 else GridTheme.DIM
			"reel":
				_icon_reel(c, float(it.mm2)); name_s = tx("TRAY_REEL") % mm2_text(float(it.mm2)); sub_s = tx("TRAY_PER_M") % str(it.price).trim_suffix(".00")
				if laid.has(float(it.mm2)): draw_circle(r.position + Vector2(r.size.x - 9.0, 9.0), 4.0, GridTheme.SODIUM); draw_arc(r.position + Vector2(r.size.x - 9.0, 9.0), 4.0, 0, TAU, 12, GridTheme.NIGHT, 1.0)
		var nfs := 13 if str(it.kind) != "reel" else 14
		var sfs := 11
		var tw := r.size.x - 4.0
		var use_n := nfs
		while use_n > 9 and semi.get_string_size(name_s, HORIZONTAL_ALIGNMENT_LEFT, -1, GridTheme.fs(use_n)).x > tw: use_n -= 1
		_text(semi, GridTheme.fs(use_n), Vector2(r.position.x + 2.0, r.position.y + 60.0), name_s, GridTheme.TEXT if (hv or armed or fc) else Color(GridTheme.TEXT, 0.92), tw)
		var use_s := sfs
		while use_s > 8 and mono.get_string_size(sub_s, HORIZONTAL_ALIGNMENT_LEFT, -1, GridTheme.fs(use_s)).x > tw: use_s -= 1
		_text(mono, GridTheme.fs(use_s), Vector2(r.position.x + 2.0, r.position.y + 75.0), sub_s, sub_col, tw)
	if _max_scroll > 0.0:   # the strip scrolls: little chevrons at the ends
		if _scroll > 1.0: GridText.ds(self, semi, Vector2(2.0, H * 0.5 + 6.0), "‹", HORIZONTAL_ALIGNMENT_LEFT, -1, GridTheme.fs(22), GridTheme.SODIUM)
		if _scroll < _max_scroll - 1.0: GridTray.draw_more_tab(self, items, _avail_right(), PAD, H)   # the more-parts tab with its count
	_draw_price_tag()
	if mode != "": _draw_hint()
	if chip_text != "" and not is_locked():   # no stale what-if chip while the night runs or after it ended
		_chip_anchor(); _draw_chip(chip_at, chip_text)

func _cell_sb(fill: Color, lit: bool) -> StyleBoxFlat:
	if GridTheme.look2: return GridTheme.glass_cell_sb(fill, lit)
	var s := StyleBoxFlat.new(); s.bg_color = fill; s.set_corner_radius_all(7)
	s.border_color = GridTheme.SODIUM if lit else Color(GridTheme.SODIUM_DIM, 0.28); s.set_border_width_all(2 if lit else 1)
	return s

func _draw_price_tag() -> void:
	var spent := str(kit.get("spentText", "")); var budget := str(kit.get("budgetText", ""))
	var over: bool = float(kit.get("spent", 0.0)) > float(kit.get("budget", 0.0))
	var txt := tx("TRAY_BUDGET") % [spent, budget]
	var mono := GridTheme.font("mono"); var semi := GridTheme.font(GridTheme.skin_font("semi"))
	var fsz := GridTheme.fs(15)
	var tw := mono.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz).x
	while tw > TAG_W - 30.0 and fsz > 10: fsz -= 1; tw = mono.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz).x
	var w := TAG_W; var h := 62.0
	var org := Vector2(size.x - PAD - w, 17.0) if _tag_inline else Vector2(size.x - PAD - w, -h - 6.0)   # narrow trays: the tag hangs fully above the shelf, never over the reels
	var ang := deg_to_rad(GridTheme.chit_tilt())
	draw_set_transform(org + Vector2(w, 0.0) * 0.5, ang, Vector2.ONE)
	var rect := Rect2(Vector2(-w * 0.5, 0.0), Vector2(w, h))
	var sb := GridTheme.chit_sb(3, 0.0)
	draw_style_box(sb, rect)
	# a clipped corner, the eyelet and the string loop
	if not GridTheme.look2: draw_circle(Vector2(-w * 0.5 + 13.0, 13.0), 4.0, GridTheme.INK)
	if not GridTheme.look2: draw_circle(Vector2(-w * 0.5 + 13.0, 13.0), 4.0, Color(GridTheme.chit_ink(), 0.6), false, 1.0)
	if not GridTheme.look2: draw_arc(Vector2(-w * 0.5 + 13.0, 13.0), 8.0, PI * 0.9, PI * 2.4, 14, Color(GridTheme.SODIUM_DIM, 0.9), 1.6)
	GridText.ds(self, semi, Vector2(-w * 0.5 + 26.0, 20.0), tx("TRAY_BUDGET_CAP"), HORIZONTAL_ALIGNMENT_LEFT, -1, GridTheme.fs(11), GridTheme.G_DIM if GridTheme.look2 else Color(GridTheme.PAPER_INK, 0.7))
	GridText.ds(self, mono, Vector2(-tw * 0.5 + 4.0, 47.0), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz, GridTheme.BAD.darkened(0.15) if over else GridTheme.chit_ink())
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

func _draw_hint() -> void:
	var s := tx("TRAY_HINT_HUT") if mode == "hut" else tx("TRAY_HINT_REEL") % mm2_text(armed_mm2)
	if chip_text == "": _draw_chip(Vector2(size.x * 0.5, -10.0), s)

func _draw_chip(at: Vector2, s: String) -> void:
	var f := GridTheme.font("mono"); var fsz := GridTheme.fs(14)
	var tw := f.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz).x
	var vw := get_viewport_rect().size.x
	var gx := global_position.x + at.x
	gx = clampf(gx, tw * 0.5 + 18.0, vw - tw * 0.5 - 18.0)
	var x := gx - global_position.x
	var rect := Rect2(Vector2(x - tw * 0.5 - 10.0, at.y - fsz - 14.0), Vector2(tw + 20.0, fsz + 12.0))
	draw_style_box(GridTheme.chit_sb(4, 0.0), rect)
	draw_colored_polygon(PackedVector2Array([Vector2(x - 6.0, rect.end.y - 1.0), Vector2(x + 6.0, rect.end.y - 1.0), Vector2(x, rect.end.y + 7.0)]), GridTheme.chit_bg())
	GridText.ds(self, f, Vector2(x - tw * 0.5, rect.position.y + fsz + 3.0), s, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz, GridTheme.chit_ink())

# ---- icons ----------------------------------------------------------------------------------------------------------------------------
func _icon_hut(c: Vector2) -> void:
	var w := 38.0
	draw_rect(Rect2(c + Vector2(-w * 0.5, -8.0), Vector2(w, 24.0)), Color("#D9CBA6"))
	for k in 4: draw_line(c + Vector2(-w * 0.5 + 9.0 * k + 4.0, -8.0), c + Vector2(-w * 0.5 + 9.0 * k + 4.0, 16.0), Color("#B8A87F"), 1.0)
	draw_colored_polygon(PackedVector2Array([c + Vector2(-w * 0.5 - 4.0, -8.0), c + Vector2(w * 0.5 + 4.0, -8.0), c + Vector2(0, -24.0)]), Color("#8E99A8"))
	draw_colored_polygon(PackedVector2Array([c + Vector2(-6.0, -17.0), c + Vector2(8.0, -17.0), c + Vector2(6.0, -11.0), c + Vector2(-8.0, -11.0)]), Color("#2E4B8F"))
	draw_rect(Rect2(c + Vector2(-9.0, 0.0), Vector2(18.0, 10.0)), GridTheme.NIGHT)
	for k in 3: draw_rect(Rect2(c + Vector2(-7.0 + 5.0 * k, 2.0), Vector2(4.0, 6.0)), GridTheme.GOOD)
	draw_rect(Rect2(c + Vector2(9.0, 3.0), Vector2(2.0, 4.0)), GridTheme.NIGHT)

func _icon_junction(c: Vector2, on: bool) -> void:
	draw_rect(Rect2(c + Vector2(-2.5, -14.0), Vector2(5.0, 32.0)), Color("#8A6A43"))
	draw_rect(Rect2(c + Vector2(-13.0, -18.0), Vector2(26.0, 16.0)), Color("#9AA6B2")); draw_rect(Rect2(c + Vector2(-13.0, -18.0), Vector2(26.0, 16.0)), GridTheme.NIGHT, false, 1.5)
	draw_circle(c + Vector2(0, -10.0), 3.5, GridTheme.SODIUM if on else GridTheme.SODIUM_DIM)
	for s in [-1.0, 1.0]:
		draw_line(c + Vector2(13.0 * s, -10.0), c + Vector2(24.0 * s, -4.0), GridTheme.COPPER, 2.0)
		draw_line(c + Vector2(24.0 * s, -4.0), c + Vector2(26.0 * s, 8.0), GridTheme.COPPER, 2.0)
	draw_line(c + Vector2(-12.0, 10.0), c + Vector2(12.0, 10.0), Color(GridTheme.SODIUM_DIM, 0.0), 1.0)

func _icon_converters(c: Vector2, on: bool) -> void:
	var col := GridTheme.SODIUM if on else GridTheme.SODIUM_DIM
	for s in [-1.0, 1.0]:
		var r := Rect2(c + Vector2(-27.0 if s < 0.0 else 7.0, -12.0), Vector2(20.0, 24.0))
		draw_rect(r, Color("#6C7A8C")); draw_rect(r, GridTheme.NIGHT, false, 1.5)
		draw_rect(Rect2(r.position + Vector2(3, 3), Vector2(14, 6)), GridTheme.NIGHT)
		draw_line(r.position + Vector2(4, 16), r.position + Vector2(16, 16), col, 2.0)
		draw_line(r.position + Vector2(4, 20), r.position + Vector2(16, 20), col, 2.0)
	draw_line(c + Vector2(-7.0, 0.0), c + Vector2(7.0, 0.0), GridTheme.COPPER, 2.5)

## A copper reel: wooden flanges, a coil of copper whose thickness is proportional to √area, and the cable tail with its cut end.
static func reel_core_px(mm2: float) -> float: return 2.0 * sqrt(mm2)

func _icon_reel(c: Vector2, mm2: float) -> void:
	var R := 22.0; var hub := 5.0
	var t := reel_core_px(mm2)
	draw_circle(c, R, Color("#4A3A28")); draw_arc(c, R - 1.0, 0.0, TAU, 40, Color("#7A5E3C"), 2.0)
	for k in 8: var a := TAU * k / 8.0; draw_line(c + Vector2(cos(a), sin(a)) * (hub + 1.0), c + Vector2(cos(a), sin(a)) * (R - 3.0), Color("#5C4930"), 1.0)
	draw_arc(c, hub + t * 0.5, 0.0, TAU, 48, GridTheme.COPPER, t)
	draw_arc(c, hub + t * 0.5, 0.0, TAU, 48, Color("#F0B58A", 0.5), maxf(1.0, t * 0.22))
	var rings := maxi(2, int(t / 3.0))
	for k in rings: draw_arc(c, hub + t * (float(k) + 0.5) / float(rings), 0.0, TAU, 48, Color("#7A3F22", 0.55), 1.0)
	draw_arc(c, hub + t, 0.0, TAU, 48, Color("#7A3F22"), 1.0)
	draw_circle(c, hub, GridTheme.NIGHT); draw_circle(c, 2.2, GridTheme.SODIUM_DIM)
	# the tail leaves the coil at the lower right and ends in a cut face
	var tw := maxf(2.0, t * 0.6)
	var p0 := c + Vector2(hub + t - 1.0, 2.0); var p1 := c + Vector2(R + 3.0, R * 0.3); var p2 := c + Vector2(R + 3.0, R * 0.78)
	draw_polyline(PackedVector2Array([p0, p1, p2]), Color("#1C1712"), tw + 2.0, true)
	draw_polyline(PackedVector2Array([p0, p1, p2]), GridTheme.COPPER, tw, true)
	draw_circle(p2, tw * 0.5 + 0.5, Color("#F0B58A")); draw_arc(p2, tw * 0.5 + 0.5, 0.0, TAU, 12, Color("#1C1712"), 1.0)

# ---- relay: pad / Esc first, before the shell sees them -----------------------------------------------------------------------------
## The core pad node sits after the interface in the tree and would take B / Y / LB / RB first, and the shell opens its menu on Esc. This tiny node is
## added to the app after the pad, so it hears the event first and consumes what the tray and the tags use.
class Relay extends Node:
	var chrome
	func _input(e: InputEvent) -> void:
		if chrome != null and chrome.handle_input(e): get_viewport().set_input_as_handled()
