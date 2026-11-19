// L33 Fuse Saving (DESIGN-1.1 B1, Event: distribution protection; chapter 8 job 3): a recloser heads feeder 3 and three spurs hang off it, each behind a K-type fuse link. About 80 % of overhead faults are
// temporary. The recloser's FAST curve must beat every spur fuse's minimum-melt curve over the spur's whole fault-current range (the temporary fault is gone before the fuse is touched), and its SLOW curve must
// lose to the fuse's total-clearing curve (a permanent fault is cleared by the spur's own fuse, not by a feeder lockout). Fuse links also have to carry the spur's load, melt at the spur's smallest fault, and
// the recloser pickup has to clear the feeder's load. Score: the sum of the fuses' total clearing times at the taps (a bigger link is slower: less damage and flicker with a smaller one). Lamp 3: every margin
// at least 0.2 s. Engine: src/sim/distrib/tcc.ts (IEEE C37.112 curves, K-link tables), oracle ch8_oracles.py.
import type { Action } from '@core/kit';
import type { GridLevelSpec } from '../spec';
import { placeL33, ch8Start } from '../ch8/place';
import { L33 as SC } from '../../sim/ch8/data';
import { ch8TryHint } from '../ch8/queries';

const rec = (pu: number, ft: number, st: number, shots = 2): Action[] => [{ name: 'setRecloser', args: [pu, ft, st, shots] }];
const link = (i: number, k: number): Action[] => [{ name: 'setFuseLink', args: [SC.spurs[i]!.id, k] }];
const links = (a: number, b: number, c: number): Action[] => [...link(0, a), ...link(1, b), ...link(2, c)];
const used = (s: { actionLog: { name: string }[] }, ...names: string[]): boolean => s.actionLog.some((a) => names.includes(a.name));
const SIZES = [25, 40, 65, 100];
const RECLOSERS = [200, 300].flatMap((p) => [0.05, 0.25].flatMap((f) => [3, 5].map((sl) => ({ id: `p${p}-f${f}-s${sl}`, actions: rec(p, f, sl) }))));

export const L33: GridLevelSpec = {
  id: 'L33', kind: 'event', chapter: 8, titleKey: 'level.L33.title', briefKey: 'level.L33.brief', concepts: ['fuse-saving', 'tcc', 'recloser', 'coordination', 'temporary-faults'],
  startBlock: 80, horizonBlocks: null, maxTicks: 2,
  allowed: {
    actions: ['setRecloser', 'setFuseLink'],
    parts: { setFuseLink: SC.fuseOptions.map(String) },
  },
  sites: [
    { id: 'recloser', options: RECLOSERS },
    ...SC.spurs.map((sp, i) => ({ id: sp.id, options: SIZES.map((k) => ({ id: `k${k}`, actions: link(i, k) })) })),
  ],
  thresholds: { marginMin: 0, marginStar: SC.marginStarS },
  decisive: { key: 'marginS', limit: 'marginMin', dir: 'min' },
  star3: [{ key: 'marginS', min: 'marginStar' }],
  brownoutLoses: false, blackoutLoses: false, stars: true, histogram: 'score', scoreUnit: 's',
  story: { placeKey: 'level.L33.place', lineKeys: ['level.L33.story1', 'level.L33.story2'], lessonKey: 'level.L33.lesson', lessonKind: 'ch8' },
  tryText: (s) => ch8TryHint(s),
  naive: { actions: [], failKind: 'ch8.miscoordination' },
  lesson: [...rec(200, 0.25, 3), ...links(65, 65, 65)],
  reference: [...rec(200, 0.05, 3), ...links(65, 65, 40)],
  // frozen from the bot population (src/level/population.ts); ch8.test.ts regenerates it and fails on drift > 2 %
  frozen: { global: { budget: 0, starA: 1.2529728514158036, starB: 1.2529728514158036 }, in: { budget: 0, starA: 1.2529728514158036, starB: 1.2529728514158036 } },
  coach: [
    { id: 'fuse', textKey: 'coach.L33.fuse', whyKey: 'coach.L33.fuse.why', done: (s) => used(s, 'setFuseLink') || s.tick > s.levelStart },
    { id: 'recloser', textKey: 'coach.L33.recloser', whyKey: 'coach.L33.recloser.why', done: (s) => used(s, 'setRecloser') || s.tick > s.levelStart },
    { id: 'run', textKey: 'coach.L33.run', whyKey: 'coach.L33.run.why', done: (s) => s.tick > s.levelStart || s.status !== 'playing' },
  ],
  place: (s, sc) => { ch8Start(s, sc, 'L33'); placeL33(s, sc); },
};
