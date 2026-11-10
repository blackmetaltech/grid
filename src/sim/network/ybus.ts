// Bus admittance matrix from the unified branch pi model (DESIGN 3.3, MATPOWER 3.2 with theta_sh = 0), bus ties merged.
import { TIE_Z_PU, cmpId, type Net, type NetBranch } from './types';

export interface Ybus {
  /** Merged bus ids in id-sorted order (representative = smallest id of a tie group). */
  ids: string[];
  /** merged id -> index into ids. */
  index: Map<string, number>;
  /** original bus id -> merged id (identity for unmerged buses). */
  mergedInto: Record<string, string>;
  /** Branch ids that were merged as bus ties (|z| < 1e-6 pu); they carry no Y_bus entry. */
  ties: string[];
  /** Y = G + jB, dense n x n. */
  G: number[][];
  B: number[][];
}

export interface BranchY { ffRe: number; ffIm: number; ftRe: number; ftIm: number; tfRe: number; tfIm: number; ttRe: number; ttIm: number }

/** Branch admittances: Y_ff = (y_s + (g_c + j b_c)/2)/tau^2, Y_ft = Y_tf = -y_s/tau, Y_tt = y_s + (g_c + j b_c)/2 (pu, theta_sh = 0). */
export function branchY(br: Pick<NetBranch, 'r' | 'x' | 'bc' | 'gc' | 'tau'>): BranchY {
  const tau = br.tau ?? 1;
  const d = br.r * br.r + br.x * br.x;
  const gs = br.r / d, bs = -br.x / d; // y_s = 1/(r + jx)
  const gh = (br.gc ?? 0) / 2, bh = br.bc / 2;
  const t2 = tau * tau;
  return { ffRe: (gs + gh) / t2, ffIm: (bs + bh) / t2, ftRe: -gs / tau, ftIm: -bs / tau, tfRe: -gs / tau, tfIm: -bs / tau, ttRe: gs + gh, ttIm: bs + bh };
}

/** True when the branch is a bus tie: |r + jx| < 1e-6 pu. */
export function isTie(br: Pick<NetBranch, 'r' | 'x'>): boolean {
  return Math.sqrt(br.r * br.r + br.x * br.x) < TIE_Z_PU;
}

/** Y_bus of the in-service network: Y_ii = sum of branch self terms + shunts, Y_ik from branches; ties merged first (deterministic id order). */
export function buildYbus(net: Net): Ybus {
  const all = net.buses.map((b) => b.id).sort(cmpId);
  // union-find with the smallest id as root
  const parent = new Map<string, string>(all.map((id) => [id, id]));
  const find = (a: string): string => { let r = a; while (parent.get(r) !== r) r = parent.get(r)!; let c = a; while (parent.get(c) !== r) { const n = parent.get(c)!; parent.set(c, r); c = n; } return r; };
  const ties: string[] = [];
  for (const br of net.branches.slice().sort((a, b) => cmpId(a.id, b.id))) {
    if (!br.inService || !isTie(br)) continue;
    if (!parent.has(br.from) || !parent.has(br.to)) continue;
    ties.push(br.id);
    const a = find(br.from), b = find(br.to);
    if (a !== b) { if (cmpId(a, b) < 0) parent.set(b, a); else parent.set(a, b); }
  }
  const mergedInto: Record<string, string> = {};
  for (const id of all) mergedInto[id] = find(id);
  const ids = all.filter((id) => mergedInto[id] === id);
  const index = new Map(ids.map((id, i) => [id, i]));
  const n = ids.length;
  const G = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const B = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (const br of net.branches.slice().sort((a, b) => cmpId(a.id, b.id))) {
    if (!br.inService || ties.includes(br.id)) continue;
    const f = index.get(mergedInto[br.from] ?? ''), t = index.get(mergedInto[br.to] ?? '');
    if (f === undefined || t === undefined) throw new Error(`Branch ${br.id} connects unknown bus ${f === undefined ? br.from : br.to}.`);
    const y = branchY(br);
    G[f][f] += y.ffRe; B[f][f] += y.ffIm;
    G[f][t] += y.ftRe; B[f][t] += y.ftIm;
    G[t][f] += y.tfRe; B[t][f] += y.tfIm;
    G[t][t] += y.ttRe; B[t][t] += y.ttIm;
  }
  for (const sh of net.shunts) {
    if (!sh.inService) continue;
    const i = index.get(mergedInto[sh.bus] ?? '');
    if (i === undefined) throw new Error(`Shunt ${sh.id} is at unknown bus ${sh.bus}.`);
    G[i][i] += sh.g ?? 0; B[i][i] += sh.b;
  }
  return { ids, index, mergedInto, ties, G, B };
}
