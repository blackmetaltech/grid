// The GRID game definition the core engine runs. One core `tick` = one 15-minute operator block (DESIGN §3.1, §8.3).
// Everything the Godot front-end shows comes from queries; every player command is an action returning {ok, message} with a
// teaching message. M0 ships an empty-but-real game: an empty grid, the clock system, a placeholder level.
import { baseState, log, type GameDef } from '@core/kit';
import { formatMoney, type RegionPack } from '@core/regions';
import { BLOCKS_PER_DAY, MODES, SPEEDS, type GridState } from './types';
import { LEVELS } from './levels';
import { PERSONAS } from './personas';
import { t } from './i18n';
import { REGIONS } from './regions';
import type { GridRegionData } from './regions/data';
import { buildPipeline, emptyBlock } from './sim/tick';
import { findNonFinite } from './sim/finite';
import type { SimParams } from './sim/params';
import { catalogueViewOf, simParamsOf } from './catalogue';
import { buildActions } from './actions';
import type { CatalogueView } from './sim/build';
import { buildQueries } from './queries';
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

/** The systems pipeline, DESIGN §8.3 order (src/sim/tick.ts). */
const SYSTEMS = buildPipeline(getParams);

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
      metrics: { cost: 0, capex: 0, opex: 0, ensMWh: 0, lossesMWh: 0, poorSupplyMin: 0, ovMin: 0, minMarginPct: 0, nadirHz: pack.data.f0, maxRocof: 0, tapOps: 0, switchOps: 0, co2t: 0, predictions: [] },
      budget: { capexLimit: 0, spent: 0 },
      history: { capacity: HISTORY_CAPACITY, entries: [] },
      rules: { ...NO_RULES },
      block: emptyBlock(),
      actionLog: [],
      coach: { stepId: null, hintsUsed: 0, seen: [] },
      codexUnlocked: [],
      stars: 0,
    };
    log(s, t('log.start', { region: regionString(pack, 'region'), f0: pack.data.f0, code: regionString(pack, 'gridcode') }));
    return s;
  },
  actions: buildActions({ cat: catalogueOf, getParams, money: (s, amount) => formatMoney(amount, REGIONS.get(s.region)) }),
  queries: buildQueries({ getParams }),
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
  legalActions: () => SPEEDS.map((x) => ({ name: 'setSpeed', args: [x] })),
};
