class_name GridTicker
extends RefCounted
## 1.8: the engine tick off the main thread. CbApp.next_tick sends `act tick` and then `claim` and waits for both replies, so every tick
## blocked one frame on the sidecar (the finale at 4x: 30-40 ms a tick on the desk, plus a second full UI refresh for the claim).
## Here a worker thread sends both requests (the bridge's mutex keeps the pipe to one request at a time) and parses the replies; the main
## thread polls once a frame and applies the result in one go: one snapshot, one `changed`, one UI refresh. While a tick is in flight the
## clock does not start another, and the screen keeps drawing the last state.
## Counters for tests (godot/tests/ticker_flow.gd): `main_waits` counts tick requests made on the main thread (must stay 0), `frames_in_flight`
## counts frames polled while a tick was running (the frame loop went on), `applied` counts ticks applied.

var b: CbBridge
var _th: Thread
var _g_before = null
var main_waits := 0
var frames_in_flight := 0
var applied := 0
var dropped := 0
var apply_us := 0   # main-thread time spent applying ticks (the snapshot, `changed` and every UI refresh it triggers)

func _init(bridge: CbBridge) -> void: b = bridge

func busy() -> bool: return _th != null

## Start a tick on the worker. False when one is already running.
func start() -> bool:
	if _th != null: return false
	_g_before = b.g
	_th = Thread.new(); _th.start(_work)
	return true

func _work() -> Dictionary:
	if OS.get_thread_caller_id() == OS.get_main_thread_id(): main_waits += 1
	var r := b._req({"fn": "act", "name": "tick", "args": [1]})
	var c := {}
	if r.get("ok", false): c = b._req({"fn": "claim"})
	return {"r": r, "c": c}

## Once a frame on the main thread. Returns {} while nothing finished, else {ok, message, missions} for the tick just applied.
func poll() -> Dictionary:
	if _th == null: return {}
	if _th.is_alive(): frames_in_flight += 1; return {}
	var out: Dictionary = _th.wait_to_finish(); _th = null
	var r: Dictionary = out.r; var c: Dictionary = out.c
	if not r.get("ok", false):
		push_error("tick: %s" % r.get("error", "?")); return {"ok": false, "message": str(r.get("error", "engine error")), "missions": []}
	if not is_same(b.g, _g_before):   # another action (reset, retry, a build) ran after this tick: its snapshot is newer, keep it
		dropped += 1; return {"ok": true, "message": "", "missions": []}
	b.g = r.game
	var missions: Array = []
	if c.get("ok", false):
		b.g = c.game
		var res = c.get("result", [])
		if res is Array: missions = res
	b._cache.clear(); applied += 1
	var t0 := Time.get_ticks_usec()
	b.changed.emit()
	apply_us += Time.get_ticks_usec() - t0
	var res2 = r.get("result", null)
	var ok := true; var msg := ""
	if res2 is Dictionary: ok = bool(res2.get("ok", true)); msg = str(res2.get("message", ""))
	return {"ok": ok, "message": msg, "missions": missions}

## Wait for a running tick (leaving a level, quitting) and apply it, so nothing lands on the next level.
func finish() -> Dictionary:
	if _th == null: return {}
	while _th.is_alive(): OS.delay_msec(1)
	return poll()
