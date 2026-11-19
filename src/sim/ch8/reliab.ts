// L32 Count the Outages: the analytical reliability of the Brightwater feeder (src/sim/distrib/reliability.ts, IEEE 1366 indices) under the player's devices.
import { reliability, type ReliabilityResult, type ReliabilitySection } from '../distrib';
import { L32 } from './data';
import type { L32Design } from './state';

export const defaultL32 = (): L32Design => ({ sect: Object.fromEntries(L32.sectionaliserSites.map((id) => [id, 'none' as const])), fuse: Object.fromEntries(L32.spurs.map((id) => [id, false])), tie: false });

export const sectionalisersUsed = (d: L32Design): number => Object.values(d.sect).filter((k) => k !== 'none').length;

export function l32Sections(d: L32Design): ReliabilitySection[] {
  return L32.sections.map((n) => {
    const spur = L32.spurs.includes(n.id), kind = spur ? (d.fuse[n.id] ? 'fuse' : 'none') : (d.sect[n.id] ?? 'none');
    return { id: n.id, parent: n.parent, lengthKm: n.km, lambdaPerKm: L32.lambdaPerKm, repairH: L32.repairH, customers: n.customers, avgLoadKw: n.kw, ...(kind !== 'none' ? { device: kind } : {}), ...(d.tie && L32.tieSites.includes(n.id) ? { tie: { ...L32.tie } } : {}) };
  });
}
export interface L32Study { rel: ReliabilityResult; capexUSD: number; used: number; worst: { id: string; saidiMin: number }; saidiOk: boolean; saifiOk: boolean }
export function studyL32(d: L32Design): L32Study {
  const rel = reliability(l32Sections(d), L32.times);
  const worst = rel.sections.reduce((a, s) => (s.saidiMin > a.saidiMin ? { id: s.id, saidiMin: s.saidiMin } : a), { id: '', saidiMin: -1 });
  const capexUSD = Object.values(d.sect).reduce((a, k) => a + (k === 'none' ? 0 : L32.price[k]), 0) + Object.values(d.fuse).filter(Boolean).length * L32.price.fuse + (d.tie ? L32.price.tie : 0);
  return { rel, capexUSD, used: sectionalisersUsed(d), worst, saidiOk: rel.saidi <= L32.saidiMaxMin, saifiOk: rel.saifi <= L32.saifiMax };
}
