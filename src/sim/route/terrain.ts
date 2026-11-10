// Terrain parsing and lookup (DEPTH §3). Legend: f field, s swamp, r river, w forest, k rock, a sand, e sea, t town, d road.
import type { PollutionClass, Terrain, TileKind } from './types';

export const TILE_CHARS: Record<string, TileKind> = {
  f: 'field', s: 'swamp', r: 'river', w: 'forest', k: 'rock', a: 'sand', e: 'sea', t: 'town', d: 'road',
};

/** Rows of equal-length strings -> Terrain. Pollution: within 2 tiles (Chebyshev) of sea 3, within 6 tiles 2, else 1; swamp within 6 of sea >= 3. */
export function parseTerrain(rows: string[], tileM: number, elev: (i: number, j: number) => number): Terrain {
  const nr = rows.length, nc = nr ? rows[0]!.length : 0;
  const kinds: TileKind[] = [], elevM: number[] = [];
  for (let j = 0; j < nr; j++) {
    if (rows[j]!.length !== nc) throw new Error(`parseTerrain: row ${j} has length ${rows[j]!.length}, expected ${nc}`);
    for (let i = 0; i < nc; i++) {
      const k = TILE_CHARS[rows[j]![i]!];
      if (!k) throw new Error(`parseTerrain: unknown tile char '${rows[j]![i]}' at (${i}, ${j})`);
      kinds.push(k); elevM.push(elev(i, j));
    }
  }
  const seaDist = (i: number, j: number): number => {
    let best = 99;
    for (let dj = -6; dj <= 6; dj++) for (let di = -6; di <= 6; di++) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= nc || b >= nr || kinds[b * nc + a] !== 'sea') continue;
      const d = Math.max(Math.abs(di), Math.abs(dj));
      if (d < best) best = d;
    }
    return best;
  };
  const pollution: PollutionClass[] = [];
  for (let j = 0; j < nr; j++) for (let i = 0; i < nc; i++) {
    const d = seaDist(i, j);
    let p: PollutionClass = d <= 2 ? 3 : d <= 6 ? 2 : 1;
    if (kinds[j * nc + i] === 'swamp' && d <= 6 && p < 3) p = 3;
    pollution.push(p);
  }
  return { cols: nc, rows: nr, tileM, kinds, elevM, pollution };
}

/** Tile index under (x, y) metres, or null off the map. */
export function tileIndexAt(t: Terrain, x: number, y: number): number | null {
  if (!(x >= 0 && y >= 0)) return null;
  const i = Math.floor(x / t.tileM), j = Math.floor(y / t.tileM);
  if (i >= t.cols || j >= t.rows) return null;
  return j * t.cols + i;
}

export function kindAt(t: Terrain, x: number, y: number): TileKind | null {
  const k = tileIndexAt(t, x, y);
  return k === null ? null : t.kinds[k]!;
}

/** Ground elevation: bilinear interpolation between tile-centre elevations, clamped at the map edge. */
export function groundAt(t: Terrain, x: number, y: number): number {
  const clamp = (v: number, hi: number): number => Math.max(0, Math.min(hi, v));
  const u = clamp(x / t.tileM - 0.5, t.cols - 1), v = clamp(y / t.tileM - 0.5, t.rows - 1);
  const i0 = Math.min(Math.floor(u), t.cols - 1), j0 = Math.min(Math.floor(v), t.rows - 1);
  const i1 = Math.min(i0 + 1, t.cols - 1), j1 = Math.min(j0 + 1, t.rows - 1);
  const fu = u - i0, fv = v - j0;
  const e = (i: number, j: number): number => t.elevM[j * t.cols + i]!;
  return (e(i0, j0) * (1 - fu) + e(i1, j0) * fu) * (1 - fv) + (e(i0, j1) * (1 - fu) + e(i1, j1) * fu) * fv;
}
