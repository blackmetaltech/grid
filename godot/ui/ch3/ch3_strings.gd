class_name Ch3Strings
extends RefCounted
## Chapter 3 UI strings (registered by GridUi.load_strings beside GridStrings.S). Keys must be unique across chapters: prefix them C3_ (the tray's GT_ keys for chapter 3 parts are the only exception: the tray looks them up by that name).
const S := {
	# tray: the parts of L08 and L09
	"C3_PLAIN": "plain", "C3_FILTER": "filter 4.7", "C3_TAG_IN": "IN %s of %s steps", "C3_TAG_OUT": "OUT: 0 of %s steps, the bank does nothing", "C3_TAG_AUTO": "Automatic control costs 60 % more than a fixed bank; the price is paid when you press Set.", "GT_K_detune": "Reactor", "GT_KS_detune": "% of Xc", "GT_TIP_detune": "Series reactor as a share of the capacitor's reactance: plain, 4.53 % (a filter tuned at 4.7), 7 % or 14 % (detuned banks)",
	"GT_TIP_placeBank": "%s with a series reactor: the Steps knob sets the size, the Reactor knob the detuning. Plain banks can resonate with the supply; detuned means a reactor in series, so the bank resonates below the 5th",
	"GT_ICON_series": "Series cap", "GT_UNIT_pct": "%s %%",
	"GT_TIP_placeSeriesCap": "%s of the line's reactance: a series capacitor in the feeder. Click the line",
	"C3_TAG_DETUNED": "Detuned: a %s %% reactor in series, so the bank is tuned at h = %s, below the 5th harmonic", "C3_TAG_SERIES": "Series capacitor %s %%: X_C = %s Ω cancels that much of the line's X_L = %s Ω",
	# work order
	"C3_WO_DRIVES": "The factory's drives start at 08:00: their harmonics test the bank", "C3_WO_FAULT": "Survive a three-phase fault at the quarry bus at %s",
	# panel
	"C3_P_AMPS": "feeder %s A · rated %s A", "C3_P_AT": "at the 20:00 peak, as designed", "C3_P_UNIT": "% of fundamental", "C3_P_LIMIT": "THD limit %s %%",
	"C3_P_THD_WHAT": "THD = how far from a clean sine", "C3_P_XC_WHAT": "X_L line · X_C capacitor",
	"C3_P_PRED": "prediction %s kA · breaker %s kA", "C3_P_PRESS": "press Run: the fault comes at %s",
	"C3_P_PHASOR": "PHASORS · feeder", "C3_P_PF": "pf %s %s · %s A", "C3_P_LAG": "lagging", "C3_P_LEAD": "leading", "C3_P_SPEC": "VOLTAGE SPECTRUM", "C3_P_SPEC_ASIF": "evening peak, drives on, bank in",
	"C3_P_SPEC_NOW": "evening peak, drives on", "C3_P_THD": "THD %s %% · limit %s %%", "C3_P_Z": "BUS IMPEDANCE vs HARMONIC", "C3_P_ZPEAK": "resonance h = %s", "C3_P_CAP": "BANK CURRENT", "C3_P_CAP_NONE": "no bank",
	"C3_P_CAP_FMT": "%s × rated · limit %s ×", "C3_P_BLOWN": "fuse blown: %s", "C3_P_WAIT": "press Run: the drives start at 08:00", "C3_P_HARM": "%sth",
	"C3_P_LINE": "THE LINE", "C3_P_RX": "R %s Ω · X_L %s Ω · X_C %s Ω", "C3_P_VFAR": "far end %s pu · limit %s", "C3_P_VFAR_NONE": "far end: press Run",
	"C3_P_FAULT": "FAULT AT %s", "C3_P_FAULT_WAIT": "?", "C3_P_FAULT_FMT": "%s kA · breaker %s kA", "C3_P_FAULT_PLAIN": "plain line %s kA", "C3_P_FRES": "loop resonates at %s Hz",
}
