// Electrical islands (union-find over in-service branches) and slack selection (DESIGN 3.4 step 5).
import { cmpId, isFormer, type Msg, type Net, type NetUnit } from './types';

export interface Island {
  /** Index in the deterministic order (islands sorted by their smallest bus id). */
  index: number;
  /** Original bus ids, id-sorted. */
  buses: string[];
  /** Slack unit (a former with the largest P_max - P headroom, ties by id) or null when de-energised. */
  slackUnit: string | null;
  slackBus: string | null;
  energised: boolean;
  /** Why it is dark: 'island.inverters-only' | 'island.no-source' (null when energised). */
  reason: Msg | null;
}

/** Headroom P_max - P of a unit (pu); units without a P_max count their own dispatch as the limit (headroom 0). */
export function headroom(u: NetUnit): number {
  const p = u.p ?? 0;
  return (u.pMax ?? p) - p;
}

/** Union-find over in-service branches; per island picks the slack unit with the largest headroom (ties by id) or de-energises it. */
export function findIslands(net: Net): Island[] {
  const ids = net.buses.map((b) => b.id).sort(cmpId);
  const parent = new Map<string, string>(ids.map((id) => [id, id]));
  const find = (a: string): string => { let r = a; while (parent.get(r) !== r) r = parent.get(r)!; let c = a; while (parent.get(c) !== r) { const n = parent.get(c)!; parent.set(c, r); c = n; } return r; };
  for (const br of net.branches) {
    if (!br.inService || !parent.has(br.from) || !parent.has(br.to)) continue;
    const a = find(br.from), b = find(br.to);
    if (a !== b) { if (cmpId(a, b) < 0) parent.set(b, a); else parent.set(a, b); }
  }
  const groups = new Map<string, string[]>();
  for (const id of ids) { const r = find(id); const g = groups.get(r); if (g) g.push(id); else groups.set(r, [id]); }
  const out: Island[] = [];
  const units = net.units.slice().sort((a, b) => cmpId(a.id, b.id));
  let k = 0;
  for (const buses of groups.values()) { // insertion order = ascending smallest id since ids are sorted
    const set = new Set(buses);
    let best: NetUnit | null = null;
    for (const u of units) {
      if (!set.has(u.bus) || !isFormer(u)) continue;
      if (best === null || headroom(u) > headroom(best)) best = u; // ties keep the lower id (sorted order)
    }
    const hasInverter = units.some((u) => set.has(u.bus) && u.online && u.kind !== 'sync' && u.kind !== 'bess-gfm');
    out.push({
      index: k++, buses, slackUnit: best ? best.id : null, slackBus: best ? best.bus : null, energised: best !== null,
      reason: best ? null : hasInverter
        ? { key: 'island.inverters-only' }
        : { key: 'island.no-source' },
    });
  }
  return out;
}

/** Island index of every bus id. */
export function islandOfBus(islands: Island[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const i of islands) for (const b of i.buses) m[b] = i.index;
  return m;
}

/** Load at nominal voltage (pu) lost when an island is dark: sum of p (aZ + aI + aP) over its loads (Energy Not Served rate). */
export function islandLoadPu(net: Net, island: Island): number {
  const set = new Set(island.buses);
  let s = 0;
  for (const l of net.loads) if (set.has(l.bus)) { const z = l.zip ?? [0, 0, 1]; s += l.p * (z[0] + z[1] + z[2]); }
  return s;
}
