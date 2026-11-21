class_name GridNumpad
extends PanelContainer
## 1.8 pad pass: the exams ask for numbers in text boxes (chapter 2 bench, 4, 5, 6, 7 predictions), and a pad cannot type. In pad mode,
## A on a focused number box opens this pad beside it: digits, point, minus, delete, OK. The D-pad moves inside the grid (it wraps, focus never
## leaves), A presses, B cancels, OK writes the number into the box as if typed (text_changed, then text_submitted) and gives the focus back.

var target: LineEdit
var shown: Label
var text := ""
var _btns: Array = []

static func open_for(le: LineEdit, host: Control) -> GridNumpad:
	var p := GridNumpad.new(); p.name = "Numpad"; p.target = le; p.text = le.text
	host.add_child(p); p._build(); p._place()
	return p

func _build() -> void:
	add_theme_stylebox_override("panel", CareerKit.sb(Color(GridTheme.INK, 0.98), GridTheme.SODIUM, 2, 10, 12.0, 10.0))
	z_index = 50; mouse_filter = Control.MOUSE_FILTER_STOP
	var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 6); add_child(v)
	shown = CareerKit.lbl(text, 22, GridTheme.SODIUM, "mono"); shown.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT; shown.custom_minimum_size = Vector2(200, 30); v.add_child(shown)
	var g := GridContainer.new(); g.columns = 4; g.add_theme_constant_override("h_separation", 6); g.add_theme_constant_override("v_separation", 6); v.add_child(g)
	var keys := ["7", "8", "9", "⌫", "4", "5", "6", "−", "1", "2", "3", ".", "0", "OK"]
	for k in keys:
		var b := Button.new(); b.text = k if k != "OK" else tr("NUMPAD_OK"); b.name = "K_" + str(keys.find(k)); b.custom_minimum_size = Vector2(48, 44)
		b.focus_mode = Control.FOCUS_ALL; b.add_theme_font_size_override("font_size", 20)
		b.pressed.connect(_key.bind(k)); g.add_child(b); _btns.append(b)
	var ok: Button = _btns[_btns.size() - 1]; ok.custom_minimum_size.x = 48 * 3 + 12
	# wrap the focus inside the grid: the edges point back into it
	for i in _btns.size():
		var b: Button = _btns[i]; var r := i / 4; var c := i % 4
		var rows := int(ceil(_btns.size() / 4.0))
		var at := func(rr: int, cc: int) -> Button:
			var j := posmod(rr, rows) * 4 + posmod(cc, 4)
			return _btns[mini(j, _btns.size() - 1)]
		b.focus_neighbor_top = b.get_path_to(at.call(r - 1, c)); b.focus_neighbor_bottom = b.get_path_to(at.call(r + 1, c))
		b.focus_neighbor_left = b.get_path_to(at.call(r, c - 1)); b.focus_neighbor_right = b.get_path_to(at.call(r, c + 1))
	(_btns[0] as Button).grab_focus.call_deferred()

func _place() -> void:
	await get_tree().process_frame
	var r := target.get_global_rect(); var vp := get_viewport_rect().size
	var p := Vector2(r.position.x, r.position.y - size.y - 8.0)
	if p.y < 8.0: p.y = r.end.y + 8.0
	global_position = Vector2(clampf(p.x, 8.0, vp.x - size.x - 8.0), clampf(p.y, 8.0, vp.y - size.y - 8.0))

func _key(k: String) -> void:
	match k:
		"⌫": text = text.left(maxi(0, text.length() - 1))
		"−": text = text.trim_prefix("-") if text.begins_with("-") else "-" + text
		".": if not text.contains("."): text += "."
		"OK": _done(true); return
		_: text += k
	shown.text = text

func _done(apply: bool) -> void:
	if apply and is_instance_valid(target):
		target.text = text; target.text_changed.emit(text); target.text_submitted.emit(text)
	if is_instance_valid(target): target.grab_focus()
	queue_free()

func _input(e: InputEvent) -> void:
	if e is InputEventJoypadButton and e.pressed and (e as InputEventJoypadButton).button_index == JOY_BUTTON_B:
		_done(false); get_viewport().set_input_as_handled()
