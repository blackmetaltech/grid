import { describe, expect, it } from 'vitest';
import { emptyNet, type Net, type NetBranch } from '../network';
import { emptyCascadeState, runCascade } from './cascade';

const br = (id: string, from: string, to: string, x: number, rateMVA: number): NetBranch => ({ id, from, to, r: x / 10, x, bc: 0, rateMVA, inService: true });
const bus = (id: string) => ({ id, kV: 138 });
const gen = (id: string, b: string, p = 0, pMax = 100) => ({ id, bus: b, kind: 'sync' as const, online: true, p, pMax, vSet: 1, qMin: -100, qMax: 100 });

/** Three parallel 60 MVA lines feed 150 MW: 50 MW each; losing one puts 75 MW (L = 1.25) on the others. */
function meshed(): Net {
  return {
    ...emptyNet(), buses: [bus('1'), bus('2')],
    branches: [br('a', '1', '2', 0.10, 60), br('b', '1', '2', 0.11, 60), br('c', '1', '2', 0.12, 60)],
    loads: [{ id: 'ld', bus: '2', p: 1.5, q: 0.1 }], units: [gen('g', '1')],
  };
}
/** Radial feeder well inside its ratings, with an unloaded spur. */
function radial(): Net {
  return {
    ...emptyNet(), buses: [bus('1'), bus('2'), bus('3'), bus('4')],
    branches: [br('l12', '1', '2', 0.1, 200), br('l23', '2', '3', 0.1, 200), br('spur', '2', '4', 0.1, 50)],
    loads: [{ id: 'ld', bus: '3', p: 0.8, q: 0.1 }], units: [gen('g', '1')],
  };
}

describe('cascade', () => {
  it('one trip cascades through the meshed case (deterministic replay)', () => {
    const net = meshed();
    const r = runCascade(net, emptyCascadeState(), { trips: ['c'] });
    expect(r.replay.map((e) => [e.element, e.cause.key])).toEqual([
      ['c', 'cascade.initial-trip'],
      ['a', 'cascade.overload-trip'],
      ['b', 'cascade.overload-trip'],
    ]);
    expect(r.replay[0]!.tS).toBe(0);
    expect(r.replay[1]!.tS).toBeCloseTo(600 / (r.replay[1]!.quantities.loading! * r.replay[1]!.quantities.loading! - 1), 6);
    expect(r.replay[1]!.tS).toBeGreaterThan(600);
    // b had been accumulating too, so it finishes within the 5 s fast-trip time of its new loading
    expect(r.replay[2]!.tS - r.replay[1]!.tS).toBeGreaterThan(0);
    expect(r.replay[2]!.tS - r.replay[1]!.tS).toBeLessThanOrEqual(5);
    expect(r.replay[1]!.quantities.loading).toBeGreaterThan(1.25);
    expect(r.outcome).toBe('dark');
    expect(r.tripped).toEqual(['c', 'a', 'b']);
    expect(r.ensPu).toBeCloseTo(1.5, 9);
    const again = runCascade(net, emptyCascadeState(), { trips: ['c'] });
    expect(JSON.stringify(again.replay)).toBe(JSON.stringify(r.replay));
  });
  it('input net and state are never mutated; state is plain JSON', () => {
    const net = meshed(), st = emptyCascadeState();
    const a = JSON.stringify(net), b = JSON.stringify(st);
    const r = runCascade(net, st, { trips: ['c'] });
    expect(JSON.stringify(net)).toBe(a);
    expect(JSON.stringify(st)).toBe(b);
    expect(JSON.parse(JSON.stringify(r.state))).toEqual(r.state);
    expect(net.branches.every((x) => x.inService)).toBe(true);
  });
  it('no trip, healthy mesh: stable with an empty replay', () => {
    const r = runCascade(meshed(), emptyCascadeState());
    expect(r.outcome).toBe('stable');
    expect(r.replay).toEqual([]);
  });
  it('radial case stays stable, even after tripping the unloaded spur', () => {
    const r = runCascade(radial(), emptyCascadeState(), { trips: ['spur'] });
    expect(r.outcome).toBe('stable');
    expect(r.replay.map((e) => e.cause.key)).toEqual(['cascade.initial-trip']);
    expect(r.replay[0]!.freqWindow).toBe(false);
    expect(r.ensPu).toBe(0);
  });
  it('partial overload that clears: stable once the overloaded line is relieved', () => {
    // two lines, one tripped leaves 150 MW on a 150 MVA... use 1.2 loading then relieved by a second source
    const net = meshed();
    net.branches[0]!.rateMVA = 200;
    net.branches[1]!.rateMVA = 200;
    net.branches[2]!.rateMVA = 200;
    const r = runCascade(net, emptyCascadeState(), { trips: ['c'] });
    expect(r.outcome).toBe('stable');
  });
  it('generator trip flags a frequency window; a line trip that keeps the island does not', () => {
    const net = meshed();
    net.units.push(gen('g2', '2', 0.5, 100));
    net.units[0]!.p = 1.0;
    const gTrip = runCascade(net, emptyCascadeState(), { trips: ['g2'] });
    expect(gTrip.replay[0]!.freqWindow).toBe(true);
    const lTrip = runCascade(net, emptyCascadeState(), { trips: ['c'] });
    expect(lTrip.replay[0]!.freqWindow).toBe(false);
  });
  it('timers persist across calls (state carried in and out)', () => {
    const net = meshed();
    const first = runCascade(net, emptyCascadeState(), { trips: ['c'], horizonS: 300 });
    expect(first.outcome).toBe('horizon');
    expect(Object.keys(first.state.overload).length).toBeGreaterThan(0);
    const second = runCascade(first.net, first.state, { horizonS: 7200 });
    const full = runCascade(net, emptyCascadeState(), { trips: ['c'] });
    expect(second.replay.map((e) => e.element)).toEqual(['a', 'b']);
    expect(second.replay[0]!.tS).toBeCloseTo(full.replay[1]!.tS, 6);
  });
});
