// L05 The River Line (DEPTH §8, chapter 2, kind 'grid'): bring a 0.3 MW hydro set's power to Brightwater market (200 kW, pf 0.90 lagging) across a river and a
// ridge on the Mainland map. The player surveys an overhead line (buildRoute), chooses support family, crossing family, span and conductor, and steps
// 0.42 kV up to 11 kV and back down with distribution transformers (or runs 0.42 kV the whole way and watches the voltage and the amps collapse).
// A span below its clearance rule at the 75 C design temperature flashes over at the 19:30 peak and trips the line (flashoverBlock).
import type { Action } from '@core/kit';
import type { GridLevelSpec } from '../spec';
import { place } from '../spec';
import { BLOCKS_PER_DAY } from '../../types';

/** Brightwater's daily shape as fractions of the 200 kW peak, per block: 16:00 0.5, 17:00 0.6, 18:00 0.8, 19:00-21:45 1.0, 22:00 0.6, 23:00 0.4 (0 before 16:00). */
export const MARKET = { peakMW: 0.2, pf: 0.9 } as const;
export function marketShape(): { p: number[]; q: number[] } {
  const tan = Math.sqrt(1 - MARKET.pf * MARKET.pf) / MARKET.pf;
  const p: number[] = [], q: number[] = [];
  for (let b = 0; b < BLOCKS_PER_DAY; b++) {
    const h = b / 4;
    const f = h < 16 ? 0 : h < 17 ? 0.5 : h < 18 ? 0.6 : h < 19 ? 0.8 : h < 22 ? 1.0 : h < 23 ? 0.6 : 0.4;
    p.push(f); q.push(f * tan);
  }
  return { p, q };
}

const M = 50;   // tile edge, m
const tiles = (pts: [number, number][]): [number, number][] => pts.map(([x, y]) => [(x + 0.5) * M, (y + 0.5) * M]);
/** The four corridors between the hydro yard B2 and the village yard B3 (waypoints in tiles, converted to metres). */
export const CORRIDORS: { id: string; via: [number, number][] }[] = [
  { id: 'straight', via: [] },
  { id: 'gorge', via: tiles([[30, 8], [42, 8], [62, 14]]) },
  { id: 'saddle', via: tiles([[62, 18], [78, 20]]) },
  { id: 'estuary', via: tiles([[25, 30], [55, 30]]) },
];
export const FAMILIES: { id: string; maxSpan: number }[] = [{ id: 'wood-9', maxSpan: 70 }, { id: 'pcc-11', maxSpan: 100 }, { id: 'tubular-13', maxSpan: 130 }];
export const CROSSINGS: (string | null)[] = [null, 'crossing-h', 'tubular-13'];
export const SPANS = [60, 70, 90, 100, 120];
export const CONDUCTORS = ['weasel', 'rabbit', 'dog'];

export const route = (corridor: string, family: string, crossing: string | null, span: number, cond: string): Action => ({
  name: 'buildRoute', args: ['B2', 'B3', cond, family, crossing, span, CORRIDORS.find((c) => c.id === corridor)!.via],
});
export const xfmrPair = (id: string): Action[] => [{ name: 'placeTransformer', args: ['B2', 'B1', id] }, { name: 'placeTransformer', args: ['B3', 'B4', id] }];
export const routeId = (corridor: string, family: string, crossing: string | null, span: number, cond: string): string => `${corridor}/${family}/${crossing ?? 'none'}/${span}/${cond}`;

/** Every 11 kV route of the design space (spans within the family's mechanical maximum). */
export function allRoutes(): { id: string; action: Action }[] {
  const out: { id: string; action: Action }[] = [];
  for (const c of CORRIDORS) for (const f of FAMILIES) for (const x of CROSSINGS) for (const sp of SPANS) if (sp <= f.maxSpan) for (const k of CONDUCTORS) out.push({ id: routeId(c.id, f.id, x, sp, k), action: route(c.id, f.id, x, sp, k) });
  return out;
}

/** The bot population's route site: a fixed-stride sample of `allRoutes()` (every STRIDE-th route; the lesson, reference and flashover-gate routes are always in it) plus the naive 0.42 kV run. */
export const STRIDE = 3;
const LESSON_ROUTE = routeId('gorge', 'tubular-13', 'tubular-13', 90, 'rabbit');
const REFERENCE_ROUTE = routeId('saddle', 'pcc-11', 'crossing-h', 100, 'weasel');
const FORCED = new Set<string>([LESSON_ROUTE, REFERENCE_ROUTE, routeId('saddle', 'wood-9', 'crossing-h', 70, 'rabbit')]);   // the last is the sag lesson gate's flashover design
export const NAIVE: Action = { name: 'buildRoute', args: ['B1', 'B4', 'dog', 'tubular-13', 'crossing-h', 120, []] };

const routeOptions = (): { id: string; actions: Action[] }[] => {
  const keep = allRoutes().filter((r, i) => i % STRIDE === 0 || FORCED.has(r.id));
  return [...keep.map((r) => ({ id: r.id, actions: [r.action] })), { id: 'lv-straight', actions: [NAIVE] }];
};

const SITE_ROUTE = routeOptions();

export const L05: GridLevelSpec = {
  id: 'L05', kind: 'grid', chapter: 2, titleKey: 'level.L05.title', briefKey: 'level.L05.brief', concepts: ['sag-clearance', 'supports', 'step-up-transmission', 'transformers'],
  startBlock: 64, horizonBlocks: 32, maxTicks: 36, flashoverBlock: 78,
  allowed: {
    actions: ['buildRoute', 'placeTransformer', 'demolish'],
    parts: {
      buildRoute: ['weasel', 'rabbit', 'dog'], 'buildRoute.family': ['wood-9', 'pcc-11', 'tubular-13', 'crossing-h'], 'buildRoute.crossing': ['wood-9', 'pcc-11', 'tubular-13', 'crossing-h'],
      placeTransformer: ['dt-100', 'dt-160', 'dt-250', 'dt-400'],
    },
  },
  sites: [
    { id: 'route', options: SITE_ROUTE },
    { id: 'transformers', options: [{ id: 'none', actions: [] }, { id: 'dt-160', actions: xfmrPair('dt-160') }, { id: 'dt-250', actions: xfmrPair('dt-250') }, { id: 'dt-400', actions: xfmrPair('dt-400') }] },
  ],
  thresholds: { villageBandLoPu: { symbol: 'busBandLoPu', kv: 0.42 }, loadingMax: 1, marginStar3M: 0.5 },
  // decisive: the lowest village voltage (pu) against the pack's LV band floor. peakLoading cannot decide here: the naive 0.42 kV run browns out in the first block, while its
  // flows have collapsed to a loading well under 1.
  decisive: { key: 'loadVMinPu', limit: 'villageBandLoPu', dir: 'min' },
  star3: [{ key: 'worstMarginM', min: 'marginStar3M' }],
  brownoutLoses: true, blackoutLoses: true, stars: true, histogram: 'capex',
  story: { placeKey: 'level.L05.place', lineKeys: ['level.L05.story1', 'level.L05.story2'], lessonKey: 'level.L05.lesson' },
  naive: { actions: [NAIVE], failKind: 'brownout' },
  // lesson: the narrow rocky gorge on tall steel poles, one 105 m span bank to bank, 90 m spans elsewhere (two stars). The reference is the cheapest design the population
  // finds that keeps >= 0.5 m of clearance: over the low saddle with H-frame crossing structures, 100 m spans, Weasel (the gorge's rock banks refuse wood and concrete).
  lesson: [route('gorge', 'tubular-13', 'tubular-13', 90, 'rabbit'), ...xfmrPair('dt-250')],
  reference: [route('saddle', 'pcc-11', 'crossing-h', 100, 'weasel'), ...xfmrPair('dt-250')],
  // frozen from the bot population (src/level/population.ts: budget = 1.1 x the dearer of lesson and reference, rounded up; A = median passing cost; B = 15th percentile of the passing
  // designs with >= 0.5 m margin); level.test.ts regenerates them and fails on drift > 2 %
  frozen: { global: { budget: 340000, starA: 284650, starB: 197050 }, in: { budget: 3900000, starA: 3294320, starB: 2727040 } },
  coach: [
    { id: 'survey', textKey: 'coach.L05.survey', whyKey: 'coach.L05.survey.why', done: (s) => s.routes.length > 0 },
    // shown only once a line has been surveyed that ends at a 0.42 kV bus and no transformer stands yet
    { id: 'voltage', textKey: 'coach.L05.voltage', whyKey: 'coach.L05.voltage.why', done: (s) => !s.routes.some((r) => r.request.kv < 1) || s.branches.some((b) => b.kind === 'xfmr') },
    { id: 'run', textKey: 'coach.L05.run', whyKey: 'coach.L05.run.why', done: (s) => s.status !== 'playing' },
  ],
  place: (s, sc) => {
    const A = (name: string, ...a: unknown[]): void => place(sc, s, name, ...a);
    const lvKv = sc.cat.transformer('dt-250')!.kvLv;   // the low-voltage side of the distribution transformers of this region's pack
    s.terrain = 'mainland';
    s.map.tileM = M; s.map.w = 100; s.map.h = 44;
    A('placeBus', 5, 12, lvKv, 'gen', 1.03); A('placeBus', 7, 12, 11, 'junction'); A('placeBus', 83, 14, 11, 'junction'); A('placeBus', 84, 15, lvKv, 'load');
    A('placeUnit', 'microhydro-250k', 'B1', 0.3);
    A('placeLoad', 'B4', 'commercial', MARKET.peakMW, MARKET.pf);
    for (const l of s.loads) l.zip = [0, 0, 1];
    s.loads[0]!.shape = marketShape();
    // the hydro set stands in for the source (as in L07): no minimum-stable floor, or the night load of the dispatch sees a surplus
    for (const u of s.units) { u.online = true; u.pMin = 0; u.P = 0; }
  },
};
