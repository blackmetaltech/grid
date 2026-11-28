// L25: the SMIB swing with a clearing time chosen by relay and breaker, and an optional auto-reclose. RK4 (dt 1 ms) with the engine's loss-of-synchronism rule
// (delta beyond the unstable equilibrium of the network in force while omega > 1); the reclose is a fourth stage that restores the pre-fault network.
// The engine's runSmib (3 stages) cross-checks it with reclose off. Oracle: tools/oracles/ch7_oracles.py (own RK4) and src/sim/dynamics/smib.ts closed forms.
import { dmath } from '@core/numerics';
import { equalAreaCritical, pDeltaCurves, type SmibInput } from '../dynamics/smib';
import { idmtTime } from '../protection/relays';
import { SC } from './data';
import type { L25Design } from './state';

export interface Swing { stable: boolean; tLossS: number | null; maxDeg: number; /** decimated trace (10 ms): t, delta deg, omega pu */ t: number[]; deltaDeg: number[]; omega: number[]; clearAtDeg: number }

const dtS = 1e-3;
export function simulate(tClear: number, reclose: boolean, tEnd: number = SC.l25.tEndS, record = false): Swing {
  const c = SC.l25, ws = 2 * Math.PI * c.f0, H = c.H;
  const tRec = reclose ? tClear + c.recloseDeadS : null;
  let d = dmath.asin(c.Pm / c.PmaxPre), w = 1, t = 0, maxd = d;
  const stage = (tt: number): number => (tt < tClear - 1e-12 ? c.PmaxDuring : tRec !== null && tt >= tRec - 1e-12 ? c.PmaxPre : c.PmaxPost);
  const f = (dd: number, ww: number, P: number): [number, number] => [ws * (ww - 1), (c.Pm - P * dmath.sin(dd)) / (2 * H)];
  const bps = tRec !== null ? [tClear, tRec] : [tClear];
  const out: Swing = { stable: true, tLossS: null, maxDeg: 0, t: [], deltaDeg: [], omega: [], clearAtDeg: 0 };
  let n = 0;
  const rec = (): void => { if (out.t.length && out.t[out.t.length - 1] === t) return; out.t.push(t); out.deltaDeg.push((d * 180) / Math.PI); out.omega.push(w); };   // one point per instant (the loss of step could land on a sample)
  if (record) rec();
  while (t < tEnd - 1e-12) {
    let h = dtS;
    for (const bp of bps) if (t < bp - 1e-12 && t + h > bp - 1e-12) h = bp - t;
    const P = stage(t + 1e-12);
    const a = f(d, w, P), b = f(d + (h / 2) * a[0], w + (h / 2) * a[1], P), cc = f(d + (h / 2) * b[0], w + (h / 2) * b[1], P), e = f(d + h * cc[0], w + h * cc[1], P);
    d += (h / 6) * (a[0] + 2 * b[0] + 2 * cc[0] + e[0]); w += (h / 6) * (a[1] + 2 * b[1] + 2 * cc[1] + e[1]); t += h;
    if (Math.abs(t - tClear) < 1e-9) out.clearAtDeg = (d * 180) / Math.PI;
    if (d > maxd) maxd = d;
    n++;
    if (record && (n % 10 === 0 || bps.some((bp) => Math.abs(t - bp) < 1e-9))) rec();
    const P2 = stage(t + 1e-12), du = P2 > c.Pm ? Math.PI - dmath.asin(c.Pm / P2) : Math.PI;
    if (t >= tClear - 1e-12 && d > du && w > 1) { out.stable = false; out.tLossS = t; if (record) rec(); break; }
  }
  out.maxDeg = (maxd * 180) / Math.PI;
  return out;
}

export const smibInput = (tClearS = 0): SmibInput => ({ H: SC.l25.H, f0: SC.l25.f0, Pm: SC.l25.Pm, PmaxPre: SC.l25.PmaxPre, PmaxDuring: SC.l25.PmaxDuring, PmaxPost: SC.l25.PmaxPost, tClearS });

let CR: { tCrS: number; deltaCrDeg: number; delta0Deg: number; deltaUDeg: number } | null = null;
/** Critical clearing time (no reclose; RK4 bisection on the clearing time) and the equal-area angles: constants of the scenario, cached. */
export function critical(): { tCrS: number; deltaCrDeg: number; delta0Deg: number; deltaUDeg: number } {
  if (CR) return CR;
  let lo = 0, hi = 2;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (simulate(m, false, Math.max(SC.l25.tEndS, m + 3)).stable) lo = m; else hi = m; }
  const ea = equalAreaCritical(smibInput());
  CR = { tCrS: lo, deltaCrDeg: ((ea.deltaCr ?? 0) * 180) / Math.PI, delta0Deg: (ea.delta0 * 180) / Math.PI, deltaUDeg: (ea.deltaU * 180) / Math.PI };
  return CR;
}

export interface L25Study {
  relayS: number; breakerS: number; clearS: number; swing: Swing; stable: boolean; marginMs: number; capexUSD: number; tCrS: number; deltaCrDeg: number; delta0Deg: number; deltaUDeg: number;
  relayLabel: string;
}
export function studyL25(d: L25Design): L25Study {
  const c = SC.l25, r = c.relays[d.relay];
  if (!r) throw new Error('unknown relay ' + d.relay);
  const relayS = r.kind === 'idmt' ? idmtTime(r.curve!, r.tms!, c.faultKA * 1000, c.ctA) : r.delayS!;
  const breakerS = d.cycles / c.f0, clearS = relayS + breakerS;
  const cr = critical(), sw = simulate(clearS, d.reclose, c.tEndS, true);   // 11-28b: record the trace (it was never recorded, so the swing chart had nothing to draw)
  return {
    relayS, breakerS, clearS, swing: sw, stable: sw.stable, marginMs: (cr.tCrS - clearS) * 1000, tCrS: cr.tCrS, deltaCrDeg: cr.deltaCrDeg, delta0Deg: cr.delta0Deg, deltaUDeg: cr.deltaUDeg,
    capexUSD: r.price + c.breakerPrice[String(d.cycles)]! + (d.reclose ? c.reclosePrice : 0), relayLabel: d.relay,
  };
}
export { pDeltaCurves };
