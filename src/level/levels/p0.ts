// P0 The Night the Lights Went Out (DESIGN 2.6 prologue): a scripted cold open on a small version of the province grid (the finale grid
// L28 arrives in M3). The ONLY legal action is closing Line 7 (T5), which was open for maintenance. Closing it ties two generation
// pockets together across a long, weak corridor: the flow re-routes onto the already-loaded line T4, its overload timer runs out, and the
// real cascade (DESIGN 3.9) takes the rest. No stars, no money: the scene ends in the blackout.
import type { GridLevelSpec } from '../spec';
import { place } from '../spec';
import type { GridState } from '../../types';

const closed = (s: Readonly<GridState>): boolean => s.actionLog.some((a) => a.name === 'switchBranch');

export const P0: GridLevelSpec = {
  id: 'P0', kind: 'prologue', chapter: 0, titleKey: 'level.P0.title', briefKey: 'level.P0.brief', concepts: ['cascading-failure'],
  startBlock: 8, horizonBlocks: null, maxTicks: 24,
  allowed: { actions: ['switchBranch'], parts: { switchBranch: ['T5'] } },
  sites: [{ id: 'line7', options: [{ id: 'leave-open', actions: [] }, { id: 'close-line-7', actions: [{ name: 'switchBranch', args: ['T5', true] }] }] }],
  thresholds: {}, decisive: null, star3: [],
  brownoutLoses: false, blackoutLoses: false, stars: false, histogram: null,
  naive: { actions: [], failKind: 'timeout' },
  lesson: [{ name: 'switchBranch', args: ['T5', true] }],
  reference: [{ name: 'switchBranch', args: ['T5', true] }],
  frozen: null,
  coach: [
    { id: 'close-breaker', textKey: 'coach.P0.close', whyKey: 'coach.P0.close.why', done: closed },
    { id: 'watch', textKey: 'coach.P0.watch', whyKey: 'coach.P0.watch.why', done: (s) => s.block.blackout },
  ],
  goal: (s) => closed(s) && s.block.blackout,
  place: (s, sc) => {
    const A = (name: string, ...a: unknown[]): void => place(sc, s, name, ...a);
    // G1 (west coal) - A - C (city) - B - G2 (east gas); Line 7 = A-B tie, open
    A('placeBus', 2, 2, 132, 'gen', 1.02); A('placeBus', 12, 2, 132, 'sub'); A('placeBus', 2, 12, 132, 'gen', 1.02); A('placeBus', 12, 12, 132, 'sub'); A('placeBus', 22, 7, 132, 'load');
    A('stringLine', 'B1', 'B2', 'l132-panther', 2, 20);
    A('stringLine', 'B2', 'B5', 'l132-panther', 2, 160);
    A('stringLine', 'B3', 'B4', 'l132-panther', 2, 20);
    A('stringLine', 'B4', 'B5', 'l132-panther', 1, 20);
    A('stringLine', 'B2', 'B4', 'l132-panther', 1, 5);
    A('placeUnit', 'coal-sub-500', 'B1', 100); A('placeUnit', 'ccgt-418', 'B3', 100);
    A('placeLoad', 'B5', 'industrial', 140, 0.9);
    for (const u of s.units) { u.online = true; u.P = u.pMin; }
    s.branches.find((b) => b.id === 'T5')!.inService = false;
  },
};
