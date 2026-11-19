// L36 Exam Bridge: Feeder Numbers (DESIGN-1.1 B1; chapter 8 finale): the givens of a small 11 kV feeder are on screen. Predict the far-end voltage drop (the textbook sum of (R P + X Q) / V^2, percent), SAIFI and
// SAIDI (IEEE 1366, min/yr) before the run, and name the equation that governs the drop. All three predictions made = pass; all within 5 % = lamp 2; all within 1 % and the why card right = lamp 3. The score is
// the worst prediction error in percent. Engine: src/sim/distrib/radial.ts's formula and reliability.ts; oracle ch8_oracles.py.
import type { Action } from '@core/kit';
import type { GridLevelSpec } from '../spec';
import { placeL36, ch8Start } from '../ch8/place';
import { examAnswers } from '../../sim/ch8/exam';
import { L36 as SC } from '../../sim/ch8/data';
import { ch8TryHint } from '../ch8/queries';

const A = examAnswers();
const round = (x: number, dp: number): number => { const k = [1, 10, 100, 1000][dp]!; return Math.round(x * k) / k; };
const pred = (id: string, v: number, unit: string): Action => ({ name: 'predict', args: [id, v, unit] });
/** A prediction set scaled by a factor (1 = exact to two decimals). */
const set = (f: number): Action[] => [pred('dropPct', round(A.dropPct * f, 2), '%'), pred('saifi', round(A.saifi * f, 3), '/yr'), pred('saidi', round(A.saidi * f, 1), 'min')];
const why = (c: string): Action[] => [{ name: 'answerWhy', args: [c] }];
const used = (s: { actionLog: { name: string }[] }, ...names: string[]): boolean => s.actionLog.some((a) => names.includes(a.name));
const has = (s: { metrics: { predictions: { id: string }[] } }, ...ids: string[]): boolean => ids.every((i) => s.metrics.predictions.some((p) => p.id === i));

export const L36: GridLevelSpec = {
  id: 'L36', kind: 'event', chapter: 8, titleKey: 'level.L36.title', briefKey: 'level.L36.brief', concepts: ['voltage-drop', 'saifi', 'saidi', 'estimation'],
  startBlock: 40, horizonBlocks: null, maxTicks: 2,
  allowed: { actions: ['answerWhy'], parts: {} },
  sites: [
    { id: 'drop', options: [{ id: 'none', actions: [] }, { id: 'off10', actions: [pred('dropPct', round(A.dropPct * 1.1, 2), '%')] }, { id: 'off3', actions: [pred('dropPct', round(A.dropPct * 1.03, 2), '%')] }, { id: 'exact', actions: [pred('dropPct', round(A.dropPct, 2), '%')] }] },
    { id: 'saifi', options: [{ id: 'none', actions: [] }, { id: 'off10', actions: [pred('saifi', round(A.saifi * 1.1, 3), '/yr')] }, { id: 'off3', actions: [pred('saifi', round(A.saifi * 1.03, 3), '/yr')] }, { id: 'exact', actions: [pred('saifi', round(A.saifi, 3), '/yr')] }] },
    { id: 'saidi', options: [{ id: 'none', actions: [] }, { id: 'off10', actions: [pred('saidi', round(A.saidi * 1.1, 1), 'min')] }, { id: 'off3', actions: [pred('saidi', round(A.saidi * 1.03, 1), 'min')] }, { id: 'exact', actions: [pred('saidi', round(A.saidi, 1), 'min')] }] },
    { id: 'why', options: SC.whyChoices.map((c) => ({ id: c, actions: why(c) })) },
  ],
  thresholds: { errOk: SC.tolStarPct, one: 1 },
  decisive: null,
  star3: [{ key: 'predErrPct', max: 'errOk' }, { key: 'whyOk', min: 'one' }],
  brownoutLoses: false, blackoutLoses: false, stars: true, histogram: 'score', scoreUnit: 'pct',
  story: { placeKey: 'level.L36.place', lineKeys: ['level.L36.story1', 'level.L36.story2'], lessonKey: 'level.L36.lesson', lessonKind: 'ch8' },
  tryText: (s) => ch8TryHint(s),
  naive: { actions: [], failKind: 'ch8.noPrediction' },
  lesson: [...set(1.04), ...why('dv-ir-only')],
  reference: [...set(1), ...why('dv-rp-xq')],
  // frozen from the bot population (src/level/population.ts); ch8.test.ts regenerates it and fails on drift > 2 %
  frozen: { global: { budget: 0, starA: 10.018214936247723, starB: 0.015028554253085014 }, in: { budget: 0, starA: 10.018214936247723, starB: 0.015028554253085014 } },
  coach: [
    { id: 'drop', textKey: 'coach.L36.drop', whyKey: 'coach.L36.drop.why', done: (s) => has(s, 'dropPct') || s.tick > s.levelStart },
    { id: 'rel', textKey: 'coach.L36.rel', whyKey: 'coach.L36.rel.why', done: (s) => has(s, 'saifi', 'saidi') || s.tick > s.levelStart },
    { id: 'why', textKey: 'coach.L36.why', whyKey: 'coach.L36.why.why', done: (s) => used(s, 'answerWhy') || s.tick > s.levelStart },
    { id: 'run', textKey: 'coach.L36.run', whyKey: 'coach.L36.run.why', done: (s) => s.tick > s.levelStart || s.status !== 'playing' },
  ],
  place: (s, sc) => { ch8Start(s, sc, 'L36'); placeL36(s, sc); },
};
