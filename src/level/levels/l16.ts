// L16 Loop Flow (DESIGN 2.6, chapter 5, Grid): a six-bus 220 kV ring with a cheap short line (B1-B4) that the previous engineer added. Power divides by impedance, not by
// intention: the short line has about a seventh of the reactance of the way round, so at the evening peak it carries more than its 210 MVA. Three valid styles fix it:
// reconductor the chord (HTLS: twice the ampacity at the same X), open the ring line that feeds it, or commit the plant at B4 so it feeds the loads itself.
import type { Action } from '@core/kit';
import { l16Lesson, l16Try } from '../ch5lessons';
import type { GridLevelSpec } from '../spec';
import { place } from '../spec';
import { demandProfile } from '../../sim/weather';

export const RING_KM = 70, CHORD_KM = 30;
export const LOADS = [{ bus: 'B3', frac: 0.4 }, { bus: 'B4', frac: 0.35 }, { bus: 'B5', frac: 0.25 }] as const;
export const PEAK_MW = 370, PF = 0.95;
const HTLS: Action[] = [{ name: 'demolish', args: ['T7'] }, { name: 'stringLine', args: ['B1', 'B4', 'l220-zebra-htls', 1, CHORD_KM] }];
const NEW_KM = 80;
const newLine = (a: string, b: string): Action[] => [{ name: 'stringLine', args: [a, b, 'l220-zebra', 1, NEW_KM] }];
const open = (id: string): Action[] => [{ name: 'switchBranch', args: [id, false] }];
const COMMIT: Action[] = [{ name: 'commit', args: ['U2', true, 0] }];

export const L16: GridLevelSpec = {
  id: 'L16', kind: 'grid', chapter: 5, titleKey: 'level.L16.title', briefKey: 'level.L16.brief', concepts: ['loop-flow', 'impedance-division', 'n-1', 'reconductoring'],
  startBlock: 48, horizonBlocks: 96, maxTicks: 100,
  allowed: { actions: ['stringLine', 'demolish', 'switchBranch', 'commit'], parts: { stringLine: ['l220-zebra', 'l220-zebra-htls'] } },
  sites: [
    { id: 'chord', options: [{ id: 'keep', actions: [] }, { id: 'htls', actions: HTLS }] },
    { id: 'new-line', options: [{ id: 'none', actions: [] }, { id: 'B2-B5', actions: newLine('B2', 'B5') }, { id: 'B3-B6', actions: newLine('B3', 'B6') }, { id: 'B2-B6', actions: newLine('B2', 'B6') }] },
    { id: 'topology', options: [{ id: 'closed', actions: [] }, { id: 'open-T1', actions: open('T1') }, { id: 'open-T3', actions: open('T3') }, { id: 'open-T4', actions: open('T4') }, { id: 'open-T5', actions: open('T5') }] },
    { id: 'dispatch', options: [{ id: 'merit', actions: [] }, { id: 'commit-B4', actions: COMMIT }] },
  ],
  thresholds: { loadingMax: 1, n1Max: 1 },
  decisive: { key: 'peakLoading', limit: 'loadingMax', dir: 'max' },
  star3: [{ key: 'n1Max', max: 'n1Max' }],
  extraRules: (th) => ({ maxLoading: th.loadingMax!, loadingGraceBlocks: 2, n1: true }),
  lessonText: (s) => l16Lesson(s), tryText: (s) => l16Try(s),
  story: { placeKey: 'level.L16.place', lineKeys: ['level.L16.story1', 'level.L16.story2', 'level.L16.story3'], lessonKey: 'level.L16.lesson' },
  brownoutLoses: false, blackoutLoses: true, stars: true, histogram: 'capex',
  naive: { actions: newLine('B2', 'B5'), failKind: 'overload' },
  lesson: HTLS, reference: [...newLine('B3', 'B6'), ...COMMIT],
  frozen: { global: {budget: 140000000, starA: 109600000, starB: 109600000}, in: {budget: 990000000, starA: 800000000, starB: 800000000} },
  coach: [
    { id: 'read-loading', textKey: 'coach.L16.read', whyKey: 'coach.L16.read.why', done: (s) => s.tick > s.levelStart },
    { id: 'fix', textKey: 'coach.L16.fix', whyKey: 'coach.L16.fix.why', done: (s) => s.branches.some((b) => b.catalogId === 'l220-zebra-htls') || s.branches.some((b) => !b.inService) || s.units.some((u) => u.commit.schedule.some((x) => x === 1)) },
    { id: 'n1', textKey: 'coach.L16.n1', whyKey: 'coach.L16.n1.why', done: (s) => s.tick >= s.levelStart + 40 },
    { id: 'run-day', textKey: 'coach.L16.run', whyKey: 'coach.L16.run.why', done: (s) => s.status !== 'playing' },
  ],
  place: (s, sc) => {
    const A = (name: string, ...a: unknown[]): void => place(sc, s, name, ...a);
    // tiles are 10 km on this map, so a line a player strings takes its length from the distance between its buses: the ring sides come out near 70 km and the chord 32 km, as built
    s.map.tileM = 10000;
    const pos: [number, number][] = [[10, 2], [7, 8], [2, 3], [9, 5], [3, 9], [10, 9]];
    pos.forEach(([x, y]) => A('placeBus', x, y, 220, 'junction', 1.0));
    s.buses[0]!.kind = 'gen'; s.buses[3]!.kind = 'gen'; s.buses[0]!.vSet = 1.0; s.buses[3]!.vSet = 1.0;
    for (let i = 0; i < 6; i++) A('stringLine', `B${i + 1}`, `B${((i + 1) % 6) + 1}`, 'l220-zebra', 1, RING_KM);
    A('stringLine', 'B1', 'B4', 'l220-zebra', 1, CHORD_KM);
    A('placeUnit', 'coal-sc-660', 'B1', 600); A('placeUnit', 'diesel-1500', 'B4', 333); A('commit', 'U2', false, 0);   // the plant at B4 stands idle until the player commits it;
    const prof = demandProfile('residential'), top = Math.max(...prof), tan = Math.sqrt(1 - PF * PF) / PF;
    for (const l of LOADS) { A('placeLoad', l.bus, 'critical', PEAK_MW * l.frac, PF); const ld = s.loads[s.loads.length - 1]!; ld.zip = [0, 0, 1]; ld.shape = { p: prof.map((x) => x / top), q: prof.map((x) => (x / top) * tan) }; }
    const a = s.units[0]!; a.online = true; a.pMin = 0; a.P = 0; a.qMax = 1e4; a.qMin = -1e4;
  },
};
