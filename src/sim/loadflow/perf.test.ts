import { describe, expect, it } from 'vitest';
import { genNetwork } from './gen';
import { buildCases, setScale, solveCase } from './index';

describe('perf sanity (real harness is a later task)', () => {
  it('60-bus warm-start NR solve: median <= 10 ms (budget 3 ms desktop)', () => {
    let net = genNetwork(7, { minBuses: 60, maxBuses: 60, islandProb: 0, loadFactor: [0.5, 0.7] });
    for (let s = 8; buildCases(net).cases.length !== 1 || buildCases(net).cases[0]!.c.n < 55; s++) net = genNetwork(s, { minBuses: 60, maxBuses: 60, islandProb: 0, loadFactor: [0.5, 0.7] });
    const c = buildCases(net).cases[0]!.c;
    const first = solveCase(c, {});
    expect(first.converged).toBe(true);
    setScale(c, 0.97, 0.97);
    const warm = { V: first.V, th: first.th };
    const times: number[] = [];
    let its = 0;
    for (let i = 0; i < 60; i++) {
      const t0 = performance.now();
      const r = solveCase(c, { warm, warmKinds: first.kinds });
      times.push(performance.now() - t0); its += r.iterations;
      expect(r.converged).toBe(true);
    }
    times.sort((a, b) => a - b);
    const med = times[30]!;
    console.log(`60-bus warm NR median ${med.toFixed(2)} ms, mean iterations ${(its / 60).toFixed(1)}`);
    expect(med).toBeLessThanOrEqual(10);
  });
});
