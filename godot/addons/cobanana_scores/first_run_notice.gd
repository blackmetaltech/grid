class_name CbScoresFirstRunNotice
extends PanelContainer
## Small first-run notice: explains what online scores send, with "OK" and "Turn off". Theme-agnostic.
## Add it to any container; it frees itself after a choice. Skips itself when the notice was already acknowledged.

## Emitted after the choice; `online` is false when the player pressed "Turn off".
signal closed(online: bool)

## Client to configure; defaults to the autoload /root/Scores.
var client: CbScoresClient = null


func _ready() -> void:
	if client == null:
		client = get_node_or_null("/root/Scores") as CbScoresClient
	if client == null or not client.needs_first_run_notice():
		queue_free()
		return
	var box := VBoxContainer.new()
	add_child(box)
	var title := Label.new()
	title.text = CbScoresStrings.get_text("notice_title")
	box.add_child(title)
	var body := Label.new()
	body.text = client.notice_text()
	body.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	body.custom_minimum_size.x = 320.0
	box.add_child(body)
	var row := HBoxContainer.new()
	box.add_child(row)
	var ok := Button.new()
	ok.text = CbScoresStrings.get_text("notice_ok")
	ok.pressed.connect(_choose.bind(true))
	row.add_child(ok)
	var off := Button.new()
	off.text = CbScoresStrings.get_text("notice_off")
	off.pressed.connect(_choose.bind(false))
	row.add_child(off)


func _choose(on: bool) -> void:
	client.set_enabled(on)
	client.acknowledge_notice()
	closed.emit(on)
	queue_free()
