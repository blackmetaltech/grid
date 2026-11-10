// P14 monotonic remedies (radial feeders) and P25 continuation correctness on random networks (DESIGN 9.2).
import { describe, expect, it } from 'vitest';
import { Rng } from '@core/kit/rng';
import type { Net } from '../network';
import { buildCases, continuationCase, solveCase, solveNetwork, tryLambda } from './index';
import { genNetwork } from './gen';

const N = Number(process.env.GRID_FUZZ_N ?? 2000);

describe('P14 monotonic remedies (radial, constant-power lagging loads, no charging)', () => {
  it('lower R never lowers a load voltage; adding a capacitor at a PQ bus raises its |V| (normal operating region)', () => {
    const rng = new Rng(0x1414);
    let rChecked = 0, cChecked = 0, skipped = 0;
    for (let k = 0; k < N; k++) {
      const seed = 31_000_000 + k;
      const net = genNetwork(seed, { maxBuses: 20, loadFactor: [0.3, 0.8], radial: true });
      const base = solveNetwork(net, { continuation: false });
      const vmin = Math.min(...Object.values(base.V));
      if (!base.converged || vmin < 0.85) { skipped++; continue; }
      // (a) halve the resistance of one random branch
      const i = rng.int(0, net.branches.length - 1);
      const better: Net = { ...net, branches: net.branches.map((b, j) => (j === i ? { ...b, r: b.r * 0.5 } : b)) };
      const s2 = solveNetwork(better, { continuation: false });
      if (s2.converged) {
        rChecked++;
        for (const l of net.loads) expect(s2.V[l.bus]!, `seed ${seed} branch ${net.branches[i]!.id} bus ${l.bus}`).toBeGreaterThanOrEqual(base.V[l.bus]! - 1e-9);
      } else skipped++;
      // (b) add a capacitor at a random load bus
      const l = net.loads[rng.int(0, net.loads.length - 1)]!;
      if (net.units.some((u) => u.bus === l.bus)) continue; // PQ buses only
      const capd: Net = { ...net, shunts: [...net.shunts, { id: 'cap', bus: l.bus, b: rng.range(0.02, 0.2), inService: true }] };
      const s3 = solveNetwork(capd, { continuation: false });
      if (s3.converged && Math.min(...Object.values(s3.V)) > 0.85) { cChecked++; expect(s3.V[l.bus]!, `seed ${seed} cap at ${l.bus}`).toBeGreaterThan(base.V[l.bus]! - 1e-12); }
      else skipped++;
    }
    console.log(`P14 R-halving checks ${rChecked}, capacitor checks ${cChecked}, skipped (not normal region / not converged) ${skipped}`);
    expect(rChecked).toBeGreaterThan(0.5 * N);
    expect(cChecked).toBeGreaterThan(0.3 * N);
  });
});

describe('P25 continuation correctness', () => {
  it('when Newton fails: lambda* is convergent and lambda* + 0.01 is not (or lambda* = 1); sheds are 5 % steps', () => {
    let failing = 0, notFailing = 0, collapsed = 0, resolved = 0, unresolved = 0, shedSteps = 0;
    for (let k = 0; k < N; k++) {
      const seed = 41_000_000 + k;
      const net = genNetwork(seed, { maxBuses: 12, islandProb: 0, loadFactor: [1.5, 6] });
      for (const { c } of buildCases(net).cases) {
        const direct = solveCase(c, {});
        if (direct.converged) { notFailing++; continue; }
        failing++;
        const r = continuationCase(c);
        if (r.atLambdaStar === null) { unresolved++; continue; } // not even load 0 solvable: reported, not silent
        const warm = { V: r.atLambdaStar.V, th: r.atLambdaStar.th };
        expect(r.atLambdaStar.converged && r.atLambdaStar.residual < 1e-8, `seed ${seed} lambda* ${r.lambdaStar}`).toBe(true);
        if (r.lambdaStar < 1) { collapsed++; expect(tryLambda(c, Math.min(1, r.lambdaStar + 0.01), warm).converged, `seed ${seed} lambda*+0.01`).toBe(false); }
        if (r.collapsed) {
          shedSteps += r.sheds.length;
          if (r.solution) resolved++; else unresolved++;
          for (const s of r.sheds) expect(Math.abs(s.fraction * 20 - Math.round(s.fraction * 20)), `seed ${seed}`).toBeLessThan(1e-9);
        }
      }
    }
    console.log(`P25 newton failed ${failing} (converged directly ${notFailing}); collapse ${collapsed}, sheds converged ${resolved}, unresolved ${unresolved}, shed steps ${shedSteps}`);
    expect(failing).toBeGreaterThan(0.3 * N);
    expect(unresolved).toBeLessThan(0.02 * failing + 1);
  });
});
