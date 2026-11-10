import { describe, expect, it } from 'vitest';
import { cx, abs, sub, mul, add, type Complex } from '@core/numerics';
import { Rng } from '@core/kit';
import { expectOracle } from '../../oracles/expected';
import { branchY, S_BASE_MVA, type Net, type NetBranch } from '../network';
import { FaultStudy, llFault, slgFault, threePhaseFault } from './faults';
import type { FaultBranchInfo, FaultModel, FaultGen } from './sequence';

const N = Number(process.env.GRID_FUZZ_N ?? 2000);
const ZB = (138 * 138) / S_BASE_MVA; // 190.44 ohm
const br = (id: string, from: string, to: string, r: number, x: number, bc = 0, tau = 1): NetBranch => ({ id, from, to, r, x, bc, tau, inService: true });

/** PS-17/18/19: gen (X''d 0.15, X2 0.17, X0 0.05) - delta-YNg transformer (X 0.10) - 40 ohm line (X0 = 120 ohm) to fault bus F at 138 kV. */
function ps17(): FaultModel {
  const net: Net = {
    buses: [{ id: 'G', kV: 13.8 }, { id: 'H', kV: 138 }, { id: 'F', kV: 138 }],
    branches: [br('t1', 'G', 'H', 0, 0.1), br('l1', 'H', 'F', 0, 40 / ZB)],
    shunts: [], loads: [], units: [],
  };
  const gens: FaultGen[] = [{ bus: 'G', x1: 0.15, x2: 0.17, x0: 0.05 }];
  const branchInfo: Record<string, FaultBranchInfo> = { t1: { kind: 'xfmr', group: 'Dyn' }, l1: { kind: 'line', z0: { r: 0, x: 120 / ZB } } };
  return { net, gens, branchInfo };
}

describe('fault studies', () => {
  it('PS-17 3-phase fault (gen + delta-YNg + line)', () => {
    const r = threePhaseFault(ps17(), 'F');
    expect(r.ok).toBe(true);
    expectOracle('PS-17', 'Z1_pu', r.z1.im);
    expectOracle('PS-17', 'If_pu', r.iFaultPu);
    expectOracle('PS-17', 'If_kA', r.iFaultKA);
    expectOracle('PS-17', 'S_MVA', r.sMVA);
  });
  it('PS-18 SLG fault: gen X0 blocked by delta, line X0 = 120 ohm', () => {
    const r = slgFault(ps17(), 'F');
    expectOracle('PS-18', 'Z2_pu', r.z2.im);
    expectOracle('PS-18', 'Z0_pu', r.z0!.im);
    expectOracle('PS-18', 'Ia_pu', r.iFaultPu);
    expectOracle('PS-18', 'Ia_kA', r.iFaultKA);
  });
  it('PS-19 LL fault', () => {
    const r = llFault(ps17(), 'F');
    expectOracle('PS-19', 'Ib_pu', r.iFaultPu);
    expectOracle('PS-19', 'Ib_kA', r.iFaultKA);
  });
  it('G-18 two parallel 0.2 pu sources give 10 pu', () => {
    const net: Net = { buses: [{ id: 'B', kV: 138 }], branches: [], shunts: [], loads: [], units: [] };
    const r = threePhaseFault({ net, gens: [{ bus: 'B', x1: 0.2 }, { bus: 'B', x1: 0.2 }] }, 'B');
    expectOracle('G-18', 'If_pu', r.iFaultPu);
  });
  it('Yy transformer is open in zero sequence; YNd on the faulted side is a path', () => {
    const m = ps17();
    m.branchInfo!.t1 = { kind: 'xfmr', group: 'Yy' };
    const open = slgFault(m, 'F');
    expect(open.z0).toBeNull(); expect(open.iFaultPu).toBe(0); expect(open.msg?.key).toBe('fault.no-zero-sequence-path');
    m.branchInfo!.t1 = { kind: 'xfmr', group: 'YNyn' };
    const pass = slgFault(m, 'F'); // gen X0 0.05 now passes: Z0 = 0.05 + 0.1 + 0.6301
    expect(pass.z0!.im).toBeCloseTo(0.05 + 0.1 + 120 / ZB, 9);
    m.branchInfo!.t1 = { kind: 'xfmr', group: 'YNd' }; // YN side = G (from): from-side shunt only, F sees line only through H (open)
    expect(slgFault(m, 'F').z0).toBeNull();
  });
  it('neutral impedance enters Z0 three times', () => {
    const m = ps17();
    m.branchInfo!.t1 = { kind: 'xfmr', group: 'YNyn' };
    m.gens[0]!.zn = { r: 0, x: 0.1 };
    expect(slgFault(m, 'F').z0!.im).toBeCloseTo(0.05 + 0.3 + 0.1 + 120 / ZB, 9);
    m.gens[0]!.zn = null;
    expect(slgFault(m, 'F').z0).toBeNull();
  });
  it('dark / unknown bus gives a result object, not a throw', () => {
    const m = ps17();
    m.net.buses.push({ id: 'X', kV: 138 });
    expect(threePhaseFault(m, 'X').msg?.key).toBe('fault.no-source');
    expect(threePhaseFault(m, 'nope').ok).toBe(false);
  });
  it('pre-fault voltage from a load flow scales the current', () => {
    const r = threePhaseFault(ps17(), 'F', { vPre: { V: { G: 1.05, H: 1.05, F: 1.05 }, theta: { G: 0.1, H: 0.1, F: 0.1 } } });
    expect(r.iFaultPu).toBeCloseTo(1.05 * 2.1737244606780046, 9);
  });
});

function randomModel(rng: Rng): { m: FaultModel; fb: string } {
  const n = rng.int(3, 9);
  const ids = Array.from({ length: n }, (_, i) => `b${i}`);
  const branches: NetBranch[] = [];
  for (let i = 1; i < n; i++) branches.push(br(`e${i}`, ids[rng.int(0, i - 1)]!, ids[i]!, rng.range(0.001, 0.05), rng.range(0.02, 0.3), rng.range(0, 0.05), rng.chance(0.3) ? rng.range(0.9, 1.1) : 1));
  const extra = rng.int(0, n);
  for (let j = 0; j < extra; j++) { const a = rng.int(0, n - 1); let b = rng.int(0, n - 1); if (a === b) b = (b + 1) % n; branches.push(br(`x${j}`, ids[a]!, ids[b]!, rng.range(0.001, 0.05), rng.range(0.02, 0.3), rng.range(0, 0.05))); }
  const gens: FaultGen[] = [];
  for (let g = 0; g < rng.int(1, 3); g++) gens.push({ bus: ids[rng.int(0, n - 1)]!, x1: rng.range(0.1, 0.4), x2: rng.range(0.1, 0.4), x0: rng.range(0.03, 0.2) });
  const branchInfo: Record<string, FaultBranchInfo> = {};
  for (const b of branches) if (rng.chance(0.4)) branchInfo[b.id] = { kind: 'xfmr', group: rng.pick(['YNyn', 'YNd', 'Dyn', 'Yy'] as const) };
  const shunts = rng.chance(0.5) ? [{ id: 's', bus: ids[rng.int(0, n - 1)]!, b: rng.range(0, 0.2), inService: true }] : [];
  return { m: { net: { buses: ids.map((id) => ({ id, kV: 138 })), branches, shunts, loads: [], units: [] }, gens, branchInfo }, fb: ids[rng.int(0, n - 1)]! };
}

describe('P19 fault superposition (random networks)', () => {
  it(`V_post = V_pre - Z I_f, KCL at the fault bus, balanced 3-phase has no neg/zero-seq current (${N} cases)`, () => {
    const seed = 0x19f;
    const rng = new Rng(seed);
    for (let c = 0; c < N; c++) {
      const { m, fb } = randomModel(rng);
      const zf = rng.chance(0.5) ? cx(rng.range(0, 0.05), rng.range(0, 0.05)) : cx(0, 0);
      const st = new FaultStudy(m);
      const r = st.fault(fb, '3ph', { zf });
      const tag = `seed ${seed} case ${c}`;
      expect(r.ok, tag).toBe(true);
      expect(abs(r.i2) + abs(r.i0), tag).toBe(0);
      // V_post at fault bus = Z_f I_f (V_pre = 1)
      const vk = r.V1[fb]!;
      const zfi = mul(zf, r.i1);
      expect(abs(sub(vk, zfi)), tag).toBeLessThan(1e-9);
      // KCL: delta-voltage currents leaving the fault bus through branches and gen/shunt admittances = -I_f
      const dv = (id: string): Complex => sub(r.V1[id]!, cx(1, 0));
      let sum: Complex = cx(0, 0);
      for (const b of m.net.branches) {
        const y = branchY(b);
        if (b.from === fb) sum = add(sum, add(mul(cx(y.ffRe, y.ffIm), dv(b.from)), mul(cx(y.ftRe, y.ftIm), dv(b.to))));
        if (b.to === fb) sum = add(sum, add(mul(cx(y.tfRe, y.tfIm), dv(b.from)), mul(cx(y.ttRe, y.ttIm), dv(b.to))));
      }
      for (const g of m.gens) if (g.bus === fb) sum = add(sum, mul(cx(0, -1 / g.x1), dv(fb)));
      for (const s of m.net.shunts) if (s.bus === fb) sum = add(sum, mul(cx(0, s.b), dv(fb)));
      expect(abs(add(sum, r.i1)), tag).toBeLessThan(1e-8 * Math.max(1, abs(r.i1)));
      // unsymmetrical faults: sequence currents obey their definitions
      const s = st.fault(fb, 'slg', { zf });
      if (s.z0) { expect(abs(sub(s.i1, s.i2)), tag).toBeLessThan(1e-12); expect(abs(sub(s.i1, s.i0)), tag).toBeLessThan(1e-12); }
      const l = st.fault(fb, 'll', { zf });
      expect(abs(add(l.i1, l.i2)), tag).toBeLessThan(1e-12);
      expect(abs(l.i0), tag).toBe(0);
    }
  });
});
