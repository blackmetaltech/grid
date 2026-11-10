class_name Jobs
extends RefCounted
## "Jobs": the level select as a clipboard of work orders (title screen, pause menu). One row per job with its number, name, the brief and the lamps earned
## so far (GridSettings, written by the shift report). Built with app.dialog() under the name "levels" so the shell's Esc / Back / close_title rules apply.

static func T(key: String) -> String: return TranslationServer.translate(key)

## Engine levels shown as jobs: everything except the placeholder scene.
static func list(app: CbApp) -> Array:
	return (app.b.levels() as Array).filter(func(lv): return str(lv.id) != "T00")

static func open(app: CbApp) -> void:
	GridUi.load_strings()
	var w := minf(860.0, app.vw() - 40.0)
	var d: Dictionary = app.dialog("levels", w, minf(780.0, app.vs_h() - 40.0), Color("#3A2814"), 0.72)
	var host: Control = d.host; host.set_script(PaperHost); host.theme = GridTheme.theme(); var ph: PaperHost = host as PaperHost
	(host.get_child(0) as ColorRect).color = Color(GridTheme.NIGHT, 0.72)
	var pn: PanelContainer = d.panel; pn.clip_contents = false
	var board := GridTheme._sb(Color("#6A4B2E"), Color("#3A2814"), 14, 3, 22.0); board.content_margin_top = 34; board.shadow_color = Color(0, 0, 0, 0.45); board.shadow_size = 10
	pn.add_theme_stylebox_override("panel", board)
	var vb: VBoxContainer = d.vb; vb.add_theme_constant_override("separation", 10)
	var clip := ClipArt.new(); pn.add_child(clip)   # last child = drawn over the sheet
	var sheet := PanelContainer.new(); sheet.size_flags_vertical = Control.SIZE_EXPAND_FILL; sheet.add_theme_stylebox_override("panel", GridTheme.paper_sb(3, 18.0)); vb.add_child(sheet)
	var sv := VBoxContainer.new(); sv.add_theme_constant_override("separation", 8); sheet.add_child(sv)
	sv.add_child(PaperKit.lbl(T("JOBS_TITLE").to_upper(), 46, "title", PaperKit.INK))
	sv.add_child(PaperKit.lbl(T("JOBS_SUB"), 16, "sans", Color(PaperKit.INK, 0.7), true))
	var sc := ScrollContainer.new(); sc.size_flags_vertical = Control.SIZE_EXPAND_FILL; sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; sv.add_child(sc)
	var rows := VBoxContainer.new(); rows.add_theme_constant_override("separation", 6); rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL; sc.add_child(rows)
	var first: Button = null
	for lv in list(app):
		var id := str(lv.id)
		var r := _row(app, lv, host); rows.add_child(r)
		if first == null: first = r
	var close := PaperKit.btn(T("JOBS_CLOSE"), false, func(): host.queue_free(), 18); close.name = "Close"
	sv.add_child(close)
	ph.closer = func(): host.queue_free()
	PaperKit.slide_in(d, 50.0)
	ph.primary = first
	app.focus_dialog()

static func _row(app: CbApp, lv: Dictionary, host: Control) -> Button:
	var id := str(lv.id)
	var b := PaperKit.btn("", false, func():
		host.queue_free()
		app.start_level(id, not app.started), 18)
	b.name = "Job_" + id; b.custom_minimum_size = Vector2(0, 92); b.size_flags_horizontal = Control.SIZE_EXPAND_FILL; b.clip_text = true
	var hb := HBoxContainer.new(); hb.mouse_filter = Control.MOUSE_FILTER_IGNORE; hb.add_theme_constant_override("separation", 14); hb.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	hb.offset_left = 16; hb.offset_right = -14; hb.offset_top = 6; hb.offset_bottom = -6; b.add_child(hb)
	var num := PaperKit.lbl(id.trim_prefix("L"), 46, "title", PaperKit.INK); num.custom_minimum_size.x = 66; num.vertical_alignment = VERTICAL_ALIGNMENT_CENTER; hb.add_child(num)
	var mid := VBoxContainer.new(); mid.mouse_filter = Control.MOUSE_FILTER_IGNORE; mid.size_flags_horizontal = Control.SIZE_EXPAND_FILL; mid.alignment = BoxContainer.ALIGNMENT_CENTER; mid.add_theme_constant_override("separation", 0); hb.add_child(mid)
	mid.add_child(PaperKit.lbl(str(lv.title), 24, "title", PaperKit.INK))
	var br := PaperKit.lbl(str(lv.get("brief", "")), 15, "sans", Color(PaperKit.INK, 0.72), true); br.max_lines_visible = 2; br.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS; mid.add_child(br)
	var earned := GridSettings.stars(id)
	var lr := HBoxContainer.new(); lr.mouse_filter = Control.MOUSE_FILTER_IGNORE; lr.add_theme_constant_override("separation", 0); lr.size_flags_vertical = Control.SIZE_SHRINK_CENTER; hb.add_child(lr)
	for i in 3:
		var lamp := PaperKit.Lamp.new(34.0, i < earned); lamp.tooltip_text = (T("JOBS_STARS") % earned) if earned > 0 else T("JOBS_NO_STARS"); lr.add_child(lamp)
	return b

## The metal clip at the top of the clipboard.
class ClipArt extends Control:
	func _init() -> void: mouse_filter = Control.MOUSE_FILTER_IGNORE
	func _draw() -> void:
		var cx := size.x * 0.5
		draw_rect(Rect2(cx - 62, -22, 124, 44), Color("#8A909A")); draw_rect(Rect2(cx - 62, -22, 124, 44), Color("#2E3138"), false, 3.0)
		draw_rect(Rect2(cx - 40, -12, 80, 12), Color("#2E3138")); draw_rect(Rect2(cx - 50, -22, 100, 7), Color("#C4C9D1"))
		draw_circle(Vector2(cx, 12), 5.0, Color("#2E3138"))
