// L03 The Price of Distance (DESIGN 2.6, Bench): 5 kW to the school and health centre 1 km away with line losses <= 5 %. The exact table
// in tools/oracles/expected.json (levels.L03: 25 / 35 / 50 mm2 at 380 V: 5.81 / 4.05 / 2.93 %) is the engine's number.
import { CABLE_SIZES_MM2, freshBench } from '../bench';
import type { GridLevelSpec } from '../spec';
import type { GridState } from '../../types';

const run = (s: Readonly<GridState>): boolean => s.tick > s.levelStart;
const efficient = (s: Readonly<GridState>): boolean => run(s) && (s.metrics.track.lossPct ?? 100) <= (s.bench?.limits.lossMaxPct ?? 0);

export const L03: GridLevelSpec = {
  id: 'L03', kind: 'bench', chapter: 1, titleKey: 'level.L03.title', briefKey: 'level.L03.brief', concepts: ['joule-loss', 'high-voltage-transmission', 'converters'],
  startBlock: 72, horizonBlocks: 8, maxTicks: 12,
  allowed: { actions: ['placeConverters', 'layCable'], parts: { layCable: [...CABLE_SIZES_MM2] } },
  sites: [
    { id: 'voltage', options: [{ id: 'v48', actions: [] }, { id: 'v380', actions: [{ name: 'placeConverters', args: [true] }] }] },
    { id: 'cable', options: CABLE_SIZES_MM2.map((a) => ({ id: `cu-${a}`, actions: [{ name: 'layCable', args: ['main', a] }] })) },
  ],
  thresholds: { lossMaxPct: 5, lossStar3Pct: 3 },
  decisive: { key: 'lossPct', limit: 'lossMaxPct', dir: 'max' },
  star3: [{ key: 'lossPct', max: 'lossStar3Pct' }],
  story: { placeKey: 'level.L03.place', lineKeys: ['level.L03.story1', 'level.L03.story2'], lessonKey: 'level.L03.lesson' },
  brownoutLoses: true, blackoutLoses: false, stars: true, histogram: 'lossPct',
  naive: { actions: [{ name: 'layCable', args: ['main', 50] }], failKind: 'brownout' },
  lesson: [{ name: 'placeConverters', args: [true] }, { name: 'layCable', args: ['main', 35] }],
  reference: [{ name: 'placeConverters', args: [true] }, { name: 'layCable', args: ['main', 50] }],
  // frozen from the bot population (src/level/population.ts); level.test.ts regenerates it and fails on drift > 2 %
  frozen: { global: { budget: 18000, starA: 14850, starB: 16350 }, in: { budget: 310000, starA: 251500, starB: 265000 } },
  coach: [
    { id: 'lay-cable', textKey: 'coach.L03.cable', whyKey: 'coach.L03.cable.why', done: (s) => s.bench?.cableMm2.main != null },
    { id: 'raise-voltage', textKey: 'coach.L03.voltage', whyKey: 'coach.L03.voltage.why', done: (s) => s.bench?.converters === true },
    { id: 'run', textKey: 'coach.L03.run', whyKey: 'coach.L03.run.why', done: run },
    { id: 'losses-ok', textKey: 'coach.L03.losses', whyKey: 'coach.L03.losses.why', done: efficient },
  ],
  place: (s, sc) => { s.bench = freshBench('l03', { vMinV: null, lossMaxPct: sc.th.lossMaxPct! }); },
};
