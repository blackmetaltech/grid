class_name Ch8Host
extends Control
## Chapter 8's six stages (long feeder, outages, fuse saving, firm capacity, sun on the roofs, exam bridge) under one node: hidden on every level that is not L31-L36, otherwise the
## stage the engine's `ch8Study` names. grid_chrome.gd creates it beside chapter 7's host and forwards refresh / layout.
var app: CbApp
var stages := {}

func _init() -> void:
	name = "Ch8Host"; mouse_filter = Control.MOUSE_FILTER_IGNORE; visible = false
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

func build() -> void:
	for s in [Ch8Long.new(), Ch8Reliab.new(), Ch8Tcc.new()]:
		s.app = app; stages[s.scenario] = s; add_child(s)

func _hide() -> void:
	visible = false
	for k in stages: stages[k].visible = false
	for k in stages: for e in stages[k].edits.values(): e.visible = false

func refresh() -> void:
	if app == null or not app.started: _hide(); return
	var st = app.b.q("ch8Study")
	if not (st is Dictionary) or not st.get("active", false) or not stages.has(str(st.scenario)): _hide(); return
	var kit = app.b.q("ch8Kit")
	visible = true
	if size.x < 8.0: set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for k in stages:
		if k == str(st.scenario): stages[k].refresh(st, kit if kit is Dictionary else {})
		else:
			stages[k].visible = false
			for e in stages[k].edits.values(): e.visible = false

func layout() -> void:
	if not visible: return
	for k in stages: if stages[k].visible: stages[k].layout()
