class_name GridSettings
extends RefCounted
## GRID's own persisted preferences and progress (user://grid.cfg): Cute mode (UI.md "Cute mode", default on) and the best lamps earned per job.
## The shell's CbSettings has no game-extension hook, so the Cute toggle lives in the pause menu and on the title screen. Smoke runs never touch
## the file (CbSettings.persist is false there). `CB_CUTE=0|1` overrides Cute mode for one run without saving.

static var cute := true
static var path := "user://grid.cfg"
static var _stars := {}
static var _loaded := false

static func load_all() -> void:
	if _loaded: return
	_loaded = true
	if CbSettings.persist:
		var c := ConfigFile.new()
		if c.load(path) == OK:
			cute = bool(c.get_value("a", "cute", true))
			var st = c.get_value("a", "stars", {})
			if st is Dictionary: _stars = st
	var env := OS.get_environment("CB_CUTE")
	if env != "": cute = env != "0"

static func save_all() -> void:
	if not CbSettings.persist: return
	var c := ConfigFile.new()
	c.set_value("a", "cute", cute); c.set_value("a", "stars", _stars)
	c.save(path)

## Best lamps (0..3) earned on a job.
static func stars(level_id: String) -> int:
	load_all(); return int(_stars.get(level_id, 0))

static func record_stars(level_id: String, n: int) -> void:
	load_all()
	if n > int(_stars.get(level_id, 0)): _stars[level_id] = n; save_all()

## Switch Cute mode everywhere: the world rebuilds its mascots, the music gains (or loses) the music-box lead.
static func set_cute(app: CbApp, on: bool) -> void:
	cute = on; save_all()
	apply(app)

static func apply(app: CbApp) -> void:
	var w = app.get("grid_world")
	if w != null:
		w.cute = cute; w._sig = ""   # forces the next refresh to rebuild the static scene (the camera is kept)
		w.refresh(app.b)
	var s = app.get("sound")
	if s != null: s.set_cute(cute)
