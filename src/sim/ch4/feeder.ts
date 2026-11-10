// L10: the 4-wire street solved in the phase domain (DESIGN 3.5): each house is a constant-Z load between its phase and the neutral; the neutral
// conductor has its own impedance, so I_N = I_a + I_b + I_c shifts the neutral at the far pole. Wraps the bench's solveFourWire.
import { abs, cx, sub, conj, mul, dmath, type Complex } from '@core/numerics';
import { solveFourWire, type FourWireLoad, type PhaseLoad } from '../bench';
import { EMF_PH, HOUSES, NEUTRAL, RN_TX, SPANS, SPAN_M, V_PH, X_N_KM, Z_PH_KM, Z_TX, type Phase, PHASES } from './data';

export interface FeederResult {
  /** Neutral current at the transformer, A; the three phase currents there, A; the largest of them. */
  iN: number; iPhase: Record<Phase, number>; iMax: number;
  /** I_N as a percentage of the largest phase current. */
  iNpct: number;
  /** Phase-to-neutral volts at the far pole. */
  vFar: Record<Phase, number>;
  /** Largest deviation of a far-pole phase voltage from 230 V, percent. */
  vDevPct: number;
  /** I2R of all conductors over the real power the transformer supplies, percent; the supply, W; the neutral's shift at the far pole, V. */
  lossPct: number; pSupplyW: number; shiftFarV: number;
  /** Phase-to-neutral volts at every pole level (index 0 = transformer, 7 = far pole) and the currents as phasors (for the phasor diagram): I_a, I_b, I_c and I_N = I_a + I_b + I_c. */
  vLevels: Record<Phase, number[]>; iPh: Record<Phase, Complex>; iNc: Complex;
}

const ZERO_LOAD: PhaseLoad = { kind: 'I', i: cx(0) };
/** The street at a load `scale` (1 = evening peak). `phases[i]` is the phase house i hangs on; `neutralOpen` models the neutral burnt through at the first pole. Never throws. */
export function solveFeeder(phases: readonly Phase[], neutralMm2: number, scale: number, neutralOpen = false): FeederResult | null {
  const rn = NEUTRAL[neutralMm2]?.rOhmKm;
  if (rn === undefined) return null;
  const zp = cx(Z_PH_KM.re * SPAN_M / 1000, Z_PH_KM.im * SPAN_M / 1000), zn = cx(rn * SPAN_M / 1000, X_N_KM * SPAN_M / 1000);
  const tx = cx(Z_TX.re, Z_TX.im);
  const segments = [{ zPhase: tx, zNeutral: cx(RN_TX, 0) }, ...Array.from({ length: SPANS }, (_, k) => ({ zPhase: zp, zNeutral: neutralOpen && k === 0 ? cx(1e9, 0) : zn }))];
  // admittance per (pole level, phase): Y = (P - jQ)/V^2
  const y = new Map<string, Complex>();
  HOUSES.forEach((h, i) => {
    const p = h.kw * 1000 * scale, q = p * dmath.tan(dmath.acos(h.pf)), key = `${Math.floor(i / 3) + 2}${phases[i]}`;
    const prev = y.get(key) ?? cx(0);
    y.set(key, cx(prev.re + p / (V_PH * V_PH), prev.im - q / (V_PH * V_PH)));
  });
  const load = (lvl: number, ph: Phase): PhaseLoad => { const yy = y.get(`${lvl}${ph}`); if (!yy) return ZERO_LOAD; const d = yy.re * yy.re + yy.im * yy.im; return { kind: 'Z', z: cx(yy.re / d, -yy.im / d) }; };
  const loads: FourWireLoad[] = Array.from({ length: SPANS }, (_, k) => ({ at: k + 2, a: load(k + 2, 'a'), b: load(k + 2, 'b'), c: load(k + 2, 'c') }));
  const r = solveFourWire({ vPhase: EMF_PH, segments, loads, earthR: 1 });
  if (!r.ok) return null;
  const V = r.V, far = SPANS + 1;
  const iPh = {} as Record<Phase, Complex>, vFar = {} as Record<Phase, number>;
  let loss = 0, psup = 0;
  for (const ph of PHASES) {
    iPh[ph] = mul(sub(V[`${ph}0`]!, V[`${ph}1`]!), inv(tx));
    vFar[ph] = abs(sub(V[`${ph}${far}`]!, V[`n${far}`]!));
    psup += mul(sub(V[`${ph}0`]!, V.n0!), conj(iPh[ph])).re;
  }
  for (let k = 1; k <= far; k++) {
    const zpk = k === 1 ? tx : zp, znk = k === 1 ? cx(RN_TX, 0) : (neutralOpen && k === 2 ? cx(1e9, 0) : zn);
    for (const ph of PHASES) { const i = abs(mul(sub(V[`${ph}${k - 1}`]!, V[`${ph}${k}`]!), inv(zpk))); loss += i * i * zpk.re; }
    const i = abs(mul(sub(V[`n${k}`]!, V[`n${k - 1}`]!), inv(znk))); loss += i * i * znk.re;
  }
  const vLevels = { a: [] as number[], b: [] as number[], c: [] as number[] };
  for (let k = 0; k <= far; k++) for (const ph of PHASES) vLevels[ph].push(abs(sub(V[`${ph}${k}`]!, V[`n${k}`]!)));
  const iN = abs(r.iN), ip = { a: abs(iPh.a), b: abs(iPh.b), c: abs(iPh.c) }, iMax = Math.max(ip.a, ip.b, ip.c);
  return {
    iN, iPhase: ip, iMax, iNpct: iMax > 0 ? (100 * iN) / iMax : 0, vFar,
    vDevPct: (100 * Math.max(...PHASES.map((p) => Math.abs(vFar[p] - V_PH)))) / V_PH, lossPct: psup > 0 ? (100 * loss) / psup : 0, pSupplyW: psup, shiftFarV: abs(sub(V[`n${far}`]!, V.n0!)), vLevels, iPh, iNc: r.iN,
  };
}
function inv(z: Complex): Complex { const d = z.re * z.re + z.im * z.im; return cx(z.re / d, -z.im / d); }

/** Neutral conductor of a size: its ampacity (A). */
export const neutralRatingA = (mm2: number): number => NEUTRAL[mm2]?.ampacityA ?? 0;
