// The GRID game definition the core engine runs. One core `tick` = one 15-minute operator block (DESIGN §3.1, §8.3).
// Everything the Godot front-end shows comes from queries; every player command is an action returning {ok, message} with a
// teaching message. M0 ships an empty-but-real game: an empty grid, the clock system, a placeholder level.
import { baseState, log, type GameDef } from '@core/kit';
import { formatMoney, type RegionPack } from '@core/regions';
import { BLOCKS_PER_DAY, MODES, SPEEDS, type GridState } from './types';
import { LEVELS } from './levels';
import { LEVEL_SPECS, specOf } from './level';
import { allowedGate } from './level/spec';
import { buildBenchActions } from './level/bench';
import { buildLevelQueries } from './level/queries';
import { PERSONAS } from './personas';
import { t } from './i18n';
import { REGIONS } from './regions';
import type { GridRegionData } from './regions/data';
import { buildPipeline, emptyBlock } from './sim/tick';
import { findNonFinite } from './sim/finite';
import type { SimParams } from './sim/params';
import { buildCostQueries } from './cost-query';
import { buildCh2Actions, ch2Queries } from './level/ch2/bench';
import { buildCh4Actions } from './level/ch4/actions';
import { buildCh4Queries } from './level/ch4/queries';
import { buildCh7Actions } from './level/ch7/actions';
import { buildCh7Queries } from './level/ch7/queries';
import { catalogueViewOf, simParamsOf, benchParamsOf, routeParamsOf } from './catalogue';
import { buildRouteActions, buildRouteQueries, type RouteParams } from './route-actions';
import type { BenchParams } from './level/bench';
import { buildActions } from './actions';
import { buildCh5Actions } from './ch5-actions';
import type { CatalogueView } from './sim/build';
import { buildCh3Actions } from './ch3-actions';
import { buildCh3Queries } from './ch3-queries';
import { buildFreqActions } from './freq-actions';
import { buildQueries } from './queries';
import { buildUiQueries } from './ui-queries';
import { buildWorldQueries } from './world-query';
import { NO_RULES } from './rules';

export const GAME_ID = 'grid';

/** History ring capacity: one entry per block for 7 days (sandbox run). */
const HISTORY_CAPACITY = BLOCKS_PER_DAY * 7;

/** A regional string the game needs; a pack that lacks one is a bug in the pack. */
function regionString(p: RegionPack<GridRegionData>, key: string): string {
  const v = p.strings[key]; if (v === undefined) throw new Error(`Region '${p.id}' has no string '${key}'.`);
  return v;
}

/** Simulation parameters of the pack a state runs in, mapped once per region (src/sim never sees a pack). */
const PARAMS = new Map<string, SimParams>();
const getParams = (s: Pick<GridState, 'region'>): SimParams => {
  let p = PARAMS.get(s.region);
  if (!p) { p = simParamsOf((REGIONS.get(s.region) as RegionPack<GridRegionData>).data); PARAMS.set(s.region, p); }
  return p;
};
const VIEWS = new Map<string, CatalogueView>();
const catalogueOf = (s: GridState): CatalogueView => {
  let v = VIEWS.get(s.region);
  if (!v) { v = catalogueViewOf((REGIONS.get(s.region) as RegionPack<GridRegionData>).data); VIEWS.set(s.region, v); }
  return v;
};

const BENCHES = new Map<string, BenchParams>();
const getBench = (s: Pick<GridState, 'region'>): BenchParams => {
  let p = BENCHES.get(s.region);
  if (!p) { p = benchParamsOf((REGIONS.get(s.region) as RegionPack<GridRegionData>).data); BENCHES.set(s.region, p); }
  return p;
};
const ROUTES = new Map<string, RouteParams>();
const getRoute = (s: Pick<GridState, 'region'>): RouteParams => {
  let p = ROUTES.get(s.region);
  if (!p) { p = routeParamsOf((REGIONS.get(s.region) as RegionPack<GridRegionData>).data); ROUTES.set(s.region, p); }
  return p;
};
const money = (s: GridState, amount: number): string => formatMoney(amount, REGIONS.get(s.region));

/** The systems pipeline, DESIGN §8.3 order (src/sim/tick.ts). */
const SYSTEMS = buildPipeline(getParams, getBench);

export const GAME: GameDef<GridState> = {
  id: GAME_ID,
  title: 'GRID',
  saveVersion: 1,
  modes: [...MODES],
  /** Game-wide rules version: part of every solution code's ruleset id. Bump when a rule change can change a level score. */
  rulesetVersion: 1,
  regions: REGIONS,
  /** Level scores for leaderboards: the verifier returns these after replaying a solution code. */
  metrics: (s) => ({ ticks: s.tick - s.levelStart, cost: s.metrics.cost, ensMWh: s.metrics.ensMWh }),
  newGame: (seed, mode, ctx) => {
    const pack = ctx.region as RegionPack<GridRegionData>;
    const base = baseState(GAME_ID, seed, mode, pack.id);
    const s: GridState = {
      ...base,
      mode: mode as GridState['mode'],
      clock: { day: 0, block: 0, phase: 'build', speed: 1 },
      map: { tileM: 100, w: 0, h: 0, tiles: '', latitudeDeg: pack.data.climate.latitudeDeg },
      buses: [], branches: [], units: [], loads: [], shunts: [], storage: [],
      protection: { relays: [], breakers: [], ufls: pack.data.gridcode.ufls.map((u) => ({ hz: u.hz, shedPct: u.shedPct, delayS: u.delayS, operated: false })) },
      weather: { tempC: 20, clouds: [], windMs: 0, stormActive: false, stormLeft: 0 },
      dispatch: { lambda: 0, waterValue: null, auto: true, schedule: null },
      solution: null,
      freq: { fHz: pack.data.f0, rocof: 0 },
      events: { queue: [], log: [] },
      replay: null,
      metrics: { cost: 0, capex: 0, opex: 0, ensMWh: 0, lossesMWh: 0, poorSupplyMin: 0, ovMin: 0, minMarginPct: 0, nadirHz: pack.data.f0, maxRocof: 0, tapOps: 0, switchOps: 0, co2t: 0, predictions: [], track: {} },
      budget: { capexLimit: 0, spent: 0 },
      history: { capacity: HISTORY_CAPACITY, entries: [] },
      rules: { ...NO_RULES },
      block: emptyBlock(),
      actionLog: [],
      coach: { stepId: null, hintsUsed: 0, seen: [] },
      codexUnlocked: [],
      stars: 0,
      bench: null,
      terrain: null,
      routes: [],
    };
    log(s, t('log.start', { region: regionString(pack, 'region'), f0: pack.data.f0, code: regionString(pack, 'gridcode') }));
    return s;
  },
  /** The player's actions, gated by the running level's allowed parts (free play is untouched). */
  actions: allowedGate({ ...buildActions({ cat: catalogueOf, getParams, money }), ...buildBenchActions({ getBench, money }), ...buildCh2Actions({ money }), ...buildRouteActions({ cat: catalogueOf, getRoute, money }), ...buildFreqActions({ cat: catalogueOf, money }), ...buildCh3Actions({ cat: catalogueOf, money }), ...buildCh4Actions({ money, specOf }), ...buildCh7Actions({ money, specOf }), ...buildCh5Actions() }, specOf),
  queries: {
    ...buildQueries({ getParams }),
    ...buildWorldQueries({ getBench, getRoute }),
    ...ch2Queries,
    ...buildCh4Queries({ getParams }),
    ...buildCh7Queries(),
    ...buildRouteQueries({ cat: catalogueOf, getRoute, money }),
    ...buildUiQueries({ specOf, getParams }),
    ...buildCh3Queries({ getParams }),
    ...buildCostQueries(() => GAME),   // actionCost: what a build would cost, run on a copy
    ...buildLevelQueries({ specOf, getParams, getBench, frozenOf: (spec, region) => (spec.frozen ? spec.frozen[region] ?? null : null) }),
  },
  systems: SYSTEMS,
  catalogues: () => ({ blocksPerDay: BLOCKS_PER_DAY, blockMinutes: 15, speeds: [...SPEEDS] }),
  levels: LEVELS,
  personas: PERSONAS,
  invariants: (s) => {
    const v: { rule: string; detail: string }[] = [];
    if (!Number.isInteger(s.clock.block) || s.clock.block < 0 || s.clock.block >= BLOCKS_PER_DAY) v.push({ rule: 'block outside 0..95', detail: String(s.clock.block) });
    if (!Number.isInteger(s.clock.day) || s.clock.day < 0) v.push({ rule: 'bad day', detail: String(s.clock.day) });
    if (s.tick !== s.clock.day * BLOCKS_PER_DAY + s.clock.block) v.push({ rule: 'tick must equal day x 96 + block', detail: `${s.tick} vs ${s.clock.day}/${s.clock.block}` });
    if (!(SPEEDS as readonly number[]).includes(s.clock.speed)) v.push({ rule: 'clock speed not allowed', detail: String(s.clock.speed) });
    const bad = findNonFinite(s);
    if (bad) v.push({ rule: 'non-finite number in the state', detail: bad });
    return v;
  },
  saveLabel: (s) => t('save.label', { region: REGIONS.get(s.region).strings.region ?? s.region, day: s.clock.day + 1, buses: s.buses.length }),
  describe: (s) => `Tick ${s.tick}: day ${s.clock.day}, block ${s.clock.block}, speed ${s.clock.speed}x, ${s.buses.length} buses, status ${s.status}.`,
  /** setSpeed always; with `full` the running level's whole site list too (what the cheese search and the searcher walk). */
  legalActions: (s, full) => [
    ...SPEEDS.map((x) => ({ name: 'setSpeed', args: [x] })),
    ...(full && s.level ? (LEVEL_SPECS.find((l) => l.id === s.level)?.sites.flatMap((x) => x.options.flatMap((o) => o.actions)) ?? []) : []),
  ],
};
