// L17 Nose of the Curve (DESIGN 2.6, chapter 5, Event): a city (320 MW peak, pf 0.92) hangs off a stiff grid through a 40 km twin-Zebra feeder and a 150 km 220 kV double circuit
// (twin Zebra, 420 MVA a circuit, so thermal never binds). On a heatwave afternoon one circuit trips at 15:00 with the city at 300 MW. The single circuit is past its
// maximum loadability (the nose of the P-V curve) unless voltage support is built at the city bus: capacitors (Q falls with V squared, weakest exactly when needed),
// a STATCOM (constant current), or a local peaker. The oracle is tools/oracles/ch5_oracles.py (levels.L17), an independent 3-bus continuation.
import type { Action } from '@core/kit';
import { l17Lesson, l17Try } from '../ch5lessons';
import type { GridLevelSpec } from '../spec';
import { place } from '../spec';
import { BLOCKS_PER_DAY } from '../../types';

export const CITY = { peakMW: 320, tripMW: 300, pf: 0.92 } as const;
export const FEEDER_KM = 40, CIRCUIT_KM = 150, TRIP_BLOCK = 60;
export function cityShape(): { p: number[]; q: number[] } {
  const tan = Math.sqrt(1 - CITY.pf * CITY.pf) / CITY.pf, trip = CITY.tripMW / CITY.peakMW, p: number[] = [];
  for (let b = 0; b < BLOCKS_PER_DAY; b++) p.push(b >= TRIP_BLOCK ? trip : b >= 48 ? 0.78 + ((trip - 0.78) * (b - 48)) / (TRIP_BLOCK - 48) : 0.7);   // a heatwave afternoon: 78 % at noon, 94 % from 15:00, flat
  return { p, q: p.map((x) => x * tan) };
}
const caps = (n: number): Action[] => (n === 0 ? [] : [{ name: 'placeShunt', args: ['B3', 'cap-220-50', n] }, { name: 'setShuntSteps', args: ['C1', n] }]);
/** One 100 MVAr device (STATCOM or SVC) as the k-th bank placed at B3 (ids C1.. follow the order of placement). */
const device = (cat: string, k: number): Action[] => [{ name: 'placeShunt', args: ['B3', cat, 1] }, { name: 'setShuntSteps', args: [`C${k}`, 1] }];
const peaker: Action[] = [{ name: 'placeUnit', args: ['ocgt-105', 'B3', 100] }];
interface Combo { id: string; actions: Action[] }
const combos: Combo[] = [0, 1, 2].flatMap((c) => [false, true].flatMap((st) => [false, true].flatMap((sv) => [false, true].map((p): Combo => {
  let k = c > 0 ? 1 : 0;
  const acts = [...caps(c), ...(st ? device('statcom-100', ++k) : []), ...(sv ? device('svc-100', ++k) : []), ...(p ? peaker : [])];
  return { id: [c > 0 ? `caps${c * 50}` : '', st ? 'statcom100' : '', sv ? 'svc100' : '', p ? 'peaker' : ''].filter((x) => x).join('+') || 'none', actions: acts };
}))));

export const L17: GridLevelSpec = {
  id: 'L17', kind: 'event', chapter: 5, titleKey: 'level.L17.title', briefKey: 'level.L17.brief', concepts: ['pv-curve', 'voltage-collapse', 'statcom', 'loadability'],
  startBlock: 48, horizonBlocks: 36, maxTicks: 40,
  allowed: { actions: ['placeShunt', 'setShuntSteps', 'placeUnit'], parts: { placeShunt: ['cap-220-50', 'statcom-100', 'svc-100'], 'placeShunt.maxSteps': [2], placeUnit: ['ocgt-105'] } },
  sites: [{ id: 'support', options: combos }],
  thresholds: { marginFloorPct: 5, marginStar3Pct: 12 },
  decisive: { key: 'marginMinPct', limit: 'marginFloorPct', dir: 'min' },
  star3: [{ key: 'marginMinPct', min: 'marginStar3Pct' }],
  extraRules: () => ({ collapseLoses: true, marginFromBlock: TRIP_BLOCK }),
  lessonText: (s) => l17Lesson(s), tryText: (s) => l17Try(s),
  story: { placeKey: 'level.L17.place', lineKeys: ['level.L17.story1', 'level.L17.story2', 'level.L17.story3'], lessonKey: 'level.L17.lesson' },
  brownoutLoses: false, blackoutLoses: true, stars: true, histogram: 'capex',
  naive: { actions: caps(2), failKind: 'collapse' },
  lesson: [...caps(1), ...device('statcom-100', 2)], reference: [...caps(2), ...device('statcom-100', 2)],
  frozen: { global: {budget: 27000000, starA: 23788600, starB: 23788600}, in: {budget: 1200000000, starA: 1066000000, starB: 1066000000} },
  coach: [
    { id: 'read-pv', textKey: 'coach.L17.read', whyKey: 'coach.L17.read.why', done: (s) => s.tick > s.levelStart },
    { id: 'support', textKey: 'coach.L17.support', whyKey: 'coach.L17.support.why', done: (s) => s.shunts.length > 0 || s.units.length > 1 },
    { id: 'statcom', textKey: 'coach.L17.statcom', whyKey: 'coach.L17.statcom.why', done: (s) => s.shunts.some((h) => h.kind === 'statcom' || h.kind === 'svc') },
    { id: 'run', textKey: 'coach.L17.run', whyKey: 'coach.L17.run.why', done: (s) => s.status !== 'playing' },
  ],
  place: (s, sc) => {
    const A = (name: string, ...a: unknown[]): void => place(sc, s, name, ...a);
    A('placeBus', 2, 2, 220, 'gen', 1.0); A('placeBus', 6, 2, 220, 'junction'); A('placeBus', 26, 2, 220, 'load');
    A('placeUnit', 'ccgt-418', 'B1', 1500);
    A('stringLine', 'B1', 'B2', 'l220-twinzebra', 1, FEEDER_KM);
    A('stringLine', 'B2', 'B3', 'l220-twinzebra', 1, CIRCUIT_KM); A('stringLine', 'B2', 'B3', 'l220-twinzebra', 1, CIRCUIT_KM);
    A('placeLoad', 'B3', 'critical', CITY.peakMW, CITY.pf);
    const l = s.loads[0]!; l.shape = cityShape(); l.zip = [0, 0, 1];
    for (const u of s.units) { u.online = true; u.pMin = 0; u.P = 0; u.qMax = 1e4; u.qMin = -1e4; }
    s.events.queue.push({ id: 'trip-T3', day: 0, block: TRIP_BLOCK, kind: 'trip-branch', target: 'T3', magnitude: 0 });
  },
};
