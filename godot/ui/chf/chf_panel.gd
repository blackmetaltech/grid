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

func _init() -> void:
	name = "ChfPanel"; visible = false; mouse_filter = Control.MOUSE_FILTER_STOP
	add_theme_stylebox_override("panel", GridTheme.paper_sb(4, 10.0))
	_box = VBoxContainer.new(); _box.add_theme_constant_override("separation", 4); add_child(_box)
	GridUi.load_strings()
	_day_lbl = GridTheme.label("", 22, GridTheme.PAPER_INK, "title"); _day_lbl.name = "cf_day"; _box.add_child(_day_lbl)
	_threat = _wrap("", 13); _threat.name = "cf_threat"; _box.add_child(_threat)
	_island = GridTheme.label("", 15, GridTheme.PAPER_INK, "semi"); _island.name = "cf_island"; _box.add_child(_island)
	_stats = _wrap("", 12); _stats.name = "cf_stats"; _box.add_child(_stats)
	var th := GridTheme.label(tx("CF_TICKER"), 12, Color(GridTheme.PAPER_INK, 0.7), "mono"); _box.add_child(th)
	_ticker = _wrap("", 12); _ticker.name = "cf_ticker"; _box.add_child(_ticker)

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
		if t != "": lines.append(t)
		if lines.size() >= 5: break
	_ticker.text = "\n".join(lines) if lines.size() > 0 else tx("CF_TICKER_EMPTY")

func _layout() -> void:
	var vp := get_viewport_rect().size
	size = Vector2(W, 0); custom_minimum_size = Vector2(W, 0)
	position = Vector2(vp.x - W - 14.0, 74.0)
