class_name TitleScreen
extends RefCounted
## The title screen (cfg game_title -> true): the night island diorama fills the screen (the world in title mode, towns lit by the backdrop demo, drifting
## slowly), "GRID" in Big Shoulders 800 at the bottom left with "keep the lights on", and the menu as plain text lines with a sodium focus bar:
## Take the night shift (Continue when a save exists, else a new Learner game on the first job), Jobs (clipboard), Sandbox, Settings, Quit (desktop).
## Keyboard / pad focus walks the lines; the mouse moves focus on hover; touch taps. Cute mode has a small switch under the menu.

static func T(key: String) -> String: return TranslationServer.translate(key)

static func build(app: CbApp, root: Control) -> bool:
	GridUi.load_strings(); GridSettings.load_all()
	var k := clampf(app.vs_h() / 1080.0, 0.55, 1.0)
	var vw := app.vw(); var vh := app.vs_h()
	root.theme = GridTheme.theme()
	# legibility scrims: left (text) and bottom
	var gl := _grad(Vector2(0, 0), Vector2(1, 0), 0.9); gl.set_anchors_preset(Control.PRESET_LEFT_WIDE); gl.anchor_right = 0.62; gl.offset_right = 0; root.add_child(gl)
	var gb := _grad(Vector2(0, 1), Vector2(0, 0), 0.6); gb.set_anchors_preset(Control.PRESET_BOTTOM_WIDE); gb.anchor_top = 0.55; gb.offset_top = 0; root.add_child(gb)
	var vb := VBoxContainer.new(); vb.name = "TitleMenu"; vb.add_theme_constant_override("separation", int(6 * k))
	vb.set_anchors_preset(Control.PRESET_BOTTOM_LEFT); vb.grow_vertical = Control.GROW_DIRECTION_BEGIN; vb.offset_left = 72.0 * k; vb.offset_bottom = -48.0 * k; vb.offset_right = 72.0 * k + minf(760.0, vw - 100.0)
	root.add_child(vb)
	var logo := GridTheme.label(str(app.cfg.title), int(160 * k), GridTheme.SODIUM, "title"); logo.name = "logo"; vb.add_child(logo)
	var sub := GridTheme.label(T("TITLE_SUB"), int(30 * k), GridTheme.TEXT, "sans"); sub.name = "tagline"; vb.add_child(sub)
	var gap := Control.new(); gap.custom_minimum_size = Vector2(0, 22 * k); vb.add_child(gap)
	var saves: Array = app.b.q("saves") if app.b.q("saves") is Array else []
	var first: TitleLine = null
	var entries: Array = []
	if saves.size() > 0: entries.append([T("TITLE_CONTINUE"), "continue", func(): app.load_slot(str((saves[0] as Dictionary).slot))])
	else: entries.append([T("TITLE_NIGHT"), "night", func(): new_night_shift(app)])
	entries.append([T("TITLE_JOBS"), "jobs", func(): Jobs.open(app)])
	entries.append([T("TITLE_SANDBOX"), "sandbox", func(): app.new_game("sandbox")])
	entries.append([T("TITLE_SETTINGS"), "settings", func(): app.open_settings()])
	if not CbLayout.is_mobile(): entries.append([T("TITLE_QUIT"), "quit", func(): app.quit_game()])
	for en in entries:
		var line := TitleLine.new(str(en[0]), int(34 * k)); line.name = "Line_" + str(en[1]); line.pressed.connect(en[2]); vb.add_child(line)
		if first == null: first = line
	var gap2 := Control.new(); gap2.custom_minimum_size = Vector2(0, 14 * k); vb.add_child(gap2)
	var cute := TitleLine.new(T("CUTE_ON") if GridSettings.cute else T("CUTE_OFF"), int(20 * k), true); cute.name = "Line_cute"; cute.tooltip_text = T("CUTE_HINT")
	cute.pressed.connect(func():
		GridSettings.set_cute(app, not GridSettings.cute)
		cute.text = T("CUTE_ON") if GridSettings.cute else T("CUTE_OFF"))
	vb.add_child(cute)
	var drift := Drift.new(); drift.app = app; root.add_child(drift)
	if first != null: first.call_deferred("grab_focus")
	return true

## A new game: the first job as a Learner (the work order opens over the dimmed island), or the player's last mode if they chose Engineer before.
static func new_night_shift(app: CbApp) -> void:
	if CbSettings.last_mode == "" or CbSettings.last_mode == "sandbox": CbSettings.last_mode = "learner"
	var id := "L01"
	var ids: Array = Jobs.list(app).map(func(lv): return str(lv.id))
	if not ids.has(id) and not ids.is_empty(): id = str(ids[0])
	app.start_level(id, true)

static func _grad(from: Vector2, to: Vector2, alpha: float) -> TextureRect:
	var g := Gradient.new(); g.colors = PackedColorArray([Color(GridTheme.NIGHT, alpha), Color(GridTheme.NIGHT, 0.0)]); g.offsets = PackedFloat32Array([0.0, 1.0])
	var t := GradientTexture2D.new(); t.gradient = g; t.fill_from = from; t.fill_to = to; t.width = 256; t.height = 256
	var r := TextureRect.new(); r.texture = t; r.stretch_mode = TextureRect.STRETCH_SCALE; r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return r

## One plain text menu line with a sodium focus bar at its left.
class TitleLine extends Button:
	var dim := false
	func _init(t := "", size := 34, is_dim := false) -> void:
		dim = is_dim; text = t; flat = true; focus_mode = Control.FOCUS_ALL; alignment = HORIZONTAL_ALIGNMENT_LEFT; mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		add_theme_font_override("font", GridTheme.font("semi")); add_theme_font_size_override("font_size", GridTheme.fs(size))
		var e := StyleBoxEmpty.new(); e.content_margin_left = 0; e.content_margin_right = 10; e.content_margin_top = 4; e.content_margin_bottom = 4
		for s in ["normal", "hover", "pressed", "hover_pressed", "focus", "disabled"]: add_theme_stylebox_override(s, e)
		add_theme_color_override("font_color", GridTheme.DIM if dim else GridTheme.TEXT)
		for c in ["font_hover_color", "font_pressed_color", "font_focus_color", "font_hover_pressed_color"]: add_theme_color_override(c, GridTheme.SODIUM)
		mouse_entered.connect(func(): if is_inside_tree(): grab_focus())
		focus_entered.connect(queue_redraw); focus_exited.connect(queue_redraw)
		custom_minimum_size.y = maxf(size * 1.35, CbLayout.tap())
	func _draw() -> void:
		if has_focus(): draw_rect(Rect2(-22, 6, 6, size.y - 12), GridTheme.SODIUM)

## Slow camera drift of the island behind the menu (the world has no 3D orbit; a gentle pan and zoom breathes instead). Resets the camera when the title closes.
class Drift extends Node:
	var app: CbApp
	var t := 0.0
	func _ready() -> void:
		tree_exiting.connect(func():
			var w = app.get("grid_world")
			if w != null: w.set_camera("reset"))
	func _process(dt: float) -> void:
		var w = app.get("grid_world")
		if w == null or app.started or not PaperKit.animate() and t > 0.0: return
		t += dt
		var m: Vector2 = w.model.map if w.model.has("map") else Vector2(36, 17)
		w.set_camera("zoom=%f,tx=%f,ty=%f" % [1.12 + 0.03 * sin(t * 0.11), m.x * 0.5 + 2.4 + 2.0 * sin(t * 0.07), m.y * 0.5 + 0.4 * cos(t * 0.05)])
