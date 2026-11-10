// L12: Kestrel Falls hydro -> city, loss of one circuit at the 19:30 peak (DESIGN 2.6 L12, 3.7). Classical model: E' behind X'd, infinite bus V = 1.
// The AVR holds the generator terminal voltage at V_ref until the event; E' is the internal emf that needs (phasor diagram), and stays constant through the swing (S4).
import { abs, add, cx, mul, sub, polar, dmath, type Complex } from '@core/numerics';
import { equalAreaCritical, runSmib, type SmibResult } from '../dynamics/smib';
import { BASE_MVA, HYDRO, X_CIRCUIT, X_DPRIME, X_GSU } from './data';

export interface HydroBuild { vref: number; seriesPct: number; third: boolean; reduceMW: number }
export interface HydroNumbers {
  ok: boolean;
  /** Mechanical power, pu; internal emf, pu; its pre-event angle, deg. */
  pm: number; E: number; delta0Deg: number;
  /** Total reactances E' to the infinite bus before and after the circuit is lost, pu; the matching P_max, pu. */
  xPre: number; xPost: number; pmaxPre: number; pmaxPost: number;
  /** Post-event equilibrium angle (null when P_m > P_max,post), deg. */
  deltaPostDeg: number | null;
  /** Equal-area peak of the undamped first swing is not computed here; the RK4 run is `swing`. */
}
export const deg = (r: number): number => (r * 180) / Math.PI;
/** Per-circuit reactance after series compensation, pu on 100 MVA. */
export const circuitX = (seriesPct: number): number => X_CIRCUIT * (1 - seriesPct / 100);

export function hydroNumbers(b: HydroBuild): HydroNumbers {
  const pm = HYDRO.mw / BASE_MVA - b.reduceMW / BASE_MVA;
  const x1 = circuitX(b.seriesPct), nPre = b.third ? 3 : 2;
  const xExtPre = X_GSU + x1 / nPre, xExtPost = X_GSU + x1 / (nPre - 1);
  const bad: HydroNumbers = { ok: false, pm, E: 0, delta0Deg: 0, xPre: X_DPRIME + xExtPre, xPost: X_DPRIME + xExtPost, pmaxPre: 0, pmaxPost: 0, deltaPostDeg: null };
  const s = (pm * xExtPre) / b.vref;
  if (!(s <= 1)) return bad;
  const vt = polar(b.vref, dmath.asin(s));
  const i = mul(sub(vt, cx(1)), cx(0, -1 / xExtPre));   // (Vt - V) / (j Xext)
  const e = add(vt, mul(cx(0, X_DPRIME), i));
  const E = abs(e), d0 = dmath.atan2(e.im, e.re);
  const pmaxPre = E / bad.xPre, pmaxPost = E / bad.xPost;
  return { ok: true, pm, E, delta0Deg: deg(d0), xPre: bad.xPre, xPost: bad.xPost, pmaxPre, pmaxPost, deltaPostDeg: pm <= pmaxPost ? deg(dmath.asin(pm / pmaxPost)) : null };
}

export interface SwingOutcome {
  /** The unit stayed in step through the first swing and after. */
  stable: boolean;
  /** No steady operating point before or after the event (P_m above P_max). */
  noEquilibrium: boolean;
  peakDeltaDeg: number; deltaUDeg: number; tLossS: number | null; deltaAtLossDeg: number | null;
  /** Decimated trace for the P-delta drawer and the rotor-angle plot: time s, angle deg (every 20 ms). */
  trace: { tS: number[]; deltaDeg: number[] };
}
/** Run the circuit loss: P_max drops at t = 0 from the pre- to the post-event curve (no fault), RK4 1 ms for 3 s (the engine's SMIB). */
export function runSwing(b: HydroBuild): { n: HydroNumbers; out: SwingOutcome } {
  const n = hydroNumbers(b);
  const dead: SwingOutcome = { stable: false, noEquilibrium: true, peakDeltaDeg: 180, deltaUDeg: 0, tLossS: 0, deltaAtLossDeg: null, trace: { tS: [0], deltaDeg: [n.delta0Deg] } };
  if (!n.ok || n.deltaPostDeg === null) return { n, out: dead };
  const r: SmibResult = runSmib({ H: HYDRO.H, f0: HYDRO.f0, Pm: n.pm, PmaxPre: n.pmaxPre, PmaxDuring: n.pmaxPost, PmaxPost: n.pmaxPost, tClearS: 0, D: HYDRO.D, traceDt: 0.02 });
  if (!r.ok) return { n, out: dead };
  return { n, out: {
    stable: !r.lossOfSync, noEquilibrium: false, peakDeltaDeg: deg(r.deltaMax), deltaUDeg: deg(r.deltaU), tLossS: r.tLossS,
    deltaAtLossDeg: r.lossOfSync ? deg(r.deltaMax) : null, trace: { tS: r.trace.t, deltaDeg: r.trace.deltaRad.map(deg) },
  } };
}
/** Closed-form equal-area peak of the undamped swing (teaching figure shown next to the RK4 one); null when it does not exist. */
export function equalAreaPeakDeg(n: HydroNumbers): number | null {
  if (!n.ok || n.deltaPostDeg === null) return null;
  const e = equalAreaCritical({ H: HYDRO.H, f0: HYDRO.f0, Pm: n.pm, PmaxPre: n.pmaxPre, PmaxDuring: n.pmaxPost, PmaxPost: n.pmaxPost, tClearS: 0 });
  return e.ok && e.deltaCr !== null ? deg(e.deltaCr) : null;
}
