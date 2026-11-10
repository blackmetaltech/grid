class_name Ch5Strings
extends RefCounted
## Chapter 5 UI strings (registered by GridUi.load_strings beside GridStrings.S). Keys must be unique across chapters: prefix them C5_.
const S := {
	"C5_TITLE_L14": "Substation board", "C5_TITLE_L15": "Receiving station", "C5_TITLE_L16": "Control room", "C5_TITLE_L17": "City substation", "C5_TITLE_L18": "Exam sheet",
	"C5_UNIT_KV": "Show kilovolts", "C5_UNIT_PU": "Show per unit",
	"C5_TAPS": "tap changes so far: %d", "C5_OPS": "switching operations so far: %d", "C5_OPEN": "open",
	"C5_L16_HEAD": "loading of each line, and the worst line after losing this one",
	"C5_N1": "worst line after any one outage: %d %%",
	"C5_L17_WAIT": "Press Run: the P-V curve of the city appears with the first block.",
	"C5_L17_NOSE": "nose %.0f MW · load %.0f MW · margin %.1f %%",
	"C5_L17_CAP": "Voltage on the up axis, power on the right. Past the red nose the voltage has nowhere to go.",
	"C5_L18_GS": "Gauss-Seidel needs %d sweeps, Newton %d iterations.",
	"C5_L18_Q": "bus 3 gives %.0f of %.0f Mvar · set-point %.3f pu",
	"GT_PART_cap-33-5": "Cap bank", "GT_SUB_cap-33-5": "5 MVAr / step", "GT_PART_cap-220-50": "Cap bank", "GT_SUB_cap-220-50": "50 MVAr / step", "GT_PART_cap-400-50": "Cap bank", "GT_SUB_cap-400-50": "50 MVAr / step",
	"GT_PART_reactor-400-50": "Reactor", "GT_SUB_reactor-400-50": "50 MVAr / step", "GT_PART_reactor-400-63": "Reactor", "GT_SUB_reactor-400-63": "63 MVAr / step", "GT_PART_reactor-400-80": "Reactor", "GT_SUB_reactor-400-80": "80 MVAr / step",
	"GT_PART_svc-100": "SVC", "GT_SUB_svc-100": "±100 MVAr", "GT_PART_statcom-100": "STATCOM", "GT_SUB_statcom-100": "±100 MVAr", "GT_PART_l220-zebra-htls": "HTLS Zebra", "GT_PART_l220-zebra": "Zebra",
	"C5_P_GS1": "V2 after GS sweep 1", "C5_P_V2": "converged |V2|", "C5_P_PS": "slack P",
}
