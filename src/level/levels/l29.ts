// L29 Salt Wind (DEPTH §4.4, §8b; chapter 2, year 2, after L05): the harbour (fish market + ice plant, 150 kW at power factor 0.85, flat all night) sits on the Mainland's south coast.
// The player extends 11 kV from Brightwater's yard (B3) to a harbour yard on the beach, picks the support and insulator for each stretch, and steps down to 0.42 kV at the harbour.
// Tiles within one tile of the sea are pollution class IV (31 mm/kV of Um = 12 kV: 372 mm needed); a plain pin insulator offers 320 mm, so in the 04:00 sea fog every pin on the
// beach flashes over (fogBlock) and the ice plant goes dark. Anti-fog discs or a two-disc string on the coastal stretch pass, but the string drops the conductor and eats clearance
// (the evening 19:30 clearance flashover of L05 still applies: flashoverBlock). District persistence (DEPTH §8b): the L05 reference line and its transformers already stand.
import type { Action } from '@core/kit';
import type { GridLevelSpec } from '../spec';
import { place } from '../spec';
import { BLOCKS_PER_DAY } from '../../types';
import { L05, xfmrPair as l05Xfmr } from './l05';
import { requiredCreepageMm } from '../../sim/route/insulation';
import { t } from '../../i18n';

export const HARBOUR = { peakMW: 0.15, pf: 0.85 } as const;
/** Fish market + ice plant: flat all night (the ice plant never stops). */
export function harbourShape(): { p: number[]; q: number[] } {
  const tan = Math.sqrt(1 - HARBOUR.pf * HARBOUR.pf) / HARBOUR.pf;
  return { p: new Array<number>(BLOCKS_PER_DAY).fill(1), q: new Array<number>(BLOCKS_PER_DAY).fill(tan) };
}

const M = 50;   // tile edge, m
const tiles = (pts: [number, number][]): [number, number][] => pts.map(([x, y]) => [(x + 0.5) * M, (y + 0.5) * M]);
/** Harbour yard (11 kV) and load bus (0.42 kV) on the beach, tile coordinates. The yard is on the class IV row (one tile from the sea). */
export const YARD_TILE: [number, number] = [82, 41];
export const LOAD_TILE: [number, number] = [83, 41];
/** Ways from Brightwater's yard B3 to the harbour yard B5 around the harbour town (a straight line crosses it and is refused). Waypoints in tiles. */
export const CORRIDORS: { id: string; via: [number, number][] }[] = [
  { id: 'east', via: tiles([[88, 30], [88, 41]]) },
  { id: 'west', via: tiles([[76, 30], [76, 41]]) },
];
/** The bot population's families: wood-9 is allowed to the player (as in L05) but left out of the bots' space, because its clearance verdict differs between the packs (the `in` pack's 4.6 m rule
 *  lets wood poles through, `global` does not) and the shared reference build must be the cheapest three-star design in both. */
export const FAMILIES: { id: string; maxSpan: number }[] = [{ id: 'pcc-11', maxSpan: 100 }, { id: 'tubular-13', maxSpan: 130 }];
export const SPANS = [60, 70, 90];
export const CONDUCTORS = ['weasel', 'rabbit'];
export const INSULATOR_PAIRS: [string, string][] = ['pin', 'disc2', 'fog1'].flatMap((a) => ['pin', 'disc2', 'fog1'].map((b) => [a, b] as [string, string]));
export const XFMRS = ['dt-160', 'dt-250', 'dt-400'];
/** Class IV need for 11 kV (mm): Um 12 kV x 31 mm/kV = 372. Every support within 6 tiles of the sea must offer at least this for the third star. */
export const COAST_NEED_MM = requiredCreepageMm(11, 4);

/** The harbour line: B3 -> B5 (11 kV), with the insulators of the inland stretch and of the coastal stretch (pollution class >= III). */
export const route = (corridor: string, family: string, span: number, cond: string, ins: string, coast: string): Action => ({
  name: 'buildRoute', args: ['B3', 'B5', cond, family, null, span, CORRIDORS.find((c) => c.id === corridor)!.via, ins, coast],
});
export const harbourXfmr = (id: string): Action => ({ name: 'placeTransformer', args: ['B5', 'B6', id] });
export const routeId = (corridor: string, family: string, span: number, cond: string, ins: string, coast: string): string => `${corridor}/${family}/${span}/${cond}/${ins}/${coast}`;

export function allRoutes(): { id: string; action: Action }[] {
  const out: { id: string; action: Action }[] = [];
  for (const c of CORRIDORS) for (const f of FAMILIES) for (const sp of SPANS) if (sp <= f.maxSpan) for (const k of CONDUCTORS) for (const [i, cs] of INSULATOR_PAIRS) out.push({ id: routeId(c.id, f.id, sp, k, i, cs), action: route(c.id, f.id, sp, k, i, cs) });
  return out;
}

/** The bot population's route site: every route of the design space (the insulator pair is part of the space, so nothing is sampled) plus the lesson, reference and naive routes, which are in it. */
const routeOptions = (): { id: string; actions: Action[] }[] => allRoutes().map((r) => ({ id: r.id, actions: [r.action] }));

export const NAIVE: Action[] = [route('east', 'pcc-11', 90, 'rabbit', 'pin', 'pin'), harbourXfmr('dt-250')];

export const L29: GridLevelSpec = {
  id: 'L29', kind: 'grid', chapter: 2, titleKey: 'level.L29.title', briefKey: 'level.L29.brief', concepts: ['insulation', 'creepage', 'pollution', 'clearance'],
  // 18:00 to 07:00: the fog at 04:00 must come before 80 % of the run (level.test's naive rule), and the night outlasts it by three hours
  startBlock: 72, horizonBlocks: 52, maxTicks: 56, flashoverBlock: 78, fogBlock: 16,
  allowed: {
    actions: ['buildRoute', 'placeTransformer', 'demolish'],
    parts: {
      buildRoute: ['weasel', 'rabbit', 'dog'], 'buildRoute.family': ['wood-9', 'pcc-11', 'tubular-13', 'crossing-h'], 'buildRoute.crossing': ['wood-9', 'pcc-11', 'tubular-13', 'crossing-h'],
      'buildRoute.insulator': ['pin', 'disc2', 'fog1'], 'buildRoute.coastInsulator': ['pin', 'disc2', 'fog1'],
      placeTransformer: ['dt-100', 'dt-160', 'dt-250', 'dt-400'],
    },
  },
  sites: [
    { id: 'route', options: routeOptions() },
    { id: 'transformer', options: XFMRS.map((id) => ({ id, actions: [harbourXfmr(id)] })) },
  ],
  thresholds: { villageBandLoPu: { symbol: 'busBandLoPu', kv: 0.42 }, loadingMax: 1, coastNeedMm: COAST_NEED_MM },
  decisive: { key: 'loadVMinPu', limit: 'villageBandLoPu', dir: 'min' },
  star3: [{ key: 'coastMinCreepageMm', min: 'coastNeedMm' }],
  brownoutLoses: true, blackoutLoses: true, stars: true, histogram: 'capex',
  story: { placeKey: 'level.L29.place', lineKeys: ['level.L29.story1', 'level.L29.story2', 'level.L29.story3'], lessonKey: 'level.L29.lesson', lessonKind: 'salt' },
  naive: { actions: NAIVE, failKind: 'saltFlashover' },
  // lesson: pins inland, one anti-fog disc on the coastal stretch (class III and IV tiles): passes the fog (two stars). The reference is the cheapest design of the population that
  // also keeps every support within six tiles of the sea at class IV creepage (372 mm): the coast insulator alone is not enough, because the class II stretch before the beach
  // counts too, so the inland insulator must be a string as well (three stars). Weasel with two-disc strings on concrete poles at 90 m spans, 0.43 m of clearance to spare.
  lesson: [route('east', 'pcc-11', 90, 'rabbit', 'pin', 'fog1'), harbourXfmr('dt-400')],   // 400 kVA: the `in` pack's LV band needs the stiffer transformer for the 2 % voltage margin
  reference: [route('east', 'pcc-11', 90, 'weasel', 'disc2', 'disc2'), harbourXfmr('dt-250')],
  // frozen from the bot population (648 designs per region; budget = 1.1 x the dearer of lesson and reference, rounded up to 2 significant figures; A = median passing cost;
  // B = 15th percentile of the passing designs with every coastal support at class IV creepage); level.test.ts regenerates them and fails on drift > 2 %
  frozen: { global: { budget: 55000, starA: 49555.25, starB: 46447.05 }, in: { budget: 1300000, starA: 1051022.02, starB: 899776.43 } },
  coach: [
    { id: 'survey', textKey: 'coach.L29.survey', whyKey: 'coach.L29.survey.why', done: (s) => s.routes.length >= 2 },
    // shown only once a line stands whose coastal supports fall short of the creepage their tile needs
    { id: 'insulators', textKey: 'coach.L29.insulators', whyKey: 'coach.L29.insulators.why', done: (s) => !s.routes.some((r) => (r.saltShort?.length ?? 0) > 0) },
    { id: 'transformers', textKey: 'coach.L29.xfmr', whyKey: 'coach.L29.xfmr.why', done: (s) => s.branches.filter((b) => b.kind === 'xfmr').length >= 3 },
    { id: 'run', textKey: 'coach.L29.run', whyKey: 'coach.L29.run.why', done: (s) => s.status !== 'playing' },
  ],
  place: (s, sc) => {
    const A = (name: string, ...a: unknown[]): void => place(sc, s, name, ...a);
    L05.place(s, sc);                                  // Brightwater, the hydro set and the village yard: the district as the L05 job left it
    // the player's own line already stands (year 2): the L05 reference route, as the same action; its two transformers are the 400 kVA size, because the 250 kVA
    // pair the L05 job needed would be loaded to 1.5x by the market (222 kVA) and the harbour (176 kVA) together at 19:00
    A('buildRoute', ...(L05.reference[0]!.args as unknown[]));
    for (const a of l05Xfmr('dt-400')) A(a.name, ...(a.args as unknown[]));
    s.units[0]!.pMax = 0.5;                            // the hydro set gained a second runner: 0.5 MW for the market (0.2) and the harbour (0.15)
    const lvKv = sc.cat.transformer('dt-250')!.kvLv;
    A('placeBus', YARD_TILE[0], YARD_TILE[1], 11, 'junction'); A('placeBus', LOAD_TILE[0], LOAD_TILE[1], lvKv, 'load');
    s.buses[4]!.name = t('place.L29.yard'); s.buses[5]!.name = t('place.L29.harbour');
    A('placeLoad', 'B6', 'commercial', HARBOUR.peakMW, HARBOUR.pf);
    const h = s.loads[s.loads.length - 1]!;
    h.zip = [0, 0, 1]; h.shape = harbourShape();
  },
};
