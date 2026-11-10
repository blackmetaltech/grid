class_name Ch3Tags
extends RefCounted
## One-line facts for the operate tag of a chapter 3 part: the reactor share of a bank (what "detuned" means) and the X_C of a series capacitor.
static func op_info(b, kind: String, id: String) -> String:
	if b == null: return ""
	if kind == "shunt":
		for h in b.g.get("shunts", []):
			if str(h.id) == id and float(h.get("detunePct", 0.0)) > 0.0:
				var p := float(h.detunePct)
				return TranslationServer.translate("C3_TAG_DETUNED") % [("%.2f" % p).rstrip("0").rstrip("."), "%.2f" % (1.0 / sqrt(p / 100.0))]
	if kind == "branch":
		for br in b.g.get("branches", []):
			if str(br.id) == id and br.get("seriesCap") != null:
				var kv := 11.0
				for bus in b.g.get("buses", []): if str(bus.id) == str(br["from"]): kv = float(bus.kvNom)
				var xl := float(br.seriesCap.xGross) * kv * kv / 100.0; var k := float(br.seriesCap.pct)
				return TranslationServer.translate("C3_TAG_SERIES") % [("%.0f" % k), "%.2f" % (xl * k / 100.0), "%.2f" % xl]
	return ""
