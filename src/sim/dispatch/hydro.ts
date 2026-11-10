// Energy-limited hydro (DESIGN 3.11, S13): water value nu solved per day by bisection so daily energy = budget.

export interface HydroUnit { pMin: number; pMax: number }

export interface HydroDay {
  /** Water value (currency/MWh). */
  nu: number;
  p: number[];
  energyMWh: number;
  /** Machine code: '' | 'hydro.budget_above_max' | 'hydro.budget_below_min'. */
  code: string;
}

/**
 * Hydro dispatch for a day. `thermalLambda(block, netDemandMW)` is the system marginal cost of the rest of the system when
 * it serves net demand (nondecreasing). In each block hydro runs where that marginal cost exceeds nu:
 * P_t(nu) solves lambda_t(D_t - P) = nu within [Pmin, Pmax]; nu is bisected so sum P_t x dt = budget (MWh).
 */
export function solveWaterValue(
  unit: HydroUnit, demandMW: number[], budgetMWh: number,
  thermalLambda: (block: number, netDemandMW: number) => number, dtH = 0.25, nuHi = 1e4,
): HydroDay {
  const T = demandMW.length;
  const dispatch = (nu: number): number[] => demandMW.map((d, t) => {
    if (thermalLambda(t, d - unit.pMax) >= nu) return unit.pMax;
    if (thermalLambda(t, d - unit.pMin) <= nu) return unit.pMin;
    let lo = unit.pMin, hi = unit.pMax; // g(P) = lambda(D - P) is nonincreasing in P
    for (let i = 0; i < 60 && hi - lo > 1e-9; i++) { const m = 0.5 * (lo + hi); if (thermalLambda(t, d - m) > nu) lo = m; else hi = m; }
    return 0.5 * (lo + hi);
  });
  const energy = (p: number[]): number => p.reduce((s, x) => s + x, 0) * dtH;
  const eMax = unit.pMax * T * dtH, eMin = unit.pMin * T * dtH;
  if (budgetMWh >= eMax - 1e-9) return { nu: 0, p: new Array(T).fill(unit.pMax), energyMWh: eMax, code: budgetMWh > eMax + 1e-9 ? 'hydro.budget_above_max' : '' };
  if (budgetMWh <= eMin + 1e-9) return { nu: nuHi, p: new Array(T).fill(unit.pMin), energyMWh: eMin, code: budgetMWh < eMin - 1e-9 ? 'hydro.budget_below_min' : '' };
  let lo = 0, hi = nuHi; // energy(nu) is nonincreasing in nu
  let p = dispatch(0.5 * (lo + hi));
  for (let i = 0; i < 60; i++) {
    const nu = 0.5 * (lo + hi);
    p = dispatch(nu);
    const e = energy(p);
    if (Math.abs(e - budgetMWh) < 1e-6) return { nu, p, energyMWh: e, code: '' };
    if (e > budgetMWh) lo = nu; else hi = nu;
  }
  const nu = 0.5 * (lo + hi);
  p = dispatch(nu);
  return { nu, p, energyMWh: energy(p), code: '' };
}
