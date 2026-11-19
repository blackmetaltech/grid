// L32 Count the Outages (DESIGN-1.1 B1, Event: distribution; chapter 8 job 2): the expected year of feeder 3 with IEEE 1366 indices. A fault anywhere on the 21 km of overhead line (0.15 per km per year,
// 4 h to repair) interrupts everything downstream of the nearest fuse or switch until it is repaired or switched round: SAIFI = sum(customers interrupted) / customers served, SAIDI = customer-minutes / customers
// served, CAIDI = SAIDI / SAIFI. Interruptions of five minutes or less are momentary and not counted, which is what a remote switch buys. Place at most three sectionalisers (manual or remote), fuse the spurs,
// close the tie to the next feeder or not. Pass: SAIDI and SAIFI under the regulator's targets. Lamp 3: energy not supplied under the star line. Engine: src/sim/distrib/reliability.ts, oracle ch8_oracles.py.
import type { Action } from '@core/kit';
import type { GridLevelSpec } from '../spec';
import { placeL32, ch8Start } from '../ch8/place';
import { L32 as SC } from '../../sim/ch8/data';
import { ch8TryHint } from '../ch8/queries';

const SITES = SC.sectionaliserSites;
const sw = (id: string, k: string): Action => ({ name: 'placeSwitch', args: [id, k] });
const fuse = (id: string, on: boolean): Action => ({ name: 'setFuse', args: [id, on] });
const tie = (on: boolean): Action => ({ name: 'setTie', args: [on] });
const used = (s: { actionLog: { name: string }[] }, ...names: string[]): boolean => s.actionLog.some((a) => names.includes(a.name));
/** Every way to place at most `maxSectionalisers` sectionalisers on the trunk sites. */
const combos: { id: string; actions: Action[] }[] = [];
for (const pick of [0, 1, 2].flatMap((a) => [0, 1, 2].flatMap((b) => [0, 1, 2].map((c) => [a, b, c])))) {
  const kinds = ['none', 'manual', 'remote'], on = pick.filter((k) => k > 0).length;
  if (on > SC.maxSectionalisers) continue;
  combos.push({ id: on === 0 ? 'none' : pick.map((k, i) => (k ? `${SITES[i]}${kinds[k]![0]}` : '')).filter(Boolean).join('+'), actions: pick.flatMap((k, i) => (k ? [sw(SITES[i]!, kinds[k]!)] : [])) });
}
const allFuses: Action[] = SC.spurs.map((id) => fuse(id, true));

export const L32: GridLevelSpec = {
  id: 'L32', kind: 'event', chapter: 8, titleKey: 'level.L32.title', briefKey: 'level.L32.brief', concepts: ['saifi', 'saidi', 'caidi', 'sectionaliser', 'fuse', 'tie-switch'],
  startBlock: 80, horizonBlocks: null, maxTicks: 2,
  allowed: {
    actions: ['placeSwitch', 'setFuse', 'setTie'],
    parts: { placeSwitch: ['none', 'manual', 'remote'] },
  },
  sites: [
    { id: 'tie', options: [{ id: 'open', actions: [] }, { id: 'tie', actions: [tie(true)] }] },
    ...SC.spurs.map((p) => ({ id: p, options: [{ id: 'bare', actions: [] }, { id: 'fuse', actions: [fuse(p, true)] }] })),
    { id: 'sectionalisers', options: combos },
  ],
  thresholds: { saidiMax: SC.saidiMaxMin, saifiMax: SC.saifiMax, ensStar: SC.ensStarMWh },
  decisive: { key: 'saidiMin', limit: 'saidiMax', dir: 'max' },
  star3: [{ key: 'ensMWh', max: 'ensStar' }],
  brownoutLoses: false, blackoutLoses: false, stars: true, histogram: 'capex',
  story: { placeKey: 'level.L32.place', lineKeys: ['level.L32.story1', 'level.L32.story2'], lessonKey: 'level.L32.lesson', lessonKind: 'ch8' },
  tryText: (s) => ch8TryHint(s),
  naive: { actions: [], failKind: 'ch8.reliability' },
  lesson: [fuse('P1', true), fuse('P2', true), tie(true), sw('T2', 'remote'), sw('T3', 'remote')],
  reference: [...allFuses, tie(true), sw('T2', 'manual'), sw('T3', 'remote')],
  // frozen from the bot population (src/level/population.ts); ch8.test.ts regenerates it and fails on drift > 2 %
  frozen: { global: { budget: 180000, starA: 162500, starB: 161075 }, in: { budget: 15000000, starA: 13487500, starB: 13369225 } },
  coach: [
    { id: 'fuse', textKey: 'coach.L32.fuse', whyKey: 'coach.L32.fuse.why', done: (s) => used(s, 'setFuse') || s.tick > s.levelStart },
    { id: 'switch', textKey: 'coach.L32.switch', whyKey: 'coach.L32.switch.why', done: (s) => used(s, 'placeSwitch') || s.tick > s.levelStart },
    { id: 'tie', textKey: 'coach.L32.tie', whyKey: 'coach.L32.tie.why', done: (s) => used(s, 'setTie') || s.tick > s.levelStart },
    { id: 'run', textKey: 'coach.L32.run', whyKey: 'coach.L32.run.why', done: (s) => s.tick > s.levelStart || s.status !== 'playing' },
  ],
  place: (s, sc) => { ch8Start(s, sc, 'L32'); placeL32(s, sc); },
};
