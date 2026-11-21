extends SceneTree
## 1.8 ticker (ui/grid_ticker.gd), headless with the real engine bridge on the finale map (L28). Load-proof: it counts, it does not time.
## Every tick runs on the worker thread (no tick request is ever made on the main thread), the frame loop keeps going while a tick is in
## flight (frames are counted, not timed), each tick is applied once with one `changed`, a query asked mid-tick gets a real answer, and a
## level change made while a tick is running wins over the stale tick.

var T: Truth
var tk: GridTicker
var stage := 0
var ticks := 0
var frames := 0
var changes := 0
var minute0 := -1.0
var mid_q_ok := true

func _initialize() -> void:
	T = Truth.new()
	if not T.start(root): print("TICKER-FLOW FAILED engine"); quit(1); return
	CbRegion.refresh(T.b); GridUi.load_strings()
	T.level("L28")
	T.b.changed.connect(func(): changes += 1)
	tk = GridTicker.new(T.b)
	minute0 = _minute()

func _minute() -> float:
	var c = T.b.q("clock")
	return float(c.day) * 1440.0 + float(c.hour) * 60.0 + float(c.minute)

func _process(_dt: float) -> bool:
	if T == null or tk == null: return false
	frames += 1
	if stage == 0:
		var r := tk.poll()
		if not r.is_empty(): ticks += 1
		if tk.busy() and frames % 3 == 0:   # a query on the main thread while the tick runs: waits its turn, gets a real answer
			T.b._cache.clear(); var c = T.b.q("levelInfo")   # a real request, not a cache hit
			if not (c is Dictionary and str(c.get("id", "")) == "L28"): mid_q_ok = false
		if not tk.busy():
			if ticks >= 40 or str(T.b.g.get("status", "playing")) != "playing": stage = 1
			else: tk.start()
		if frames > 400000: stage = 1
	elif stage == 1:
		T.check(tk.main_waits == 0, "no tick request ran on the main thread (%d)" % tk.main_waits)
		T.check(ticks >= 40 and tk.applied == ticks, "40 ticks ran and each was applied once (%d ticks, %d applied)" % [ticks, tk.applied])
		T.check(changes == tk.applied, "one changed signal per tick, not two (%d for %d)" % [changes, tk.applied])
		T.check(tk.frames_in_flight >= ticks, "the frame loop went on while ticks ran (%d frames in flight for %d ticks)" % [tk.frames_in_flight, ticks])
		T.check(_minute() > minute0, "the clock moved (%.0f -> %.0f min)" % [minute0, _minute()])
		T.check(mid_q_ok, "queries asked mid-tick answered for L28")
		tk.start(); T.level("L07")   # a level change made while a tick is in flight
		var r := tk.finish()
		T.check(tk.dropped == 1 and r.get("ok", false), "the stale tick was dropped (%d)" % tk.dropped)
		var li = T.b.q("levelInfo")
		T.check(li is Dictionary and str(li.id) == "L07", "the new level stands after the stale tick (%s)" % str(li.get("id", "?")))
		stage = 2
		T.finish("TICKER-FLOW", self)
	return false
