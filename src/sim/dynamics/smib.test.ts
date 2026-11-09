import { describe, it, expect } from 'vitest';
import { cx, type Complex } from '@core/numerics';
import { Rng } from '@core/kit';
import { expectOracle, oracleValue } from '../../oracles/expected';
import {
  runSmib, equalAreaCritical, criticalClearingTimeRk4, pDeltaCurves, equalAreas, kronToTwoNode, xEqFromKron, pmaxFromX, delta0Of, deltaUOf, type SmibInput,
} from './smib';

const ps24 = (tClearS: number): SmibInput => ({ H: 5, f0: 60, Pm: 0.8, PmaxPre: 1.8, PmaxDuring: 0, PmaxPost: 1.8, tClearS });
const deg = (r: number) => (r * 180) / Math.PI;

describe('SMIB rotor angle', () => {
  it('PS-24 equal-area: delta0, delta_cr, t_cr closed form', () => {
    const ea = equalAreaCritical(ps24(0.1));
    expectOracle('PS-24', 'delta0_deg', deg(ea.delta0));
    expectOracle('PS-24', 'delta_cr_deg', deg(ea.deltaCr as number));
    expectOracle('PS-24', 't_cr_s', ea.tCrS as number);
    expect(Math.abs((ea.tCrS as number) - oracleValue('PS-24', 't_cr_s'))).toBeLessThan(1e-9);
  });
  it('PS-24 RK4 at 1 ms agrees with the closed form (within 10 us) and the oracle', () => {
    const t = criticalClearingTimeRk4(ps24(0.1)) as number;
    expectOracle('PS-24', 't_cr_rk4_1ms_s', t);
    expect(Math.abs(t - oracleValue('PS-24', 't_cr_s'))).toBeLessThan(1e-5);
  });
  it('clearing just before t_cr is stable, just after loses synchronism', () => {
    const tcr = oracleValue('PS-24', 't_cr_s');
    const a = runSmib(ps24(tcr - 0.005));
    const b = runSmib(ps24(tcr + 0.005));
    expect(a.lossOfSync).toBe(false); expect(a.firstSwingStable).toBe(true);
    expect(a.deltaMax).toBeLessThan(a.deltaU);
    expect(b.lossOfSync).toBe(true); expect(b.tLossS).toBeGreaterThan(tcr);
    expect(b.firstSwingStable).toBe(false);
  });
  it('stable swing: A1 = A2 at the first swing peak (energy)', () => {
    const inp = ps24(0.15);
    const r = runSmib(inp);
    const ar = equalAreas(inp, r.deltaAtClear, r.deltaMax);
    expect(ar.stable).toBe(true);
    expect(Math.abs((ar.deltaMax as number) - r.deltaMax)).toBeLessThan(1e-3);
    expect(Math.abs(ar.a2Now - ar.a1)).toBeLessThan(2e-3);
  });
  it('areas drawer data and curves', () => {
    const c = pDeltaCurves(ps24(0.1), 181);
    expect(c.deltaRad).toHaveLength(181);
    expect(Math.max(...c.pePre)).toBeCloseTo(1.8, 6);
    expect(Math.max(...c.peDuring)).toBe(0);
    const ea = equalAreaCritical(ps24(0.1));
    const ar = equalAreas(ps24(0.1), ea.deltaCr as number, ea.deltaU);
    expect(Math.abs(ar.a1 - ar.a2Available)).toBeLessThan(1e-12); // critical: areas equal
  });
  it('fault with partial transfer (Pmax_during > 0): t_cr by integration matches the RK4 bisection', () => {
    const inp: SmibInput = { H: 4, f0: 50, Pm: 0.9, PmaxPre: 2.0, PmaxDuring: 0.6, PmaxPost: 1.5, tClearS: 0.1 };
    const ea = equalAreaCritical(inp);
    const t = criticalClearingTimeRk4(inp) as number;
    expect(Math.abs((ea.tCrS as number) - t)).toBeLessThan(2e-4);
    expect(deltaUOf(0.9, 1.5)).toBeCloseTo(Math.PI - Math.asin(0.6), 12);
    expect(delta0Of(0.9, 2.0)).toBeCloseTo(Math.asin(0.45), 12);
  });
  it('no operating point gives a teaching error, not a crash', () => {
    const r = runSmib({ ...ps24(0.1), Pm: 2 });
    expect(r.ok).toBe(false); expect(r.error).toMatch(/P_m/);
    const e = equalAreaCritical({ ...ps24(0.1), PmaxPost: 0.5 });
    expect(e.ok).toBe(false);
  });
  it('3 s run is deterministic and trace is finite', () => {
    const a = runSmib(ps24(0.2)), b = runSmib(ps24(0.2));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.tEndS).toBeGreaterThan(2.9);
    for (const v of a.trace.deltaRad) expect(Number.isFinite(v)).toBe(true);
  });
  it('pmaxFromX', () => {
    expect(pmaxFromX(1.1, 1, 0.5)).toBeCloseTo(2.2, 12); expect(pmaxFromX(1.1, 1, Infinity)).toBe(0);
  });
});

describe('Kron reduction (complex LU)', () => {
  const y = (x: number): Complex => cx(0, -1 / x); // admittance of series reactance x: 1/(jx)
  it('series chain 0 - 2 - 1 reduces to X_eq = X1 + X2', () => {
    const y1 = y(0.2), y2 = y(0.3);
    const neg = (c: Complex): Complex => cx(-c.re, -c.im);
    const Y = [
      [y1, cx(0, 0), neg(y1)],
      [cx(0, 0), y2, neg(y2)],
      [neg(y1), neg(y2), cx(y1.re + y2.re, y1.im + y2.im)],
    ];
    const r = kronToTwoNode(Y, [0, 1]);
    expect(r.ok).toBe(true);
    expect(xEqFromKron(r.Y)).toBeCloseTo(0.5, 12);
    expect(r.Y[0][1].re).toBeCloseTo(0, 12);
  });
  it('random lossless networks: reduced Y is symmetric with zero row sums when there are no shunts', () => {
    const rng = new Rng(777);
    for (let c = 0; c < 200; c++) {
      const n = rng.int(3, 7);
      const Y: Complex[][] = Array.from({ length: n }, () => Array.from({ length: n }, () => cx(0, 0)));
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        if (j === i + 1 || rng.chance(0.4)) {
          const b = cx(rng.range(0.02, 0.2), -rng.range(1, 10));
          Y[i][j] = cx(-b.re, -b.im); Y[j][i] = cx(-b.re, -b.im);
          Y[i][i] = cx(Y[i][i].re + b.re, Y[i][i].im + b.im); Y[j][j] = cx(Y[j][j].re + b.re, Y[j][j].im + b.im);
        }
      }
      const r = kronToTwoNode(Y, [0, n - 1]);
      expect(r.ok).toBe(true);
      expect(Math.abs(r.Y[0][1].re - r.Y[1][0].re)).toBeLessThan(1e-9);
      expect(Math.abs(r.Y[0][0].re + r.Y[0][1].re)).toBeLessThan(1e-9);
      expect(Math.abs(r.Y[0][0].im + r.Y[0][1].im)).toBeLessThan(1e-9);
    }
  });
  it('floating eliminated node -> ok:false with a message', () => {
    const Y = [[cx(1, 0), cx(0, 0), cx(0, 0)], [cx(0, 0), cx(1, 0), cx(0, 0)], [cx(0, 0), cx(0, 0), cx(0, 0)]];
    const r = kronToTwoNode(Y, [0, 1]);
    expect(r.ok).toBe(false); expect(r.error).toMatch(/floating/);
  });
});
