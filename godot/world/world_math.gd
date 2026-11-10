class_name WorldMath
extends RefCounted
## The pure mappings from engine numbers to what the diorama shows (DESIGN 5.1, 5.2). No nodes, no drawing: the headless truth tests
## (godot/tests) call these with the values of the engine's `overlay` queries and compare them with what the world model carries.

const CYAN := Color("#39E1FF")
const WHITE := Color("#F4F8FF")
const AMBER := Color("#FFB020")
const RED := Color("#FF3B3B")
const GREY := Color("#59607A")
const SODIUM := Color("#FFC56B")
const REACTIVE := Color("#FF4FD8")

## Loading bands of a ribbon (fraction of rating): cyan < 0.7, white < 0.9, amber <= 1.0, red above.
const BAND_CYAN := 0
const BAND_WHITE := 1
const BAND_AMBER := 2
const BAND_RED := 3
const BAND_OFF := 4

static func band(loading: float) -> int:
	if loading < 0.7: return BAND_CYAN
	if loading < 0.9: return BAND_WHITE
	if loading <= 1.0: return BAND_AMBER
	return BAND_RED

static func band_color(b: int) -> Color:
	match b:
		BAND_CYAN: return CYAN
		BAND_WHITE: return WHITE
		BAND_AMBER: return AMBER
		BAND_RED: return RED
	return GREY

## Pulse speed in fractions of the ribbon per second: 0 at no flow, rising with loading, capped at 150 % loading.
static func pulse_speed(loading: float) -> float:
	var l := clampf(loading, 0.0, 1.5)
	return 0.0 if l <= 0.0 else 0.10 + 0.45 * l

## Ribbon thickness in world px: grows with loading (capped at 150 %).
static func ribbon_width(loading: float) -> float:
	return 2.0 + 5.0 * clampf(loading, 0.0, 1.5)

## +1 / -1 / 0: the pulses travel from -> to when P >= 0.
static func flow_dir(p_from_mw: float) -> int:
	if absf(p_from_mw) < 1e-6: return 0
	return 1 if p_from_mw > 0.0 else -1

## Window energy of a building: (V / V_nom)^2 of its bus, zero when the bus is dead or the building's street is shed. Buildings go
## dark in a fixed order (index) as the shed fraction grows, so a shed load is dark street by street.
static func building_energy(v_pu: float, shed: float, idx: int, count: int) -> float:
	if v_pu <= 0.0: return 0.0
	var street := (float(idx) + 0.5) / float(maxi(count, 1))
	if street <= clampf(shed, 0.0, 1.0): return 0.0
	return v_pu * v_pu

## Night factor 0 (noon) .. 1 (midnight) from the minute of the day; smooth, symmetric around noon, sunrise ~06:00 and sunset ~18:00.
static func night(minute_of_day: float) -> float:
	var a := (minute_of_day - 720.0) / 1440.0 * TAU
	var d := 0.5 - 0.5 * cos(a)         # 1 at midnight, 0 at noon
	return smoothstep(0.15, 0.85, d)

## Brightness of the windows against the sky: they are visible all day but shine at night.
static func lights_gain(night_f: float) -> float:
	return 0.5 + 0.5 * night_f

## Sunset / dawn warmth 0..1 (peaks near 18:30 and 05:30).
static func dusk(minute_of_day: float) -> float:
	var m := minute_of_day
	var ev := exp(-pow((m - 1110.0) / 60.0, 2.0))
	var mo := exp(-pow((m - 330.0) / 60.0, 2.0))
	return clampf(maxf(ev, mo), 0.0, 1.0)

static func sky_top(minute_of_day: float) -> Color:
	var n := night(minute_of_day)
	var c := Color("#4C86C8").lerp(Color("#070B20"), n)
	return c.lerp(Color("#5B3B7A"), 0.55 * dusk(minute_of_day))

static func sky_bottom(minute_of_day: float) -> Color:
	var n := night(minute_of_day)
	var c := Color("#B8D8EE").lerp(Color("#172152"), n)
	return c.lerp(Color("#FF9A55"), 0.7 * dusk(minute_of_day))

## Ground tint multiplier for the day / night.
static func ground_light(night_f: float) -> Color:
	return Color(1, 1, 1).lerp(Color(0.42, 0.48, 0.78), night_f)

static func rotor_speed(avail_mw: float, p_max: float) -> float:
	return 0.0 if p_max <= 0.0 else clampf(avail_mw / p_max, 0.0, 1.0)

## Deterministic hash in 0..1 of two ints (terrain variety, window pattern) so the picture is stable between frames and runs.
static func hash2(x: int, y: int, salt: int = 0) -> float:
	var h: int = (x * 374761393 + y * 668265263 + salt * 2147483647) & 0x7fffffff
	h = ((h ^ (h >> 13)) * 1274126177) & 0x7fffffff
	return float((h ^ (h >> 16)) & 0xffff) / 65535.0

## Cute mode: the bulb mascot's face is the voltage band (UI.md "Cute mode"). Within MOOD_MARGIN_V above the limit = worried.
const MOOD_MARGIN_V := 2.0
static func mood(volts: float, limit_v: float, powered: bool) -> String:
	if not powered or volts <= 0.0: return "asleep"
	if volts < limit_v: return "sad"
	if volts < limit_v + MOOD_MARGIN_V: return "worried"
	return "happy"
