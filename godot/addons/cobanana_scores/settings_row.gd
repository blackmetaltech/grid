class_name CbScoresSettingsRow
extends HBoxContainer
## A Settings row: label + CheckButton "Online scores". Theme-agnostic; bound to the client's enabled flag.

var client: CbScoresClient = null
var _check: CheckButton


func _ready() -> void:
	if client == null:
		client = get_node_or_null("/root/Scores") as CbScoresClient
	var label := Label.new()
	label.text = CbScoresStrings.get_text("settings_online")
	label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	add_child(label)
	_check = CheckButton.new()
	_check.button_pressed = client != null and client.is_enabled()
	_check.disabled = client == null
	_check.toggled.connect(_on_toggled)
	add_child(_check)


func _on_toggled(on: bool) -> void:
	if client != null:
		client.set_enabled(on)
