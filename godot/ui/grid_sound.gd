class_name GridSound
extends Node
## Wires GridAudio (godot/audio/grid_audio.gd) to what is on screen. Owned by main.gd, which calls `on_changed(model)` after every engine refresh and
## sends GRID cues through `route(kind)` (CbApp.sfx override). Display-driven only: hum mode and pitch come from the level kind and the `dial` query,
## the home plinks / cheer / aww from WorldModel's town energies and moods compared between refreshes, the cable tick from the clock, music stress
## from the meter band. Headless and smoke runs stay silent (GridAudio plays nothing there) and never touch the file system.

const HUM_DB := -12.0          ## 1.18: was -6; the hum sat 5 dB over the music
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
var _units_on := -1           ## units online at the last refresh (a drop while the clock runs is a unit trip)
var _dark_ms := -100000       ## when the blackout cue started (the radio waits for the silence after the thud)
var _player_ms := -100000     ## when the player last switched, placed or removed something (their own click is not a trip)
var _hum_tw: Tween
const RADIO_WAIT := 1.8        ## seconds after a blackout begins before the radio may speak: spin-down 0.55, thud, then silence

func setup(a: CbApp) -> void:
	app = a
	audio = GridAudio.new(); audio.name = "GridAudio"; add_child(audio)
	audio.set_cute(GridSettings.cute)
	audio.set_hum_volume(-80.0)

## True when `kind` is a GRID cue and was played here (the shell keeps the rest: click, confirm, back ...).
func route(kind: String) -> bool:
	if audio == null: return false
	if kind == "plink" or kind in GridAudio.ONE_SHOTS:
		if kind in ["breaker_open", "breaker_close", "place"]: _player_ms = Time.get_ticks_msec()
		if kind == "radio" and _dark:   # a blackout: hum, bed and music are gone, a low thud, silence, and then the radio
			var wait := RADIO_WAIT - float(Time.get_ticks_msec() - _dark_ms) / 1000.0
			if wait > 0.0: _later(wait, func(): audio.play("radio")); return true
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

static func _snapshot(model: Dictionary) -> Dictionary:
	var lit := {}
	for t in model.get("towns", []):
		var en: PackedFloat32Array = t.energies
		for i in en.size(): lit["%s:%d" % [t.id, i]] = en[i] > LIT_E
	return lit

## What lit up between two refreshes. `prev` is a snapshot ("town:index" -> lit). Returns {"towns": [[id, homes_lit_now]], "plinks": [home index]}:
## a town that had no lit home and now has some comes on as a chord (bigger with more homes); homes lighting in a town already on plink.
static func plan_lights(prev: Dictionary, model: Dictionary) -> Dictionary:
	var towns: Array = []; var plinks: Array = []
	for t in model.get("towns", []):
		var en: PackedFloat32Array = t.energies; var was := 0; var now := 0; var fresh: Array = []
		for i in en.size():
			var lit := en[i] > LIT_E
			if lit: now += 1
			if bool(prev.get("%s:%d" % [t.id, i], false)): was += 1
			elif lit: fresh.append(i)
		if was == 0 and now > 0: towns.append([str(t.id), now])
		else: plinks.append_array(fresh)
	return {"towns": towns, "plinks": plinks}

func _hum_to(db: float, secs: float) -> void:
	if _hum_tw != null and _hum_tw.is_valid(): _hum_tw.kill()
	_hum_tw = create_tween(); _hum_tw.tween_method(audio.set_hum_volume, audio.hum_db, db, secs)

func on_changed(model: Dictionary) -> void:
	if app == null or audio == null: return
	if not app.started:   # title: no hum, no music
		if _music: audio.stop_music(1.0); audio.set_hum_volume(-80.0); _music = false; _level = ""
		if audio.has_method("set_outdoor"): audio.set_outdoor(0.0, 0.0)
		return
	var lvl := str(model.get("level", "")); var kind := str(model.get("kind", "none"))
	audio.set_mode("ac" if kind == "grid" else "dc")
	if audio.has_method("set_outdoor"): audio.set_outdoor(1.0 if GridTheme.look2 and not bool(model.get("blackout", false)) else 0.0, WorldMath.night(float(model.get("minute", 720.0))))   # LOOK2: wind, crickets at night
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
		_level = lvl; _music = true; _tick = tick; _lit = cur_lit; _mood = mood; _in_svc = _lines_in(model); _units_on = _units_in(model); _dark = bool(model.get("blackout", false))
		if _hum_tw != null and _hum_tw.is_valid(): _hum_tw.kill()
		audio.set_cute(GridSettings.cute); audio.set_hum_volume(HUM_DB); audio.start_music()
	else:
		if kind == "bench" and tick > _tick: audio.cable_tick()
		_tick = tick
		var plan := plan_lights(_lit, model)
		var k := 0
		for tw in plan.towns:   # people getting light: one warm chord per town, bigger with more homes lit
			_later(0.12 * k, func(): audio.town_on(int(tw[1]))); k += 1
		var pl: Array = plan.plinks
		for i in pl.slice(0, 8):
			_later(0.07 * k, func(): audio.plink(i)); k += 1
		if mood == "happy" and (_mood == "sad" or _mood == "asleep") and plan.towns.is_empty(): _later(0.07 * k + 0.2, func(): audio.play("cheer"))
		elif mood == "sad" and _mood != "sad": audio.play("aww")
		_lit = cur_lit; _mood = mood
		# 1.7: a protection trip and a blackout are heard, not only seen. 1.18: a unit dropping out trips too, a line coming back is a breaker closing
		# (unless the player just did it: their own switch already played), and a blackout takes the hum, the bed and the music away.
		var n_in := _lines_in(model); var u_on := _units_in(model); var dark := bool(model.get("blackout", false))
		var by_player := Time.get_ticks_msec() - _player_ms < 700
		if dark and not _dark:
			_dark_ms = Time.get_ticks_msec(); audio.play("blackout"); _hum_to(-80.0, 0.5); audio.stop_music(1.2)
		elif not dark and _dark:
			_hum_to(HUM_DB, 2.0); audio.start_music()
		elif not dark and app.speed > 0 and not by_player:
			if (n_in >= 0 and _in_svc >= 0 and n_in < _in_svc) or (u_on >= 0 and _units_on >= 0 and u_on < _units_on): audio.play("trip")
			elif n_in > _in_svc and _in_svc >= 0: audio.play("breaker_close")
		_in_svc = n_in; _units_on = u_on; _dark = dark
	var stress := float(MOOD_STRESS.get(mood, 0.2))
	if kind == "grid": stress = 1.0 if bool(model.get("blackout", false)) else 0.2
	audio.set_stress(stress)

static func _units_in(model: Dictionary) -> int:
	var n := 0; var any := false
	for u in model.get("units", []):
		any = true
		if bool((u as Dictionary).get("online", true)): n += 1
	return n if any else -1

static func _lines_in(model: Dictionary) -> int:
	var n := 0
	for l in model.get("lines", []):
		if bool((l as Dictionary).get("in_service", true)): n += 1
	return n

func _later(delay: float, f: Callable) -> void:
	if delay <= 0.0 or not is_inside_tree(): f.call(); return
	get_tree().create_timer(delay).timeout.connect(f)
