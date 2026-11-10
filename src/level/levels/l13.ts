// L13 Exam Bridge: Generator Phasors (DESIGN 2.6, chapter 4, bench): V_t = 1.0 pu, I = 1.0 pu at pf 0.8 lagging, X_s = 1.2 pu. Predict E (1.970 pu), delta (29.17 deg) and
// P_max (1.642 pu) (oracles PS-27/28), then set the night excitation so the generator absorbs 0.2 pu of Q at P = 0.6 pu with delta under 60 degrees.
// Honest note: the bridge has no build cost, so its star rule is the exam's (one star for the predictions, two for the task, three for both within 1 %).
import type { Action } from '@core/kit';
import type { GridLevelSpec } from '../spec';
import { freshL13 } from '../ch4/state';
import { EXAM_IDS } from '../../sim/ch4/data';
import type { GridState } from '../../types';

const P = (id: string, v: number, unit: string): Action => ({ name: 'predict', args: [id, v, unit] });
const ANSWERS = (e: number, d: number, p: number): Action[] => [P(EXAM_IDS.E, e, 'pu'), P(EXAM_IDS.delta, d, 'deg'), P(EXAM_IDS.pmax, p, 'pu')];
const X = (e: number): Action => ({ name: 'setExcitation', args: [e] });
const have = (s: Readonly<GridState>, id: string): boolean => s.metrics.predictions.some((p) => p.id === id);

export const L13: GridLevelSpec = {
  id: 'L13', kind: 'bench', chapter: 4, titleKey: 'level.L13.title', briefKey: 'level.L13.brief', concepts: ['synchronous-generator', 'excitation', 'power-angle', 'phasor-diagram'],
  startBlock: 4, horizonBlocks: 6, maxTicks: 10,
  allowed: { actions: ['predict', 'setExcitation'], parts: {} },
  sites: [
    { id: 'predict', options: [
      { id: 'exact', actions: ANSWERS(1.97, 29.17, 1.642) }, { id: 'close', actions: ANSWERS(2.03, 30.0, 1.69) }, { id: 'sum', actions: ANSWERS(2.2, 0, 1.83) }, { id: 'noPhasor', actions: ANSWERS(1.0, 36.9, 0.83) },
    ] },
    { id: 'night', options: [{ id: 'none', actions: [] }, { id: 'e1.00', actions: [X(1)] }, { id: 'e1.04', actions: [X(1.04)] }, { id: 'e1.047', actions: [X(1.047)] }, { id: 'e1.30', actions: [X(1.3)] }] },
  ],
  thresholds: { predMaxPct: 5, predStarPct: 1, qTolPu: 0.02, qStarPu: 0.002 },
  decisive: { key: 'predErrPct', limit: 'predMaxPct', dir: 'max' },
  star3: [{ key: 'predErrPct', max: 'predStarPct' }, { key: 'qErrPu', max: 'qStarPu' }],
  story: { placeKey: 'level.L13.place', lineKeys: ['level.L13.story1', 'level.L13.story2'], lessonKey: 'level.L13.lesson' },
  brownoutLoses: false, blackoutLoses: false, stars: true, histogram: 'capex',
  // naive: add the magnitudes (1 + 1.2 x 1 = 2.2 pu) instead of the phasors
  naive: { actions: ANSWERS(2.2, 0, 1.83), failKind: 'machine' },
  // lesson: right to about 3 %, the night task done but not to 1 %
  lesson: [...ANSWERS(2.03, 30.0, 1.69), X(1.04)],
  reference: [...ANSWERS(1.97, 29.17, 1.642), X(1.047)],
  frozen: { global: { budget: 0, starA: 0, starB: 0 }, in: { budget: 0, starA: 0, starB: 0 } },
  coach: [
    { id: 'predictE', textKey: 'coach.L13.predictE', whyKey: 'coach.L13.predictE.why', done: (s) => have(s, EXAM_IDS.E) },
    { id: 'predictAll', textKey: 'coach.L13.predictAll', whyKey: 'coach.L13.predictAll.why', done: (s) => have(s, EXAM_IDS.E) && have(s, EXAM_IDS.delta) && have(s, EXAM_IDS.pmax) },
    { id: 'excite', textKey: 'coach.L13.excite', whyKey: 'coach.L13.excite.why', done: (s) => s.ch4?.l13?.excitation != null },
    { id: 'run', textKey: 'coach.L13.run', whyKey: 'coach.L13.run.why', done: (s) => s.tick > s.levelStart },
  ],
  place: (s, sc) => { s.ch4 = freshL13(sc); },
};
