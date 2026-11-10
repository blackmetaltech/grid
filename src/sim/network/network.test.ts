import { describe, expect, it } from 'vitest';
import { cx, abs, arg, mul, scale, sub, add } from '@core/numerics';
import { Rng } from '@core/kit';
import { level, expectOracle, oracle } from '../../oracles/expected';
import {
  buildYbus, branchY, findIslands, islandLoadPu, lineABCD, linePi, linePu, lineNominalPu, abcdDet, sendingEnd, noLoadReceiving,
  losslessBeta, zBaseOhm, iBaseA, deltaLoad, pfCapacitor, surgeImpedance, silMW, lineLoss, excitationEmf, powerAngle, tapTau, transformerPu, transformerElements, changeBase, emptyNet, S_BASE_MVA, type Net, type NetBranch, type NetUnit,
} from './index';

const N = Number(process.env.GRID_FUZZ_N ?? 2000);
const RAD = 180 / Math.PI;

const br = (id: string, from: string, to: string, r: number, x: number, bc = 0, tau = 1, inService = true): NetBranch => ({ id, from, to, r, x, bc, tau, inService });
const bus = (id: string) => ({ id, kV: 138 });
function net3(): Net {
  const o = oracle('PS-12').inputs.lines as [number, number, [number, number], number][];
  return { ...emptyNet(), buses: ['1', '2', '3'].map(bus), branches: o.map(([f, t, z, b], k) => br(`l${k}`, String(f), String(t), z[0], z[1], b)) };
}

describe('lineModel: textbook ABCD oracles', () => {
  it('PS-06 short line (Z = 10 + j40 ohm, 50 MW pf 0.8 lag at 132 kV)', () => {
    const m = lineABCD('short', { zPerKm: cx(10, 40), yPerKm: cx(0), lengthKm: 1 });
    const VR = cx(132e3 / Math.sqrt(3)), I = 50e6 / (Math.sqrt(3) * 132e3 * 0.8);
    const IR = { re: I * 0.8, im: -I * 0.6 };
    const { VS } = sendingEnd(m, VR, IR);
    expectOracle('PS-06', 'VS_LL_kV', (abs(VS) * Math.sqrt(3)) / 1e3);
    expectOracle('PS-06', 'delta_deg', arg(VS) * RAD);
    expectOracle('PS-06', 'VR_pct', ((abs(VS) - abs(VR)) / abs(VR)) * 100);
    const loss = (3 * I * I * 10) / 1e6;
    expectOracle('PS-06', 'loss_MW', loss);
    expectOracle('PS-06', 'eta_pct', (50 / (50 + loss)) * 100);
    expectOracle('PS-11', 'eta_pct', (50 / (50 + loss)) * 100);
    expectOracle('PS-11', 'loss_MW', loss);
  });
  it('PS-07 nominal pi ABCD (Z = 20 + j80, Y = j5e-4 S, 60 MW pf 0.85 at 132 kV)', () => {
    const m = lineABCD('nominalPi', { zPerKm: cx(20, 80), yPerKm: cx(0, 5e-4), lengthKm: 1 });
    expectOracle('PS-07', 'A_re', m.A.re); expectOracle('PS-07', 'A_im', m.A.im);
    expectOracle('PS-07', 'B_mag', abs(m.B)); expectOracle('PS-07', 'B_deg', arg(m.B) * RAD);
    const VR = cx(132e3 / Math.sqrt(3)), I = 60e6 / (Math.sqrt(3) * 132e3 * 0.85);
    const { VS } = sendingEnd(m, VR, { re: I * 0.85, im: -I * Math.sqrt(1 - 0.85 * 0.85) });
    expectOracle('PS-07', 'VS_LL_kV', (abs(VS) * Math.sqrt(3)) / 1e3);
    const vr0 = abs(noLoadReceiving(m, VS));
    expectOracle('PS-07', 'VR_pct', ((vr0 - abs(VR)) / abs(VR)) * 100);
  });
  it('PS-08 long line, Ferranti (300 km, z = 0.1 + j0.5, y = j3.3e-6)', () => {
    const p = { zPerKm: cx(0.1, 0.5), yPerKm: cx(0, 3.3e-6), lengthKm: 300 };
    const m = lineABCD('long', p);
    expectOracle('PS-08', 'A_re', m.A.re); expectOracle('PS-08', 'A_im', m.A.im);
    const pi = linePi(p);
    expectOracle('PS-08', 'Zc_mag', abs(pi.Zc)); expectOracle('PS-08', 'Zc_deg', arg(pi.Zc) * RAD);
    const vr0 = abs(noLoadReceiving(m, cx(220))); // kV (line-to-line magnitudes scale together)
    expectOracle('PS-08', 'VR0_kV', vr0);
    expectOracle('PS-08', 'rise_pct', ((vr0 - 220) / 220) * 100);
  });
  it('G-11 lossless Ferranti (L = 1 mH/km, C = 11 nF/km, 300 km, 50 Hz)', () => {
    const beta = losslessBeta(1e-3, 11e-9, 50);
    expectOracle('G-11', 'beta_rad_km', beta);
    const w = 2 * Math.PI * 50;
    const m = lineABCD('long', { zPerKm: cx(0, w * 1e-3), yPerKm: cx(0, w * 11e-9), lengthKm: 300 });
    expect(m.A.im).toBeCloseTo(0, 12);
    expectOracle('G-11', 'rise_pct', (1 / m.A.re - 1) * 100);
  });
  it('L15 |A| of the 400 kV twin-moose 350 km line (exact pi) and no-load V_R', () => {
    const p = { zPerKm: cx(0.0347, 0.327), yPerKm: cx(0, 3.43e-6), lengthKm: 350 };
    const m = lineABCD('long', p);
    expect(Math.abs(abs(m.A) - level('L15').A_mag)).toBeLessThan(1e-9);
    expect(Math.abs(400 / abs(m.A) - level('L15').VR0_kV)).toBeLessThan(1e-6);
  });
});

describe('lineModel: equivalent pi', () => {
  const p = { zPerKm: cx(0.1, 0.5), yPerKm: cx(0, 3.3e-6), lengthKm: 300 };
  it('pi reproduces the ABCD of the long line (A = 1 + Z\'Y\'/2, B = Z\')', () => {
    const pi = linePi(p), m = lineABCD('long', p);
    const Yp = scale(pi.Yhalf, 2);
    const A = add(cx(1), scale(mul(pi.Zseries, Yp), 0.5));
    expect(abs(sub(A, m.A))).toBeLessThan(1e-12);
    expect(abs(sub(pi.Zseries, m.B))).toBeLessThan(1e-9);
  });
  it('length 0 is exactly zero impedance and zero charging', () => {
    const pu = linePu({ ...p, lengthKm: 0 }, 220);
    expect(pu).toEqual({ r: 0, x: 0, gc: 0, bc: 0 });
  });
  it('pu conversion: Z_base = kV^2/S_base', () => {
    const q = linePu({ ...p, lengthKm: 1e-3 }, 220);
    const zb = (220 * 220) / S_BASE_MVA;
    expect(q.r).toBeCloseTo((0.1 * 1e-3) / zb, 12);
    expect(q.x).toBeCloseTo((0.5 * 1e-3) / zb, 12);
  });
});

describe('P8 line-model limits (random lines)', () => {
  it(`AD - BC = 1, A = D, exact pi -> nominal pi with O(l^2) error [${N} cases]`, () => {
    const rng = new Rng(0x8a8);
    for (let k = 0; k < N; k++) {
      const seed = rng.state;
      const r = rng.range(0.02, 0.3), x = rng.range(0.25, 0.5), b = rng.range(2.5e-6, 4.5e-6);
      const p = { zPerKm: cx(r, x), yPerKm: cx(0, b), lengthKm: rng.range(1, 600) };
      for (const kind of ['short', 'nominalPi', 'long'] as const) {
        const m = lineABCD(kind, p);
        const d = abcdDet(m);
        expect(abs(sub(d, cx(1))), `seed ${seed} ${kind}`).toBeLessThan(1e-9);
        expect(abs(sub(m.A, m.D))).toBeLessThan(1e-12);
      }
      // error of the nominal pi against the exact pi scales like l^2 (more precisely l^3 in z; so ratio of errors for l and l/2 >= 3.5)
      const e = (l: number) => {
        const a = linePu({ ...p, lengthKm: l }, 220), n = lineNominalPu({ ...p, lengthKm: l }, 220);
        return Math.sqrt((a.x - n.x) ** 2 + (a.bc - n.bc) ** 2 + (a.r - n.r) ** 2) || 0;
      };
      const l0 = rng.range(5, 40);
      const ratio = e(l0) / Math.max(e(l0 / 2), 1e-300);
      expect(ratio, `seed ${seed} l ${l0}`).toBeGreaterThan(3.5);
      expect(e(l0 / 100) / (l0 / 100) ** 2 ).toBeLessThan(e(l0) / l0 ** 2 * 1.5 + 1e-12);
    }
  });
});

describe('transformer', () => {
  it('x_t = (%Z/100)(S_base/S_rated); r_t = x_t/(X/R); |z| preserved', () => {
    const t = transformerPu({ sRatedMVA: 50, zPercent: 10, xOverR: 20, noLoadKW: 30 });
    expect(Math.hypot(t.r, t.x)).toBeCloseTo(0.2, 12);
    expect(t.x / t.r).toBeCloseTo(20, 9);
    expect(t.gNoLoad).toBeCloseTo(0.0003, 12);
  });
  it('tap tau = 1 - 0.0125 n and range check', () => {
    expect(tapTau(0)).toBe(1); expect(tapTau(8)).toBeCloseTo(0.9, 12); expect(tapTau(-8)).toBeCloseTo(1.1, 12);
    expect(() => tapTau(9)).toThrow(/outside -8/);
  });
  it('no-load G sits at the HV bus', () => {
    const e = transformerElements({ id: 't', hvBus: 'H', lvBus: 'L', sRatedMVA: 40, zPercent: 12, xOverR: 15, noLoadKW: 20, tap: 2 });
    expect(e.shunt?.bus).toBe('H');
    expect(e.branch.tau).toBeCloseTo(0.975, 12);
    expect(e.branch.from).toBe('H');
  });
  it(`P7 pu invariance: impedance referred to HV or LV is the same in pu [${N} cases]`, () => {
    const rng = new Rng(0x707);
    for (let k = 0; k < N; k++) {
      const kvH = rng.range(60, 400), kvL = rng.range(3, 60), s = rng.range(5, 500), z = rng.range(4, 20);
      const t = transformerPu({ sRatedMVA: s, zPercent: z, xOverR: rng.range(5, 50) });
      const zHohm = (z / 100) * (kvH * kvH) / s; // ohm at HV
      const zLohm = zHohm * (kvL / kvH) ** 2; // ohm at LV
      const pu = (zHohm / ((kvH * kvH) / S_BASE_MVA));
      const pu2 = (zLohm / ((kvL * kvL) / S_BASE_MVA));
      expect(Math.abs(pu - pu2) / pu).toBeLessThan(1e-12);
      expect(Math.abs(Math.hypot(t.r, t.x) - pu * 1) / pu).toBeLessThan(1e-12);
      expect(Math.abs(changeBase(z / 100, s, kvH, S_BASE_MVA, kvH) - pu) / pu).toBeLessThan(1e-12);
    }
  });
});

describe('ybus', () => {
  it('PS-12 Y_bus with charging', () => {
    const y = buildYbus(net3());
    for (const [i, j] of [[1, 1], [1, 2], [1, 3], [2, 2], [2, 3], [3, 3]] as const) {
      expectOracle('PS-12', `Y${i}${j}_re`, y.G[i - 1][j - 1]);
      expectOracle('PS-12', `Y${i}${j}_im`, y.B[i - 1][j - 1]);
    }
  });
  it('P5 reciprocity: Y = Y^T without phase shifters, incl. taps (random networks)', () => {
    const rng = new Rng(0x505);
    for (let k = 0; k < N; k++) {
      const seed = rng.state;
      const n = rng.int(3, 30);
      const net: Net = { ...emptyNet(), buses: Array.from({ length: n }, (_, i) => bus(`b${i}`)) };
      for (let i = 1; i < n; i++) net.branches.push(br(`e${i}`, `b${rng.int(0, i - 1)}`, `b${i}`, rng.range(0.001, 0.1), rng.range(0.01, 0.4), rng.range(0, 0.2), rng.range(0.9, 1.1)));
      for (let e = 0; e < n; e++) net.branches.push(br(`x${e}`, `b${rng.int(0, n - 1)}`, `b${rng.int(0, n - 1)}`, rng.range(0.001, 0.1), rng.range(0.01, 0.4), rng.range(0, 0.2), rng.range(0.9, 1.1)));
      net.shunts.push({ id: 's', bus: 'b0', g: 0.001, b: rng.range(-1, 1), inService: true });
      const y = buildYbus(net);
      for (let i = 0; i < y.ids.length; i++) for (let j = 0; j < i; j++) {
        expect(y.G[i][j], `seed ${seed}`).toBeCloseTo(y.G[j][i], 12);
        expect(y.B[i][j]).toBeCloseTo(y.B[j][i], 12);
      }
    }
  });
  it('ordering: ids sorted, independent of input order', () => {
    const a = net3(); const b = net3(); b.buses.reverse(); b.branches.reverse();
    const ya = buildYbus(a), yb = buildYbus(b);
    expect(yb.ids).toEqual(ya.ids);
    expect(yb.G).toEqual(ya.G); expect(yb.B).toEqual(ya.B);
  });
  it('out-of-service branches are ignored; shunts stamp the diagonal (Q = b V^2)', () => {
    const n = net3(); n.branches[2].inService = false; n.shunts.push({ id: 's', bus: '2', g: 0.01, b: 0.5, inService: true });
    const y = buildYbus(n);
    expect(y.G[1][2]).toBe(0); expect(y.B[2][1]).toBe(0);
    const ref = branchY(n.branches[0]), ref2 = branchY(n.branches[1]);
    expect(y.B[1][1]).toBeCloseTo(ref.ttIm + 0.5, 12);
    expect(y.G[1][1]).toBeCloseTo(ref.ttRe + 0.01, 12);
    expect(y.B[0][0]).toBeCloseTo(ref.ffIm + ref2.ffIm, 12);
  });
  it('bus-tie merge for |z| < 1e-6 pu: merged buses map back to the originals', () => {
    const n: Net = { ...emptyNet(), buses: ['a', 'b', 'c', 'd'].map(bus), branches: [
      br('tie', 'b', 'c', 1e-8, 5e-7), br('l1', 'a', 'b', 0.01, 0.1), br('l2', 'c', 'd', 0.02, 0.2),
    ] };
    const y = buildYbus(n);
    expect(y.ids).toEqual(['a', 'b', 'd']);
    expect(y.mergedInto).toEqual({ a: 'a', b: 'b', c: 'b', d: 'd' });
    expect(y.ties).toEqual(['tie']);
    const l1 = branchY(n.branches[1]), l2 = branchY(n.branches[2]);
    expect(y.B[1][1]).toBeCloseTo(l1.ttIm + l2.ffIm, 12);
    expect(y.B[1][2]).toBeCloseTo(l2.ftIm, 12);
  });
  it('rejects a branch at an unknown bus with a teaching message', () => {
    const n = net3(); n.branches.push(br('bad', '1', 'zz', 0.1, 0.1));
    expect(() => buildYbus(n)).toThrow(/unknown bus zz/);
  });
});

describe('islands', () => {
  const unit = (id: string, busId: string, kind: NetUnit['kind'], p: number, pMax: number, online = true): NetUnit => ({ id, bus: busId, kind, online, p, pMax });
  const base = (): Net => ({
    ...emptyNet(), buses: ['a', 'b', 'c', 'd', 'e'].map(bus),
    branches: [br('ab', 'a', 'b', 0.01, 0.1), br('bc', 'b', 'c', 0.01, 0.1), br('de', 'd', 'e', 0.01, 0.1)],
    loads: [{ id: 'L1', bus: 'c', p: 0.5, q: 0.1 }, { id: 'L2', bus: 'e', p: 0.3, q: 0.1, zip: [0.2, 0.3, 0.5] }],
  });
  it('slack = former with the largest P_max - P headroom, ties by id', () => {
    const n = base();
    n.units = [unit('g2', 'a', 'sync', 0.5, 1.0), unit('g1', 'c', 'sync', 0.5, 1.0), unit('g3', 'b', 'sync', 0.8, 1.2)];
    const isl = findIslands(n);
    expect(isl.length).toBe(2);
    expect(isl[0].buses).toEqual(['a', 'b', 'c']);
    expect(isl[0].slackUnit).toBe('g1'); // g1 and g2 tie at 0.5: lowest id
    expect(isl[0].slackBus).toBe('c');
    n.units[2].pMax = 2.0; // headroom 1.2 now wins
    expect(findIslands(n)[0].slackUnit).toBe('g3');
  });
  it('grid-forming BESS can be the slack; offline units cannot', () => {
    const n = base();
    n.units = [unit('bess', 'd', 'bess-gfm', 0, 0.5), unit('g', 'a', 'sync', 0, 1, false)];
    const isl = findIslands(n);
    expect(isl[1].slackUnit).toBe('bess'); expect(isl[1].energised).toBe(true);
    expect(isl[0].energised).toBe(false);
  });
  it('island with only grid-following inverters is de-energised with a teaching reason key; load is ENS', () => {
    const n = base();
    n.units = [unit('pv', 'e', 'inverter', 0.2, 0.3), unit('g', 'a', 'sync', 0.3, 1)];
    const isl = findIslands(n);
    expect(isl[1].energised).toBe(false);
    expect(isl[1].reason).toEqual({ key: 'island.inverters-only' });
    expect(islandLoadPu(n, isl[1])).toBeCloseTo(0.3, 12);
    expect(islandLoadPu(n, isl[0])).toBeCloseTo(0.5, 12);
  });
  it('an island with nothing is de-energised; out-of-service branch splits islands', () => {
    const n = base(); n.branches[1].inService = false; n.units = [unit('g', 'a', 'sync', 0, 1)];
    const isl = findIslands(n);
    expect(isl.map((i) => i.buses)).toEqual([['a', 'b'], ['c'], ['d', 'e']]);
    expect(isl.map((i) => i.energised)).toEqual([true, false, false]);
    expect(isl[1].reason).toEqual({ key: 'island.no-source' });
  });
  it('deterministic: input order does not change islands or slack', () => {
    const n = base(); n.units = [unit('g1', 'a', 'sync', 0, 1), unit('g2', 'c', 'sync', 0, 1)];
    const m = JSON.parse(JSON.stringify(n)) as Net; m.units.reverse(); m.buses.reverse(); m.branches.reverse();
    expect(findIslands(m)).toEqual(findIslands(n));
  });
});


describe('closed-form oracles PS-01..05, 09, 10, 27, 28', () => {
  it('PS-01 per-unit bases', () => {
    const zb = zBaseOhm(100, 132);
    expectOracle('PS-01', 'Zb_ohm', zb);
    expectOracle('PS-01', 'Ib_A', iBaseA(100, 132));
    expectOracle('PS-01', 'z20_pu', 20 / zb);
    expectOracle('PS-01', 'z50_pu', 50 / zb);
  });
  it('PS-02 change of base', () => {
    expectOracle('PS-02', 'x_pu', changeBase(0.15, 30, 13.8, 100, 13.2));
  });
  it('PS-03 impedance diagram (zones 13.8 / 138 / 69 kV, 100 MVA)', () => {
    expectOracle('PS-03', 'Xg_pu', changeBase(0.20, 30, 13.8, 100, 13.8));
    expectOracle('PS-03', 'Xt1_pu', changeBase(0.10, 50, 13.8, 100, 13.8));
    const zb = zBaseOhm(100, 138);
    expectOracle('PS-03', 'line_r_pu', 40 / zb);
    expectOracle('PS-03', 'line_x_pu', 100 / zb);
    expectOracle('PS-03', 'Xt2_pu', changeBase(0.08, 40, 69, 100, 69));
  });
  it('PS-04 delta load', () => {
    const d = deltaLoad(400, 30, 30);
    expectOracle('PS-04', 'Iph_A', d.Iph); expectOracle('PS-04', 'IL_A', d.IL);
    expectOracle('PS-04', 'P_kW', d.P_kW); expectOracle('PS-04', 'Q_kvar', d.Q_kvar);
  });
  it('PS-05 power-factor capacitor', () => {
    const c = pfCapacitor(500, 440, 50, 0.7, 0.95);
    expectOracle('PS-05', 'Qc_kvar', c.Qc_kvar);
    expectOracle('PS-05', 'CY_uF', c.CY * 1e6); expectOracle('PS-05', 'CD_uF', c.CD * 1e6);
  });
  it('PS-09 SIL', () => {
    const zc = surgeImpedance(1e-3, 11e-9);
    expectOracle('PS-09', 'Zc_ohm', zc);
    expectOracle('PS-09', 'SIL400_MW', silMW(400, zc)); expectOracle('PS-09', 'SIL220_MW', silMW(220, zc));
  });
  it('PS-10 loss versus voltage', () => {
    const a = lineLoss(100, 132, 10), b = lineLoss(100, 220, 10);
    expectOracle('PS-10', 'I132_A', a.I); expectOracle('PS-10', 'loss132_MW', a.lossMW);
    expectOracle('PS-10', 'I220_A', b.I); expectOracle('PS-10', 'loss220_MW', b.lossMW);
  });
  it('PS-27 excitation emf and PS-28 max power (E taken unrounded from PS-27)', () => {
    const g = excitationEmf(1, 1, 1.2, 0.8);
    expectOracle('PS-27', 'E_pu', g.Emag); expectOracle('PS-27', 'delta_deg', g.deltaDeg);
    expectOracle('PS-28', 'Pmax_pu', powerAngle(g.Emag, 1, 1.2, 90));
    expectOracle('PS-28', 'P_at_delta_pu', powerAngle(g.Emag, 1, 1.2, g.deltaDeg));
  });
});
