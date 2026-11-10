// The terrain maps by id. The state keeps only the id (`state.terrain`); the tiles stay in code, parsed once.
import { parseTerrain, type Terrain } from '../../sim/route';
import { MAINLAND_ROWS, MAINLAND_TILE_M, mainlandElev } from './mainland';

interface MapData { rows: readonly string[]; tileM: number; elev: (i: number, j: number) => number }
const MAPS: Record<string, MapData> = { mainland: { rows: MAINLAND_ROWS, tileM: MAINLAND_TILE_M, elev: mainlandElev } };
const PARSED = new Map<string, Terrain>();

export const mapRows = (id: string): readonly string[] | null => MAPS[id]?.rows ?? null;
/** The parsed terrain of a map id (memoised), or null for null or an unknown id. */
export function terrainOf(id: string | null): Terrain | null {
  if (id === null || !MAPS[id]) return null;
  let t = PARSED.get(id);
  if (!t) { const m = MAPS[id]!; t = parseTerrain([...m.rows], m.tileM, m.elev); PARSED.set(id, t); }
  return t;
}
