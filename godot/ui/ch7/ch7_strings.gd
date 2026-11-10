class_name Ch7Strings
extends RefCounted
## Chapter 7 UI strings (registered by GridUi.load_strings beside GridStrings.S). Keys must be unique across chapters: prefix them C7_.
const S := {
	"C7_SPENT": "%s of %s", "C7_LAMP_SCORE": "Score ≤ %s", "C7_LAMP_SCORE3": "Score ≤ %s%s",
	"C7_GLOSS_IF": "I_f: the fault current, the biggest current the breaker has to interrupt.", "C7_GLOSS_PU": "pu: per-unit, a fraction of the 100 MVA base (1 pu = 1.75 kA at 33 kV).", "C7_GLOSS_REACTOR": "Reactor: a coil in the bus section that adds impedance, so a fault pulls less current.",
	"C7_GLOSS_PM": "P_m: the push of the turbine (mechanical power). delta: how far the rotor runs ahead of the grid. Faster clearing keeps delta small.", "C7_CLEAR_SUM": "clears at %d ms = relay %d ms + breaker %d ms (%d cycles)",
	"C7_FORMULA_CAP": "FORMULA CARD (try the numbers first)", "C7_SHOW": "show formulas", "C7_HIDE": "hide formulas",
	"C7_F1": "3-phase fault: I_f = V / Z_th, then kA = pu x 100 MVA / (1.732 x kV). Z_th = Z_grid + Z_transformer + Z_line, in per-unit.",
	"C7_F2": "SLG fault: I_a = 3 V / (Z1 + Z2 + Z0). A delta winding blocks Z0, so only the grounded path counts.",
	"C7_F3": "Equal lambda: every unit not at a limit runs where dC/dP = lambda; add the P(lambda) of all units until they sum to demand.",
	"C7_F4": "Critical clearing (terminal fault): t = sqrt(4 H (d_cr - d_0) / (w_s P_m)), cos d_cr = (P_m (pi - 2 d_0) - P_max cos d_0 ... see equal areas).",
	"C7_F5": "A unit at its limit is fixed; the others share the rest at one lambda. Check each limit again after the shares are found.",
	"C7_UNIT_kA": "kA", "C7_UNIT_usd": "$/MWh", "C7_UNIT_s": "s", "C7_LEG_CURVES": "relay curves", "C7_LIMIT_ALL": "conductor I2t limits: 100, 70, 50 mm2",
	"C7_PREDICT": "Your prediction", "C7_PREDICT_KA": "I_f at the feeder, kA", "C7_PREDICT_DCR": "critical clearing angle, deg", "C7_PREDICT_LAM": "load-area lambda at 20:00, $/MWh",
	# L23 / L27 board
	"C7_GRID": "grid 132 kV", "C7_SEC_A": "section A", "C7_SEC_B": "section B", "C7_COUPLER": "coupler", "C7_OPEN": "open", "C7_CLOSED": "closed", "C7_FEEDER": "feeder F1",
	"C7_FAULT": "3-phase fault", "C7_RATED": "rated %s kA", "C7_DUTY": "must break %s kA", "C7_HIDDEN": "(run it to see it)", "C7_ESTATE_DARK": "ESTATE DARK",
	"C7_BREAKERS": "BREAKERS (kA, each)", "C7_COUPLER_CAP": "BUS COUPLER", "C7_REACTOR_CAP": "BUS-SECTION REACTOR (pu)", "C7_XFMR_CAP": "TRANSFORMER IMPEDANCE (%)",
	"C7_N1_OK": "survives a transformer trip (%s pu)", "C7_N1_BAD": "a transformer trip is not covered", "C7_FAULT_KA": "%s kA  (%s MVA)", "C7_ZTH": "Z_th %s pu", "C7_NONE": "none",
	"C7_TABLE": "Who breaks what", "C7_NO_REACTOR": "0",
	# L24
	"C7_TC_X": "current, A", "C7_TC_Y": "time, s", "C7_RELAY": "R%d", "C7_IS": "I_s %s A", "C7_TMS": "TMS", "C7_CURVE_CAP": "CURVE (all)", "C7_PICKUP_CAP": "PICKUP, % of CT (all)", "C7_RELAY_CAP": "TIME MULTIPLIER (R1 substation to R4 far end)",
	"C7_TOTAL": "total %s s", "C7_MARGIN": "tightest interval %s s (needs %s)", "C7_LIMIT": "conductor limit %d mm²", "C7_LOCKED": "The build is locked while the clock runs. Stop the clock to change it.",
	# L25
	"C7_PDELTA": "Electrical power against rotor angle", "C7_PM": "P_m", "C7_PRE": "before", "C7_DURING": "during the fault", "C7_POST": "after", "C7_A1": "A1: speeds the rotor up", "C7_A2": "A2: slows it down",
	"C7_RELAY_CAP2": "RELAY", "C7_BREAKER_CAP": "BREAKER (cycles)", "C7_RECLOSE_CAP": "AUTO-RECLOSE", "C7_CLEAR": "clears at %d ms", "C7_TCR": "critical %d ms", "C7_MARGIN_MS": "margin %d ms", "C7_STABLE": "keeps step", "C7_SLIPS": "slips a pole",
	"C7_SWING": "Rotor angle against time",
	# L26
	"C7_MODE_CAP": "DISPATCH RULE", "C7_WINDOW_CAP": "COMMITMENT (click to change the hours)", "C7_STACK": "Generation by hour, MW", "C7_DEMAND": "demand", "C7_FLOW": "corridor flow", "C7_LAMBDA": "lambda, $/MWh",
	"C7_LAM_G": "north", "C7_LAM_S": "city", "C7_COST": "day cost %s", "C7_TRIP": "corridor tripped at %s", "C7_OFF": "off", "C7_HYDRO": "hydro", "C7_SOLAR": "solar", "C7_CORRIDOR": "corridor limit %d MW",
	"C7_LEG_STACK": "generation", "C7_PLANT_coalsub": "sub coal", "C7_PLANT_coalsc": "super coal", "C7_PLANT_ccgt": "CCGT", "C7_PLANT_ocgt": "OCGT",
	"C7_MODE_merit": "cheapest first", "C7_MODE_lambda": "equal lambda", "C7_MODE_corridor": "lambda + corridor",
	# L27
	"C7_EXAM": "Exam questions", "C7_Q_ps17": "3-phase fault, kA", "C7_Q_ps18": "SLG fault, kA", "C7_Q_ps20": "lambda, no limits, $/MWh", "C7_Q_ps21": "lambda, limits binding, $/MWh", "C7_Q_ps22": "lambda with losses, $/MWh", "C7_Q_ps24": "critical clearing time at 60 Hz, s",
	"C7_ANSWER": "answer %s", "C7_DISPATCH_CAP": "TONIGHT'S DISPATCH, MW (unit 1, 2, 3)", "C7_BOARD_KA": "grown board: 3-phase %s kA, SLG %s kA", "C7_DISPATCH_SUM": "sum %s of %d MW", "C7_UNIT": "unit %d  (%d to %d)",
}
