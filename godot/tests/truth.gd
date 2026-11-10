class_name Truth
extends RefCounted
## Shared helpers of the headless world-truth tests (godot/tests/*.gd): start the engine through CbBridge, run a free-play grid or a level, and
## collect failures. Each test script is a SceneTree that prints `<NAME> OK` / `<NAME> FAILED n` and sets the process exit code.

var b: CbBridge
var fails := 0
var checks := 0

func start(host: Node) -> bool:
	b = CbBridge.new(); host.add_child(b)
	if not b.start(): push_error(b.last_error); return false
	b.env("autosave", [false])
	return true

func check(cond: bool, msg: String) -> void:
	checks += 1
	if not cond: fails += 1; print("FAIL: ", msg)

func near(a: float, c: float, eps: float, msg: String) -> void:
	check(absf(a - c) <= eps, "%s (%f vs %f)" % [msg, a, c])

func level(id: String) -> void:
	var r := b.act("startLevel", [id, 1, "learner"]); check(bool(r.get("ok", false)), "startLevel %s: %s" % [id, str(r.get("message", ""))])

## A free-play two-bus grid (sandbox): generator bus, load bus, one 11 kV line, one unit, one residential/industrial load. Returns the load id.
func sandbox() -> String:
	b.act("newGame", [1, "sandbox"])
	for a in [["placeBus", [2, 2, 11, "gen", 1.03]], ["placeBus", [12, 2, 11, "load", 1.0]], ["stringLine", ["B1", "B2", "l11-weasel", 1, 4]], ["placeUnit", ["ccgt-418", "B1", 20]], ["placeLoad", ["B2", "industrial", 1, 0.95]]]:
		var r := b.act(a[0], a[1]); check(bool(r.get("ok", false)), "%s: %s" % [a[0], str(r.get("message", ""))])
	return "L1"

func finish(name: String, tree: SceneTree) -> void:
	print("%s checks=%d" % [name, checks])
	print("%s OK" % name if fails == 0 else "%s FAILED %d" % [name, fails])
	tree.quit(0 if fails == 0 else 1)
