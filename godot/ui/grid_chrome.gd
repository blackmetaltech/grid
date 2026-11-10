class_name GridChrome
extends Control
## GRID's own in-level interface (cfg.chrome = "custom"): the instrument cluster, the radio, the breaker and the work-order pin, laid out for
## desktop / handheld / phone. Built by main.gd's game_build_chrome. Extension points for the next tasks: `tray_rect()` (bottom-centre slot the kit
## tray will take: radio and breaker keep clear of it), `add_slot(node)` (extra chrome children laid out by the owner), and the `pin_pressed` signal
## (work-order card). Display only: every number comes from engine queries.

signal pin_pressed
const M := 14.0
var app: CbApp
var instruments: Instruments
var radio: RadioLog
var breaker: Breaker
var pin: PanelContainer
var _pin_title: Label
var _pin_sub: Label
var menu_btn: Button
var _level := ""
var _coach_id := "<unset>"
var _on := false
var space_steps := OS.has_environment("CB_SMOKE")   ## core's shared smoke expects Space = one tick; the game itself toggles run

func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE; name = "GridChrome"
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	GridTheme.apply(self)

func build() -> void:
	instruments = Instruments.new(); instruments.app = app; add_child(instruments)
	instruments.codex_requested.connect(_codex)
	radio = RadioLog.new(); radio.app = app; add_child(radio)
	breaker = Breaker.new(); breaker.app = app; add_child(breaker)
	pin = PanelContainer.new(); pin.name = "Pin"; pin.mouse_filter = Control.MOUSE_FILTER_STOP; pin.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	pin.add_theme_stylebox_override("panel", GridTheme.paper_sb(3, 12.0))
	var vb := VBoxContainer.new(); vb.add_theme_constant_override("separation", 0); vb.mouse_filter = Control.MOUSE_FILTER_IGNORE; pin.add_child(vb)
	_pin_title = GridTheme.label("", 24, GridTheme.PAPER_INK, "title"); vb.add_child(_pin_title)
	_pin_sub = GridTheme.label("", 14, Color(GridTheme.PAPER_INK, 0.8), "sans"); vb.add_child(_pin_sub)
	pin.gui_input.connect(func(e): if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT: pin_pressed.emit(); pin.accept_event())
	add_child(pin)
	menu_btn = Button.new(); menu_btn.name = "Menu"; menu_btn.text = "☰"; menu_btn.flat = true; menu_btn.focus_mode = CbKit.focus_mode()
	menu_btn.tooltip_text = TranslationServer.translate("MENU_TIP"); menu_btn.add_theme_font_size_override("font_size", GridTheme.fs(22))
	menu_btn.pressed.connect(func(): app.open_menu()); add_child(menu_btn)
	set_chrome_visible(false)

func set_chrome_visible(v: bool) -> void:
	_on = v
	visible = v
	if v: refresh()

func _codex(id: String) -> void:
	for c in app.b.concepts():   # only open a Codex page that exists
		if (c is Dictionary and str(c.get("id", "")) == id) or str(c) == id: app.learn(id); return

## Engine state changed: update everything.
func refresh() -> void:
	if app == null or not app.started or instruments == null: return
	var li = app.b.q("levelInfo"); var act: bool = li is Dictionary and li.get("active", false)
	var id: String = str(li.id) if act else ""
	if id != _level: _level = id; radio.clear(); _coach_id = "<unset>"
	instruments.refresh(); breaker.sync()
	_poll_coach(act)
	_home_drawer()
	_update_pin(li if act else {})
	layout()

func _poll_coach(act: bool) -> void:
	if not act or CbSettings.tutorial == "off": return
	var c = app.b.q("coach")
	if not (c is Dictionary) or not c.get("active", false): return
	if c.get("done", false):
		if _coach_id != "": radio.set_current(""); _coach_id = ""
		return
	if str(c.id) != _coach_id: _coach_id = str(c.id); radio.say("TOBI", str(c.text), "coach", str(c.id), str(c.why))

func _update_pin(li: Dictionary) -> void:
	pin.visible = not li.is_empty()
	if li.is_empty(): return
	_pin_title.text = TranslationServer.translate("PIN_TITLE") % [str(li.id).trim_prefix("L"), str(li.title)]
	var c = app.b.q("coach")
	if c is Dictionary and c.get("active", false) and int(c.total) > 0: _pin_sub.text = TranslationServer.translate("PIN_PROGRESS") % [mini(int(c.index) + 1, int(c.total)) if not c.get("done", false) else int(c.total), int(c.total)]
	else: _pin_sub.text = ""

## The home screen is not a drawer here: fold it away so the world is full-bleed; B / I / T open the old drawers as overlays until the tray lands.
func _home_drawer() -> void:
	if app.cur == app.home:
		if not app.drawer_hidden: app.toggle_drawer()
		if app.drawer_tab != null: app.drawer_tab.visible = false

# --- called by main.gd hooks ---------------------------------------------------------------------------------------------------------
func toast(text: String, level: String) -> void:
	radio.say("SYS", text, "warn" if level == "warn" or level == "bad" else "sys")

func coach(step: Dictionary, index: int, _total: int) -> void:
	if index < 0: radio.set_current(""); return
	radio.say("TOBI", str(step.get("body", step.get("title", ""))), "coach", str(step.get("id", "step%d" % index)), str(step.get("why", "")))

## Space toggles the breaker, "." steps once. Returns true when the key was used.
func key(e: InputEventKey) -> bool:
	match e.keycode:
		KEY_SPACE:
			if space_steps: return false   # core then ticks once
			breaker.toggle(); return true
		KEY_PERIOD: app.next_tick(); return true
	return false

## Slot for the kit tray (bottom-centre), between the radio and the breaker.
func tray_rect() -> Rect2:
	var w := app.vw(); var h := app.vs_h()
	var l := radio.position.x + radio.size.x + M; var r := breaker.position.x - M
	return Rect2(Vector2(l, h - 96.0 - M), Vector2(maxf(0.0, r - l), 96.0))

func layout() -> void:
	if app == null or instruments == null: return
	var w := app.vw(); var h := app.vs_h(); var kind := CbLayout.kind
	instruments.layout()
	if app.cur == app.home and app.drawer_tab != null: app.drawer_tab.visible = false
	var left: float = M + (app.world_tools_w() if CbLayout.touch and app.has_method("world_tools_w") else 0.0)
	var nl := 1 if kind == "phone" else 3; var nw := clampf(w * (0.30 if kind == "desktop" else 0.34), 300.0, 560.0)
	if nl != radio.visible_lines or nw != radio.width: radio.visible_lines = nl; radio.width = nw; radio._rebuild()
	radio.position = Vector2(left, h - M - radio.size.y)
	var bs := 0.80 if kind == "phone" else (1.0 if kind == "desktop" else 0.92)
	breaker.scale = Vector2(bs, bs); breaker.size = breaker.custom_minimum_size
	var bw := breaker.size.x * bs; var bh := breaker.size.y * bs
	breaker.position = Vector2(w - M - bw, h - M - bh)
	var tap := maxf(CbLayout.tap(), 36.0)
	menu_btn.custom_minimum_size = Vector2(tap, tap); menu_btn.size = Vector2(tap, tap); menu_btn.position = Vector2(w - M - tap, M)
	pin.position = Vector2(M, M); pin.size = Vector2(0, 0)

func _process(_dt: float) -> void:
	if not _on or radio == null or app == null: return
	radio.position.y = app.vs_h() - M - radio.size.y
	if app.cur == app.home and app.drawer_tab != null and app.drawer_tab.visible: app.drawer_tab.visible = false   # the core re-shows its grip on some paths
