// Pure simulation rules (load flow, dispatch, frequency, protection) live here from M2 on.
// Rule: nothing under src/sim imports a region pack. Region data (f0, limits, prices) arrives as plain parameters
// passed in by the caller (game.ts or a system), so physics cannot branch on a region id. A test enforces it.
export {};
