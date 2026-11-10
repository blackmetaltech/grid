class_name PauseMenu
extends RefCounted
## The pause menu (cfg game_menu -> true): a small paper card. Resume, Restart job, Work order, Settings, Jobs, Title, plus the Cute mode switch (the shell's
## Settings has no game hook, so GRID's own preference lives here and on the title). Esc toggles it; Esc / B / Android Back close it through the shell
## (menu_ui is the dialog host).

static func T(key: String) -> String: return TranslationServer.translate(key)

## Called by CbApp.game_menu(): toggle. Returns true (the kit menu is never shown).
static func toggle(app: CbApp) -> bool:
	if app.menu_ui != null and is_instance_valid(app.menu_ui): app.menus.close_menu(); return true
	GridUi.load_strings()
	app.get_viewport().gui_release_focus()
	var d := PaperKit.sheet(app, "menu", 440.0, 0.0, 0.6, 28.0)
	app.menu_ui = d.host
	var vb: VBoxContainer = d.vb; vb.add_theme_constant_override("separation", 10)
	vb.add_child(PaperKit.lbl(T("PAUSE_TITLE").to_upper(), 52, "title", PaperKit.INK))
	vb.add_child(PaperKit.rule())
	var in_level: bool = app.started and app.b.q("levelInfo") is Dictionary and bool((app.b.q("levelInfo") as Dictionary).get("active", false))
	var first: Button = null
	var entries: Array = [["PAUSE_RESUME", true, func(): app.menus.close_menu()]]
	entries.append(["PAUSE_RESTART", false, func(): _restart(app)])
	if in_level: entries.append(["PAUSE_WO", false, func(): app.menus.close_menu(); WorkOrder.open(app)])
	entries.append(["PAUSE_SETTINGS", false, func(): app.menus.close_menu(); app.open_settings()])
	entries.append(["PAUSE_JOBS", false, func(): app.menus.close_menu(); Jobs.open(app)])
	entries.append(["PAUSE_TITLE_BTN", false, func(): app.menus.close_menu(); app.to_title()])
	for en in entries:
		var b := PaperKit.btn(T(str(en[0])), bool(en[1]), en[2], 22)
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT; b.size_flags_horizontal = Control.SIZE_EXPAND_FILL; vb.add_child(b)
		if first == null: first = b
	vb.add_child(PaperKit.rule())
	vb.add_child(cute_toggle(app))
	PaperKit.slide_in(d, 40.0)
	app.audio.play("open")
	(d.host as PaperHost).primary = first
	app.focus_dialog()
	return true

static func _restart(app: CbApp) -> void:
	app.menus.close_menu()
	var li = app.b.q("levelInfo")
	if app.started and li is Dictionary and li.get("active", false): app.start_level(str(li.id), true)
	else: app.new_game(app._mode_pref())

## The Cute mode row: a ghost button that reads "Cute mode: on / off" (the hint is its tooltip). Shared with the title screen.
static func cute_toggle(app: CbApp) -> Button:
	var b := PaperKit.btn(T("CUTE_ON") if GridSettings.cute else T("CUTE_OFF"), false, func(): pass, 18)
	b.name = "Cute"; b.alignment = HORIZONTAL_ALIGNMENT_LEFT; b.tooltip_text = T("CUTE_HINT")
	b.pressed.connect(func():
		GridSettings.set_cute(app, not GridSettings.cute)
		b.text = T("CUTE_ON") if GridSettings.cute else T("CUTE_OFF"))
	return b
