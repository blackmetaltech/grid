// Complex modified nodal analysis (DESIGN 3.5). Every element carries one branch-current unknown i (a -> b inside the
// element) and one row  sum_k rowV_k V_k - q i = rhs, so omega = 0 and R = 0 need no division. Pure; never throws.
import {
  cx, add, sub, mul, abs, scale, conj, cZeros, cSolve, cSingularityReport, SingularMatrixError, newton, ZERO,
  type Complex,
} from '@core/numerics';
import type { Msg } from '../network/types';

/** Reference node name. */
export const GROUND = '0';

export type Elem =
  | { kind: 'R'; id: string; a: string; b: string; r: number } // ohm
  | { kind: 'L'; id: string; a: string; b: string; h: number } // henry
  | { kind: 'C'; id: string; a: string; b: string; f: number } // farad
  | { kind: 'Z'; id: string; a: string; b: string; z: Complex } // ohm
  | { kind: 'Y'; id: string; a: string; b: string; y: Complex } // siemens
  /** Voltage source: Va - Vb = e + z i (terminal a positive; z = internal impedance, default 0). */
  | { kind: 'V'; id: string; a: string; b: string; e: Complex; z?: Complex }
  /** Current source: current a -> b inside the element equals i. */
  | { kind: 'I'; id: string; a: string; b: string; i: Complex }
  /** Constant-impedance load: Z = vnom^2/(p - jq) from P (W), Q (var) at nominal V (volts). */
  | { kind: 'LOAD'; id: string; a: string; b: string; p: number; q: number; vnom: number }
  /** Ideal transformer: V(c)-V(d) = n (V(a)-V(b)), turns ratio n = Ns/Np; primary a-b, secondary c-d. Branch current = secondary current delivered into node c (primary current = n x that, division-free). */
  | { kind: 'T'; id: string; a: string; b: string; c: string; d: string; n: number }
  /** Constant-power load: absorbs S = (p + jq)/eta (W, var) from a-b (CPL / DC-DC converter with efficiency eta). */
  | { kind: 'CPL'; id: string; a: string; b: string; p: number; q?: number; eta?: number };

export interface BenchError extends Msg { nodes: string[]; elements: string[] }
export interface BenchOk {
  ok: true;
  w: number;
  /** Node voltages (V), ground = 0. */
  V: Record<string, Complex>;
  /** Branch current a -> b inside each element (A). */
  I: Record<string, Complex>;
  /** Absorbed complex power V conj(I) per element (VA); negative real part = delivering. */
  S: Record<string, Complex>;
  /** |sum S| / sum |S| (Tellegen residual). */
  tellegen: number;
}
export interface BenchFail { ok: false; error: BenchError }
export type BenchResult = BenchOk | BenchFail;

interface Spec { nodes: string[]; inc: number[]; rowV: Complex[]; q: Complex; rhs: Complex }

const fail = (key: string, nodes: string[] = [], elements: string[] = [], params: Record<string, string | number> = {}): BenchFail =>
  ({ ok: false, error: { key, params, nodes, elements } });

const fin = (z: Complex) => Number.isFinite(z.re) && Number.isFinite(z.im);

function spec(e: Elem, w: number): Spec | null {
  const two = (p: Complex, q: Complex, rhs: Complex = ZERO): Spec => {
    const x = e as { a: string; b: string };
    return { nodes: [x.a, x.b], inc: [1, -1], rowV: [p, scale(p, -1)], q, rhs };
  };
  switch (e.kind) {
    case 'R': return two(cx(1), cx(e.r));
    case 'L': return two(cx(1), cx(0, w * e.h));
    case 'C': return two(cx(0, w * e.f), cx(1));
    case 'Z': return two(cx(1), e.z);
    case 'Y': return two(e.y, cx(1));
    case 'V': return two(cx(1), e.z ?? ZERO, e.e);
    case 'I': return two(ZERO, cx(-1), e.i);
    case 'LOAD': {
      const s2 = e.p * e.p + e.q * e.q;
      if (s2 === 0) return two(ZERO, cx(1));
      const v2 = e.vnom * e.vnom; // Z = V^2 / conj(S) = V^2 (p + jq)/|S|^2
      return two(cx(1), cx((v2 * e.p) / s2, (v2 * e.q) / s2));
    }
    case 'T': return { nodes: [e.a, e.b, e.c, e.d], inc: [e.n, -e.n, -1, 1], rowV: [cx(-e.n), cx(e.n), cx(1), cx(-1)], q: ZERO, rhs: ZERO };
    case 'CPL': return two(ZERO, cx(1)); // placeholder row (open circuit); nonlinear rows are added in solve
  }
}

/** Series loop resistance of a cable run: R = r20 (ohm/km) x length (km) x cores (stated value, no temperature factor). */
export function cableLoopR(rPerKm20C: number, lengthM: number, cores = 2): number { return rPerKm20C * (lengthM / 1000) * cores; }
/** R = rho L / A  (ohm; rho in ohm m, length in m, area in mm^2). */
export function rFromResistivity(rho: number, lengthM: number, areaMm2: number): number { return (rho * lengthM) / (areaMm2 * 1e-6); }

/** Solve the circuit at angular frequency w (rad/s; 0 = DC). Returns node voltages, branch currents, powers or a teaching error. */
export function solveMna(elems: Elem[], w = 0): BenchResult {
  if (!Number.isFinite(w) || w < 0) return fail('bench.invalid', [], [], { what: 'omega' });
  const ids = new Set<string>();
  for (const e of elems) {
    if (ids.has(e.id)) return fail('bench.invalid', [], [e.id], { what: 'duplicate' });
    ids.add(e.id);
    const nums = e.kind === 'R' ? [e.r] : e.kind === 'L' ? [e.h] : e.kind === 'C' ? [e.f] : e.kind === 'T' ? [e.n]
      : e.kind === 'LOAD' ? [e.p, e.q, e.vnom] : e.kind === 'CPL' ? [e.p, e.q ?? 0, e.eta ?? 1] : [];
    const cxs = e.kind === 'Z' ? [e.z] : e.kind === 'Y' ? [e.y] : e.kind === 'V' ? [e.e, e.z ?? ZERO] : e.kind === 'I' ? [e.i] : [];
    if (nums.some((v) => !Number.isFinite(v)) || cxs.some((z) => !fin(z)) || (e.kind === 'CPL' && (e.eta ?? 1) <= 0))
      return fail('bench.invalid', [], [e.id], { what: 'value' });
  }
  const nodeSet = new Set<string>();
  for (const e of elems) for (const n of e.kind === 'T' ? [e.a, e.b, e.c, e.d] : [e.a, e.b]) if (n !== GROUND) nodeSet.add(n);
  const nodes = [...nodeSet];
  const nn = nodes.length, m = elems.length, N = nn + m;
  const idx = new Map(nodes.map((n, i) => [n, i] as const));
  const A = cZeros(N, N); const b: Complex[] = Array.from({ length: N }, () => cx(0));
  const specs = elems.map((e) => spec(e, w) as Spec);
  const cpl: number[] = [];
  elems.forEach((e, k) => {
    const s = specs[k], row = nn + k;
    s.nodes.forEach((n, j) => {
      const c = idx.get(n);
      if (c === undefined) return;
      A[c][nn + k] = add(A[c][nn + k], cx(s.inc[j])); // KCL: branch current leaves node
      A[row][c] = add(A[row][c], s.rowV[j]);
    });
    A[row][nn + k] = sub(A[row][nn + k], s.q);
    b[row] = s.rhs;
    if (e.kind === 'CPL') cpl.push(k);
  });

  const singular = (): BenchFail => {
    const rep = cSingularityReport(A);
    const un = rep.unknowns.filter((i) => i < nn).map((i) => nodes[i]);
    const ue = rep.unknowns.filter((i) => i >= nn).map((i) => elems[i - nn].id);
    const eqn = rep.equations.filter((i) => i < nn).map((i) => nodes[i]);
    const eqe = rep.equations.filter((i) => i >= nn).map((i) => elems[i - nn].id);
    const idealV = eqe.filter((id) => { const e = elems.find((x) => x.id === id)!; return e.kind === 'V' && abs(e.z ?? ZERO) === 0; });
    if (idealV.length) return fail('bench.singular.sourceLoop', [...un, ...eqn], eqe);
    if (un.length) return fail('bench.singular.floating', un, [...ue, ...eqe]);
    return fail('bench.singular.other', [...un, ...eqn], [...ue, ...eqe]);
  };

  let x: Complex[];
  try { x = cSolve(A, b); } catch (err) {
    if (err instanceof SingularMatrixError) return singular();
    return fail('bench.diverged');
  }
  if (cpl.length) {
    const sol = solveCpl(A, b, x, elems, nodes, idx, nn, cpl, N);
    if (!sol) return fail('bench.collapse', [], cpl.map((k) => elems[k].id));
    x = sol;
  }
  if (x.some((z) => !fin(z))) return fail('bench.diverged');

  const V: Record<string, Complex> = { [GROUND]: cx(0) };
  nodes.forEach((n, i) => { V[n] = x[i]; });
  const I: Record<string, Complex> = {}; const S: Record<string, Complex> = {};
  let sum = cx(0), mag = 0;
  elems.forEach((e, k) => {
    const i = x[nn + k]; I[e.id] = i;
    let s = cx(0);
    specs[k].nodes.forEach((n, j) => { s = add(s, scale(mul(V[n] ?? cx(0), conj(i)), specs[k].inc[j])); });
    S[e.id] = s; sum = add(sum, s); mag += abs(s);
  });
  return { ok: true, w, V, I, S, tellegen: mag > 0 ? abs(sum) / mag : 0 };
}

/** Newton on the real embedding for constant-power rows: V conj(I) = S. Start = open-converter solution, then P-ramp. */
function solveCpl(A: Complex[][], b: Complex[], x0: Complex[], elems: Elem[], nodes: string[], idx: Map<string, number>, nn: number, cpl: number[], N: number): Complex[] | null {
  const M = Array.from({ length: 2 * N }, () => new Array<number>(2 * N).fill(0));
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const z = A[i][j]; M[i][j] = z.re; M[i][j + N] = -z.im; M[i + N][j] = z.im; M[i + N][j + N] = z.re;
  }
  for (const k of cpl) for (let j = 0; j < 2 * N; j++) { M[nn + k][j] = 0; M[N + nn + k][j] = 0; }
  const rhs = [...b.map((z) => z.re), ...b.map((z) => z.im)];
  const pq = cpl.map((k) => { const e = elems[k] as Extract<Elem, { kind: 'CPL' }>; const eta = e.eta ?? 1; return [e.p / eta, (e.q ?? 0) / eta]; });
  // value of node voltage re/im index; ground = no column
  const col = (n: string) => idx.get(n);
  const run = (lam: number, start: number[]) => {
    const F = (z: number[]) => {
      const f = M.map((row, i) => { let s = -rhs[i]; for (let j = 0; j < row.length; j++) if (row[j] !== 0) s += row[j] * z[j]; return s; });
      cpl.forEach((k, c) => {
        const e = elems[k] as Extract<Elem, { kind: 'CPL' }>;
        const ia = col(e.a), ib = col(e.b);
        const xr = (ia === undefined ? 0 : z[ia]) - (ib === undefined ? 0 : z[ib]);
        const yr = (ia === undefined ? 0 : z[N + ia]) - (ib === undefined ? 0 : z[N + ib]);
        const u = z[nn + k], v = z[N + nn + k];
        f[nn + k] = xr * u + yr * v - lam * pq[c][0];
        f[N + nn + k] = yr * u - xr * v - lam * pq[c][1];
      });
      return f;
    };
    const Jf = (z: number[]) => {
      const J = M.map((r) => r.slice());
      cpl.forEach((k) => {
        const e = elems[k] as Extract<Elem, { kind: 'CPL' }>;
        const ia = col(e.a), ib = col(e.b);
        const xr = (ia === undefined ? 0 : z[ia]) - (ib === undefined ? 0 : z[ib]);
        const yr = (ia === undefined ? 0 : z[N + ia]) - (ib === undefined ? 0 : z[N + ib]);
        const u = z[nn + k], v = z[N + nn + k];
        const r1 = nn + k, r2 = N + nn + k;
        for (const [c, sg] of [[ia, 1], [ib, -1]] as const) {
          if (c === undefined) continue;
          J[r1][c] += sg * u; J[r1][N + c] += sg * v; J[r2][c] += -sg * v; J[r2][N + c] += sg * u;
        }
        J[r1][nn + k] += xr; J[r1][N + nn + k] += yr; J[r2][nn + k] += yr; J[r2][N + nn + k] += -xr;
      });
      return J;
    };
    return newton(F, start, { jacobian: Jf, tol: 1e-9, maxIter: 80 });
  };
  const z0 = [...x0.map((z) => z.re), ...x0.map((z) => z.im)];
  const tryFull = run(1, z0);
  let best = tryFull;
  if (!tryFull.converged) {
    let z = z0; let ok = true; const steps = 40;
    for (let s = 1; s <= steps; s++) { const r = run(s / steps, z); if (!r.converged) { ok = false; break; } z = r.x; }
    if (!ok) return null;
    best = run(1, z);
    if (!best.converged) return null;
  }
  if (best.x.some((v) => !Number.isFinite(v))) return null;
  return Array.from({ length: N }, (_, i) => cx(best.x[i], best.x[N + i]));
}
