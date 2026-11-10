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
var tray: KitTray                ## the kit tray (bench levels): hut, reels, price tag
var tags: TagView                ## in-world paper tags
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
	_build_tools()
	menu_btn = Button.new(); menu_btn.name = "Menu"; menu_btn.text = "☰"; menu_btn.flat = true; menu_btn.focus_mode = CbKit.focus_mode()
	menu_btn.tooltip_text = TranslationServer.translate("MENU_TIP"); menu_btn.add_theme_font_size_override("font_size", GridTheme.fs(22))
	menu_btn.pressed.connect(func(): app.open_menu()); add_child(menu_btn)
	set_chrome_visible(false)

## Kit tray + tags: wired to the bridge, the world and the radio. The relay node (added after the core pad) hears pad / Esc first.
func _build_tools() -> void:
	var world: WorldView = app.get("grid_world")
	tray = KitTray.new(); tray.b = app.b; tray.world = world; tray.radio = radio; tray.instruments = instruments
	tray.sfx = func(cue: String): app.sfx(cue)
	tray.slot = tray_rect; tray.locked = _night_locked; add_child(tray)
	tags = TagView.new(); tags.b = app.b; tags.world = world; tags.instruments = instruments; tags.slot = tray_rect; add_child(tags)
	tray.tags = tags
	if world != null:
		world.tapped.connect(on_world_tap); world.long_pressed.connect(on_world_long); world.hovered.connect(func(p): tray.on_hover(p))
	var relay := KitTray.Relay.new(); relay.chrome = self; relay.name = "TrayRelay"
	app.add_child.call_deferred(relay)

## The cable cannot change while the night runs or once the level is over.
func _night_locked() -> bool:
	return app.speed > 0 or str(app.b.g.get("status", "playing")) != "playing"

## Tap on the world: the tray first (a pick in progress), then the tags.
func on_world_tap(p: Vector2) -> void:
	var wv = app.get("grid_world")
	var bk: String = wv.breaker_at(p) if wv != null and wv.has_method("breaker_at") else ""
	if bk != "" and app.modal() == null and str(app.b.g.get("status", "playing")) == "playing":   # P0: the glowing breaker closes the line
		var r: Dictionary = app.b.act("switchBranch", [bk, true])
		app.sfx("breaker_close" if r.get("ok", false) else "bad"); app.toast(str(r.get("message", "")), "good" if r.get("ok", false) else "bad")
		app.game_on_changed(); return
	if not _on or tray == null: return
	if tray.visible and tray.on_tap(p): return
	if tray.visible or tags.is_open(): tags.on_tap(p)

func on_world_long(p: Vector2) -> void:
	if _on and tray != null and tags.on_long_press(p): tray.cancel()

## Pad buttons and Esc, before the shell: tray first, then the open tag. True when used.
func handle_input(e: InputEvent) -> bool:
	if not _on or tray == null or app.modal() != null: return false
	if e is InputEventKey:
		if e.pressed and not e.echo and e.keycode == KEY_ESCAPE: return tray.cancel_key() or tags.close()
		if e.pressed and not e.echo and e.keycode == KEY_X and tags.is_open(): return tags.close()
		return false
	if e is InputEventJoypadButton and e.pressed and CbPad.enabled:
		var jb := e as InputEventJoypadButton
		if jb.button_index == JOY_BUTTON_B:   # B: undo the pick, else step out of the tray, else close the tag, else leave it to the shell
			if tray.mode != "" or tray.engaged: return tray.pad_button(jb.button_index)
			return tags.close()
		if jb.button_index == JOY_BUTTON_X and not tags.is_open():   # X: the breaker (X also closes an open tag, as on the keyboard)
			breaker.toggle(); return true
		if jb.button_index == JOY_BUTTON_X: return tags.close()
		return tray.pad_button(jb.button_index)
	return false

## QA screenshots (CB_CAM "ui=..."): hut | reel/2.5 | hover/2.5 | peg/2 | run/0 | tag/cable/main | tag/hamlet/h1
func qa_ui(spec: String) -> void:
	if tray == null: return
	var f := spec.split("/")
	match f[0]:
		"hut": tray.activate(tray.item_index("hut"))
		"reel": tray.activate(tray.item_index("reel", float(f[1])))
		"hover": tray.hover = tray.item_index("reel", float(f[1])); tray._after_hover()
		"peg", "run": tray.set_target_hi(int(f[1]))
		"tag": tags.open(f[1], f[2])
		"padx":
			var jb := InputEventJoypadButton.new(); jb.button_index = JOY_BUTTON_X; jb.pressed = true; handle_input(jb)
		"pad": if app.pad != null: app.pad.set_active(true)
		"focus": tray.engaged = true; tray.focus = int(f[1]); tray._update_preview(); tray.queue_redraw()
		"say": for ln in f.slice(1): radio.say("TOBI", ln.replace("_", " "), "coach", "qa%d" % radio.lines.size(), "Because copper resists.")
		"why": for l in radio.lines: if l.kind == "coach" and l.step != "" and str(l.get("why", "")) != "": radio.ask_why(l); break

func tray_active() -> bool: return tray != null and tray.visible

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
	if tray != null: tray.refresh(); tags.refresh()
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
	if tray != null and tray.key(e): return true
	match e.keycode:
		KEY_SPACE:
			if space_steps: return false   # core then ticks once
			breaker.toggle(); return true
		KEY_PERIOD: app.next_tick(); return true
		KEY_PLUS, KEY_EQUAL, KEY_KP_ADD: breaker.step_rate(1); return true
		KEY_MINUS, KEY_KP_SUBTRACT: breaker.step_rate(-1); return true
	return false

## Slot for the kit tray (bottom-centre), between the radio and the breaker.
func tray_rect() -> Rect2:
	var w := app.vw(); var h := app.vs_h()
	var l := radio.position.x + radio.size.x + M; var r := breaker.position.x - M
	var hint = app.pad.hint if app.pad != null else null
	if hint != null and hint.visible and CbKit.pad_mode: l = maxf(l, hint.position.x + hint.size.x + M)   # the pad hint strip runs under the radio: the tray starts after it
	return Rect2(Vector2(l, h - 96.0 - M), Vector2(maxf(0.0, r - l), 96.0))

## Bottom edge of the radio: above the pad hint strip while it shows (handheld / phone: the strip would sit on the radio).
func _radio_y() -> float:
	var y := app.vs_h() - M - radio.size.y
	var hint = app.pad.hint if app.pad != null else null
	if hint != null and hint.visible and CbKit.pad_mode and hint.position.x < radio.position.x + radio.width:
		y = minf(y, hint.position.y - 6.0 - radio.size.y)
	return y

func layout() -> void:
	if app == null or instruments == null: return
	var w := app.vw(); var h := app.vs_h(); var kind := CbLayout.kind
	instruments.layout()
	if tray != null: tray.layout()
	if app.cur == app.home and app.drawer_tab != null: app.drawer_tab.visible = false
	var left: float = M + (app.world_tools_w() if CbLayout.touch and app.has_method("world_tools_w") else 0.0)
	var nl := 1 if kind == "phone" else 4; var nw := clampf(w * (0.30 if kind == "desktop" else 0.34), 300.0, 560.0)
	var cap := h * 0.30
	if nl != radio.visible_lines or nw != radio.width or cap != radio.max_h: radio.visible_lines = nl; radio.width = nw; radio.max_h = cap; radio._rebuild()
	radio.position = Vector2(left, _radio_y())
	var bs := 0.80 if kind == "phone" else (1.0 if kind == "desktop" else 0.92)
	breaker.scale = Vector2(bs, bs); breaker.size = breaker.custom_minimum_size
	var bw := breaker.size.x * bs; var bh := breaker.size.y * bs
	breaker.position = Vector2(w - M - bw, h - M - bh)
	var tap := maxf(CbLayout.tap(), 36.0)
	menu_btn.custom_minimum_size = Vector2(tap, tap); menu_btn.size = Vector2(tap, tap); menu_btn.position = Vector2(w - M - tap, M)
	pin.position = Vector2(M, M); pin.size = Vector2(0, 0)

var _pad_seen := false
func _process(_dt: float) -> void:
	if not _on or radio == null or app == null: return
	var ph: bool = CbKit.pad_mode and app.pad != null and app.pad.hint.visible
	if ph != _pad_seen: _pad_seen = ph; layout()
	radio.position.y = _radio_y()
	if app.cur == app.home and app.drawer_tab != null and app.drawer_tab.visible: app.drawer_tab.visible = false   # the core re-shows its grip on some paths
