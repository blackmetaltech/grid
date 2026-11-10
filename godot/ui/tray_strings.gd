class_name TrayStrings
extends RefCounted
## English strings of the kit tray and the tags (tr("KEY")). Registered once by `load_strings()`; kept in its own file so the tray work never touches
## grid_strings.gd. Same rule as the csv: no prose literals in the drawing code.
const S := {
	"TRAY_HUT": "Battery hut", "TRAY_HUT_SUB_PICK": "pick site", "TRAY_HUT_SUB_AT": "at %s m",
	"TRAY_JUNCTION": "Junction box", "TRAY_CONVERTERS": "Converters", "TRAY_CONVERTERS_ON": "fitted", "TRAY_PLACED": "placed",
	"TRAY_REEL": "%s mm²", "TRAY_PER_M": "%s/m", "TRAY_PAIR": "pair %s", "TRAY_LOCKED": "Pause the night first to change the cable",
	"RADIO_LOG_LINK": "log ▸", "BREAKER_SPEED": "speed %s",
	"TRAY_BUDGET_CAP": "spent / budget", "TRAY_BUDGET": "%s / %s",
	"TRAY_HINT_HUT": "Pick a peg on the beach", "TRAY_HINT_REEL": "Pick a cable run for the %s mm² reel",
	"CHIP_V": "→ %s V · %s", "CHIP_LOSS": "→ %s %% loss · %s", "CHIP_COST": "→ %s", "CHIP_SITE": "%s m", "CHIP_SITE_V": "%s m → %s V · %s", "CHIP_SITE_LOSS": "%s m → %s %% loss · %s",
	"CHIP_NEEDS_HUT": "Place the hut first", "CHIP_RUN_LAID": "%s · %s",
	"RUN_MAIN_L01": "Cable", "RUN_H1": "Hamlet 1 cable", "RUN_H2": "Hamlet 2 cable", "RUN_TRUNK": "Trunk", "RUN_BRANCHES": "Branches", "RUN_LINK": "The long run",
	"PEG_M": "%s m",
	"TAG_HAMLET": "Hamlet", "TAG_HAMLET_N": "Hamlet %s", "TAG_SCHOOL": "School and health post", "TAG_CABLE": "%s mm² Cu · %s m run", "TAG_HUT": "Battery hut",
	"TAG_V": "V", "TAG_V_LIMIT": "limit %s V", "TAG_I": "I", "TAG_LAMPS": "Lamps", "TAG_HOMES": "%s homes · %s W each", "TAG_LOAD": "School and health post · %s", "TAG_DELIVERED": "%s W delivered", "TAG_NOT_CONNECTED": "not connected",
	"TAG_DARK": "Dark: no cable connected yet", "TAG_NO_CABLE": "No cable laid yet",
	"TAG_RLOOP": "R loop", "TAG_DROP": "drop", "TAG_LOSS": "loss", "TAG_RATED": "rated", "TAG_CIRCUIT_LOSS": "whole circuit",
	"TAG_EQ": "V = %s − I·R = %s − %s × %s = %s V", "TAG_SRC": "source", "TAG_OUT": "power out", "TAG_DIST": "from the hamlet", "TAG_CLOSE": "Close",
}
static var _loaded := false
static func load_strings() -> void:
	if _loaded: return
	_loaded = true
	var t := Translation.new(); t.locale = "en"
	for k in S: t.add_message(k, S[k])
	TranslationServer.add_translation(t)
