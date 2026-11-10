class_name PhasorMath
extends RefCounted
## Phasor geometry (DESIGN 5.2 item 4). Pure: the drawn arrows come from the engine's `phasor` query and from nothing else.
##   V arrow:  direction = vAngDeg (+ the common display rotation), length = SCALE * R * vPu
##   I arrow:  direction = iAngDeg (+ the same rotation), length = SCALE * R * iKA / iRefKA   (the loading for a branch; for a bus its peak current)
## The angle between the two arrows is therefore exactly the engine's phi (I lags V when phi > 0), however the diagram rotates.
## Screen space: angle is counter-clockwise from +x, y points down.

const SCALE := 0.8
const MAX_LEN := 1.1   ## arrows are capped at MAX_LEN * R so an overload never leaves the dial

static func dir(deg: float) -> Vector2: return Vector2(cos(deg_to_rad(deg)), -sin(deg_to_rad(deg)))

static func v_len(d: Dictionary, r: float) -> float: return minf(SCALE * r * float(d.vPu), MAX_LEN * r)
static func i_frac(d: Dictionary) -> float:
	var ref := float(d.iRefKA)
	return float(d.iKA) / ref if ref > 1e-9 else 0.0
static func i_len(d: Dictionary, r: float) -> float: return minf(SCALE * r * i_frac(d), MAX_LEN * r)

## Both arrow tips (relative to the centre) for a query result `d`, radius `r` and display rotation `rot_deg`.
static func arrows(d: Dictionary, r: float, rot_deg := 0.0) -> Dictionary:
	return {"v": dir(float(d.vAngDeg) + rot_deg) * v_len(d, r), "i": dir(float(d.iAngDeg) + rot_deg) * i_len(d, r)}

static func angle_of(v: Vector2) -> float: return rad_to_deg(atan2(-v.y, v.x))

## Signed angle I minus V in degrees in (-180, 180]; negative = I lags V. The engine's phi is the negative of this.
static func angle_between(a: Dictionary) -> float:
	var x := angle_of(a.i) - angle_of(a.v)
	while x > 180.0: x -= 360.0
	while x <= -180.0: x += 360.0
	return x
