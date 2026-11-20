# cobanana_scores: Godot client for the shared leaderboard

Offline-first client for `cobanana-scores` (see `docs/API.md` in that repo). Self-contained, Godot 4.x, no dependency on the core `cobanana` addon. Never blocks gameplay; being offline is normal and silent.

## Install
Copy (or symlink) `addons/cobanana_scores/` into the game's `godot/addons/`, enable the plugin (Project Settings > Plugins; it registers the autoload), or add the autoload by hand:

```
Scores = "*res://addons/cobanana_scores/scores.gd"
```

Run `godot --headless --path godot --import` once after adding it.

## Use
```gdscript
Scores.configure({"base_url": "https://scores.example.com", "game": "grid", "game_version": "0.1.0", "region_ruleset": "global"})
Scores.submission_result.connect(func(level, result): print(result.best))
Scores.histogram_ready.connect(func(level, metric, data, from_cache): draw(data))
Scores.submit("g1", solution_code, {"cost": 42, "parts": 3}, "")   # returns at once
Scores.request_histogram("g1", "cost")        # cached copy first (from_cache=true), then fresh
Scores.request_histogram("g1", "cost", 42)    # `you` = where a hypothetical value 42 would land
Scores.request_top("g1", "cost", 10)
Scores.set_nickname("Ada")                     # returns "" or a reason; the server does profanity
Scores.delete_my_data()                        # erases local identity/queue + server data
```

Signals: `histogram_ready(level_id, metric, data, from_cache)`, `top_ready(...)`, `submission_result(level_id, result)`, `submission_rejected(level_id, code, message)` (permanent refusal or local validation), `status_changed(online)`, `data_deleted(ok)`.

## Behaviour
- **Identity**: first submission registers (`POST /v1/players`); `{playerId, token}` kept in `user://cobanana_scores/identity.cfg`. A 401 re-registers once and retries.
- **Queue** (`queue.json`, atomic temp+rename): de-duplicated by (level, solution code), max 200 (oldest dropped), one request at a time through one `HTTPRequest` (15 s timeout). Network error, 5xx, 429 (honours `retry-after`): exponential backoff 2 s to 5 min with jitter, persisted. 400/404/409/413/415/422: dropped + `submission_rejected`.
- **Cache** (`cache.json`): histograms/top by (kind, game, version, region, level, metric); stale-while-revalidate (cached data carries `_cached_at`, `_stale`); entries older than 30 days are dropped.
- **Settings** (`settings.cfg`): "Online scores" on/off, default ON. When OFF nothing is sent, no identity is created, submissions are NOT queued (they are lost, by design), and histograms come only from cache. `delete_my_data()` still works when off. `needs_first_run_notice()` is true until `acknowledge_notice()`; `notice_text()` is the short notice. UI helpers: `CbScoresFirstRunNotice` (OK / Turn off) and `CbScoresSettingsRow` (CheckButton).
- **Strings**: all in `strings.gd` (`CbScoresStrings.overrides` to localise).
- **Env**: `CB_SCORES_URL` overrides `base_url`; `CB_SCORES_OFF=1` forces off; `CB_SCORES_HOME` moves the state directory (tests).

## Android
HTTPS via `HTTPRequest` with `TLSOptions.client()` (Godot's bundled CA list). The export preset needs the INTERNET permission: `permissions/internet=true` (Gradle build). Plain `http://` works only for local testing. No threads.

## Privacy
Sent: an anonymous random id, an optional nickname, level solution codes and scores. No personal data. See `PRIVACY.md` in the cobanana-scores repository.
