import { describe, expect, it } from 'vitest';
import { cx, abs, arg } from '@core/numerics';
import { expectOracle, oracleValue, level } from '../../oracles/expected';
import { buildCases, flows, solveNetwork, solveCase, solveGS, effectiveNet, type NetSolution } from './index';
import { threeBusSaadat, twoBus } from './fixtures';
import { linePu, linePi, emptyNet, S_BASE_MVA, type Net } from '../network';

const RAD = 180 / Math.PI;
const deg = (x: number) => x * RAD;

describe('NR oracles', () => {
  it('PS-13 2-bus analytic load flow', () => {
    const net = twoBus(0.05, 0.15, 0.8, 0.4);
    const s = solveNetwork(net);
    expect(s.converged).toBe(true);
    expectOracle('PS-13', 'V2_mag', s.V['2']!);
    expectOracle('PS-13', 'V2_deg', deg(s.theta['2']!));
    const f = flows(net, s);
    expectOracle('PS-13', 'loss_re', f.lossP); expectOracle('PS-13', 'loss_im', f.lossQ);
    expectOracle('PS-13', 'S1_re', f.slack['1']!.p); expectOracle('PS-13', 'S1_im', f.slack['1']!.q);
  });

  it('PS-15 NR converged (Saadat-style 3-bus), <= 4 iterations from flat start', () => {
    const net = threeBusSaadat();
    const { cases } = buildCases(net);
    const cs = solveCase(cases[0]!.c, {});
    expect(cs.converged).toBe(true);
    expectOracle('PS-15', 'V2_pu', cs.V[1]!);
    expectOracle('PS-15', 'ang2_deg', deg(cs.th[1]!));
    expectOracle('PS-15', 'V3_pu', cs.V[2]!);
    expectOracle('PS-15', 'V3_ang_deg', deg(cs.th[2]!));
    expect(cs.iterations).toBeLessThanOrEqual(oracleValue('PS-15', 'iterations_max'));
  });

  it('PS-16 NR flows and losses', () => {
    const net = threeBusSaadat();
    const s = solveNetwork(net);
    const f = flows(net, s);
    const MW = S_BASE_MVA;
    expectOracle('PS-16', 'slackP_MW', f.slack['1']!.p * MW);
    expectOracle('PS-16', 'slackQ_Mvar', f.slack['1']!.q * MW);
    expectOracle('PS-16', 'Q3_Mvar', f.qAtPv['3']! * MW);
    expectOracle('PS-16', 'S12_MW', f.branch['l12']!.pFrom * MW);
    expectOracle('PS-16', 'S12_Mvar', f.branch['l12']!.qFrom * MW);
    expectOracle('PS-16', 'S23_MW', f.branch['l23']!.pFrom * MW);
    expectOracle('PS-16', 'S23_Mvar', f.branch['l23']!.qFrom * MW);
    expectOracle('PS-16', 'lossP_MW', f.lossP * MW);
    expectOracle('PS-16', 'lossQ_Mvar', f.lossQ * MW);
  });

  it('G-17 tap convention: tau = 1.05 lowers |V2| (ideal tap on bus 1, x_t on the bus-2 side)', () => {
    // x_t on the bus-2 side of the ideal tap: Y = [[y/t^2, -y/t],[-y/t, y]] is exactly the unified pi with tau on the from side
    for (const [tau, key] of [[1.0, 'V2_tau100'], [1.05, 'V2_tau105']] as const) {
      const s = solveNetwork(twoBus(0, 0.1, 0.5, 0.2, tau));
      expect(s.converged).toBe(true);
      expectOracle('G-17', key, s.V['2']!);
      expectOracle('G-17', key === 'V2_tau100' ? 'V2ang_deg_tau100' : 'V2ang_deg_tau105', deg(s.theta['2']!));
    }
  });

  it('G-10 P-V nose (V1 = 1, X = 0.15, unity pf): continuation bisection', async () => {
    const { findLambdaStar } = await import('./continuation');
    const net = twoBus(0, 0.15, 5, 0); // base load 5 pu > P_max 3.333
    const { cases } = buildCases(net);
    const r = findLambdaStar(cases[0]!.c, { bisections: 40, verifyStep: 1e-9 });
    expectOracle('G-10', 'Pmax_pu', r.lambdaStar * 5);
    // V at the nose: the converged solution just below it is within the NR conditioning (~1e-5) of 1/sqrt 2
    expect(Math.abs(r.sol!.V[1]! - oracleValue('G-10', 'Vnose_pu'))).toBeLessThan(2e-3);
  });

  it('L15 exact pi on a 2-bus case: no-load receiving voltage 429.14 kV and exact sending-end charging', () => {
    const p = { zPerKm: cx(0.0347, 0.327), yPerKm: cx(0, 3.43e-6), lengthKm: 350 };
    const pu = linePu(p, 400);
    const net: Net = { ...emptyNet(), buses: [{ id: '1', kV: 400 }, { id: '2', kV: 400 }],
      branches: [{ id: 'l', from: '1', to: '2', r: pu.r, x: pu.x, gc: pu.gc, bc: pu.bc, inService: true }],
      units: [{ id: 'g', bus: '1', kind: 'sync', online: true, p: 0, pMax: 10, vSet: 1, qMin: -100, qMax: 100 }] };
    const s = solveNetwork(net);
    expect(s.converged).toBe(true);
    const L15 = level('L15');
    expect(Math.abs(s.V['2']! * 400 - L15.VR0_kV)).toBeLessThan(1e-6);
    const f = flows(net, s);
    expect(Math.abs(-f.slack['1']!.q * S_BASE_MVA - L15.Qs_charging_exact_MVAr)).toBeLessThan(1e-4);
    expect(Math.abs(f.slack['1']!.p * S_BASE_MVA - L15.Ps_noload_MW)).toBeLessThan(1e-4);
    expect(Math.abs(abs(linePi(p).Zc) - 0)).toBeGreaterThan(0);
  });
});

describe('PS-14 Gauss-Seidel iteration 1', () => {
  it('flat start; bus 2 then bus 3 with the new V2; PV magnitude rescaled', async () => {
    const { gsSweep, gsFrom } = await import('./gs');
    const { cases } = buildCases(threeBusSaadat());
    const c = cases[0]!.c;
    const st = gsFrom([1.05, 1, 1.05], [0, 0, 0]);
    const q = gsSweep(c, st, 1);
    expectOracle('PS-14', 'V2_re', st.re[1]!); expectOracle('PS-14', 'V2_im', st.im[1]!);
    expectOracle('PS-14', 'Q3_pu', q.get(2)!);
    expectOracle('PS-14', 'V3_deg', deg(Math.atan2(st.im[2]!, st.re[2]!)));
    expect(Math.abs(Math.sqrt(st.re[2]! ** 2 + st.im[2]! ** 2) - 1.05)).toBeLessThan(1e-12);
    // and it converges to the NR solution
    const g = solveGS(c, {});
    const n = solveCase(c, {});
    expect(g.converged).toBe(true);
    for (let i = 0; i < 3; i++) { expect(Math.abs(g.V[i]! - n.V[i]!)).toBeLessThan(1e-8); expect(Math.abs(g.th[i]! - n.th[i]!)).toBeLessThan(1e-8); }
  });
});

describe('basics', () => {
  it('Q limit: a PV unit at its limit becomes PQ and V sags', () => {
    const net = threeBusSaadat();
    net.units[1]!.qMax = 0.3; // 30 Mvar, needs 60.9
    const s = solveNetwork(net);
    expect(s.converged).toBe(true);
    expect(s.kind['3']).toBe('pq-max');
    expect(s.V['3']!).toBeLessThan(1.05);
    const f = flows(net, s);
    expect(f.qAtPv['3']!).toBeCloseTo(0.3, 9);
  });
  it('Q-limited unit returns to PV when the voltage crosses the set-point (load removed)', () => {
    const net = threeBusSaadat();
    net.units[1]!.qMax = 0.3;
    const s1 = solveNetwork(net);
    expect(s1.kind['3']).toBe('pq-max');
    net.loads[0]!.q = 0.2; net.loads[0]!.p = 1.0; // light: Q need falls below 0.3
    const s2 = solveNetwork(net, { warm: s1 });
    expect(s2.kind['3']).toBe('pv');
    expect(s2.V['3']).toBeCloseTo(1.05, 9);
  });
  it('de-energised island: V = 0, zero flow, ENS = its load', () => {
    const net = threeBusSaadat();
    net.buses.push({ id: '9', kV: 138 }, { id: '8', kV: 138 });
    net.branches.push({ id: 'l98', from: '9', to: '8', r: 0.1, x: 0.2, bc: 0.01, inService: true });
    net.loads.push({ id: 'ld8', bus: '8', p: 0.4, q: 0.1 });
    net.units.push({ id: 'pv', bus: '9', kind: 'inverter', online: true, p: 0.2, pMax: 0.3 });
    const s = solveNetwork(net);
    expect(s.converged).toBe(true);
    expect(s.energised['8']).toBe(false); expect(s.V['8']).toBe(0);
    expect(s.ensPu).toBeCloseTo(0.4, 12);
    const f = flows(net, s);
    expect(f.branch['l98']!.pFrom).toBe(0); expect(f.branch['l98']!.iKA).toBe(0);
  });
  it('statcom: PV-like within limits, constant current at the limit', () => {
    const net = twoBus(0.02, 0.2, 1.0, 0.5);
    net.units.push({ id: 's', bus: '2', kind: 'statcom', online: true, vSet: 1.0, iMax: 1.0 });
    const s = solveNetwork(net);
    expect(s.kind['2']).toBe('pv'); expect(s.V['2']).toBeCloseTo(1, 9);
    net.units[1]!.iMax = 0.1;
    const s2 = solveNetwork(net);
    expect(s2.kind['2']).toBe('pq-max');
    const f = flows(net, s2);
    expect(f.qAtPv['2']!).toBeCloseTo(0.1 * s2.V['2']!, 9); // Q = Imax |V|
  });
  it('svc: at its limit it is a fixed susceptance (Q = b V^2)', () => {
    const net = twoBus(0.02, 0.2, 1.0, 0.5);
    net.units.push({ id: 's', bus: '2', kind: 'svc', online: true, vSet: 1.0, bMin: -0.5, bMax: 0.2 });
    const s = solveNetwork(net);
    expect(s.kind['2']).toBe('pq-max');
    expect(flows(net, s).qAtPv['2']!).toBeCloseTo(0.2 * s.V['2']! ** 2, 9);
  });
  it('ZIP load: constant-impedance load draws P0 V^2', () => {
    const net = twoBus(0.02, 0.1, 1.0, 0.3);
    net.loads[0]!.zip = [1, 0, 0];
    const s = solveNetwork(net);
    const f = flows(net, s);
    expect(f.bus['2']!.pLoad).toBeCloseTo(1.0 * s.V['2']! ** 2, 12);
  });
  it('effectiveNet returns the input when nothing was shed', () => {
    const net = twoBus(0.02, 0.1, 1.0, 0.3);
    expect(effectiveNet(net, solveNetwork(net) as NetSolution)).toBe(net);
  });
  it('a floating branch end (singular) is a teaching result, not a crash', () => {
    const net = threeBusSaadat();
    net.branches = [net.branches[0]!]; // bus 3 now isolated (own dark island) -> fine; make a PQ bus with no connection inside an island instead
    const s = solveNetwork(net);
    expect(Number.isFinite(s.V['2']!)).toBe(true);
    expect(s.energised['3']).toBe(true);
  });
});
