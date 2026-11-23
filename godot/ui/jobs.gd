class_name Jobs
extends RefCounted
## "Jobs": the level select as a clipboard of work orders (title screen, pause menu). One row per job with its number, name, the brief and the lamps earned
## so far (GridSettings, written by the shift report). Built with app.dialog() under the name "levels" so the shell's Esc / Back / close_title rules apply.

static func T(key: String) -> String: return TranslationServer.translate(key)

## Engine levels shown as jobs: everything except the placeholder scene.
static func list(app: CbApp) -> Array:
	return (app.b.levels() as Array).filter(func(lv): return str(lv.id) != "T00")

## Learner plays the campaign in order: a job opens once the one before it is passed (lamps recorded in grid.cfg by the shift report). Engineer and
## Sandbox have every job open.
static func unlocked(app: CbApp, id: String) -> bool:
	if app._mode_pref() != "learner": return true
	var ids := chain(app)
	var i := ids.find(id)
	return i <= 0 or GridSettings.passed(str(ids[i - 1]))

## The campaign in order. The prologue (P0, "The Night the Lights Went Out") stands outside it: it is never locked and never required.
static func chain(app: CbApp) -> Array:
	return list(app).map(func(lv): return str(lv.id)).filter(func(id): return not str(id).begins_with("P"))

## Why a job is locked, as a sentence ("Pass WO-02 first"), "" when it is open.
static func lock_text(app: CbApp, id: String) -> String:
	if unlocked(app, id): return ""
	var ids := chain(app)
	return T("JOBS_LOCKED") % str(ids[ids.find(id) - 1]).trim_prefix("L")

## The chapter a job belongs to (DESIGN 2.5): chapter 8 is the Distribution feeder jobs (L31-L36); chapter 2 holds the bench levels and the Mainland line jobs (L04 L05 L06 L29 L30); F is the finale.
const CHAPTERS := {"P0": "1", "L01": "1", "L02": "1", "L03": "1", "L04": "2", "L05": "2", "L06": "2", "L29": "2", "L30": "2", "L07": "3", "L08": "3", "L09": "3",
	"L10": "4", "L11": "4", "L12": "4", "L13": "4", "L14": "5", "L15": "5", "L16": "5", "L17": "5", "L18": "5", "L19": "6", "L20": "6", "L21": "6", "L22": "6",
	"L23": "7", "L24": "7", "L25": "7", "L26": "7", "L27": "7", "L28": "F",
	"L31": "8", "L32": "8", "L33": "8", "L34": "8", "L35": "8", "L36": "8"}
static func chapter_of(id: String) -> String: return str(CHAPTERS.get(id, "X"))

static func open(app: CbApp) -> void:
	GridUi.load_strings()
	var compact := PaperKit.compact(app)
	var w := minf(860.0, app.vw() - 40.0)
	var d: Dictionary = app.dialog("levels", w, minf(780.0, app.vs_h() - 24.0), Color("#3A2814"), 0.72)
	var host: Control = d.host; host.set_script(PaperHost); host.theme = GridTheme.theme(); var ph: PaperHost = host as PaperHost
	ph.app = app; PaperKit.bleed(app, host)
	(host.get_child(0) as ColorRect).color = Color(GridTheme.NIGHT, 0.72)
	var pn: PanelContainer = d.panel; pn.clip_contents = false
	var glass: bool = app.get("grid_world") != null and app.grid_world.look3d != null   # LOOK2 (1.16): the jobs list in the glass language wherever the 3D look runs
	PaperKit.glass = glass
	var board := GridTheme._sb(Color("#6A4B2E"), Color("#3A2814"), 14, 3, 22.0); board.content_margin_top = 22 if compact else 34; board.shadow_color = Color(0, 0, 0, 0.45); board.shadow_size = 10
	if glass: board = GridTheme.glass_sb(0.9, 6, 18.0)
	pn.add_theme_stylebox_override("panel", board)
	var vb: VBoxContainer = d.vb; vb.add_theme_constant_override("separation", 10)
	if not glass: var clip := ClipArt.new(); pn.add_child(clip)   # last child = drawn over the sheet
	var sheet := PanelContainer.new(); sheet.size_flags_vertical = Control.SIZE_EXPAND_FILL; sheet.add_theme_stylebox_override("panel", StyleBoxEmpty.new() if glass else GridTheme.paper_sb(3, 12.0 if compact else 18.0)); vb.add_child(sheet)
	var sv := VBoxContainer.new(); sv.add_theme_constant_override("separation", 8); sheet.add_child(sv)
	sv.add_child(PaperKit.lbl(T("JOBS_TITLE").to_upper(), (26 if compact else 32) if glass else (34 if compact else 46), "title", PaperKit.INK))
	if not compact: sv.add_child(PaperKit.lbl(T("JOBS_SUB"), 16, "sans", Color(PaperKit.INK, 0.7), true))
	var rows := VBoxContainer.new(); rows.add_theme_constant_override("separation", 6); rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sv.add_child(PaperKit.scroll_box(rows))
	var first: Button = null; var ch_shown := ""
	var fin := PaperKit.btn(T("JOBS_SEE_FINALE"), true, func():   # LOOK2 (Priya, DECISIONS 15): the finale in the new look is one click away, open in every mode
		host.queue_free()
		if app.started: app._autosave()
		GridLoading.start(app, "L28"), 18)
	fin.name = "SeeFinale"; fin.tooltip_text = T("JOBS_SEE_FINALE_TIP"); rows.add_child(fin)
	var car := Career.jobs_row(app, host, compact); rows.add_child(car)   # the Career (DESIGN-1.1 Part C) sits above the chapters
	for lv in list(app):
		var id := str(lv.id)
		var ch := chapter_of(id)
		if ch != ch_shown:   # a heading per chapter: thirty work orders read as seven chapters and a finale
			ch_shown = ch
			var hd := PaperKit.lbl(T("JOBS_CH_" + ch).to_upper(), 15 if compact else 17, "mono", Color(PaperKit.INK, 0.62)); hd.name = "Chapter" + ch
			rows.add_child(hd)
		var r := _row(app, lv, host, compact); rows.add_child(r)
		if first == null and not r.disabled: first = r
	var close := PaperKit.btn(T("JOBS_CLOSE"), false, func(): host.queue_free(), 18); close.name = "Close"
	sv.add_child(close)
	ph.closer = func(): host.queue_free()
	var chain: Array = []   # explicit pad order down the list (1.16 hand play: DOWN from "See the finale" jumped straight to Close)
	for c in rows.get_children(): if c is Button and not (c as Button).disabled: chain.append(c)
	chain.append(close)
	for i in chain.size():
		var b: Control = chain[i]
		if i > 0: b.focus_neighbor_top = b.get_path_to(chain[i - 1]); b.focus_previous = b.focus_neighbor_top
		if i < chain.size() - 1: b.focus_neighbor_bottom = b.get_path_to(chain[i + 1]); b.focus_next = b.focus_neighbor_bottom
	PaperKit.glass = false
	PaperKit.slide_in(d, 50.0)
	ph.primary = first
	app.focus_dialog()

static func _row(app: CbApp, lv: Dictionary, host: Control, compact := false) -> Button:
	var id := str(lv.id)
	var lock := lock_text(app, id)
	var b := PaperKit.btn("", false, func():
		host.queue_free()
		if app.started: app._autosave()   # picking a work order is the confirmation: no generic (cyan) dialog, the running job is autosaved first
		GridLoading.start(app, id), 18)
	b.name = "Job_" + id; b.custom_minimum_size = Vector2(0, 68 if compact else 92); b.size_flags_horizontal = Control.SIZE_EXPAND_FILL; b.clip_text = true
	var hb := HBoxContainer.new(); hb.mouse_filter = Control.MOUSE_FILTER_IGNORE; hb.add_theme_constant_override("separation", 14); hb.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	hb.offset_left = 16; hb.offset_right = -14; hb.offset_top = 6; hb.offset_bottom = -6; b.add_child(hb)
	var num := PaperKit.lbl(id.trim_prefix("L"), 46, "title", PaperKit.INK); num.custom_minimum_size.x = 66; num.vertical_alignment = VERTICAL_ALIGNMENT_CENTER; hb.add_child(num)
	var mid := VBoxContainer.new(); mid.mouse_filter = Control.MOUSE_FILTER_IGNORE; mid.size_flags_horizontal = Control.SIZE_EXPAND_FILL; mid.alignment = BoxContainer.ALIGNMENT_CENTER; mid.add_theme_constant_override("separation", 0); hb.add_child(mid)
	mid.add_child(PaperKit.lbl(str(lv.title), 24, "title", PaperKit.INK))
	var br := PaperKit.lbl(lock if lock != "" else str(lv.get("brief", "")), 15, "sans", Color(PaperKit.INK, 0.72), true); br.max_lines_visible = 1 if compact else 2; br.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS; mid.add_child(br)
	var earned := GridSettings.stars(id)
	var lr := HBoxContainer.new(); lr.mouse_filter = Control.MOUSE_FILTER_IGNORE; lr.add_theme_constant_override("separation", 0); lr.size_flags_vertical = Control.SIZE_SHRINK_CENTER; hb.add_child(lr)
	if not WorldView.LOOK2_LEVELS.has(id): hb.add_child(classic_chip())   # this job still draws in the classic look
	for i in 3:
		var lamp := PaperKit.Lamp.new(34.0, i < earned); lamp.tooltip_text = (T("JOBS_STARS") % earned) if earned > 0 else T("JOBS_NO_STARS"); lr.add_child(lamp)
	if lock != "":   # locked: the row greys out, a padlock replaces the lamps, and it cannot be started
		b.disabled = true; hb.modulate = Color(1, 1, 1, 0.55); lr.visible = false
		var pl := Padlock.new(); pl.size_flags_vertical = Control.SIZE_SHRINK_CENTER; hb.add_child(pl)
		b.tooltip_text = lock
	return b

## A small "Classic" chip: this job still draws in the classic 2D look (the levels listed in WorldView.LOOK2_LEVELS are in the new look).
static func classic_chip() -> Control:
	var l := PaperKit.lbl(T("JOBS_CLASSIC"), 14, "mono", Color(PaperKit.INK, 0.6)); l.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	l.tooltip_text = T("JOBS_CLASSIC_TIP"); l.mouse_filter = Control.MOUSE_FILTER_PASS; l.name = "Classic"
	return l

## A small hand-drawn padlock (locked job).
class Padlock extends Control:
	var _ink := PaperKit.INK
	func _init() -> void: _ink = PaperKit.ink(PaperKit.INK); custom_minimum_size = Vector2(40, 44); mouse_filter = Control.MOUSE_FILTER_IGNORE
	func _draw() -> void:
		var c := Color(_ink, 0.85)
		draw_arc(Vector2(20, 19), 9.0, PI, TAU, 16, c, 3.4, true); draw_line(Vector2(11, 19), Vector2(11, 23), c, 3.4); draw_line(Vector2(29, 19), Vector2(29, 23), c, 3.4)
		draw_rect(Rect2(6, 22, 28, 20), Color(_ink, 0.8)); draw_circle(Vector2(20, 31), 3.0, GridTheme.PAPER); draw_line(Vector2(20, 31), Vector2(20, 37), GridTheme.PAPER, 2.6)

## The metal clip at the top of the clipboard.
class ClipArt extends Control:
	func _init() -> void: mouse_filter = Control.MOUSE_FILTER_IGNORE
	func _draw() -> void:
		var cx := size.x * 0.5
		draw_rect(Rect2(cx - 62, -22, 124, 44), Color("#8A909A")); draw_rect(Rect2(cx - 62, -22, 124, 44), Color("#2E3138"), false, 3.0)
		draw_rect(Rect2(cx - 40, -12, 80, 12), Color("#2E3138")); draw_rect(Rect2(cx - 50, -22, 100, 7), Color("#C4C9D1"))
		draw_circle(Vector2(cx, 12), 5.0, Color("#2E3138"))
