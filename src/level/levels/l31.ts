// L31 The Long Feeder (DESIGN-1.1 B1, Event: distribution; chapter 8 job 1): Brightwater feeder 3, 16 km of 11 kV Weasel carrying 1.9 MW at the evening peak. Each section drops the voltage by about
// (R P + X Q) / V and the drops add up; the far end falls under 230 V -6 %. Off-load taps shift a customer the same amount at peak and at minimum load, so they only fit the spread; a regulator or a fatter
// conductor shrinks the drop itself. Pass: every customer inside 230 V (-6 % .. the pack's LV ceiling) at peak and at 30 % load. Lamp 2 spend, lamp 3 wire losses <= 4 %. Engine: src/sim/distrib/radial.ts.
import type { Action } from '@core/kit';
import type { GridLevelSpec } from '../spec';
import { placeL31, ch8Start } from '../ch8/place';
import { V_LO_PU } from '../../sim/ch8/data';
import { ch8TryHint } from '../ch8/queries';

const cond = (n: string[], c: string): Action[] => n.map((id) => ({ name: 'setConductor', args: [id, c] }));
const taps = (t: number[]): Action[] => t.map((v, i) => ({ name: 'setTap', args: [`N${i + 1}`, v] }));
const reg = (n: string): Action[] => [{ name: 'placeRegulator', args: [n, 1.0] }];
const used = (s: { actionLog: { name: string }[] }, ...names: string[]): boolean => s.actionLog.some((a) => names.includes(a.name));
const TAPS: number[][] = [[0, 0, 0, 0, 0], [0, 0, 2.5, 2.5, 2.5], [0, 0, 2.5, 5, 5], [0, 2.5, 2.5, 5, 5], [2.5, 5, 5, 5, 5]];
const W = 'Weasel', R = 'Rabbit', D = 'Dog', H = 'Hyena';

export const L31: GridLevelSpec = {
  id: 'L31', kind: 'event', chapter: 8, titleKey: 'level.L31.title', briefKey: 'level.L31.brief', concepts: ['voltage-drop', 'rp-xq', 'off-load-tap', 'regulator', 'feeder-losses'],
  startBlock: 80, horizonBlocks: null, maxTicks: 2,
  allowed: {
    actions: ['setConductor', 'setTap', 'placeRegulator', 'removeRegulator'],
    parts: { setConductor: [W, R, D, H], placeRegulator: ['N2', 'N3'] },
  },
  sites: [
    { id: 'head', options: [W, R, D, H].map((c) => ({ id: c, actions: cond(['N1', 'N2'], c) })) },
    { id: 'middle', options: [W, R, D].map((c) => ({ id: c, actions: cond(['N3'], c) })) },
    { id: 'tail', options: [W, R].map((c) => ({ id: c, actions: cond(['N4', 'N5'], c) })) },
    { id: 'regulator', options: [{ id: 'none', actions: [] }, { id: 'N2', actions: reg('N2') }, { id: 'N3', actions: reg('N3') }] },
    { id: 'taps', options: TAPS.map((t, i) => ({ id: `t${i}`, actions: taps(t) })) },
  ],
  thresholds: { marginMin: 0, vLoPu: V_LO_PU, vHiPu: { symbol: 'busBandHiPu', kv: 0.4 }, lossMax: 4 },
  decisive: { key: 'marginPu', limit: 'marginMin', dir: 'min' },
  star3: [{ key: 'lossPct', max: 'lossMax' }],
  brownoutLoses: false, blackoutLoses: false, stars: true, histogram: 'capex',
  story: { placeKey: 'level.L31.place', lineKeys: ['level.L31.story1', 'level.L31.story2'], lessonKey: 'level.L31.lesson', lessonKind: 'ch8' },
  tryText: (s) => ch8TryHint(s),
  naive: { actions: [], failKind: 'ch8.voltageLow' },
  lesson: [...cond(['N1', 'N2'], R), ...reg('N2'), ...taps(TAPS[4]!)],
  reference: [...cond(['N1', 'N2'], D), ...cond(['N3'], R), ...taps(TAPS[3]!)],
  // frozen from the bot population (src/level/population.ts); ch8.test.ts regenerates it and fails on drift > 2 %
  frozen: { global: { budget: 250000, starA: 220000, starB: 210000 }, in: { budget: 21000000, starA: 19920000, starB: 17430000 } },
  coach: [
    { id: 'read', textKey: 'coach.L31.read', whyKey: 'coach.L31.read.why', done: (s) => used(s, 'setConductor', 'setTap', 'placeRegulator') || s.tick > s.levelStart },
    { id: 'fix', textKey: 'coach.L31.fix', whyKey: 'coach.L31.fix.why', done: (s) => used(s, 'setConductor', 'placeRegulator') || s.tick > s.levelStart },
    { id: 'taps', textKey: 'coach.L31.taps', whyKey: 'coach.L31.taps.why', done: (s) => used(s, 'setTap') || s.tick > s.levelStart },
    { id: 'run', textKey: 'coach.L31.run', whyKey: 'coach.L31.run.why', done: (s) => s.tick > s.levelStart || s.status !== 'playing' },
  ],
  place: (s, sc) => { ch8Start(s, sc, 'L31'); placeL31(s, sc); },
};
