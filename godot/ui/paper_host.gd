class_name PaperHost
extends Control
## Script for the host of a paper screen built with `app.dialog()`: Esc / pad B / Android Back reach `close()` through the shell's modal discipline,
## and the screen decides what closing means (fold into the pin, fade out, ...) by setting `closer`. Enter presses `primary` (the sodium button) when no
## button has keyboard focus, so Space keeps meaning "tick" and never answers a dialog by accident.

var closer: Callable
var primary: Button
var app: CbApp   ## set by PaperKit.sheet: keeps the scrim full-bleed when the safe area changes

func _notification(what: int) -> void:
	if what == NOTIFICATION_RESIZED and app != null and is_instance_valid(app): PaperKit.bleed(app, self)

func close() -> void:
	if closer.is_valid(): closer.call()
	else: queue_free()

func _unhandled_key_input(e: InputEvent) -> void:
	if not (e is InputEventKey) or not e.pressed or e.echo: return
	if e.keycode != KEY_ENTER and e.keycode != KEY_KP_ENTER: return
	if primary == null or not is_instance_valid(primary) or not primary.is_visible_in_tree() or get_viewport().gui_get_focus_owner() is Button: return
	get_viewport().set_input_as_handled(); primary.pressed.emit()
