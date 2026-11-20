class_name CbScoresClient
extends Node
## Offline-first client for the cobanana-scores leaderboard. Add it as the autoload `Scores`, call `configure`, then
## `submit` / `request_histogram` / `request_top`. Everything is signal based and never blocks gameplay; being offline is
## normal and silent. See README.md.

## Cached or fresh histogram. `data` is the server JSON (buckets, total, you, ...).
signal histogram_ready(level_id: String, metric: String, data: Dictionary, from_cache: bool)
signal top_ready(level_id: String, metric: String, data: Dictionary, from_cache: bool)
## The server verified and stored a submission (see API.md for the dictionary).
signal submission_result(level_id: String, result: Dictionary)
## A submission was permanently refused (or failed local validation) and dropped from the queue.
signal submission_rejected(level_id: String, code: String, message: String)
signal status_changed(online: bool)
## Result of `delete_my_data`.
signal data_deleted(ok: bool)

const USER_DIR := "user://cobanana_scores"

var base_url: String = ""
var game: String = ""
var game_version: String = ""
var region_ruleset: String = "global"
## Directory for the state files. Defaults to user://cobanana_scores (or $CB_SCORES_HOME); set before first use to override.
var home_dir: String = ""
var request_timeout: float = 15.0
## Nothing is sent until the player has seen the first-run notice (acknowledge_notice), unless the game sets this true
## (e.g. its own consent screen already covered online scores). Submissions made before that are queued, not lost.
var send_before_notice := false
## Requests actually started (tests assert this stays 0 when OFF).
var stats_requests_sent: int = 0
var queue: CbScoresQueue = CbScoresQueue.new()
var cache: Dictionary = {}
## null until the first response or failure.
var online: Variant = null

var _http: HTTPRequest
var _timer: Timer
var _loaded := false
var _enabled := true
var _notice_ack := false
var _nickname := ""
var _player_id := ""
var _token := ""
var _busy := false
var _reads: Array = []
var _ops: Array = []
var _rng := RandomNumberGenerator.new()


func _init() -> void:
	_rng.randomize()
	_http = HTTPRequest.new()
	_http.timeout = request_timeout
	_http.set_tls_options(TLSOptions.client())
	add_child(_http)
	_timer = Timer.new()
	_timer.one_shot = true
	_timer.timeout.connect(_pump)
	add_child(_timer)


func _ready() -> void:
	_ensure_loaded()
	_pump()


## Config keys: base_url, game, game_version, region_ruleset (default "global"), home_dir (optional).
## $CB_SCORES_URL overrides base_url; CB_SCORES_OFF=1 forces scores off.
func configure(cfg: Dictionary) -> void:
	base_url = str(cfg.get("base_url", base_url))
	game = str(cfg.get("game", game))
	game_version = str(cfg.get("game_version", game_version))
	region_ruleset = str(cfg.get("region_ruleset", region_ruleset))
	if cfg.has("home_dir"):
		home_dir = str(cfg["home_dir"])
	var env := OS.get_environment("CB_SCORES_URL")
	if not env.is_empty():
		base_url = env
	base_url = base_url.rstrip("/")
	_ensure_loaded()
	_pump.call_deferred()


# ---- settings ---------------------------------------------------------------

## True when online scores are on (the setting) and not forced off by CB_SCORES_OFF=1.
func is_enabled() -> bool:
	_ensure_loaded()
	return _enabled and OS.get_environment("CB_SCORES_OFF") != "1"


## Turning off sends nothing further and creates no identity. Existing queued entries stay (untouched) until turned on again.
func set_enabled(on: bool) -> void:
	_ensure_loaded()
	_enabled = on
	_save_settings()
	if on:
		_pump.call_deferred()


func needs_first_run_notice() -> bool:
	_ensure_loaded()
	return not _notice_ack


func acknowledge_notice() -> void:
	_ensure_loaded()
	_notice_ack = true
	_save_settings()
	_pump.call_deferred()


func notice_text() -> String:
	return CbScoresStrings.get_text("notice_body")


func get_nickname() -> String:
	_ensure_loaded()
	return _nickname


## Stores the nickname (sent with later submissions, and pushed now if a player id already exists). "" clears it.
## Returns "" when accepted, else a player-facing reason (the server does the profanity check).
func set_nickname(nick: String) -> String:
	_ensure_loaded()
	var key := CbScoresUtil.nickname_error_key(nick)
	if not key.is_empty():
		return CbScoresStrings.get_text(key)
	_nickname = nick
	_save_settings()
	if is_enabled() and has_identity():
		_ops.append({"type": "nick", "nick": nick})
		_pump.call_deferred()
	return ""


func has_identity() -> bool:
	_ensure_loaded()
	return not _token.is_empty()


func pending_count() -> int:
	_ensure_loaded()
	return queue.size()


# ---- public API -------------------------------------------------------------

## Queues a solution for verification and returns at once (true if queued). Nothing is queued or sent when scores are off.
func submit(level_id: String, solution_code: String, metrics: Dictionary, nickname: String = "") -> bool:
	_ensure_loaded()
	if not is_enabled():
		return false
	var bad := CbScoresUtil.validate_submission(level_id, solution_code, metrics)
	if not bad.is_empty():
		submission_rejected.emit.call_deferred(level_id, "invalid_local", bad)
		return false
	if game.is_empty() or game_version.is_empty():
		submission_rejected.emit.call_deferred(level_id, "not_configured", "Scores.configure() was not called")
		return false
	var nick := nickname if not nickname.is_empty() else _nickname
	if not CbScoresUtil.nickname_error_key(nick).is_empty():
		nick = ""
	queue.add({"level": level_id, "code": solution_code, "metrics": metrics, "nickname": nick,
		"game": game, "version": game_version, "region": region_ruleset, "queued_at": _now()})
	queue.save()
	_pump.call_deferred()
	return true


## Emits histogram_ready with the cached copy at once (if any), then again with fresh data when the server answers.
func request_histogram(level_id: String, metric: String, value: Variant = null) -> void:
	_request_read("histogram", level_id, metric, 0, value)


func request_top(level_id: String, metric: String, n: int = 10) -> void:
	_request_read("top", level_id, metric, clampi(n, 1, 100), null)


## Erases the local identity/queue now and asks the server to erase the player and all their scores.
## Works even when scores are off (it is a user request). Emits data_deleted.
func delete_my_data() -> void:
	_ensure_loaded()
	queue.clear()
	queue.save()
	if has_identity():
		_ops.append({"type": "delete"})
		_pump.call_deferred()
	else:
		data_deleted.emit.call_deferred(true)


# ---- state files ------------------------------------------------------------

func _dir() -> String:
	return home_dir


func _ensure_loaded() -> void:
	if _loaded:
		return
	_loaded = true
	if home_dir.is_empty():
		home_dir = OS.get_environment("CB_SCORES_HOME")
	if home_dir.is_empty():
		home_dir = USER_DIR
	queue = CbScoresQueue.new(home_dir.path_join("queue.json"))
	queue.load_file()
	var cf := ConfigFile.new()
	if cf.load(home_dir.path_join("settings.cfg")) == OK:
		_enabled = bool(cf.get_value("scores", "enabled", true))
		_notice_ack = bool(cf.get_value("scores", "notice_ack", false))
		_nickname = str(cf.get_value("scores", "nickname", ""))
	var idf := ConfigFile.new()
	if idf.load(home_dir.path_join("identity.cfg")) == OK:
		_player_id = str(idf.get_value("identity", "player_id", ""))
		_token = str(idf.get_value("identity", "token", ""))
	var doc: Variant = CbScoresUtil.read_json(home_dir.path_join("cache.json"))
	if doc is Dictionary and (doc as Dictionary).get("entries") is Dictionary:
		var now := _now()
		var ents: Dictionary = (doc as Dictionary)["entries"]
		for k: String in ents:
			var e: Variant = ents[k]
			if e is Dictionary and (e as Dictionary).get("data") is Dictionary \
					and not CbScoresUtil.is_expired(float((e as Dictionary).get("t", 0.0)), now):
				cache[k] = e


func _save_settings() -> void:
	DirAccess.make_dir_recursive_absolute(home_dir)
	var cf := ConfigFile.new()
	cf.set_value("scores", "enabled", _enabled)
	cf.set_value("scores", "notice_ack", _notice_ack)
	cf.set_value("scores", "nickname", _nickname)
	cf.save(home_dir.path_join("settings.cfg"))


func _save_identity() -> void:
	DirAccess.make_dir_recursive_absolute(home_dir)
	var cf := ConfigFile.new()
	cf.set_value("identity", "player_id", _player_id)
	cf.set_value("identity", "token", _token)
	cf.save(home_dir.path_join("identity.cfg"))


func _clear_identity() -> void:
	_player_id = ""
	_token = ""
	DirAccess.remove_absolute(home_dir.path_join("identity.cfg"))


## Test hook: replace the stored token (e.g. with a forged one).
func _set_token_for_test(token: String) -> void:
	_ensure_loaded()
	_token = token
	_save_identity()


func _cache_put(key: String, data: Dictionary) -> void:
	cache[key] = {"t": _now(), "data": data}
	while cache.size() > CbScoresUtil.CACHE_MAX_ENTRIES:
		var oldest := ""
		var oldest_t := INF
		for k: String in cache:
			var t := float((cache[k] as Dictionary).get("t", 0.0))
			if t < oldest_t:
				oldest_t = t
				oldest = k
		cache.erase(oldest)
	CbScoresUtil.write_atomic(home_dir.path_join("cache.json"), CbScoresUtil.stringify({"v": 1, "entries": cache}))


static func _now() -> float:
	return Time.get_unix_time_from_system()


# ---- reads ------------------------------------------------------------------

func _request_read(kind: String, level_id: String, metric: String, n: int, value: Variant) -> void:
	_ensure_loaded()
	var key := CbScoresUtil.cache_key(kind, game, game_version, region_ruleset, level_id, metric, n)
	if cache.has(key):
		var e: Dictionary = cache[key]
		var data: Dictionary = (e["data"] as Dictionary).duplicate(true)
		data["_cached_at"] = e.get("t", 0.0)
		data["_stale"] = CbScoresUtil.is_stale(float(e.get("t", 0.0)), _now())
		_emit_read.call_deferred(kind, level_id, metric, data, true)
	if not is_enabled() or base_url.is_empty():
		return
	for r: Dictionary in _reads:
		if r["key"] == key:
			r["value"] = value
			return
	_reads.append({"kind": kind, "level": level_id, "metric": metric, "n": n, "value": value, "key": key})
	_pump.call_deferred()


func _emit_read(kind: String, level_id: String, metric: String, data: Dictionary, from_cache: bool) -> void:
	if kind == "top":
		top_ready.emit(level_id, metric, data, from_cache)
	else:
		histogram_ready.emit(level_id, metric, data, from_cache)


func _do_read(r: Dictionary) -> void:
	var q := "gameVersion=%s&regionRuleset=%s" % [game_version.uri_encode(), region_ruleset.uri_encode()]
	var path := ""
	if r["kind"] == "top":
		path = "/v1/top/%s/%s/%s?%s&n=%d" % [game.uri_encode(), String(r["level"]).uri_encode(), String(r["metric"]).uri_encode(), q, int(r["n"])]
	else:
		path = "/v1/histograms/%s/%s/%s?%s" % [game.uri_encode(), String(r["level"]).uri_encode(), String(r["metric"]).uri_encode(), q]
		if r["value"] != null:
			path += "&value=%s" % str(r["value"]).uri_encode()
	var res := await _request(HTTPClient.METHOD_GET, path, null, true)
	if int(res["net"]) == 0 and int(res["status"]) == 401:
		res = await _request(HTTPClient.METHOD_GET, path, null, false)
	if int(res["net"]) == 0 and int(res["status"]) == 200 and (res["body"] as Dictionary).size() > 0:
		var data: Dictionary = res["body"]
		_cache_put(String(r["key"]), data)
		_emit_read(String(r["kind"]), String(r["level"]), String(r["metric"]), data, false)


# ---- network core -----------------------------------------------------------

## One request. Returns {net: 0 | error, status, body: Dictionary, retry_after}. Updates online status.
func _request(method: HTTPClient.Method, path: String, body: Variant, auth: bool) -> Dictionary:
	var out := {"net": -1, "status": 0, "body": {}, "retry_after": -1.0}
	var headers := PackedStringArray(["accept: application/json"])
	var payload := ""
	if body != null:
		headers.append("content-type: application/json")
		payload = CbScoresUtil.stringify(body)
	if auth and not _token.is_empty():
		headers.append("authorization: Bearer " + _token)
	_http.timeout = request_timeout
	stats_requests_sent += 1
	var err := _http.request(base_url + path, headers, method, payload)
	if err != OK:
		out["net"] = err
		_set_online(false)
		return out
	var res: Array = await _http.request_completed
	out["net"] = 0 if int(res[0]) == HTTPRequest.RESULT_SUCCESS else int(res[0])
	out["status"] = int(res[1])
	out["retry_after"] = CbScoresUtil.parse_retry_after(CbScoresUtil.header_value(res[2], "retry-after"))
	var parsed: Variant = CbScoresUtil.parse_json((res[3] as PackedByteArray).get_string_from_utf8())
	if parsed is Dictionary:
		out["body"] = parsed
	_set_online(int(out["net"]) == 0 and int(out["status"]) < 500)
	return out


func _set_online(v: bool) -> void:
	if online == null or bool(online) != v:
		online = v
		status_changed.emit(v)


## Registers if there is no identity yet. Returns the failing response on failure, {} on success.
func _ensure_identity() -> Dictionary:
	if has_identity():
		return {}
	var res := await _request(HTTPClient.METHOD_POST, "/v1/players", null, false)
	var b: Dictionary = res["body"]
	if int(res["net"]) == 0 and int(res["status"]) == 201 and b.has("token") and b.has("playerId"):
		_player_id = str(b["playerId"])
		_token = str(b["token"])
		_save_identity()
		return {}
	res["failed"] = true
	return res


func _backoff(retry_after: float) -> void:
	var delay := retry_after if retry_after > 0.0 else CbScoresUtil.backoff_delay(queue.attempt, _rng.randf())
	queue.attempt += 1
	queue.next_at = _now() + delay
	queue.save()


const UNKNOWN_VERSION_RETRY_S := 6.0 * 3600.0


static func _error_code(b: Dictionary) -> String:
	var err: Variant = b.get("error")
	return str((err as Dictionary).get("code", "")) if err is Dictionary else ""


func _process_head() -> void:
	var e := queue.peek()
	var level := str(e.get("level", ""))
	var body := {"game": e.get("game", game), "gameVersion": e.get("version", game_version),
		"regionRuleset": e.get("region", region_ruleset), "levelId": level,
		"solutionCode": e.get("code", ""), "metrics": e.get("metrics", {})}
	if not str(e.get("nickname", "")).is_empty():
		body["nickname"] = e["nickname"]
	var reregistered := false
	var res: Dictionary = {}
	while true:
		var fail := await _ensure_identity()
		if not fail.is_empty():
			_backoff(float(fail["retry_after"]))
			return
		res = await _request(HTTPClient.METHOD_POST, "/v1/submissions", body, true)
		if int(res["net"]) == 0 and int(res["status"]) == 401 and not reregistered:
			reregistered = true
			_clear_identity()
			continue
		break
	var status := int(res["status"])
	var b: Dictionary = res["body"]
	if int(res["net"]) == 0 and status == 200:
		queue.pop()
		queue.attempt = 0
		queue.next_at = 0.0
		queue.save()
		submission_result.emit(level, b)
	elif int(res["net"]) == 0 and status == 422 and _error_code(b) == "unsupported_game_version":
		# The server does not know this build yet (game shipped before the server was updated): keep the entry and
		# try again much later instead of losing the player's score.
		_backoff(UNKNOWN_VERSION_RETRY_S)
	elif int(res["net"]) == 0 and status in [400, 404, 409, 413, 415, 422]:
		var err: Dictionary = b.get("error", {}) if b.get("error") is Dictionary else {}
		queue.pop()
		queue.attempt = 0
		queue.next_at = 0.0
		queue.save()
		submission_rejected.emit(level, str(err.get("code", "http_%d" % status)), str(err.get("message", "")))
	else:
		# network error, 5xx, 429 (retry-after), a second 401, or any unexpected status: retry later
		_backoff(float(res["retry_after"]))


func _do_op(op: Dictionary) -> void:
	if op["type"] == "nick":
		await _request(HTTPClient.METHOD_PUT, "/v1/players/me", {"nickname": null if str(op["nick"]).is_empty() else op["nick"]}, true)
	elif op["type"] == "delete":
		var res := await _request(HTTPClient.METHOD_DELETE, "/v1/players/me", null, true)
		var ok := int(res["net"]) == 0 and int(res["status"]) in [204, 200, 401, 404]
		if ok:
			_clear_identity()
		data_deleted.emit(ok)


## Single-flight pump: one HTTPRequest, one request at a time. Reentry-safe.
func _pump() -> void:
	if _busy or not is_inside_tree() or base_url.is_empty():
		return
	_ensure_loaded()
	_busy = true
	while is_inside_tree():
		if not _ops.is_empty():
			await _do_op(_ops.pop_front())
			continue
		if not is_enabled() or not (_notice_ack or send_before_notice):
			break
		if not _reads.is_empty():
			await _do_read(_reads.pop_front())
			continue
		if queue.size() > 0:
			var wait := queue.next_at - _now()
			if wait > 0.0:
				_timer.start(maxf(wait, 0.05))
				break
			await _process_head()
			continue
		break
	_busy = false
