class_name Ch4Strings
extends RefCounted
## Chapter 4 UI strings (registered by GridUi.load_strings beside GridStrings.S). Keys must be unique across chapters: prefix them C4_.
const S := {
	"C4_LOCKED": "The build is locked while the clock runs. Stop the clock to change it.", "C4_SPENT": "%s of %s",
	# L10 the street
	"C4_POLE": "pole %d", "C4_NEUTRAL": "N", "C4_TX": "transformer", "C4_CHAIN": "I_a + I_b + I_c, tip to tail",
	"C4_IN_SUM": "I_N = %s A", "C4_CURRENTS": "Currents at the transformer, A", "C4_LIM_PCT": "%s %% of biggest", "C4_RATED": "rated %d A", "C4_IN_PCT": "I_N is %s %% of the biggest phase",
	"C4_VFAR": "Far-pole voltage, phase to neutral", "C4_BAND": "supply band %d to %d V", "C4_LOSS": "feeder losses %s %%",
	"C4_NEUTRAL_CAP": "NEUTRAL CONDUCTOR (mm², rating, upgrade price)", "C4_TAP_HOUSE": "Tap a house to move its drop: a, b, c (right-click goes back).",
	"C4_MOVED": "%d moved, %s each", "C4_SPREAD": "kVA  a %s  b %s  c %s",
	"C4_CHK_NEUTRAL": "N %s %% (max %s)", "C4_CHK_VOLTS": "volts in band", "C4_CHK_RATING": "N %s of %d A",
	# L11 the estate
	"C4_ESTATE_BUS": "estate bus, 400 V", "C4_TRIANGLE": "Power triangle, kW and kVAr", "C4_NEED": "need %s kVAr: %d µF/phase Y or %d µF/phase Δ", "C4_BANKQ": "bank gives %s kVAr",
	"C4_MOTORS": "Motors %d kW, pf %s", "C4_BUSV": "bus %s %% of 400 V", "C4_BANK_Y": "Bank in star (Y): each can sees the phase voltage", "C4_BANK_D": "Bank in delta (Δ): each can sees the line voltage",
	"C4_BANK_TXT": "%d cans of %d µF = %d µF per phase", "C4_CANV": "volts on a can %d V, rated %d V", "C4_BURST": "BURST!", "C4_NOBANK": "No bank yet: pick a can size, a rating and a count.",
	"C4_PUMP": "Pump %d kW, %s", "C4_ST_DOL": "DOL", "C4_ST_YD": "Y-Δ", "C4_ST_SOFT": "soft", "C4_TRACE": "Estate bus voltage through the pump's start", "C4_LIMIT": "limit %s %% dip", "C4_PUMP_STARTS": "pump starts",
	"C4_DIP": "dip %s %%", "C4_IST": "starting %d A = %s × running", "C4_CAP_CAP": "CAPACITOR CANS: size, rating, connection | count | pump starter", "C4_CAN": "can", "C4_CANS": "CANS PER PHASE",
	"C4_CHK_PF": "pf %s", "C4_CHK_CAN": "cans within rating", "C4_CHK_DIP": "dip %s %%",
	# L12 over the hill
	"C4_KESTREL": "Kestrel Falls", "C4_CITY": "the city", "C4_LINE": "%d × 300 km, 220 kV, sending %s MW", "C4_ROTOR": "Rotor angle, E′ against the bus V", "C4_PDELTA": "P-δ: before (blue), after the trip (orange), P_m (white)",
	"C4_PD_KEY": "the rotor must turn back before δu", "C4_SWING": "Rotor angle through the swing", "C4_STAR70": "★ 70°", "C4_SW_OK": "in step, peak %s°", "C4_SW_NOEQ": "no balance after the trip", "C4_SW_SLIP": "slips a pole past %s°",
	"C4_AVR_CAP": "AVR SET-POINT", "C4_SERIES_CAP": "SERIES CAPACITORS (both circuits)", "C4_THIRD": "3rd circuit", "C4_PEAKS": "CHECKS", "C4_CHK_SYNC": "stays in step (peak %s°)", "C4_CHK_70": "peak under 70° (★)",
	# L13 the exam
	"C4_RATED_CASE": "Rated case: V = 1 pu, I = 1 pu, pf 0.8 lagging, X_s = 1.2 pu", "C4_E_HIDDEN": "E = V + jX_s I: predict it", "C4_RATED_NOTE": "I lags V by 36.9°; jX_s I stands at right angles to I.",
	"C4_NIGHT": "Night, P = %s pu: the excitation sets E, the governor holds P", "C4_SET_EXC": "Set the excitation", "C4_NO_STEADY": "E too small: no steady angle", "C4_P_Q": "P = %s pu, Q = %s pu",
	"C4_QRULE": "Q = (E V cos δ − V²) ÷ X_s: negative Q is absorbed", "C4_QGAUGE": "Reactive power Q, pu (target −0.2 ± 0.02)", "C4_ABSORBS": "absorbs", "C4_SUPPLIES": "supplies",
	"C4_DELTA_LIM": "δ = %s° (limit %d°)", "C4_ANS_E": "excitation that does it: E = %s pu", "C4_PRED_ERR": "worst prediction error %s %%", "C4_PRED_CAP": "PREDICT THE RATED CASE, BEFORE YOU RUN | NIGHT EXCITATION",
	"C4_EXC_CAP": "NIGHT EXCITATION E", "C4_UNSET": "not set", "C4_CHK_PRED": "predictions (worst error %s %%)", "C4_CHK_TASK": "night task: Q = −0.2, δ < 60°",
}
