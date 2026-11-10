extends CbApp
## GRID front-end. The world (godot/world: diorama, lights, flow ribbons, day-night) comes from the engine queries; drawers arrive in M2.4+.
## pad, touch, smoke) comes from CbApp in addons/cobanana. The real world and drawers arrive in M2.
var grid_world: WorldView
var chrome: GridChrome
var sound: GridSound   ## GridAudio wired to the screen (ui/grid_sound.gd)

func game_config() -> Dictionary:
	GridUi.load_strings()
	return GridUi.extend_config({
		"chrome": "custom", "home": "clock",
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
	})

func game_build_world(parent: Node) -> Node:
	GridSettings.load_all()
	grid_world = WorldView.new(); grid_world.app = self; grid_world.cute = GridSettings.cute; parent.add_child(grid_world)
	return grid_world

func game_on_changed() -> void:
	if grid_world != null: grid_world.refresh(b)
	if chrome != null: chrome.refresh()
	if sound != null and grid_world != null: sound.on_changed(grid_world.model)

func game_end_card(vb: VBoxContainer, g: Dictionary) -> void:
	GridUi.end_card(vb, g, self)

func game_time_text() -> String:
	var c = b.q("clock")
	if c == null or c.is_empty(): return ""
	return tr("HUD_TIME") % [int(c.day) + 1, int(c.hour), int(c.minute)]

func game_top_stats() -> Array:
	var c = b.q("clock")
	if c == null or c.is_empty(): return []
	return [[tr("HUD_CLOCK"), "%02d:%02d" % [int(c.hour), int(c.minute)], CbKit.ACC], [tr("HUD_DAY"), str(int(c.day) + 1), CbKit.TX]]

func game_coach_steps() -> Array:
	# The core coach only needs one placeholder step; the level's own coach (engine query `coach`) speaks through the radio, GridChrome polls it.
	return [{"id": "welcome", "kind": "read", "title": tr("COACH_WELCOME_TITLE"), "body": tr("COACH_WELCOME_BODY"), "why": tr("COACH_WELCOME_WHY")}]

## CB_CAM for screenshots: parts separated by '|'. `act=name/arg/arg` runs an engine action (numbers, true/false or text args), `ff=n` advances n
## blocks, anything else goes to the world camera ("zoom=2,tx=12,ty=7").
func game_camera(spec: String) -> void:
	var cam: PackedStringArray = []
	for part in spec.split("|"):
		if part.begins_with("act="):
			var f := part.substr(4).split("/"); var args: Array = []
			for a in f.slice(1):
				if a == "true" or a == "false": args.append(a == "true")
				elif a.is_valid_float(): args.append(float(a))
				else: args.append(a)
			b.act(f[0], args)
		elif part.begins_with("ff="): b.act("tick", [int(part.substr(3))])
		elif part.begins_with("paper="): game_on_changed(); PaperKit.qa(self, part.substr(6))   # QA: open a paper screen (menu, jobs, workorder, report)
		elif part.begins_with("ui="): game_on_changed(); chrome.qa_ui(part.substr(3))   # QA: tray / tag state, see GridChrome.qa_ui
		else: cam.append(part)
	game_on_changed()
	if grid_world != null: grid_world.set_camera(",".join(cam))

func game_unhandled_key(e: InputEventKey) -> bool:
	if chrome != null and chrome.key(e): return true
	match e.keycode:   # bench levels use the kit tray and tags; the old Build / Inspect drawers remain on B / I for grid levels (L07) until their task
		KEY_B: if chrome != null and not chrome.tray_active(): show_screen(home if cur == "build" else "build"); chrome.refresh(); return true
		KEY_I: if chrome != null and not chrome.tray_active(): show_screen(home if cur == "inspect" else "inspect"); chrome.refresh(); return true
		KEY_T: show_screen(home if cur == "timeline" else "timeline"); chrome.refresh(); return true
	return grid_world != null and grid_world.key(e)

# --- custom chrome hooks ---
func game_build_chrome(r: Control) -> void:
	audio.headless = true   # the shell's generated music stays off: GridAudio plays the music (the shell's sfx cues still work)
	sound = GridSound.new(); sound.name = "GridSound"; add_child(sound); sound.setup(self)
	chrome = GridChrome.new(); chrome.app = self; r.add_child(chrome); chrome.build()
	chrome.pin_pressed.connect(_on_pin)
	if OS.is_debug_build() and not OS.has_environment("CB_SMOKE"):   # perf log for device runs: "CB_FPS fps=.. min=.." every 5 s (logcat / stdout)
		var tm := Timer.new(); tm.wait_time = 5.0; tm.autostart = true; add_child(tm)
		tm.timeout.connect(func(): print("CB_FPS fps=%d frame_ms=%.1f level=%s" % [Engine.get_frames_per_second(), Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0, str(b.q("levelInfo").get("id", "-")) if started else "title"]))
func game_chrome_visible(v: bool) -> void:
	if chrome != null: chrome.set_chrome_visible(v)
func game_relayout() -> void:
	if chrome != null: chrome.layout()
func game_toast(text: String, level: String) -> bool:
	if chrome == null: return false
	chrome.toast(text, level); return true
func game_coach(step: Dictionary, index: int, total: int) -> bool:
	if chrome == null: return false
	if str(step.get("id", "")) != "welcome": chrome.coach(step, index, total)
	return true

func game_title_demo() -> void:   # backdrop of the title: the first job, solved, late evening, every home lit
	if b.act("startLevel", ["L01", 7, "learner"]).get("ok", false):
		b.act("placeHut", [120]); b.act("layCable", ["main", 25]); b.act("tick", [14])
	game_on_changed()

# --- paper screens (ui/work_order.gd, shift_report.gd, title_screen.gd, pause_menu.gd) ---
func game_title(r: Control) -> bool: return TitleScreen.build(self, r)
func game_end_screen() -> bool: return ShiftReport.open(self)
func game_menu() -> bool: return PauseMenu.toggle(self)

## A job starts (new game, level start, load): the work order slides in unless the job is already under way.
func _begin() -> void:
	super()
	WorkOrder.close_now()
	if WorkOrder.auto: WorkOrder.open_fresh(self)

## Top-left pin: the work order while the job runs, the report again once it has ended.
func _on_pin() -> void:
	if modal() != null: return
	if str(b.g.get("status", "playing")) != "playing": end_seen = false; menus.end_card()
	else: WorkOrder.open(self)

## GRID cues go to GridAudio, everything else (click, confirm, back ...) stays with the shell's own sounds.
func sfx(k: String) -> void:
	if sound != null and sound.route(k): return
	super(k)

func game_smoke() -> void:
	for id in ["P0", "L01", "L02", "L03", "L07"]:
		b.act("startLevel", [id, 1, "learner"]); b.act("tick", [1]); game_on_changed(); await get_tree().process_frame
		CbSmoke._check(grid_world.model.kind != "none" and grid_world.model.towns.size() > 0, "the world builds a diorama for level %s" % id)
	grid_world.set_camera("zoom=2,tx=10,ty=6"); grid_world.set_camera("reset")
	CbSmoke._check(tr("GRID_TAGLINE") != "GRID_TAGLINE", "string catalogue locales/strings.csv is loaded (run --import)")
	var c0: Dictionary = b.q("clock")
	b.act("tick", [3]); await get_tree().process_frame
	var c1: Dictionary = b.q("clock")
	CbSmoke._check(int(c1.block) == int(c0.block) + 3 and int(c1.day) == int(c0.day), "the clock advances one block per tick")
	show_screen("clock"); await get_tree().process_frame
	show_screen(home); await get_tree().process_frame
	# GRID chrome: nodes exist, kit bar and dock are hidden, breaker drives the speed, radio hears the coach
	b.act("startLevel", ["L01", 1, "learner"]); game_on_changed(); await get_tree().process_frame; _relayout(); await get_tree().process_frame
	CbSmoke._check(chrome != null and chrome.visible and chrome.instruments != null and chrome.radio != null and chrome.breaker != null and chrome.pin != null, "GRID chrome nodes exist and are shown in a level")
	CbSmoke._check(not top.visible and not dock_scroll.visible and _bar_h == 0.0 and _dock_h == 0.0, "kit bar and dock are hidden in custom chrome")
	CbSmoke._check(chrome.instruments.clock.visible and chrome.instruments.volt.visible and not chrome.instruments.dial.visible, "bench level: clock and voltmeter, no frequency dial")
	set_speed(0); chrome.breaker.toggle(); CbSmoke._check(speed == 1, "breaker run sets speed 1")
	chrome.breaker.cycle_rate(); CbSmoke._check(speed == 2, "rate knob moves a running night to 2x")
	chrome.breaker.toggle(); CbSmoke._check(speed == 0, "breaker pause sets speed 0")
	chrome.space_steps = false; var ev := InputEventKey.new(); ev.keycode = KEY_SPACE; ev.pressed = true; game_unhandled_key(ev); CbSmoke._check(speed > 0, "Space toggles run"); game_unhandled_key(ev); CbSmoke._check(speed == 0, "Space toggles pause"); chrome.space_steps = true
	var t0 := int(b.q("clock").tick); ev.keycode = KEY_PERIOD; game_unhandled_key(ev); CbSmoke._check(int(b.q("clock").tick) == t0 + 1, "'.' steps one block")
	CbSmoke._check(chrome.radio.lines.any(func(l): return l.speaker == "TOBI" and l.kind == "coach"), "the radio received the coach line")
	var msg := tr("TEST_REFUSED")
	toast(msg, "warn")
	CbSmoke._check(chrome.radio.lines.back().speaker == "SYS" and chrome.radio.lines.back().kind == "warn", "a toast arrives on the radio as a SYS warning")
	b.act("startLevel", ["L03", 1, "learner"]); game_on_changed(); await get_tree().process_frame
	CbSmoke._check(chrome.instruments.mode == "loss" and chrome.instruments.volt.units == "%" and chrome.instruments.volt.vmax == 20.0, "L03: the meter is LINE LOSS 0-20 %, not volts")
	CbSmoke._check(chrome.instruments.volt.blank and chrome.instruments.volt.needle_value() == 0.0 and chrome.breaker.label_text() == tr("BREAKER_RUN_NIGHT"), "L03 before the circuit is built: blank meter at rest, breaker says Run the night (the study hall starts at 18:00)")
	b.act("startLevel", ["L07", 1, "learner"]); game_on_changed(); await get_tree().process_frame
	CbSmoke._check(chrome.instruments.dial.visible and not chrome.instruments.volt.visible, "grid level: frequency dial, no voltmeter")
	var pf = load("res://tests/paper_flow.gd")   # by path: tests/ is not exported, so main.gd must never name a test class (Android parse error)
	if pf != null: await pf.run(self)
