class_name GridHud
extends PanelContainer
## HUD under the top bar, centred over the visible world: the non-linear frequency dial, the 2-decimal readout, a RoCoF arrow and the budget.
## Shown on grid levels only (a bench level has no frequency). Reads the engine's `dial` and `levelInfo` / `costBreakdown` queries.

var app: CbApp
var dial: DialView
var read: Label
var rocof: Label
var budget: Label
var _vis := false

func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	z_index = 2
	add_theme_stylebox_override("panel", CbKit.card_sb(CbKit.PANEL_EDGE, Color(CbKit.PANEL_FILL, 0.88), 2))
	var hb := HBoxContainer.new(); hb.add_theme_constant_override("separation", 8); hb.mouse_filter = Control.MOUSE_FILTER_IGNORE; add_child(hb)
	dial = DialView.new(); hb.add_child(dial)
	var vb := VBoxContainer.new(); vb.add_theme_constant_override("separation", 0); vb.mouse_filter = Control.MOUSE_FILTER_IGNORE; hb.add_child(vb)
	vb.add_child(CbKit.label(tr("HUD_FREQ").to_upper(), 11, CbKit.DIM))
	read = CbKit.label("", 24, CbKit.TX); vb.add_child(read)
	rocof = CbKit.label("", 13, CbKit.DIM); vb.add_child(rocof)
	budget = CbKit.label("", 13, CbKit.DIM); vb.add_child(budget)
	for c in [read, rocof, budget]: (c as Control).mouse_filter = Control.MOUSE_FILTER_IGNORE
	visible = false

func refresh() -> void:
	if app == null or not app.started: visible = false; return
	var w = app.b.q("world")
	_vis = w is Dictionary and str(w.get("kind", "")) == "grid"
	visible = _vis
	if not _vis: return
	var q = app.b.q("dial")
	if not (q is Dictionary) or q.get("error", false): visible = false; return
	dial.set_query(q)
	var f := float(q.fHz)
	var z := DialMath.zone(f, q)
	read.text = tr("HUD_HZ") % ("%.2f" % f); read.add_theme_color_override("font_color", [CbKit.TX, CbKit.AM, CbKit.RD][z])
	var ro := float(q.rocof)
	rocof.text = "%s %s" % ["▲" if ro > 0.005 else ("▼" if ro < -0.005 else "■"), tr("HUD_ROCOF") % ("%+.2f" % ro)]
	var li = app.b.q("levelInfo"); var cb = app.b.q("costBreakdown")
	if li is Dictionary and li.get("active", false) and li.get("frozen") != null and cb is Dictionary:
		budget.text = "%s  %s" % [tr("HUD_BUDGET"), tr("HUD_BUDGET_FMT") % [CbKit.num(float(cb.capex), 0), CbKit.num(float(li.frozen.budget), 0)]]
		budget.visible = true
	else: budget.visible = false
	_place()

func _place() -> void:
	if app == null or app.top == null: return
	var left: float = app._left_edge()
	var avail: float = app.vw() - app.world_cover() - left - 14.0
	var s := get_combined_minimum_size()
	size = s
	position = Vector2(left + maxf((avail - s.x) * 0.5, 0.0), app.top.offset_bottom + 8.0)

func _process(_dt: float) -> void:
	if visible: _place()
