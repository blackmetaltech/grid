// DC load flow: B' theta = P (lossless, |V| = 1, small angles). Codex lab L16 only; never used in play.
import { solve } from '@core/numerics';
import { buildYbus, cmpId, findIslands, type Net } from '../network';

export interface DcResult {
  /** Angle (rad) per original bus id (0 for dark buses). */
  theta: Record<string, number>;
  /** Branch active flow from -> to (pu): P = (theta_f - theta_t)/(x tau). */
  flow: Record<string, number>;
  /** Slack generation P (pu) per slack bus. */
  slackP: Record<string, number>;
}

/** DC flow per energised island: B'_ik = -1/(x_ik tau_ik), P_i = scheduled generation - load at nominal voltage (pu); the slack bus balances. */
export function dcFlow(net: Net): DcResult {
  const yb = buildYbus(net);
  const islands = findIslands(net);
  const out: DcResult = { theta: {}, flow: {}, slackP: {} };
  for (const b of net.buses) out.theta[b.id] = 0;
  const P = new Map<string, number>(yb.ids.map((id) => [id, 0]));
  for (const u of net.units) if (u.online && (u.kind === 'sync' || u.kind === 'bess-gfm' || u.kind === 'inverter')) P.set(yb.mergedInto[u.bus]!, (P.get(yb.mergedInto[u.bus]!) ?? 0) + (u.p ?? 0));
  for (const l of net.loads) { const z = l.zip ?? [0, 0, 1]; P.set(yb.mergedInto[l.bus]!, (P.get(yb.mergedInto[l.bus]!) ?? 0) - l.p * (z[0]! + z[1]! + z[2]!)); }
  for (const isl of islands) {
    if (!isl.energised) continue;
    const ids = Array.from(new Set(isl.buses.map((b) => yb.mergedInto[b]!))).sort(cmpId);
    const slack = yb.mergedInto[isl.slackBus!]!;
    const free = ids.filter((i) => i !== slack);
    const pos = new Map(free.map((id, k) => [id, k]));
    const n = free.length;
    const Bm = Array.from({ length: n }, () => new Array<number>(n).fill(0));
    const rhs = free.map((id) => P.get(id) ?? 0);
    const set = new Set(isl.buses);
    for (const br of net.branches) {
      if (!br.inService || !set.has(br.from) || yb.ties.includes(br.id)) continue;
      const b = 1 / (br.x * (br.tau ?? 1));
      const f = pos.get(yb.mergedInto[br.from]!), t = pos.get(yb.mergedInto[br.to]!);
      if (f !== undefined) Bm[f]![f]! += b;
      if (t !== undefined) Bm[t]![t]! += b;
      if (f !== undefined && t !== undefined) { Bm[f]![t]! -= b; Bm[t]![f]! -= b; }
    }
    let th: number[] = [];
    if (n > 0) { try { th = solve(Bm, rhs); } catch { th = new Array<number>(n).fill(0); } }
    const ang = new Map<string, number>([[slack, 0]]);
    free.forEach((id, k) => ang.set(id, th[k]!));
    for (const b of isl.buses) out.theta[b] = ang.get(yb.mergedInto[b]!) ?? 0;
    for (const br of net.branches) {
      if (!br.inService || !set.has(br.from) || yb.ties.includes(br.id)) continue;
      out.flow[br.id] = ((out.theta[br.from] ?? 0) - (out.theta[br.to] ?? 0)) / (br.x * (br.tau ?? 1));
    }
    let tot = 0; for (const id of ids) if (id !== slack) tot += P.get(id) ?? 0;
    out.slackP[slack] = -tot;
  }
  return out;
}
