class_name ChFStrings
extends RefCounted
## Chapter F UI strings (registered by GridUi.load_strings beside GridStrings.S). Keys must be unique across chapters: prefix them CF_.
const S := {
	"GT_SUB_setTapAuto": "Tap hold", "GT_TIP_setTapAuto": "Tap changer set-point: step the Set-point cell to 1.02 pu, pick this cell, then click an Eastgate 220/132 kV transformer (the pair east of the capital that feeds Eastgate and Harbour).",
	"GT_PART_ict-400-220-315": "ICT", "GT_SUB_ict-400-220-315": "400/220", "GT_PART_ict-220-132-160": "ICT", "GT_SUB_ict-220-132-160": "220/132",
	"GT_PART_cap-400-50": "Cap bank", "GT_SUB_cap-400-50": "50 MVAr", "GT_PART_cap-220-50": "Cap bank", "GT_SUB_cap-220-50": "50 MVAr 220", "GT_PART_reactor-400-125": "Reactor", "GT_SUB_reactor-400-125": "125 MVAr",
	"GT_PART_statcom-200": "STATCOM", "GT_SUB_statcom-200": "200 MVAr", "GT_PART_bess-2h-50": "Battery 2h", "GT_SUB_bess-2h-50": "50 MW", "GT_PART_bess-4h-50": "Battery 4h", "GT_SUB_bess-4h-50": "50 MW", "GT_PART_bess-gfm-50": "GFM", "GT_SUB_bess-gfm-50": "50 MW",
	"CF_WO_ISLAND": "%s never goes dark, not even on the night of Day 2", "CF_WO_BAND": "Every bus stays within %s to %s pu (out of band for more than %d minutes loses)",
	"CF_WO_ENS": "Energy not served at most 0.1 %% of the energy the province uses (%d of %d MWh)", "CF_WO_BLACKOUT": "No total blackout",
	"CF_TITLE": "Keep the lights on", "CF_DAY": "DAY %d of 3", "CF_CLOCK": "%02d:%02d",
	"CF_DAY1": "Heatwave: record demand, the voltage sags at the far ends",
	"CF_DAY2": "Storm: wind farms cut out, a line, the biggest unit and a transformer trip, lightning at night",
	"CF_DAY3": "Holiday: full sun, factories shut: voltage rises, few units spin",
	"CF_NEXT_2": "next: Day 2, storm", "CF_NEXT_3": "next: Day 3, holiday",
	"CF_ISLAND_LIT": "Saltmarsh Island: lit", "CF_ISLAND_BATT": "Saltmarsh Island: on its battery, %d %% left", "CF_ISLAND_DARK": "Saltmarsh Island: DARK", "CF_ISLAND_ONEWAY": "Saltmarsh Island: lit by one feeder",
	"CF_ISLAND_TWO": "Saltmarsh Island: lit, two ways in", "CF_EXAM": "Nia's exam is the morning of Day 3",
	"CF_STATS": "voltage %.3f to %.3f pu · lost energy %.1f MWh of %.0f allowed · %d frequency dips",
	"CF_TICKER": "Event ticker", "CF_TICKER_EMPTY": "Quiet so far.",
	"CF_SPIN": "Keep the spare gas unit spinning (reserve)", "CF_SPIN_NOTE": "Headroom you do not hold cannot be summoned when a unit trips or the sun goes down.",
	"CF_HEAD_TAPS": "Taps on the Eastgate 220/132 kV transformers: tap one in the world and set the voltage it holds (1.02 pu).",
	"CF_END_TITLE": "The lights stayed on", "CF_END_SUB": "The whole state, three days, complete",
	"CF_END_NIA": "My exam was the morning after the storm. The island had power all night and I had my notes. Tobi says the whole state held. I say it was N minus one.",
	"CF_END_TOBI_TAG": "TOBI ›", "CF_END_TOBI": "Line 7's back from maintenance. Close the breaker, will you? ...Joking. Mind the anchor.",
	"CF_END_ADA_TAG": "ADA ›", "CF_END_ADA": "Forty years of building it wrong, and one night you built it right. The state is yours.",
	"CF_END_LAMPS": "Lamps earned on the finale: %d of 3", "CF_END_STAY": "Stay on the desk", "CF_END_JOBS": "All jobs",
}
