// Sag, tension and conductor temperature (DEPTH §4.2). SI units: w N/m, L m, H N.
import { brent, dmath } from '@core/numerics';
import type { ConductorMech } from './types';

const G = 9.80665;
export const weightNPerM = (c: ConductorMech): number => c.kgPerKm * 1e-3 * G;
/** Parabolic sag D = wL^2/(8H). */
export const sagParabola = (w: number, L: number, H: number): number => (w * L * L) / (8 * H);
/** Exact catenary sag (H/w)(cosh(wL/2H) - 1). */
export function sagCatenary(w: number, L: number, H: number): number {
  const a = (w * L) / (2 * H);
  return (H / w) * ((dmath.exp(a) + dmath.exp(-a)) / 2 - 1);
}

/** Horizontal tension H2 at t2 given H1 at t1 (parabolic state change, no wind/ice):
 *  H2^2 (H2 - K) = w^2 L^2 E A / 24,  K = H1 - w^2 L^2 E A/(24 H1^2) - alpha (t2 - t1) E A. Unique positive root (f(0) < 0, f increasing past max(K,0)). */
export function stateChange(c: ConductorMech, L: number, H1: number, t1: number, t2: number): number {
  const w = weightNPerM(c), EA = c.eGPa * 1e9 * c.areaMm2 * 1e-6;
  const rhs = (w * w * L * L * EA) / 24;
  const K = H1 - (rhs / (H1 * H1)) - c.alphaPerC * (t2 - t1) * EA;
  const f = (H: number): number => H * H * (H - K) - rhs;
  let hi = Math.max(K, 0) + 1;
  while (f(hi) <= 0) hi *= 2;
  return brent(f, 0, hi, { tol: 1e-10 }).x;
}

/** Conductor temperature from current: Tamb + (Tmax - Tamb)(I/Irated)^2. */
export const conductorTempC = (I: number, Irated: number, Tamb: number, Tmax: number): number => Tamb + (Tmax - Tamb) * (I / Irated) * (I / Irated);
