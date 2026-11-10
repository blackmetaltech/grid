// Economic dispatch by lambda-iteration (DESIGN 3.11, PS-20/21/22). Bisection on lambda (currency/MWh).
import { incrementalCost, cost } from './cost';

/** One online unit: quadratic cost, limits (MW), optional ramp window (MW/min) around the previous output. */
export interface EdUnit {
  a: number; b: number; c: number;
  pMin: number; pMax: number;
  pPrev?: number;
  rampMWperMin?: number;
}

export interface EdResult {
  feasible: boolean;
  /** Machine code: '' | 'ed.shortfall' | 'ed.surplus'. */
  code: string;
  lambda: number;
  p: number[];
  totalMW: number;
  /** Demand that could not be met (MW), 0 if feasible. */
  shortfallMW: number;
  /** Generation that cannot be backed down below demand (MW), 0 if feasible. */
  surplusMW: number;
  cost: number;
  iterations: number;
  binding: Array<'min' | 'max' | 'free'>;
}

const BLOCK_MIN = 15;

/** Effective bounds [P_min, P_max] intersected with [P_prev -/+ ramp x 15 min]; nearest point if the window misses the limits. */
export function unitBounds(u: EdUnit): [number, number] {
  let lo = u.pMin, hi = u.pMax;
  if (u.pPrev !== undefined && u.rampMWperMin !== undefined) {
    const d = u.rampMWperMin * BLOCK_MIN;
    const wl = u.pPrev - d, wh = u.pPrev + d;
    const nlo = Math.max(lo, wl), nhi = Math.min(hi, wh);
    if (nlo <= nhi) { lo = nlo; hi = nhi; }
    else { const pt = wh < lo ? lo : hi; lo = pt; hi = pt; }
  }
  return [lo, hi];
}

function pAt(u: EdUnit, lam: number, pf: number, lo: number, hi: number): number {
  const ic = lam / pf;
  if (u.c > 0) return Math.min(hi, Math.max(lo, (ic - u.b) / (2 * u.c)));
  return ic > u.b ? hi : ic < u.b ? lo : (lo + hi) / 2;
}

/** Core solver: minimise sum C_i subject to sum P_i = D, with IC_i x PF_i = lambda (PF = 1 is lossless). MW, currency/MWh. */
export function economicDispatch(units: EdUnit[], demandMW: number, penalty?: number[]): EdResult {
  const n = units.length;
  const lo: number[] = [], hi: number[] = [];
  let sLo = 0, sHi = 0;
  for (const u of units) { const [l, h] = unitBounds(u); lo.push(l); hi.push(h); sLo += l; sHi += h; }
  const pf = units.map((_, i) => (penalty?.[i] && penalty[i]! > 0 ? penalty[i]! : 1));
  const finish = (p: number[], lambda: number, iterations: number, code: string): EdResult => {
    const total = p.reduce((s, x) => s + x, 0);
    let c = 0;
    const binding = p.map((x, i): 'min' | 'max' | 'free' => (x <= lo[i]! + 1e-9 ? 'min' : x >= hi[i]! - 1e-9 ? 'max' : 'free'));
    units.forEach((u, i) => { c += cost(u, p[i]!); });
    return {
      feasible: code === '', code, lambda, p, totalMW: total,
      shortfallMW: code === 'ed.shortfall' ? demandMW - total : 0,
      surplusMW: code === 'ed.surplus' ? total - demandMW : 0,
      cost: c, iterations, binding,
    };
  };
  if (n === 0) return finish([], 0, 0, demandMW > 1e-9 ? 'ed.shortfall' : '');
  if (demandMW > sHi + 1e-9) {
    let lam = -Infinity; units.forEach((u, i) => { lam = Math.max(lam, incrementalCost(u, hi[i]!) * pf[i]!); });
    return finish(hi.slice(), lam, 0, 'ed.shortfall');
  }
  if (demandMW < sLo - 1e-9) {
    let lam = Infinity; units.forEach((u, i) => { lam = Math.min(lam, incrementalCost(u, lo[i]!) * pf[i]!); });
    return finish(lo.slice(), lam, 0, 'ed.surplus');
  }
  const total = (lam: number): number => { let s = 0; for (let i = 0; i < n; i++) s += pAt(units[i]!, lam, pf[i]!, lo[i]!, hi[i]!); return s; };
  let lamLo = Infinity, lamHi = -Infinity;
  units.forEach((u, i) => {
    lamLo = Math.min(lamLo, incrementalCost(u, lo[i]!) * pf[i]!);
    lamHi = Math.max(lamHi, incrementalCost(u, hi[i]!) * pf[i]!);
  });
  lamLo -= 1; lamHi += 1;
  let it = 0;
  for (; it < 60; it++) {
    const mid = 0.5 * (lamLo + lamHi);
    const s = total(mid);
    if (s < demandMW) lamLo = mid; else lamHi = mid;
    if (Math.abs(s - demandMW) < 1e-6) break;
  }
  // Exact balance: interpolate between the bracketing dispatches (handles flat/linear-cost units sharing the margin).
  const pL: number[] = [], pH: number[] = [];
  let sL = 0, sH = 0;
  for (let i = 0; i < n; i++) {
    const l = pAt(units[i]!, lamLo, pf[i]!, lo[i]!, hi[i]!), h = pAt(units[i]!, lamHi, pf[i]!, lo[i]!, hi[i]!);
    pL.push(l); pH.push(h); sL += l; sH += h;
  }
  const t = sH - sL > 1e-15 ? Math.min(1, Math.max(0, (demandMW - sL) / (sH - sL))) : 1;
  const p = pL.map((l, i) => l + t * (pH[i]! - l));
  return finish(p, lamLo + t * (lamHi - lamLo), it + 1, '');
}

/** Loss model: P_L(P) in MW and sensitivities dP_L/dP_i. */
export interface LossModel { (p: number[]): { lossMW: number; sens: number[] } }

/** B-coefficient loss model P_L = sum_ij P_i B_ij P_j (B in 1/MW, full symmetric matrix), dP_L/dP_i = 2 sum_j B_ij P_j. */
export function bCoefficientLosses(B: number[][]): LossModel {
  return (p) => {
    let loss = 0; const sens: number[] = [];
    for (let i = 0; i < p.length; i++) {
      let s = 0;
      for (let j = 0; j < p.length; j++) { s += B[i]![j]! * p[j]!; loss += p[i]! * B[i]![j]! * p[j]!; }
      sens.push(2 * s);
    }
    return { lossMW: loss, sens };
  };
}

export interface EdLossResult extends EdResult {
  lossMW: number;
  /** Penalty factors PF_i = 1 / (1 - dP_L/dP_i) used in the last pass. */
  penaltyFactors: number[];
  outerIterations: number;
}

/**
 * Penalty-factor ED: sum P_i = D + P_L, IC_i x PF_i = lambda, PF_i = 1/(1 - dP_L/dP_i); `outer` passes (default 3),
 * each re-evaluating losses and sensitivities from the model (a load flow later) at the previous dispatch. MW, currency/MWh.
 */
export function edPenaltyFactors(units: EdUnit[], demandMW: number, model: LossModel, outer = 3): EdLossResult {
  let res = economicDispatch(units, demandMW);
  let pf = units.map(() => 1);
  let loss = 0;
  for (let k = 0; k < outer; k++) {
    const m = model(res.p);
    loss = m.lossMW;
    pf = m.sens.map((s) => 1 / Math.max(1 - s, 0.05));
    res = economicDispatch(units, demandMW + loss, pf);
  }
  const m = model(res.p);
  return { ...res, lossMW: m.lossMW, penaltyFactors: pf, outerIterations: outer };
}

/** ED with B-coefficient transmission losses (PS-22): coordination dC_i/dP_i = lambda (1 - dP_L/dP_i). */
export function edWithLosses(units: EdUnit[], demandMW: number, B: number[][], outer = 3): EdLossResult {
  return edPenaltyFactors(units, demandMW, bCoefficientLosses(B), outer);
}
