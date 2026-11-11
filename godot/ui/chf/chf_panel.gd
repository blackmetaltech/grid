class_name ChfPanel
extends PanelContainer
## The finale's card (L28, top left under the instruments): which of the three days it is and what it threatens, the clock, Saltmarsh Island's lamp (lit / on its battery / dark), the day's numbers
## and the event ticker (the engine's own log of trips, repairs and lightning), plus the one action the generic tray has no cell for: keeping the spare gas unit spinning. Display and input only.
const W := 300.0
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
	var th := GridTheme.label(tx("CF_TICKER"), 12, Color(GridTheme.PAPER_INK, 0.7), "mono"); _box.add_child(th)
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
	var g := _g()
	var day := clampi(int(g.clock.day) + (1 if int(g.clock.block) > 0 or int(g.tick) == 0 else 0), 1, 3)
	if int(g.clock.day) == 3: day = 3
	_day_lbl.text = tx("CF_DAY") % day + "   " + tx("CF_CLOCK") % [int(g.clock.block) / 4, (int(g.clock.block) % 4) * 15]
	_threat.text = tx("CF_DAY%d" % day)
	var lamp := _island_text(g)
	_island.text = lamp[0]; _island.add_theme_color_override("font_color", lamp[1])
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
		if lines.size() >= 5: break
	_ticker.text = "\n".join(lines) if lines.size() > 0 else tx("CF_TICKER_EMPTY")

func _layout() -> void:
	var vp := get_viewport_rect().size
	var phone: bool = CbLayout.kind == "phone"
	_toggle.visible = phone
	if phone:
		_toggle.text = ("▾ " if _open else "▸ ") + _day_lbl.text; _toggle.clip_text = true; _toggle.custom_minimum_size = Vector2(W - 24.0, 0)
		_scroll.visible = _open
		var top := 72.0; var avail := maxf(80.0, vp.y - 185.0 - top - 40.0)   # the spent/budget tag sits about 185 px above the bottom on the phone
		_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
		_scroll.custom_minimum_size = Vector2(W - 24.0, minf(_box.get_combined_minimum_size().y, avail))
		size = Vector2(W, 0); custom_minimum_size = Vector2(W, 0)
		position = Vector2(vp.x - W - 8.0, top)
		_day_lbl.visible = false   # the toggle row carries the day and the clock
	else:
		_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; _scroll.custom_minimum_size = Vector2.ZERO; _scroll.visible = true; _day_lbl.visible = true
		size = Vector2(W, 0); custom_minimum_size = Vector2(W, 0)
		position = Vector2(vp.x - W - 14.0, 74.0)

## The build kit: the finale's recipe as one click per move (the tray still places any part by hand). Each button runs its actions through the bridge; the engine prices and refuses.
const KIT := {
	"tap": [["setTapAuto", ["T34", 1.02, 0.015, 1]], ["setTapAuto", ["T35", 1.02, 0.015, 1]]],
	"cap": [["placeShunt", ["B4", "cap-400-50", 4]], ["setShuntSteps", ["C1", 2]], ["setShuntAuto", ["C1", 0.975, 1.03, 1]]],
	"spin": [["spinUnit", ["U4"]]],
	"line": [["stringLine", ["B17", "B18", "l132-panther", 1]]],
	"batt": [["placeStorage", ["B18", "bess-4h-50"]]],
}
const KIT_KEYS := {"tap": "CF_B_TAP", "cap": "CF_B_CAP", "spin": "CF_B_SPIN", "line": "CF_B_LINE", "batt": "CF_B_BATT"}

func _kit_open(g: Dictionary) -> Array:
	var open: Array = []
	var tapped := 0
	for br in g.branches:
		if (str(br.id) == "T34" or str(br.id) == "T35") and br.tap != null and br.tap.auto != null and float(br.tap.auto.vSet) > 1.015: tapped += 1
	if tapped < 2: open.append("tap")
	if (g.shunts as Array).is_empty(): open.append("cap")
	var u4 = null
	for u in g.units: if str(u.id) == "U4": u4 = u
	if u4 != null and (u4.commit.schedule as Array).size() == 0: open.append("spin")
	var island_done := false
	for s in g.storage: if str(s.bus) == "B18": island_done = true
	var feeders := 0
	for br in g.branches: if str(br.from) == "B18" or str(br.to) == "B18": feeders += 1
	if feeders >= 2: island_done = true
	if not island_done: open.append("line"); open.append("batt")
	return open

func _rebuild_kit(g: Dictionary) -> void:
	var open := _kit_open(g)
	var locked: bool = str(g.get("status", "playing")) != "playing" or int(g.tick) > int(g.levelStart)
	var sig := ",".join(open) + str(locked)
	if sig == _kit_sig: return
	_kit_sig = sig
	for c in _kit.get_children(): _kit.remove_child(c); c.queue_free()
	_kit.add_child(GridTheme.label(tx("CF_B_HEAD"), 12, Color(GridTheme.PAPER_INK, 0.7), "mono"))
	for id in KIT.keys():
		var b := Button.new(); b.name = "cf_" + id; b.custom_minimum_size = Vector2(W - 24.0, 30)
		b.focus_mode = CbKit.focus_mode(); b.add_theme_font_size_override("font_size", GridTheme.fs(13)); b.alignment = HORIZONTAL_ALIGNMENT_LEFT; b.clip_text = true
		var key: String = KIT_KEYS[id]
		var is_open: bool = id in open
		b.text = ("" if is_open else "✓ ") + tx(key)
		b.disabled = locked or not is_open
		b.pressed.connect(func():
			var ok := true
			for a in KIT[id]: if ok: ok = _do(str(a[0]), a[1] as Array)
		)
		_kit.add_child(b)

func _do(act: String, args: Array) -> bool:
	var r: Dictionary = app.b.act(act, args)
	var quiet := DisplayServer.get_name() == "headless"
	if r.get("ok", false):
		if not quiet: app.sfx("click")
	elif not quiet: app.sfx("bad"); app.toast(str(r.get("message", "")), "bad")
	if not quiet: app.game_on_changed()
	return bool(r.get("ok", false))
