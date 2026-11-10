// L06 Exam Bridge: The Town Line, the physics (textbook mode, DESIGN 2.6 and oracles AC-15 / AC-16): one phase, two wires, a resistive line, ideal transformers,
// unity power factor. The line carries P at the line voltage V = ratio x the generator voltage: I = P / V, loss = I^2 R. Closed form, no solver.
import type { TownState } from '../../types';

export const TOWN = {
  pW: 800e3, rLoopOhm: 15, vGenV: 4000, lossMaxPct: 2, kmOneWay: 15, ohmPerKmPerWire: 0.5,
  ratios: [1, 2, 4, 5, 6, 7, 8, 10, 12, 15, 20] as readonly number[],
  kvas: [630, 1000, 1250, 1600] as readonly number[],
  defaultKva: 1000,
  /** The question of step 1: what does 800 kW lose at the generator's own 4 kV? (AC-15) */
  predictId: 'L06.loss4kv',
} as const;

export interface TownNumbers {
  vLineV: number; iA: number; lossW: number; lossKw: number; lossPct: number; deliveredKw: number;
  /** Voltage at the town's end of the line as a fraction of the sending end (= 1 - loss fraction for a resistive line at unity pf). */
  vTownPu: number;
  /** Step-up loading: power through it over its rating. 0 with no transformers. */
  loading: number; overload: boolean; cost: number; ok: boolean;
}

export const freshTown = (pricePerKva: number): TownState => ({ ratio: 1, kva: TOWN.defaultKva, pW: TOWN.pW, rLoopOhm: TOWN.rLoopOhm, vGenV: TOWN.vGenV, lossMaxPct: TOWN.lossMaxPct, pricePerKva });

/** Loss of `pW` over the loop at line voltage `vV`, W. */
export const lineLossW = (pW: number, rOhm: number, vV: number): number => (pW / vV) * (pW / vV) * rOhm;
/** The step 1 answer: the loss at the generator voltage with no transformers, kW (AC-15). */
export const predict4kvKw = (): number => lineLossW(TOWN.pW, TOWN.rLoopOhm, TOWN.vGenV) / 1000;
/** Price of the transformer pair: two units of `kva`, insulation (price) growing with the square root of the line kV relative to 11 kV (a game value). */
export const pairCost = (t: Pick<TownState, 'ratio' | 'kva' | 'vGenV' | 'pricePerKva'>): number => (t.ratio <= 1 ? 0 : 2 * t.kva * t.pricePerKva * Math.sqrt((t.vGenV * t.ratio) / 1000 / 11));

export function townNumbers(t: TownState): TownNumbers {
  const vLineV = t.vGenV * t.ratio, iA = t.pW / vLineV, lossW = iA * iA * t.rLoopOhm, lossPct = (100 * lossW) / t.pW;
  const loading = t.ratio > 1 ? t.pW / (t.kva * 1000) : 0, overload = loading > 1 + 1e-9;
  return { vLineV, iA, lossW, lossKw: lossW / 1000, lossPct, deliveredKw: (t.pW - lossW) / 1000, vTownPu: (vLineV - iA * t.rLoopOhm) / vLineV, loading, overload, cost: pairCost(t), ok: lossPct <= t.lossMaxPct && !overload };
}
