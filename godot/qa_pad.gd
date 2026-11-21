class_name QaPad
extends Node
## 1.8 QA: a pad tour inside this one game window, no virtual pad and no pad lock. Debug builds only, with CB_PAD=1 and
## CB_PADSEQ="tokens" (space separated):
##   A B X Y LB RB START BACK UP DOWN LEFT RIGHT   press and release that button
##   LS:x,y,secs                                   hold the left stick (x, y in -1..1) for secs
##   waitN                                         wait N seconds (decimals allowed)
##   @name                                         save the window to $CB_PADSHOTS/name.png (default user://padshots)
##   ?                                             print the focused control (QA_PAD focus=...)
## The tour quits the game when it ends. Every press is logged ("QA_PAD A focus=Line_new"), so a log shows where focus went.

const BTN := {"A": JOY_BUTTON_A, "B": JOY_BUTTON_B, "X": JOY_BUTTON_X, "Y": JOY_BUTTON_Y, "LB": JOY_BUTTON_LEFT_SHOULDER,
	"RB": JOY_BUTTON_RIGHT_SHOULDER, "START": JOY_BUTTON_START, "BACK": JOY_BUTTON_BACK, "UP": JOY_BUTTON_DPAD_UP,
	"DOWN": JOY_BUTTON_DPAD_DOWN, "LEFT": JOY_BUTTON_DPAD_LEFT, "RIGHT": JOY_BUTTON_DPAD_RIGHT}

var toks: PackedStringArray
var out_dir := ""

static func want() -> bool:
	return OS.is_debug_build() and OS.get_environment("CB_PADSEQ") != "" and CbPad.enabled

func _ready() -> void:
	toks = OS.get_environment("CB_PADSEQ").replace("+", " ").split(" ", false)   # "+" separates too (shell-safe)
	out_dir = OS.get_environment("CB_PADSHOTS") if OS.get_environment("CB_PADSHOTS") != "" else ProjectSettings.globalize_path("user://padshots")
	DirAccess.make_dir_recursive_absolute(out_dir)
	_run.call_deferred()

func _focus_name() -> String:
	var f := get_viewport().gui_get_focus_owner()
	if f == null: return "-"
	var t := ""
	if f is Button: t = (f as Button).text.left(28).replace("\n", " ")
	return "%s(%s)" % [f.name, t]

func _press(idx: int) -> void:
	for down in [true, false]:
		var e := InputEventJoypadButton.new(); e.button_index = idx; e.pressed = down; e.device = 0
		Input.parse_input_event(e)
		await get_tree().process_frame
		await get_tree().process_frame

func _stick(x: float, y: float, secs: float) -> void:
	for ax in [[JOY_AXIS_LEFT_X, x], [JOY_AXIS_LEFT_Y, y]]:
		var e := InputEventJoypadMotion.new(); e.axis = ax[0]; e.axis_value = ax[1]; Input.parse_input_event(e)
	await get_tree().create_timer(secs).timeout
	for ax in [JOY_AXIS_LEFT_X, JOY_AXIS_LEFT_Y]:
		var e := InputEventJoypadMotion.new(); e.axis = ax; e.axis_value = 0.0; Input.parse_input_event(e)

func _run() -> void:
	await get_tree().create_timer(float(OS.get_environment("CB_PADSEQ_AT")) if OS.get_environment("CB_PADSEQ_AT") != "" else 4.0).timeout
	for t in toks:
		if t.begins_with("wait"): await get_tree().create_timer(float(t.substr(4))).timeout
		elif t.begins_with("@"):
			await get_tree().process_frame; await get_tree().process_frame
			var p := out_dir.path_join(t.substr(1) + ".png")
			get_viewport().get_texture().get_image().save_png(p); print("QA_PAD shot %s focus=%s" % [t.substr(1), _focus_name()])
		elif t == "?": print("QA_PAD focus=%s modal=%s cur=%s" % [_focus_name(), str(get_parent().modal().name) if get_parent().modal() != null else "-", str(get_parent().cur)])
		elif t.begins_with("LS:"):
			var f := t.substr(3).split(",")
			await _stick(float(f[0]), float(f[1]), float(f[2]) if f.size() > 2 else 0.5)
		elif BTN.has(t):
			await _press(BTN[t]); await get_tree().create_timer(0.35).timeout
			print("QA_PAD %s focus=%s" % [t, _focus_name()])
		else: print("QA_PAD unknown token %s" % t)
	print("QA_PAD done")
	await get_tree().create_timer(0.5).timeout
	get_tree().quit()
