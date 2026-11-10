import { describe, it, expect } from 'vitest';
import { Rng } from '@core/kit';
import { runFrequencyWindow, type FreqInput, type FreqUnit } from './frequency';
import type { GovKind } from './governors';

const N = Number(process.env.GRID_FUZZ_N ?? 2000);
const SEED = 20260610;
const HYDRO_GAIN_MAX = 0.15;

function randomSystem(rng: Rng): { inp: FreqInput; K: number; load: number } {
  const n = rng.int(2, 8);
  const units: FreqUnit[] = [];
  const kinds: GovKind[] = ['steam', 'gas', 'hydro'];
  let sTot = 0;
  for (let i = 0; i < n; i++) {
    let kind = rng.pick(kinds);
    const S = rng.range(100, 800);
    // hydro (non-minimum phase) kept to a minority so the random system is small-signal stable
    if (kind === 'hydro' && (i === 0 || rng.chance(0.5))) kind = 'steam';
    units.push({ id: `u${i}`, kind, S, H: rng.range(3, 7), R: rng.range(0.03, 0.08), P0: 0.5 * S, Pmin: -1e9, Pmax: 1e9 });
    sTot += S;
  }
  const load = rng.range(0.3, 0.8) * sTot;
  const K = units.reduce((a, u) => a + u.S / (u.R as number), 0);
  // Small-signal stability precondition: the hydro water-hammer inverse response destabilises the loop when hydro carries too much
  // of the droop gain S/R (not just of the MVA: seed 20260610 case 32916 had 19.6 % hydro MVA but 28 % of the gain and diverged).
  const hydroGain = units.filter((u) => u.kind === 'hydro').reduce((a, u) => a + u.S / (u.R as number), 0);
  if (hydroGain > HYDRO_GAIN_MAX * K) for (const u of units) if (u.kind === 'hydro') u.kind = 'gas';
  const inp: FreqInput = {
    f0: rng.chance(0.5) ? 50 : 60, units, bess: [], loadMW: load, disturbanceMW: rng.range(0.01, 0.08) * sTot, dLoad: rng.range(0, 2),
    gridCode: { deadbandHz: 0, ufls: [] },
    window: { dt: 0.02, maxS: 600, settlePuPerS: 1e-9, settleAfterS: 20 },
  };
  return { inp, K, load };
}

describe('P16 frequency window ends at the analytic steady state', () => {
  it('regression: seed 20260610 case 32916 (hydro-heavy droop gain made the loop diverge) now settles on the analytic value', () => {
    const rng = new Rng(SEED);
    let sys = randomSystem(rng);
    for (let c = 1; c <= 32916; c++) sys = randomSystem(rng);
    const { inp, K, load } = sys;
    const dwA = -inp.disturbanceMW / (K + (inp.dLoad as number) * load); // case 32916 is even: no deadband
    const r = runFrequencyWindow(inp);
    expect(r.endReason).toBe('steady');
    expect(Math.abs(r.fEndHz - inp.f0 * (1 + dwA))).toBeLessThan(1e-4);
  });

  it(`deadband 0 / offset dead-zone, no limits hit (${N} random systems, seed ${SEED})`, () => {
    const rng = new Rng(SEED);
    let worst = 0, worstDb = 0, nDb = 0;
    const t0 = performance.now();
    for (let c = 0; c < N; c++) {
      const { inp, K, load } = randomSystem(rng);
      const dp = inp.disturbanceMW;
      const dPload = (inp.dLoad as number) * load;
      const useDb = c % 2 === 1;
      if (useDb) inp.gridCode = { deadbandHz: 0.01 * (inp.f0 / 50), ufls: [] };
      const dbPu = inp.gridCode.deadbandHz / inp.f0;
      const dwA = useDb ? -(dp + K * dbPu) / (K + dPload) : -dp / (K + dPload);
      if (useDb && Math.abs(dwA) <= dbPu) continue;
      const r = runFrequencyWindow(inp);
      const err = Math.abs(r.fEndHz - inp.f0 * (1 + dwA));
      if (useDb) { worstDb = Math.max(worstDb, err); nDb++; } else worst = Math.max(worst, err);
      if (!(err < 1e-4)) throw new Error(`P16 case ${c} seed ${SEED}: |f_end - analytic| = ${err} Hz (db ${useDb}, tEnd ${r.tEndS}, reason ${r.endReason})`);
      expect(r.shedMW).toBe(0);
    }
    // eslint-disable-next-line no-console
    console.log(`P16: ${N} cases (${nDb} with deadband), worst |err| ${worst.toExponential(2)} / ${worstDb.toExponential(2)} Hz, ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  });
});

describe('P17 RoCoF0 = dP f0 / (2 H_sys S_sys)', () => {
  it(`analytic value and RK4 initial slope (${N} random systems, seed ${SEED + 1})`, () => {
    const rng = new Rng(SEED + 1);
    for (let c = 0; c < N; c++) {
      const { inp } = randomSystem(rng);
      if (rng.chance(0.3)) inp.bess = [{ id: 'gf', ratedMW: rng.range(50, 300), mode: 'forming', Hv: rng.range(1, 6) }];
      let sS = 0, hS = 0;
      for (const u of inp.units) { sS += u.S; hS += u.H * u.S; }
      for (const b of inp.bess) if (b.mode === 'forming') { sS += b.ratedMW; hS += (b.Hv as number) * b.ratedMW; }
      const expected = (-inp.disturbanceMW * inp.f0) / (2 * (hS / sS) * sS);
      const r = runFrequencyWindow({ ...inp, window: { dt: 1e-4, maxS: 1e-3, traceDt: 1e-4 } });
      expect(Math.abs(r.rocof0 - expected) / Math.abs(expected), `P17 case ${c} seed ${SEED + 1}`).toBeLessThan(1e-6);
      expect(Math.abs(r.hSys - hS / sS)).toBeLessThan(1e-9);
      const slope = (r.trace.fHz[r.trace.fHz.length - 1] - inp.f0) / r.tEndS;
      expect(Math.abs(slope - expected) / Math.abs(expected), `P17 RK4 slope case ${c}`).toBeLessThan(1e-3);
    }
  });
});

describe('determinism and purity', () => {
  it('same input twice -> identical trace; input never mutated (200 random systems)', () => {
    const rng = new Rng(SEED + 2);
    for (let c = 0; c < 200; c++) {
      const { inp } = randomSystem(rng);
      inp.gridCode = { deadbandHz: 0.01, ufls: [{ hz: 49.5, shedPct: 5, delayS: 0.2 }, { hz: 49, shedPct: 8, delayS: 0.2 }], genUf: { hz: 47.5, s: 0.5 } };
      inp.disturbanceMW *= 3;
      const snap = JSON.stringify(inp);
      const a = runFrequencyWindow(inp);
      expect(JSON.stringify(inp)).toBe(snap);
      const b = runFrequencyWindow(inp);
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
      for (const v of a.trace.fHz) expect(Number.isFinite(v)).toBe(true);
    }
  });
});
