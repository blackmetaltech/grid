class_name GridTheme
extends RefCounted
## GRID's own look (design/grid/UI.md "Palette" and "Type"): night-shift gear, not a SaaS dashboard. Tokens, fonts, StyleBox helpers and a Theme
## for every control under the GRID chrome. Nothing here knows the engine.

const NIGHT := Color("#0B1026")
const INK := Color("#141A33")
const SODIUM := Color("#FFC56B")
const SODIUM_DIM := Color("#B8894A")
const PAPER := Color("#EFE6CF")
const PAPER_INK := Color("#2A2418")
const METER_FACE := Color("#F3EEDF")
const COPPER := Color("#C8794A")
const LIVE := Color("#39E1FF")      ## physics only (power-flow ribbons); never chrome
const REACTIVE := Color("#FF4FD8")  ## physics only (Q overlay)
const WARN := Color("#FFB020")
const BAD := Color("#E5484D")
const GOOD := Color("#5BD69A")
const TEXT := Color("#ECE7DA")
const DIM := Color("#9C9A93")

const DIR := "res://ui/fonts/"
static var _files := {}
static var _fonts := {}

static func _file(n: String) -> Font:
	if _files.has(n): return _files[n]
	var f: Font = ThemeDB.fallback_font
	var p := DIR + n
	if ResourceLoader.exists(p):
		var r = load(p)
		if r is Font: f = r
	elif FileAccess.file_exists(p):   # fresh checkout, not imported yet: read the file directly
		var ff := FontFile.new()
		if ff.load_dynamic_font(p) == OK: f = ff
	_files[n] = f
	return f

static func _wght(base: Font, w: int) -> Font:
	var fv := FontVariation.new(); fv.base_font = base
	fv.variation_opentype = {((0x77 << 24) | (0x67 << 16) | (0x68 << 8) | 0x74): w}   # 'wght'
	return fv

## kind: "title" (Big Shoulders 800), "sans" (Plex Sans 400), "semi" (Plex Sans 600), "mono" (Plex Mono Medium)
static func font(kind: String) -> Font:
	if _fonts.has(kind): return _fonts[kind]
	var f: Font
	match kind:
		"title": f = _wght(_file("BigShouldersDisplay.ttf"), 800)
		"semi": f = _wght(_file("IBMPlexSans.ttf"), 600)
		"mono": f = _file("IBMPlexMono-Medium.ttf")
		_: f = _wght(_file("IBMPlexSans.ttf"), 400)
	_fonts[kind] = f
	return f

## Text size through the shell's own scaling rule (floor, content scale) so Settings > text size keeps working.
static func fs(n: int) -> int: return CbKit.fs(n)

static var _ls := {}
static func settings(size: int, col: Color, kind := "sans") -> LabelSettings:
	size = fs(size)
	var k := "%s|%d|%s" % [kind, size, col.to_html()]
	if _ls.has(k): return _ls[k]
	var s := LabelSettings.new(); s.font = font(kind); s.font_size = size; s.font_color = col
	_ls[k] = s
	return s

static func label(text: String, size := 16, col: Color = TEXT, kind := "sans") -> Label:
	var l := Label.new(); l.text = text; l.label_settings = settings(size, col, kind)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l

static func _sb(bg: Color, edge: Color, r: int, bw: int, pad: float) -> StyleBoxFlat:
	var s := StyleBoxFlat.new(); s.bg_color = bg; s.border_color = edge; s.set_border_width_all(bw); s.set_corner_radius_all(r)
	s.content_margin_left = pad; s.content_margin_right = pad; s.content_margin_top = pad * 0.7; s.content_margin_bottom = pad * 0.7
	return s

static func ink_sb(alpha := 0.94, r := 8, pad := 12.0) -> StyleBoxFlat:
	return _sb(Color(INK, alpha), Color(SODIUM_DIM, 0.35), r, 1, pad)

static func paper_sb(r := 4, pad := 16.0) -> StyleBoxFlat:
	var s := _sb(PAPER, Color(PAPER_INK, 0.35), r, 1, pad)
	s.shadow_color = Color(0, 0, 0, 0.35); s.shadow_size = 6; s.shadow_offset = Vector2(2, 3)
	return s

static func meter_face_sb(r := 10) -> StyleBoxFlat:
	return _sb(METER_FACE, Color(NIGHT, 0.9), r, 4, 0.0)

## Sodium focus: a 3 px ring, the one accent the interface owns.
static func focus_sb() -> StyleBoxFlat:
	var s := StyleBoxFlat.new(); s.draw_center = false; s.border_color = SODIUM; s.set_border_width_all(3); s.set_corner_radius_all(6); s.set_expand_margin_all(2)
	return s

static var _theme: Theme
## Default look of Labels, Buttons and friends under the GRID chrome: Plex Sans, GRID colours, sodium focus.
static func theme() -> Theme:
	if _theme != null: return _theme
	var t := Theme.new(); t.default_font = font("sans"); t.default_font_size = fs(16)
	t.set_font("normal_font", "RichTextLabel", font("sans")); t.set_font("bold_font", "RichTextLabel", font("semi")); t.set_font("mono_font", "RichTextLabel", font("mono"))
	t.set_color("default_color", "RichTextLabel", TEXT)
	t.set_color("font_color", "Label", TEXT)
	for c in ["Button", "LinkButton", "CheckBox", "OptionButton"]:
		t.set_font("font", c, font("semi")); t.set_font_size("font_size", c, fs(16))
		t.set_color("font_color", c, TEXT); t.set_color("font_hover_color", c, SODIUM); t.set_color("font_pressed_color", c, SODIUM)
		t.set_color("font_focus_color", c, SODIUM); t.set_stylebox("focus", c, focus_sb())
	var n := _sb(Color(INK, 0.9), Color(SODIUM_DIM, 0.5), 6, 1, 12.0); var h := _sb(Color(INK, 1.0).lightened(0.08), SODIUM, 6, 1, 12.0)
	var p := _sb(Color(SODIUM, 0.2), SODIUM, 6, 1, 12.0)
	t.set_stylebox("normal", "Button", n); t.set_stylebox("hover", "Button", h); t.set_stylebox("pressed", "Button", p); t.set_stylebox("hover_pressed", "Button", p)
	t.set_stylebox("disabled", "Button", _sb(Color(INK, 0.5), Color(DIM, 0.25), 6, 1, 12.0))
	t.set_stylebox("panel", "PanelContainer", ink_sb())
	_theme = t
	return t

static func apply(c: Control) -> void: c.theme = theme()
