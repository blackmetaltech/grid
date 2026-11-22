class_name Ch3Panel
extends Control
## Chapter 3's instrument card (right edge, under the menu), drawn only on L07-L09: the feeder phasor and power factor (L07), the voltage spectrum of the drives, the impedance of the bus
## against harmonic order and the bank's current against its limit (L08), the line's R, X_L, X_C, the far-end voltage and the fault against the breaker (L09).
## Display only: every number is the engine's (`phasor`, `harmonics`, `seriesInfo`, `levelInfo`).

const M := 14.0
const W := 370.0   # 1.9: the 16 px floor (was 300)
var app: CbApp
var mode := ""                 ## "" | "pf" | "harm" | "series"
var d: Dictionary = {}         ## the query result of the mode
var phasor: PhasorView
var _h := 0.0
var collapsed := false         ## phone: the card folds to its title row so the map can be reached
const HEAD_H := 34.0

func _gui_input(e: InputEvent) -> void:
	if CbLayout.kind != "phone": return
	if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT and e.position.y < HEAD_H:
		collapsed = not collapsed; accept_event(); layout(); phasor.visible = visible and mode == "pf" and not collapsed; queue_redraw()
	elif e is InputEventScreenTouch and e.pressed and e.position.y < HEAD_H:
		collapsed = not collapsed; accept_event(); layout(); phasor.visible = visible and mode == "pf" and not collapsed; queue_redraw()

func _init() -> void:
	name = "Ch3Panel"; mouse_filter = Control.MOUSE_FILTER_IGNORE; visible = false
	phasor = PhasorView.new(); phasor.visible = false; add_child(phasor)
	GridUi.load_strings()

func tx(k: String) -> String: return TranslationServer.translate(k)

static func mode_of(level_id: String) -> String:
	match level_id:
		"L07": return "pf"
		"L08": return "harm"
		"L09": return "series"
	return ""

var _since := 0.0

## The card is a what-if on the design as it stands: re-read it twice a second so a bank placed, stepped or removed in the tray never leaves a stale readout.
func _process(dt: float) -> void:
	if not visible or mode == "": return
	_since += dt
	if _since >= 0.5: _since = 0.0; refresh()

func refresh() -> void:
	if app == null or not app.started or app.b == null: return
	var li = app.b.q("levelInfo")
	var m := mode_of(str(li.id)) if li is Dictionary and li.get("active", false) else ""
	mode = m; d = {}
	match m:
		"pf":
			var q = app.b.q("feederPeak"); d = q if q is Dictionary else {}
			phasor.set_data(d)
		"harm":
			var q = app.b.q("harmonics"); d = q if q is Dictionary else {}
		"series":
			var q = app.b.q("seriesInfo"); d = q if q is Dictionary else {}
	visible = m != ""
	mouse_filter = Control.MOUSE_FILTER_STOP if CbLayout.kind == "phone" else Control.MOUSE_FILTER_IGNORE   # on a phone the header is a tap target (collapse)
	phasor.visible = visible and m == "pf" and not collapsed
	layout(); queue_redraw()

func layout() -> void:
	if app == null: return
	_h = {"pf": 316.0, "harm": 412.0, "series": 232.0}.get(mode, 0.0)
	if CbLayout.kind == "phone":   # wholly inside the viewport: right edge 8 px in, below the HUD, above the spent/budget tag; the drawing scales to fit
		var avail := app.vs_h() - 185.0 - 70.0
		var sc := clampf(avail / maxf(_h, 1.0), 0.4, 1.0)
		scale = Vector2(sc, sc); size = Vector2(W, HEAD_H if collapsed else _h)
		position = Vector2(app.vw() - 8.0 - W * sc, 70.0)
	else:
		scale = Vector2.ONE; size = Vector2(W, _h)
		position = Vector2(app.vw() - M - W, 62.0)
	if mode == "pf": phasor.position = Vector2((W - 220.0) * 0.5, 30.0); phasor.size = Vector2(220, 200)

func _txt(s: String, at: Vector2, px: int, col: Color, font := "mono", w := -1.0) -> void:
	GridText.ds(self, GridTheme.font(font), at, s, HORIZONTAL_ALIGNMENT_LEFT, w, GridTheme.fs(px), col)

func _ink(a := 1.0) -> Color: return Color(GridTheme.PAPER_INK, a)

func _draw() -> void:
	if mode == "" or not visible: return
	draw_style_box(GridTheme.paper_sb(3, 0.0), Rect2(Vector2.ZERO, size))
	if CbLayout.kind == "phone":   # the fold toggle in the header's corner
		_txt("▸" if collapsed else "▾", Vector2(W - 28.0, 24.0), 18, _ink(0.8))
		if collapsed:
			_txt(tx({"pf": "C3_P_PHASOR", "harm": "C3_P_SPEC", "series": "C3_P_LINE"}.get(mode, "C3_P_LINE")), Vector2(14, 22), 12, _ink(0.7)); return
	match mode:
		"pf": _draw_pf()
		"harm": _draw_harm()
		"series": _draw_series()

# ---- L07 ---------------------------------------------------------------------------------------------------------------------------------
func _draw_pf() -> void:
	_txt(tx("C3_P_PHASOR"), Vector2(14, 22), 12, _ink(0.7))
	if d.is_empty() or d.get("error", false): return
	var word := tx("C3_P_LEAD") if str(d.get("lead", "")) == "leading" else tx("C3_P_LAG")
	var amps := int(d.get("iA", round(float(d.get("iKA", 0.0)) * 1000.0)))
	_txt(tx("C3_P_PF") % [("%.2f" % float(d.get("pf", 0.0))), word, str(amps)], Vector2(14, 250), 14, _ink())
	_txt("P %.2f MW · Q %.2f MVAr" % [float(d.get("pMW", 0.0)), float(d.get("qMVAr", 0.0))], Vector2(14, 268), 12, _ink(0.7))
	_txt(tx("C3_P_AMPS") % [str(int(d.get("iA", 0))), str(int(d.get("ratedA", 0)))], Vector2(14, 288), 14, GridTheme.BAD if float(d.get("iA", 0)) > float(d.get("ratedA", 1)) else _ink())
	_txt(tx("C3_P_AT") % str(d.get("blockText", "20:00")), Vector2(14, 306), 11, _ink(0.55))

# ---- L08 ---------------------------------------------------------------------------------------------------------------------------------
func _draw_harm() -> void:
	_txt(tx("C3_P_SPEC"), Vector2(14, 22), 12, _ink(0.7))
	if not bool(d.get("ready", false)):
		_txt(tx("C3_P_WAIT"), Vector2(14, 60), 13, _ink(0.8)); return
	_txt(tx("C3_P_SPEC_ASIF") if bool(d.get("asIf", false)) else tx("C3_P_SPEC_NOW"), Vector2(14, 36), 11, _ink(0.55))
	_txt(tx("C3_P_THD_WHAT"), Vector2(14, 49), 10, _ink(0.55))
	_txt(tx("C3_P_UNIT"), Vector2(14, 66), 11, _ink(0.75))
	var bars: Array = d.get("bars", [])
	var base := 138.0; var top := 74.0; var vmax := 12.0
	for b in bars: vmax = maxf(vmax, float(b.vPct) * 1.1)
	var thd_max := float(d.get("thdMaxPct", 5.0))
	draw_line(Vector2(30, base), Vector2(W - 14, base), _ink(0.5), 1.5)
	for tick in [0.0, 5.0, 10.0]:   # the scale: % of the fundamental; the dashed line is the THD limit
		var ty: float = base - (base - top) * float(tick) / vmax
		_txt("%d" % int(tick), Vector2(14, ty + 4.0), 10, _ink(0.6)); draw_line(Vector2(28, ty), Vector2(32, ty), _ink(0.5), 1.0)
	var ly := base - (base - top) * thd_max / vmax
	for dx in range(32, int(W) - 14, 10): draw_line(Vector2(dx, ly), Vector2(minf(dx + 5, W - 14), ly), GridTheme.BAD, 1.5)
	GridText.ds(self, GridTheme.font("mono"), Vector2(14, 66), "╌ " + tx("C3_P_LIMIT") % ("%.0f" % thd_max), HORIZONTAL_ALIGNMENT_RIGHT, W - 28.0, GridTheme.fs(11), GridTheme.BAD)   # the key of the dashed line, inside the padding
	var bw := (W - 46.0) / maxf(bars.size(), 1)
	for i in bars.size():
		var v := float(bars[i].vPct); var h := (base - top) * clampf(v / vmax, 0.0, 1.0)
		var x := 32.0 + i * bw + bw * 0.2
		var col := GridTheme.BAD if v > thd_max else (GridTheme.WARN if v > thd_max * 0.6 else GridTheme.GOOD)
		draw_rect(Rect2(x, base - h, bw * 0.6, h), col); draw_rect(Rect2(x, base - h, bw * 0.6, h), _ink(0.8), false, 1.2)
		_txt(tx("C3_P_HARM") % str(int(bars[i].h)), Vector2(x - 2, base + 15), 12, _ink())
		_txt("%.1f" % v, Vector2(x, minf(base - h - 4.0, ly - 5.0)), 11, _ink(0.8))   # above the bar, and above the limit line when the bar is near it
	var thd := float(d.get("thdPct", 0.0))
	_txt(tx("C3_P_THD") % [("%.1f" % thd), ("%.0f" % thd_max)], Vector2(14, 176), 13, GridTheme.BAD if thd > thd_max else _ink())
	# the impedance of the bus against harmonic order: the parallel resonance is the peak
	_txt(tx("C3_P_Z"), Vector2(14, 204), 12, _ink(0.7))
	var sw: Array = d.get("sweep", []); var zmax := 1.0
	for p in sw: zmax = maxf(zmax, float(p.z))
	var x0 := 14.0; var x1 := W - 14.0; var y0 := 292.0; var y1 := 218.0; var hmax := 16.0
	draw_line(Vector2(x0, y0), Vector2(x1, y0), _ink(0.5), 1.2)
	for o in d.get("orders", []):
		var ox := x0 + (x1 - x0) * (float(o) - 1.0) / (hmax - 1.0)
		draw_line(Vector2(ox, y0), Vector2(ox, y1), Color(GridTheme.LIVE, 0.5), 1.0)
		_txt(str(int(o)), Vector2(ox - 4, y0 + 13), 11, _ink(0.7))
	var pts := PackedVector2Array()
	for p in sw: pts.append(Vector2(x0 + (x1 - x0) * (float(p.h) - 1.0) / (hmax - 1.0), y0 - (y0 - y1) * sqrt(float(p.z) / zmax)))
	if pts.size() > 1: draw_polyline(pts, GridTheme.COPPER, 2.2, true)
	var pk: Dictionary = d.get("peak", {})
	if not pk.is_empty() and float(pk.h) > 1.3 and float(pk.h) < 15.5:   # a real resonance is a peak inside the plot, not the supply's own rise
		var px := x0 + (x1 - x0) * (float(pk.h) - 1.0) / (hmax - 1.0)
		draw_circle(Vector2(px, y1), 4.0, GridTheme.BAD)
		_txt(tx("C3_P_ZPEAK") % ("%.1f" % float(pk.h)), Vector2(px + 8.0 if px < W - 120.0 else px - 112.0, y1 + 4.0), 11, _ink())
	# the bank's current against the IEC limit
	_txt(tx("C3_P_CAP"), Vector2(14, 336), 12, _ink(0.7))
	var banks: Array = d.get("banks", []); var blown: Array = d.get("blown", [])
	var lim := float(d.get("capRmsMax", 1.3))
	var bx := 14.0; var bwid := W - 28.0; var by := 346.0
	draw_rect(Rect2(bx, by, bwid, 14.0), _ink(0.12))
	var scale_max := 1.6
	if banks.is_empty():
		_txt(tx("C3_P_BLOWN") % ", ".join(PackedStringArray(blown)) if not blown.is_empty() else tx("C3_P_CAP_NONE"), Vector2(14, 382), 13, GridTheme.BAD if not blown.is_empty() else _ink(0.7))
	else:
		var r := float(banks[0].ratio)
		draw_rect(Rect2(bx, by, bwid * clampf(r / scale_max, 0.0, 1.0), 14.0), GridTheme.BAD if r > lim else GridTheme.GOOD)
		_txt(tx("C3_P_CAP_FMT") % [("%.2f" % r), ("%.1f" % lim)], Vector2(14, 382), 13, GridTheme.BAD if r > lim else _ink())
		_txt("h = %.1f · %d kVAr" % [float(banks[0].hParallel), int(banks[0].kvar)], Vector2(14, 400), 11, _ink(0.65))
	var lx := bx + bwid * lim / scale_max
	draw_line(Vector2(lx, by - 4.0), Vector2(lx, by + 18.0), GridTheme.BAD, 2.0)
	draw_rect(Rect2(bx, by, bwid, 14.0), _ink(0.7), false, 1.2)

# ---- L09 ---------------------------------------------------------------------------------------------------------------------------------
func _draw_series() -> void:
	_txt(tx("C3_P_LINE"), Vector2(14, 22), 12, _ink(0.7))
	if not bool(d.get("active", false)): return
	var xl := float(d.xlOhm); var xc := float(d.xcOhm)
	_txt(tx("C3_P_RX") % [("%.1f" % float(d.rOhm)), ("%.1f" % xl), ("%.1f" % xc)], Vector2(14, 42), 12, _ink())
	_txt(tx("C3_P_XC_WHAT"), Vector2(14, 82), 10, _ink(0.55))
	var bx := 14.0; var bw := W - 28.0
	draw_rect(Rect2(bx, 52, bw, 16), _ink(0.14))
	if xl > 0.0:
		var f := clampf(xc / xl, 0.0, 1.0)
		draw_rect(Rect2(bx, 52, bw * (1.0 - f), 16), GridTheme.COPPER)
		draw_rect(Rect2(bx + bw * (1.0 - f), 52, bw * f, 16), GridTheme.GOOD)
	draw_rect(Rect2(bx, 52, bw, 16), _ink(0.7), false, 1.2)
	var vf = d.get("vMinPu"); var lim = d.get("farMinPu")
	if vf == null: _txt(tx("C3_P_VFAR_NONE"), Vector2(14, 104), 13, _ink(0.75))
	else: _txt(tx("C3_P_VFAR") % [("%.3f" % float(vf)), ("%.2f" % float(lim) if lim != null else "")], Vector2(14, 104), 13, GridTheme.BAD if lim != null and float(vf) < float(lim) else _ink())
	var t := int(d.faultBlock) * 15
	_txt(tx("C3_P_FAULT") % ("%02d:%02d" % [t / 60, t % 60]), Vector2(14, 128), 12, _ink(0.7))
	var rating := float(d.breakerKA); var smax := rating * 1.5
	var fy := 142.0
	draw_rect(Rect2(bx, fy, bw, 14.0), _ink(0.12))
	if bool(d.get("faultDone", false)):
		var k := float(d.faultKA)
		draw_rect(Rect2(bx, fy, bw * clampf(k / smax, 0.0, 1.0), 14.0), GridTheme.BAD if k > rating else GridTheme.GOOD)
		_txt(tx("C3_P_FAULT_FMT") % [("%.2f" % k), ("%.2f" % rating)], Vector2(14, 172), 13, GridTheme.BAD if k > rating else _ink())
		_txt(tx("C3_P_FAULT_PLAIN") % ("%.2f" % float(d.faultKA0)), Vector2(14, 190), 11, _ink(0.65))
		_txt(tx("C3_P_FRES") % ("%.0f" % float(d.get("fResHz", 0.0))), Vector2(14, 206), 11, _ink(0.65))
	else:
		var pk = d.get("predKA")
		if pk != null:
			draw_rect(Rect2(bx, fy, bw * clampf(float(pk) / smax, 0.0, 1.0), 14.0), Color(GridTheme.BAD if float(pk) > rating else GridTheme.GOOD, 0.55))
			_txt(tx("C3_P_PRED") % [("%.2f" % float(pk)), ("%.2f" % rating)], Vector2(14, 172), 13, GridTheme.BAD if float(pk) > rating else _ink())
		_txt(tx("C3_P_PRESS") % ("%02d:%02d" % [t / 60, t % 60]), Vector2(14, 190), 11, _ink(0.65))
	var lx := bx + bw * rating / smax
	draw_line(Vector2(lx, fy - 4.0), Vector2(lx, fy + 18.0), GridTheme.BAD, 2.0)
	draw_rect(Rect2(bx, fy, bw, 14.0), _ink(0.7), false, 1.2)
