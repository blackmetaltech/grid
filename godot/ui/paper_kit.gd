class_name PaperKit
extends RefCounted
## Shared pieces of GRID's paper screens (work order, shift / incident report, pause card, jobs clipboard): the docket sheet built on the shell's
## `app.dialog()` (so Esc / B / Back keep working), slide-in and fold-into-the-pin animations, paper-ink labels and buttons, and a few hand-drawn
## controls (lamp with a stamp, pencil check box, tick, doodle bulb, dashed rule, histogram in print ink). Display only.

const INK := GridTheme.PAPER_INK
const RED := Color("#A8321F")        ## incident red ink
const BLUE := Color("#2E4A86")       ## ADA's pen
const AMBER := Color("#B5700F")      ## outline of a lit lamp on paper (sodium alone is too pale on cream)
const SPEAKER := {"TOBI": Color("#8A5A0A"), "NIA": Color("#2A7A52"), "ADA": Color("#4A3F8A"), "VANCE": Color("#7A4A1E"), "SYS": Color("#5A5648")}

static func T(key: String) -> String: return TranslationServer.translate(key)

## Animations run only on a real display with motion allowed; smoke and headless runs snap straight to the end state.
static func animate() -> bool:
	return DisplayServer.get_name() != "headless" and not CbSettings.reduced_motion and not OS.has_environment("CB_SMOKE")

# ---- labels and buttons --------------------------------------------------------------------------------------------------------------
static func lbl(text: String, size := 17, kind := "sans", col: Color = INK, wrap := false) -> Label:
	var l := GridTheme.label(text, size, col, kind)
	if wrap: l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	return l

static func _btn_sb(bg: Color, edge: Color, bw := 2) -> StyleBoxFlat:
	var s := StyleBoxFlat.new(); s.bg_color = bg; s.border_color = edge; s.set_border_width_all(bw); s.set_corner_radius_all(6)
	s.content_margin_left = 22; s.content_margin_right = 22; s.content_margin_top = 10; s.content_margin_bottom = 10
	return s

static func _focus_sb() -> StyleBoxFlat:
	var s := StyleBoxFlat.new(); s.draw_center = false; s.border_color = INK; s.set_border_width_all(3); s.set_corner_radius_all(8); s.set_expand_margin_all(3)
	return s

## A button in paper style: `primary` = sodium (the one action), otherwise a ghost with an ink border.
static func btn(text: String, primary: bool, cb: Callable, size := 20) -> Button:
	var b := Button.new(); b.text = text; b.focus_mode = Control.FOCUS_ALL; b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	b.add_theme_font_override("font", GridTheme.font("semi")); b.add_theme_font_size_override("font_size", GridTheme.fs(size))
	var fc: Color = GridTheme.NIGHT if primary else INK
	for k in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]: b.add_theme_color_override(k, fc)
	if primary:
		b.add_theme_stylebox_override("normal", _btn_sb(GridTheme.SODIUM, Color("#8A5F1E")))
		b.add_theme_stylebox_override("hover", _btn_sb(GridTheme.SODIUM.lightened(0.18), Color("#8A5F1E")))
		b.add_theme_stylebox_override("pressed", _btn_sb(GridTheme.SODIUM.darkened(0.1), Color("#8A5F1E")))
	else:
		b.add_theme_stylebox_override("normal", _btn_sb(Color(INK, 0.0), Color(INK, 0.7)))
		b.add_theme_stylebox_override("hover", _btn_sb(Color(INK, 0.1), INK))
		b.add_theme_stylebox_override("pressed", _btn_sb(Color(INK, 0.18), INK))
	b.add_theme_stylebox_override("focus", _focus_sb())
	b.custom_minimum_size = Vector2(0, maxf(52.0, CbLayout.tap()))
	b.pressed.connect(cb)
	return b

## Segmented chip: options = [[id, label], ...]; `on_pick(id)` runs when another one is chosen.
static func chip(options: Array, selected: String, on_pick: Callable) -> HBoxContainer:
	var hb := HBoxContainer.new(); hb.add_theme_constant_override("separation", 0)
	for o in options:
		var id: String = str(o[0]); var on: bool = id == selected
		var b := Button.new(); b.text = str(o[1]); b.toggle_mode = false; b.focus_mode = Control.FOCUS_ALL; b.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		b.add_theme_font_override("font", GridTheme.font("semi")); b.add_theme_font_size_override("font_size", GridTheme.fs(16))
		var fc: Color = GridTheme.NIGHT if on else INK
		for k in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]: b.add_theme_color_override(k, fc)
		var sb := _btn_sb(GridTheme.SODIUM if on else Color(INK, 0.0), INK, 2); sb.set_corner_radius_all(14); sb.content_margin_top = 4; sb.content_margin_bottom = 4; sb.content_margin_left = 16; sb.content_margin_right = 16
		for k in ["normal", "pressed"]: b.add_theme_stylebox_override(k, sb)
		var hv := sb.duplicate() as StyleBoxFlat; hv.bg_color = GridTheme.SODIUM.lightened(0.15) if on else Color(INK, 0.1); b.add_theme_stylebox_override("hover", hv)
		b.add_theme_stylebox_override("focus", _focus_sb())
		b.custom_minimum_size.y = maxf(38.0, CbLayout.tap() * 0.8)
		if not on: b.pressed.connect(func(): on_pick.call(id))
		hb.add_child(b)
	return hb

static func rule() -> Control: return DashedRule.new()

# ---- the sheet -----------------------------------------------------------------------------------------------------------------------
## A modal paper docket (dialog host named `name`, class PaperHost). Returns the dialog dictionary {host, panel, vb}; `vb` is the sheet's column.
static func sheet(app: CbApp, name: String, w: float, h: float, dim := 0.8, pad := 30.0) -> Dictionary:
	var d: Dictionary = app.dialog(name, w, h, INK, dim)
	var host: Control = d.host
	host.set_script(PaperHost); host.theme = GridTheme.theme()
	(host.get_child(0) as ColorRect).color = Color(GridTheme.NIGHT, dim)
	var pn: PanelContainer = d.panel
	pn.clip_contents = false
	pn.add_theme_stylebox_override("panel", GridTheme.paper_sb(4, pad))
	var tape := Tape.new(); pn.add_child(tape)
	(d.vb as VBoxContainer).add_theme_constant_override("separation", 10)
	return d

## Panel slides up from below and the dim fades in.
static func slide_in(d: Dictionary, from_below := 80.0) -> void:
	if not animate(): return
	var pn: Control = d.panel; var host: Control = d.host
	var ot := pn.offset_top; var ob := pn.offset_bottom; var dim := host.get_child(0) as ColorRect; var da := dim.color.a
	pn.offset_top = ot + from_below; pn.offset_bottom = ob + from_below; pn.modulate.a = 0.0; dim.color.a = 0.0
	var tw := pn.create_tween().set_parallel(true).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tw.tween_property(pn, "offset_top", ot, 0.34); tw.tween_property(pn, "offset_bottom", ob, 0.34)
	tw.tween_property(pn, "modulate:a", 1.0, 0.24); tw.tween_property(dim, "color:a", da, 0.3)

## The panel shrinks into `target` (screen point, normally the pin), then the host is freed and `on_done` runs.
static func fold(d: Dictionary, target: Vector2, on_done := Callable()) -> void:
	var host: Control = d.host
	if not is_instance_valid(host) or host.has_meta("folding"): return
	host.set_meta("folding", true)
	if not animate():
		host.queue_free()
		if on_done.is_valid(): on_done.call()
		return
	var pn: Control = d.panel; var dim := host.get_child(0) as ColorRect
	pn.pivot_offset = target - pn.global_position
	var tw := pn.create_tween().set_parallel(true).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_IN)
	tw.tween_property(pn, "scale", Vector2(0.06, 0.06), 0.3); tw.tween_property(pn, "modulate:a", 0.0, 0.3); tw.tween_property(dim, "color:a", 0.0, 0.3)
	tw.chain().tween_callback(func():
		if is_instance_valid(host): host.queue_free()
		if on_done.is_valid(): on_done.call())

## QA screenshots: open a paper screen by name from CB_CAM (`paper=menu`, `jobs`, `workorder`, `report`).
static func qa(app: CbApp, what: String) -> void:
	match what:
		"menu": app.open_menu()
		"jobs": Jobs.open(app)
		"workorder": WorkOrder.open(app)
		"report": app.end_seen = false; app.menus.end_card()

# ---- hand-drawn controls -------------------------------------------------------------------------------------------------------------
## Strip of tape across the top edge of a sheet.
class Tape extends Control:
	func _init() -> void: mouse_filter = Control.MOUSE_FILTER_IGNORE
	func _draw() -> void:
		var w := 120.0; var h := 30.0
		draw_set_transform(Vector2(size.x * 0.5, -4.0), deg_to_rad(-2.5), Vector2.ONE)
		draw_rect(Rect2(-w * 0.5 + 2, -h * 0.5 + 3, w, h), Color(0, 0, 0, 0.12))
		draw_rect(Rect2(-w * 0.5, -h * 0.5, w, h), Color(GridTheme.SODIUM, 0.55))
		for i in 7: draw_line(Vector2(-w * 0.5, -h * 0.5 + 4 + i * 4.0), Vector2(w * 0.5, -h * 0.5 + 4 + i * 4.0), Color(1, 1, 1, 0.12), 1.0)

class DashedRule extends Control:
	func _init() -> void: custom_minimum_size = Vector2(0, 8); mouse_filter = Control.MOUSE_FILTER_IGNORE; size_flags_horizontal = Control.SIZE_EXPAND_FILL
	func _draw() -> void:
		var x := 0.0
		while x < size.x:
			draw_line(Vector2(x, 4), Vector2(minf(x + 7.0, size.x), 4), Color(INK, 0.45), 2.0); x += 12.0

## A pencil-drawn empty check box (a pass condition not yet met).
class Check extends Control:
	var done := false
	func _init(d := false) -> void: done = d; custom_minimum_size = Vector2(30, 30); mouse_filter = Control.MOUSE_FILTER_IGNORE; size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	func _draw() -> void:
		var c := Color(INK, 0.85)
		var pts := PackedVector2Array([Vector2(5, 6), Vector2(25, 5), Vector2(26, 25), Vector2(4, 26), Vector2(5, 5)])
		draw_polyline(pts, c, 2.4, true)
		if done: draw_polyline(PackedVector2Array([Vector2(8, 16), Vector2(14, 22), Vector2(29, 2)]), PaperKit.BLUE, 3.2, true)

## Nia's pencil tick (Cute mode): a little graphite check with a pencil stub.
class Tick extends Control:
	func _init() -> void: custom_minimum_size = Vector2(46, 30); mouse_filter = Control.MOUSE_FILTER_IGNORE; size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	func _draw() -> void:
		var g := Color("#55525F")
		draw_polyline(PackedVector2Array([Vector2(3, 15), Vector2(10, 23), Vector2(24, 4)]), g, 3.0, true)
		draw_line(Vector2(30, 24), Vector2(44, 10), Color("#D9A441"), 6.0, true)
		draw_line(Vector2(28, 26), Vector2(32, 22), Color("#E8B7A0"), 6.0, true)
		draw_colored_polygon(PackedVector2Array([Vector2(28, 26), Vector2(26, 29), Vector2(31, 27)]), g)

## Doodle of a smiling bulb in the corner of a docket (Cute mode).
class Doodle extends Control:
	func _init() -> void: custom_minimum_size = Vector2(112, 112); mouse_filter = Control.MOUSE_FILTER_IGNORE
	func _draw() -> void:
		var g := Color(INK, 0.75); var c := Vector2(56, 48); var r := 28.0
		draw_arc(c, r, deg_to_rad(-60), deg_to_rad(250), 36, g, 2.6, true)
		draw_polyline(PackedVector2Array([c + Vector2(-16, 22), c + Vector2(-12, 34), c + Vector2(12, 34), c + Vector2(16, 22)]), g, 2.6, true)
		draw_line(c + Vector2(-11, 41), c + Vector2(11, 41), g, 2.6, true); draw_line(c + Vector2(-7, 47), c + Vector2(7, 47), g, 2.6, true)
		draw_circle(c + Vector2(-9, -4), 3.0, g); draw_circle(c + Vector2(9, -4), 3.0, g)
		draw_arc(c + Vector2(0, 4), 10.0, deg_to_rad(20), deg_to_rad(160), 12, g, 2.4, true)
		for i in 7:
			var a := deg_to_rad(-150.0 + i * 50.0); var d := Vector2(cos(a), sin(a))
			draw_line(c + d * (r + 8.0), c + d * (r + 17.0), Color(PaperKit.AMBER, 0.9), 2.6, true)

## A lamp icon: unlit outline or lit sodium, with an optional inked stamp ring (`stamp` 0..1 animates the thump).
class Lamp extends Control:
	var lit := false
	var stamp := 0.0
	var ring := PaperKit.RED
	func _init(px := 96.0, is_lit := false) -> void: lit = is_lit; custom_minimum_size = Vector2(px, px * 1.1); mouse_filter = Control.MOUSE_FILTER_IGNORE
	func set_stamp(v: float) -> void: stamp = v; queue_redraw()
	func _draw() -> void:
		var c := Vector2(size.x * 0.5, size.y * 0.42); var r := size.x * 0.27
		var ink := Color(INK, 0.85)
		if lit:
			for i in 5: draw_circle(c, r * (2.0 - 0.25 * i), Color(GridTheme.SODIUM, 0.07 + 0.02 * i))
			for i in 8:
				var a := TAU * i / 8.0 + 0.2; var d := Vector2(cos(a), sin(a)); draw_line(c + d * r * 1.3, c + d * r * 1.75, Color(PaperKit.AMBER, 0.9), maxf(2.0, r * 0.1), true)
		draw_circle(c, r, GridTheme.SODIUM if lit else Color(INK, 0.07))
		draw_arc(c, r, 0.0, TAU, 40, PaperKit.AMBER if lit else ink, maxf(2.0, r * 0.1), true)
		var nk := PackedVector2Array([c + Vector2(-r * 0.55, r * 0.8), c + Vector2(r * 0.55, r * 0.8), c + Vector2(r * 0.42, r * 1.35), c + Vector2(-r * 0.42, r * 1.35)])
		draw_colored_polygon(nk, Color(INK, 0.55)); draw_polyline(nk + PackedVector2Array([nk[0]]), ink, 2.0, true)
		for k in 2: draw_line(c + Vector2(-r * 0.4, r * (1.5 + 0.2 * k)), c + Vector2(r * 0.4, r * (1.5 + 0.2 * k)), ink, 3.0, true)
		var fil := PackedVector2Array([c + Vector2(-r * 0.3, r * 0.7), c + Vector2(-r * 0.3, r * 0.1), c + Vector2(-r * 0.1, -r * 0.2), c + Vector2(r * 0.1, r * 0.1), c + Vector2(r * 0.3, -r * 0.2), c + Vector2(r * 0.3, r * 0.7)])
		draw_polyline(fil, Color("#9A4A08") if lit else Color(INK, 0.55), 2.2, true)
		if stamp > 0.0 and lit:   # ink ring pressed on the paper: starts big and faint, thumps down to size
			var k := ease(clampf(stamp, 0.0, 1.0), 0.35); var sc := lerpf(1.9, 1.0, k); var al := clampf(stamp * 2.0, 0.0, 1.0) * 0.9
			draw_set_transform(c, deg_to_rad(-9.0), Vector2(sc, sc))
			draw_arc(Vector2.ZERO, r * 1.95, 0.0, TAU, 56, Color(ring, al), 5.0, true)
			draw_arc(Vector2.ZERO, r * 1.72, 0.0, TAU, 56, Color(ring, al * 0.8), 2.0, true)

## The histogram of the result card in print ink (same data as HistView, drawn with the paper palette). Never shown on a failure.
class PaperHist extends HistView:
	func _x2(v: float, lo: float, hi: float, x0: float, w: float) -> float: return x0 + w * clampf((v - lo) / maxf(hi - lo, 1e-9), 0.0, 1.0)
	func _draw() -> void:
		var bins: Array = r.get("bins", [])
		if bins.is_empty(): return
		var f := GridTheme.font("mono"); var fs := GridTheme.fs(13)
		var x0 := 6.0; var w := size.x - 12.0; var base := size.y - 22.0; var top := 8.0
		var lo := float(bins[0].from); var hi := float(bins[bins.size() - 1].to)
		var mx := 1
		for b in bins: mx = maxi(mx, int(b.count))
		var bw := w / bins.size()
		for i in bins.size():
			var h := (base - top) * float(int(bins[i].count)) / mx
			draw_rect(Rect2(x0 + i * bw + 1.0, base - h, bw - 2.0, h), Color(GridTheme.COPPER, 0.8))
			draw_rect(Rect2(x0 + i * bw + 1.0, base - h, bw - 2.0, h), Color(INK, 0.5), false, 1.0)
		draw_line(Vector2(x0, base), Vector2(x0 + w, base), Color(INK, 0.8), 2.0)
		draw_string(f, Vector2(x0, size.y - 5.0), CbKit.num(lo, 0), HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color(INK, 0.75))
		draw_string(f, Vector2(x0 + w - 70.0, size.y - 5.0), CbKit.num(hi, 0), HORIZONTAL_ALIGNMENT_RIGHT, 70.0, fs, Color(INK, 0.75))
		if r.get("mine") != null:
			var mx_ := _x2(float(r.mine), lo, hi, x0, w)
			draw_line(Vector2(mx_, top), Vector2(mx_, base), PaperKit.RED, 3.0)
			draw_string(f, Vector2(clampf(mx_ + 5.0, 0.0, size.x - 44.0), top + 10.0), tr("HIST_YOU"), HORIZONTAL_ALIGNMENT_LEFT, -1, fs, PaperKit.RED)
		if str(r.get("histogram", "")) == "capex":
			for pair in [[r.get("starA"), "HIST_STAR_A"], [r.get("starB"), "HIST_STAR_B"]]:
				if pair[0] == null or float(pair[0]) < lo or float(pair[0]) > hi: continue
				var sx := _x2(float(pair[0]), lo, hi, x0, w)
				draw_line(Vector2(sx, top + 14.0), Vector2(sx, base), PaperKit.BLUE, 2.0)
				draw_string(f, Vector2(sx + 3.0, top + 24.0), tr(pair[1]), HORIZONTAL_ALIGNMENT_LEFT, -1, fs, PaperKit.BLUE)
