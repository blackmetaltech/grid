class_name DialMath
extends RefCounted
## The frequency dial's non-linear scale (DESIGN 5.2 item 5). The dial spans f0 - 2.5 .. f0 + 2.5 Hz (47.5-52.5 Hz at 50 Hz) over a 240 degree
## sweep, and the central +-0.5 Hz takes HALF of the arc:
##   f0-2.5 .. f0-0.5  ->  u 0.00 .. 0.25   (outer, compressed: 2 Hz in a quarter)
##   f0-0.5 .. f0+0.5  ->  u 0.25 .. 0.75   (centre, expanded: 1 Hz in half)
##   f0+0.5 .. f0+2.5  ->  u 0.75 .. 1.00
## The needle angle is measured in degrees clockwise from 12 o'clock: START + SWEEP * u. Everything the dial draws (needle, standard range band,
## UFLS ticks) goes through `angle_deg`, so the dial-truth test needs only this function and the engine's `dial` query.

const HALF_SPAN := 2.5
const CORE := 0.5
const START_DEG := -120.0
const SWEEP_DEG := 240.0

static func u(f: float, f0: float) -> float:
	var d := f - f0
	var v: float
	if d <= -CORE: v = 0.25 * (d + HALF_SPAN) / (HALF_SPAN - CORE)
	elif d >= CORE: v = 0.75 + 0.25 * (d - CORE) / (HALF_SPAN - CORE)
	else: v = 0.25 + 0.5 * (d + CORE) / (2.0 * CORE)
	return clampf(v, 0.0, 1.0)

static func angle_deg(f: float, f0: float) -> float: return START_DEG + SWEEP_DEG * u(f, f0)

## The inverse: the frequency a needle angle stands for.
static func f_of_angle(deg: float, f0: float) -> float:
	var v := clampf((deg - START_DEG) / SWEEP_DEG, 0.0, 1.0)
	if v <= 0.25: return f0 - HALF_SPAN + (v / 0.25) * (HALF_SPAN - CORE)
	if v >= 0.75: return f0 + CORE + ((v - 0.75) / 0.25) * (HALF_SPAN - CORE)
	return f0 - CORE + ((v - 0.25) / 0.5) * 2.0 * CORE

## 0 normal (inside the pack's standard range), 1 outside it, 2 load-shedding or generator over-frequency territory.
static func zone(f: float, q: Dictionary) -> int:
	if f >= float(q.stdLo) and f <= float(q.stdHi): return 0
	var stages: Array = q.get("uflsHz", [])
	if not stages.is_empty() and f <= float(stages[0]): return 2
	if f >= float(q.genOfHz): return 2
	return 1
