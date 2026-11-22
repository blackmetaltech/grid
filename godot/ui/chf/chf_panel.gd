class_name ChfPanel
extends PanelContainer
## The finale's card (L28, top left under the instruments): which of the three days it is and what it threatens, the clock, Saltmarsh Island's lamp (lit / on its battery / dark), the day's numbers
## and the event ticker (the engine's own log of trips, repairs and lightning), plus the parts shelf: every part the finale offers, by the threat it answers, at the engine's price,
## with nothing marked as the answer (DECISIONS 14). Display and input only.
const W := 340.0   # 1.9: the build kit at the 16 px floor (was 300)
const LEVEL := "L28"
var app: CbApp
var _sig := ""
var _box: VBoxContainer
var _day_lbl: Label
var _threat: Label
var _island: Label
var _stats: Label
var _ticker: Label
var _lamp: Control
var _kit: VBoxContainer
var _toggle: Button
var _scroll: ScrollContainer
var _open := true
var _kit_sig := ""
var _th: Label
var _skin := ""   # "paper" | "glass": LOOK2 draws the card in the glass language

## Ink for this card: dark on paper, light on glass.
func ink(a := 1.0) -> Color: return Color(GridTheme.G_TEXT if GridTheme.look2 else GridTheme.PAPER_INK, a)

func _apply_skin() -> void:
	var want := "glass" if GridTheme.look2 else "paper"
	if want == _skin: return
	_skin = want
	add_theme_stylebox_override("panel", GridTheme.glass_sb(0.74, 4, 10.0) if GridTheme.look2 else GridTheme.paper_sb(4, 10.0))
	for l in [_day_lbl, _threat, _stats, _ticker, _th]:   # labels carry LabelSettings: recolour those (a theme override does not reach them)
		var ls: LabelSettings = (l as Label).label_settings.duplicate(); ls.font_color = ink(0.7 if l == _th else 1.0)
		if l == _day_lbl: ls.font = GridTheme.font(GridTheme.skin_font("title"))
		(l as Label).label_settings = ls
	_toggle.add_theme_color_override("font_color", ink())
	_kit_sig = ""

func _init() -> void:
	name = "ChfPanel"; visible = false; mouse_filter = Control.MOUSE_FILTER_STOP
	add_theme_stylebox_override("panel", GridTheme.paper_sb(4, 10.0))
	var root := VBoxContainer.new(); root.add_theme_constant_override("separation", 2); add_child(root)
	_toggle = Button.new(); _toggle.name = "cf_toggle"; _toggle.flat = true; _toggle.focus_mode = CbKit.focus_mode(); _toggle.alignment = HORIZONTAL_ALIGNMENT_LEFT; _toggle.visible = false
	_toggle.add_theme_font_size_override("font_size", GridTheme.fs(16)); _toggle.add_theme_color_override("font_color", GridTheme.PAPER_INK)
	_toggle.pressed.connect(func(): _open = not _open; refresh())
	root.add_child(_toggle)
	_scroll = ScrollContainer.new(); _scroll.name = "cf_scroll"; _scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; _scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	root.add_child(_scroll)
	_box = VBoxContainer.new(); _box.add_theme_constant_override("separation", 4); _box.size_flags_horizontal = Control.SIZE_EXPAND_FILL; _scroll.add_child(_box)
	GridUi.load_strings()
	_day_lbl = GridTheme.label("", 22, GridTheme.PAPER_INK, "title"); _day_lbl.name = "cf_day"; _box.add_child(_day_lbl)
	_threat = _wrap("", 13); _threat.name = "cf_threat"; _box.add_child(_threat)
	_island = GridTheme.label("", 15, GridTheme.PAPER_INK, "semi"); _island.name = "cf_island"; _box.add_child(_island)
	_stats = _wrap("", 12); _stats.name = "cf_stats"; _box.add_child(_stats)
	_th = GridTheme.label(tx("CF_TICKER"), 12, Color(GridTheme.PAPER_INK, 0.7), "mono"); _box.add_child(_th)
	_ticker = _wrap("", 12); _ticker.name = "cf_ticker"; _box.add_child(_ticker)
	_kit = VBoxContainer.new(); _kit.add_theme_constant_override("separation", 3); _kit.name = "cf_kit"; _box.add_child(_kit)

func tx(k: String) -> String: return TranslationServer.translate(k)

func _wrap(t: String, fs: int) -> Label:
	var l := GridTheme.label(t, fs, GridTheme.PAPER_INK, "sans"); l.autowrap_mode = TextServer.AUTOWRAP_WORD; l.custom_minimum_size.x = W - 24.0; return l

func _g() -> Dictionary: return app.b.g

func refresh() -> void:
	if app == null or not app.started or app.b == null: visible = false; return
	var li = app.b.q("levelInfo")
	visible = li is Dictionary and li.get("active", false) and str(li.id) == LEVEL
	if not visible: return
	_apply_skin()
	var g := _g()
	var day := clampi(int(g.clock.day) + (1 if int(g.clock.block) > 0 or int(g.tick) == 0 else 0), 1, 3)
	if int(g.clock.day) == 3: day = 3
	if str(g.get("status", "playing")) != "playing" and int(g.clock.day) >= 3: _day_lbl.text = tx("CF_DONE")   # the clock rolled past Day 3's midnight: the three days are over, not "Day 3 00:00"
	else: _day_lbl.text = tx("CF_DAY") % day + "   " + tx("CF_CLOCK") % [int(g.clock.block) / 4, (int(g.clock.block) % 4) * 15]
	_threat.text = tx("CF_DAY%d" % day)
	var lamp := _island_text(g)
	var lc: Color = lamp[1]
	if GridTheme.look2: lc = {"#1e6b3a": Color("#6FD08C"), "#b02020": Color("#FF6B5B"), "#b07010": Color("#F0B050")}.get(lc.to_html(false), ink())
	_island.text = lamp[0]
	if _island.label_settings.font_color != lc: var ls2: LabelSettings = _island.label_settings.duplicate(); ls2.font_color = lc; _island.label_settings = ls2
	var tr: Dictionary = g.metrics.track
	var lim := float(g.rules.get("maxEnsMWh", 0.0))
	_stats.visible = int(g.tick) > int(g.levelStart)
	_stats.text = tx("CF_STATS") % [float(tr.get("vMinPu", 0.0)), float(tr.get("vMaxPu", 0.0)), float(g.metrics.ensMWh), lim, int(tr.get("freqDips", 0))]
	var sig := str((g.actionLog as Array).size()) + str(g.get("status", "")) + str(g.tick)
	if sig != _sig: _sig = sig; _rebuild_ticker(g)
	_rebuild_kit(g)
	_layout()

func _island_text(g: Dictionary) -> Array:
	var f: Dictionary = g.rules.get("finale", {})
	var ib := str(f.get("islandBus", ""))
	var feeders := 0; var live := 0
	for b in g.branches:
		if str(b.from) == ib or str(b.to) == ib:
			feeders += 1
			if b.inService: live += 1
	var batt = null
	for s in g.storage: if str(s.bus) == ib: batt = s
	var bus_live := true
	var w = app.b.q("world")
	if w is Dictionary:
		for bb in w.buses: if str(bb.id) == ib: bus_live = bool(bb.energised)
	if g.get("solution") == null: bus_live = true   # nothing has run yet
	if not bus_live: return [tx("CF_ISLAND_DARK"), Color("#B02020")]
	if live == 0 and batt != null: return [tx("CF_ISLAND_BATT") % int(round(100.0 * clampf((float(batt.soc) - 0.1) / 0.8, 0.0, 1.0))), Color("#B07010")]
	if feeders >= 2 and live >= 2: return [tx("CF_ISLAND_TWO"), Color("#1E6B3A")]
	return [tx("CF_ISLAND_LIT") if live > 0 else tx("CF_ISLAND_ONEWAY"), Color("#1E6B3A") if live > 0 else GridTheme.PAPER_INK]

func _rebuild_ticker(g: Dictionary) -> void:
	var lines: Array = []
	if int(g.tick) <= int(g.levelStart): _ticker.text = tx("CF_TICKER_EMPTY"); return   # the opening line of the free-play log is not news
	var lg: Array = g.get("log", [])
	for i in range(lg.size() - 1, -1, -1):
		var e = lg[i]
		var t := str(e.get("text", e.get("msg", ""))) if e is Dictionary else str(e)
		if e is Dictionary and int(e.get("tick", 0)) <= int(g.levelStart): continue   # the newGame banner ("the grid is empty… place a bus") belongs to before the shift
		if t != "": lines.append(t)
		if lines.size() >= (3 if (app.is_inside_tree() and app.vs_h() < 860.0) else 5): break   # 1280x800: three lines, so the card ends above the speed dock
	_ticker.text = "\n".join(lines) if lines.size() > 0 else tx("CF_TICKER_EMPTY")

func _layout() -> void:
	if not is_inside_tree(): return
	var vp := Vector2(app.vw(), app.vs_h()) if app != null and app.is_inside_tree() and app.has_method("vw") else get_viewport_rect().size   # the app's usable area (safe-area inset off)
	var phone: bool = CbLayout.kind == "phone"
	_toggle.visible = phone
	if phone:
		_toggle.text = ("▾ " if _open else "▸ ") + _day_lbl.text; _toggle.clip_text = true; _toggle.custom_minimum_size = Vector2(W - 24.0, 0)
		_scroll.visible = _open
		var top := 72.0; var avail := maxf(80.0, vp.y - 185.0 - top - 40.0)   # the spent/budget tag sits about 185 px above the bottom on the phone
		_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
		_scroll.custom_minimum_size = Vector2(W - 24.0, minf(_box.get_combined_minimum_size().y, avail))
		size = Vector2(W, 0); custom_minimum_size = Vector2(W, 0)
		reset_size(); position = Vector2(maxf(4.0, vp.x - maxf(size.x, get_combined_minimum_size().x) - 8.0), top)   # by the card's real width: wide kit buttons had pushed it past the right edge
		_day_lbl.visible = false   # the toggle row carries the day and the clock
	else:
		var avail2 := vp.y - 74.0 - 300.0   # ends above the speed dock and the budget tag (1280x800 overlap)
		var bh := _box.get_combined_minimum_size().y
		if bh > avail2: _scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO; _scroll.custom_minimum_size = Vector2(W - 24.0, avail2)
		else: _scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; _scroll.custom_minimum_size = Vector2.ZERO
		_scroll.visible = true; _day_lbl.visible = true
		size = Vector2(W, 0); custom_minimum_size = Vector2(W, 0); reset_size()
		position = Vector2(vp.x - W - 14.0, 74.0)

## The parts shelf (DECISIONS 14): the finale's parts grouped by the threat they answer, each with the engine's own price (`actionCost` on a copy of the state). Nothing on it says
## which part is right: the budget cannot buy them all, so the player judges what each threat needs. Press a part to buy it, press it again to take it back (refunded by
## the engine's demolish); the spun unit's fuel cannot be returned. "$new" in an action stands for the shunt the first action of that part just placed.
const SHELF := [
	["CF_A_VOLT", ["tap", "cap", "statcom", "reactor"]],
	["CF_A_RESERVE", ["spin", "gfm"]],
	["CF_A_ISLAND", ["line", "feeder", "batt2", "batt4"]],
]
const PARTS := {
	"tap": [["setTapAuto", ["T34", 1.02, 0.015, 1]], ["setTapAuto", ["T35", 1.02, 0.015, 1]]],
	"cap": [["placeShunt", ["B4", "cap-400-50", 4]], ["setShuntSteps", ["$new", 2]], ["setShuntAuto", ["$new", 0.975, 1.03, 1]]],
	"statcom": [["placeShunt", ["B4", "statcom-200", 1]], ["setShuntSteps", ["$new", 1]]],
	"reactor": [["placeShunt", ["B1", "reactor-400-125", 4]], ["setShuntSteps", ["$new", 0]], ["setShuntAuto", ["$new", 0.99, 1.04, 1]]],
	"spin": [["spinUnit", ["U4"]]],
	"gfm": [["placeStorage", ["B10", "bess-gfm-50"]], ["placeStorage", ["B10", "bess-gfm-50"]], ["placeStorage", ["B10", "bess-gfm-50"]], ["placeStorage", ["B10", "bess-gfm-50"]]],
	"line": [["stringLine", ["B17", "B18", "l132-panther", 1]]],
	"feeder": [["stringLine", ["B16", "B18", "l132-panther", 1]]],
	"batt2": [["placeStorage", ["B18", "bess-2h-50"]]],
	"batt4": [["placeStorage", ["B18", "bess-4h-50"]]],
}
var _price := {}   # part -> engine price of buying it (per region: the packs price differently; before the run the prices do not move)
var _price_key := ""

## The elements a part stands as (bought from the shelf or placed by hand in the tray): ids to demolish when it is taken back. Taps and the spun unit have no element.
static func part_ids(g: Dictionary, id: String) -> Array:
	var out: Array = []
	match id:
		"cap", "statcom", "reactor":
			var cat: String = {"cap": "cap-400-50", "statcom": "statcom-200", "reactor": "reactor-400-125"}[id]
			for h in g.shunts: if str(h.get("catalogId", "")) == cat: out.append(str(h.id))
		"gfm", "batt2", "batt4":
			var at: String = "B10" if id == "gfm" else "B18"
			var sku: String = {"gfm": "bess-gfm-50", "batt2": "bess-2h-50", "batt4": "bess-4h-50"}[id]
			for b in g.storage: if str(b.bus) == at and str(b.get("catalogId", "")) == sku: out.append(str(b.id))
		"line", "feeder":
			var other: String = "B17" if id == "line" else "B16"
			for br in g.branches:
				var ends: Array = [str(br.from), str(br.to)]
				if ends.has("B18") and ends.has(other) and str(br.id) != "T20": out.append(str(br.id))   # T20 is the causeway the island starts with
	return out

## Does the part stand in the grid now?
static func bought(g: Dictionary, id: String) -> bool:
	if id == "tap":
		var n := 0
		for br in g.branches:
			if (str(br.id) == "T34" or str(br.id) == "T35") and br.tap != null and br.tap.auto != null and float(br.tap.auto.vSet) > 1.015: n += 1
		return n == 2
	if id == "spin":
		for u in g.units: if str(u.id) == "U4": return (u.commit.schedule as Array).size() > 0
		return false
	return not part_ids(g, id).is_empty()

## What buying the part costs, from the engine (its priced actions run on a copy of the state); the four grid-forming packs are four purchases.
func price(id: String) -> float:
	var key := str(app.b.g.get("region", "")) + "/" + str(app.b.g.get("level", ""))
	if key != _price_key: _price.clear(); _price_key = key
	if _price.has(id): return float(_price[id])
	var c := 0.0
	for a in PARTS[id]:
		if str(a[0]) in ["placeShunt", "placeStorage", "stringLine", "spinUnit"]:
			var r = app.b.q("actionCost", [str(a[0]), a[1]])
			if r is Dictionary and bool(r.get("ok", false)): c += float(r.cost)
	_price[id] = c
	return c

func _rebuild_kit(g: Dictionary) -> void:
	var locked: bool = str(g.get("status", "playing")) != "playing" or int(g.tick) > int(g.levelStart)
	var have: Array = []
	for area in SHELF: for id in area[1]: if bought(g, id): have.append(id)
	var sig := ",".join(have) + str(locked) + str(g.budget.get("spent", 0.0))
	if sig == _kit_sig: return
	_kit_sig = sig
	for c in _kit.get_children(): _kit.remove_child(c); c.queue_free()
	_kit.add_child(_wrap_ink(tx("CF_SHELF_HEAD"), 12, 0.7))
	for area in SHELF:
		var h := GridTheme.label(tx(str(area[0])), 14, ink(), "semi"); h.name = "cf_area_" + str(area[0]).to_lower(); _kit.add_child(h)
		_kit.add_child(_wrap_ink(tx(str(area[0]) + "_WHY"), 12, 0.75))
		for id in area[1]:
			var b := Button.new(); b.name = "cf_" + str(id); b.custom_minimum_size = Vector2(W - 24.0, 30)
			b.focus_mode = CbKit.focus_mode(); b.add_theme_font_size_override("font_size", GridTheme.fs(13)); b.alignment = HORIZONTAL_ALIGNMENT_LEFT
			b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			var has: bool = id in have
			var p: float = price(str(id)) if not has else 0.0
			var tag: String = tx("CF_P_FREE") if p <= 0.0 and not has else (CbRegion.money(p, true, 1) if not has else "")
			var key: String = "CF_P_" + str(id).to_upper()
			if has: b.text = "✓ " + tx(key) + "  ·  " + (tx("CF_P_SPUN") if id == "spin" else tx("CF_P_BACK"))
			else: b.text = tx(key) + "  ·  " + tag
			b.disabled = locked or (has and id == "spin")   # fuel burned is not returned
			b.pressed.connect(_press.bind(str(id)))
			_kit.add_child(b)

func _wrap_ink(t: String, fs: int, a: float) -> Label:
	var l := _wrap(t, fs); var ls: LabelSettings = l.label_settings.duplicate(); ls.font_color = ink(a); l.label_settings = ls; return l

## Buy the part, or take it back if it stands. The engine prices, places and refunds; a refused step stops the rest.
func _press(id: String) -> void:
	var g := _g()
	if bought(g, id):
		if id == "tap":
			for t in ["T34", "T35"]: _do("setTapAuto", [t, 1.0, 0.015, 1])
		elif id != "spin":
			for e in part_ids(g, id): _do("demolish", [e])
		refresh(); return
	var before: Array = []
	for h in g.shunts: before.append(str(h.id))
	var fresh := ""
	for a in PARTS[id]:
		var args: Array = (a[1] as Array).duplicate()
		if args.size() > 0 and str(args[0]) == "$new":
			if fresh == "":
				for h in _g().shunts: if not before.has(str(h.id)): fresh = str(h.id)
			args[0] = fresh
		if not _do(str(a[0]), args): break
	refresh()

func _do(act: String, args: Array) -> bool:
	var r: Dictionary = app.b.act(act, args)
	var quiet := DisplayServer.get_name() == "headless"
	if r.get("ok", false):
		if not quiet: app.sfx("click")
	elif not quiet: app.sfx("bad"); app.toast(str(r.get("message", "")), "bad")
	if not quiet: app.game_on_changed()
	return bool(r.get("ok", false))
