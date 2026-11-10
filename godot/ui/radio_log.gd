class_name RadioLog
extends PanelContainer
## The radio (UI.md 2): bottom-left, ink, Plex Mono, three visible lines with the newest at the bottom, older ones fade. Replaces toasts and the
## coach card. `say(speaker, text, kind)` adds a line stamped with the engine clock; the current coach step carries a sodium tick and a "why?"
## link that makes ADA explain. Click the panel for the full log (a modal dialog).

signal why_said(step_id: String)
const SPEAKERS := {"TOBI": GridTheme.SODIUM, "ADA": GridTheme.PAPER, "VANCE": GridTheme.SODIUM_DIM, "NIA": GridTheme.GOOD, "SYS": GridTheme.DIM}
var app: CbApp
var lines: Array = []        ## {time, speaker, text, kind, step, why}
var _box: VBoxContainer
var _current := ""           ## step id of the coach line that carries the tick
var last_clock := "--:--"
var width := 560.0
var visible_lines := 3      ## phone: 1

func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	add_theme_stylebox_override("panel", GridTheme.ink_sb(0.92, 8, 12.0))
	_box = VBoxContainer.new(); _box.add_theme_constant_override("separation", 4); _box.mouse_filter = Control.MOUSE_FILTER_IGNORE; add_child(_box)
	visible = false

func clock_text() -> String:
	if app != null and app.started and app.b != null:
		var c = app.b.q("clock")
		if c is Dictionary and not c.is_empty(): last_clock = "%02d:%02d" % [int(c.hour), int(c.minute)]
	return last_clock

func clear() -> void: lines.clear(); _current = ""; _rebuild()

## kind: coach | why | story | sys | warn. `step` (coach lines) is the engine step id; `why` the text ADA says for it.
func say(speaker: String, text: String, kind := "sys", step := "", why := "") -> void:
	if text == "": return
	if not lines.is_empty() and lines.back().text == text and lines.back().speaker == speaker: return   # an identical repeat adds nothing
	lines.append({"time": clock_text(), "speaker": speaker, "text": text, "kind": kind, "step": step, "why": why})
	if kind == "coach" and step != "": _current = step
	while lines.size() > 200: lines.pop_front()
	visible = true; _rebuild()

func set_current(step_id: String) -> void: _current = step_id; _rebuild()

func _prefix(l: Dictionary) -> String: return "%s  %-5s ›" % [l.time, l.speaker]

func _color(l: Dictionary) -> Color:
	if l.kind == "warn": return GridTheme.WARN
	return SPEAKERS.get(l.speaker, GridTheme.TEXT)

## One display row; `full` rows (log dialog) never truncate.
func make_row(l: Dictionary, alpha := 1.0, full := false) -> Control:
	var row := HBoxContainer.new(); row.add_theme_constant_override("separation", 8); row.mouse_filter = Control.MOUSE_FILTER_IGNORE; row.modulate.a = alpha
	var live: bool = l.kind == "coach" and l.step != "" and l.step == _current
	var tick := ColorRect.new(); tick.custom_minimum_size = Vector2(3, 0); tick.color = GridTheme.SODIUM if live else Color(0, 0, 0, 0); tick.mouse_filter = Control.MOUSE_FILTER_IGNORE; row.add_child(tick)
	var sz := 15
	var pre := GridTheme.label(_prefix(l), sz, _color(l), "mono"); pre.size_flags_vertical = Control.SIZE_SHRINK_BEGIN; row.add_child(pre)
	var tx := GridTheme.label(str(l.text), sz, GridTheme.WARN if l.kind == "warn" else GridTheme.TEXT, "mono")
	tx.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; tx.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if not full: tx.max_lines_visible = 3 if live else 2; tx.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	row.add_child(tx)
	if live and str(l.why) != "":
		var b := Button.new(); b.text = TranslationServer.translate("RADIO_WHY"); b.flat = true; b.focus_mode = CbKit.focus_mode(); b.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
		b.add_theme_color_override("font_color", GridTheme.SODIUM); b.add_theme_font_size_override("font_size", GridTheme.fs(14)); b.name = "Why"
		b.pressed.connect(func(): ask_why(l)); row.add_child(b)
	return row

## ADA explains the why of a coach line (once).
func ask_why(l: Dictionary) -> void:
	say("ADA", str(l.why), "why"); why_said.emit(str(l.step))

func _rebuild() -> void:
	if _box == null: return
	for c in _box.get_children(): _box.remove_child(c); c.queue_free()
	var n := lines.size(); var first := maxi(0, n - visible_lines)
	for i in range(first, n):
		var age := n - 1 - i
		_box.add_child(make_row(lines[i], [1.0, 0.62, 0.36][mini(age, 2)]))
	custom_minimum_size.x = width
	size = Vector2(width, 0)   # height follows content
	visible = not lines.is_empty()

func _gui_input(e: InputEvent) -> void:
	if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT: open_full(); accept_event()

## Full log, scrollable, newest at the bottom. Esc closes it (shell modal discipline).
func open_full() -> void:
	if app == null or app.modal() != null: return
	var d: Dictionary = app.dialog("radiolog", minf(900.0, app.vw() - 40.0), minf(640.0, app.vs_h() - 40.0), GridTheme.SODIUM_DIM, 0.55)
	d.host.set_script(GridDialogHost); d.host.theme = GridTheme.theme()
	(d.panel as PanelContainer).add_theme_stylebox_override("panel", GridTheme.ink_sb(0.98, 10, 22.0))
	var vb: VBoxContainer = d.vb
	var hb := HBoxContainer.new(); vb.add_child(hb)
	var t := GridTheme.label(TranslationServer.translate("RADIO_LOG_TITLE"), 34, GridTheme.SODIUM, "title"); t.size_flags_horizontal = Control.SIZE_EXPAND_FILL; hb.add_child(t)
	var x := Button.new(); x.text = TranslationServer.translate("RADIO_CLOSE"); x.focus_mode = Control.FOCUS_ALL; x.pressed.connect(func(): d.host.queue_free()); hb.add_child(x)
	var sc := ScrollContainer.new(); sc.size_flags_vertical = Control.SIZE_EXPAND_FILL; sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; vb.add_child(sc)
	var col := VBoxContainer.new(); col.add_theme_constant_override("separation", 6); col.size_flags_horizontal = Control.SIZE_EXPAND_FILL; sc.add_child(col)
	if lines.is_empty(): col.add_child(GridTheme.label(TranslationServer.translate("RADIO_EMPTY"), 15, GridTheme.DIM, "mono"))
	for l in lines: col.add_child(make_row(l, 1.0, true))
	sc.set_deferred("scroll_vertical", 100000)
	x.call_deferred("grab_focus")
