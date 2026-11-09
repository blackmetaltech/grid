extends CbApp
## The reference game: a Torricelli tank. Everything else (title, top bar, dock, drawers, toasts, settings, codex, saves, coach,
## pad, touch, env hooks, smoke) comes from CbApp in addons/cobanana. This file only says what is specific to the game.
var tank: TankView
var _demo: Timer
var _demo_i := 0

func game_config() -> Dictionary:
	return {
		"title": str(ProjectSettings.get_setting("application/config/name", "TANK")),
		"tagline": tr("TANK_TAGLINE"),
		"blurb": tr("TANK_BLURB"),
		"accent": Color("#35c8ff"), "accent2": Color("#ffb347"),
		"modes": [["learner", tr("MODE_LEARNER"), tr("MODE_LEARNER_DESC")], ["engineer", tr("MODE_ENGINEER"), tr("MODE_ENGINEER_DESC")], ["sandbox", tr("MODE_SANDBOX"), tr("MODE_SANDBOX_DESC")]],
		"dock": [["controls", tr("DOCK_VALVE"), Color("#35c8ff"), tr("DOCK_VALVE")], ["level", tr("DOCK_LEVEL"), Color("#ffb347"), tr("DOCK_LEVEL")], ["codex", tr("DOCK_CODEX"), Color("#9fb4c8"), tr("DOCK_CODEX")]],
		"screens": {"controls": "res://screens/controls.gd", "level": "res://screens/level.gd"},
		"overlay": ["controls", "level"], "full": ["codex"],
		"tick_label": tr("TICK_BUTTON"), "tick_seconds": [0.0, 4.0, 1.6, 0.6],
		"keys": [["Space", tr("KEY_SPACE_DESC")], ["1-3", tr("KEY_DOCK_DESC")], [tr("KEY_WHEEL"), tr("KEY_WHEEL_DESC")]],
	}

func game_build_world(parent: Node) -> Node:
	tank = TankView.new(); tank.app = self; parent.add_child(tank)
	return tank

func game_on_changed() -> void:
	if tank == null: return
	tank.set_state(b.g, b.q("flows"))

func game_time_text() -> String:
	var t := int(b.g.get("tick", 0))
	return tr("HUD_TIME") % [t, t * int(b.init_data.get("catalogues", {}).get("rig", {}).get("dt", 10))]

func game_top_stats() -> Array:
	var f: Dictionary = b.q("flows")
	if f == null or f.is_empty(): return []
	var h := float(f.h); var band: Array = f.band
	var inb := h >= float(band[0]) and h <= float(band[1])
	return [[tr("HUD_DEPTH"), "%.2f m" % h, CbKit.GR if inb else CbKit.TX], [tr("DOCK_VALVE"), "%d %%" % int(round(float(f.valve) * 100.0)), CbKit.ACC],
		[tr("HUD_HELD"), "%d / %d" % [int(f.held), int(f.holdTicks)], CbKit.GR if int(f.held) > 0 else CbKit.DIM]]

func game_coach_steps() -> Array:
	return [
		{"id": "tank", "kind": "read", "title": tr("COACH_TANK_TITLE"),
			"body": tr("COACH_TANK_BODY"),
			"why": tr("COACH_TANK_WHY")},
		{"id": "controls", "kind": "visit", "key": "controls", "target": "dock:controls", "title": tr("KEY_WHEEL_DESC"),
			"body": tr("COACH_CONTROLS_BODY"),
			"why": tr("COACH_CONTROLS_WHY")},
		{"id": "valve", "kind": "state", "target": "", "title": tr("COACH_VALVE_TITLE"),
			"body": tr("COACH_VALVE_BODY"),
			"why": tr("COACH_VALVE_WHY"),
			"done": func(g: Dictionary) -> bool: return float(g.get("valve", 0.0)) > 0.0},
		{"id": "hold", "kind": "state", "target": "tick", "title": tr("COACH_HOLD_TITLE"),
			"body": tr("COACH_HOLD_BODY"),
			"why": tr("COACH_HOLD_WHY"),
			"done": func(g: Dictionary) -> bool: return int(g.get("held", 0)) >= 3},
	]

func game_camera(spec: String) -> void:
	if tank != null: tank.set_camera(spec)

func game_title_demo() -> void:   # the title's backdrop: the tank fills and settles by itself (the app already switched engine autosave off)
	b.act("setValve", [62.0]); b.act("tick", [6])
	if _demo == null:
		_demo = Timer.new(); _demo.wait_time = 1.2; _demo.autostart = true; add_child(_demo)
		_demo.timeout.connect(func():
			if started or b.g.get("status", "playing") != "playing": return
			_demo_i += 1
			if _demo_i % 6 == 0: b.act("setValve", [[35.0, 62.0, 48.0][(_demo_i / 6) % 3]])
			b.act("tick", [1]))

func game_smoke() -> void:
	CbSmoke._check(tr("TANK_TAGLINE") != "TANK_TAGLINE", "string catalogue locales/strings.csv is loaded (run --import)")
	b.act("setValve", [50.0]); b.act("tick", [4]); await get_tree().process_frame
	CbSmoke._check(absf(tank.h_eng - float(b.g.h)) < 1e-9, "the world follows the engine's depth")
	show_screen("controls"); await get_tree().process_frame
	var vf = b.q("valveFor", [1.1])
	CbSmoke._check(vf != null and float(vf) > 0.0 and float(vf) < 100.0, "valveFor answers")
	tank.set_camera("close"); tank.set_camera("full")
	show_screen(home); await get_tree().process_frame
