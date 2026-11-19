import { describe, expect, it } from 'vitest';
import { dmath } from '@core/numerics';
import { solveRadial, chainFeeder, type RadialFeeder } from './radial';
import { solveNetwork, flows } from '../loadflow';
import { emptyNet, S_BASE_MVA, type Net } from '../network';

const KV = 11;
const zBase = (KV * KV) / S_BASE_MVA;

describe('radial backward-forward sweep', () => {
  it('2-bus agrees with the closed form (quartic in V^2)', () => {
    const r = 3, x = 4, p = 800, q = 300; // ohm, kW, kvar
    const f = chainFeeder(KV, [{ id: 'a', rOhm: r, xOhm: x, pKw: p, qKvar: q }]);
    const res = solveRadial(f);
    // V1 = 1 pu: x2 = V2^2 solves x2^2 + (2 (r P + x Q) - 1) x2 + |z|^2 |S|^2 = 0 (pu on 100 MVA)
    const rr = r / zBase, xx = x / zBase, PP = p / 1000 / S_BASE_MVA, QQ = q / 1000 / S_BASE_MVA;
    const B = 2 * (rr * PP + xx * QQ) - 1, C = (rr * rr + xx * xx) * (PP * PP + QQ * QQ);
    const x2 = (-B + dmath.sqrt(B * B - 4 * C)) / 2;
    expect(res.converged).toBe(true);
    expect(dmath.abs(res.byId['a']!.vPu - dmath.sqrt(x2))).toBeLessThan(1e-9);
  });

  it('small radial tree agrees with Newton-Raphson within 1e-6 pu', () => {
    const f: RadialFeeder = { kV: KV, nodes: [
      { id: 's', parent: null, rOhm: 0, xOhm: 0, pKw: 0, qKvar: 0 },
      { id: 'a', parent: 's', rOhm: 0.8, xOhm: 0.9, pKw: 700, qKvar: 250 },
      { id: 'b', parent: 'a', rOhm: 1.1, xOhm: 0.8, pKw: 500, qKvar: 150 },
      { id: 'c', parent: 'a', rOhm: 0.6, xOhm: 0.7, pKw: 400, qKvar: 200 },
      { id: 'd', parent: 'c', rOhm: 1.5, xOhm: 1.0, pKw: -300, qKvar: 0 }, // a PV node
    ] };
    const net: Net = { ...emptyNet(), buses: f.nodes.map((n) => ({ id: n.id, kV: KV })), branches: [], loads: [],
      units: [{ id: 'g', bus: 's', kind: 'sync', online: true, p: 0, pMax: 100, vSet: 1, qMin: -100, qMax: 100 }] };
    for (const n of f.nodes) if (n.parent) {
      net.branches.push({ id: 'l' + n.id, from: n.parent, to: n.id, r: n.rOhm / zBase, x: n.xOhm / zBase, bc: 0, tau: 1, inService: true });
      net.loads.push({ id: 'ld' + n.id, bus: n.id, p: n.pKw / 1000 / S_BASE_MVA, q: n.qKvar / 1000 / S_BASE_MVA });
    }
    const nr = solveNetwork(net);
    const sw = solveRadial(f);
    expect(nr.converged && sw.converged).toBe(true);
    for (const n of f.nodes) expect(dmath.abs(sw.byId[n.id]!.vPu - nr.V[n.id]!)).toBeLessThan(1e-6);
    expect(dmath.abs(sw.lossKw / 1000 / S_BASE_MVA - flows(net, nr).lossP)).toBeLessThan(1e-6);
  });

  it('off-load tap lifts a no-load node by exactly the tap', () => {
    const f = chainFeeder(KV, [{ id: 'a', rOhm: 1, xOhm: 1, pKw: 0, qKvar: 0, tapPct: 2.5 }]);
    expect(solveRadial(f).byId['a']!.vPu).toBeCloseTo(1.025, 12);
  });

  it('a step regulator brings a drooping feeder back into its band', () => {
    const f = chainFeeder(KV, [
      { id: 'a', rOhm: 2, xOhm: 2, pKw: 1500, qKvar: 500 },
      { id: 'b', rOhm: 2, xOhm: 2, pKw: 1500, qKvar: 500 },
    ]);
    const base = solveRadial(f);
    f.nodes[2]!.regulator = { vSetPu: 1.0, bandPu: 0.01 };
    const reg = solveRadial(f);
    expect(base.minVPu).toBeLessThan(0.93);
    expect(reg.minVPu).toBeGreaterThan(base.minVPu + 0.03);
    expect(reg.regSteps['b']!).toBeGreaterThan(0);
  });

  it('rejects a malformed tree', () => {
    expect(() => solveRadial({ kV: 11, nodes: [{ id: 'a', parent: 'zz', rOhm: 1, xOhm: 1, pKw: 0, qKvar: 0 }] })).toThrow();
  });
});
