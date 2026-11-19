// L33 Fuse Saving: recloser fast / slow curves against the spur fuse links (src/sim/distrib/tcc.ts). For every spur the fault current runs from the end of the spur (iMin) to its tap
// (iMax): the FAST curve must be quicker than the fuse minimum-melt time over the whole range (a temporary fault is cleared before the fuse is touched: fuse saving), and the SLOW
// curve slower than total clearing (a permanent fault is cleared by the fuse, not by locking the whole feeder out).
import { coordination, fuseK, fuseTotalClear, recloserPair, type Coordination } from '../distrib';
import { L33 } from './data';
import type { L33Design } from './state';

export const defaultL33 = (): L33Design => ({ pickupA: 200, fastTd: 0.25, slowTd: 3, fastShots: 2, fuse: Object.fromEntries(L33.spurs.map((s) => [s.id, 100])) });

export type L33Kind = 'fuseLoad' | 'blind' | 'miscoordination' | 'fuseBlown' | 'nuisance' | null;
export interface SpurStudy { id: string; fuseA: number; coord: Coordination; worstFastS: number; worstSlowS: number; marginS: number; ok: boolean; fuseLoadOk: boolean; seesEnd: boolean; fuseMelts: boolean; iMinA: number; iMaxA: number }
export interface L33Study { /** Fault-clearing score: the sum over the spurs of the fuse's total clearing time at the tap (s); lower is better. */ scoreS: number; spurs: SpurStudy[]; kind: L33Kind; bad: SpurStudy | null; marginS: number; recloserLoadOk: boolean; capexUSD: number; blowsPerYear: number; customersOut: number }

const clamp = (x: number): number => Math.max(-1e3, Math.min(1e3, x));

export function studyL33(d: L33Design): L33Study {
  const { fast, slow } = recloserPair(d.pickupA, d.fastTd, d.slowTd);
  const spurs: SpurStudy[] = L33.spurs.map((sp) => {
    const rating = d.fuse[sp.id]!, fuse = fuseK(rating);
    const coord = coordination(fast, slow, fuse, sp.iMinA, sp.iMaxA, 0, 40);
    const worstFast = clamp(coord.worstFast), worstSlow = clamp(coord.worstSlow);
    const fuseLoadOk = rating >= L33.fuseLoadFactor * sp.loadA, seesEnd = sp.iMinA > d.pickupA * 1.05, fuseMelts = sp.iMinA >= 2.2 * rating * 1.1;
    const fastOk = d.fastShots > 0 && worstFast >= 0;
    return { id: sp.id, fuseA: rating, coord, worstFastS: worstFast, worstSlowS: worstSlow, marginS: Math.min(d.fastShots > 0 ? worstFast : 1e3, worstSlow), ok: fuseLoadOk && seesEnd && fuseMelts && worstSlow >= 0 && fastOk, fuseLoadOk, seesEnd, fuseMelts, iMinA: sp.iMinA, iMaxA: sp.iMaxA };
  });
  const recloserLoadOk = d.pickupA >= 1.25 * L33.headLoadA;
  let kind: L33Kind = null, bad: SpurStudy | null = null;
  const first = (f: (s: SpurStudy) => boolean): SpurStudy | null => spurs.find(f) ?? null;
  if (!recloserLoadOk) kind = 'nuisance';
  else if ((bad = first((s) => !s.fuseLoadOk))) kind = 'fuseLoad';
  else if ((bad = first((s) => !s.fuseMelts || !s.seesEnd))) kind = 'blind';
  else if ((bad = first((s) => s.worstSlowS < 0))) kind = 'miscoordination';
  else if (d.fastShots === 0) { kind = 'fuseBlown'; bad = spurs[0]!; }
  else if ((bad = first((s) => s.worstFastS < 0))) kind = 'fuseBlown';
  const marginS = Math.min(...spurs.map((s) => s.marginS));
  // temporary faults (80 %) blow a fuse unless the fast curve saves it; a permanent spur fault (20 %) always blows one; the recloser lockout takes the whole feeder out on miscoordination
  const blows = spurs.reduce((a, s) => a + L33.spurFaultsPerYear * (1 - L33.tempFaultShare + (d.fastShots > 0 && s.worstFastS >= 0 ? 0 : L33.tempFaultShare)), 0);
  const customersOut = kind === 'miscoordination' ? L33.feederCustomers : bad ? L33.spurs.find((s) => s.id === bad!.id)!.customers : 0;
  const scoreS = L33.spurs.reduce((a, sp) => a + Math.min(1e3, fuseTotalClear(fuseK(d.fuse[sp.id]!), sp.iMaxA)), 0);
  return { scoreS, spurs, kind, bad, marginS, recloserLoadOk, capexUSD: 0, blowsPerYear: blows, customersOut };
}
