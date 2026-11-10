// Voltage collapse handling (DESIGN 3.4 step 6): load-scaling continuation, bisection for the largest convergent lambda,
// then "collapse sheds" in 5 % steps at the buses with the largest dV/dlambda until the case converges.
import { luDecompose, luSolve } from '@core/numerics';
import type { Msg } from '../network';
import { loadAt, setScale, type LFCase } from './case';
import { jacobianAt, solveCase, type CaseSolution, type NrState } from './nr';

export interface ShedStep {
  /** Case-bus index and merged bus id. */
  bus: number; busId: string;
  /** Cumulative fraction of that bus's load shed after this step (0..1). */
  fraction: number;
  /** Load ids at the bus. */
  loadIds: string[];
}

export interface ContinuationOptions {
  /** Bisections on lambda in [0, lamMax] (default 10 per DESIGN; tests use more for oracle accuracy). */
  bisections?: number;
  /** Upper end of the search interval (default 1; > 1 lets a test find the nose of a case loaded below it). */
  lamMax?: number;
  /** Forward verification step: lambda* + step must NOT converge (default 0.01, property P25). */
  verifyStep?: number;
  qLimits?: boolean;
  /** Shed step as a fraction of the original load (default 0.05). */
  shedStep?: number;
}

export interface ContinuationResult {
  /** Largest convergent lambda found (loads and matching dispatch scaled by lambda). */
  lambdaStar: number;
  /** lambda* < lamMax: the case is beyond its loadability (voltage collapse). */
  collapsed: boolean;
  /** Solution at lambda* (null if even lambda = 0 failed). */
  atLambdaStar: CaseSolution | null;
  /** Final solution at lambda = 1 after the collapse sheds (equals atLambdaStar scale when no shedding was needed). */
  solution: CaseSolution | null;
  sheds: ShedStep[];
  /** Cumulative shed fraction of each case bus's load. */
  shedFraction: number[];
  /** Total P shed at nominal voltage (pu). */
  shedPu: number;
  log: Msg[];
  /** Number of NR solves performed. */
  solves: number;
}

const stOf = (s: CaseSolution | null): NrState | null => (s && s.converged ? { V: s.V, th: s.th } : null);

/** Convergence of the case with loads and dispatch scaled by lam: Newton from `warm`, then flat (the P25 predicate). */
export function tryLambda(c: LFCase, lam: number, warm: NrState | null, qLimits = true, shed?: ArrayLike<number>): CaseSolution {
  setScale(c, lam, lam, shed);
  return solveCase(c, { warm, qLimits });
}

/** Bisect lambda in [0, lamMax] for the largest convergent value (resolution lamMax/2^bisections), then verify lambda* + verifyStep fails. */
export function findLambdaStar(c: LFCase, opts: ContinuationOptions = {}): { lambdaStar: number; sol: CaseSolution | null; solves: number } {
  const nb = opts.bisections ?? 10, hiMax = opts.lamMax ?? 1, step = opts.verifyStep ?? 0.01, ql = opts.qLimits !== false;
  let solves = 0;
  let loSol = tryLambda(c, 0, null, ql); solves++;
  if (!loSol.converged) return { lambdaStar: 0, sol: null, solves };
  let lo = 0, hi = hiMax;
  // a successful lambda = hiMax ends the search at once
  const top = tryLambda(c, hiMax, stOf(loSol), ql); solves++;
  if (top.converged) return { lambdaStar: hiMax, sol: top, solves };
  for (let k = 0; k < nb; k++) {
    const mid = 0.5 * (lo + hi);
    const s = tryLambda(c, mid, stOf(loSol), ql); solves++;
    if (s.converged) { lo = mid; loSol = s; } else hi = mid;
  }
  // forward verification: lambda* + step must fail; if not, move on (non-monotone solvability, warm-start effects)
  for (let k = 0; k < 200 && lo < hiMax; k++) {
    const t = Math.min(lo + step, hiMax);
    const s = tryLambda(c, t, stOf(loSol), ql); solves++;
    if (!s.converged) break;
    lo = t; loSol = s;
    if (lo >= hiMax) break;
  }
  return { lambdaStar: lo, sol: loSol, solves };
}

/** dV/dlambda at each case bus from the Jacobian at a converged solution (|V| change per unit of load+dispatch scaling; 0 at PV/slack). */
export function dVdLambda(c: LFCase, sol: CaseSolution, shed?: ArrayLike<number>): number[] {
  const st = { V: sol.V, th: sol.th };
  const { J, L } = jacobianAt(c, sol.kinds, st);
  const rhs = new Array<number>(L.m).fill(0);
  for (let i = 0; i < c.n; i++) {
    if (L.thIdx[i]! < 0) continue;
    const k = 1 - (shed ? shed[i] ?? 0 : 0);
    const V = sol.V[i]!;
    const p0 = c.base.lp[i]!, q0 = c.base.lq[i]!;
    const pl = (p0[0] * V * V + p0[1] * V + p0[2]) * k, ql = (q0[0] * V * V + q0[1] * V + q0[2]) * k;
    rhs[L.thIdx[i]!] = c.base.pg[i]! - pl;
    if (L.vIdx[i]! >= 0) rhs[L.vIdx[i]!] = c.base.qg[i]! - ql;
  }
  let dx: number[];
  try { dx = luSolve(luDecompose(J, { tol: 1e-300 }), rhs); } catch { return new Array<number>(c.n).fill(0); }
  return c.ids.map((_, i) => (L.vIdx[i]! >= 0 && Number.isFinite(dx[L.vIdx[i]!]!) ? sol.V[i]! * dx[L.vIdx[i]!]! : 0));
}

/** Full continuation: lambda*, then 5 % collapse sheds at the buses with the largest |dV/dlambda| until lambda = 1 converges. */
export function continuationCase(c: LFCase, opts: ContinuationOptions = {}): ContinuationResult {
  const step = opts.shedStep ?? 0.05, ql = opts.qLimits !== false;
  const log: Msg[] = [];
  const { lambdaStar, sol: atStar, solves: s0 } = findLambdaStar(c, { ...opts, lamMax: 1 });
  let solves = s0;
  const shedFraction = new Array<number>(c.n).fill(0);
  const res: ContinuationResult = { lambdaStar, collapsed: lambdaStar < 1, atLambdaStar: atStar, solution: null, sheds: [], shedFraction, shedPu: 0, log, solves };
  if (!atStar) { log.push({ key: 'collapse.no-zero-load-solution' }); setScale(c, 1, 1); return res; }
  if (lambdaStar >= 1) { res.solution = atStar; setScale(c, 1, 1); return res; }
  log.push({ key: 'collapse.limit', params: { pct: Math.round(lambdaStar * 1000) / 10 } });
  const dv = dVdLambda(c, atStar);
  const order = c.ids.map((_, i) => i).filter((i) => c.base.lp[i]![0] + c.base.lp[i]![1] + c.base.lp[i]![2] !== 0 || c.base.lq[i]![0] + c.base.lq[i]![1] + c.base.lq[i]![2] !== 0)
    .sort((a, b) => Math.abs(dv[b]!) - Math.abs(dv[a]!) || (c.ids[a]! < c.ids[b]! ? -1 : 1));
  let warm: NrState | null = stOf(atStar);
  let last: CaseSolution | null = null;
  const maxSteps = Math.ceil(1 / step) * order.length + 1;
  for (let k = 0; k < maxSteps; k++) {
    const bus = order.find((i) => shedFraction[i]! < 1 - 1e-12);
    if (bus === undefined) break;
    shedFraction[bus] = Math.min(1, Math.round((shedFraction[bus]! + step) * 1e9) / 1e9);
    res.sheds.push({ bus, busId: c.ids[bus]!, fraction: shedFraction[bus]!, loadIds: c.loadIds[bus]!.slice() });
    log.push({ key: 'collapse.shed', params: { pct: Math.round(step * 100), bus: c.ids[bus]!, dVdLambda: Math.abs(dv[bus]!) } });
    last = tryLambda(c, 1, warm, ql, shedFraction); solves++;
    if (last.converged) break;
  }
  res.solves = solves;
  res.solution = last && last.converged ? last : null;
  let shedPu = 0;
  for (let i = 0; i < c.n; i++) { const [pl] = loadAt({ ...c, lp: c.base.lp }, i, 1); shedPu += pl * shedFraction[i]!; }
  res.shedPu = shedPu;
  setScale(c, 1, 1, shedFraction);
  return res;
}
