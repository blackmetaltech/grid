import { describe, expect, it } from 'vitest';
import { BF_DELAY_S, clearFault, clearingTimeS, conductorAnneals, maxFaultDurationS, breakerFails, type Breaker } from './breakers';

const brk = (id: string, ratedKA: number, cycles: number, adjacent: string[]): Breaker => ({ id, ratedKA, cycles, adjacent });

describe('breakers', () => {
  it('clearing time = relay + cycles at f0', () => {
    expect(clearingTimeS(0.03, 2, 50)).toBeCloseTo(0.07, 12);
    expect(clearingTimeS(0.03, 3, 60)).toBeCloseTo(0.08, 12);
    expect(clearingTimeS(0, 5, 50)).toBeCloseTo(0.1, 12);
  });
  it('fails only above the rating', () => {
    expect(breakerFails({ ratedKA: 31.5 }, 31.5)).toBe(false);
    expect(breakerFails({ ratedKA: 31.5 }, 31.51)).toBe(true);
  });
  it('healthy breaker opens after relay + interrupting time', () => {
    const r = clearFault([brk('A', 40, 2, ['B']), brk('B', 40, 2, ['A'])], { A: 0.03 }, { A: 20 }, 50);
    expect(r.failed).toEqual([]);
    expect(r.events).toHaveLength(1);
    expect(r.events[0]!.tS).toBeCloseTo(0.07, 12);
  });
  it('failed breaker: adjacent breakers open after 200 ms (S7), deterministic order', () => {
    const bs = [brk('A', 25, 3, ['C', 'B']), brk('B', 63, 2, ['A']), brk('C', 63, 5, ['A'])];
    const r = clearFault(bs, { A: 0.03 }, { A: 40, B: 40, C: 40 }, 50);
    expect(r.failed).toEqual(['A']);
    expect(r.events.map((e) => [e.breaker, e.cause.key])).toEqual([['B', 'breaker.failure-backup'], ['C', 'breaker.failure-backup']]);
    expect(r.events[0]!.tS).toBeCloseTo(0.03 + BF_DELAY_S + 0.04, 12);
    expect(r.events[1]!.tS).toBeCloseTo(0.03 + BF_DELAY_S + 0.1, 12);
    expect(r.stuck).toEqual(['A']);
    expect(r.clearedAtS).toBe(Infinity);
  });
  it('adjacent over-duty breaker stays stuck', () => {
    const r = clearFault([brk('A', 25, 2, ['B']), brk('B', 25, 2, ['A'])], { A: 0.1 }, { A: 40, B: 40 }, 50);
    expect(r.stuck).toEqual(['A', 'B']);
    expect(r.events).toEqual([]);
  });
});

describe('conductor adiabatic limit', () => {
  it('I2t <= (K A)^2 with K = 76 for aluminium', () => {
    // 150 mm2: K A = 11400 A s^0.5; 20 kA survives 0.3249 s
    expect(maxFaultDurationS(20000, 150)).toBeCloseTo((11400 / 20000) * (11400 / 20000), 12);
    expect(conductorAnneals(20000, 0.3, 150)).toBe(false);
    expect(conductorAnneals(20000, 0.33, 150)).toBe(true);
    expect(maxFaultDurationS(0, 150)).toBe(Infinity);
  });
});
