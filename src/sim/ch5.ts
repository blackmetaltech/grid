// Chapter 5 (Load Flow & Voltage) measurements the level rules read, tracked once per block from the block's load flow. Everything here is
// guarded by an optional rule (`vWatch`, `maxLoading`, `n1`, `marginFromBlock`), so a level that does not ask for it keeps its state, its
// goldens and its time budget exactly as they were. Pure functions of the state (the track is the only thing written).
import { dmath } from '@core/numerics';
import { buildCases, flows as computeFlows, solveNetwork, tryLambda } from './loadflow';
import type { Net } from './network';
import { solvedOf } from './solved';
import { toNet } from './netbuild';
import { fin } from './finite';
import { gsFrom, gsSweep, solveCase, flows as lfFlows, solveNetwork as solveNet } from './loadflow';
import { threeBusSaadat } from './loadflow/fixtures';
import type { GridState } from '../types';

/** What an outage that islands a load or does not converge reports as its loading: far past any limit. */
export const N1_UNSERVED = 9.99;

/** Worst loading of any branch left in service after the outage of `branchId` (N1_UNSERVED when a load goes dark or Newton fails). */
export function outageLoading(net: Net, branchId: string, warm: { V: Record<string, number>; theta: Record<string, number> } | null): number {
  const cut: Net = { ...net, branches: net.branches.map((b) => (b.id === branchId ? { ...b, inService: false } : b)) };
  const sol = solveNetwork(cut, { warm, qLimits: true, continuation: false });
  if (!sol.converged) return N1_UNSERVED;
  for (const l of cut.loads) if (l.p > 1e-9 && sol.energised[l.bus] === false) return N1_UNSERVED;
  const f = computeFlows(cut, sol);
  return Math.max(0, ...cut.branches.filter((b) => b.inService && b.id !== branchId).map((b) => f.branch[b.id]?.loading ?? 0));
}

/** The N-1 table of the present block: the post-outage loading of every in-service branch, by branch id. */
export function n1Table(s: GridState): Record<string, number> {
  const solved = solvedOf(s);
  if (!solved) return {};
  const warm = { V: solved.sol.V, theta: solved.sol.theta };
  const out: Record<string, number> = {};
  for (const b of solved.net.branches) if (b.inService) out[b.id] = outageLoading(solved.net, b.id, warm);
  return out;
}

/** Loadability of the present state: the largest factor lambda (to `lamMax`) by which every load can be scaled, with the generation held where it stands (the slack and the
 *  voltage-regulating units still answer), before Newton fails: the nose of the P-V curve. Loads count unshed. Smallest over islands. */
export function loadability(net: Net, lamMax = 2.5, bisections = 14): number {
  let lam = lamMax;
  for (const { c } of buildCases(net).cases) {
    let lo = 0, hi = lamMax, warm: { V: number[]; th: number[] } | null = null;
    const top = tryLambda(c, hi, null, true, undefined, 1);
    if (top.converged) continue;
    const zero = tryLambda(c, 0, null, true, undefined, 1);
    if (!zero.converged) { lam = 0; continue; }
    warm = { V: zero.V, th: zero.th };
    for (let k = 0; k < bisections; k++) {
      const mid = 0.5 * (lo + hi), r = tryLambda(c, mid, warm, true, undefined, 1);
      if (r.converged) { lo = mid; warm = { V: r.V, th: r.th }; } else hi = mid;
    }
    lam = Math.min(lam, lo);
  }
  return lam;
}

/** The textbook 3-bus case of PS-14/15/16 (L18's exam bridge): V2 after Gauss-Seidel iteration 1, the converged |V2|, and the slack's P (MW), from the engine's own GS and Newton. */
export const EXAM_IDS = { gs1: 'l18.v2gs1', v2: 'l18.v2', pslack: 'l18.pslack' } as const;
export function examTruth(): Record<string, number> {
  const net = threeBusSaadat(), { c } = buildCases(net).cases[0]!;
  const st = gsFrom([1.05, 1, 1.05], [0, 0, 0]);
  gsSweep(c, st, 1);
  const g1 = dmath.hypot(st.re[1]!, st.im[1]!);
  const sol = solveNet(net), f = lfFlows(net, sol);
  void solveCase;
  return { [EXAM_IDS.gs1]: g1, [EXAM_IDS.v2]: sol.V['2']!, [EXAM_IDS.pslack]: f.slack['1']!.p * 100 };
}
export const EXAM_TOL = 0.005;

/** The track keys of chapter 5 for the block that just ran. */
export function ch5Track(s: GridState): void {
  const r = s.rules, tr = s.metrics.track;
  if (!(r.vWatch || r.maxLoading != null || r.n1 || r.marginFromBlock != null || r.exam)) return;
  if (r.exam) {
    const truth = examTruth();
    let hits = 0;
    for (const p of s.metrics.predictions) { const a = truth[p.id]; if (a === undefined) continue; p.actual = a; if (Math.abs(p.predicted - a) <= EXAM_TOL * Math.abs(a)) hits++; }
    tr.predHits = hits;
  }
  // operations of the day: what the player set before the first block (a bank switched in at the start, a tap preset) is the starting position, not an operation
  if (tr.tapBase === undefined) { tr.tapBase = s.metrics.tapOps; tr.switchBase = s.metrics.switchOps; }
  tr.tapOps = s.metrics.tapOps - tr.tapBase; tr.switchOps = s.metrics.switchOps - tr.switchBase;
  const solved = solvedOf(s);
  if (!solved) return;
  const block = s.clock.block;
  if (r.vWatch) {
    const w = r.vWatch;
    let worstDev = 0, worstV = 1, worstBus = -1, vmin = Infinity, vmax = 0;
    s.buses.forEach((b, i) => {
      if (w.buses ? !w.buses.includes(b.id) : !w.kv.some((k) => Math.abs(k - b.kvNom) < 1e-9)) return;
      // a de-energised bus has no voltage to read (the load-flow convention, as in the tick's voltage bands): darkness is judged by its own rules (ENS, the island, darkLoadsLose), never as 0 pu
      if (solved.sol.energised[b.id] === false) return;
      const v = solved.sol.V[b.id] ?? 0;
      vmin = Math.min(vmin, v); vmax = Math.max(vmax, v);
      const dev = v < w.lo ? w.lo - v : v > w.hi ? v - w.hi : 0;
      if (dev > worstDev) { worstDev = dev; worstV = v; worstBus = i; }
    });
    if (Number.isFinite(vmin)) {
      // the extremes over the run, with the day and block they happened in (a multi-day level labels them by that day)
      if (tr.vMinPu === undefined || vmin < tr.vMinPu) { tr.vMinPu = fin(vmin); tr.vMinDay = s.clock.day; tr.vMinBlock = block; }
      if (tr.vMaxPu === undefined || vmax > tr.vMaxPu) { tr.vMaxPu = fin(vmax); tr.vMaxDay = s.clock.day; tr.vMaxBlock = block; }
      tr.vNowMin = fin(vmin); tr.vNowMax = fin(vmax);
    }
    if (worstBus >= 0) { tr.vViolBlocks = (tr.vViolBlocks ?? 0) + 1; tr.vViolBus = worstBus; tr.vViolV = fin(worstV); tr.vViolBlock = block; } else tr.vViolBlocks = tr.vViolBlocks ?? 0;
  }
  if (r.exam && tr.vMinPu !== undefined) tr.v2SagPct = fin(100 * (1 - tr.vMinPu));   // percent below nominal at the worst block (negative: above)
  if (r.maxLoading != null) {
    let worst = 0, idx = -1;
    s.branches.forEach((b, i) => { const l = b.inService ? solved.flows.branch[b.id]?.loading ?? 0 : 0; if (l > worst) { worst = l; idx = i; } });
    if (worst > r.maxLoading + 1e-9) { tr.loadingViolBlocks = (tr.loadingViolBlocks ?? 0) + 1; tr.loadingViolPct = fin(Math.max(worst, tr.loadingViolPct ?? 0)); tr.loadingViolBranch = idx; tr.loadingViolBlock = block; } else tr.loadingViolBlocks = tr.loadingViolBlocks ?? 0;
  }
  if (r.n1) {
    const table = n1Table(s);
    let worst = 0;
    for (const v of Object.values(table)) worst = Math.max(worst, v);
    tr.n1Loading = fin(worst);
    if (worst > (tr.n1Max ?? 0)) tr.n1MaxBlock = block;   // when the day's worst N-1 moment was (the report names the time)
    tr.n1Max = fin(Math.max(tr.n1Max ?? 0, worst));
    const wl = fin(s.block.worstLoading);
    if (wl > (tr.peakLoadingN1 ?? 0)) { tr.peakLoadingN1 = wl; tr.peakLoadingBlock = block; }   // when the day's worst loading was (the control room card shows loading now)
  }
  if (r.marginFromBlock != null && s.clock.day * 96 + block >= r.marginFromBlock) {
    const lam = loadability(toNet({ ...s, loads: s.loads.map((l) => ({ ...l, shedFrac: 0 })) }));   // the loads as demanded: a collapse shed must not hide the nose
    tr.lambdaNow = fin(lam);
    tr.marginPct = fin(100 * (lam - 1));
    tr.marginMinPct = fin(Math.min(tr.marginMinPct ?? Infinity, tr.marginPct));
  }
}
