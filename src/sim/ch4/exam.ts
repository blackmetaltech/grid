// L13: the cylindrical-rotor generator on paper (oracles PS-27, PS-28): E = V + jXs I, P = E V sin(delta)/Xs, and the night task of setting E for Q.
import { abs, add, cx, mul, polar, dmath } from '@core/numerics';
import { NIGHT, RATED, XS } from './data';

export interface RatedAnswers { E: number; deltaDeg: number; pmax: number }
const deg = (r: number): number => (r * 180) / Math.PI;
/** E, delta and P_max of the rated case: V = 1, I = 1 at pf 0.8 lagging, Xs = 1.2 pu. */
export function ratedAnswers(): RatedAnswers {
  const i = polar(RATED.i, -dmath.acos(RATED.pf));
  const e = add(cx(RATED.vt), mul(cx(0, XS), i));
  return { E: abs(e), deltaDeg: deg(dmath.atan2(e.im, e.re)), pmax: abs(e) / XS };
}
/** Night operation at excitation E (pu): P is held by the governor, so delta = asin(P Xs/(E V)) and Q = (E V cos delta - V^2)/Xs. null: no steady state (E too low for P). */
export function nightAt(E: number): { deltaDeg: number; q: number } | null {
  const s = (NIGHT.p * XS) / E;
  if (!(s <= 1) || !(E > 0)) return null;
  const d = dmath.asin(s);
  return { deltaDeg: deg(d), q: (E * dmath.cos(d) - 1) / XS };
}
/** The excitation that makes the generator absorb `q` at the night P (the answer to the task). */
export function nightExcitationFor(q: number): number {
  const i = cx(NIGHT.p, -q);   // I = (P - jQ)/V* with V = 1
  return abs(add(cx(1), mul(cx(0, XS), i)));
}
