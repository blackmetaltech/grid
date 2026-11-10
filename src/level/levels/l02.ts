// L02 Two Hamlets (DESIGN 2.6, Bench): a second hamlet of 14 homes, 250 m from the hut; keep both at 43.2 V or more. Radial (two cables) or a
// trunk with a junction box and a branch to each hamlet: KCL at the junction. The worst-home voltage is the secondary star condition.
import { CABLE_SIZES_MM2, freshBench } from '../bench';
import type { GridLevelSpec } from '../spec';
import type { GridState } from '../../types';

const run = (s: Readonly<GridState>): boolean => s.tick > s.levelStart;
const fed = (s: Readonly<GridState>): boolean => run(s) && (s.metrics.track.vLoadMinV ?? 0) >= (s.bench?.limits.vMinV ?? Infinity);
const sizes = (run_: 'main' | 'b') => CABLE_SIZES_MM2.map((a) => ({ id: `${run_}-cu-${a}`, actions: [{ name: 'layCable', args: [run_, a] }] }));

export const L02: GridLevelSpec = {
  id: 'L02', kind: 'bench', chapter: 1, titleKey: 'level.L02.title', briefKey: 'level.L02.brief', concepts: ['kcl', 'series-parallel', 'trunk-current'],
  startBlock: 72, horizonBlocks: 20, maxTicks: 24,
  allowed: { actions: ['placeJunction', 'layCable'], parts: { layCable: [...CABLE_SIZES_MM2] } },
  sites: [
    { id: 'layout', options: [{ id: 'radial', actions: [] }, { id: 'trunk', actions: [{ name: 'placeJunction' }] }] },
    { id: 'main', options: sizes('main') },
    { id: 'branch', options: sizes('b') },
  ],
  thresholds: { vLoadMinV: 43.2, vStar3V: 45 },
  decisive: { key: 'vLoadMinV', limit: 'vLoadMinV', dir: 'min' },
  star3: [{ key: 'vLoadMinV', min: 'vStar3V' }],
  story: { placeKey: 'level.L02.place', lineKeys: ['level.L02.story1', 'level.L02.story2'], lessonKey: 'level.L02.lesson' },
  brownoutLoses: true, blackoutLoses: false, stars: true, histogram: 'capex',
  naive: { actions: [{ name: 'placeJunction' }, { name: 'layCable', args: ['main', 4] }, { name: 'layCable', args: ['b', 4] }], failKind: 'brownout' },
  lesson: [{ name: 'layCable', args: ['main', 25] }, { name: 'layCable', args: ['b', 35] }],
  reference: [{ name: 'layCable', args: ['main', 16] }, { name: 'layCable', args: ['b', 50] }],
  // frozen from the bot population (src/level/population.ts); level.test.ts regenerates it and fails on drift > 2 %
  frozen: { global: { budget: 5300, starA: 4818.8, starB: 4818.8 }, in: { budget: 52000, starA: 47789.2, starB: 47789.2 } },
  coach: [
    { id: 'choose-layout', textKey: 'coach.L02.layout', whyKey: 'coach.L02.layout.why', done: (s) => s.bench?.topology != null },
    { id: 'lay-cables', textKey: 'coach.L02.cables', whyKey: 'coach.L02.cables.why', done: (s) => s.bench?.cableMm2.main != null && s.bench.cableMm2.b != null },
    { id: 'run', textKey: 'coach.L02.run', whyKey: 'coach.L02.run.why', done: run },
    { id: 'both-lit', textKey: 'coach.L02.both', whyKey: 'coach.L02.both.why', done: fed },
  ],
  place: (s, sc) => { s.bench = freshBench('l02', { vMinV: sc.th.vLoadMinV!, lossMaxPct: null }); },
};
