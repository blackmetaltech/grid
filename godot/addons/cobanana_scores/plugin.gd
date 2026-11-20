@tool
extends EditorPlugin
## Registers the `Scores` autoload when the plugin is enabled.

const AUTOLOAD_NAME := "Scores"
const SCRIPT_PATH := "res://addons/cobanana_scores/scores.gd"


func _enable_plugin() -> void:
	add_autoload_singleton(AUTOLOAD_NAME, SCRIPT_PATH)


func _disable_plugin() -> void:
	remove_autoload_singleton(AUTOLOAD_NAME)
