// L24 Coordination (DESIGN 2.6, Event: protection; chapter 7 job 2): a radial 11 kV feeder with four IEC IDMT overcurrent relays, six scripted faults. Every fault must be cleared by the relay
// nearest above it, with each upstream relay at least 0.3 s slower (CTI) at the fault current it shares, no relay may trip on load (pickup >= 1.25 x the load current), and no conductor may anneal
// (I^2 t <= (K A)^2). Score: the sum of the six clearing times. Oracle: tools/oracles/ch7_oracles.py.
import type { Action } from '@core/kit';
import type { GridLevelSpec } from '../spec';
import { placeFeeder, ch7Start } from '../ch7/place';

const curve = (c: string): Action[] => [{ name: 'setRelayCurve', args: ['all', c] }];
const pickup = (p: number): Action[] => [{ name: 'setRelayPickup', args: ['all', p] }];
const tms = (k: number, v: number): Action[] => [{ name: 'setRelayTms', args: [`R${k}`, v] }];
const graded = (c: string, p: number, t: number[]): Action[] => [...curve(c), ...pickup(p), ...t.flatMap((v, i) => tms(i + 1, v))];
const T = [0.05, 0.15, 0.25, 0.35, 0.5];
const used = (s: { actionLog: { name: string }[] }, ...names: string[]): boolean => s.actionLog.some((a) => names.includes(a.name));

export const L24: GridLevelSpec = {
  id: 'L24', kind: 'event', chapter: 7, titleKey: 'level.L24.title', briefKey: 'level.L24.brief', concepts: ['idmt', 'grading', 'selectivity', 'conductor-i2t'],
  startBlock: 80, horizonBlocks: null, maxTicks: 2,
  allowed: {
    actions: ['setRelayCurve', 'setRelayPickup', 'setRelayTms'],
    parts: { setRelayCurve: ['SI', 'VI', 'EI'] },
  },
  sites: [
    { id: 'curve', options: [{ id: 'SI', actions: curve('SI') }, { id: 'VI', actions: curve('VI') }, { id: 'EI', actions: curve('EI') }] },
    { id: 'pickup', options: [{ id: 'p75', actions: pickup(75) }, { id: 'p100', actions: pickup(100) }, { id: 'p150', actions: pickup(150) }] },
    { id: 'r1', options: [...[0.05, 0.15, 0.25, 0.35, 0.5, 0.75].map((v) => ({ id: `t${v}`, actions: tms(1, v) }))] },
    { id: 'r2', options: T.map((v) => ({ id: `t${v}`, actions: tms(2, v) })) },
    { id: 'r3', options: T.map((v) => ({ id: `t${v}`, actions: tms(3, v) })) },
    { id: 'r4', options: T.map((v) => ({ id: `t${v}`, actions: tms(4, v) })) },
  ],
  thresholds: { ctiMarginMin: 0, ctiRobust: 0.05 },
  decisive: { key: 'minCtiMarginS', limit: 'ctiMarginMin', dir: 'min' },
  star3: [{ key: 'minCtiMarginS', min: 'ctiRobust' }],
  brownoutLoses: false, blackoutLoses: false, stars: true, histogram: 'score', scoreUnit: 's',
  story: { placeKey: 'level.L24.place', lineKeys: ['level.L24.story1', 'level.L24.story2'], lessonKey: 'level.L24.lesson', lessonKind: 'ch7' },
  naive: { actions: [], failKind: 'ch7.miscoordination' },
  lesson: graded('SI', 100, [0.35, 0.25, 0.15, 0.05]),
  reference: graded('EI', 150, [0.35, 0.35, 0.25, 0.05]),
  // frozen from the bot population (src/level/population.ts); ch7.test.ts regenerates it and fails on drift > 2 %
  frozen: { global: { budget: 19000, starA: 2.942562071065015, starB: 2.1602033606813 }, in: { budget: 1600000, starA: 2.942562071065015, starB: 2.1602033606813 } },
  coach: [
    { id: 'pickup', textKey: 'coach.L24.pickup', whyKey: 'coach.L24.pickup.why', done: (s) => used(s, 'setRelayPickup') || s.tick > s.levelStart },
    { id: 'grade', textKey: 'coach.L24.grade', whyKey: 'coach.L24.grade.why', done: (s) => used(s, 'setRelayTms') || s.tick > s.levelStart },
    { id: 'run', textKey: 'coach.L24.run', whyKey: 'coach.L24.run.why', done: (s) => s.tick > s.levelStart || s.status !== 'playing' },
  ],
  place: (s, sc) => { ch7Start(s, 'L24'); placeFeeder(s, sc); },
};
