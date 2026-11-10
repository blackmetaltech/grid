import { describe, it, expect } from 'vitest';
import { cx, abs } from '@core/numerics';
import { GROUND, solveMna, cableLoopR, rFromResistivity, type Elem } from './index';

const V = (id: string, a: string, e: number, z?: number): Elem => ({ kind: 'V', id, a, b: GROUND, e: cx(e), z: z === undefined ? undefined : cx(z) });

describe('mna unit cases', () => {
  it('voltage divider', () => {
    const r = solveMna([V('s', 'a', 10), { kind: 'R', id: 'r1', a: 'a', b: 'b', r: 1 }, { kind: 'R', id: 'r2', a: 'b', b: GROUND, r: 3 }]);
    expect(r.ok && r.V.b.re).toBeCloseTo(7.5, 12);
  });
  it('omega = 0: inductor is a short, capacitor is open', () => {
    const r = solveMna([V('s', 'a', 12), { kind: 'L', id: 'L', a: 'a', b: 'b', h: 0.5 }, { kind: 'R', id: 'R', a: 'b', b: GROUND, r: 4 },
      { kind: 'C', id: 'C', a: 'b', b: GROUND, f: 1e-3 }], 0);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.V.b.re).toBeCloseTo(12, 12); expect(abs(r.I.C)).toBe(0); expect(r.I.L.re).toBeCloseTo(3, 12); }
  });
  it('R = 0 element is a short without division', () => {
    const r = solveMna([V('s', 'a', 5), { kind: 'R', id: 'w', a: 'a', b: 'b', r: 0 }, { kind: 'R', id: 'R', a: 'b', b: GROUND, r: 5 }]);
    expect(r.ok && r.I.R.re).toBeCloseTo(1, 12);
  });
  it('floating node island is reported with the node names', () => {
    const r = solveMna([V('s', 'a', 5), { kind: 'R', id: 'r1', a: 'a', b: GROUND, r: 1 }, { kind: 'R', id: 'r2', a: 'x', b: 'y', r: 1 }]);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.error.key).toBe('bench.singular.floating'); expect(r.error.nodes).toEqual(expect.arrayContaining(['x', 'y'])); }
  });
  it('loop of ideal voltage sources is reported with the source ids', () => {
    const r = solveMna([V('s1', 'a', 5), V('s2', 'a', 6), { kind: 'R', id: 'r', a: 'a', b: GROUND, r: 1 }]);
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.error.key).toBe('bench.singular.sourceLoop'); expect(r.error.elements).toEqual(expect.arrayContaining(['s1', 's2'])); }
  });
  it('sources with internal impedance in parallel solve (no loop)', () => {
    const r = solveMna([V('s1', 'a', 10, 1), V('s2', 'a', 20, 1), { kind: 'R', id: 'r', a: 'a', b: GROUND, r: 1e9 }]);
    expect(r.ok && r.V.a.re).toBeCloseTo(15, 6);
  });
  it('constant-power load: solves on the high-voltage branch, P delivered exactly', () => {
    const r = solveMna([V('s', 's', 100), { kind: 'R', id: 'R', a: 's', b: 'f', r: 1 }, { kind: 'CPL', id: 'P', a: 'f', b: GROUND, p: 500 }]);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.S.P.re).toBeCloseTo(500, 7); expect(r.V.f.re).toBeGreaterThan(50); }
  });
  it('constant-power load beyond the nose collapses (a result, not an exception)', () => {
    const r = solveMna([V('s', 's', 100), { kind: 'R', id: 'R', a: 's', b: 'f', r: 10 }, { kind: 'CPL', id: 'P', a: 'f', b: GROUND, p: 1000 }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.key).toBe('bench.collapse');
  });
  it('constant-power load just under the nose (Pmax = V^2/4R) still solves', () => {
    const r = solveMna([V('s', 's', 100), { kind: 'R', id: 'R', a: 's', b: 'f', r: 10 }, { kind: 'CPL', id: 'P', a: 'f', b: GROUND, p: 249 }]);
    expect(r.ok).toBe(true);
  });
  it('invalid inputs give bench.invalid, never NaN or a throw', () => {
    const a = solveMna([{ kind: 'R', id: 'r', a: 'a', b: GROUND, r: NaN }]);
    const b = solveMna([V('s', 'a', 1), V('s', 'a', 1)]);
    const c = solveMna([V('s', 'a', 1)], -1);
    for (const r of [a, b, c]) { expect(r.ok).toBe(false); if (!r.ok) expect(r.error.key).toBe('bench.invalid'); }
  });
  it('cable helpers', () => {
    expect(cableLoopR(0.727, 1000)).toBeCloseTo(1.454, 12);
    expect(rFromResistivity(1.724e-8, 600, 2.5)).toBeCloseTo(4.1376, 10);
  });
  it('ideal transformer: step-down, impedance reflection', () => {
    const r = solveMna([V('s', 'p', 100), { kind: 'T', id: 'T', a: 'p', b: GROUND, c: 'q', d: GROUND, n: 0.5 }, { kind: 'R', id: 'R', a: 'q', b: GROUND, r: 10 }]);
    expect(r.ok && r.V.q.re).toBeCloseTo(50, 10);
    expect(r.ok && abs(r.I.s)).toBeCloseTo(2.5, 10); // 5 A secondary x n = 2.5 A primary
  });
});
