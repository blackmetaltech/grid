import { describe, it, expect } from 'vitest';
import { cx, abs, arg, add, dmath, polarDeg, toPolarDeg, type Complex } from '@core/numerics';
import { oracleValue, expectOracle, level } from '../../oracles/expected';
import {
  GROUND, solveMna, cableLoopR, rFromResistivity, solveL01, solveL03, solveFourWire, balancedSum, capacitorBankNet, harmonicStudy,
  impedanceSweep, hResonance, hParallelDetuned, hSeries, qEffective, thd, emfPeak, emfRms, frequencyHz, speedRpm, polesFor, circleArea,
  alternatorCircuit, emfSamples, type Elem,
} from './index';

const TWO_PI = 2 * Math.PI;
const D = 180 / Math.PI;
const ok = <T extends { ok: boolean }>(r: T) => { if (!r.ok) throw new Error(JSON.stringify(r)); return r as Extract<T, { ok: true }>; };
const RMS_SRC = (v: number): Elem => ({ kind: 'V', id: 'src', a: 's', b: GROUND, e: cx(v) });
/** series source -> [elements] -> ground chain; returns solved result. */
function series(v: number, parts: { kind: 'R' | 'L' | 'C'; val: number }[], w: number) {
  const el: Elem[] = [RMS_SRC(v)];
  parts.forEach((p, k) => {
    const a = k === 0 ? 's' : `n${k}`, b = k === parts.length - 1 ? GROUND : `n${k + 1}`;
    el.push(p.kind === 'R' ? { kind: 'R', id: `e${k}`, a, b, r: p.val } : p.kind === 'L' ? { kind: 'L', id: `e${k}`, a, b, h: p.val } : { kind: 'C', id: `e${k}`, a, b, f: p.val });
  });
  return ok(solveMna(el, w));
}
const Iof = (r: ReturnType<typeof series>) => r.I.src; // source current a->b inside (negative of delivered)
const Pabs = (r: ReturnType<typeof series>) => -r.S.src.re;

describe('AC bench rows through MNA', () => {
  it('AC-01 RMS in R', () => {
    const r = series(220, [{ kind: 'R', val: 100 }], TWO_PI * 50);
    expectOracle('AC-01', 'I_A', abs(Iof(r))); expectOracle('AC-01', 'P_W', Pabs(r));
  });
  it('AC-02 peak <-> rms (closed form)', () => {
    expectOracle('AC-02', 'Ipeak_A', 10 * dmath.sqrt(2)); expectOracle('AC-02', 'Vrms_V', 300 / dmath.sqrt(2));
  });
  it('AC-03 X_L', () => {
    const r = series(220, [{ kind: 'L', val: 0.044 }], TWO_PI * 50);
    expectOracle('AC-03', 'I_A', abs(Iof(r))); expectOracle('AC-03', 'XL_ohm', 220 / abs(Iof(r)));
  });
  it('AC-04 X_C', () => {
    const r = series(110, [{ kind: 'C', val: 6e-5 }], TWO_PI * 60);
    expectOracle('AC-04', 'I_A', abs(Iof(r))); expectOracle('AC-04', 'XC_ohm', 110 / abs(Iof(r)));
  });
  const lcr = (v: number) => series(v, [{ kind: 'R', val: 3 }, { kind: 'L', val: 0.02548 }, { kind: 'C', val: 0.000796 }], TWO_PI * 50);
  it('AC-05 LCR |Z|', () => expectOracle('AC-05', 'Z_ohm', 1 / abs(Iof(lcr(1)))));
  it('AC-06 LCR phase (V leads I)', () => {
    const i = Iof(lcr(1)); // current delivered = -i; Z = V/I_delivered
    expectOracle('AC-06', 'phi_deg', -arg({ re: -i.re, im: -i.im }) * D);
  });
  it('AC-07 LCR I, pf, P', () => {
    const r = lcr(230);
    expectOracle('AC-07', 'I_A', abs(Iof(r))); expectOracle('AC-07', 'P_W', Pabs(r));
    expectOracle('AC-07', 'pf', Pabs(r) / (230 * abs(Iof(r))));
  });
  it('AC-08 RC phasor', () => {
    const r = series(220, [{ kind: 'R', val: 100 }, { kind: 'C', val: 2e-5 }], TWO_PI * 50);
    const i = { re: -Iof(r).re, im: -Iof(r).im };
    expectOracle('AC-08', 'I_A', abs(i)); expectOracle('AC-08', 'Z_ohm', 220 / abs(i));
    expectOracle('AC-08', 'lead_deg', arg(i) * D); expectOracle('AC-08', 'pf', Pabs(r) / (220 * abs(i)));
  });
  const L = 2, C = 3.2e-5, R = 10, w0 = 1 / dmath.sqrt(L * C);
  const res = (w: number) => series(220, [{ kind: 'R', val: R }, { kind: 'L', val: L }, { kind: 'C', val: C }], w);
  it('AC-09 resonance, Q', () => {
    const r = res(w0);
    expectOracle('AC-09', 'w0_rad_s', w0); expectOracle('AC-09', 'f0_Hz', w0 / TWO_PI);
    expectOracle('AC-09', 'Q', abs(r.V.n1) / 220 === 0 ? 0 : (abs(r.I.e1) * w0 * L) / 220 * (220 / (abs(r.I.src) * R)));
  });
  it('AC-10 bandwidth: half-power points are R/L apart and I = Imax/sqrt2', () => {
    const a = R / (2 * L), s = dmath.sqrt(a * a + w0 * w0);
    const w1 = s - a, w2 = s + a, imax = abs(res(w0).I.src);
    expect(abs(res(w1).I.src) / imax).toBeCloseTo(1 / dmath.sqrt(2), 9);
    expect(abs(res(w2).I.src) / imax).toBeCloseTo(1 / dmath.sqrt(2), 9);
    expectOracle('AC-10', 'dw_rad_s', w2 - w1); expectOracle('AC-10', 'df_Hz', (w2 - w1) / TWO_PI);
  });
  it('AC-11 voltage magnification', () => {
    const r = res(w0);
    expectOracle('AC-11', 'I_A', abs(r.I.src));
    expectOracle('AC-11', 'VL_V', abs(r.I.src) * w0 * L); expectOracle('AC-11', 'VC_V', abs(r.I.src) / (w0 * C));
    // node voltage across C from the solve: V(n2)
    expectOracle('AC-11', 'VC_V', abs(r.V.n2));
  });
  it('AC-12 pure LC, wattless (R = 0)', () => {
    const r = series(230, [{ kind: 'L', val: 0.08 }, { kind: 'C', val: 6e-5 }], TWO_PI * 50);
    expectOracle('AC-12', 'I_A', abs(Iof(r))); expectOracle('AC-12', 'Iamp_A', abs(Iof(r)) * dmath.sqrt(2));
    expectOracle('AC-12', 'P_W', Pabs(r), { tol: 1e-9, tolKind: 'abs' });
    expectOracle('AC-12', 'XL_ohm', TWO_PI * 50 * 0.08); expectOracle('AC-12', 'XC_ohm', 1 / (TWO_PI * 50 * 6e-5));
    expect(Iof(r).im).toBeGreaterThan(-1e9); // sign: I leads V (capacitive): delivered current phase > 0
    expect(arg({ re: -Iof(r).re, im: -Iof(r).im })).toBeGreaterThan(0);
  });
  it('AC-13 transformer turns and currents (ideal T element)', () => {
    const Ns = 4000 * 230 / 2300;
    expectOracle('AC-13', 'Ns', Ns);
    const r = ok(solveMna([RMS_SRC(2300), { kind: 'T', id: 'T', a: 's', b: GROUND, c: 'sec', d: GROUND, n: Ns / 4000 },
      { kind: 'LOAD', id: 'load', a: 'sec', b: GROUND, p: 50000, q: 0, vnom: 230 }], TWO_PI * 50));
    expectOracle('AC-13', 'Ip_A', abs(r.I.T) * (Ns / 4000)); expectOracle('AC-13', 'Is_A', abs(r.I.load));
    expectOracle('AC-13', 'Is_A', abs(r.I.T));
    expect(r.tellegen).toBeLessThan(1e-12);
  });
  it('AC-14 transformer efficiency (closed form)', () => expectOracle('AC-14', 'eta_pct', (100 * 22 * 40) / (220 * 5)));
  for (const [id, V] of [['AC-15', 4000], ['AC-16', 40000]] as const) {
    it(`${id} town line`, () => {
      const I = 800000 / V;
      const r = ok(solveMna([{ kind: 'V', id: 'src', a: 's', b: GROUND, e: cx(V) }, { kind: 'R', id: 'line', a: 's', b: 'far', r: 15 },
        { kind: 'I', id: 'town', a: 'far', b: GROUND, i: cx(I) }], 0));
      expectOracle(id, 'I_A', abs(r.I.line)); expectOracle(id, 'loss_kW', r.S.line.re / 1000);
    });
  }
  it('AC-17 alternator emf and power', () => {
    const e0 = emfPeak(20, 0.03, circleArea(0.08), 50);
    expectOracle('AC-17', 'e0_V', e0);
    const r = ok(alternatorCircuit(e0, 10, 50));
    expectOracle('AC-17', 'I0_A', abs(r.I.load));
    expectOracle('AC-17', 'Pavg_W', (abs(r.I.load) * abs(r.I.load) * 10) / 2);
  });
  it('AC-18 RL phasor sum', () => {
    const r = ok(solveMna([{ kind: 'I', id: 'i', a: GROUND, b: 'x', i: cx(1) }, { kind: 'R', id: 'R', a: 'x', b: 'y', r: 120 },
      { kind: 'Z', id: 'XL', a: 'y', b: GROUND, z: cx(0, 160) }], 0));
    expectOracle('AC-18', 'V_V', abs(r.V.x)); expectOracle('AC-18', 'phi_deg', arg(r.V.x) * D);
  });
  it('AC-19 mutual inductance (closed form)', () => expectOracle('AC-19', 'emf_V', 1.5 * 20 / 0.5));
  it('AC-20 LC frequency / AC-21 LC energy (closed form)', () => {
    const w = 1 / dmath.sqrt(0.027 * 3e-5);
    expectOracle('AC-20', 'w_rad_s', w); expectOracle('AC-20', 'f_Hz', w / TWO_PI); expectOracle('AC-20', 'T_ms', (1000 * TWO_PI) / w);
    expectOracle('AC-21', 'E_J', (0.006 * 0.006) / (2 * 3e-5)); expectOracle('AC-21', 'Imax_A', 0.006 * w);
  });
  it('AC-22 choke vs resistor', () => {
    const w = TWO_PI * 50, Lh = 44 / w;
    expectOracle('AC-22', 'L_H', Lh);
    const ch = series(220, [{ kind: 'L', val: Lh }], w), rs = series(220, [{ kind: 'R', val: 44 }], w);
    expectOracle('AC-22', 'Z_ohm', 220 / abs(Iof(ch))); expectOracle('AC-22', 'P_choke_W', Pabs(ch), { tol: 1e-9, tolKind: 'abs' });
    expectOracle('AC-22', 'P_resistor_W', Pabs(rs));
    expect(abs(Iof(ch))).toBeCloseTo(5, 9);
  });
});

describe('G rows (bench)', () => {
  it('G-01 resistance formula', () => {
    const rc = rFromResistivity(1.724e-8, 600, 2.5); expectOracle('G-01', 'Rc_ohm', rc);
    const r = ok(solveL01({ loopROhm: rc, homes: 10 }));
    expectOracle('G-01', 'I_A', r.iA); expectOracle('G-01', 'Vload_V', r.vLoad);
  });
  it('G-01b L01 naive catalogue path', () => {
    const rc = cableLoopR(7.41, 300, 2); expectOracle('G-01b', 'Rc_ohm', rc);
    const r = ok(solveL01({ loopROhm: rc, homes: 10 }));
    expectOracle('G-01b', 'I_A', r.iA); expectOracle('G-01b', 'Vload_V', r.vLoad); expectOracle('G-01b', 'loss_pct', r.lossPct);
  });
  it('G-02 L01 lesson builds', () => {
    const a = ok(solveL01({ loopROhm: cableLoopR(0.727, 300), homes: 10 })), b = ok(solveL01({ loopROhm: cableLoopR(1.83, 120), homes: 10 }));
    expectOracle('G-02', 'V_25mm', a.vLoad); expectOracle('G-02', 'loss_pct_25mm', a.lossPct);
    expectOracle('G-02', 'V_10mm', b.vLoad); expectOracle('G-02', 'loss_pct_10mm', b.lossPct);
  });
  it('G-03 parallel resonance order (closed form + MNA sweep peak)', () => {
    expectOracle('G-03', 'hr', hResonance(50, 2)); expectOracle('G-03', 'fr_Hz', 50 * hResonance(50, 2));
    const { peak } = impedanceSweep(capacitorBankNet({ sscMVA: 50, vkV: 11, qcMVAr: 2 }, 50), 'pcc');
    expect(Math.abs(peak.f - oracleValue('G-03', 'fr_Hz'))).toBeLessThanOrEqual(5);
  });
  it('G-04 detuned bank', () => {
    expectOracle('G-04', 'Qeff_MVAr', qEffective(2, 0.07));
    expectOracle('G-04', 'h_parallel', hParallelDetuned(50, 2, 0.07)); expectOracle('G-04', 'h_series', hSeries(0.07));
    const net = capacitorBankNet({ sscMVA: 50, vkV: 11, qcMVAr: 2, p: 0.07 }, 50);
    const { peak } = impedanceSweep(net, 'pcc');
    expect(Math.abs(peak.f / 50 - oracleValue('G-04', 'h_parallel'))).toBeLessThan(0.15); // 5 Hz grid = 0.1 h
  });
  it('G-05 neutral current from current-source loads', () => {
    const r = ok(solveFourWire({ vPhase: 230, segments: [{ zPhase: cx(0.1), zNeutral: cx(0.2) }],
      loads: [{ at: 1, a: { kind: 'I', i: polarDeg(10, 0) }, b: { kind: 'I', i: polarDeg(6, -120) }, c: { kind: 'I', i: polarDeg(4, 120) } }] }));
    const p = toPolarDeg(r.iN);
    expectOracle('G-05', 'IN_mag', p.mag); expectOracle('G-05', 'IN_deg', p.deg);
    expect(abs(r.neutralShift[1])).toBeGreaterThan(0);
  });
  it('G-15 THD', () => expectOracle('G-15', 'THD_pct', 100 * thd(1, [0.04, 0.03])));
  it('G-19 f = pN/120', () => {
    expectOracle('G-19', 'f_Hz', frequencyHz(4, 1500)); expectOracle('G-19', 'N_rpm', speedRpm(24, 50));
    expect(polesFor(50, 500)).toBe(12);
    expect(Math.abs(emfRms(325) - 229.8)).toBeLessThan(0.2);
    const s = emfSamples(325, 50, 64, 2);
    expect(Math.max(...s.map((x) => x.e))).toBeCloseTo(325, 9);
  });
  it('G-20 balanced phasors', () => expectOracle('G-20', 'sum_mag', balancedSum()));
});

describe('L03 table (exact solve)', () => {
  const lv = level('L03');
  for (const [k, rkm] of [['25mm2', 0.727], ['35mm2', 0.524], ['50mm2', 0.387]] as const) {
    it(`L03 ${k}`, () => {
      const r = ok(solveL03({ rOhmPerKm20C: rkm })), o = lv.cables[k];
      expect(Math.abs(r.vFar - o.V_far_V) / o.V_far_V).toBeLessThan(1e-6);
      expect(Math.abs(r.iA - o.I_A) / o.I_A).toBeLessThan(1e-6);
      expect(Math.abs(r.lossW - o.loss_W) / o.loss_W).toBeLessThan(1e-6);
      expect(Math.abs(r.lossPctExact - o.loss_pct_exact) / o.loss_pct_exact).toBeLessThan(1e-6);
      expect(Math.abs(r.lossPctNaive - o.loss_pct_naive_Pfar) / o.loss_pct_naive_Pfar).toBeLessThan(1e-6);
    });
  }
});
