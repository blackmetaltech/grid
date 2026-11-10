// Wind (DESIGN 3.10; S35). Pure; seeded AR(1) speeds use a caller-supplied core Rng.
import type { Rng } from '@core/kit';

export const V_CUT_IN = 3, V_RATED = 12, V_CUT_OUT = 25;

/** P = P_r (v^3 - v_ci^3)/(v_r^3 - v_ci^3) for v_ci <= v < v_r; P_r for v_r <= v < v_co; else 0. MW, m/s. */
export function windPower(pRatedMW: number, v: number, vCi = V_CUT_IN, vR = V_RATED, vCo = V_CUT_OUT): number {
  if (!(v >= vCi) || v >= vCo) return 0;
  if (v >= vR) return pRatedMW;
  const v3 = v * v * v, ci3 = vCi * vCi * vCi, r3 = vR * vR * vR;
  return (pRatedMW * (v3 - ci3)) / (r3 - ci3);
}

/**
 * Seeded AR(1) wind speed per block: v_t = mean_t + x_t, x_t = phi x_{t-1} + sigma sqrt(1-phi^2) eps (stationary sd = sigma),
 * floored at 0. x_0 drawn from the stationary distribution. m/s. phi default 0.97 per 15 min.
 */
export function windSpeedSeries(rng: Rng, meanProfile: ReadonlyArray<number> | number, blocks = 96, sigma = 1.5, phi = 0.97): number[] {
  const out: number[] = [];
  const innov = sigma * Math.sqrt(1 - phi * phi);
  let x = rng.normal(0, sigma);
  for (let t = 0; t < blocks; t++) {
    if (t > 0) x = phi * x + rng.normal(0, innov);
    const m = typeof meanProfile === 'number' ? meanProfile : meanProfile[t % meanProfile.length]!;
    out.push(Math.max(0, m + x));
  }
  return out;
}
