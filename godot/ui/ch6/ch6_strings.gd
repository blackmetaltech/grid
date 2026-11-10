class_name Ch6Strings
extends RefCounted
## Chapter 6 UI strings (registered by GridUi.load_strings beside GridStrings.S). Keys must be unique across chapters: prefix them C6_.
const S := {
	"C6_TITLE_L19": "Control room", "C6_TITLE_L20": "Control room", "C6_TITLE_L21": "Control room", "C6_TITLE_L22": "Exam sheet",
	"C6_F": "f  %.3f Hz", "C6_NADIR": "lowest %.2f Hz · RoCoF %.2f Hz/s", "C6_SHED": "shed %.0f MW", "C6_BAND": "in range %.1f %% · curtailed %.1f %%",
	"C6_SPIN": "Keep the spare coal unit spinning", "C6_FFR": "Battery %s (%d MW): frequency response", "C6_CLOCK": "Store %s (%d MW): charge 10-14, discharge 15-21",
	"C6_PUMP_NOON": "Move the irrigation pumps to noon", "C6_PUMP_NIGHT": "Put the pumps back on the night blocks",
	"C6_COAL": "Hold coal unit %s hot", "C6_COND": "Spin condenser %s (%d MVA)", "C6_RIDE": "Fit the rooftops with ride-through",
	"C6_P_ROCOF": "Predict the RoCoF at the trip", "C6_P_A": "A: RoCoF of 500 MVA, H 5 s, 60 Hz, loses 0.2 pu", "C6_P_B": "B: df for R 0.05, D 0.8, dP 0.01 pu",
	"C6_P_C": "C: G1 MW of a 100 MW step (500 MVA at 4 %, 300 MVA at 5 %)",
}
