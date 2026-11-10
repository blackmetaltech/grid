// L30 Bring the Island Home (DEPTH §4.5, §8b; chapter 2 finale, year 3, after L29): Saltmarsh Island, 4 km south of the harbour yard, joins the mainland by a submarine 11 kV cable.
// The island's evening load (the hamlets and the school, 45 kW at power factor 0.95) is served through the cable and an 11/0.42 kV transformer, with a battery behind the transformer.
// At 21:00 a trawler's anchor cuts the cable (cableCutBlock): from then to 23:00 the island runs on its battery alone. Power (inverter kW) and energy (cell kWh in the 10-90 % window,
// round trip 0.86) both have to cover the load, or the island goes dark. District persistence (DEPTH §8b): the L05 line and the L29 harbour line already stand.
import type { Action } from '@core/kit';
import type { GridLevelSpec } from '../spec';
import { place } from '../spec';
import { BLOCKS_PER_DAY } from '../../types';
import { L29 } from './l29';
import { t } from '../../i18n';

/** Saltmarsh's evening load: the hamlets and the school hall, 45 kW at pf 0.95. */
export const ISLAND = { peakMW: 0.045, pf: 0.95 } as const;
/** Evening shape as fractions of the peak per block: 18:00 0.7, 19:00 0.85, 20:00-21:45 1.0, 22:00 0.8, 23:00 0.6, the rest of the night 0.3. */
export function islandShape(): { p: number[]; q: number[] } {
  const tan = Math.sqrt(1 - ISLAND.pf * ISLAND.pf) / ISLAND.pf;
  const p: number[] = [], q: number[] = [];
  for (let b = 0; b < BLOCKS_PER_DAY; b++) {
    const h = b / 4;
    const f = h >= 18 && h < 19 ? 0.7 : h >= 19 && h < 20 ? 0.85 : h >= 20 && h < 22 ? 1.0 : h >= 22 && h < 23 ? 0.8 : h >= 23 && h < 24 ? 0.6 : 0.3;
    p.push(f); q.push(f * tan);
  }
  return { p, q };
}

/** The island's buses, tile coordinates: BEYOND the 100 x 44 map (4 km of open sea south of the harbour yard at (82, 41)); the world query marks them `offshore`. */
export const ISLAND_YARD_TILE: [number, number] = [82, 50];
export const ISLAND_LOAD_TILE: [number, number] = [83, 50];
/** The sea distance between the harbour yard and the island yard, km. */
export const SEA_KM = 4.0;
/** Block of the anchor cut (21:00) and the run's length: 18:00 + 19 blocks = the 22:45 block, the last one the battery has to carry (the run ends at 23:00). */
export const CUT_BLOCK = 84;
export const CABLES = ['sub-11-70', 'sub-11-120', 'sub-11-185'];
export const BATTERIES = ['isl-25kw-50kwh', 'isl-50kw-100kwh', 'isl-50kw-125kwh', 'isl-50kw-150kwh', 'isl-100kw-200kwh'];
export const XFMRS = ['dt-100', 'dt-160', 'dt-250'];

export const cable = (id: string): Action => ({ name: 'layCableRoute', args: ['B5', 'B7', id] });
export const islandXfmr = (id: string): Action => ({ name: 'placeTransformer', args: ['B7', 'B8', id] });
export const battery = (id: string): Action => ({ name: 'placeStorage', args: ['B8', id] });

/** Cable only plus the island transformer: the cheapest connected island; nothing keeps it lit after the cut. */
export const NAIVE: Action[] = [cable('sub-11-70'), islandXfmr('dt-100')];

export const L30: GridLevelSpec = {
  id: 'L30', kind: 'grid', chapter: 2, titleKey: 'level.L30.title', briefKey: 'level.L30.brief', concepts: ['cable-vs-overhead', 'charging-current', 'energy-vs-power', 'n-1'],
  startBlock: 72, horizonBlocks: 19, maxTicks: 23, cableCutBlock: CUT_BLOCK, seaCableKm: SEA_KM,
  allowed: {
    actions: ['layCableRoute', 'placeTransformer', 'placeStorage', 'demolish'],
    parts: { layCableRoute: CABLES, placeTransformer: XFMRS, placeStorage: BATTERIES },
  },
  sites: [
    { id: 'cable', options: CABLES.map((id) => ({ id, actions: [cable(id)] })) },
    { id: 'transformer', options: XFMRS.map((id) => ({ id, actions: [islandXfmr(id)] })) },
    { id: 'battery', options: [{ id: 'none', actions: [] }, ...BATTERIES.map((id) => ({ id, actions: [battery(id)] }))] },
  ],
  // the third star: at 23:00 at least a fifth of the battery's usable window is still unspent
  thresholds: { batteryMarginMin: 0.2 },
  decisive: null,
  star3: [{ key: 'batteryMargin', min: 'batteryMarginMin' }],
  brownoutLoses: true, blackoutLoses: true, stars: true, histogram: 'capex',
  story: { placeKey: 'level.L30.place', lineKeys: ['level.L30.story1', 'level.L30.story2', 'level.L30.story3'], lessonKey: 'level.L30.lesson', lessonKind: 'island' },
  naive: { actions: NAIVE, failKind: 'islandDark' },
  // lesson: the nameplate rule of thumb for the battery (2 h x 45 kW = 90 kWh, rounded up to a 125 kWh pack): it rides the cut out but leaves only a tenth of the window unspent
  // (two stars). The reference is the cheapest design that keeps a fifth of the window: the same cable and transformer, a 50 kW / 150 kWh pack. (A thicker cable or a bigger
  // transformer only adds cost: the island draws 2 A of charging current and 45 kW against a cable rated for hundreds of amps.)
  lesson: [cable('sub-11-70'), islandXfmr('dt-100'), battery('isl-50kw-125kwh')],
  reference: [cable('sub-11-70'), islandXfmr('dt-100'), battery('isl-50kw-150kwh')],
  // frozen from the bot population (54 designs per region; budget = 1.1 x the dearer of lesson and reference rounded up to 2 significant figures; A = median passing cost;
  // B = 15th percentile of the passing designs that keep >= 20 % of the window): level.test.ts regenerates them and fails on drift > 2 %
  frozen: { global: { budget: 710000, starA: 619750, starB: 551870 }, in: { budget: 6000000, starA: 5155000, starB: 4841000 } },
  coach: [
    { id: 'cable', textKey: 'coach.L30.cable', whyKey: 'coach.L30.cable.why', done: (s) => (s.cables?.length ?? 0) >= 1 },
    { id: 'transformer', textKey: 'coach.L30.xfmr', whyKey: 'coach.L30.xfmr.why', done: (s) => s.branches.filter((b) => b.kind === 'xfmr').length >= 5 },
    { id: 'battery', textKey: 'coach.L30.battery', whyKey: 'coach.L30.battery.why', done: (s) => s.storage.length >= 1 },
    { id: 'run', textKey: 'coach.L30.run', whyKey: 'coach.L30.run.why', done: (s) => s.status !== 'playing' },
  ],
  place: (s, sc) => {
    const A = (name: string, ...a: unknown[]): void => place(sc, s, name, ...a);
    L29.place(s, sc);                                  // Brightwater, the hydro set, the village and the harbour yard: the district as the L29 job left it
    for (const a of L29.reference) A(a.name, ...(a.args as unknown[]));   // the player's own harbour line and its transformer already stand (year 3)
    A('placeTransformer', 'B2', 'B1', 'dt-400');       // the hydro set's step-up gained a twin: the market (222 kVA), the harbour (176 kVA) and the island (47 kVA) together would load one 400 kVA unit to 1.1x at 20:00
    const lvKv = sc.cat.transformer('dt-250')!.kvLv;
    A('placeBus', ISLAND_YARD_TILE[0], ISLAND_YARD_TILE[1], 11, 'junction'); A('placeBus', ISLAND_LOAD_TILE[0], ISLAND_LOAD_TILE[1], lvKv, 'load');
    s.buses[6]!.name = t('place.L30.yard'); s.buses[7]!.name = t('place.L30.island');
    A('placeLoad', 'B8', 'residential', ISLAND.peakMW, ISLAND.pf);
    const l = s.loads[s.loads.length - 1]!;
    l.zip = [0, 0, 1]; l.shape = islandShape();
  },
};
