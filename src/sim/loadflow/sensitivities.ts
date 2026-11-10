// Sensitivities from the converged Jacobian: dV/dQ (coach hints) and loss sensitivities dP_L/dP_i (penalty factors).
import { luDecompose, luSolve, transpose } from '@core/numerics';
import type { Net } from '../network';
import { buildCases } from './case';
import { effectiveNet, type NetSolution } from './solve';
import { injections, jacobianAt, type BusKind } from './nr';

export interface Sensitivities {
  /** dV[i][k] = d|V_i| / dQ_k (pu per pu): voltage change at PQ-type bus i for extra Q generated at PQ-type bus k. */
  dVdQ: Record<string, Record<string, number>>;
  /** dP_L/dP_i for every energised non-slack bus: extra loss (pu) per extra pu of generation at bus i (slack makes up the balance). */
  dLossdP: Record<string, number>;
  /** Penalty factor 1/(1 - dP_L/dP_i). */
  penalty: Record<string, number>;
}

/** J [dtheta; dV/V] = [dP; dQ] at the solution: dV_i/dQ_k = V_i [J^-1]_(V_i, Q_k); dP_L/dP_i = y_i with J^T y = grad(sum_j P_j) (pu). */
export function sensitivities(net: Net, sol: NetSolution): Sensitivities {
  const eff = effectiveNet(net, sol);
  const { cases } = buildCases(eff);
  const out: Sensitivities = { dVdQ: {}, dLossdP: {}, penalty: {} };
  for (const { c } of cases) {
    const kinds = c.ids.map((id) => (sol.kind[id] === 'off' || sol.kind[id] === undefined ? 'pq' : sol.kind[id]) as BusKind);
    const V = c.ids.map((id) => sol.V[id]!), th = c.ids.map((id) => sol.theta[id]!);
    const { J, L } = jacobianAt(c, kinds, { V, th });
    if (L.m === 0) continue;
    let lu;
    try { lu = luDecompose(J, { tol: 1e-300 }); } catch { continue; }
    // dV/dQ
    const qbuses = c.ids.map((_, i) => i).filter((i) => L.vIdx[i]! >= 0);
    for (const k of qbuses) {
      const e = new Array<number>(L.m).fill(0); e[L.vIdx[k]!] = 1;
      const dx = luSolve(lu, e);
      for (const i of qbuses) (out.dVdQ[c.ids[i]!] ??= {})[c.ids[k]!] = V[i]! * dx[L.vIdx[i]!]!;
    }
    // loss gradient wrt the unknowns: central differences of sum_i P_i(V, theta) (exact to ~1e-9, enough for a hint)
    const sumP = (v: number[], t: number[]): number => injections(c, v, t).P.reduce((a, b) => a + b, 0);
    const g = new Array<number>(L.m).fill(0);
    for (let i = 0; i < c.n; i++) {
      if (L.thIdx[i]! >= 0) { const t1 = th.slice(), t2 = th.slice(); t1[i]! += 1e-6; t2[i]! -= 1e-6; g[L.thIdx[i]!] = (sumP(V, t1) - sumP(V, t2)) / 2e-6; }
      if (L.vIdx[i]! >= 0) { const v1 = V.slice(), v2 = V.slice(); const h = 1e-6 * V[i]!; v1[i]! += h; v2[i]! -= h; g[L.vIdx[i]!] = (sumP(v1, th) - sumP(v2, th)) / 2e-6; }
    }
    let y: number[];
    try { y = luSolve(luDecompose(transpose(J), { tol: 1e-300 }), g); } catch { continue; }
    for (let i = 0; i < c.n; i++) if (L.thIdx[i]! >= 0) {
      const s = y[L.thIdx[i]!]!;
      for (const m of c.members[i]!.slice(0, 1)) { out.dLossdP[m] = s; out.penalty[m] = 1 / (1 - s); }
    }
  }
  return out;
}
