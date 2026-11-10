// Unit cost curves (DESIGN 3.11, S15). Currency per hour; MW; MJ/kWh heat rates; $/GJ fuel prices.

/** Quadratic cost curve C(P) = a + b P + c P^2 (currency/h, P in MW). */
export interface CostCurve { a: number; b: number; c: number }

/** C(P) = a + b P + c P^2 (currency/h). */
export function cost(cv: CostCurve, pMW: number): number { return cv.a + cv.b * pMW + cv.c * pMW * pMW; }

/** Incremental cost dC/dP = b + 2 c P (currency/MWh). */
export function incrementalCost(cv: CostCurve, pMW: number): number { return cv.b + 2 * cv.c * pMW; }

/** Average cost C(P)/P (currency/MWh); Infinity at P <= 0. */
export function averageCost(cv: CostCurve, pMW: number): number { return pMW > 0 ? cost(cv, pMW) / pMW : Infinity; }

/** Fuel cost per MWh = heat rate (MJ/kWh == GJ/MWh) x fuel price (currency/GJ). G-16: 10.3 x 2.60 = 26.78. */
export function marginalFuelCost(heatRateMJperkWh: number, fuelPricePerGJ: number): number { return heatRateMJperkWh * fuelPricePerGJ; }

/**
 * Fit C(P) = a + bP + cP^2 to a unit (S15).
 *   b = heatRateFullLoad x fuelPrice                       (full-load fuel cost per MWh)
 *   Incremental-cost condition: IC(Pmax) = 1.10 IC(Pmin):  b + 2c Pmax = 1.1 (b + 2c Pmin)
 *        => c = 0.05 b / (Pmax - 1.1 Pmin)
 *   Average-heat-rate condition: avg(Pmin) = 1.08 avg(Pmax), avg(P) = a/P + b + cP:
 *        a/Pmin + b + c Pmin = 1.08 (a/Pmax + b + c Pmax)
 *        => a (1/Pmin - 1.08/Pmax) = 0.08 b + c (1.08 Pmax - Pmin)
 * Degenerate units (Pmin <= 0 or Pmax <= 1.1 Pmin, e.g. hydro, renewables) get the linear curve a = c = 0.
 */
export function fitCostCurve(heatRateFullLoad: number, fuelPrice: number, pMin: number, pMax: number): CostCurve {
  const b = heatRateFullLoad * fuelPrice;
  if (!(pMin > 0) || !(pMax > 1.1 * pMin)) return { a: 0, b, c: 0 };
  const c = (0.05 * b) / (pMax - 1.1 * pMin);
  const a = (0.08 * b + c * (1.08 * pMax - pMin)) / (1 / pMin - 1.08 / pMax);
  return { a, b, c };
}

/** Block cost = C(P) x 0.25 h + start-up cost + VOM x P x 0.25 (currency per 15-min block). */
export function blockCost(cv: CostCurve, pMW: number, vomPerMWh: number, startupCost = 0, committed = true): number {
  const run = committed ? cost(cv, pMW) * 0.25 + vomPerMWh * pMW * 0.25 : 0;
  return run + startupCost;
}
