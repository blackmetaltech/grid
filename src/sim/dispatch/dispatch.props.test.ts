import { describe, it, expect } from 'vitest';
import { Rng } from '@core/kit';
import { economicDispatch, type EdUnit } from './ed';
import { incrementalCost } from './cost';
import { storageStep, bess, pumpedHydro, oneWayEfficiency } from './storage';

const N = Number(process.env.GRID_FUZZ_N ?? 2000);

describe('P18 dispatch KKT', () => {
  it(`${N} random unit sets`, () => {
    const seed = 18001; const r = new Rng(seed);
    for (let k = 0; k < N; k++) {
      const n = r.int(2, 8);
      const us: EdUnit[] = [];
      for (let i = 0; i < n; i++) {
        const pMax = r.range(50, 600), pMin = pMax * r.range(0.1, 0.6);
        us.push({ a: r.range(0, 500), b: r.range(5, 40), c: r.range(0.001, 0.05), pMin, pMax });
      }
      const lo = us.reduce((s, u) => s + u.pMin, 0), hi = us.reduce((s, u) => s + u.pMax, 0);
      const D = lo + r.range(0.001, 0.999) * (hi - lo);
      const res = economicDispatch(us, D);
      const msg = `seed ${seed} case ${k}`;
      expect(res.feasible, msg).toBe(true);
      expect(Math.abs(res.p.reduce((s, x) => s + x, 0) - D), msg).toBeLessThan(1e-6);
      us.forEach((u, i) => {
        const p = res.p[i]!, ic = incrementalCost(u, p);
        expect(p, msg).toBeGreaterThanOrEqual(u.pMin - 1e-9); expect(p, msg).toBeLessThanOrEqual(u.pMax + 1e-9);
        if (p > u.pMin + 1e-6 && p < u.pMax - 1e-6) expect(Math.abs(ic - res.lambda), msg).toBeLessThan(1e-6);
        else if (p >= u.pMax - 1e-6) expect(ic, msg).toBeLessThanOrEqual(res.lambda + 1e-6);
        else expect(ic, msg).toBeGreaterThanOrEqual(res.lambda - 1e-6);
      });
    }
  });
});

describe('P15 BESS energy', () => {
  it(`${N} random schedules (BESS and pumped hydro)`, () => {
    const seed = 15001; const r = new Rng(seed);
    for (let k = 0; k < N; k++) {
      const E = r.range(20, 800);
      const sp = k % 2 ? bess(E, r.range(5, 200), r.range(0.7, 0.95)) : pumpedHydro(E, r.range(5, 200), r.range(5, 200), 0.75);
      const eta = oneWayEfficiency(sp.etaRt);
      let soc = r.range(0.1, 0.9); const soc0 = soc;
      let eCh = 0, eDis = 0;
      for (let t = 0; t < 96; t++) {
        const s = storageStep(sp, soc, r.chance(0.5) ? r.range(0, 250) : 0, r.chance(0.5) ? r.range(0, 250) : 0, 0.25);
        eCh += s.pChMW * 0.25; eDis += s.pDisMW * 0.25; soc = s.soc;
        expect(soc, `seed ${seed} case ${k}`).toBeGreaterThanOrEqual(0.1 - 1e-9);
        expect(soc, `seed ${seed} case ${k}`).toBeLessThanOrEqual(0.9 + 1e-9);
      }
      expect(Math.abs(eta * eCh - eDis / eta - (soc - soc0) * E), `seed ${seed} case ${k}`).toBeLessThan(1e-6 * (1 + E));
    }
  });
});
