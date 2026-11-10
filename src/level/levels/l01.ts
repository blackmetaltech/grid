// L01 First Light (DESIGN 2.6, Bench, tutorial): light the 10-home hamlet from the hut, every home at 43.2 V or more from 18:00 to 23:00.
// Numbers: IEC 60228 cable resistances through the bench MNA (oracles G-01b, G-02); the 43.2 V limit is -10 % of 48 V (game).
import { CABLE_SIZES_MM2, HUT_SITES_M, freshBench } from '../bench';
import type { GridLevelSpec } from '../spec';
import type { GridState } from '../../types';

const run = (s: Readonly<GridState>): boolean => s.tick > s.levelStart;
const lit = (s: Readonly<GridState>): boolean => run(s) && (s.metrics.track.vLoadMinV ?? 0) >= (s.bench?.limits.vMinV ?? Infinity);

export const L01: GridLevelSpec = {
  id: 'L01', kind: 'bench', chapter: 1, titleKey: 'level.L01.title', briefKey: 'level.L01.brief', concepts: ['ohms-law', 'cable-resistance', 'brownout'],
  startBlock: 72, horizonBlocks: 20, maxTicks: 24,
  allowed: { actions: ['placeHut', 'layCable'], parts: { layCable: [...CABLE_SIZES_MM2] } },
  sites: [
    { id: 'hut', options: HUT_SITES_M.map((d) => ({ id: `hut-${d}`, actions: [{ name: 'placeHut', args: [d] }] })) },
    { id: 'cable', options: CABLE_SIZES_MM2.map((a) => ({ id: `cu-${a}`, actions: [{ name: 'layCable', args: ['main', a] }] })) },
  ],
  thresholds: { vLoadMinV: 43.2, lossMaxPct: 5 },
  decisive: { key: 'vLoadMinV', limit: 'vLoadMinV', dir: 'min' },
  star3: [{ key: 'lossPct', max: 'lossMaxPct' }],
  story: { placeKey: 'level.L01.place', lineKeys: ['level.L01.story1', 'level.L01.story2'], lessonKey: 'level.L01.lesson' },
  brownoutLoses: true, blackoutLoses: false, stars: true, histogram: 'capex',
  naive: { actions: [{ name: 'placeHut', args: [300] }, { name: 'layCable', args: ['main', 2.5] }], failKind: 'brownout' },
  lesson: [{ name: 'placeHut', args: [300] }, { name: 'layCable', args: ['main', 35] }],
  reference: [{ name: 'placeHut', args: [120] }, { name: 'layCable', args: ['main', 25] }],
  // frozen from the bot population (src/level/population.ts); level.test.ts regenerates it and fails on drift > 2 %
  frozen: { global: { budget: 4000, starA: 2175, starB: 1468.5 }, in: { budget: 40000, starA: 21900, starB: 15072 } },
  coach: [
    { id: 'place-hut', textKey: 'coach.L01.hut', whyKey: 'coach.L01.hut.why', done: (s) => s.bench?.hutM != null },
    { id: 'lay-cable', textKey: 'coach.L01.cable', whyKey: 'coach.L01.cable.why', done: (s) => s.bench?.cableMm2.main != null },
    { id: 'run', textKey: 'coach.L01.run', whyKey: 'coach.L01.run.why', done: run },
    { id: 'thicker', textKey: 'coach.L01.thicker', whyKey: 'coach.L01.thicker.why', done: lit },
  ],
  place: (s, sc) => { s.bench = freshBench('l01', { vMinV: sc.th.vLoadMinV!, lossMaxPct: null }); },
};
