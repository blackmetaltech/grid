class_name CbScoresUtil
extends RefCounted
## Pure helpers: atomic file writes, backoff, retry-after, nickname rule, cache keys. No state, no network.

const BACKOFF_BASE := 2.0
const BACKOFF_CAP := 300.0
const BACKOFF_JITTER := 0.25
const RETRY_AFTER_MAX := 3600.0
## A cached entry older than this is considered stale (still shown, always revalidated).
const CACHE_STALE_SEC := 60.0
## A cached entry older than this is dropped on load.
const CACHE_MAX_AGE_SEC := 30.0 * 86400.0
const CACHE_MAX_ENTRIES := 200
const NICK_MIN := 3
const NICK_MAX := 16

static var _nick_re: RegEx = null


## Writes `text` to `path` via `path.tmp` + rename so a crash never leaves a half-written file.
static func write_atomic(path: String, text: String) -> bool:
	if DirAccess.make_dir_recursive_absolute(path.get_base_dir()) != OK and not DirAccess.dir_exists_absolute(path.get_base_dir()):
		return false
	var tmp := path + ".tmp"
	var f := FileAccess.open(tmp, FileAccess.WRITE)
	if f == null:
		return false
	f.store_string(text)
	f.flush()
	f.close()
	if DirAccess.rename_absolute(tmp, path) != OK:
		DirAccess.remove_absolute(tmp)
		return false
	return true


## JSON text with full float precision (17 significant digits). The server compares metrics bit-exactly, so every
## serialisation of a metric (request body, queue.json, cache.json) must use this, never plain JSON.stringify.
static func stringify(v: Variant) -> String:
	return JSON.stringify(v, "", true, true)


static func read_json(path: String) -> Variant:
	if not FileAccess.file_exists(path):
		return null
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		return null
	return parse_json(f.get_as_text())


## Quiet JSON parse: null on any error (JSON.parse_string logs engine errors).
static func parse_json(text: String) -> Variant:
	if text.strip_edges().is_empty():
		return null
	var j := JSON.new()
	if j.parse(text) != OK:
		return null
	return j.data


## Deletes a directory tree (used by tests and delete_my_data).
static func remove_tree(dir: String) -> void:
	if not DirAccess.dir_exists_absolute(dir):
		return
	for f in DirAccess.get_files_at(dir):
		DirAccess.remove_absolute(dir.path_join(f))
	for d in DirAccess.get_directories_at(dir):
		remove_tree(dir.path_join(d))
	DirAccess.remove_absolute(dir)


## Un-jittered delay in seconds before retry number `attempt` (0 = first retry): 2, 4, 8 ... capped at 5 minutes. Monotone.
static func backoff_base(attempt: int) -> float:
	return minf(BACKOFF_CAP, BACKOFF_BASE * pow(2.0, float(maxi(attempt, 0))))


## Backoff with jitter: `r` in [0,1) stretches the delay by up to +25 %, never above the cap.
static func backoff_delay(attempt: int, r: float) -> float:
	return minf(BACKOFF_CAP, backoff_base(attempt) * (1.0 + BACKOFF_JITTER * clampf(r, 0.0, 1.0)))


## Parses a Retry-After header value (delay in seconds). Returns -1.0 when absent or unusable.
static func parse_retry_after(value: String) -> float:
	var v := value.strip_edges()
	if v.is_empty() or not v.is_valid_float():
		return -1.0
	var s := v.to_float()
	if s < 0.0:
		return -1.0
	return clampf(maxf(s, 1.0), 1.0, RETRY_AFTER_MAX)


## Finds a header (case-insensitive) in Godot's PackedStringArray of "Name: value" lines.
static func header_value(headers: PackedStringArray, name: String) -> String:
	var prefix := name.to_lower() + ":"
	for h in headers:
		if h.to_lower().begins_with(prefix):
			return h.substr(prefix.length()).strip_edges()
	return ""


## "" when the nickname is acceptable (or empty = clear it), else the strings key of the problem.
static func nickname_error_key(nick: String) -> String:
	if nick.is_empty():
		return ""
	if nick.length() < NICK_MIN or nick.length() > NICK_MAX:
		return "nickname_length"
	if _nick_re == null:
		_nick_re = RegEx.new()
		_nick_re.compile("^[A-Za-z0-9](?:[A-Za-z0-9_.-]| (?! ))*[A-Za-z0-9_.-]\\z")
	if _nick_re.search(nick) == null:
		return "nickname_chars"
	return ""


static func cache_key(kind: String, game: String, version: String, region: String, level: String, metric: String, n: int = 0) -> String:
	var k := "%s|%s|%s|%s|%s|%s" % [kind, game, version, region, level, metric]
	if kind == "top":
		k += "|%d" % n
	return k


static func is_stale(cached_at: float, now: float) -> bool:
	return now - cached_at > CACHE_STALE_SEC


static func is_expired(cached_at: float, now: float) -> bool:
	return now - cached_at > CACHE_MAX_AGE_SEC


## Light client-side validation mirroring API.md; "" if fine, else a short reason.
static func validate_submission(level_id: String, code: String, metrics: Dictionary) -> String:
	var lre := RegEx.new()
	lre.compile("^[A-Za-z0-9][A-Za-z0-9_.-]{0,47}\\z")
	if lre.search(level_id) == null:
		return "bad level id"
	if code.is_empty() or code.length() > 16384:
		return "bad solution code length"
	for i in code.length():
		var c := code.unicode_at(i)
		if c < 0x20 or c > 0x7E:
			return "solution code must be printable ASCII"
	if metrics.is_empty() or metrics.size() > 16:
		return "metrics must have 1..16 keys"
	for k: Variant in metrics:
		var v: Variant = metrics[k]
		if not (v is int or v is float) or is_nan(float(v)) or is_inf(float(v)):
			return "metrics must be finite numbers"
	return ""
