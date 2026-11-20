class_name CbScoresStrings
extends RefCounted
## Every player-facing string of the addon. Games localise by assigning `overrides` (key -> text) at startup.

const TEXT := {
	"notice_title": "Online scores",
	"notice_body": "Online scores compare your solutions with other players.\n\nWhat is sent: an anonymous random id, an optional nickname, and the solution codes and scores of levels you finish. No personal data is collected.\n\nYou can turn this off at any time in Settings. The game works fully offline.\n\nDetails: PRIVACY.md in the cobanana-scores repository.",
	"notice_ok": "OK",
	"notice_off": "Turn off",
	"settings_online": "Online scores",
	"nickname_empty": "",
	"nickname_length": "A nickname needs 3 to 16 characters.",
	"nickname_chars": "Use letters, digits, space, dot, dash and underscore only (no leading, trailing or double spaces).",
}

## Optional replacement strings supplied by the game.
static var overrides: Dictionary = {}


static func get_text(key: String) -> String:
	if overrides.has(key):
		return str(overrides[key])
	return str(TEXT.get(key, key))
