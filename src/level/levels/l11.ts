// L11 Star or Delta (DESIGN 2.6, chapter 4, bench): an industrial estate at 400 V, motors 500 kW at pf 0.70 on a weak supply. Buy capacitors by the microfarad,
// wire them Y or delta (C_delta = C_Y / 3 for the same kVAr, PS-05) and start the 75 kW pump without the bus dipping more than 10 %.
import type { Action } from '@core/kit';
import type { GridLevelSpec } from '../spec';
import { freshL11 } from '../ch4/state';
import type { GridState } from '../../types';
import { bankQvar } from '../../sim/ch4/pfc';

const bank = (n: number, conn: 'Y' | 'D', rated: number): Action => ({ name: 'setBank', args: [100, n, conn, rated] });
const start = (k: 'dol' | 'yd' | 'soft'): Action => ({ name: 'setStarter', args: [k] });
const BANKS: { id: string; actions: Action[] }[] = [
  { id: 'none', actions: [] },
  ...[55, 72, 80, 95, 110].map((n) => ({ id: `y250x${n}`, actions: [bank(n, 'Y', 250)] })),
  ...[18, 24, 28, 33, 38].map((n) => ({ id: `d440x${n}`, actions: [bank(n, 'D', 440)] })),
  { id: 'd250x24', actions: [bank(24, 'D', 250)] },
  { id: 'y440x72', actions: [bank(72, 'Y', 440)] },
];
export const PUMP_BLOCK_OFFSET = 3;
const live = (s: Readonly<GridState>) => s.ch4?.l11 ?? null;
const qKvar = (s: Readonly<GridState>): number => { const b = live(s)?.bank; return b ? bankQvar(b, 50) / 1000 : 0; };

export const L11: GridLevelSpec = {
  id: 'L11', kind: 'bench', chapter: 4, titleKey: 'level.L11.title', briefKey: 'level.L11.brief', concepts: ['line-phase', 'star-delta', 'power-factor-correction', 'motor-starting'],
  startBlock: 32, horizonBlocks: 12, maxTicks: 16,
  allowed: { actions: ['setBank', 'setStarter'], parts: { setBank: [25, 50, 100], setStarter: ['dol', 'yd', 'soft'] } },
  sites: [{ id: 'bank', options: BANKS }, { id: 'starter', options: [{ id: 'dol', actions: [] }, { id: 'yd', actions: [start('yd')] }, { id: 'soft', actions: [start('soft')] }] }],
  thresholds: { pfMin: 0.95, dipMaxPct: 10, dipStarPct: 6 },
  decisive: { key: 'dipPct', limit: 'dipMaxPct', dir: 'max' },
  star3: [{ key: 'dipPct', max: 'dipStarPct' }],
  story: { placeKey: 'level.L11.place', lineKeys: ['level.L11.story1', 'level.L11.story2'], lessonKey: 'level.L11.lesson' },
  brownoutLoses: false, blackoutLoses: false, stars: true, histogram: 'capex',
  // naive: the right capacitor bank (star, 250 V cans), and the pump started direct on line: the whole estate dips 11.5 % and the other motors trip
  naive: { actions: [bank(72, 'Y', 250)], failKind: 'machine' },
  lesson: [bank(28, 'D', 440), start('soft')],
  reference: [bank(72, 'Y', 250), start('yd')],
  // frozen from the bot population (src/level/population.ts); tools/oracles/ch4_oracles.py replays the circuit independently; level.test.ts fails on drift > 2 %
  frozen: { global: { budget: 22000, starA: 17028.07, starB: 12761.59 }, in: { budget: 200000, starA: 153252.59, starB: 114854.27 } },
  coach: [
    { id: 'bank', textKey: 'coach.L11.bank', whyKey: 'coach.L11.bank.why', done: (s) => qKvar(s) >= 345.8 },
    { id: 'starter', textKey: 'coach.L11.starter', whyKey: 'coach.L11.starter.why', done: (s) => live(s)?.starter !== 'dol' },
    { id: 'run', textKey: 'coach.L11.run', whyKey: 'coach.L11.run.why', done: (s) => s.tick > s.levelStart },
    { id: 'done', textKey: 'coach.L11.done', whyKey: 'coach.L11.done.why', done: (s) => s.status !== 'playing' },
  ],
  place: (s, sc) => { s.ch4 = freshL11(sc, PUMP_BLOCK_OFFSET); },
};
