// L09 The Hundred-Percent Trap (DESIGN 2.6, chapter 3 stretch): a 35 km 33 kV radial feeder (ACSR Dog) carries the hill quarry's crushers (5 MW, pf 0.70) and the far end sags below 0.95 pu at the peak.
// A series capacitor of k = X_C / X_L (25, 40, 55, 70 or 100 %) cancels part of the line's reactance: dV ~ (R P + (X_L - X_C) Q) / V^2. At k = 100 % a fault behind the capacitor sees only
// the resistance, so the 21:00 three-phase fault at the quarry bus outgrows the old feeder breaker (1.4 kA): the breaker fails. Real practice keeps k at 25-70 % (src/sim/ch3/series.ts).
import type { Action } from '@core/kit';
import type { GridLevelSpec } from '../spec';
import { place } from '../spec';
import { BLOCKS_PER_DAY } from '../../types';

/** The quarry's crushers: 5 MW at pf 0.70, 06:00-22:00 at full load, a tenth of that through the night (lights and pumps). */
export const QUARRY = { peakMW: 5, pf: 0.7, onHour: 6, offHour: 22, nightShare: 0.1 } as const;
export function quarryShape(): { p: number[]; q: number[] } {
  const tan = Math.sqrt(1 - QUARRY.pf * QUARRY.pf) / QUARRY.pf;
  const p: number[] = [], q: number[] = [];
  for (let b = 0; b < BLOCKS_PER_DAY; b++) { const h = b / 4, f = h >= QUARRY.onHour && h < QUARRY.offHour ? 1 : QUARRY.nightShare; p.push(f); q.push(f * tan); }
  return { p, q };
}
export const LINE_KM = 35;
/** The supply behind the substation bus and the old feeder breaker. */
export const FEEDER = { sscMVA: 250, xOverR: 10, breakerKA: 1.4, movPu: 2.0 } as const;
export const FAULT_BLOCK = 84;   // 21:00
export const FAR_V_MIN = 0.95, FAR_V_STAR3 = 0.97;
export const KS = [25, 40, 55, 70, 100];

export const series = (pct: number): Action[] => [{ name: 'placeSeriesCap', args: ['T1', pct] }];

export const L09: GridLevelSpec = {
  id: 'L09', kind: 'grid', chapter: 3, titleKey: 'level.L09.title', briefKey: 'level.L09.brief', concepts: ['series-compensation', 'line-reactance', 'fault-current', 'resonance'],
  startBlock: 56, horizonBlocks: 40, maxTicks: 44,
  allowed: { actions: ['placeSeriesCap', 'demolish'], parts: { placeSeriesCap: KS } },
  // the site list (the bot population's design space) stops at 70 %: k = 100 % is allowed to the player (the trap) and loses at the fault in the lesson-gate test, but it is not a design the population should rank
  sites: [{ id: 'series', options: [{ id: 'none', actions: [] }, ...KS.filter((k) => k < 100).map((k) => ({ id: `k${k}`, actions: series(k) }))] }],
  thresholds: { farVMinPu: FAR_V_MIN, farVStar3Pu: FAR_V_STAR3, breakerKA: FEEDER.breakerKA },
  decisive: null,
  star3: [{ key: 'loadVMinPu', min: 'farVStar3Pu' }],
  ch3: { track: true, loadVMinPu: FAR_V_MIN, fault: { block: FAULT_BLOCK, bus: 'B2', sscMVA: FEEDER.sscMVA, xOverR: FEEDER.xOverR, breakerKA: FEEDER.breakerKA, movPu: FEEDER.movPu } },
  brownoutLoses: true, blackoutLoses: true, stars: true, histogram: 'capex',
  story: { placeKey: 'level.L09.place', lineKeys: ['level.L09.story1', 'level.L09.story2', 'level.L09.story3'], lessonKey: 'level.L09.lesson', lessonKind: 'series' },
  naive: { actions: [], failKind: 'brownout' },
  lesson: series(55),
  reference: series(70),
  // frozen from the bot population (5 designs per region: 3 pass, k = 40, 55, 70 %; the budget is 1.3 x the cheapest pass: the capacitor is mostly platform and protection, so k = 100 % is affordable and has to fail at the fault;
  // A = B = the dearest passing design, k = 70 %, the only one that also keeps the far end >= 0.97 pu); level.test.ts regenerates them and fails on drift > 2 %
  frozen: { global: { budget: 650000, starA: 513214.22102194605, starB: 513214.22102194605 }, in: { budget: 65000000, starA: 51321422.10219461, starB: 51321422.10219461 } },
  coach: [
    { id: 'read', textKey: 'coach.L09.read', whyKey: 'coach.L09.read.why', done: (s) => s.tick > s.levelStart },
    { id: 'series', textKey: 'coach.L09.series', whyKey: 'coach.L09.series.why', done: (s) => s.branches.some((b) => b.seriesCap !== undefined) },
    { id: 'run', textKey: 'coach.L09.run', whyKey: 'coach.L09.run.why', done: (s) => s.status !== 'playing' },
  ],
  place: (s, sc) => {
    const A = (name: string, ...a: unknown[]): void => place(sc, s, name, ...a);
    A('placeBus', 2, 2, 33, 'gen', 1.05); A('placeBus', 40, 2, 33, 'load');
    A('stringLine', 'B1', 'B2', 'l33-dog', 1, LINE_KM);
    A('placeUnit', 'ccgt-418', 'B1', 20);
    A('placeLoad', 'B2', 'industrial', QUARRY.peakMW, QUARRY.pf);
    for (const l of s.loads) l.zip = [0, 0, 1];
    s.loads[0]!.shape = quarryShape();
    for (const u of s.units) { u.online = true; u.pMin = 0; u.P = 0; }   // the unit stands in for the substation (as L07)
  },
};
