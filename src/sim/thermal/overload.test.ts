import { describe, expect, it } from 'vitest';
import { Rng } from '@core/kit';
import { BLOCK_S, remainingS, stepOverload, tripTimeS, type OverloadState } from './overload';

describe('overload timers', () => {
  it('curve values', () => {
    expect(tripTimeS(1.2)).toBeCloseTo(600 / 0.44, 9);
    expect(tripTimeS(1.2, 'xfmr')).toBeCloseTo(1800 / 0.44, 9);
    expect(tripTimeS(1.5)).toBeCloseTo(480, 9);
    expect(tripTimeS(1.51)).toBe(5);
    expect(tripTimeS(1)).toBe(Infinity);
    expect(tripTimeS(0.5)).toBe(Infinity);
  });
  it('trips at the exact time and leaves the state', () => {
    const r = stepOverload({}, { a: { loading: 1.2, kind: 'line' } }, 2000);
    expect(r.trips).toHaveLength(1);
    expect(r.trips[0]!.atS).toBeCloseTo(600 / 0.44, 9);
    expect(r.state.a).toBeUndefined();
  });
  it('persists across steps while L > 1 and sums to the same trip time', () => {
    let s: OverloadState = {};
    let t = 0; let trip: number | null = null;
    while (trip === null) {
      const r = stepOverload(s, { a: { loading: 1.2, kind: 'line' } }, 10);
      s = r.state;
      if (r.trips.length) trip = t + r.trips[0]!.atS; else t += 10;
    }
    expect(trip).toBeCloseTo(600 / 0.44, 6);
  });
  it('holds between 0.95 and 1, resets after a full block below 0.95', () => {
    let s = stepOverload({}, { a: { loading: 1.2, kind: 'line' } }, 100).state;
    const f0 = s.a!.frac;
    expect(f0).toBeGreaterThan(0);
    s = stepOverload(s, { a: { loading: 0.97, kind: 'line' } }, 5000).state;
    expect(s.a!.frac).toBe(f0);
    s = stepOverload(s, { a: { loading: 0.9, kind: 'line' } }, BLOCK_S - 1).state;
    expect(s.a).toBeDefined();
    s = stepOverload(s, { a: { loading: 0.9, kind: 'line' } }, 1).state;
    expect(s.a).toBeUndefined();
  });
  it('overloading again after a dip restarts the below-0.95 clock', () => {
    let s = stepOverload({}, { a: { loading: 1.2, kind: 'line' } }, 100).state;
    s = stepOverload(s, { a: { loading: 0.9, kind: 'line' } }, 600).state;
    s = stepOverload(s, { a: { loading: 1.1, kind: 'line' } }, 10).state;
    expect(s.a!.belowS).toBe(0);
  });
  it('state is plain JSON and the input is not mutated', () => {
    const s: OverloadState = { a: { frac: 0.3, belowS: 0 } };
    const copy = JSON.stringify(s);
    const r = stepOverload(s, { a: { loading: 1.2, kind: 'line' }, b: { loading: 1.6, kind: 'xfmr' } }, 1);
    expect(JSON.stringify(s)).toBe(copy);
    expect(JSON.parse(JSON.stringify(r.state))).toEqual(r.state);
    expect(remainingS(s.a, 1.2)).toBeCloseTo(0.7 * 600 / 0.44, 9);
  });
  it('property: more loading never trips later (500 cases)', () => {
    const rng = new Rng(0x808);
    for (let i = 0; i < 500; i++) {
      const a = rng.range(1.001, 3), b = a * rng.range(1, 1.5);
      expect(tripTimeS(b)).toBeLessThanOrEqual(tripTimeS(a));
    }
  });
});
