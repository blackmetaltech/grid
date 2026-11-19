class_name GridUi
extends RefCounted
## Glue of the M2.4 drawers (Build, Inspector, Timeline), the HUD dial and the result card with the shell in main.gd. main.gd calls three
## functions: `extend_config`, `on_changed` and `end_card`. Everything else lives in godot/ui.

const ID_BUILD := "build"
const ID_INSPECT := "inspect"
const ID_TIMELINE := "timeline"

## Inspector selection: {"kind": "bus"|"branch"|"unit"|"shunt", "id": String}. The world (a map click) may call `select`.
static var selected := {}
static var hud: GridHud = null
static var _loaded := false

static func T(key: String) -> String: return TranslationServer.translate(key)

static func load_strings() -> void:
	if _loaded: return
	_loaded = true
	var t := Translation.new(); t.locale = "en"
	for tbl in [GridStrings.S, Ch2Strings.S, Ch3Strings.S, Ch4Strings.S, Ch5Strings.S, Ch6Strings.S, Ch7Strings.S, Ch8Strings.S, ChFStrings.S, CareerStrings.S]:   # chapter tables live beside each chapter's UI
		for k in tbl: t.add_message(k, tbl[k])
	TranslationServer.add_translation(t)

static func extend_config(cfg: Dictionary) -> Dictionary:
	load_strings()
	var dock: Array = [
		[ID_BUILD, T("DOCK_BUILD"), Color("#39E1FF"), T("DOCK_BUILD_SHORT")],
		[ID_INSPECT, T("DOCK_INSPECT"), Color("#FFB020"), T("DOCK_INSPECT_SHORT")],
		[ID_TIMELINE, T("DOCK_TIMELINE"), Color("#7CFFB2"), T("DOCK_TIMELINE_SHORT")],
	]
	for d in cfg.dock: dock.insert(0, d)   # the first entry is the blank home screen (ui/home_blank.gd); the dock itself is hidden in custom chrome
	cfg.dock = dock
	cfg.screens[ID_BUILD] = "res://ui/build_screen.gd"
	cfg.screens[ID_INSPECT] = "res://ui/inspect_screen.gd"
	cfg.screens[ID_TIMELINE] = "res://ui/timeline_screen.gd"
	cfg.overlay = (cfg.overlay as Array) + [ID_BUILD, ID_INSPECT]
	return cfg

## Called from game_on_changed: make sure the HUD exists and shows the engine's state.
static func on_changed(app: CbApp) -> void:
	load_strings()
	if hud == null or not is_instance_valid(hud):
		hud = GridHud.new(); hud.app = app; app.root.add_child(hud)
	hud.refresh()

static func select(kind: String, id: String) -> void: selected = {"kind": kind, "id": id}

## Result-card widgets (called from game_end_card): the histogram, labelled as the bot population until verified players exist.
static func end_card(vb: VBoxContainer, _g: Dictionary, app: CbApp) -> void:
	var r = app.b.q("resultCard")
	if not (r is Dictionary) or not r.get("active", false): return
	var p := CbKit.panel(T("RESULT_HIST_TITLE"), false, vb); var v: VBoxContainer = p[1]
	v.add_child(CbKit.label(str(r.metric), 15, CbKit.TX, true))
	var h := HistView.new(); h.set_data(r); v.add_child(h)
	if str(r.source) == "bot": v.add_child(CbKit.label(str(r.label), 14, CbKit.AM, true))   # the engine's own label text
	if r.get("mine") != null and r.get("percentile") != null:
		v.add_child(CbKit.label(T("RESULT_MINE_FMT") % [CbKit.num(float(r.mine), 1), int(round(float(r.percentile) * 100.0)), int(r.n)], 14, CbKit.DIM, true))
