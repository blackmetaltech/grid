class_name ChFStrings
extends RefCounted
## Chapter F UI strings (registered by GridUi.load_strings beside GridStrings.S). Keys must be unique across chapters: prefix them CF_.
const S := {
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
	"CF_END_TITLE": "The lights stayed on", "CF_END_SUB": "The Lumen Province, three days, complete",
	"CF_END_NIA": "My exam was the morning after the storm. The island had power all night and I had my notes. Tobi says the whole state held. I say it was N minus one.",
	"CF_END_TOBI_TAG": "TOBI ›", "CF_END_TOBI": "Line 7's back from maintenance. Close the breaker, will you? ...Joking. Mind the anchor.",
	"CF_END_ADA_TAG": "ADA ›", "CF_END_ADA": "Forty years of building it wrong, and one night you built it right. The state is yours.",
	"CF_END_LAMPS": "Lamps earned on the finale: %d of 3", "CF_END_STAY": "Stay on the desk", "CF_END_JOBS": "All jobs",
}
