import { describe, it, expect } from 'vitest';
import { oracleValue, expectOracle, level } from '../../oracles/expected';
import { runFrequencyWindow, blockFrequency, type FreqInput, type FreqUnit, type FreqGridCode } from './frequency';

const NOCODE: FreqGridCode = { deadbandHz: 0, ufls: [] };

function gasUnit(id: string, S: number, H: number, R: number, P0 = 0, Pmax = 1e9): FreqUnit {
  return { id, kind: 'gas', S, H, R, P0, Pmin: -1e9, Pmax };
}

// ---- L19 scenario (tools/oracles/review/l19/l19_ce.py)
const coal = (id: string, P0: number): FreqUnit => ({ id, kind: 'steam', S: 588, H: 3.5, R: 0.05, P0, Pmax: 500, Pmin: 275 });
const hydro = (id: string): FreqUnit => ({ id, kind: 'hydro', S: 294, H: 3.0, R: 0.05, P0: 225, Pmax: 250, Pmin: 75 });
const L19_CODE: FreqGridCode = {
  deadbandHz: 0.01,
  ufls: [[49.0, 5], [48.8, 8], [48.6, 8], [48.4, 8], [48.2, 8], [48.0, 8]].map(([hz, shedPct]) => ({ hz, shedPct, delayS: 0.2 })),
  genUf: { hz: 47.5, s: 0.5 }, genOf: { hz: 51.5, s: 2 },
};
function l19(ncoal: number, bessMW = 0, ufls = true): FreqInput {
  const rest = 6900 - 4 * 225 - 500;
  const n = ncoal - 1;
  const units: FreqUnit[] = [];
  for (let i = 0; i < n; i++) units.push(coal(`c${i}`, rest / n));
  for (let i = 0; i < 4; i++) units.push(hydro(`h${i}`));
  return {
    f0: 50, units, bess: bessMW ? [{ id: 'b', ratedMW: bessMW, droopPu: 0.01, mode: 'following' }] : [], loadMW: 6900, disturbanceMW: 500, dLoad: 1.5,
    gridCode: ufls ? L19_CODE : { ...L19_CODE, ufls: [] },
  };
}

describe('frequency window: textbook / model oracles', () => {
  it('PS-23 RoCoF and kinetic energy (H 5 s, 500 MVA, 0.2 pu loss, 60 Hz)', () => {
    const r = runFrequencyWindow({
      f0: 60, units: [gasUnit('g', 500, 5, 0.05, 250, 500)], bess: [], loadMW: 500, disturbanceMW: 0.2 * 500, gridCode: NOCODE, dLoad: 0,
      window: { maxS: 1 },
    });
    expectOracle('PS-23', 'rocof_Hz_s', -r.rocof0);
    expect(5 * 500).toBeCloseTo(oracleValue('PS-23', 'KE_MJ'), 6);
    // the RK4 initial slope agrees with the analytic value
    expect(Math.abs(r.trace.rocofHzS[1] - r.rocof0) / Math.abs(r.rocof0)).toBeLessThan(0.02);
  });

  it('G-12 RK4 dt 10 ms vs analytic (first-order governor, D 1, R 0.05, TG 0.5, H 5, 0.1 pu)', () => {
    const r = runFrequencyWindow({
      f0: 50, units: [gasUnit('g', 100, 5, 0.05, 50, 500)], bess: [], loadMW: 100, disturbanceMW: 10, dLoad: 1, gridCode: NOCODE, window: { maxS: 30, settleAfterS: 1000 },
    });
    const at = (t: number) => r.trace.fHz[Math.round(t / 0.02)] - 50;
    expect(Math.abs(at(1) - oracleValue('G-12', 'df_1s_Hz'))).toBeLessThan(1e-6);
    expect(Math.abs(r.nadirHz - 50 - oracleValue('G-12', 'nadir_Hz'))).toBeLessThan(1e-5);
    expect(Math.abs(r.tNadir - oracleValue('G-12', 't_nadir_s'))).toBeLessThan(2e-3);
    expect(Math.abs(r.rocof0 - oracleValue('G-12', 'rocof0_Hz_s'))).toBeLessThan(1e-12);
    for (let s = 1; s <= 29; s++) expect(Math.abs(at(s) - xaGasSolution(s))).toBeLessThan(1e-6);
    expect(Math.abs(r.fEndHz - 50 - oracleValue('G-12', 'df_ss_Hz'))).toBeLessThan(1e-6);
  });

  it('PS-25 droop steady-state frequency deviation (D 0.8, R 0.05, 0.01 pu)', () => {
    const r = runFrequencyWindow({
      f0: 50, units: [gasUnit('g', 100, 5, 0.05, 50)], bess: [], loadMW: 0.8 * 100 / 1.5 * 1.5 * 0 + (0.8 * 100) / 1.5, disturbanceMW: 1, dLoad: 1.5, gridCode: NOCODE,
    });
    // D_sys = dLoad * P_load / S = 0.8 pu  =>  P_load = 0.8*100/1.5 MW
    expectOracle('PS-25', 'df_Hz', r.fEndHz - 50);
  });

  it('PS-26 droop sharing of 100 MW between 500 MVA 4% and 300 MVA 5% units (D = 0)', () => {
    const r = runFrequencyWindow({
      f0: 50, units: [gasUnit('G1', 500, 4, 0.04, 200), gasUnit('G2', 300, 4, 0.05, 100)], bess: [], loadMW: 300, disturbanceMW: 100, dLoad: 0, gridCode: NOCODE,
    });
    expectOracle('PS-26', 'df_Hz', r.fEndHz - 50);
    expectOracle('PS-26', 'P1_MW', r.unitFinal[0].dPmMW);
    expectOracle('PS-26', 'P2_MW', r.unitFinal[1].dPmMW);
  });
});

// analytic solution of the G-12 linear system by a high-accuracy independent integrator (dt 0.1 ms RK4 on a 3-state model)
function xaGasSolution(tEnd: number): number {
  const H = 5, D = 1, R = 0.05, TG = 0.5, dPL = 0.1;
  let w = 0, v = 0; const h = 1e-4;
  const f = (w_: number, v_: number): [number, number] => [(v_ - dPL - D * w_) / (2 * H), (-w_ / R - v_) / TG];
  for (let i = 0; i < Math.round(tEnd / h); i++) {
    const a = f(w, v), b = f(w + h / 2 * a[0], v + h / 2 * a[1]), c = f(w + h / 2 * b[0], v + h / 2 * b[1]), d = f(w + h * c[0], v + h * c[1]);
    w += h / 6 * (a[0] + 2 * b[0] + 2 * c[0] + d[0]); v += h / 6 * (a[1] + 2 * b[1] + 2 * c[1] + d[1]);
  }
  return w * 50;
}

describe('L19 Fifty Hertz scenario (reviewed reference: review/l19/l19_ce.py)', () => {
  const L = level('L19');
  it('naive 12 coal: nadir, shed MW (exact), RoCoF0, H_sys, S_sys', () => {
    const r = runFrequencyWindow(l19(12));
    expect(Math.abs(r.nadirHz - L.naive_12coal.nadir_Hz)).toBeLessThan(2e-3);
    expect(r.shedMW).toBe(L.naive_12coal.shed_MW);
    expect(r.shedMW).toBe(345);
    expect(Math.abs(r.rocof0 - L.naive_12coal.RoCoF0_Hz_s) / Math.abs(L.naive_12coal.RoCoF0_Hz_s)).toBeLessThan(1e-6);
    expect(Math.abs(r.hSys - L.naive_12coal.H_sys_s)).toBeLessThan(1e-9);
    expect(r.sSys).toBe(L.naive_12coal.S_sys_MVA);
    expect(Math.abs(r.fEndHz - L.naive_12coal.f_end_Hz)).toBeLessThan(0.01);
    // one UFLS stage pickup + shed event, with cause numbers
    const kinds = r.events.map((e) => e.kind);
    expect(kinds).toEqual(['ufls_pickup', 'ufls_shed']);
    expect(r.events[1].cause.mw).toBe(345);
  });
  it('13th unit: nadir ≈ 49.58 Hz (offset dead-zone), no shed', () => {
    const r = runFrequencyWindow(l19(13));
    expect(Math.abs(r.nadirHz - L.coal13.nadir_Hz)).toBeLessThan(2e-3);
    expect(r.shedMW).toBe(0);
    expect(Math.abs(r.rocof0 - L.coal13.RoCoF0_Hz_s) / Math.abs(L.coal13.RoCoF0_Hz_s)).toBeLessThan(1e-6);
    expect(r.sSys).toBe(L.coal13.S_sys_MVA);
  });
  it('13th unit + 200 MW FFR: ≈ 49.66 Hz', () => {
    const r = runFrequencyWindow(l19(13, 200));
    expect(Math.abs(r.nadirHz - L.coal13_bess200.nadir_Hz)).toBeLessThan(2e-3);
    expect(r.shedMW).toBe(0);
  });
  it('BESS alone (naive + 200 MW): 49.03 Hz, no shed', () => {
    const r = runFrequencyWindow(l19(12, 200));
    // slow monotone settle: the nadir is the window end, where the engine's settle criterion and the script's fixed 60 s differ by ~2 mHz
    expect(Math.abs(r.nadirHz - L.naive_bess200.nadir_Hz)).toBeLessThan(5e-3);
    expect(Math.abs(r.nadirHz - 49.03)).toBeLessThan(0.01);
    expect(r.shedMW).toBe(0);
  });
  it('without UFLS the naive case bottoms near 48.07 Hz', () => {
    const r = runFrequencyWindow(l19(12, 0, false));
    // late, flat nadir (no UFLS): ~2 mHz from the reference's sampled minimum vs the engine's refined one
    expect(Math.abs(r.nadirHz - L.naive_12coal.nadir_noUFLS_Hz)).toBeLessThan(5e-3);
  });
});

describe('frequency window: relay semantics', () => {
  const base = (): FreqInput => ({
    f0: 50, units: [gasUnit('g', 1000, 4, 0.05, 500, 1000)], bess: [], loadMW: 1000, disturbanceMW: 600, dLoad: 1.5,
    gridCode: { deadbandHz: 0, ufls: [{ hz: 49.0, shedPct: 10, delayS: 0.2 }] },
  });
  it('event time is the interpolated crossing, shed applies one delay later (end of step, 1 ms resolution)', () => {
    const r = runFrequencyWindow(base());
    const pick = r.events.find((e) => e.kind === 'ufls_pickup')!;
    const shed = r.events.find((e) => e.kind === 'ufls_shed')!;
    expect(shed.t - pick.t).toBeCloseTo(0.2, 3);
    // the frequency sample around the pickup brackets the threshold
    const i = Math.round(pick.t / 0.02);
    expect(r.trace.fHz[i - 1]).toBeGreaterThanOrEqual(49.0 - 1e-9);
    expect(pick.cause.thresholdHz).toBe(49);
    expect(shed.cause.mw).toBe(100);
  });
  it('relays latch: a stage that recovers above threshold before its timer still operates', () => {
    const inp = base();
    inp.gridCode.ufls = [{ hz: 49.0, shedPct: 10, delayS: 5 }]; // timer far longer than the dip
    const r = runFrequencyWindow(inp);
    const shed = r.events.filter((e) => e.kind === 'ufls_shed');
    expect(shed).toHaveLength(1);
    expect(shed[0].t).toBeGreaterThan(5);
    expect(r.nadirHz).toBeLessThan(49.0);
  });
  it('PSP pumping and BESS charging disconnect at stage-1 pickup', () => {
    const inp = base();
    inp.pumpMW = 50; inp.bessChargingMW = 20;
    const r = runFrequencyWindow(inp);
    const pk = r.events.find((e) => e.kind === 'ufls_pickup')!;
    const psp = r.events.find((e) => e.kind === 'psp_disconnect')!;
    const bc = r.events.find((e) => e.kind === 'bess_charge_disconnect')!;
    expect(psp.t).toBe(pk.t); expect(psp.cause.mw).toBe(50); expect(bc.cause.mw).toBe(20);
  });
  it('generator under-frequency trip needs the hold time; blackout ends the window', () => {
    const inp = base();
    inp.disturbanceMW = 900; inp.gridCode = { deadbandHz: 0, ufls: [], genUf: { hz: 47.5, s: 0.5 } };
    const r = runFrequencyWindow(inp);
    expect(r.unitTrips.map((u) => u.id)).toEqual(['g']);
    expect(r.endReason).toBe('blackout');
    const tr = r.unitTrips[0];
    expect(tr.t).toBeGreaterThan(0.5);
  });
  it('legacy DER RoCoF trip uses the 500 ms window slope and removes the DER output', () => {
    const inp = base();
    inp.disturbanceMW = 400; inp.derLegacyMW = 60;
    inp.gridCode = { deadbandHz: 0, ufls: [], derRocofTrip: { hzPerS: 0.5 } };
    const r = runFrequencyWindow(inp);
    const e = r.events.find((x) => x.kind === 'der_rocof_trip')!;
    expect(e).toBeDefined();
    expect(e.t).toBeGreaterThanOrEqual(0.5);
    expect(Math.abs(e.cause.rocofHzS)).toBeGreaterThan(0.5);
    const calm = runFrequencyWindow({ ...inp, gridCode: { deadbandHz: 0, ufls: [], derRocofTrip: { hzPerS: 5 } } });
    expect(calm.events.find((x) => x.kind === 'der_rocof_trip')).toBeUndefined();
  });
  it('headroom limit: a unit with no headroom does not respond', () => {
    const inp = base();
    inp.units = [gasUnit('g', 1000, 4, 0.05, 500, 500)];
    inp.gridCode = { deadbandHz: 0, ufls: [] };
    inp.window = { settlePuPerS: 1e-9 }; // the default 1e-5 pu/s criterion leaves ~3 mHz here (tau = 5 s)
    const r = runFrequencyWindow(inp);
    expect(r.unitFinal[0].dPmMW).toBe(0);
    // only load damping is left: Δω = −ΔP/(D_load·P_load) = −0.4 pu
    expect(r.fEndHz).toBeCloseTo(50 * (1 - 600 / 1500), 3);
  });
  it('grid-forming BESS adds inertia: RoCoF0 falls', () => {
    const a = runFrequencyWindow(base());
    const inp = base(); inp.bess = [{ id: 'gf', ratedMW: 200, mode: 'forming', Hv: 4 }];
    const b = runFrequencyWindow(inp);
    expect(Math.abs(b.rocof0)).toBeLessThan(Math.abs(a.rocof0));
    expect(b.sSys).toBe(1200);
  });
  it('no synchronous inertia gives a teaching error, never NaN', () => {
    const r = runFrequencyWindow({ ...base(), units: [] });
    expect(r.ok).toBe(false); expect(r.error).toMatch(/inertia/);
    expect(Number.isFinite(r.nadirHz)).toBe(true);
  });
  it('is deterministic and never mutates its input', () => {
    const inp = l19(12, 200);
    const snap = JSON.stringify(inp);
    const a = runFrequencyWindow(inp);
    expect(JSON.stringify(inp)).toBe(snap);
    const b = runFrequencyWindow(inp);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it('perf: 60 s window with ~40 states, median <= 60 ms (target 20 ms)', () => {
    const inp = l19(12, 200, true);
    inp.gridCode = { ...inp.gridCode, deadbandHz: 0.01 };
    inp.window = { settleAfterS: 1000 }; // force the full 60 s
    const ts: number[] = [];
    for (let i = 0; i < 9; i++) { const t0 = performance.now(); runFrequencyWindow(inp); ts.push(performance.now() - t0); }
    ts.sort((a, b) => a - b);
    // eslint-disable-next-line no-console
    console.log(`frequency window 60 s, ${1 + 2 * 15 + 2} states: median ${ts[4].toFixed(1)} ms`);
    expect(ts[4]).toBeLessThanOrEqual(60);
  });
});

describe('blockFrequency (operator clock)', () => {
  it('no limits: df = -dP/beta with beta = sum S/R/f0 + D_load P_load/f0', () => {
    const us = [{ S: 500, R: 0.05, upMW: 1e9, downMW: 1e9 }, { S: 300, R: 0.05, upMW: 1e9, downMW: 1e9 }];
    const r = blockFrequency(us, 100, 1000, 50);
    const beta = (500 / 0.05 + 300 / 0.05) / 50 + (1.5 * 1000) / 50;
    expect(r.betaMWHz).toBeCloseTo(beta, 9);
    expect(r.dfHz).toBeCloseTo(-100 / beta, 12);
    expect(r.atLimit).toEqual([]);
  });
  it('a unit at its limit leaves beta', () => {
    const us = [{ S: 500, R: 0.05, upMW: 10, downMW: 1e9 }, { S: 500, R: 0.05, upMW: 1e9, downMW: 1e9 }];
    const r = blockFrequency(us, 200, 0, 50, 0);
    expect(r.atLimit).toEqual([0]);
    expect(r.dfHz).toBeCloseTo(-(200 - 10) / (500 / 0.05 / 50), 12);
    // consistent: unit 1 delivers 190, unit 0 is held at 10
    expect((500 / 0.05 / 50) * -r.dfHz).toBeCloseTo(190, 9);
  });
  it('nothing left to respond: collapsed, finite', () => {
    const r = blockFrequency([{ S: 500, R: 0.05, upMW: 0, downMW: 0 }], 100, 0, 50, 0);
    expect(r.collapsed).toBe(true); expect(Number.isFinite(r.dfHz)).toBe(true);
  });
});
