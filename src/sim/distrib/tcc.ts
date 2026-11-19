// Time-current characteristics (TCC) and fuse-recloser coordination.
//   IEEE C37.112 inverse-time relays / reclosers:  t = TD (A / (M^p - 1) + B),  M = I / Ipickup     (constants in data.ts)
//   Recloser curve = IEEE curve scaled by a time dial, never faster than minTimeS (mechanical limit).
//   Fuse minimum-melt (MM) and total-clearing (TC) curves: piecewise log-log tables (interpolation linear in log I, log t).
// Coordination ("fuse saving", DESIGN-1.1 L33): for every fault current in [Imin, Imax] the recloser FAST curve must be quicker than the
//   fuse minimum melt (margin_fast = t_MM - t_fast) and the SLOW curve slower than total clearing (margin_slow = t_slow - t_TC).
import { dmath } from '@core/numerics';
import { IEEE_CURVES, FUSE_SHAPE, RECLOSER_CURVES } from './data';

export type CurveId = 'MI' | 'VI' | 'EI';

/** IEEE C37.112 operate time (s) for current i with pickup ip and time dial td; Infinity at or below pickup. */
export function ieeeTime(curve: CurveId, td: number, i: number, ip: number): number {
  const c = IEEE_CURVES.find((r) => r.id === curve)!, m = i / ip;
  if (m <= 1) return Infinity;
  return td * (c.A / (dmath.pow(m, c.p) - 1) + c.B);
}

export interface RecloserCurve { curve: CurveId; td: number; pickupA: number; minTimeS: number }
export function recloserTime(rc: RecloserCurve, i: number): number { return Math.max(rc.minTimeS, ieeeTime(rc.curve, rc.td, i, rc.pickupA)); }
/** The standard fast / slow pair for a pickup (A). */
export function recloserPair(pickupA: number, fastTd?: number, slowTd?: number): { fast: RecloserCurve; slow: RecloserCurve } {
  const f = RECLOSER_CURVES.find((r) => r.id === 'fast')!, s = RECLOSER_CURVES.find((r) => r.id === 'slow')!;
  return { fast: { curve: f.curve, td: fastTd ?? f.td, pickupA, minTimeS: f.minTimeS }, slow: { curve: s.curve, td: slowTd ?? s.td, pickupA, minTimeS: s.minTimeS } };
}

/** Log-log interpolation in a table of (A, s) sorted by current; Infinity below the first point, clamped to the last time above. */
export function logLogTime(pts: [number, number][], i: number): number {
  if (i < pts[0]![0]) return Infinity;
  const last = pts[pts.length - 1]!;
  if (i >= last[0]) return last[1];
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1]!, b = pts[k]!;
    if (i <= b[0]) { const u = (dmath.log(i) - dmath.log(a[0])) / (dmath.log(b[0]) - dmath.log(a[0])); return dmath.exp(dmath.log(a[1]) + u * (dmath.log(b[1]) - dmath.log(a[1]))); }
  }
  return last[1];
}

export interface FuseCurve { ratingA: number; minMelt: [number, number][]; totalClear: [number, number][] }
/** K-link curve pair for a rated current (A), built from the recalled shape in data.ts. */
export function fuseK(ratingA: number): FuseCurve {
  const mm = FUSE_SHAPE.minMelt.map(([m, t]) => [m * ratingA, t] as [number, number]);
  return { ratingA, minMelt: mm, totalClear: mm.map(([a, t]) => [a, t * FUSE_SHAPE.clearMult + FUSE_SHAPE.arcS] as [number, number]) };
}
export const fuseMinMelt = (f: FuseCurve, i: number): number => logLogTime(f.minMelt, i);
export const fuseTotalClear = (f: FuseCurve, i: number): number => logLogTime(f.totalClear, i);

export interface CoordPoint { currentA: number; tFast: number; tSlow: number; tMM: number; tTC: number; marginFast: number; marginSlow: number; ok: boolean }
export interface Coordination {
  points: CoordPoint[];
  /** Largest contiguous current interval (A) in which both margins are >= minMarginS; null if none. */
  range: { lowA: number; highA: number } | null;
  worstFast: number; worstSlow: number; worstMargin: number;
}

/** Margins over the fault range [iMinA, iMaxA] sampled at `samples` log-spaced currents (default 60). */
export function coordination(fast: RecloserCurve, slow: RecloserCurve, fuse: FuseCurve, iMinA: number, iMaxA: number, minMarginS = 0, samples = 60): Coordination {
  const pts: CoordPoint[] = [];
  const l0 = dmath.log(iMinA), l1 = dmath.log(iMaxA);
  for (let k = 0; k < samples; k++) {
    const i = samples === 1 ? iMinA : dmath.exp(l0 + ((l1 - l0) * k) / (samples - 1));
    const tFast = recloserTime(fast, i), tSlow = recloserTime(slow, i), tMM = fuseMinMelt(fuse, i), tTC = fuseTotalClear(fuse, i);
    // below fuse minimum-melt current the fuse never operates: margin against it is unbounded (cap so JSON stays finite)
    const mf = tMM === Infinity ? 1e6 : tMM - tFast, ms = tSlow === Infinity ? -1e6 : tSlow - tTC;
    pts.push({ currentA: i, tFast, tSlow, tMM, tTC, marginFast: mf, marginSlow: tTC === Infinity ? 1e6 : ms, ok: mf >= minMarginS && (tTC === Infinity || ms >= minMarginS) });
  }
  let best: { lowA: number; highA: number } | null = null, start = -1;
  for (let k = 0; k <= pts.length; k++) {
    const ok = k < pts.length && pts[k]!.ok;
    if (ok && start < 0) start = k;
    if (!ok && start >= 0) { const c = { lowA: pts[start]!.currentA, highA: pts[k - 1]!.currentA }; if (!best || c.highA / c.lowA > best.highA / best.lowA) best = c; start = -1; }
  }
  return {
    points: pts, range: best,
    worstFast: Math.min(...pts.map((p) => p.marginFast)), worstSlow: Math.min(...pts.map((p) => p.marginSlow)),
    worstMargin: Math.min(...pts.map((p) => Math.min(p.marginFast, p.marginSlow))),
  };
}
/** Margins at explicit currents (for the oracle and for a spur check). */
export function marginsAt(fast: RecloserCurve, slow: RecloserCurve, fuse: FuseCurve, currents: number[]): { currentA: number; marginFast: number; marginSlow: number }[] {
  return currents.map((i) => ({ currentA: i, marginFast: fuseMinMelt(fuse, i) - recloserTime(fast, i), marginSlow: recloserTime(slow, i) - fuseTotalClear(fuse, i) }));
}
