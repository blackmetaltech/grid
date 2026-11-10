import { describe, expect, it } from 'vitest';
import { cx, dmath as dm } from '@core/numerics';
import { level } from '../../oracles/expected';
import { buildCases, findLambdaStar, continuationCase, tryLambda, solveNetwork, flows, effectiveNet, sensitivities, dcFlow } from './index';
import { threeBusSaadat, twoBus } from './fixtures';
import { emptyNet, linePu, type Net } from '../network';

/** L17 city: slack 1.0 pu behind the ring (x_s = 0.02) and n circuits of twin-Zebra 220 kV 150 km (exact pi), load at pf 0.92. */
function l17Net(n: number, opts: { capsMVAr?: number; statcomMVAr?: number; loadPu?: number } = {}): Net {
  const pu = linePu({ zPerKm: cx(0.0418, 0.302), yPerKm: cx(0, 3.72e-6), lengthKm: 150 }, 220, 100, n);
  const P = opts.loadPu ?? 6, tan = dm.tan(dm.acos(0.92));
  const net: Net = {
    ...emptyNet(), buses: [{ id: '1', kV: 220 }, { id: '2', kV: 220 }],
    // the reviewer's script puts the receiving-end half of the pi at the load bus and the sending half across the ideal source
    branches: [{ id: 'l', from: '1', to: '2', r: pu.r, x: pu.x + 0.02, inService: true, bc: 0 }],
    shunts: [{ id: 'pi', bus: '2', g: pu.gc / 2, b: pu.bc / 2, inService: true }],
    loads: [{ id: 'city', bus: '2', p: P, q: P * tan }],
    units: [{ id: 'g', bus: '1', kind: 'sync', online: true, p: 0, pMax: 100, vSet: 1, qMin: -100, qMax: 100 }],
  };
  if (opts.capsMVAr) net.shunts.push({ id: 'caps', bus: '2', b: opts.capsMVAr / 100, inService: true });
  if (opts.statcomMVAr) net.units.push({ id: 'sc', bus: '2', kind: 'statcom', online: true, vSet: 1.0, iMax: opts.statcomMVAr / 100 });
  return net;
}

function loadability(net: Net, base: number): number {
  const { cases } = buildCases(net);
  const r = findLambdaStar(cases[0]!.c, { bisections: 40, verifyStep: 1e-9 });
  return r.lambdaStar * base * 100;
}

describe('L17 loadability table (the lesson gate physics)', () => {
  const L = level('L17');
  /** the reviewer script (tools/oracles/review/l17_catalogue.py) adds the line charging with the wrong sign (S_in = V I* + |V|^2 conj(Ysh)),
   *  i.e. it treats the pi shunt as an inductive load. flipSign reproduces that model so the solver can be checked against expected.json. */
  const mk = (n: number, o: { capsMVAr?: number; statcomMVAr?: number; loadPu?: number }, flip: boolean): Net => {
    const net = l17Net(n, o);
    if (flip) { const s = net.shunts[0]!; s.g = -(s.g ?? 0); s.b = -s.b; }
    return net;
  };
  const rows: [string, number, { capsMVAr?: number; statcomMVAr?: number; loadPu?: number }, number, number][] = [
    // name, circuits, options, reference (expected.json, reviewer sign), physically correct charging sign (engine, pinned)
    ['none, N-1 (one circuit)', 1, {}, L.none_N1.Pmax_MW, 274.32],
    ['80 MVAr caps, N-1', 1, { capsMVAr: 80 }, L.caps80_N1.Pmax_MW, 300.05],
    ['STATCOM +-100 MVAr, N-1', 1, { statcomMVAr: 100 }, L.statcom100_N1.Pmax_MW, 325.67],
    ['STATCOM +-200 MVAr, N-1', 1, { statcomMVAr: 200 }, L.statcom200_N1.Pmax_MW, 379.32],
    ['none, both circuits', 2, { loadPu: 8 }, L.none_both.Pmax_MW, 473.03],
  ];
  for (const [name, n, o, ref, phys] of rows) {
    it(`${name}: engine solver reproduces expected.json (${ref.toFixed(2)} MW) within 1 MW when the reviewer's charging sign is used`, () => {
      const net = mk(n, o, true);
      const pm = loadability(net, net.loads[0]!.p);
      expect(Math.abs(pm - ref), `engine ${pm.toFixed(3)} MW`).toBeLessThan(1);
    });
    it(`${name}: physically correct charging (shunt generates Q) gives ${phys} MW`, () => {
      const net = mk(n, o, false);
      const pm = loadability(net, net.loads[0]!.p);
      expect(Math.abs(pm - phys), `engine ${pm.toFixed(3)} MW`).toBeLessThan(0.05);
    });
  }
  it('KNOWN ISSUE: with correct physics the caps-only loadability (300.05 MW) is only 0.05 MW above the 300 MW trip load', () => {
    const caps = loadability(mk(1, { capsMVAr: 80 }, false), 6);
    expect(caps).toBeGreaterThan(300); expect(caps).toBeLessThan(300.5);
    expect(loadability(mk(1, { statcomMVAr: 100 }, false), 6)).toBeGreaterThan(320);
  });
});

describe('continuation and voltage collapse', () => {
  it('overloaded 2-bus case: Newton fails, continuation sheds in 5 % steps and converges; ENS reported', () => {
    const net = twoBus(0, 0.15, 5, 0.5); // beyond the nose (~3.2 pu at this pf)
    const s = solveNetwork(net);
    expect(s.converged).toBe(true);
    const col = s.islands[0]!.collapse;
    expect(col).not.toBeNull();
    expect(col!.lambdaStar).toBeLessThan(1);
    expect(col!.sheds.length).toBeGreaterThan(0);
    expect(col!.sheds.every((x) => Math.abs(x.fraction * 20 - Math.round(x.fraction * 20)) < 1e-9)).toBe(true);
    expect(s.ensPu).toBeGreaterThan(0);
    expect(s.shed['ld2']).toBeGreaterThan(0);
    // solved case is physically the reduced load
    const eff = effectiveNet(net, s);
    const f = flows(eff, s);
    expect(f.totalLoadP).toBeCloseTo(5 * (1 - s.shed['ld2']!), 9);
    expect(s.V['2']!).toBeGreaterThan(0.5);
  });
  it('P25 on a 3-bus overload: lambda* convergent and lambda*+0.01 not', () => {
    const net = threeBusSaadat(); net.loads[0]!.p *= 12; net.loads[0]!.q *= 12;
    const { cases } = buildCases(net);
    const c = cases[0]!.c;
    const r = continuationCase(c);
    expect(r.collapsed).toBe(true);
    const warm = { V: r.atLambdaStar!.V, th: r.atLambdaStar!.th };
    expect(tryLambda(c, r.lambdaStar, warm).converged).toBe(true);
    expect(tryLambda(c, r.lambdaStar + 0.01, warm).converged).toBe(false);
  });
  it('a dead island with nothing is not a collapse', () => {
    const net = twoBus(0.02, 0.1, 0.5, 0.1);
    net.units[0]!.online = false;
    const s = solveNetwork(net);
    expect(s.converged).toBe(true); expect(s.ensPu).toBeCloseTo(0.5, 12);
  });
});

describe('sensitivities', () => {
  it('dV/dQ matches a finite difference; dPL/dPi matches a finite difference', () => {
    const base = threeBusSaadat();
    const s0 = solveNetwork(base);
    const sens = sensitivities(base, s0);
    // dV2/dQ2: inject extra generation Q at bus 2 (negative load)
    const eps = 1e-5;
    const n2 = JSON.parse(JSON.stringify(base)) as Net; n2.loads[0]!.q -= eps;
    const s2 = solveNetwork(n2);
    expect(Math.abs((s2.V['2']! - s0.V['2']!) / eps - sens.dVdQ['2']!['2']!)).toBeLessThan(1e-4);
    // loss sensitivity at bus 3 (PV unit): dP_L/dP_3
    const n3 = JSON.parse(JSON.stringify(base)) as Net; n3.units[1]!.p! += eps;
    const s3 = solveNetwork(n3);
    const pl = (n: Net, s: typeof s0) => flows(n, s).totalLossP;
    expect(Math.abs((pl(n3, s3) - pl(base, s0)) / eps - sens.dLossdP['3']!)).toBeLessThan(1e-4);
    // and at the load bus 2 (extra load = negative generation)
    const n4 = JSON.parse(JSON.stringify(base)) as Net; n4.loads[0]!.p -= eps;
    const s4 = solveNetwork(n4);
    expect(Math.abs((pl(n4, s4) - pl(base, s0)) / eps - sens.dLossdP['2']!)).toBeLessThan(1e-4);
    expect(sens.penalty['2']!).toBeGreaterThan(0.8);
  });
});

describe('DC flow (L16 lab)', () => {
  it('lightly loaded case: DC angles and flows within a few percent of AC', () => {
    const net = threeBusSaadat();
    net.loads[0]!.p = 0.4; net.loads[0]!.q = 0.05; net.units[1]!.p = 0.2;
    net.branches.forEach((b) => { b.r *= 0.1; }); // DC assumes r << x
    const ac = solveNetwork(net), dc = dcFlow(net), f = flows(net, ac);
    for (const id of ['2', '3']) expect(Math.abs(dc.theta[id]! - ac.theta[id]!)).toBeLessThan(0.1 * Math.abs(ac.theta[id]!) + 2e-3);
    for (const b of net.branches) expect(Math.abs(dc.flow[b.id]! - f.branch[b.id]!.pFrom)).toBeLessThan(0.05);
    expect(dc.slackP['1']!).toBeCloseTo(0.4 - 0.2, 9);
  });
});
