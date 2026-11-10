// L26 Merit Order (DESIGN 2.6, Grid; chapter 7 job 4): a 24-hour dispatch of subcritical coal, supercritical coal, CCGT, OCGT, an energy-limited hydro unit and solar across two areas joined by
// a 220 kV corridor. The player commits the thermal plants (windows, warm-up, ramps, min stable load) and picks how the day is dispatched: cheapest-first, equal-lambda, or equal-lambda WITH the
// corridor. The first two overload the corridor in the evening and lose the level; the third splits the price in two (generation-area lambda, load-area lambda). Oracle: tools/oracles/ch7_oracles.py.
import type { Action } from '@core/kit';
import type { GridLevelSpec } from '../spec';
import { placeTwoAreas, ch7Start } from '../ch7/place';
import { SC } from '../../sim/ch7/data';
import { PLANTS } from '../../sim/ch7/merit';

const mode = (m: string): Action[] => [{ name: 'setDispatchMode', args: [m] }];
const win = (p: string, a: number, b: number): Action[] => [{ name: 'setCommitment', args: [p, a, b] }];
const used = (s: { actionLog: { name: string }[] }, ...names: string[]): boolean => s.actionLog.some((a) => names.includes(a.name));

export const L26: GridLevelSpec = {
  id: 'L26', kind: 'event', chapter: 7, titleKey: 'level.L26.title', briefKey: 'level.L26.brief', concepts: ['merit-order', 'lambda-dispatch', 'congestion', 'water-value'],
  startBlock: 0, horizonBlocks: null, maxTicks: 2,
  allowed: { actions: ['setCommitment', 'setDispatchMode'], parts: { setDispatchMode: ['merit', 'lambda', 'corridor'] } },
  sites: [
    { id: 'mode', options: ['merit', 'lambda', 'corridor'].map((m) => ({ id: m, actions: mode(m) })) },
    ...PLANTS.map((p) => ({ id: p, options: SC.l26.windows[p]!.map(([a, b]) => ({ id: `${a}-${b}`, actions: win(p, a, b) })) })),
  ],
  thresholds: { corridorMax: 1, optPct: 1 },
  decisive: { key: 'corridorLoading', limit: 'corridorMax', dir: 'max' },
  star3: [{ key: 'costVsOptPct', max: 'optPct' }],
  brownoutLoses: false, blackoutLoses: false, stars: true, histogram: 'score',
  story: { placeKey: 'level.L26.place', lineKeys: ['level.L26.story1', 'level.L26.story2'], lessonKey: 'level.L26.lesson', lessonKind: 'ch7' },
  naive: { actions: [], failKind: 'ch7.congestion' },
  lesson: mode('corridor'),
  reference: [...mode('corridor'), ...win('ocgt', 17, 23), { name: 'predict', args: ['lambda20', 59.2, '$/MWh'] }],
  // frozen from the bot population (src/level/population.ts); ch7.test.ts regenerates it and fails on drift > 2 %
  frozen: { global: { budget: 0, starA: 545212.6661801212, starB: 530447.417508252 }, in: { budget: 0, starA: 45252651.292950064, starB: 44027135.653184906 } },
  coach: [
    { id: 'predict', textKey: 'coach.L26.predict', whyKey: 'coach.L26.predict.why', done: (s) => s.metrics.predictions.some((p) => p.id === 'lambda20') || s.tick > s.levelStart },
    { id: 'mode', textKey: 'coach.L26.mode', whyKey: 'coach.L26.mode.why', done: (s) => used(s, 'setDispatchMode') || s.tick > s.levelStart },
    { id: 'commit', textKey: 'coach.L26.commit', whyKey: 'coach.L26.commit.why', done: (s) => used(s, 'setCommitment') || s.tick > s.levelStart },
    { id: 'run', textKey: 'coach.L26.run', whyKey: 'coach.L26.run.why', done: (s) => s.tick > s.levelStart || s.status !== 'playing' },
  ],
  place: (s, sc) => { ch7Start(s, 'L26'); placeTwoAreas(s, sc); },
};
