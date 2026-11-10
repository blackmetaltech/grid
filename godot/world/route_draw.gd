class_name RouteDraw
extends RefCounted
## Overhead-line routes on the diorama (DEPTH 4.2-4.3): pure data and geometry helpers shared by WorldModel (built lines), WorldView (drawing,
## ghost preview, picking) and the truth test. Nothing here computes physics: sag, clearance, margin and positions all come from the engine's
## plan (world.routes[] / routePreview); this file only converts a plan into drawable records and lays a parabola of the engine's sag between two
## attachment points, at the same px-per-metre as the terrain heights.

const PX_PER_M := 0.9                 # terrain z = elevation m x 0.9 px; sag, pole and attachment heights use the very same scale
const WIRE_N := 16                    # segments of one drawn wire (even: the mid-point is a vertex, the sag is read there)
const TIGHT_M := 0.5                  # margin below which a span is tinted amber (the 3-star bar of L05, thresholds.marginStar3M)
const BAND_OK := "ok"
const BAND_TIGHT := "tight"
const BAND_BAD := "bad"
const COPPER := Color("#C8794A")
const AMBER := Color("#FFB020")
const RED := Color("#E5484D")

## Conductor attachment height above ground (m) and pole height per support family: the data of src/data/supports.ts, used for drawing only.
const FAMILY := {
	"wood-9": {"attach": 7.5, "pole": 9.0},
	"pcc-11": {"attach": 9.0, "pole": 11.0},
	"tubular-13": {"attach": 11.0, "pole": 13.0},
	"lattice-33": {"attach": 15.0, "pole": 16.5},
	"crossing-h": {"attach": 18.0, "pole": 19.5},
}

static func attach_m(family: String) -> float: return float((FAMILY.get(family, FAMILY["pcc-11"]) as Dictionary).attach)
static func pole_m(family: String) -> float: return float((FAMILY.get(family, FAMILY["pcc-11"]) as Dictionary).pole)

## Colour band of a span from the engine's verdict: red when it fails, amber when it passes with less than TIGHT_M, else copper.
static func band(ok: bool, margin_m: float) -> String:
	if not ok: return BAND_BAD
	return BAND_TIGHT if margin_m < TIGHT_M else BAND_OK

static func band_color(b: String) -> Color:
	match b:
		BAND_BAD: return RED
		BAND_TIGHT: return AMBER
	return COPPER

## Points of a wire hung between screen/world px `a` and `b` with a vertical sag of `sag_px` at mid-span (a parabola below the chord).
static func wire_points(a: Vector2, b: Vector2, sag_px: float, n: int = WIRE_N) -> PackedVector2Array:
	var out := PackedVector2Array()
	for k in n + 1:
		var t := float(k) / float(n)
		out.append(a.lerp(b, t) + Vector2(0.0, 4.0 * sag_px * t * (1.0 - t)))
	return out

static func _unit(v: Vector2) -> Vector2: return v.normalized() if v.length() > 1e-9 else Vector2.RIGHT

## A plan (engine `world.routes[i]` or a `routePreview` result) as drawable records. `tile_m` = metres per tile; `p` is metres / tile_m (the
## diorama's iso coordinates). Per support: `dir` = unit direction along the line, `guys` = unit directions (tile units) from the pole to its stay anchors.
static func plan_to_route(plan: Dictionary, id: String, tile_m: float) -> Dictionary:
	var raw: Array = plan.get("supports", [])
	var sup: Array = []
	for s in raw:
		var m := Vector2(float(s.x), float(s.y))
		var fam := str(s.familyId)
		sup.append({"m": m, "p": m / tile_m, "family": fam, "angle_deg": float(s.angleDeg), "angle_class": str(s.angleClass), "foundation": str(s.foundation),
			"attach_m": attach_m(fam), "pole_m": pole_m(fam), "dir": Vector2.RIGHT, "guys": [],
			"creep": float(s.get("creepageMm", 0.0)) if s.get("creepageMm") != null else 0.0, "need": float(s.get("needMm", 0.0)) if s.get("needMm") != null else 0.0})   # insulation (Salt Wind): what the string offers vs what the salt asks
	for i in sup.size():
		var s: Dictionary = sup[i]
		var has_in := i > 0; var has_out := i + 1 < sup.size()
		var u_in := _unit((s.p as Vector2) - (sup[i - 1].p as Vector2)) if has_in else Vector2.ZERO
		var u_out := _unit((sup[i + 1].p as Vector2) - (s.p as Vector2)) if has_out else Vector2.ZERO
		s["dir"] = _unit(u_in + u_out) if (has_in and has_out and (u_in + u_out).length() > 1e-6) else (u_out if has_out else u_in)
		var pull := u_out - u_in   # net horizontal pull of the conductors on this support (towards the neighbours); the stays lean against it
		var away := _unit(-pull) if pull.length() > 1e-6 else Vector2(-(s.dir as Vector2).y, (s.dir as Vector2).x)
		var cls := str(s.angle_class)
		var guys: Array = []
		if cls == "small" or cls == "medium": guys.append(away)
		elif cls == "large" or cls == "terminal":
			guys.append(away.rotated(0.45)); guys.append(away.rotated(-0.45))
		s["guys"] = guys
	var spans: Array = []
	var raw_sp: Array = plan.get("spans", [])
	var any_bad := false
	for i in raw_sp.size():
		var sp: Dictionary = raw_sp[i]
		var clr := float(sp.get("clearanceM", 0.0)); var req := float(sp.get("requiredM", 0.0))
		var margin := float(sp.marginM) if sp.has("marginM") else clr - req
		var ok := bool(sp.get("ok", true))
		any_bad = any_bad or not ok
		spans.append({"i": i, "a": i, "b": i + 1, "length_m": float(sp.get("lengthM", 0.0)), "over": sp.get("over", []), "sag_m": float(sp.get("sagM", sp.get("sagDesignM", 0.0))),
			"clearance_m": clr, "required_m": req, "margin_m": margin, "at_m": float(sp.get("atM", 0.0)), "ok": ok, "band": band(ok, margin)})
	return {"id": id, "supports": sup, "spans": spans, "any_bad": any_bad, "tile_m": tile_m}
