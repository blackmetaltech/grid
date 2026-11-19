// Asset ageing. Weibull hazard lambda(t) = (beta/eta)(t/eta)^(beta-1); expected failures over [t, t+dt] = H(t+dt) - H(t), H(t) = (t/eta)^beta.
import { dmath } from '@core/numerics';
import { HI_LIFE_FACTOR, TX_NORMAL_LIFE_H, WEIBULL } from './data';
import type { Asset, AssetClass, CareerState } from './state';

export const weibullHazard = (t: number, beta: number, eta: number): number => (t <= 0 ? 0 : (beta / eta) * dmath.pow(t / eta, beta - 1));
export const weibullCumHazard = (t: number, beta: number, eta: number): number => (t <= 0 ? 0 : dmath.pow(t / eta, beta));
/** Expected number of failures of one asset between age t and t + dt (years). */
export const expectedFailures = (t: number, dt: number, beta: number, eta: number): number => weibullCumHazard(t + dt, beta, eta) - weibullCumHazard(t, beta, eta);
/** Probability of at least one failure over the interval. */
export const failureProb = (t: number, dt: number, beta: number, eta: number): number => 1 - dmath.exp(-expectedFailures(t, dt, beta, eta));

export const calendarAge = (a: Asset, t: number): number => Math.max(0, (t - a.installQ) / 4);
/** Effective age: calendar age times the hidden condition multiplier, plus thermal / overload extra years. */
export const effectiveAge = (a: Asset, t: number): number => calendarAge(a, t) * a.wear + a.extraYears;
export const healthFromAge = (cls: AssetClass, tEff: number): number => Math.max(1, Math.min(10, 10 - (9 * tEff) / (HI_LIFE_FACTOR.value * WEIBULL[cls].eta)));
/** True health index 1-10 (10 = new). */
export const trueHealth = (a: Asset, t: number): number => healthFromAge(a.cls, effectiveAge(a, t));
/** What the player sees: the inspected value if it is still current, otherwise an estimate from calendar age alone (wear unknown). */
export const shownHealth = (a: Asset, t: number): { health: number; inspected: boolean } => {
  if (a.known && a.known.q >= t - 12) return { health: a.known.health, inspected: true };
  return { health: healthFromAge(a.cls, calendarAge(a, t) + a.extraYears), inspected: false };
};
/** Mean annual wear hazard of the asset over the next quarter (failures / yr), patched faults raise it by 30 % each (max x4). */
export const wearRate = (a: Asset, t: number): number => {
  const w = WEIBULL[a.cls], te = Math.min(effectiveAge(a, t), 1.4 * w.eta); // hazard growth is capped at 1.4 eta
  return (expectedFailures(te, 0.25, w.beta, w.eta) / 0.25) * Math.min(3, 1 + 0.3 * a.wearFaults);
};
export const avgHealth = (s: CareerState): number => (s.assets.length ? s.assets.reduce((x, a) => x + trueHealth(a, s.t), 0) / s.assets.length : 10);
export const worstHealth = (s: CareerState): number => s.assets.reduce((m, a) => Math.min(m, trueHealth(a, s.t)), 10);
/** Extra effective years a transformer ages from a thermal loss of life (hours of normal life consumed). */
export const thermalYearsFromLoL = (lossOfLifeH: number): number => (lossOfLifeH / TX_NORMAL_LIFE_H.value) * WEIBULL.tx.eta;
