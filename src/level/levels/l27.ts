// L27 Exam Bridge: Faults & lambda (DESIGN 2.6, Bench-style; chapter 7 finale): predict the textbook numbers (PS-17 3-phase fault kA, PS-18 SLG kA, PS-20 and PS-21 lambda of the 3-unit example,
// PS-24 the 60 Hz critical clearing time; Engineer adds PS-22 with losses), then do the task: the L23 substation has grown (one more captive generator, one more transformer) and the breaker
// rating must cover the fault level you just predicted (the 3-phase fault, not the smaller SLG), and tonight's 3-unit dispatch must meet 1000 MW inside every unit's limits.
// Implemented as an event level with textbook-mode readouts (flat 1.0 pu pre-fault). Oracle: tools/oracles/ch7_oracles.py and the PS table of DESIGN 9.1.
import type { Action } from '@core/kit';
import type { GridLevelSpec } from '../spec';
import { placeBoard, ch7Start } from '../ch7/place';
import { SC } from '../../sim/ch7/data';

const rating = (k: number): Action[] => [{ name: 'setBreakerRating', args: [k] }];
const disp = (a: number, b: number, c: number): Action[] => [{ name: 'setDispatch3', args: [a, b, c] }];
const used = (s: { actionLog: { name: string }[] }, ...names: string[]): boolean => s.actionLog.some((a) => names.includes(a.name));
const TRIPLES: [number, number, number][] = [[450, 340, 210], [450, 350, 200], [400, 350, 250], [450, 300, 250], [350, 350, 300], [450, 250, 300], [300, 350, 300], [334, 333, 333]];

export const L27: GridLevelSpec = {
  id: 'L27', kind: 'event', chapter: 7, titleKey: 'level.L27.title', briefKey: 'level.L27.brief', concepts: ['fault-level', 'sequence-networks', 'lambda-dispatch', 'equal-area'],
  startBlock: 80, horizonBlocks: null, maxTicks: 2,
  allowed: { actions: ['setBreakerRating', 'setDispatch3'], parts: { setBreakerRating: SC.l27.breakerRatingsKA.map(String) } },
  sites: [
    { id: 'breakers', options: SC.l27.breakerRatingsKA.map((k) => ({ id: `r${k}`, actions: rating(k) })) },
    { id: 'prediction', options: [{ id: 'none', actions: [] }, { id: 'guess', actions: [{ name: 'predict', args: ['ps17', 0.909, 'kA'] }] }] },
    { id: 'dispatch', options: TRIPLES.map((t) => ({ id: t.join('-'), actions: disp(...t) })) },
  ],
  thresholds: { dutyMax: 1, okMin: 4 },
  decisive: { key: 'dutyRatio', limit: 'dutyMax', dir: 'max' },
  star3: [{ key: 'predictionsOk', min: 'okMin' }],
  botIgnoreStar3: ['predictionsOk'],
  brownoutLoses: false, blackoutLoses: false, stars: true, histogram: 'score',
  story: { placeKey: 'level.L27.place', lineKeys: ['level.L27.story1', 'level.L27.story2'], lessonKey: 'level.L27.lesson', lessonKind: 'ch7' },
  naive: { actions: [], failKind: 'ch7.breakerFail' },
  lesson: [...rating(50), ...disp(400, 350, 250), { name: 'predict', args: ['ps17', 0.909, 'kA'] }],
  reference: [...rating(50), ...disp(450, 340, 210), { name: 'predict', args: ['ps17', 0.909, 'kA'] }, { name: 'predict', args: ['ps18', 0.7515, 'kA'] }, { name: 'predict', args: ['ps20', 9.163, '$/MWh'] }, { name: 'predict', args: ['ps21', 9.58, '$/MWh'] }, { name: 'predict', args: ['ps24', 0.26, 's'] }],
  // frozen from the bot population (src/level/population.ts); ch7.test.ts regenerates it and fails on drift > 2 %
  frozen: { global: { budget: 1200000, starA: 880332, starB: 880009 }, in: { budget: 95000000, starA: 73067556, starB: 73040747 } },
  coach: [
    { id: 'predict', textKey: 'coach.L27.predict', whyKey: 'coach.L27.predict.why', done: (s) => s.metrics.predictions.length >= 4 || s.tick > s.levelStart },
    { id: 'rating', textKey: 'coach.L27.rating', whyKey: 'coach.L27.rating.why', done: (s) => used(s, 'setBreakerRating') || s.tick > s.levelStart },
    { id: 'dispatch', textKey: 'coach.L27.dispatch', whyKey: 'coach.L27.dispatch.why', done: (s) => used(s, 'setDispatch3') || s.tick > s.levelStart },
    { id: 'run', textKey: 'coach.L27.run', whyKey: 'coach.L27.run.why', done: (s) => s.tick > s.levelStart || s.status !== 'playing' },
  ],
  place: (s, sc) => { ch7Start(s, 'L27'); placeBoard(s, sc, true); },
};
