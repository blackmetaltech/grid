// L23 Fault Level (DESIGN 2.6, Event: protection; chapter 7 job 1): the 33 kV industrial substation grows two 25 MW captive generators, and a scripted 3-phase fault on a feeder just
// outside its breaker must be cleared. Fault level I_f = V/Z_th (oracle PS-17's method, G-18: parallel sources add); the breakers must be rated above it or they fail and breaker-failure
// protection blacks out the estate 0.5 s later. Lesson builds: 31.5 kA breakers, a split bus (N-1 lost), a bus-section reactor, a high-impedance transformer pair. Oracle: tools/oracles/ch7_oracles.py.
import type { Action } from '@core/kit';
import type { GridLevelSpec } from '../spec';
import { placeBoard, ch7Start } from '../ch7/place';
import { SC } from '../../sim/ch7/data';

const rating = (k: number): Action[] => [{ name: 'setBreakerRating', args: [k] }];
const reactor = (x: number): Action[] => [{ name: 'setSeriesReactor', args: [x] }];
const used = (s: { actionLog: { name: string }[] }, ...names: string[]): boolean => s.actionLog.some((a) => names.includes(a.name));

export const L23: GridLevelSpec = {
  id: 'L23', kind: 'event', chapter: 7, titleKey: 'level.L23.title', briefKey: 'level.L23.brief', concepts: ['fault-level', 'thevenin', 'breaking-capacity', 'bus-split'],
  startBlock: 80, horizonBlocks: null, maxTicks: 2,
  allowed: {
    actions: ['setBreakerRating', 'setBusCoupler', 'setSeriesReactor', 'setTransformerZ'],
    parts: { setBreakerRating: ['25', '31.5', '40'], setSeriesReactor: ['0', '0.1', '0.2'], setTransformerZ: ['10', '14'] },
  },
  sites: [
    { id: 'breakers', options: [{ id: 'r25', actions: [] }, { id: 'r31.5', actions: rating(31.5) }, { id: 'r40', actions: rating(40) }] },
    { id: 'coupler', options: [{ id: 'closed', actions: [] }, { id: 'open', actions: [{ name: 'setBusCoupler', args: [true] }] }] },
    { id: 'reactor', options: [{ id: 'none', actions: [] }, { id: 'x0.10', actions: reactor(0.1) }, { id: 'x0.20', actions: reactor(0.2) }] },
    { id: 'transformers', options: [{ id: 'uk10', actions: [] }, { id: 'uk14', actions: [{ name: 'setTransformerZ', args: [14] }] }] },
  ],
  thresholds: { dutyMax: 1, n1VMin: { symbol: 'busBandLoPu', kv: 33 }, one: 1, predTolPct: SC.l23.predictTolPct },
  decisive: { key: 'dutyRatio', limit: 'dutyMax', dir: 'max' },
  star3: [{ key: 'n1Secure', min: 'one' }, { key: 'n1VPu', min: 'n1VMin' }, { key: 'predErrPct', max: 'predTolPct' }],
  botIgnoreStar3: ['predErrPct'],
  brownoutLoses: false, blackoutLoses: false, stars: true, histogram: 'capex',
  story: { placeKey: 'level.L23.place', lineKeys: ['level.L23.story1', 'level.L23.story2'], lessonKey: 'level.L23.lesson', lessonKind: 'ch7' },
  naive: { actions: [], failKind: 'ch7.breakerFail' },
  lesson: rating(31.5),
  reference: [...rating(31.5), { name: 'predict', args: ['faultKA', 30.19, 'kA'] }],
  // frozen from the bot population (src/level/population.ts); ch7.test.ts regenerates it and fails on drift > 2 %
  frozen: { global: { budget: 490000, starA: 440000, starB: 440000 }, in: { budget: 41000000, starA: 36520000, starB: 36520000 } },
  coach: [
    { id: 'predict', textKey: 'coach.L23.predict', whyKey: 'coach.L23.predict.why', done: (s) => s.metrics.predictions.some((p) => p.id === 'faultKA') || s.tick > s.levelStart },
    { id: 'measure', textKey: 'coach.L23.measure', whyKey: 'coach.L23.measure.why', done: (s) => used(s, 'setBreakerRating', 'setBusCoupler', 'setSeriesReactor', 'setTransformerZ') || s.tick > s.levelStart },
    { id: 'run', textKey: 'coach.L23.run', whyKey: 'coach.L23.run.why', done: (s) => s.tick > s.levelStart || s.status !== 'playing' },
  ],
  place: (s, sc) => { ch7Start(s, 'L23'); placeBoard(s, sc, false); },
};
