// IEC 60076-7 (2005) transformer top-oil and hot-spot temperature, exponential (step-response) solution, ONAN defaults from data.ts.
// Clause 7.2 (exponential equations), for a load step K (per unit of rated current) applied for time t:
//   top-oil rise      d_to(t) = d_to0 + [ d_tor ((1 + R K^2)/(1 + R))^x - d_to0 ] (1 - exp(-t / (k11 tau_o)))          (eq 6, 7)
//   hot-spot to oil   dH1(t) = dH1_0 + [ k21 Hgr K^y - dH1_0 ] (1 - exp(-t / (k22 tau_w)))                              (eq 8)
//                     dH2(t) = dH2_0 + [ (k21 - 1) Hgr K^y - dH2_0 ] (1 - exp(-t k22 / tau_o))                          (eq 9)
//   hot-spot temperature  theta_h = theta_a + d_to + dH1 - dH2                                                          (eq 10)
// Clause 8.2.2 relative ageing rate for thermally upgraded paper:  V = 2^((theta_h - 98) / 6)    (eq 12, 98 C reference)
// Loss of life over the cycle: L = sum V dt  (hours of normal life consumed).
// The exact step solution is used inside each 15 min step, so the result does not depend on a time step.
import { dmath } from '@core/numerics';
import { TX_ONAN, type TxThermalRow } from './data';

export interface TxState { dTopOil: number; dH1: number; dH2: number }
export interface TxStepOut { thetaTopOil: number; thetaHot: number; V: number }
export interface TxCycleResult {
  thetaHot: number[]; thetaTopOil: number[]; V: number[];
  peakHotC: number; peakIndex: number; lossOfLifeH: number; lossOfLifeDays: number; final: TxState; stepsOver: (limitC: number) => number;
}

const pw = (b: number, e: number): number => (b <= 0 ? 0 : dmath.pow(b, e));
export const ageingRate = (thetaHot: number, ref = 98): number => dmath.pow(2, (thetaHot - ref) / 6);

/** Steady-state rises at constant load K. */
export function steadyState(K: number, p: TxThermalRow = TX_ONAN): TxState {
  return { dTopOil: p.dThetaOilR * pw((1 + p.R * K * K) / (1 + p.R), p.x), dH1: p.k21 * p.hgr * pw(K, p.y), dH2: (p.k21 - 1) * p.hgr * pw(K, p.y) };
}

/** Advance the state by dtMin minutes at constant load K (exact exponential solution). */
export function stepTx(s: TxState, K: number, dtMin: number, p: TxThermalRow = TX_ONAN): TxState {
  const ss = steadyState(K, p);
  const e1 = 1 - dmath.exp(-dtMin / (p.k11 * p.tauOilMin));
  const e2 = 1 - dmath.exp(-dtMin / (p.k22 * p.tauWindMin));
  const e3 = 1 - dmath.exp((-dtMin * p.k22) / p.tauOilMin);
  return { dTopOil: s.dTopOil + (ss.dTopOil - s.dTopOil) * e1, dH1: s.dH1 + (ss.dH1 - s.dH1) * e2, dH2: s.dH2 + (ss.dH2 - s.dH2) * e3 };
}
export const hotSpot = (s: TxState, ambientC: number): number => ambientC + s.dTopOil + s.dH1 - s.dH2;

/**
 * Run a load cycle (K per step, step length stepMin, default 15). Ambient is a number or one value per step.
 * Starts from steady state at k0 (default the first K). Temperatures are reported at the END of each step; the ageing rate of a step is Simpson's rule
 * over the start, exact mid-step and end hot-spot temperatures.
 */
export function runCycle(K: number[], ambientC: number | number[], opts: { stepMin?: number; k0?: number; params?: TxThermalRow } = {}): TxCycleResult {
  const p = opts.params ?? TX_ONAN, dt = opts.stepMin ?? 15;
  let s = steadyState(opts.k0 ?? K[0]!, p);
  const amb = (i: number): number => (typeof ambientC === 'number' ? ambientC : ambientC[i]!);
  let prev = hotSpot(s, amb(0));
  const th: number[] = [], to: number[] = [], V: number[] = [];
  let loss = 0, peak = -Infinity, pi = 0;
  K.forEach((k, i) => {
    const s0 = s;
    s = stepTx(s, k, dt, p);
    const h = hotSpot(s, amb(i));
    th.push(h); to.push(amb(i) + s.dTopOil);
    // Simpson over the step: start, exact mid-step state (7.5 min), end
    const hm = hotSpot(stepTx(s0, k, dt / 2, p), amb(i));
    const v = (ageingRate(prev, p.hotSpotRefC) + 4 * ageingRate(hm, p.hotSpotRefC) + ageingRate(h, p.hotSpotRefC)) / 6;
    V.push(v); loss += (v * dt) / 60; prev = h;
    if (h > peak) { peak = h; pi = i; }
  });
  return { thetaHot: th, thetaTopOil: to, V, peakHotC: peak, peakIndex: pi, lossOfLifeH: loss, lossOfLifeDays: loss / 24, final: s, stepsOver: (lim) => th.filter((x) => x > lim).length };
}

/**
 * Largest constant K that keeps the hot-spot at or below limitC for durationH hours, starting from steady state at k0 (emergency rating).
 * Bisection on K in [0, kMax].
 */
export function emergencyK(k0: number, ambientC: number, limitC: number, durationH: number, p: TxThermalRow = TX_ONAN, kMax = 3): number {
  const n = dmath.round((durationH * 60) / 5);
  const peak = (k: number): number => { let s = steadyState(k0, p), m = -Infinity; for (let i = 0; i < n; i++) { s = stepTx(s, k, 5, p); m = Math.max(m, hotSpot(s, ambientC)); } return m; };
  let lo = 0, hi = kMax;
  for (let it = 0; it < 50; it++) { const mid = (lo + hi) / 2; if (peak(mid) <= limitC) lo = mid; else hi = mid; }
  return lo;
}
