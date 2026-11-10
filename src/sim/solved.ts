// The last load-flow result, in full (flows, islands, shed), memoised OUTSIDE the state in a WeakMap keyed by `state.solution`
// (DESIGN 8.2: derived data is never stored). The state keeps only V and theta per bus; a query on a cloned or loaded state misses the
// cache and recomputes from those, warm-started, in one or two Newton steps.
import { S_BASE_MVA, type Net } from './network';
import { effectiveNet, flows as computeFlows, solveNetwork, type Flows, type NetSolution } from './loadflow';
import { toNet } from './netbuild';
import type { GridState, LoadFlowResult } from '../types';

export interface Solved { net: Net; sol: NetSolution; flows: Flows }

const CACHE = new WeakMap<object, Solved>();

/** The plain, storable result of a solution: energised buses only, V and theta. */
export function toResult(sol: NetSolution): LoadFlowResult {
  const buses = Object.keys(sol.V).sort().filter((id) => sol.energised[id]).map((id) => ({ id, vPu: sol.V[id]!, thetaRad: sol.theta[id]! }));
  let lam: number | null = null;
  for (const r of sol.islands) if (r.collapse && Number.isFinite(r.collapse.lambdaStar)) lam = lam === null ? r.collapse.lambdaStar : Math.min(lam, r.collapse.lambdaStar);
  return { converged: sol.converged, iterations: sol.iterations, buses, lambdaStar: lam };
}

/** Solve the network of `s` (warm-started from `s.solution` when it covers every bus). Pure. */
export function solveState(s: Pick<GridState, 'buses' | 'branches' | 'units' | 'loads' | 'shunts' | 'storage' | 'solution'>): Solved {
  const net = toNet(s);
  let warm: { V: Record<string, number>; theta: Record<string, number> } | null = null;
  if (s.solution && s.solution.converged && s.solution.buses.length === s.buses.length) {
    warm = { V: {}, theta: {} };
    for (const b of s.solution.buses) { warm.V[b.id] = b.vPu; warm.theta[b.id] = b.thetaRad; }
  }
  const sol = solveNetwork(net, { warm, qLimits: true });
  for (const id of Object.keys(sol.V)) { if (!Number.isFinite(sol.V[id]!) || !Number.isFinite(sol.theta[id]!)) { sol.V[id] = 0; sol.theta[id] = 0; sol.energised[id] = false; sol.converged = false; } }
  const eff = effectiveNet(net, sol);
  return { net: eff, sol, flows: computeFlows(eff, sol) };
}

export function remember(result: LoadFlowResult, solved: Solved): void { CACHE.set(result, solved); }

/** The full solution behind `s.solution`; recomputed (not stored) when the cache misses. null before the first block. */
export function solvedOf(s: GridState): Solved | null {
  if (!s.solution) return null;
  const hit = CACHE.get(s.solution);
  if (hit) return hit;
  const solved = solveState(s);
  CACHE.set(s.solution, solved);
  return solved;
}

export const toMW = (pu: number): number => pu * S_BASE_MVA;
