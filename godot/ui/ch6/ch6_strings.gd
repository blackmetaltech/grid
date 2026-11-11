class_name Ch6Strings
extends RefCounted
## Chapter 6 UI strings (registered by GridUi.load_strings beside GridStrings.S). Keys must be unique across chapters: prefix them C6_.
const S := {
	"C6_TITLE_L19": "Control room", "C6_TITLE_L20": "Control room", "C6_TITLE_L21": "Control room", "C6_TITLE_L22": "Exam sheet",
	"C6_F": "f  %.3f Hz", "C6_NADIR": "lowest %.2f Hz · RoCoF %.2f Hz/s", "C6_SHED": "shed %.0f MW", "C6_BAND": "in range %.1f %% · curtailed %.1f %%",
	"C6_SPIN": "Keep the spare coal unit spinning", "C6_FFR": "Battery %s (%d MW): frequency response", "C6_CLOCK": "Store %s (%d MW): charge 10-14, discharge 15-21",
	"C6_PUMP_NOON": "Move the irrigation pumps to noon", "C6_PUMP_NIGHT": "Put the pumps back on the night blocks",
	"C6_COAL": "Hold coal unit %s hot", "C6_COND": "Condenser %s (%d MVA)", "C6_RIDE": "Fit the rooftops with ride-through",
	"C6_P_A": "A: RoCoF (Hz/s) of a 500 MVA machine, H = 5 s (inertia constant), at 60 Hz, that loses 0.2 pu of power", "C6_P_B": "B: frequency change df (Hz, at 50 Hz) for droop R = 0.05 (5 %), load damping D = 0.8, power step dP = 0.01 pu",
	"C6_P_C": "C: G1 MW of a 100 MW step (500 MVA at 4 %, 300 MVA at 5 %)",
	"C6_P_ROCOF": "Predict the RoCoF at the trip (RoCoF = how fast the frequency starts to fall, Hz per second)",
	"C6_FORMULAS": "Formulas (try first, then peek)", "C6_FORMULAS_HIDE": "Hide the formula card",
	"C6_FORM_TEXT": "RoCoF [Hz/s] = dP [MW] x f0 [Hz] / (2 x H [s] x S [MVA])   (dP = power lost, H = inertia constant, S = machine rating)\nDroop: df [Hz] = -dP / (S1/R1 + S2/R2 + ...) x f0   with R as a fraction (4 % = 0.04), S in MW, dP in MW\nWith load damping D (per unit): df = -dP / (1/R + D) x f0.  A machine's share = (S/R) / sum of (S/R)",
	"C6_DROOP": "%s droop: %.1f %%", "C6_NET": "Net load = demand - sun (MW)", "C6_RAMP": "steepest climb %d MW/min at %02d:%02d",
	"C6_RIDE_GLOSS": "Ride-through: the inverter stays connected through a fast frequency change instead of tripping.", "C6_BARS": "Cyan bars on the plants: that unit's output against its rating.",
		"C6_SPIN_WHY": "Keep U17: it adds a 13th unit's headroom (about 500 MW), spread over all the units so each takes a small share of a trip.",
	"C6_PEAKER_PRICE": "Gas peaker: %s per MW (a 105 MW unit costs %s)", "C6_COMMIT_GLOSS": "Place = buy the unit. Commit (tap it, press Start) = order it onto the grid; until then it stands idle.",
	"C6_FORECAST": "dashed: forecast with no help; solid: what has happened",
	"C6_TASK": "Task: set the droops so G1 takes 60 % of a 100 MW step (within 2 %). G1 is 500 MVA, G2 is 300 MVA.",
	"C6_SHARE": "G1 share at these droops: %.0f %%  (S1/R1) / (S1/R1 + S2/R2)",
	"C6_BATT_READY": "Batteries you place stand ready for frequency response: no setting needed.",
	"C6_KEPT": "Your build from the last attempt is kept (Retry keeps what you bought). Demolish what you do not want.",
}
