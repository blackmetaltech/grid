// L14 Per Unit, Please (DESIGN 2.6, chapter 5, Grid): the state ring's far corner. A 132 kV source feeds an 80 km Panther line, a 132/33 kV substation and three 33/11 kV
// substations, one per town. Keep every town bus inside 0.95-1.05 pu for a day that starts at 03:00 (so it crosses the 19:00 peak and ends back in the small hours).
// The sag between night and peak (about 11 % of nominal at the towns) is wider than the 10 % band, so no fixed tap can hold both ends: automatic tap changers can, and
// two of them in series hunt unless they are staggered. Numbers: the 3-bus oracle of tools/oracles/ch5_oracles.py (levels.L14), not this file.
import type { Action } from '@core/kit';
import type { GridLevelSpec } from '../spec';
import { place } from '../spec';
import { demandProfile } from '../../sim/weather';
import { l14Lesson, l14Try } from '../ch5lessons';

export const TOWNS = [{ id: 'B4', trafo: 'T3', peakMW: 7.4, pf: 0.8 }, { id: 'B5', trafo: 'T4', peakMW: 6.6, pf: 0.8 }, { id: 'B6', trafo: 'T5', peakMW: 7.4, pf: 0.8 }] as const;
export const SOURCE_V = 1.05;
export const LINE_KM = 115;
export const UPSTREAM = 'T2';
export const TOWN_TRAFOS: string[] = TOWNS.map((x) => x.trafo);
/** Voltage set-point, dead-band (pu) of every automatic tap changer in the options. A band of 0.0125 is one tap step (the minimum for a quiet changer); 0.005 is the hunting demonstration. */
export const SET_V_HI = 1.02;
export const SET_V = 1.0, DB_WIDE = 0.0125, DB_NARROW = 0.005;

/** A town's daily shape: the residential profile (evening peak 19:00-20:00, trough about 03:00 at 46 %), constant power factor. */
export function townShape(pf: number): { p: number[]; q: number[] } {
  const tan = Math.sqrt(1 - pf * pf) / pf, p = demandProfile('residential');
  return { p, q: p.map((x) => x * tan) };
}

const auto = (ids: string[], delay: number, db = DB_WIDE, v = SET_V): Action[] => ids.map((id) => ({ name: 'setTapAuto', args: [id, v, db, delay] }));
const fixed = (ids: string[], pos: number): Action[] => (pos === 0 ? [] : ids.map((id) => ({ name: 'setTap', args: [id, pos] })));
const cap = (steps: number): Action[] => (steps === 0 ? [] : [{ name: 'placeShunt', args: ['B3', 'cap-33-5', steps] }, { name: 'setShuntSteps', args: ['C1', steps] }]);

export const L14: GridLevelSpec = {
  id: 'L14', kind: 'grid', chapter: 5, titleKey: 'level.L14.title', briefKey: 'level.L14.brief', concepts: ['per-unit', 'oltc', 'voltage-control', 'tap-hunting'],
  startBlock: 12, horizonBlocks: 96, maxTicks: 100,
  allowed: { actions: ['setTap', 'setTapAuto', 'placeShunt', 'setShuntSteps', 'setShuntAuto'], parts: { placeShunt: ['cap-33-5'] } },
  sites: [
    { id: 'substation', options: [
      { id: 'fix0', actions: [] }, { id: 'fix+3', actions: fixed([UPSTREAM], 3) },
      { id: 'auto-d1', actions: auto([UPSTREAM], 1) }, { id: 'auto-d2', actions: auto([UPSTREAM], 2) }, { id: 'auto-d3', actions: auto([UPSTREAM], 3) },
    ] },
    { id: 'towns', options: [
      { id: 'fix0', actions: [] },
      { id: 'auto-d1', actions: auto(TOWN_TRAFOS, 1) }, { id: 'auto-d2', actions: auto(TOWN_TRAFOS, 2) }, { id: 'auto-d3', actions: auto(TOWN_TRAFOS, 3) },
      { id: 'auto-d4', actions: auto(TOWN_TRAFOS, 4) }, { id: 'auto-d6', actions: auto(TOWN_TRAFOS, 6) }, { id: 'auto-d1-narrow', actions: auto(TOWN_TRAFOS, 1, DB_NARROW) },
    ] },
    { id: 'capacitor', options: [{ id: 'none', actions: [] }, { id: 'cap-1', actions: cap(1) }, { id: 'cap-2', actions: cap(2) }] },
  ],
  thresholds: { vLo: 0.95, vHi: 1.05, lossMaxPct: 3, tapOpsMax: 30 },
  decisive: { key: 'vMinPu', limit: 'vLo', dir: 'min' },
  star3: [{ key: 'lossPct', max: 'lossMaxPct' }, { key: 'tapOps', max: 'tapOpsMax' }],
  extraRules: (th) => ({ vWatch: { lo: th.vLo!, hi: th.vHi!, kv: [11], graceBlocks: 6 } }),
  lessonText: (s) => l14Lesson(s), tryText: (s) => l14Try(s),
  story: { placeKey: 'level.L14.place', lineKeys: ['level.L14.story1', 'level.L14.story2', 'level.L14.story3'], lessonKey: 'level.L14.lesson' },
  brownoutLoses: false, blackoutLoses: true, stars: true, histogram: 'capex',
  // a boost preset for the evening (tap +3 on the 132/33 kV changer): the right fix for 19:00 and nothing else, so the 11 kV towns sag below the band as the afternoon load climbs
  naive: { actions: fixed([UPSTREAM], 3), failKind: 'brownout' },
  lesson: [...auto([UPSTREAM], 1), ...auto(TOWN_TRAFOS, 3)],
  reference: [...cap(1), ...auto([UPSTREAM], 1), ...auto(TOWN_TRAFOS, 4)],
  frozen: { global: {budget: 180000, starA: 161990, starB: 161990}, in: {budget: 8800000, starA: 7950000, starB: 7950000} },
  coach: [
    { id: 'read-pu', textKey: 'coach.L14.pu', whyKey: 'coach.L14.pu.why', done: (s) => s.tick > s.levelStart },
    { id: 'tap-direction', textKey: 'coach.L14.tap', whyKey: 'coach.L14.tap.why', done: (s) => s.branches.some((b) => b.tap && (b.tap.pos !== 0 || b.tap.auto !== null)) },
    { id: 'auto', textKey: 'coach.L14.auto', whyKey: 'coach.L14.auto.why', done: (s) => s.branches.filter((b) => b.tap?.auto).length >= 2 },
    { id: 'run-day', textKey: 'coach.L14.run', whyKey: 'coach.L14.run.why', done: (s) => s.status !== 'playing' },
  ],
  place: (s, sc) => {
    const A = (name: string, ...a: unknown[]): void => place(sc, s, name, ...a);
    A('placeBus', 2, 2, 132, 'gen', SOURCE_V); A('placeBus', 8, 2, 132, 'junction'); A('placeBus', 10, 2, 33, 'junction');
    A('placeBus', 14, 0, 11, 'load'); A('placeBus', 14, 2, 11, 'load'); A('placeBus', 14, 4, 11, 'load');
    A('placeUnit', 'ccgt-418', 'B1', 60);
    A('stringLine', 'B1', 'B2', 'l132-panther', 1, LINE_KM);
    A('placeTransformer', 'B2', 'B3', 'pt-132-33-50');
    for (const tw of TOWNS) {
      A('placeTransformer', 'B3', tw.id, 'pt-33-11-10'); A('placeLoad', tw.id, 'residential', tw.peakMW, tw.pf);
      const l = s.loads[s.loads.length - 1]!; l.shape = townShape(tw.pf); l.zip = [0, 0, 1];   // constant P and Q: the textbook load, and no region's weather in the numbers
    }
    // the unit stands in for the 132 kV grid (an infinite source): no minimum-stable floor, and a Q range that never limits the set-point
    for (const u of s.units) { u.online = true; u.pMin = 0; u.P = 0; u.qMax = 1e4; u.qMin = -1e4; }
    const names = ['Grid', 'Ring North', 'Hillside 33', 'Ashgrove', 'Millbrook', 'Eastfield'];   // lint-ok (place names are locale-free proper nouns, replaced by the pack's names in the UI)
    s.buses.forEach((b, i) => { b.name = names[i] ?? b.id; });
  },
};
