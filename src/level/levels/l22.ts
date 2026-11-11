// L22 Exam Bridge: Droop & RoCoF (DESIGN 2.6 chapter 6, a bench-style level on the grid chassis with textbook readouts). Three textbook predictions are rated against the engine's own
// frequency window (PS-23 RoCoF = dP f0 / (2 H S) at 60 Hz, PS-25 df = -dP / (1/R + D), PS-26 droop sharing df = -dP / (S1/R1 + S2/R2)), then the task: two machines, G1 500 MVA and
// G2 300 MVA, start with the textbook droops (4 % and 5 %: they share a 100 MW step 67.6 : 32.4). Set the droops so they share it 60 : 40.
import type { Action } from '@core/kit';
import type { GridLevelSpec } from '../spec';
import { place } from '../spec';
import { BLOCKS_PER_DAY } from '../../types';
import { freqLesson, freqTry } from '../ch6-text';

export const L22_EVENT_BLOCK = 4, L22_HORIZON = 8;
export const G1 = 'U1', G2 = 'U2', G3 = 'U3';
/** The three predictions of the bridge: ids the engine rates (src/sim/freqtrack.ts examTruth). */
export const PREDICTIONS = [{ id: 'examA', unit: 'Hz/s' }, { id: 'examB', unit: 'Hz' }, { id: 'examC', unit: 'MW' }] as const;
export const droops = (r1: number, r2: number): Action[] => [{ name: 'setDroop', args: [G1, r1] }, { name: 'setDroop', args: [G2, r2] }];
/** The answers of the three textbook cases (tools/oracles/ch6_oracles.py L22), as an exam-taker who read the chapter would key them in. */
export const answers = (a: number, b: number, c: number): Action[] => [{ name: 'predict', args: ['examA', a, 'Hz/s'] }, { name: 'predict', args: ['examB', b, 'Hz'] }, { name: 'predict', args: ['examC', c, 'MW'] }];
export const ORACLE_ANSWERS = answers(1.2, -0.024038461538461536, 67.56756756756756);

const R1S = [3, 4, 5], R2S = [3, 3.6, 4, 4.5, 5, 6];

export const L22: GridLevelSpec = {
  id: 'L22', kind: 'grid', chapter: 6, titleKey: 'level.L22.title', briefKey: 'level.L22.brief', concepts: ['rocof', 'inertia-constant', 'governor-droop', 'droop-sharing', 'load-damping'],
  startBlock: 0, horizonBlocks: L22_HORIZON, maxTicks: L22_HORIZON + 4,
  allowed: { actions: ['predict', 'setDroop'], parts: {} },
  sites: [
    { id: 'g1-droop', options: R1S.map((r) => ({ id: `r1-${r}`, actions: [{ name: 'setDroop', args: [G1, r] }] })) },
    { id: 'g2-droop', options: R2S.map((r) => ({ id: `r2-${r}`, actions: [{ name: 'setDroop', args: [G2, r] }] })) },
  ],
  thresholds: { shareTol: 0.02, predStarPct: 1 },
  decisive: { key: 'shareErr', limit: 'shareTol', dir: 'max' },
  star3: [{ key: 'predErrPct', max: 'predStarPct' }],
  brownoutLoses: false, blackoutLoses: true, stars: true, histogram: 'capex',
  extraRules: () => ({ freqTrack: true, freqExam: true, predStars: true, trackBand: { key: 'shareG1', lo: 0.58, hi: 0.62 } }),
  lessonText: (s, p, th) => freqLesson(s, p, th, 'L22'),
  tryText: (s, p, th) => freqTry(s, p, th, 'L22'),
  story: { placeKey: 'level.L22.place', lineKeys: ['level.L22.story1', 'level.L22.story2', 'level.L22.story3'], lessonKey: 'level.L22.lesson' },
  naive: { actions: [], failKind: 'share' },
  // lesson: the task alone (R1 4 %, R2 3.6 %: S1/R1 : S2/R2 = 12 500 : 8 333 = 60 : 40), one star; reference: the same droops and the three textbook answers keyed in first, three stars
  lesson: droops(4, 3.6),
  reference: [...ORACLE_ANSWERS, ...droops(4, 3.6)],
  // no money on an exam: the targets are zero (the budget 0 means no limit) and the stars are decided by the predictions (rules.predStars)
  frozen: { global: { budget: 0, starA: 0, starB: 0 }, in: { budget: 0, starA: 0, starB: 0 } },
  coach: [
    { id: 'predict', textKey: 'coach.L22.predict', whyKey: 'coach.L22.predict.why', done: (s) => s.metrics.predictions.length >= 3 },
    { id: 'droops', textKey: 'coach.L22.droops', whyKey: 'coach.L22.droops.why', done: (s) => s.actionLog.some((a) => a.name === 'setDroop') },
    { id: 'run', textKey: 'coach.L22.run', whyKey: 'coach.L22.run.why', done: (s) => s.status !== 'playing' },
  ],
  place: (s, sc) => {
    const A = (name: string, ...a: unknown[]): void => place(sc, s, name, ...a);
    A('placeBus', 4, 4, 400, 'gen', 1.0);
    A('placeUnit', 'ccgt-418', 'B1', 425);   // G1: 500 MVA, H = 5 s
    A('placeUnit', 'ccgt-418', 'B1', 255);   // G2: 300 MVA, H = 5 s
    A('placeUnit', 'ccgt-418', 'B1', 100);   // G3: 100 MW, trips at the fourth block: the 100 MW step
    A('placeLoad', 'B1', 'residential', 580, 0.95);
    for (const l of s.loads) { l.zip = [0, 0, 1]; l.shape = { p: new Array<number>(BLOCKS_PER_DAY).fill(1), q: new Array<number>(BLOCKS_PER_DAY).fill(0.3) }; }
    for (const u of s.units) u.online = true;
    // the textbook droops, and a hand-written dispatch: G1 300, G2 180, G3 100 MW; after the trip the operator moves the 100 MW onto G1 and G2 (G1 360, G2 220)
    const row = (before: number, after: number): number[] => Array.from({ length: BLOCKS_PER_DAY }, (_, k) => (k <= L22_EVENT_BLOCK ? before : after));
    s.dispatch.auto = false; s.dispatch.schedule = [row(300, 360), row(180, 220), row(100, 100)];
    s.units[0]!.P = 300; s.units[1]!.P = 180; s.units[2]!.P = 100;
    s.units[0]!.droopPct = 4; s.units[1]!.droopPct = 5;
    s.events.queue.push({ id: 'trip-G3', day: 0, block: L22_EVENT_BLOCK, kind: 'trip-unit', target: G3, magnitude: 0 });
  },
};
