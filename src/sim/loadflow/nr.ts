// Polar Newton-Raphson load flow (DESIGN 3.4): analytic |V|-scaled Jacobian [H N; M L], dense real LU, backtracking line
// search on ||F||_2, Q-limit outer loop. Voltage collapse / divergence is a result object, never an exception.
import { dmath as dm, luDecompose, luSolve, SingularMatrixError } from '@core/numerics';
import type { Msg } from '../network';
import { loadAt, qCap, type LFCase } from './case';

export const NR_TOL = 1e-8; // ||F||_inf, pu (1 W at 100 MVA)
export const NR_MAX_IT = 25;
export const NR_MIN_V = 0.3; // below this mid-iteration the step is shortened, never clamped
const ALPHAS = [1, 0.5, 0.25, 0.125, 0.0625, 1 / 32, 1 / 64];
const ARMIJO = 1e-4;
const POLISH_BELOW = 1e-11; // residual under which no extra polishing iteration is taken

/** pq-max / pq-min: a regulating bus held at its Q limit (Q = Qmax(V) or Qmin(V)). */
export type BusKind = 'slack' | 'pv' | 'pq' | 'pq-max' | 'pq-min';
export type NrReason = 'ok' | 'max-iterations' | 'line-search' | 'singular' | 'non-finite';

export interface NrState { V: number[]; th: number[] }

export interface NrOptions {
  /** Warm start (per case bus); omitted = flat start. */
  warm?: NrState | null;
  /** Bus kinds of the previous solution (keeps limited units limited, so a warm re-solve needs ~1 pass). */
  warmKinds?: BusKind[] | null;
  /** Enforce Q limits with the outer loop (default true). */
  qLimits?: boolean;
  /** Q-limit passes (default 4, DESIGN 3.4); the pass after the last only reports what is left. */
  maxPasses?: number;
  tol?: number;
  maxIt?: number;
}

export interface CaseSolution {
  converged: boolean;
  reason: NrReason;
  /** Teaching message as data when not converged (null when ok). */
  message: Msg | null;
  /** Newton iterations summed over all Q-limit passes and the flat retry. */
  iterations: number;
  /** Q-limit passes performed (1 = no switching needed). */
  passes: number;
  V: number[]; th: number[];
  kinds: BusKind[];
  /** Buses (case indices) whose Q is outside its capability after the last pass (should be empty). */
  qViolations: number[];
  /** Final ||F||_inf (pu). */
  residual: number;
  usedFlatRetry: boolean;
}

/** Flat start: |V| = 1 (set-point at regulating buses), theta = 0. */
export function flatStart(c: LFCase, kinds?: BusKind[]): NrState {
  const V = new Array<number>(c.n).fill(1), th = new Array<number>(c.n).fill(0);
  for (let i = 0; i < c.n; i++) if (c.reg[i] && (!kinds || kinds[i] === 'pv' || kinds[i] === 'slack')) V[i] = c.vSet[i]!;
  V[c.slack] = c.slackV;
  return { V, th };
}

interface Work { cs: number[]; sn: number[]; P: number[]; Q: number[] }

/** Injection P_i, Q_i from Y_bus (pu): P_i = sum |Vi||Vk|(G cos(ti-tk) + B sin(ti-tk)), Q_i = sum |Vi||Vk|(G sin - B cos). */
export function injections(c: LFCase, V: number[], th: number[], w?: Work): { P: number[]; Q: number[] } {
  const n = c.n;
  const cs = w?.cs ?? new Array<number>(n), sn = w?.sn ?? new Array<number>(n);
  const P = w?.P ?? new Array<number>(n), Q = w?.Q ?? new Array<number>(n);
  const sc: [number, number] = [0, 0];
  for (let i = 0; i < n; i++) { dm.sincos(th[i]!, sc); sn[i] = sc[0]; cs[i] = sc[1]; }
  for (let i = 0; i < n; i++) {
    const vi = V[i]!, Gi = c.G[i]!, Bi = c.B[i]!;
    let p = Gi[i]! * vi * vi, q = -Bi[i]! * vi * vi;
    for (const k of c.adj[i]!) {
      const cd = cs[i]! * cs[k]! + sn[i]! * sn[k]!, sd = sn[i]! * cs[k]! - cs[i]! * sn[k]!;
      const vv = vi * V[k]!;
      p += vv * (Gi[k]! * cd + Bi[k]! * sd);
      q += vv * (Gi[k]! * sd - Bi[k]! * cd);
    }
    P[i] = p; Q[i] = q;
  }
  return { P, Q };
}

/** Scheduled net injection Ps(V), Qs(V) at bus i for the given kind (generation minus load; limited devices follow their Q(V) cap). */
function sched(c: LFCase, i: number, kind: BusKind, V: number): [number, number] {
  const [pl, ql] = loadAt(c, i, V);
  let q = c.qg[i]! - ql;
  if (kind === 'pq-max') q += qCap(c, i, V)[0];
  else if (kind === 'pq-min') q += qCap(c, i, V)[1];
  return [c.pg[i]! - pl, q];
}

interface Layout { thIdx: number[]; vIdx: number[]; m: number; nTh: number }
function layout(c: LFCase, kinds: BusKind[]): Layout {
  const thIdx = new Array<number>(c.n).fill(-1), vIdx = new Array<number>(c.n).fill(-1);
  let k = 0;
  for (let i = 0; i < c.n; i++) if (kinds[i] !== 'slack') thIdx[i] = k++;
  const nTh = k;
  for (let i = 0; i < c.n; i++) if (kinds[i] !== 'slack' && kinds[i] !== 'pv') vIdx[i] = k++;
  return { thIdx, vIdx, m: k, nTh };
}

/** Mismatch F = [Ps - P(V,th) for non-slack; Qs - Q(V,th) for PQ-type] (pu). */
function mismatch(c: LFCase, kinds: BusKind[], L: Layout, st: NrState, w: Work): number[] {
  injections(c, st.V, st.th, w);
  const f = new Array<number>(L.m);
  for (let i = 0; i < c.n; i++) {
    if (L.thIdx[i]! < 0) continue;
    const [ps, qs] = sched(c, i, kinds[i]!, st.V[i]!);
    f[L.thIdx[i]!] = ps - w.P[i]!;
    if (L.vIdx[i]! >= 0) f[L.vIdx[i]!] = qs - w.Q[i]!;
  }
  return f;
}

/** Analytic Jacobian of F wrt [theta; dV/V] with load / device voltage dependence: H=Q-term, N=P-term, M=-P-term, L=Q-term + diagonals (pu). */
export function jacobian(c: LFCase, kinds: BusKind[], L: Layout, st: NrState, w: Work): number[][] {
  const { V } = st;
  const J = Array.from({ length: L.m }, () => new Array<number>(L.m).fill(0));
  for (let i = 0; i < c.n; i++) {
    const r = L.thIdx[i]!;
    if (r < 0) continue;
    const vi = V[i]!, Gi = c.G[i]!, Bi = c.B[i]!;
    const rq = L.vIdx[i]!;
    const Pi = w.P[i]!, Qi = w.Q[i]!;
    // diagonal blocks (calc part)
    J[r]![r] = -Qi - Bi[i]! * vi * vi; // H_ii
    if (rq >= 0) {
      J[r]![rq] = Pi + Gi[i]! * vi * vi; // N_ii
      J[rq]![r] = Pi - Gi[i]! * vi * vi; // M_ii
      J[rq]![rq] = Qi - Bi[i]! * vi * vi; // L_ii
    }
    // scheduled-injection voltage dependence: F = S_s(V) - S_calc, so J_eff = d(calc)/dx - d(S_s)/dx
    if (rq >= 0) {
      const p = c.lp[i]!, q = c.lq[i]!;
      J[r]![rq]! += 2 * p[0] * vi * vi + p[1] * vi; // -d(Ps)/dlnV, Ps = pg - load
      let dq = 2 * q[0] * vi * vi + q[1] * vi;
      if (kinds[i] === 'pq-max') dq -= c.iMax[i]! * vi + 2 * c.bMax[i]! * vi * vi;
      else if (kinds[i] === 'pq-min') dq -= -c.iMax[i]! * vi + 2 * c.bMin[i]! * vi * vi;
      J[rq]![rq]! += dq;
    }
    for (const k of c.adj[i]!) {
      const ck = L.thIdx[k]!, vk = L.vIdx[k]!;
      if (ck < 0) continue; // slack column
      const d = st.th[i]! - st.th[k]!;
      const [sd, cdd] = dm.sincos(d);
      const vv = vi * V[k]!;
      const a = vv * (Gi[k]! * cdd + Bi[k]! * sd); // P term
      const b = vv * (Gi[k]! * sd - Bi[k]! * cdd); // Q term
      J[r]![ck] = b; // H
      if (vk >= 0) J[r]![vk] = a; // N
      if (rq >= 0) {
        J[rq]![ck] = -a; // M
        if (vk >= 0) J[rq]![vk] = b; // L
      }
    }
  }
  return J;
}

/** Jacobian at a state for a given kind assignment (used by the continuation and the sensitivities). */
export function jacobianAt(c: LFCase, kinds: BusKind[], st: NrState): { J: number[][]; L: Layout } {
  const w: Work = { cs: [], sn: [], P: [], Q: [] };
  const L = layout(c, kinds);
  injections(c, st.V, st.th, w);
  return { J: jacobian(c, kinds, L, st, w), L };
}

export { layout as lfLayout };
export type { Layout as LfLayout };

const inf = (v: number[]): number => { let m = 0; for (const x of v) { const a = Math.abs(x); if (a > m) m = a; if (x !== x) return NaN; } return m; };
const l2 = (v: number[]): number => { let s = 0; for (const x of v) s += x * x; return Math.sqrt(s); };

interface RawResult { ok: boolean; reason: NrReason; message: Msg | null; it: number; st: NrState; residual: number }

/** One Newton solve for a fixed bus-kind assignment. */
function newton(c: LFCase, kinds: BusKind[], start: NrState, tol: number, maxIt: number): RawResult {
  const L = layout(c, kinds);
  const w: Work = { cs: new Array(c.n), sn: new Array(c.n), P: new Array(c.n), Q: new Array(c.n) };
  let st: NrState = { V: start.V.slice(), th: start.th.slice() };
  for (let i = 0; i < c.n; i++) if (kinds[i] === 'pv') st.V[i] = c.vSet[i]!;
  st.V[c.slack] = c.slackV;
  let f = mismatch(c, kinds, L, st, w);
  let nf = inf(f);
  if (L.m === 0) return { ok: true, reason: 'ok', message: null, it: 0, st, residual: 0 };
  let polished = false;
  for (let it = 0; ; it++) {
    if (nf !== nf || !Number.isFinite(nf)) return { ok: false, reason: 'non-finite', message: { key: 'nr.non-finite' }, it, st, residual: NaN };
    // converged; one polishing step when the residual is only just under tol keeps the power balance (P1) ~1e-12 rather than ~1e-8
    if (nf < tol && (nf < POLISH_BELOW || it >= maxIt || polished)) return { ok: true, reason: 'ok', message: null, it, st, residual: nf };
    if (nf < tol) polished = true;
    if (it >= maxIt) return { ok: false, reason: 'max-iterations', message: { key: 'nr.max-iterations', params: { maxIt, mismatchPu: nf } }, it, st, residual: nf };
    const J = jacobian(c, kinds, L, st, w);
    let dx: number[];
    try {
      const lu = luDecompose(J, { tol: 1e-300 });
      let mn = Infinity, mx = 0;
      for (let i = 0; i < L.m; i++) { const a = Math.abs(lu.lu[i]![i]!); if (a < mn) mn = a; if (a > mx) mx = a; }
      if (!(mn / mx > 1e-12)) throw new SingularMatrixError(0, mn, '');
      dx = luSolve(lu, f);
    } catch (e) {
      const col = e instanceof SingularMatrixError ? e.column : 0;
      let where = '';
      for (let i = 0; i < c.n; i++) if (L.thIdx[i] === col || L.vIdx[i] === col) where = c.ids[i]!;
      return { ok: false, reason: 'singular', message: { key: 'nr.singular', params: { bus: where } }, it, st, residual: nf };
    }
    if (dx.some((x) => x !== x || !Number.isFinite(x))) return { ok: false, reason: 'non-finite', message: { key: 'nr.non-finite' }, it, st, residual: nf };
    const minV0 = Math.min(...st.V);
    const n0 = l2(f);
    let accepted = false;
    for (const a of ALPHAS) {
      const V = st.V.slice(), th = st.th.slice();
      for (let i = 0; i < c.n; i++) {
        if (L.thIdx[i]! >= 0) th[i] = st.th[i]! + a * dx[L.thIdx[i]!]!;
        if (L.vIdx[i]! >= 0) V[i] = st.V[i]! * (1 + a * dx[L.vIdx[i]!]!);
      }
      let minV = Infinity;
      for (const v of V) if (v < minV) minV = v;
      if (minV < NR_MIN_V && minV < minV0) continue; // voltage fell below 0.3 pu: shorten the step, never clamp
      const trial: NrState = { V, th };
      const f2 = mismatch(c, kinds, L, trial, w);
      const n2 = l2(f2);
      if (n2 === n2 && n2 <= (1 - ARMIJO * a) * n0) { st = trial; f = f2; nf = inf(f2); accepted = true; break; }
    }
    if (!accepted && polished) return { ok: true, reason: 'ok', message: null, it, st, residual: nf };
    if (!accepted) return { ok: false, reason: 'line-search', message: { key: 'nr.line-search' }, it, st, residual: nf };
  }
}

function initialKinds(c: LFCase): BusKind[] {
  return c.ids.map((_, i) => (i === c.slack ? 'slack' : c.reg[i] ? 'pv' : 'pq'));
}

/** Reactive output of the regulating devices at bus i (pu): Q_calc + Q_load - Q_fixed. */
export function qGenAt(c: LFCase, i: number, V: number, Qcalc: number): number {
  const ql = loadAt(c, i, V)[1];
  return Qcalc + ql - c.qg[i]!;
}

/** Solve one island case: Newton from the warm start (flat retry on failure) inside the Q-limit outer loop (<= 4 passes, <= 2 switches per bus). */
export function solveCase(c: LFCase, opts: NrOptions = {}): CaseSolution {
  const tol = opts.tol ?? NR_TOL, maxIt = opts.maxIt ?? NR_MAX_IT;
  const useLim = opts.qLimits !== false;
  const kinds = initialKinds(c);
  if (opts.warmKinds && opts.warmKinds.length === c.n) for (let i = 0; i < c.n; i++) if (i !== c.slack && (c.reg[i] || false) && opts.warmKinds[i] !== 'slack' && opts.warmKinds[i] !== 'pq') kinds[i] = opts.warmKinds[i]!;
  const switches = new Array<number>(c.n).fill(0), recoveries = new Array<number>(c.n).fill(0);
  let start: NrState = opts.warm && opts.warm.V.length === c.n ? { V: opts.warm.V.slice(), th: opts.warm.th.slice() } : flatStart(c, kinds);
  let usedWarm = !!(opts.warm && opts.warm.V.length === c.n);
  let iterations = 0, usedFlat = false;
  let cur: RawResult | null = null;
  const MAXP = opts.maxPasses ?? 4;
  let pass = 0;
  for (; ; pass++) {
    cur = newton(c, kinds, start, tol, maxIt);
    iterations += cur.it;
    if (!cur.ok && usedWarm) {
      const r2 = newton(c, kinds, flatStart(c, kinds), tol, maxIt);
      iterations += r2.it; usedFlat = true; cur = r2;
    }
    usedWarm = true; // from now on warm = previous pass; a failure retries flat
    if (!cur.ok) break;
    if (!useLim || pass >= MAXP) break; // the last (5th) solve only reports leftovers via qViolations
    // examine Q limits
    const w: Work = { cs: [], sn: [], P: [], Q: [] };
    injections(c, cur.st.V, cur.st.th, w);
    let changed = false;
    const forceOnly = pass >= MAXP - 1; // last allowed pass: only fix violations (no recoveries) and finish
    for (let i = 0; i < c.n; i++) {
      const V = cur.st.V[i]!;
      if (kinds[i] === 'pv') {
        const [qmax, qmin] = qCap(c, i, V);
        const qg = qGenAt(c, i, V, w.Q[i]!);
        // a violation always latches the limit (feasibility first); only the *return* to PV is rationed (once per bus)
        if (qg > qmax + 1e-9) { kinds[i] = 'pq-max'; switches[i]!++; changed = true; }
        else if (qg < qmin - 1e-9) { kinds[i] = 'pq-min'; switches[i]!++; changed = true; }
      } else if (!forceOnly && (kinds[i] === 'pq-max' || kinds[i] === 'pq-min') && recoveries[i]! < 1) {
        if ((kinds[i] === 'pq-max' && V > c.vSet[i]!) || (kinds[i] === 'pq-min' && V < c.vSet[i]!)) { kinds[i] = 'pv'; switches[i]!++; recoveries[i]!++; changed = true; }
      }
    }
    if (!changed) break;
    start = cur.st;
  }
  const st = cur!.st;
  const qViol: number[] = [];
  if (cur!.ok && useLim) {
    const w: Work = { cs: [], sn: [], P: [], Q: [] };
    injections(c, st.V, st.th, w);
    for (let i = 0; i < c.n; i++) if (kinds[i] === 'pv') {
      const [qmax, qmin] = qCap(c, i, st.V[i]!);
      const qg = qGenAt(c, i, st.V[i]!, w.Q[i]!);
      if (qg > qmax + 1e-7 || qg < qmin - 1e-7) qViol.push(i);
    }
  }
  return { converged: cur!.ok, reason: cur!.reason, message: cur!.message, iterations, passes: pass + 1, V: st.V, th: st.th, kinds, qViolations: qViol, residual: cur!.residual, usedFlatRetry: usedFlat };
}
