// Chapter 2 district map "The Mainland" (DEPTH.md §7-8): 100 × 44 tiles of 50 m (5 km × 2.2 km). West: the waterfall hills and the
// hydro station; a river runs north to south with a rocky 100 m gorge in the north (rows 6-10) and a mangrove estuary widening to the sea
// in the south; forests in the north; a ridge (rock crest, a field saddle at rows 19-27) east of the river; the market town in the east
// (rows 10-18) with the road along row 14 (it crosses the ridge in a cutting through the rock); beach and sea along the south edge. Legend: f field, s swamp, r river, w forest, k rock, a sand, e sea,
// t town, d road (src/sim/route/types.ts). Elevations in metres; river and sea tiles carry the high-water level.
// The rows were generated once by a script (river centre piecewise linear, widths per row) and are frozen here as data.
export const MAINLAND_TILE_M = 50;
export const MAINLAND_ROWS: readonly string[] = [
  'ffffffffffffffwwwwwwwwwwwwwwwwwwffrrrrffffwwwwwwwwwwwwwwwwwwwfffffffffffffffffffffffffffffffffffffff',
  'ffffffffffffffwwwwwwwwwwwwwwwwwwfffrrrffffwwwwwwwwwwwwwwwwwwwfffffffffffffffffffffffffffffffffffffff',
  'ffffffffffffffwwwwwwwwwwwwwwwwwwfffrrrffffwwwwwwwwwwwwwwwwwwwfffffffffffffffffffffffffffffffffffffff',
  'ffffffffffffffwwwwwwwwwwwwwwwwwwfffrrrffffwwwwwwwwwwwwwwwwwwwfffffffffffffffffffffffffffffffffffffff',
  'ffffffffffffffwwwwwwwwwwwwwwwwwwfffrrrffffwwwwwwwwwwwwwwwwwwwffffffffkkkkfffffffffffffffffffffffffff',
  'ffffffffffffffwwwwwwwwwwwwwwwwwwfffrrrffffwwwwwwwwwwwwwwwwwwwffffffffkkkkfffffffffffffffffffffffffff',
  'ffffffffffffffwwwwwwwwwwwwwwwwwwffkkrrkkffwwwwwwwwwwwwwwwwwwwffffffffkkkkfffffffffffffffffffffffffff',
  'ffffffffffffffwwwwwwwwwwwwwwwwwwffkkrrkkffwwwwwwwwwwwwwwwwwwwffffffffkkkkfffffffffffffffffffffffffff',
  'ffffffffffffffwwwwwwwwwwwwwwwwwwffkkrrkkffwwwwwwwwwwwwwwwwwwwffffffffkkkkfffffffffffffffffffffffffff',
  'ffffffffffffffwwwwwwwwwwwwwwwwwwffkkrrkkffwwwwwwwwwwwwwwwwwwwffffffffkkkkfffffffffffffffffffffffffff',
  'ffffffffffffffwwwwwwwwwwwwwwwwwwfkkrrkkfffwwwwwwwwwwwwwwwwwwwffffffffkkkkfffffffffffftttttttttffffff',
  'ffffffffffffffwwwwwwwwwwwwwwwwwwffrrrrffffwwwwwwwwwwwwwwwwwwwffffffffkkkkfffffffffffftttttttttffffff',
  'ffffffffffffffwwwwwwwwwwwwwwwwwwffrrrfffffwwwwwwwwwwwwwwwwwwwffffffffkkkkfffffffffffftttttttttffffff',
  'ffffffffffffffffffffffffffffffffffrrrffffffffffffffffffffffffffffffffkkkkfffffffffffftttttttttffffff',
  'fffffffffffffffffffffffffffffffffrrrrddddddddddddddddddddddddddddddddkkkkdddddddddddftttttttttffffff',
  'ffffffffffffffffffffffffffffffffffrrrffffffffffffffffffffffffffffffffkkkkfffffffffffftttttttttffffff',
  'ffffffffffffffffffffffffffffffffffrrrffffffffffffffffffffffffffffffffkkkkfffffffffffftttttttttffffff',
  'fffffffffffffffffffffffffffffffffffrrrffffffffffffffffffffffffffffffffffffffffffffffftttttttttffffff',
  'fffffffffffffffffffffffffffffffffffrrrffffffffffffffffffffffffffffffffffffffffffffffftttttttttffffff',
  'fffffffffffffffffffffffffffffffffffrrrffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  'ffffffffffffffffffffffffffffffffffffrrrfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  'ffffffffffffffffffffffffffffffffffffrrrfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  'ffffffffffffffffffffffffffffffffffffrrrrffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  'fffffffffffffffffffffffffffffffffffffrrrffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  'fffffffffffffffffffffffffffffffffffffrrrffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  'ffffffffffffffffffffffffffffffffffffffrrrfffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
  'ffffffffffffffffffffffffffffffffssssssrrrssssssfffffffffffffffffffffffffffffffffffffffffffffffffffff',
  'ffffffffffffffffffffffffffffffffssssssrrrssssssfffffffffffffffffffffffffffffffffffffffffffffffffffff',
  'fffffffffffffffffffffffffffffffffssssssrrrssssssffffffffffffffffffffffffffffffffffffffffffffffffffff',
  'fffffffffffffffffffffffffffffffffssssssrrrssssssffffffffffffffffffffffffffffffffffffffffffffffffffff',
  'fffffffffffffffffffffffffffffffffssssssrrrrssssssfffffffffffffffffffffffffffffffffffffffffffffffffff',
  'fffffffffffffffffffffffffffffffffssssssrrrrssssssfffffffffffffffffffffffffffffffffffffffffffffffffff',
  'ffffffffffffffffffffffffffffffffffssssssrrrrssssssffffffffffffffffffffffffffffffffffffffffffffffffff',
  'ffffffffffffffffffffffffffffffffffssssssrrrrssssssffffffffffffffffffffffffffffffffffffffffffffffffff',
  'ffffffffffffffffffffffffffffffffffssssssrrrrrssssssfffffffffffffffffffffffffffffffffffffffffffffffff',
  'ffffffffffffffffffffffffffffffffffssssssrrrrrssssssfffffffffffffffffffffffffffffffffffffffffffffffff',
  'ffffffffffffffffffffffffffffffffffssssssrrrrrssssssfffffffffffffffffffffffffffffffffffffffffffffffff',
  'fffffffffffffffffffffffffffffffffffssssssrrrrrssssssffffffffffffffffffffffffffffffffffffffffffffffff',
  'fffffffffffffffffffffffffffffffffffssssssrrrrrssssssffffffffffffffffffffffffffffffffffffffffffffffff',
  'fffffffffffffffffffffffffffffffffffssssssrrrrrrssssssfffffffffffffffffffffffffffffffffffffffffffffff',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaeeeeeeeeaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaeeeeeeeeaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
];

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
/** Ridge crest height by row: 45 m in the north, an 18 m saddle at rows 19-27, 30 m in the south (linear between). */
function ridgeTop(j: number): number {
  if (j <= 17) return 45;
  if (j < 19) return 45 + (18 - 45) * (j - 17) / 2;
  if (j <= 27) return 18;
  if (j < 29) return 18 + (30 - 18) * (j - 27) / 2;
  return 30;
}
/** Ground (or high-water) elevation at the centre of tile (i, j), metres. Plain arithmetic only (determinism guard). */
export function mainlandElev(i: number, j: number): number {
  const k = MAINLAND_ROWS[j]![i]!;
  if (k === 'e') return 0;
  if (k === 'r') return 2;
  if (k === 'a') return 1;
  if (k === 's') return 1.5;
  // west hills fall from 70 m at the map edge to 8 m at column 14, then the plain slopes to 4 m at the river
  let z = i < 14 ? 70 + (8 - 70) * (i / 14) : i < 34 ? 8 + (4 - 8) * ((i - 14) / 20) : 5 + 3 * clamp01((i - 40) / 30);
  const u = (i + 0.5 - 70.5) / 6;
  const bump = 1 - u * u;
  if (bump > 0) z += ridgeTop(j) * bump;
  return z;
}
