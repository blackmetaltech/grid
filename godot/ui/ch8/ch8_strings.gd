class_name Ch8Strings
extends RefCounted
## Chapter 8 UI strings (registered by GridUi.load_strings beside GridStrings.S). Keys must be unique across chapters: prefix them C8_.
const S := {
	"C8_PANEL": "Chapter 8 controls",
	# shared
	"C8_ALL": "all", "C8_OFF": "off", "C8_ON": "on", "C8_V": "%s V", "C8_KM": "%s km", "C8_KW": "%s kW", "C8_HOMES": "%d", "C8_AMPS": "%s of %s A", "C8_PER_KM": "%s", "C8_SUBSTATION": "11 kV",
	"C8_X_KM": "km along the feeder", "C8_Y_V": "customer voltage, V", "C8_BAND_LO": "lowest allowed %s V", "C8_BAND_HI": "highest allowed %s V",
	"C8_DIAG_NOTE": "dot: green when both voltages are in band; bar: current against the wire's rating", "C8_REG_SHORT": "REG", "C8_REG_AT": "holds %s pu", "C8_TAP_AT": "tap %s %%",
	# L31
	"C8_SECTION_CAP": "SECTION (N1 at the substation, N5 the far end)", "C8_WIRE_CAP": "WIRE of that section (price per km)", "C8_TAP_CAP": "TRANSFORMER TAP, % (off-load)", "C8_REG_CAP": "REGULATOR in the line to N2 / N3 (%s), set point pu",
	"C8_PEAK": "peak", "C8_LIGHT": "light", "C8_PEAK_NAME": "evening peak", "C8_LIGHT_NAME": "light load (%d %%)", "C8_L31_TITLE": "READING THE FEEDER",
	"C8_L31_OK": "every customer is inside the band at peak and at light load", "C8_L31_LOW": "lowest %s V at %s (floor %s V)",
	"C8_L31_MIN": "Lowest at peak: %s V at %s (floor %s V, margin %s V).", "C8_L31_MAX": "Highest at light load: %s V at %s (ceiling %s V, margin %s V).",
	"C8_L31_LOSS": "Wire losses at peak: %s %% of the energy (%s kW).", "C8_L31_HAND": "The textbook sum of the drops, (R P + X Q) / V, says %s %% to the far end; the full solve, with the current growing as the voltage falls, says %s %%.",
	"C8_L31_REG": "Regulator at %s holds %s pu: %d steps of 0.625 %% at peak, %d at light load (of %d).",
	"C8_L31_GLOSS_TAP": "A tap moves a customer by the same % at peak and at light load: it only fits the spread between them.", "C8_L31_GLOSS_REG": "Wire and a regulator shrink the drop itself. Wire costs by the km; the regulator is one price, and it does not cut losses.",
	# L32
	"C8_KIND_CAP": "SWITCH TYPE (price each), then tap a site", "C8_SITE_CAP": "SITE: head of T2 / T3 / T4 (at most %d switches)", "C8_FREE": "free", "C8_NONE": "none", "C8_MANUAL": "manual", "C8_REMOTE": "remote", "C8_FUSE_CAP": "FUSE on a spur (%s)", "C8_TIE_CAP": "TIE to the next feeder", "C8_TIE": "tie",
	"C8_SAIFI": "SAIFI", "C8_SAIDI": "SAIDI", "C8_CAIDI": "CAIDI", "C8_ENS": "ENS, MWh", "C8_L32_USED": "sectionalisers used: %d of %d",
	"C8_FUSE_SHORT": "fuse", "C8_BARE": "bare", "C8_NEXT_FEEDER": "next feeder", "C8_TIE_INFO": "tie: %d kW back in %d min", "C8_NO_TIE": "no tie: wait for the repair",
	"C8_L32_NOTE": "a fault is repaired in %s h; a manual switch takes %d h, a remote one %d min (five minutes or less is not counted)", "C8_HEAT_CAP": "EXPECTED OUTAGE PER SECTION: minutes a year added to SAIDI, and faults a year (redder = more to blame)",
	"C8_MIN_YR": "%s min", "C8_FAULTS_YR": "%s faults/yr", "C8_TARGET_MAX": "target: at most %s", "C8_STAR_MAX": "lamp 3: at most %s", "C8_CAIDI_EQ": "= SAIDI / SAIFI",
	"C8_G_SAIFI": "how often the average customer loses power in a year", "C8_G_SAIDI": "minutes a year the average customer is without power", "C8_G_CAIDI": "how long each interruption lasts, on average", "C8_G_ENS": "energy not supplied: what the outages cost in MWh",
	# L33
	"C8_PICKUP_CAP": "pickup, A", "C8_FAST_CAP": "fast dial", "C8_SLOW_CAP": "slow dial", "C8_SHOTS_CAP": "fast shots", "C8_SPUR_CAP": "%s  %d A load", "C8_TC_X": "fault current, A", "C8_TC_Y": "time to operate, s",
	"C8_PICKUP_LINE": "pickup %s A", "C8_LOAD_LINE": "load %s A", "C8_LEG": "CURVES", "C8_LEG_FAST": "recloser fast (%d shots)", "C8_LEG_SLOW": "recloser slow", "C8_LEG_MELT": "fuse minimum melt", "C8_LEG_CLEAR": "fuse total clearing",
	"C8_SPUR_LINE": "%s link %d A: fast margin %s s, slow margin %s s; carries its load: %s; melts at its smallest fault: %s; faults %d to %d A.", "C8_YES": "yes", "C8_NO": "no",
	"C8_WORST": "Tightest margin %s s; lamp 3 needs at least %s s everywhere.", "C8_BLOWS": "Fuses blown by temporary faults: %s a year (%d %% of faults are temporary).",
	"C8_L33_GLOSS1": "Fast: the recloser must trip before the fuse starts to melt (the dashed curve), so a temporary fault is gone and the fuse is saved.", "C8_L33_GLOSS2": "Slow: it must wait for the fuse's total clearing time (solid), so a permanent fault is cleared by the spur's own fuse and not by a feeder lockout.",
	"C8_SLOW_TAG": "slow", "C8_FAST_TAG": "fast",
	"C8_L33_STATUS": "head load %s A; pickup %s A; %s",
	"C8_KIND_ok": "Coordinated: the fuses are saved from temporary faults and clear the permanent ones.", "C8_KIND_miscoordination": "Miscoordinated: a curve pair crosses over a spur's fault range.", "C8_KIND_nuisance": "Nuisance trips: the pickup is under 1.25 times the head load.",
	"C8_KIND_fuseLoad": "A fuse link is too small for its spur's load.", "C8_KIND_blind": "A fuse link is too big to melt at its spur's smallest fault.", "C8_KIND_fuseBlown": "A fast curve is slower than a fuse's melt curve: the fuse blows for a temporary fault.",
}
