// L09 series compensation and the scripted fault (DESIGN 2.6 L09, 3.8). A series capacitor of k = X_C / X_L of the line cancels that share of the line's
// reactance: the branch keeps r and x_gross = x_line, and its working reactance is x = x_gross (1 - k), which the load flow then sees.
// The fault is a bolted 3-phase fault at the end bus, pre-fault voltage 1.0 pu (textbook mode, DESIGN 3.8), supply Thevenin in series with the lines:
//   I_f = (kV / sqrt 3) / | Z_s + sum (r + j x_gross (1 - k)) |,   Z_s = (X_s / (X/R)) + j X_s,  X_s = kV^2 / Ssc
// Honest note: the capacitor's MOV / bypass gap conducts within the first half-cycle; the breaker's duty (short-circuit making current) is the first cycle, so the
// capacitor is counted in service and the printed capacitor voltage is only compared with the protective level, not applied (DC offset ignored, S7).
import type { GridState, Branch } from '../../types';
import { S_BASE_MVA } from '../network';
import type { FaultRules } from './rules';

/** Working reactance of a branch with `pct` percent series compensation (pu on 100 MVA). */
export const xWorking = (xGross: number, pct: number): number => xGross * (1 - pct / 100);

export interface FaultStudy { /** the same fault with no series capacitor, kA */ kA0: number; kA: number; zOhm: number; xTotalOhm: number; rTotalOhm: number; /** X_C in ohm of every series capacitor on the path, and the electrical resonance frequency of the loop, Hz */ xcOhm: number; fResHz: number; /** capacitor voltage during the fault in multiples of its rated voltage (rated current = the line's thermal current) */ capPu: number }

/** The lines between the supply bus and `bus`, nearest the supply first (radial feeder). */
export function pathToSupply(s: GridState, bus: string): Branch[] {
  const src = s.units.find((u) => u.online)?.bus;
  const path: Branch[] = []; let at = bus; const seen = new Set([bus]);
  for (let guard = 0; guard < 50 && src !== undefined && at !== src; guard++) {
    const b = s.branches.find((q) => q.kind !== 'xfmr' && ((q.from === at && !seen.has(q.to)) || (q.to === at && !seen.has(q.from))));
    if (!b) break;
    path.unshift(b); at = b.from === at ? b.to : b.from; seen.add(at);
  }
  return path;
}

export function faultStudy(s: GridState, f: FaultRules, f0: number): FaultStudy | null {
  const bb = s.buses.find((x) => x.id === f.bus);
  if (!bb) return null;
  const kv = bb.kvNom, zb = kv * kv / S_BASE_MVA, path = pathToSupply(s, f.bus);
  if (path.length === 0) return null;
  const xs = kv * kv / f.sscMVA;
  let r = xs / f.xOverR, xl = 0, xc = 0, iRated = Infinity;
  for (const b of path) {
    const k = (b.seriesCap?.pct ?? 0) / 100, xg = (b.seriesCap?.xGross ?? b.x) * zb;
    r += b.r * zb; xl += xg * (1 - k); xc += xg * k;
    iRated = Math.min(iRated, b.ratingMVA * 1000 / (Math.sqrt(3) * kv));
  }
  const xInd = xs + xl + xc;                       // the loop's inductance: supply + the line's gross reactance
  const x = xs + xl, z = Math.hypot(r, x), kA = kv / Math.sqrt(3) / z;
  void f0;
  return { kA0: kv / Math.sqrt(3) / Math.hypot(r, xs + xl + xc), kA, zOhm: z, xTotalOhm: x, rTotalOhm: r, xcOhm: xc, fResHz: xc > 0 ? f0 * Math.sqrt(xc / xInd) : 0, capPu: xc > 0 && iRated > 0 ? kA * 1000 * xc / (iRated * xc) : 0 };
}
