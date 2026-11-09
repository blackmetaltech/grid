extends CbApp
## GRID front-end. M0: a placeholder world and a clock drawer; everything else (title, top bar, dock, settings, saves, coach,
## pad, touch, smoke) comes from CbApp in addons/cobanana. The real world and drawers arrive in M2.
var grid_world: WorldView

func game_config() -> Dictionary:
	return {
		"title": str(ProjectSettings.get_setting("application/config/name", "GRID")),
		"tagline": tr("GRID_TAGLINE"),
		"blurb": tr("GRID_BLURB"),
		"accent": Color("#39E1FF"), "accent2": Color("#FFB020"),
		"modes": [["learner", tr("MODE_LEARNER"), tr("MODE_LEARNER_DESC")], ["engineer", tr("MODE_ENGINEER"), tr("MODE_ENGINEER_DESC")], ["sandbox", tr("MODE_SANDBOX"), tr("MODE_SANDBOX_DESC")]],
		"dock": [["clock", tr("DOCK_CLOCK"), Color("#39E1FF"), tr("DOCK_CLOCK")]],
		"screens": {"clock": "res://screens/clock.gd"},
		"overlay": ["clock"], "full": [],
		"tick_label": tr("TICK_BUTTON"), "tick_seconds": [0.0, 4.0, 1.6, 0.6],
		"keys": [["Space", tr("KEY_SPACE_DESC")], ["1", tr("KEY_DOCK_DESC")]],
	}

func game_build_world(parent: Node) -> Node:
	grid_world = WorldView.new(); parent.add_child(grid_world)
	return grid_world

func game_on_changed() -> void:
	if grid_world != null: grid_world.queue_redraw()

func game_time_text() -> String:
	var c = b.q("clock")
	if c == null or c.is_empty(): return ""
	return tr("HUD_TIME") % [int(c.day) + 1, int(c.hour), int(c.minute)]

func game_top_stats() -> Array:
	var c = b.q("clock")
	if c == null or c.is_empty(): return []
	return [[tr("HUD_CLOCK"), "%02d:%02d" % [int(c.hour), int(c.minute)], CbKit.ACC], [tr("HUD_DAY"), str(int(c.day) + 1), CbKit.TX]]

func game_coach_steps() -> Array:
	return [
		{"id": "welcome", "kind": "read", "title": tr("COACH_WELCOME_TITLE"), "body": tr("COACH_WELCOME_BODY"), "why": tr("COACH_WELCOME_WHY")},
	]

func game_camera(spec: String) -> void:
	if grid_world != null: grid_world.set_camera(spec)

func game_title_demo() -> void:
	pass   # the title backdrop is the static world until M2

func game_smoke() -> void:
	CbSmoke._check(tr("GRID_TAGLINE") != "GRID_TAGLINE", "string catalogue locales/strings.csv is loaded (run --import)")
	var c0: Dictionary = b.q("clock")
	b.act("tick", [3]); await get_tree().process_frame
	var c1: Dictionary = b.q("clock")
	CbSmoke._check(int(c1.block) == int(c0.block) + 3 and int(c1.day) == int(c0.day), "the clock advances one block per tick")
	show_screen("clock"); await get_tree().process_frame
	show_screen(home); await get_tree().process_frame
