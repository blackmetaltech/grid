class_name GridSound
extends Node
## Wires GridAudio (godot/audio/grid_audio.gd) to what is on screen. Owned by main.gd, which calls `on_changed(model)` after every engine refresh and
## sends GRID cues through `route(kind)` (CbApp.sfx override). Display-driven only: hum mode and pitch come from the level kind and the `dial` query,
## the home plinks / cheer / aww from WorldModel's town energies and moods compared between refreshes, the cable tick from the clock, music stress
## from the meter band. Headless and smoke runs stay silent (GridAudio plays nothing there) and never touch the file system.

const LIT_E := 0.02            ## window energy above this = the home is lit
const MOOD_STRESS := {"sad": 1.0, "worried": 0.6, "happy": 0.2, "asleep": 0.2}
var app: CbApp
var audio: GridAudio
var _level := ""
var _tick := -1
var _lit := {}                 ## "town:index" -> bool
var _mood := ""
var _music := false
var _vol_sig := ""
var _in_svc := -1             ## lines in service at the last refresh (a drop while the clock runs is a trip)
var _dark := false            ## blackout at the last refresh

func setup(a: CbApp) -> void:
	app = a
	audio = GridAudio.new(); audio.name = "GridAudio"; add_child(audio)
	audio.set_cute(GridSettings.cute)
	audio.set_hum_volume(-80.0)

## True when `kind` is a GRID cue and was played here (the shell keeps the rest: click, confirm, back ...).
func route(kind: String) -> bool:
	if audio == null: return false
	if kind == "plink" or kind in GridAudio.ONE_SHOTS:
		audio.play(kind); return true
	return false

func set_cute(on: bool) -> void:
	if audio != null: audio.set_cute(on)

## Worst mood over the towns of a bench model: sad > worried > asleep (all dark) > happy. "" when the level has no moods (grid levels).
static func overall_mood(model: Dictionary) -> String:
	var worst := ""; var all_asleep := true; var any := false
	for t in model.get("towns", []):
		if not (t as Dictionary).has("mood"): continue
		any = true
		var m := str(t.mood)
		if m != "asleep": all_asleep = false
		if m == "sad": return "sad"
		if m == "worried": worst = "worried"
	if not any: return ""
	if worst != "": return worst
	return "asleep" if all_asleep else "happy"

func _snapshot(model: Dictionary) -> Dictionary:
	var lit := {}
	for t in model.get("towns", []):
		var en: PackedFloat32Array = t.energies
		for i in en.size(): lit["%s:%d" % [t.id, i]] = en[i] > LIT_E
	return lit

func on_changed(model: Dictionary) -> void:
	if app == null or audio == null: return
	if not app.started:   # title: no hum, no music
		if _music: audio.stop_music(1.0); audio.set_hum_volume(-80.0); _music = false; _level = ""
		return
	var lvl := str(model.get("level", "")); var kind := str(model.get("kind", "none"))
	audio.set_mode("ac" if kind == "grid" else "dc")
	var fresh := lvl != _level or not _music
	if kind == "grid":
		var dq = app.b.q("dial")
		if dq is Dictionary and not dq.get("error", false) and dq.get("fHz") != null: audio.set_frequency(float(dq.fHz))
	if kind == "bench":   # L04: the alternator hums at twice the frequency its poles and the water head make, so changing poles is heard (GridAudio: fundamental 2 f)
		var cb = app.b.q("ch2Bench")
		if cb is Dictionary and cb.get("active", false) and str(cb.get("kind", "")) == "machine": audio.set_mode("ac"); audio.set_frequency(float(cb.fHz))
	var sig := "%s|%s|%s" % [CbSettings.music_volume, CbSettings.sfx_volume, CbSettings.music_mode]
	if sig != _vol_sig:
		_vol_sig = sig; audio.apply_volumes()
		if _music and CbSettings.music_mode == "off": audio.stop_music(0.6)
		elif _music and CbSettings.music_mode != "off": audio.start_music()
	var c = app.b.q("clock"); var tick: int = int(c.tick) if c is Dictionary and not c.is_empty() else -1
	var cur_lit := _snapshot(model); var mood := overall_mood(model)
	if fresh:   # a new job: no sounds for what was already true, then the music and the hum begin
		_level = lvl; _music = true; _tick = tick; _lit = cur_lit; _mood = mood; _in_svc = _lines_in(model); _dark = bool(model.get("blackout", false))
		audio.set_cute(GridSettings.cute); audio.set_hum_volume(-6.0); audio.start_music()
	else:
		if kind == "bench" and tick > _tick: audio.cable_tick()
		_tick = tick
		var newly: Array = []
		for t in model.get("towns", []):
			var en: PackedFloat32Array = t.energies
			for i in en.size():
				if en[i] > LIT_E and not bool(_lit.get("%s:%d" % [t.id, i], false)): newly.append(i)
		var k := 0
		for i in newly.slice(0, 16):
			_later(0.07 * k, func(): audio.plink(i)); k += 1
		if mood == "happy" and (_mood == "sad" or _mood == "asleep"): _later(0.07 * k + 0.2, func(): audio.play("cheer"))
		elif mood == "sad" and _mood != "sad": audio.play("aww")
		_lit = cur_lit; _mood = mood
		# 1.7: a protection trip and a blackout are heard, not only seen (they were silent)
		var n_in := _lines_in(model); var dark := bool(model.get("blackout", false))
		if dark and not _dark: audio.play("blackout")
		elif n_in >= 0 and _in_svc >= 0 and n_in < _in_svc and app.speed > 0: audio.play("trip")
		_in_svc = n_in; _dark = dark
	var stress := float(MOOD_STRESS.get(mood, 0.2))
	if kind == "grid": stress = 1.0 if bool(model.get("blackout", false)) else 0.2
	audio.set_stress(stress)

static func _lines_in(model: Dictionary) -> int:
	var n := 0
	for l in model.get("lines", []):
		if bool((l as Dictionary).get("in_service", true)): n += 1
	return n

func _later(delay: float, f: Callable) -> void:
	if delay <= 0.0 or not is_inside_tree(): f.call(); return
	get_tree().create_timer(delay).timeout.connect(f)
