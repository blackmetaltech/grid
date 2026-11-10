import { describe, it, expect } from 'vitest';
import { oracleValue, expectOracle } from '../../oracles/expected';
import { fitCostCurve, cost, incrementalCost, averageCost, marginalFuelCost, blockCost } from './cost';
import { economicDispatch, edWithLosses, edPenaltyFactors, bCoefficientLosses, type EdUnit } from './ed';
import { commit, priorityList, type CommitUnit } from './commitment';
import { solveWaterValue } from './hydro';
import { storageStep, thresholdRequest, bess, pumpedHydro, oneWayEfficiency } from './storage';

const BIG = 1e4;
const mk = (a: number[], b: number[], c: number[], lo?: number[], hi?: number[]): EdUnit[] =>
  a.map((_, i) => ({ a: a[i]!, b: b[i]!, c: c[i]!, pMin: lo ? lo[i]! : -BIG, pMax: hi ? hi[i]! : BIG }));

describe('cost curves', () => {
  it('G-16 marginal fuel cost', () => { expectOracle('G-16', 'cost_usd_MWh', marginalFuelCost(10.3, 2.6)); });
  it('S15 fit: avg heat rate at Pmin is 8 % worse, IC rises 10 %', () => {
    for (const [pmin, pmax, hr] of [[100, 400, 9.5], [30, 120, 11], [250, 660, 8.8]] as const) {
      const cv = fitCostCurve(hr, 3, pmin, pmax);
      expect(cv.b).toBeCloseTo(hr * 3, 12);
      expect(averageCost(cv, pmin) / averageCost(cv, pmax)).toBeCloseTo(1.08, 10);
      expect(incrementalCost(cv, pmax) / incrementalCost(cv, pmin)).toBeCloseTo(1.1, 10);
      expect(cv.a).toBeGreaterThan(0); expect(cv.c).toBeGreaterThan(0);
    }
  });
  it('degenerate units get a linear curve', () => { expect(fitCostCurve(10, 2, 0, 50)).toEqual({ a: 0, b: 20, c: 0 }); });
  it('block cost = C 0.25 + startup + VOM P 0.25', () => {
    const cv = { a: 100, b: 20, c: 0.01 };
    expect(blockCost(cv, 100, 3, 500)).toBeCloseTo(cost(cv, 100) * 0.25 + 500 + 3 * 100 * 0.25, 10);
    expect(blockCost(cv, 0, 3, 0, false)).toBe(0);
  });
});

describe('economic dispatch', () => {
  const a = [500, 400, 200], b = [5.3, 5.5, 5.8], c = [0.004, 0.006, 0.009];
  it('PS-20 no limits', () => {
    const r = economicDispatch(mk(a, b, c), 975);
    expectOracle('PS-20', 'lambda_usd_MWh', r.lambda); expectOracle('PS-20', 'P1_MW', r.p[0]!);
    expectOracle('PS-20', 'P2_MW', r.p[1]!); expectOracle('PS-20', 'P3_MW', r.p[2]!); expectOracle('PS-20', 'cost_usd_h', r.cost);
  });
  it('PS-21 limits binding', () => {
    const r = economicDispatch(mk(a, b, c, [200, 150, 100], [450, 350, 300]), 1000);
    expectOracle('PS-21', 'lambda_usd_MWh', r.lambda); expectOracle('PS-21', 'P1_MW', r.p[0]!);
    expectOracle('PS-21', 'P2_MW', r.p[1]!); expectOracle('PS-21', 'P3_MW', r.p[2]!); expectOracle('PS-21', 'cost_usd_h', r.cost);
    expect(r.binding).toEqual(['max', 'free', 'free']);
  });
  it('infeasible demand returns a shortfall / surplus, not a throw', () => {
    const us = mk(a, b, c, [200, 150, 100], [450, 350, 300]);
    const s = economicDispatch(us, 1200);
    expect(s.feasible).toBe(false); expect(s.code).toBe('ed.shortfall'); expect(s.shortfallMW).toBeCloseTo(100, 9);
    const u = economicDispatch(us, 300);
    expect(u.code).toBe('ed.surplus'); expect(u.surplusMW).toBeCloseTo(150, 9);
    expect(Number.isFinite(s.lambda) && Number.isFinite(u.lambda)).toBe(true);
    expect(economicDispatch([], 10).code).toBe('ed.shortfall');
  });
  it('ramp window limits the bounds', () => {
    const us: EdUnit[] = [
      { a: 0, b: 10, c: 0.01, pMin: 0, pMax: 500, pPrev: 100, rampMWperMin: 2 },
      { a: 0, b: 30, c: 0.01, pMin: 0, pMax: 500, pPrev: 100, rampMWperMin: 20 },
    ];
    const r = economicDispatch(us, 300);
    expect(r.p[0]).toBeCloseTo(130, 9); expect(r.p[1]).toBeCloseTo(170, 9);
  });
  it('linear-cost units share the margin exactly', () => {
    const r = economicDispatch([{ a: 0, b: 10, c: 0, pMin: 0, pMax: 100 }, { a: 0, b: 20, c: 0, pMin: 0, pMax: 100 }], 130);
    expect(r.p[0]).toBeCloseTo(100, 9); expect(r.p[1]).toBeCloseTo(30, 9); expect(r.totalMW).toBeCloseTo(130, 9);
  });
  const a2 = [300, 250], b2 = [8, 9], c2 = [0.004, 0.005];
  const B = [[1e-4, -2e-5], [-2e-5, 1.5e-4]];
  it('PS-22 B-coefficient losses (outer iterations to convergence)', () => {
    const r = edWithLosses(mk(a2, b2, c2), 300, B, 8);
    expectOracle('PS-22', 'P1_MW', r.p[0]!); expectOracle('PS-22', 'P2_MW', r.p[1]!);
    expectOracle('PS-22', 'lambda_usd_MWh', r.lambda); expectOracle('PS-22', 'PL_MW', r.lossMW);
  });
  it('PS-22 with the specified 3 outer iterations (loose 5e-3: 3 passes are not converged to the row 1e-4; 8 passes are)', () => {
    const r = edWithLosses(mk(a2, b2, c2), 300, B, 3);
    expectOracle('PS-22', 'P1_MW', r.p[0]!, { tol: 5e-3, tolKind: 'rel' }); expectOracle('PS-22', 'P2_MW', r.p[1]!, { tol: 5e-3, tolKind: 'rel' });
    expectOracle('PS-22', 'lambda_usd_MWh', r.lambda, { tol: 5e-3, tolKind: 'rel' }); expectOracle('PS-22', 'PL_MW', r.lossMW, { tol: 5e-3, tolKind: 'rel' });
  });
  it('penalty-factor variant with externally supplied sensitivities reproduces PS-22', () => {
    const model = bCoefficientLosses(B);
    const r = edPenaltyFactors(mk(a2, b2, c2), 300, (p) => model(p), 8);
    expect(r.penaltyFactors[0]!).toBeCloseTo(1 / (1 - 2 * (B[0]![0]! * r.p[0]! + B[0]![1]! * r.p[1]!)), 4);
    expectOracle('PS-22', 'P1_MW', r.p[0]!);
  });
});

describe('commitment', () => {
  const U = (id: string, cost: number, pMax: number, over: Partial<CommitUnit> = {}): CommitUnit => ({
    id, pMin: pMax * 0.4, pMax, fullLoadAvgCost: cost, minUpBlocks: 8, minDownBlocks: 8, startBlocks: 2,
    initialOnline: false, blocksInState: 100, ...over });
  const units = [U('peaker', 60, 100), U('base', 20, 400), U('mid', 35, 200)];
  it('priority list orders by full-load average cost', () => { expect(priorityList(units)).toEqual([1, 2, 0]); });
  it('reserve = largest online unit; cheap first', () => {
    const d = new Array(96).fill(150);
    const r = commit(units, d);
    // 150 MW: base alone gives 400-400=0 < 150; add mid => 600-400=200 >= 150
    expect(r.online[1]![50]).toBe(true); expect(r.online[2]![50]).toBe(true); expect(r.online[0]![50]).toBe(false);
    expect(r.reserveShortBlocks).toEqual([]);
  });
  it('min up/down honoured and start commands lead by start time', () => {
    const d = new Array(96).fill(100); for (let t = 40; t < 44; t++) d[t] = 500;
    const r = commit(units, d);
    const on = r.online[0]!; // peaker needed only 4 blocks, min up 8
    let run = 0; for (let t = 0; t < 96; t++) if (on[t]) run++;
    expect(run).toBeGreaterThanOrEqual(8);
    expect(r.violations).toEqual([]);
    expect(r.startCommand[0]![38]).toBe(true);
  });
  it('player override wins and violations are reported', () => {
    const d = new Array(96).fill(100);
    const ov = units.map(() => new Array(96).fill(null)); for (let t = 10; t < 12; t++) ov[0]![t] = true;
    const r = commit(units, d, ov);
    expect(r.online[0]![10]).toBe(true);
    expect(r.violations.some((v) => v.unit === 'peaker' && v.code === 'min_up')).toBe(true);
  });
});

describe('hydro water value (S13)', () => {
  it('daily energy equals budget; hydro shifts to peak', () => {
    const D = Array.from({ length: 96 }, (_, t) => 400 + 200 * Math.sin((t / 96) * 2 * Math.PI - 2));
    const lam = (_t: number, x: number): number => 10 + 0.02 * Math.max(0, x);
    const r = solveWaterValue({ pMin: 0, pMax: 150 }, D, 1800, lam);
    expect(r.code).toBe('');
    expect(Math.abs(r.energyMWh - 1800)).toBeLessThan(1e-3);
    const iMax = D.indexOf(Math.max(...D)), iMin = D.indexOf(Math.min(...D));
    expect(r.p[iMax]!).toBeGreaterThan(r.p[iMin]!);
    expect(r.nu).toBeGreaterThan(10);
  });
  it('budget beyond limits is a code, not a throw', () => {
    const lam = (_t: number, x: number): number => 10 + 0.02 * x;
    expect(solveWaterValue({ pMin: 0, pMax: 10 }, new Array(96).fill(100), 1e6, lam).code).toBe('hydro.budget_above_max');
    expect(solveWaterValue({ pMin: 5, pMax: 10 }, new Array(96).fill(100), 1, lam).code).toBe('hydro.budget_below_min');
  });
});

describe('storage', () => {
  it('G-09 50 MW for 1 h at eta_rt 0.86 removes 53.916 MWh', () => {
    const sp = bess(400, 50, 0.86);
    const s = storageStep(sp, 0.8, 0, 50, 1);
    expectOracle('G-09', 'dSoC_MWh', (0.8 - s.soc) * 400);
    expect(oneWayEfficiency(0.86)).toBeCloseTo(Math.sqrt(0.86), 12);
  });
  it('SoC window 10-90 % trims power', () => {
    const sp = bess(100, 100);
    const s = storageStep(sp, 0.12, 0, 100, 1);
    expect(s.soc).toBeGreaterThanOrEqual(0.1 - 1e-12); expect(s.clamped).toBe(true);
    const c = storageStep(sp, 0.89, 100, 0, 1);
    expect(c.soc).toBeLessThanOrEqual(0.9 + 1e-12);
  });
  it('threshold strategy', () => {
    const sp = bess(100, 25);
    expect(thresholdRequest(sp, 10, 20, 50)).toEqual({ pChMW: 25, pDisMW: 0 });
    expect(thresholdRequest(sp, 60, 20, 50)).toEqual({ pChMW: 0, pDisMW: 25 });
    expect(thresholdRequest(sp, 30, 20, 50)).toEqual({ pChMW: 0, pDisMW: 0 });
  });
  it('pumped hydro eta_rt 0.75, fixed-speed pumping only at rated power', () => {
    const sp = pumpedHydro(1000, 100, 120);
    expect(sp.etaRt).toBe(0.75);
    expect(storageStep(sp, 0.3, 30, 0, 0.25).pChMW).toBe(0);
    expect(storageStep(sp, 0.3, 60, 0, 0.25).pChMW).toBe(100);
    // round trip: pump then generate the stored energy
    const up = storageStep(sp, 0.3, 100, 0, 1);
    const down = storageStep(sp, up.soc, 0, 120, 1);
    expect(down.soc).toBeLessThan(up.soc);
    expect((up.soc - 0.3) * 1000).toBeCloseTo(Math.sqrt(0.75) * 100, 9);
  });
});
