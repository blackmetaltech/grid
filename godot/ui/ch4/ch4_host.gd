class_name Ch4Host
extends Control
## Chapter 4's four stages (street, estate, hydro, exam) under one node: hidden on every level that is not L10-L13, otherwise the stage the engine's `ch4Status`
## names. grid_chrome.gd creates it first (an opaque stage under the instruments, the radio and the breaker) and forwards refresh / layout.
var app: CbApp
var stages := {}

func _init() -> void:
	name = "Ch4Host"; mouse_filter = Control.MOUSE_FILTER_IGNORE; visible = false
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

func build() -> void:
	for s in [Ch4Street.new(), Ch4Estate.new(), Ch4Hydro.new(), Ch4Exam.new()]:
		s.app = app; stages[s.scenario] = s; add_child(s)

func _hide() -> void:
	visible = false
	for k in stages: stages[k].visible = false

func refresh() -> void:
	if app == null or not app.started: _hide(); return
	var st = app.b.q("ch4Status")
	if not (st is Dictionary) or not st.get("active", false): _hide(); return
	var kit = app.b.q("ch4Kit")
	visible = true
	if size.x < 8.0: set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for k in stages:
		if k == str(st.scenario): stages[k].refresh(st, kit if kit is Dictionary else {})
		else: stages[k].visible = false

func layout() -> void:
	if not visible: return
	for k in stages: if stages[k].visible: stages[k].layout()
