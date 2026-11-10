import { describe, it, expect } from 'vitest';
import { cx, abs, add, sub, mul, conj, scale, cSolve, cZeros, polarDeg, type Complex } from '@core/numerics';
import { Rng } from '@core/kit';
import {
  GROUND, solveMna, atHarmonic, solveFourWire, solveSiConstZ, type Elem,
} from './index';

const N = Number(process.env.GRID_FUZZ_N ?? 2000);

describe('P3 Tellegen on random connected circuits', () => {
  it(`sum V_k conj(I_k) = 0 (${N} circuits)`, () => {
    const seed = 3031;
    const rng = new Rng(seed);
    for (let c = 0; c < N; c++) {
      const n = rng.int(2, 7); // nodes 1..n plus ground
      const names = [GROUND, ...Array.from({ length: n }, (_, i) => `n${i + 1}`)];
      const el: Elem[] = [];
      let id = 0;
      const rv = () => rng.range(1, 100);
      const passive = (a: string, b: string): Elem => {
        const k = rng.int(0, 3), i = `e${id++}`;
        if (k === 0) return { kind: 'R', id: i, a, b, r: rv() };
        if (k === 1) return { kind: 'L', id: i, a, b, h: rv() / 100 };
        if (k === 2) return { kind: 'C', id: i, a, b, f: 1 / (100 * rv()) };
        return { kind: 'Z', id: i, a, b, z: cx(rv(), rng.range(-50, 50)) };
      };
      for (let k = 1; k < names.length; k++) el.push(passive(names[k], names[rng.int(0, k - 1)])); // spanning tree incl. ground
      for (let x = 0, extra = rng.int(0, 4); x < extra; x++) { const a = rng.int(0, n), b = rng.int(0, n); if (a !== b) el.push(passive(names[a], names[b])); }
      for (let x = 0, ns = rng.int(1, 3); x < ns; x++) {
        const a = names[rng.int(1, n)], b = names[rng.int(0, n)];
        if (a === b) continue;
        el.push({ kind: 'V', id: `v${id++}`, a, b, e: cx(rng.range(-300, 300), rng.range(-300, 300)), z: cx(rng.range(0.1, 5), rng.range(0, 5)) });
      }
      for (let x = 0, ni = rng.int(0, 2); x < ni; x++) {
        const a = names[rng.int(0, n)], b = names[rng.int(1, n)];
        if (a !== b) el.push({ kind: 'I', id: `i${id++}`, a, b, i: cx(rng.range(-5, 5), rng.range(-5, 5)) });
      }
      const r = solveMna(el, 100 * rng.range(0.5, 3));
      expect(r.ok, `seed ${seed} case ${c}`).toBe(true);
      if (r.ok) expect(r.tellegen, `seed ${seed} case ${c}`).toBeLessThan(1e-9);
    }
  });
});

describe('P21 harmonic path at h = 1 equals the fundamental MNA solution', () => {
  it(`(${Math.min(N, 500)} circuits)`, () => {
    const seed = 2121; const rng = new Rng(seed);
    for (let c = 0; c < Math.min(N, 500); c++) {
      const w0 = 2 * Math.PI * rng.range(40, 60);
      const el: Elem[] = [
        { kind: 'V', id: 'g', a: 's', b: GROUND, e: cx(rng.range(100, 400), rng.range(-50, 50)) },
        { kind: 'R', id: 'rs', a: 's', b: 'p', r: rng.range(0.1, 2) },
        { kind: 'L', id: 'ls', a: 'p', b: 'q', h: rng.range(1e-3, 5e-2) },
        { kind: 'C', id: 'cb', a: 'q', b: GROUND, f: rng.range(1e-5, 5e-4) },
        { kind: 'L', id: 'lb', a: 'p', b: GROUND, h: rng.range(1e-2, 1) },
        { kind: 'I', id: 'ld', a: 'p', b: GROUND, i: cx(rng.range(0, 20), rng.range(-5, 5)) },
      ];
      const a = solveMna(el, w0), b = solveMna(atHarmonic(el, w0, 1, true), w0);
      expect(a.ok && b.ok).toBe(true);
      if (a.ok && b.ok) for (const k of Object.keys(a.V)) expect(abs(sub(a.V[k], b.V[k])) / (1 + abs(a.V[k])), `seed ${seed} case ${c}`).toBeLessThan(1e-9);
    }
  });
});

describe('P22 balanced 4-wire gives zero neutral current', () => {
  it(`I_N < 1e-12 A (${N} feeders); unbalanced is non-zero`, () => {
    const seed = 2222; const rng = new Rng(seed);
    for (let c = 0; c < N; c++) {
      const z = cx(rng.range(5, 50), rng.range(-10, 10));
      const segs = Array.from({ length: rng.int(1, 3) }, () => ({ zPhase: cx(rng.range(0.01, 0.5), rng.range(0, 0.2)), zNeutral: cx(rng.range(0.01, 0.8), rng.range(0, 0.2)) }));
      const ld = { at: segs.length, a: { kind: 'Z', z } as const, b: { kind: 'Z', z } as const, c: { kind: 'Z', z } as const };
      const r = solveFourWire({ vPhase: 230, segments: segs, loads: [ld], w: 314.159 });
      expect(r.ok, `seed ${seed} case ${c}`).toBe(true);
      if (r.ok) expect(abs(r.iN), `seed ${seed} case ${c}`).toBeLessThan(1e-12);
    }
    const u = solveFourWire({ vPhase: 230, segments: [{ zPhase: cx(0.1), zNeutral: cx(0.1) }], loads: [{ at: 1, a: { kind: 'Z', z: cx(10) }, b: { kind: 'Z', z: cx(20) }, c: { kind: 'Z', z: cx(30) } }] });
    expect(u.ok && abs(u.iN)).toBeGreaterThan(1);
  });
});

describe('P6 SI constant-Z MNA equals an independent pu Y-bus nodal solve', () => {
  it(`(${N} networks)`, () => {
    const seed = 606; const rng = new Rng(seed);
    for (let c = 0; c < N; c++) {
      const nb = rng.int(2, 6); const vb = rng.range(200, 20000); const sb = 1e6; const zb = (vb * vb) / sb;
      const nodes = Array.from({ length: nb }, (_, i) => `b${i}`);
      const br: { id: string; a: string; b: string; z: Complex }[] = [];
      for (let k = 1; k < nb; k++) br.push({ id: `t${k}`, a: nodes[k], b: nodes[rng.int(0, k - 1)], z: cx(rng.range(0.001, 0.05) * zb, rng.range(0.002, 0.1) * zb) });
      for (let x = 0, ex = rng.int(0, 3); x < ex; x++) { const a = rng.int(0, nb - 1), b = rng.int(0, nb - 1); if (a !== b) br.push({ id: `x${x}`, a: nodes[a], b: nodes[b], z: cx(rng.range(0.01, 0.1) * zb, rng.range(0.02, 0.2) * zb) }); }
      const loads = nodes.slice(1).map((node) => ({ node, p: rng.range(0, 0.1) * sb, q: rng.range(-0.03, 0.05) * sb, vnom: vb }));
      const slackV = polarDeg(vb, rng.range(-10, 10));
      const si = solveSiConstZ({ slack: { node: nodes[0], v: slackV }, branches: br, loads });
      expect(si.ok, `seed ${seed} case ${c}`).toBe(true);
      // independent pu Y-bus
      const Y = cZeros(nb, nb);
      const ix = (n: string) => nodes.indexOf(n);
      for (const b of br) {
        const y = { re: 0, im: 0 }; const d = b.z.re * b.z.re + b.z.im * b.z.im;
        y.re = (b.z.re / d) * zb; y.im = (-b.z.im / d) * zb; // y_pu = y * Zbase
        const i = ix(b.a), j = ix(b.b);
        Y[i][i] = add(Y[i][i], y); Y[j][j] = add(Y[j][j], y); Y[i][j] = sub(Y[i][j], y); Y[j][i] = sub(Y[j][i], y);
      }
      for (const l of loads) { const i = ix(l.node); Y[i][i] = add(Y[i][i], cx((l.p / sb), -(l.q / sb))); } // y_pu = conj(S_pu)/|V_pu|^2, Vnom = Vbase
      const vs = cx(slackV.re / vb, slackV.im / vb);
      const A = cZeros(nb - 1, nb - 1); const rhs: Complex[] = [];
      for (let i = 1; i < nb; i++) { for (let j = 1; j < nb; j++) A[i - 1][j - 1] = Y[i][j]; rhs.push(scale(mul(Y[i][0], vs), -1)); }
      const x = cSolve(A, rhs);
      if (si.ok) for (let i = 1; i < nb; i++) {
        const phys = si.V[nodes[i]]; const ref = scale(x[i - 1], vb);
        expect(abs(sub(phys, ref)) / vb, `seed ${seed} case ${c}`).toBeLessThan(1e-9);
      }
      // currents match too: slack injection
    }
  });
});
