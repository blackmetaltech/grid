class_name CareerKit
extends RefCounted
## Small shared pieces of the Career screens: the dark chrome buttons and chips, the loading / health colour ramps and the bridge calls. Display only.

static func T(key: String) -> String: return TranslationServer.translate(key)

const INKBG := Color("#10162E")
const CARD := Color(1, 1, 1, 0.055)

static func lbl(text: String, size := 16, col: Color = GridTheme.TEXT, kind := "sans", wrap := false) -> Label:
	var l := GridTheme.label(text, size, col, kind)
	if wrap: l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return l

static func sb(bg: Color, edge: Color, bw := 1, r := 6, padx := 12.0, pady := 6.0) -> StyleBoxFlat:
	var s := StyleBoxFlat.new(); s.bg_color = bg; s.border_color = edge; s.set_border_width_all(bw); s.set_corner_radius_all(r)
	s.content_margin_left = padx; s.content_margin_right = padx; s.content_margin_top = pady; s.content_margin_bottom = pady
	return s

## A button on the dark chrome: `primary` = sodium fill (the one action), otherwise an outlined ghost.
static func btn(text: String, primary: bool, cb: Callable, size := 16) -> Button:
	var b := Button.new(); b.text = text; b.focus_mode = Control.FOCUS_ALL; b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	b.add_theme_font_override("font", GridTheme.font("semi")); b.add_theme_font_size_override("font_size", GridTheme.fs(size))
	var fc: Color = GridTheme.NIGHT if primary else GridTheme.TEXT
	for k in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]: b.add_theme_color_override(k, fc)
	b.add_theme_color_override("font_disabled_color", Color(GridTheme.TEXT, 0.4))
	var padx := 14.0 if size >= 16 else 9.0
	if primary:
		b.add_theme_stylebox_override("normal", sb(GridTheme.SODIUM, Color("#8A5F1E"), 2, 6, padx, 6.0))
		b.add_theme_stylebox_override("hover", sb(GridTheme.SODIUM.lightened(0.18), Color("#8A5F1E"), 2, 6, padx, 6.0))
		b.add_theme_stylebox_override("pressed", sb(GridTheme.SODIUM.darkened(0.1), Color("#8A5F1E"), 2, 6, padx, 6.0))
	else:
		b.add_theme_stylebox_override("normal", sb(Color(1, 1, 1, 0.04), Color(GridTheme.SODIUM_DIM, 0.7), 1, 6, padx, 6.0))
		b.add_theme_stylebox_override("hover", sb(Color(1, 1, 1, 0.1), GridTheme.SODIUM, 1, 6, padx, 6.0))
		b.add_theme_stylebox_override("pressed", sb(Color(GridTheme.SODIUM, 0.2), GridTheme.SODIUM, 1, 6, padx, 6.0))
	b.add_theme_stylebox_override("disabled", sb(Color(1, 1, 1, 0.02), Color(GridTheme.DIM, 0.3), 1, 6, padx, 6.0))
	b.custom_minimum_size = Vector2(0, maxf(34.0, CbLayout.tap()))
	b.pressed.connect(cb)
	return b

## A segmented chip: the chosen one is filled sodium. `cb` runs when an unchosen chip is pressed.
static func chip(text: String, on: bool, cb: Callable, size := 15) -> Button:
	var b := btn(text, on, cb, size)
	b.set_meta("selected", on)
	b.add_theme_stylebox_override("normal", sb(GridTheme.SODIUM if on else Color(1, 1, 1, 0.04), GridTheme.SODIUM if on else Color(GridTheme.SODIUM_DIM, 0.6), 1, 15, 14.0, 3.0))
	b.custom_minimum_size.y = maxf(32.0, CbLayout.tap() * 0.8)
	return b

static func card(parent: Control, edge := Color(0, 0, 0, 0)) -> VBoxContainer:
	var pc := PanelContainer.new(); pc.add_theme_stylebox_override("panel", sb(CARD, edge if edge.a > 0.0 else Color(GridTheme.SODIUM_DIM, 0.35), 1, 8, 12.0, 8.0))
	pc.size_flags_horizontal = Control.SIZE_EXPAND_FILL; parent.add_child(pc)
	var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 4); pc.add_child(v)
	return v

## Loading of a feeder, percent of rating: green under 70, amber to 100, red above.
static func load_col(pct: float) -> Color:
	if pct <= 70.0: return GridTheme.GOOD.lerp(Color("#C8E36A"), clampf(pct / 70.0, 0.0, 1.0) * 0.5)
	if pct <= 100.0: return Color("#C8E36A").lerp(GridTheme.WARN, clampf((pct - 70.0) / 30.0, 0.0, 1.0))
	return GridTheme.WARN.lerp(GridTheme.BAD, clampf((pct - 100.0) / 25.0, 0.0, 1.0))

## Health 1 (worn out) to 10 (new): red, amber, green.
static func health_col(h: float) -> Color:
	if h <= 4.0: return GridTheme.BAD.lerp(GridTheme.WARN, clampf((h - 1.0) / 3.0, 0.0, 1.0))
	return GridTheme.WARN.lerp(GridTheme.GOOD, clampf((h - 4.0) / 4.0, 0.0, 1.0))

static func num(x: float, d := 0) -> String: return CbKit.num(x, d)

## Index of a primary / feeder in the career dictionary, -1 when missing.
static func find_id(arr: Array, id: String) -> int:
	for i in arr.size():
		if str((arr[i] as Dictionary).get("id", "")) == id: return i
	return -1

## Focus a button on the next idle frame, unless its sheet is already gone.
static func focus_later(b: Control) -> void: _focus.bind(b).call_deferred()
static func _focus(b) -> void:
	if is_instance_valid(b) and (b as Control).is_inside_tree(): (b as Control).grab_focus()
