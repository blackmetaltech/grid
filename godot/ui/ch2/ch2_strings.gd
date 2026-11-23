class_name Ch2Strings
extends RefCounted
## Chapter 2 UI strings (registered by GridUi.load_strings beside GridStrings.S). Keys must be unique across chapters: prefix them C2_.
const S := {
	# the stage and the panel of the two closed-form benches (L04 the alternator, L06 the textbook town line): ui/ch2/ch2_bench.gd
	"C2_POLES": "POLES", "C2_TURNS": "TURNS", "C2_FIELD": "FIELD B", "C2_AREA": "COIL AREA",
	"C2_V_TESLA": "%s T", "C2_V_M2": "%s m²", "C2_V_TURNS": "%d", "C2_V_POLES": "%d",
	"C2_RPM": "Water head: %d rpm", "C2_SLOWMO": "slow motion ×1/%d",
	"C2_PERIOD": "T = %s ms", "C2_SCOPE": "SCOPE · %d ms across", "C2_SCOPE_E0": "e₀ = %s V", "C2_SCOPE_BAND": "target peak %s V (±2 %%)", "C2_SCOPE_RMS": "rms %s V",
	"C2_R_FREQ": "FREQUENCY", "C2_R_RMS": "VOLTAGE (rms)", "C2_R_PEAK": "PEAK e₀ = rms × √2", "C2_R_NBA": "N × B × A", "C2_R_COPPER": "WINDING COPPER",
	"C2_R_FREQ_V": "%s Hz", "C2_R_RMS_V": "%s V", "C2_R_PEAK_V": "%s V", "C2_R_NBA_V": "%s   ω = %s rad/s", "C2_R_COPPER_V": "%s kg",
	"C2_R_NEED": "needs %s to %s", "C2_R_NEED_PEAK": "needs 325 V", "C2_FORMULA_F": "f = p × N ÷ 120",
	"C2_PREDICT_V": "PREDICT THE PEAK, V", "C2_PREDICT_LOSS": "PREDICT THE 4 kV LOSS, kW", "C2_PREDICT_BTN": "Predict",
	"C2_PREDICTED": "Predicted %s %s", "C2_PREDICTED_ACT": "Predicted %s %s · it is %s", "C2_PREDICT_BAD": "Type a number first.",
	"C2_SPENT": "%s of %s", "C2_LOCKED": "The turbine is running; stop it to change the winding.",
	"C2_VILLAGE": "THE VILLAGE", "C2_FAN": "fan", "C2_CLOCK": "clock",
	# L06
	"C2_TEXTBOOK": "TEXTBOOK MODE", "C2_TEXTBOOK_SUB": "one phase, two wires, resistive line, ideal transformers",
	"C2_RATIO": "RATIO", "C2_KVA": "kVA", "C2_RATIO_CHIP": "%d:1", "C2_RATIO_NONE": "1:1", "C2_KVA_CHIP": "%d",
	"C2_LINE_KV": "LINE %s kV", "C2_LINE_AMPS": "%s A", "C2_GEN_KV": "GENERATOR %s kV", "C2_TOWN_KV": "TOWN",
	"C2_SANKEY": "800 kW SENT", "C2_ARRIVES": "arrives %s kW", "C2_LOST": "lost in the wire %s kW (%s %%)",
	"C2_LOSS_EQ": "I = P ÷ V = %s A      loss = I² × R = %s² × %s Ω = %s kW", "C2_LOAD": "step-up %s %% loaded", "C2_LOAD_OVER": "step-up %s %%: too small",
	"C2_REP_FREQ": "Frequency", "C2_REP_HZ": "%s\u00a0Hz", "C2_REP_VOLT": "Voltage (rms)", "C2_REP_TOWN": "Town voltage",
	"C2_TOWN_V": "town sees %s %% of its voltage", "C2_R_LIMIT": "limit %s %% lost",
	"C2_LINE_KM": "%s km to the town, drawn short",
}
