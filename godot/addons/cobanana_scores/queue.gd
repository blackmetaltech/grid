class_name CbScoresQueue
extends RefCounted
## Persistent offline submission queue (queue.json): de-duplicated by (level, solution code), capped, with the retry state.

const MAX_ENTRIES := 200

var path: String = ""
var entries: Array = []
## Consecutive failed attempts (drives the backoff).
var attempt: int = 0
## Unix time before which no attempt is made.
var next_at: float = 0.0


func _init(p: String = "") -> void:
	path = p


func size() -> int:
	return entries.size()


static func entry_key(level: String, code: String) -> String:
	return level + "\u001f" + code


## Adds an entry {level, code, metrics, nickname, game, version, region}; a repeat of the same (level, code) replaces the old one.
func add(e: Dictionary) -> void:
	var k := entry_key(str(e.get("level", "")), str(e.get("code", "")))
	for i in entries.size():
		var old: Dictionary = entries[i]
		if entry_key(str(old.get("level", "")), str(old.get("code", ""))) == k:
			entries[i] = e
			return
	entries.append(e)
	while entries.size() > MAX_ENTRIES:
		entries.remove_at(0)


func peek() -> Dictionary:
	return entries[0] if not entries.is_empty() else {}


func pop() -> void:
	if not entries.is_empty():
		entries.remove_at(0)


func clear() -> void:
	entries.clear()
	attempt = 0
	next_at = 0.0


func save() -> bool:
	var doc := {"v": 1, "entries": entries, "backoff": {"attempt": attempt, "next_at": next_at}}
	return CbScoresUtil.write_atomic(path, CbScoresUtil.stringify(doc))


func load_file() -> void:
	entries = []
	attempt = 0
	next_at = 0.0
	var doc: Variant = CbScoresUtil.read_json(path)
	if not (doc is Dictionary):
		return
	var d: Dictionary = doc
	var arr: Variant = d.get("entries", [])
	if arr is Array:
		for e: Variant in arr:
			if e is Dictionary and (e as Dictionary).has("level") and (e as Dictionary).has("code"):
				add(e)
	var b: Variant = d.get("backoff", {})
	if b is Dictionary:
		attempt = int((b as Dictionary).get("attempt", 0))
		next_at = float((b as Dictionary).get("next_at", 0.0))
