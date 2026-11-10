import { describe, expect, it } from 'vitest';
import { cx, abs, div, mul } from '@core/numerics';
import { Rng } from '@core/kit';
import { expectOracle, oracleValue } from '../../oracles/expected';
import {
  IDMT_CURVES, apparentZ, distanceTrip, distanceZones, gradingTms, idmtTime, mhoPicksUp, overVoltageDelay, overcurrentTime, underVoltageDelay, type IdmtCurve,
} from './relays';

const N = Number(process.env.GRID_FUZZ_N ?? 2000);
const CURVES: IdmtCurve[] = ['SI', 'VI', 'EI', 'LTI'];

describe('IDMT overcurrent', () => {
  it('G-06 SI, TMS 0.1, I/Is = 10', () => expectOracle('G-06', 't_s', idmtTime('SI', 0.1, 10, 1)));
  it('G-07 grading: TMS2 from CTI 0.3 s and the VI / EI times', () => {
    const tDown = oracleValue('G-06', 't_s');
    expectOracle('G-07', 'TMS2', gradingTms('SI', tDown, 0.3, 4000, 600));
    expectOracle('G-07', 't_VI_s', idmtTime('VI', 0.1, 10, 1));
    expectOracle('G-07', 't_EI_s', idmtTime('EI', 0.1, 10, 1));
  });
  it('graded relay trips CTI after the downstream one', () => {
    const tms = gradingTms('SI', 0.2971, 0.3, 4000, 600);
    expect(idmtTime('SI', tms, 4000, 600)).toBeCloseTo(0.5971, 9);
  });
  it('no operation at or below 1.1 Is; instantaneous element', () => {
    expect(idmtTime('SI', 0.1, 1.1, 1)).toBe(Infinity);
    expect(idmtTime('SI', 0.1, 1.1001, 1)).toBeGreaterThan(0);
    expect(Number.isFinite(idmtTime('SI', 0.1, 1.1001, 1))).toBe(true);
    expect(overcurrentTime({ curve: 'SI', tms: 1, is: 100, inst: { pickup: 1000 } }, 1500)).toBe(0.02);
    expect(overcurrentTime({ curve: 'SI', tms: 1, is: 100 }, 1500)).toBeGreaterThan(0.02);
    expect(idmtTime('SI', 0.1, 5, 0)).toBe(Infinity);
  });
  it(`P20 monotonicity: more current is faster, more TMS is slower, nothing below 1.1 Is (${N} random settings)`, () => {
    const seed = 0x20, rng = new Rng(seed);
    for (let c = 0; c < N; c++) {
      const curve = rng.pick(CURVES), is = rng.range(10, 1000), tms = rng.range(0.025, 1.5);
      const i1 = is * rng.range(1.11, 30), i2 = i1 * rng.range(1.001, 3), tms2 = tms * rng.range(1.001, 3);
      const tag = `seed ${seed} case ${c} ${curve}`;
      expect(idmtTime(curve, tms, i2, is), tag).toBeLessThan(idmtTime(curve, tms, i1, is));
      expect(idmtTime(curve, tms2, i1, is), tag).toBeGreaterThan(idmtTime(curve, tms, i1, is));
      expect(idmtTime(curve, tms, is * rng.range(0, 1.1), is), tag).toBe(Infinity);
      expect(IDMT_CURVES[curve].k).toBeGreaterThan(0);
    }
  });
});

describe('distance and voltage relays', () => {
  const zl = cx(0.02, 0.2);
  it('zones and delays', () => {
    const z = distanceZones(zl, cx(0.01, 0.1));
    expect(z.map((q) => q.delayS)).toEqual([0.03, 0.35, 1.0]);
    expect(z[0]!.reach.im).toBeCloseTo(0.16, 12);
    expect(z[2]!.reach.im).toBeCloseTo(0.32, 12);
  });
  it('fault at 50 % is zone 1, at 100 % zone 2, beyond the remote bus zone 3, behind or load is none', () => {
    const adj = cx(0.02, 0.2);
    expect(distanceTrip(mul(zl, cx(0.5, 0)), zl, adj)?.zone).toBe(1);
    expect(distanceTrip(zl, zl, adj)?.zone).toBe(2);
    expect(distanceTrip(mul(zl, cx(1.4, 0)), zl, adj)?.zone).toBe(3);
    expect(distanceTrip(mul(zl, cx(-0.3, 0)), zl, adj)).toBeNull();
    expect(distanceTrip(cx(1.0, 0.2), zl, adj)).toBeNull(); // heavy-load impedance far outside
    expect(mhoPicksUp(apparentZ(cx(1, 0), cx(0, 0)), zl)).toBe(false);
  });
  it('apparent impedance is V / I', () => {
    const v = cx(0.9, 0.1), i = cx(2, -1);
    const z = apparentZ(v, i), back = mul(z, i);
    expect(abs(div(back, v)) ).toBeCloseTo(1, 12);
  });
  it('over- and under-voltage stages', () => {
    expect(overVoltageDelay(1.05)).toBe(Infinity);
    expect(overVoltageDelay(1.12)).toBe(5);
    expect(overVoltageDelay(1.45)).toBe(0.1);
    expect(underVoltageDelay(0.8)).toBe(2);
    expect(underVoltageDelay(0.9)).toBe(Infinity);
    expect(underVoltageDelay(0)).toBe(Infinity);
  });
});
