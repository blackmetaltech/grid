class_name Ch4Base
extends Control
## Chapter 4's stages share this base: an opaque stage drawn by the subclass, the bottom panel in the tray slot (chips, steppers, the paper price tag), taps and
## drags on the panel and on stage items, and the lock while the clock runs. Display and input only: every number is the engine's `ch4Status`, every change is an
## engine action. Cute mode: the faces are happy exactly when the engine says the numbers are in band.
const M := 14.0
const PANEL_H := 168.0

var app: CbApp
var q: Dictionary = {}          ## ch4Status
var kit: Dictionary = {}        ## ch4Kit
var scenario := ""              ## "l10" .. "l13", set by the subclass
var panel := Rect2()
var hits: Array = []            ## {rect, kind: "chip"|"step"|"item"|"slider", id, arg ...}
var hover := ""
var drag_id := ""
var _t := 0.0

static func T(key: String) -> String: return TranslationServer.translate(key)

func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP; visible = false
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	GridUi.load_strings(); TrayStrings.load_strings()

func _locked() -> bool:
	return app == null or app.speed > 0 or str(app.b.g.get("status", "playing")) != "playing"

func refresh(st: Dictionary, k: Dictionary) -> void:
	q = st; kit = k; visible = true
	if size.x < 8.0 or size.y < 8.0: set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)   # built before the chrome had a size: anchor again now that it has
	layout(); queue_redraw()

func layout() -> void:
	if app == null or not visible: return
	var ch = app.get("chrome")
	var slot: Rect2 = ch.tray_rect() if ch != null else Rect2(Vector2(M, size.y - 96 - M), Vector2(size.x - 2 * M, 96))
	var w := maxf(slot.size.x, 320.0)
	panel = Rect2(Vector2(slot.position.x, slot.end.y - PANEL_H), Vector2(w, PANEL_H))
	if panel.end.x > size.x - M: panel.position.x = size.x - M - panel.size.x
	hits.clear()
	_layout_panel()

func _layout_panel() -> void: pass
func _draw_stage() -> void: pass
func _draw_panel_body() -> void: pass
func _press(_h: Dictionary, _p: Vector2) -> void: pass
func _drag(_h: Dictionary, _p: Vector2) -> void: pass
func _narrow() -> bool: return panel.size.x < 560.0

# ---- input ------------------------------------------------------------------------------------------------------------------------
func _gui_input(e: InputEvent) -> void:
	if not visible: return
	if e is InputEventMouseButton and (e.button_index == MOUSE_BUTTON_LEFT or e.button_index == MOUSE_BUTTON_RIGHT):
		if e.pressed:
			var h := hit_at(e.position)
			if h.is_empty(): return
			if _locked(): app.toast(T("C4_LOCKED"), "warn"); app.sfx("bad"); accept_event(); return
			h = h.duplicate(); h["right"] = e.button_index == MOUSE_BUTTON_RIGHT or e.shift_pressed
			drag_id = str(h.id) if str(h.kind) == "slider" else ""
			_press(h, e.position); accept_event()
		else: drag_id = ""
	elif e is InputEventMouseMotion:
		var hv := hit_at(e.position)
		var hs := "%s/%s" % [str(hv.get("id", "")), str(hv.get("arg", ""))] if not hv.is_empty() else ""
		if hs != hover: hover = hs; queue_redraw()
		if drag_id != "" and (e.button_mask & MOUSE_BUTTON_MASK_LEFT) != 0 and not _locked():
			for h in hits: if str(h.id) == drag_id and str(h.kind) == "slider": _drag(h, e.position)
			accept_event()

func hit_at(p: Vector2) -> Dictionary:
	for i in range(hits.size() - 1, -1, -1):
		var h: Dictionary = hits[i]
		if (h.rect as Rect2).has_point(p): return h
	return {}

var quiet := false              ## headless tests: no sound, toast or shell refresh (the engine still answers)
var last_msg := ""

func _act(act: String, args: Array) -> bool:
	var r: Dictionary = app.b.act(act, args)
	last_msg = str(r.get("message", ""))
	if not quiet:
		if r.get("ok", false): app.sfx("click")
		else: app.sfx("bad"); app.toast(last_msg, "bad")
		app.game_on_changed()
	return bool(r.get("ok", false))

func _process(dt: float) -> void:
	if not visible: return
	_t += dt
	if not CbSettings.reduced_motion: queue_redraw()

# ---- drawing helpers --------------------------------------------------------------------------------------------------------------
func _text(font: Font, fsz: int, at: Vector2, s: String, col: Color, w := -1.0, align := 0) -> void:
	var f := GridTheme.fs(fsz); var tw := font.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, f).x
	var x := at.x
	if w > 0.0: x = at.x + (w - tw) * (0.5 if align == 1 else 1.0 if align == 2 else 0.0)
	draw_string(font, Vector2(x, at.y), s, HORIZONTAL_ALIGNMENT_LEFT, -1, f, col)

func _money(x: float) -> String: return CbRegion.money(x, false, 0)
func _f(x: float, d: int) -> String: return String.num(x, d)
func _good(ok: bool) -> Color: return GridTheme.GOOD if ok else GridTheme.BAD
func _mono() -> Font: return GridTheme.font("mono")
func _semi() -> Font: return GridTheme.font("semi")

func _cell_sb(fill: Color, lit: bool) -> StyleBoxFlat:
	var s := StyleBoxFlat.new(); s.bg_color = fill; s.set_corner_radius_all(7)
	s.border_color = GridTheme.SODIUM if lit else Color(GridTheme.SODIUM_DIM, 0.28); s.set_border_width_all(2 if lit else 1)
	return s

func _sky() -> void:
	draw_polygon(PackedVector2Array([Vector2(0, 0), Vector2(size.x, 0), Vector2(size.x, size.y), Vector2(0, size.y)]), PackedColorArray([Color("#0E1432"), Color("#0E1432"), Color("#2A3768"), Color("#2A3768")]))
	for i in 38:
		var sx := fposmod(float(i) * 197.31, size.x); var sy := fposmod(float(i) * 83.7, size.y * 0.42)
		draw_circle(Vector2(sx, sy), 1.0 + float(i % 3) * 0.4, Color(1, 1, 1, 0.25 + 0.2 * sin(_t * 1.3 + float(i))))

## A chip: label (and optional second line), lit when `on`, greyed when `off`.
func _chip(r: Rect2, label: String, sub := "", on := false, id := "", arg = "", enabled := true) -> void:
	var hv := hover == "%s/%s" % [id, str(arg)] and enabled
	var fill := Color(GridTheme.SODIUM, 0.22) if on else (Color(GridTheme.INK).lightened(0.12) if hv else Color(GridTheme.NIGHT, 0.55))
	draw_style_box(_cell_sb(fill, on or hv), r)
	var mono := _mono(); var col := GridTheme.SODIUM if on else (GridTheme.TEXT if enabled else GridTheme.DIM)
	if sub == "":
		_text(mono, 13, Vector2(r.position.x, r.position.y + r.size.y * 0.5 + 5.0), label, col, r.size.x, 1)
	else:
		_text(mono, 13, Vector2(r.position.x, r.position.y + r.size.y * 0.5 - 1.0), label, col, r.size.x, 1)
		_text(mono, 10 if sub.length() < 10 else 9, Vector2(r.position.x, r.position.y + r.size.y * 0.5 + 12.0), sub, Color(GridTheme.TEXT, 0.6), r.size.x, 1)

func _add_chip(r: Rect2, id: String, arg) -> void: hits.append({"rect": r, "kind": "chip", "id": id, "arg": arg})

## A [-] track [+] stepper cell with a caption, a value text and the fraction of the track filled.
func _stepper(r: Rect2, cap: String, vtxt: String, frac: float, id: String) -> void:
	var lock := _locked()
	draw_style_box(_cell_sb(Color(GridTheme.NIGHT, 0.55), drag_id == id), r)
	_text(_semi(), 11, r.position + Vector2(8, 15), cap, Color(GridTheme.TEXT, 0.7))
	_text(_mono(), 16, Vector2(r.position.x, r.position.y + 33.0), vtxt, GridTheme.SODIUM if not lock else GridTheme.DIM, r.size.x - 8.0, 2)
	var pt := stepper_parts(r)
	for k in ["minus", "plus"]:
		var br: Rect2 = pt[k]; draw_rect(br, Color(GridTheme.INK)); draw_rect(br, Color(GridTheme.SODIUM_DIM, 0.5), false, 1.0)
		_text(_semi(), 16, br.position + Vector2(0, 18), "−" if k == "minus" else "+", GridTheme.TEXT, br.size.x, 1)
	var tr: Rect2 = pt.track
	draw_rect(Rect2(tr.position + Vector2(0, 6), Vector2(tr.size.x, 4)), Color(GridTheme.SODIUM_DIM, 0.35))
	draw_rect(Rect2(tr.position + Vector2(0, 6), Vector2(tr.size.x * clampf(frac, 0.0, 1.0), 4)), GridTheme.SODIUM if not lock else GridTheme.DIM)
	draw_circle(tr.position + Vector2(tr.size.x * clampf(frac, 0.0, 1.0), 8), 8.0, GridTheme.SODIUM if not lock else GridTheme.DIM); draw_circle(tr.position + Vector2(tr.size.x * clampf(frac, 0.0, 1.0), 8), 3.0, GridTheme.NIGHT)

func stepper_parts(r: Rect2) -> Dictionary:
	var by := r.position.y + 40.0
	return {"minus": Rect2(Vector2(r.position.x, by), Vector2(24, 24)), "plus": Rect2(Vector2(r.end.x - 24.0, by), Vector2(24, 24)), "track": Rect2(Vector2(r.position.x + 30.0, by + 4.0), Vector2(r.size.x - 60.0, 16.0))}

func _face(c: Vector2, r: float, happy: bool, a: float) -> void:
	draw_circle(c + Vector2(-r * 0.35, -r * 0.2), r * 0.12, Color(GridTheme.INK, a)); draw_circle(c + Vector2(r * 0.35, -r * 0.2), r * 0.12, Color(GridTheme.INK, a))
	var pts := PackedVector2Array()
	for i in 9:
		var t := float(i) / 8.0; var bow := 1.0 - (2.0 * t - 1.0) * (2.0 * t - 1.0)
		pts.append(c + Vector2(lerpf(-r * 0.4, r * 0.4, t), r * ((0.2 + 0.22 * bow) if happy else (0.5 - 0.22 * bow))))
	draw_polyline(pts, Color(GridTheme.INK, a), maxf(1.5, r * 0.1), true)

## An arrow from a to b with a head.
func _arrow(a: Vector2, b: Vector2, col: Color, wd := 3.0) -> void:
	draw_line(a, b, col, wd, true)
	var d := (b - a); if d.length() < 3.0: return
	var u := d.normalized(); var n := Vector2(-u.y, u.x); var hl := minf(12.0, d.length() * 0.5)
	draw_colored_polygon(PackedVector2Array([b, b - u * hl + n * hl * 0.45, b - u * hl - n * hl * 0.45]), col)

func _draw() -> void:
	if not visible or q.is_empty(): return
	draw_rect(Rect2(Vector2.ZERO, size), GridTheme.NIGHT, true)   # an opaque stage: the world underneath is not this level's place
	_sky()
	_draw_stage()
	_draw_panel()

func _draw_panel() -> void:
	draw_style_box(GridTheme.ink_sb(0.94, 10, 0.0), panel)
	draw_line(panel.position + Vector2(10, 2), panel.position + Vector2(panel.size.x - 10, 2), Color(GridTheme.SODIUM_DIM, 0.35), 1.0)
	_draw_panel_body()
	_draw_price_tag(panel)

func _draw_price_tag(pn: Rect2) -> void:
	var spent := float(q.get("cost", 0.0)); var budget := float(q.get("budget", 0.0))
	var over := budget > 0.0 and spent > budget + 0.0001
	var txt := T("C4_SPENT") % [_money(spent), _money(budget)] if budget > 0.0 else _money(spent)
	var mono := _mono(); var semi := _semi()
	var w := 176.0; var h := 44.0
	var org := Vector2(pn.end.x - 12.0 - w, pn.end.y - 12.0 - h) if not _narrow() else Vector2(pn.end.x - 12.0 - w, pn.position.y - h - 6.0)
	draw_set_transform(org + Vector2(w, h) * 0.5, deg_to_rad(-1.4), Vector2.ONE)
	var rect := Rect2(Vector2(-w * 0.5, -h * 0.5), Vector2(w, h))
	draw_style_box(GridTheme.paper_sb(3, 0.0), rect)
	draw_circle(Vector2(-w * 0.5 + 11.0, -h * 0.5 + 11.0), 3.5, GridTheme.INK)
	var fsz := GridTheme.fs(13); var tw2 := mono.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz).x
	while tw2 > w - 16.0 and fsz > 9: fsz -= 1; tw2 = mono.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz).x
	draw_string(semi, Vector2(-w * 0.5 + 22.0, -h * 0.5 + 15.0), tr("TRAY_BUDGET_CAP"), HORIZONTAL_ALIGNMENT_LEFT, -1, GridTheme.fs(10), Color(GridTheme.PAPER_INK, 0.7))
	draw_string(mono, Vector2(-tw2 * 0.5, h * 0.5 - 8.0), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz, GridTheme.BAD.darkened(0.15) if over else GridTheme.PAPER_INK)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
