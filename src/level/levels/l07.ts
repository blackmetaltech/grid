// L07 The Lagging Mill (DESIGN 2.6, Grid): a 1.2 MW rice mill (pf 0.70 lagging, 06:00-22:00) and a 0.5 MW village (pf 0.95) on a 4 km
// 11 kV ACSR Weasel feeder (115 A), substation held at 1.03 pu. Both loads sit at the far bus and are constant P and Q, exactly the
// 2-bus oracle of tools/oracles/expected.json (levels.L07): no capacitor 122.0 A, 0.9442 pu, loading 1.061; 900 kVAr 98.3 A, 0.9565 pu.
import type { Action } from '@core/kit';
import type { GridLevelSpec } from '../spec';
import { place } from '../spec';
import { BLOCKS_PER_DAY } from '../../types';

/** Mill daily shape as fractions of its 1.2 MW peak: P and Q per block (DESIGN L07). */
export const MILL = { peakMW: 1.2, pf: 0.7, lunchMW: 0.15, lunchMVAr: 0.9, onHour: 6, offHour: 22, lunchFrom: 13, lunchTo: 14 } as const;
export function millShape(): { p: number[]; q: number[] } {
  const tan = Math.sqrt(1 - MILL.pf * MILL.pf) / MILL.pf;
  const p: number[] = [], q: number[] = [];
  for (let b = 0; b < BLOCKS_PER_DAY; b++) {
    const h = b / 4;
    let fp = 0, fq = 0;
    if (h >= MILL.onHour && h < MILL.offHour) { fp = 1; fq = tan; }
    if (h >= MILL.lunchFrom && h < MILL.lunchTo) { fp = MILL.lunchMW / MILL.peakMW; fq = MILL.lunchMVAr / MILL.peakMW; }
    p.push(fp); q.push(fq);
  }
  return { p, q };
}

const fixed = (id: string, steps: number, on: number): Action[] => [{ name: 'placeShunt', args: ['B2', id, steps] }, { name: 'setShuntSteps', args: ['C1', on] }];
const auto = (id: string, steps: number, lo: number, hi: number): Action[] => [{ name: 'placeShunt', args: ['B2', id, steps] }, { name: 'setShuntSteps', args: ['C1', 1] }, { name: 'setShuntAuto', args: ['C1', lo, hi, 1] }];

export const L07: GridLevelSpec = {
  id: 'L07', kind: 'grid', chapter: 3, titleKey: 'level.L07.title', briefKey: 'level.L07.brief', concepts: ['power-factor', 'reactive-power', 'phasors', 'capacitor-compensation'],
  startBlock: 0, horizonBlocks: 96, maxTicks: 100,
  allowed: {
    actions: ['placeShunt', 'setShuntSteps', 'setShuntAuto', 'demolish', 'stringLine'],
    parts: { placeShunt: ['cap-11-300', 'cap-11-600', 'cap-11-900'], stringLine: ['l11-weasel', 'l11-rabbit'] },
  },
  sites: [
    {
      id: 'compensation', options: [
        { id: 'none', actions: [] },
        { id: 'fixed-300', actions: fixed('cap-11-300', 1, 1) }, { id: 'fixed-600', actions: fixed('cap-11-600', 1, 1) }, { id: 'fixed-900', actions: fixed('cap-11-900', 1, 1) },
        { id: 'fixed-1200', actions: fixed('cap-11-300', 4, 4) },
        { id: 'auto-600', actions: auto('cap-11-300', 2, 0.975, 1.005) }, { id: 'auto-900', actions: auto('cap-11-300', 3, 0.975, 1.005) }, { id: 'auto-1200', actions: auto('cap-11-300', 4, 0.975, 1.005) },
        { id: 'auto-1200-low', actions: auto('cap-11-300', 4, 0.96, 0.99) },
      ],
    },
    { id: 'conductor', options: [{ id: 'weasel', actions: [] }, { id: 'rabbit', actions: [{ name: 'demolish', args: ['T1'] }, { name: 'stringLine', args: ['B1', 'B2', 'l11-rabbit', 1, 4] }] }] },
  ],
  thresholds: { loadBusMinPu: { symbol: 'busBandLoPu', kv: 11 }, loadingMax: 1, pfStar3: 0.95, lossStar3Pct: 6 },
  decisive: { key: 'peakLoading', limit: 'loadingMax', dir: 'max' },
  star3: [{ key: 'pfDay', min: 'pfStar3' }, { key: 'lossPct', max: 'lossStar3Pct' }],
  brownoutLoses: true, blackoutLoses: true, stars: true, histogram: 'lossPct',
  naive: { actions: [], failKind: 'overload' },
  lesson: fixed('cap-11-900', 1, 1),
  reference: auto('cap-11-300', 4, 0.975, 1.005),
  // frozen from the bot population (src/level/population.ts); level.test.ts regenerates it and fails on drift > 2 %
  frozen: { global: { budget: 32000, starA: 28800, starB: 28800 }, in: { budget: 3200000, starA: 2880000, starB: 2880000 } },
  coach: [
    { id: 'read-amps', textKey: 'coach.L07.amps', whyKey: 'coach.L07.amps.why', done: (s) => s.tick > s.levelStart },
    { id: 'add-bank', textKey: 'coach.L07.bank', whyKey: 'coach.L07.bank.why', done: (s) => s.shunts.length > 0 },
    { id: 'switch-in', textKey: 'coach.L07.switch', whyKey: 'coach.L07.switch.why', done: (s) => s.shunts.some((h) => h.on > 0 || h.auto !== null) },
    { id: 'run-day', textKey: 'coach.L07.run', whyKey: 'coach.L07.run.why', done: (s) => s.status !== 'playing' },
  ],
  place: (s, sc) => {
    const A = (name: string, ...a: unknown[]): void => place(sc, s, name, ...a);
    A('placeBus', 2, 2, 11, 'gen', 1.03); A('placeBus', 12, 2, 11, 'load');
    A('stringLine', 'B1', 'B2', 'l11-weasel', 1, 4);
    A('placeUnit', 'ccgt-418', 'B1', 20);
    A('placeLoad', 'B2', 'industrial', MILL.peakMW, MILL.pf); A('placeLoad', 'B2', 'residential', 0.5, 0.95);
    // constant P and Q (the oracle's load model), and the mill's own daily shape
    for (const l of s.loads) l.zip = [0, 0, 1];
    s.loads[0]!.shape = millShape();
    // the unit stands in for the substation (an infinite bus): it has no 9 MW minimum-stable floor, or dispatch sees an 8.7 MW surplus against a 0.3 MW
    // night load and block frequency runs away (217 Hz, then > 1 kHz in the HUD dial)
    for (const u of s.units) { u.online = true; u.pMin = 0; u.P = 0; }
  },
};
