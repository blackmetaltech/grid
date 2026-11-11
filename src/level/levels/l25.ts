// L25 Clear It in Time (DESIGN 2.6, Event: transient stability; chapter 7 job 3): a fault on one circuit of the 400 kV line beside the Kestrel Falls hydro plant. The classical SMIB swing
// (P_m = 1.0 pu, H = 5 s, 50 Hz; P_max 1.8 pre, 0.3 during, 1.3 post-fault) decides whether the unit keeps step: clearing time = relay + breaker must beat the critical clearing time
// (about 164 ms; the 60 Hz textbook case PS-24 is in L27). Third star: a 50 ms margin. Oracle: tools/oracles/ch7_oracles.py (own RK4) and src/sim/dynamics/smib.ts.
import type { Action } from '@core/kit';
import type { GridLevelSpec } from '../spec';
import { placeHydroLine, ch7Start } from '../ch7/place';
import { SC } from '../../sim/ch7/data';

const design = (relay: string, cycles: number, reclose: boolean): Action[] => [{ name: 'setRelayType', args: [relay] }, { name: 'setBreakerCycles', args: [cycles] }, ...(reclose ? [{ name: 'setAutoReclose', args: [true] }] : [])];
const used = (s: { actionLog: { name: string }[] }, ...names: string[]): boolean => s.actionLog.some((a) => names.includes(a.name));
const RELAYS = Object.keys(SC.l25.relays);

export const L25: GridLevelSpec = {
  id: 'L25', kind: 'event', chapter: 7, titleKey: 'level.L25.title', briefKey: 'level.L25.brief', concepts: ['swing-equation', 'equal-area', 'critical-clearing-time', 'breaker-speed'],
  startBlock: 80, horizonBlocks: null, maxTicks: 2,
  allowed: {
    actions: ['setRelayType', 'setBreakerCycles', 'setAutoReclose'],
    parts: { setRelayType: RELAYS, setBreakerCycles: ['2', '3', '5'] },
  },
  sites: [
    { id: 'relay', options: RELAYS.map((id) => ({ id, actions: [{ name: 'setRelayType', args: [id] }] })) },
    { id: 'breaker', options: SC.l25.breakerCycles.map((n) => ({ id: `c${n}`, actions: [{ name: 'setBreakerCycles', args: [n] }] })) },
    { id: 'prediction', options: [{ id: 'none', actions: [] }, { id: 'guess', actions: [{ name: 'predict', args: ['deltaCrDeg', 53.5, 'deg'] }] }] },
    { id: 'reclose', options: [{ id: 'off', actions: [] }, { id: 'on', actions: [{ name: 'setAutoReclose', args: [true] }] }] },
  ],
  thresholds: { marginMin: 0, marginStar3: SC.l25.marginStarMs },
  decisive: { key: 'marginMs', limit: 'marginMin', dir: 'min' },
  star3: [{ key: 'marginMs', min: 'marginStar3' }],
  brownoutLoses: false, blackoutLoses: false, stars: true, histogram: 'capex',
  story: { placeKey: 'level.L25.place', lineKeys: ['level.L25.story1', 'level.L25.story2'], lessonKey: 'level.L25.lesson', lessonKind: 'ch7' },
  naive: { actions: [], failKind: 'ch7.outOfStep' },
  lesson: [...design('dist-z1', 3, false), { name: 'predict', args: ['deltaCrDeg', 53.5, 'deg'] }],
  reference: [...design('dist-z1', 3, false), { name: 'predict', args: ['deltaCrDeg', 53.5, 'deg'] }],
  // frozen from the bot population (src/level/population.ts); ch7.test.ts regenerates it and fails on drift > 2 %
  frozen: { global: { budget: 600000, starA: 551000, starB: 551000 }, in: { budget: 50000000, starA: 45733000, starB: 45733000 } },
  coach: [
    { id: 'predict', textKey: 'coach.L25.predict', whyKey: 'coach.L25.predict.why', done: (s) => s.metrics.predictions.some((p) => p.id === 'deltaCrDeg') || s.tick > s.levelStart },
    { id: 'relay', textKey: 'coach.L25.relay', whyKey: 'coach.L25.relay.why', done: (s) => used(s, 'setRelayType') || s.tick > s.levelStart },
    { id: 'breaker', textKey: 'coach.L25.breaker', whyKey: 'coach.L25.breaker.why', done: (s) => used(s, 'setBreakerCycles') || s.tick > s.levelStart },
    { id: 'run', textKey: 'coach.L25.run', whyKey: 'coach.L25.run.why', done: (s) => s.tick > s.levelStart || s.status !== 'playing' },
  ],
  place: (s, sc) => { ch7Start(s, 'L25'); placeHydroLine(s, sc); },
};
